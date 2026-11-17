#!/usr/bin/env python3
"""Build an autonomous binary parameter index for Flowmusic Genesis V3."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parameter_registry import excluded_names, registry_sha256  # noqa: E402
from published_parameter_schema import clean_published_parameter  # noqa: E402
from v3_snapshot import load_v3_snapshot  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"
DEFAULT_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b")
DEFAULT_ENDPOINT = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
RETRIEVAL_SCOPES = {"sound", "structure", "metadata", "provenance", "administrative"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def classify_retrieval_scope(parameter: dict[str, Any]) -> str:
    existing = str(parameter.get("retrieval_scope") or "").lower()
    if existing in RETRIEVAL_SCOPES:
        return existing
    name = str(parameter.get("technical_name") or "").lower()
    text = " ".join((
        name.replace("_", " "), str(parameter.get("category") or ""),
        str(parameter.get("sub_category") or ""), str(parameter.get("description_en") or ""),
    )).lower()
    if name.startswith("provenance_") or "ownership_proof" in name or "_hash" in name:
        return "provenance"
    if any(term in name for term in ("smart_contract", "gas_limit", "licensing", "contract_address")):
        return "administrative"
    if name.startswith(("interoperable_asset_", "descriptive_metadata_", "classification_", "semantic_concept_")):
        return "metadata"
    structure_terms = (
        "arrangement", "timeline", "song_section", "section_transition", "composition_structure",
        "sequencer", "sequence_length", "step_pattern", "pattern_length", "arpeggiator",
        "tempo", "rhythmic_pattern", "rhythm_grid", "meter", "time_signature",
    )
    if any(term.replace("_", " ") in text for term in structure_terms):
        return "structure"
    return "sound"


def retrieval_text(parameter: dict[str, Any]) -> str:
    parts = [
        parameter.get("technical_name", ""), parameter.get("category", ""),
        parameter.get("sub_category", ""), parameter.get("domain", ""),
        parameter.get("description_en", ""), parameter.get("description_ru", ""),
        parameter.get("quantity_kind", ""), parameter.get("domain_layer", ""),
        *(parameter.get("semantic_keywords") or []),
        *(parameter.get("lyria_prompt_tags") or []),
    ]
    return " | ".join(str(part) for part in parts if part)


def semantic_text(parameter: dict[str, Any]) -> str:
    name = str(parameter.get("technical_name", ""))
    parts = [
        name.replace("_", " "), str(parameter.get("name_ru", "")),
        str(parameter.get("description_en", "")), str(parameter.get("description_ru", "")),
        f"category {parameter.get('category', '')}", f"subcategory {parameter.get('sub_category', '')}",
        f"domain layer {parameter.get('domain_layer', '')}",
        "tags " + ", ".join(map(str, parameter.get("lyria_prompt_tags", []))),
        "keywords " + ", ".join(map(str, parameter.get("semantic_keywords", []))),
        f"unit {parameter.get('unit', '')}",
    ]
    return ". ".join(part.strip() for part in parts if part.strip())


def normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(float(value) ** 2 for value in vector))
    if not norm:
        raise ValueError("Embedding norm is zero")
    return [float(value) / norm for value in vector]


def read_vectors(path: Path) -> list[list[float]]:
    with path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
        return [list(struct.unpack(f"<{dimensions}f", handle.read(dimensions * 4))) for _ in range(count)]


def embed_batch(endpoint: str, model: str, texts: list[str]) -> list[list[float]]:
    request = urllib.request.Request(
        f"{endpoint}/api/embed",
        data=json.dumps({"model": model, "input": texts}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        vectors = json.load(response).get("embeddings")
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise RuntimeError("Ollama returned an unexpected embedding count")
    return [normalize(vector) for vector in vectors]


def cached_vectors(model: str, index_dir: Path, allow_semantic_cache: bool = True, reuse_index_dirs: list[Path] | None = None) -> dict[str, tuple[list[float], str, str, str]]:
    result: dict[str, tuple[list[float], str, str, str]] = {}
    for source_dir in [index_dir, *(reuse_index_dirs or [])]:
        manifest_path = source_dir / "manifest.json"
        rows_path = source_dir / "rows.json"
        vectors_path = source_dir / "embeddings.f32"
        if not (manifest_path.exists() and rows_path.exists() and vectors_path.exists()):
            continue
        manifest = read_json(manifest_path)
        if manifest.get("model") != model:
            continue
        rows, vectors = read_json(rows_path), read_vectors(vectors_path)
        dimensions = int(manifest.get("dimensions", 0) or 0)
        if not isinstance(rows, list) or len(rows) != len(vectors) or not dimensions or any(len(vector) != dimensions for vector in vectors):
            raise RuntimeError(f"Saved composite cache is misaligned or has incompatible dimensions: {source_dir}")
        for row, vector in zip(rows, vectors):
            name = row.get("technical_name")
            if name:
                previous_origin = str(row.get("vector_origin") or "v3_persistent_cache")
                origin = "v3_persistent_cache" if previous_origin == "v2_snapshot_bootstrap" else previous_origin
                kind = "semantic" if origin == "flowmusic_semantic_cache" else "retrieval"
                result.setdefault(str(name), (
                    normalize(vector), origin,
                    kind, str(row.get("embedding_text_sha256") or ""),
                ))

    output = DATA_ROOT / "flowmusic-output"
    meta_path = output / "semantic_embeddings_meta.json"
    eligible_path = output / "eligible_parameters.json"
    vectors_path = output / "semantic_embeddings.f32"
    if allow_semantic_cache and meta_path.exists() and eligible_path.exists() and vectors_path.exists():
        meta = read_json(meta_path)
        if meta.get("model") == model:
            parameters, vectors = read_json(eligible_path), read_vectors(vectors_path)
            for parameter, vector in zip(parameters, vectors):
                text = semantic_text(parameter)
                result[str(parameter["technical_name"])] = (
                    normalize(vector), "flowmusic_semantic_cache", "semantic", sha256_text(text)
                )
    return result


def catalogue_deleted_names() -> set[str]:
    """Keep catalogue physical deletions excluded from the published retrieval set."""
    tombstones = DATA_ROOT / "library" / "catalogue-deleted.json"
    if not tombstones.exists():
        return set()
    value = read_json(tombstones)
    if isinstance(value, list):
        return {str(name) for name in value if isinstance(name, str) and name}
    if isinstance(value, dict) and isinstance(value.get("technical_names"), list):
        return {str(name) for name in value["technical_names"] if isinstance(name, str) and name}
    raise ValueError(f"Invalid catalogue tombstone file: {tombstones}")


def build(
    model: str,
    endpoint: str,
    batch_size: int,
    output_dir: Path | None = None,
    retrieval_text_only: bool = False,
    parameter_snapshot: Path | None = None,
    source_revision: str | None = None,
    source_snapshot_sha256: str | None = None,
    pinned_excluded_sha256: str | None = None,
    pinned_excluded_count: int = 0,
    prepare_only: bool = False,
    embedder: Any = None,
    reuse_index_dirs: list[Path] | None = None,
    prepared_rows: Path | None = None,
    operation_identity_sha256: str | None = None,
    value_selection_bundle_id: str | None = None,
) -> tuple[dict[str, Any], bool]:
    index_dir = (output_dir or DATA_ROOT / "v3" / "composite-index").resolve()
    qwen_index_dir = (DATA_ROOT / "v3" / "composite-index").resolve()
    if not model.startswith("qwen3-embedding:") and index_dir == qwen_index_dir:
        raise ValueError("A non-Qwen model cannot write to the Qwen composite index directory")
    snapshot = load_v3_snapshot(DATA_ROOT, snapshot_path=parameter_snapshot, source_revision=source_revision,
        source_snapshot_sha256=source_snapshot_sha256, excluded_sha256=pinned_excluded_sha256,
        excluded_count=pinned_excluded_count) if parameter_snapshot else load_v3_snapshot(DATA_ROOT)
    library = snapshot["parameters"]
    records: dict[str, tuple[dict[str, Any], str]] = {
        str(item["technical_name"]): ({**item, "retrieval_scope": classify_retrieval_scope(item)}, "library") for item in library
    }
    latest = {"version_id": snapshot["dataset_version"]}
    deleted_names: set[str] = set()
    records = {name: value for name, value in records.items() if name not in deleted_names}
    records = {
        name: (
            {**clean_published_parameter(item), "retrieval_scope": classify_retrieval_scope(item)},
            source,
        )
        for name, (item, source) in records.items()
    }
    if index_dir == qwen_index_dir:
        write_json(DATA_ROOT / "v3" / "dataset.json", [item for item, _source in records.values()])
    excluded: set[str] = set()
    records = {name: value for name, value in records.items() if name not in excluded}

    cache = cached_vectors(model, index_dir, allow_semantic_cache=not retrieval_text_only, reuse_index_dirs=reuse_index_dirs)
    planned: list[dict[str, Any]] = []
    reusable_names: set[str] = set()
    for name, (parameter, source) in sorted(records.items()):
        vector_info = cache.get(name)
        text_kind = "retrieval" if retrieval_text_only else vector_info[2] if vector_info else "retrieval"
        text = semantic_text(parameter) if text_kind == "semantic" else retrieval_text(parameter)
        if vector_info and vector_info[3] != sha256_text(text):
            vector_info = None
        if vector_info:
            reusable_names.add(name)
        planned.append({
            "technical_name": name, "source": source, "generated": parameter.get("domain") == "experimental_combinatorial_genesis",
            "retrieval_scope": parameter["retrieval_scope"],
            "embedding_text": text, "embedding_text_sha256": sha256_text(text),
            "vector_origin": vector_info[1] if vector_info else "ollama",
        })
    cache_hash = sha256_text(json.dumps({
        "model": model,
        "endpoint": endpoint.rstrip("/"),
        "operation_identity_sha256": operation_identity_sha256,
        "value_selection_bundle_id": value_selection_bundle_id,
        "embedding_preprocessing_version": "genesis-v3-retrieval-text-v2" if retrieval_text_only else "genesis-v3-semantic-cache-v2",
        "dataset_version": latest["version_id"],
        "source_snapshot_sha256": snapshot["content_sha256"],
        "source_revision": snapshot["source_revision"],
        "excluded_sha256": snapshot["excluded_sha256"],
        "rows": planned,
    }, ensure_ascii=False, sort_keys=True))
    manifest_path = index_dir / "manifest.json"
    rows_path = index_dir / "rows.json"
    vectors_path = index_dir / "embeddings.f32"
    progress_path = index_dir / "vectorization-progress.json"
    prepared_manifest_path = index_dir / "prepare-manifest.json"
    index_dir.mkdir(parents=True, exist_ok=True)
    planned_bytes = (json.dumps(planned, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    planned_rows_sha256 = hashlib.sha256(planned_bytes).hexdigest()
    if prepared_rows is not None:
        saved_planned = read_json(prepared_rows)
        if saved_planned != planned:
            raise RuntimeError("Prepared composite rows do not match the pinned source/model text policy.")
        planned = saved_planned
        planned_bytes = prepared_rows.read_bytes()
        planned_rows_sha256 = hashlib.sha256(planned_bytes).hexdigest()
    if rows_path.exists():
        saved_rows = read_json(rows_path)
        if saved_rows != planned:
            raise RuntimeError("Saved candidate composite rows differ from the pinned snapshot; refusing to replace them.")
    else:
        rows_path.write_bytes(planned_bytes)
    if prepare_only:
        plan = {
            "schema_version": 1, "status": "prepared", "model": model,
            "source_revision": snapshot["source_revision"], "source_snapshot_sha256": snapshot["content_sha256"],
            "excluded_sha256": snapshot["excluded_sha256"], "source_parameter_count": len(planned),
            "cache_sha256": cache_hash, "rows_sha256": planned_rows_sha256,
            "rows_file": "rows.json", "vectors_file": "embeddings.f32",
        }
        write_json_atomic(prepared_manifest_path, plan)
        return plan, True
    if manifest_path.exists():
        current = read_json(manifest_path)
        if current.get("cache_sha256") == cache_hash and current.get("model") == model and current.get("endpoint") == endpoint.rstrip("/"):
            return current, False

    progress = read_json(progress_path) if progress_path.exists() else None
    if progress and (progress.get("cache_sha256") != cache_hash or progress.get("rows_sha256") != planned_rows_sha256
                     or progress.get("model") != model or progress.get("endpoint") != endpoint.rstrip("/")
                     or (operation_identity_sha256 and progress.get("operation_identity_sha256") != operation_identity_sha256)):
        raise RuntimeError("Saved composite vector checkpoint does not match this candidate plan/model/endpoint.")
    completed = int(progress.get("completed_count", 0)) if progress else 0
    dimensions = int(progress.get("dimensions", 0)) if progress else 0
    if vectors_path.exists():
        if not progress:
            raise RuntimeError("Candidate composite vectors exist without a matching manifest or progress receipt.")
        expected_length = 8 + completed * dimensions * 4
        actual_length = vectors_path.stat().st_size
        if (completed > 0 and not dimensions) or actual_length < expected_length:
            raise RuntimeError("Candidate composite vector file is shorter than its durable checkpoint.")
        with vectors_path.open("r+b") as handle:
            handle.truncate(expected_length)
            handle.seek(0)
            stored_count, stored_dimensions = struct.unpack("<II", handle.read(8))
            if stored_count != completed or stored_dimensions != dimensions:
                handle.seek(0)
                handle.write(struct.pack("<II", completed, dimensions))
                handle.flush()
                os.fsync(handle.fileno())
    else:
        if completed:
            raise RuntimeError("Candidate composite progress receipt has no vector data file.")
        index_dir.mkdir(parents=True, exist_ok=True)
        with vectors_path.open("wb") as handle:
            handle.write(struct.pack("<II", 0, 0))
            handle.flush()
            os.fsync(handle.fileno())
        progress = {
            "schema_version": 1, "status": "vectorizing", "model": model, "endpoint": endpoint.rstrip("/"),
            "cache_sha256": cache_hash, "rows_sha256": planned_rows_sha256,
            "operation_identity_sha256": operation_identity_sha256,
            "completed_count": 0, "dimensions": 0,
        }
        write_json_atomic(progress_path, progress)

    embed = embedder or embed_batch
    while completed < len(planned):
        end = min(completed + batch_size, len(planned))
        chunk = planned[completed:end]
        vectors_by_offset: dict[int, list[float]] = {}
        missing: list[tuple[int, dict[str, Any]]] = []
        for offset, row in enumerate(chunk):
            cached = cache.get(row["technical_name"])
            if cached and cached[3] == row["embedding_text_sha256"]:
                vectors_by_offset[offset] = cached[0]
            else:
                missing.append((offset, row))
        if missing:
            fresh_vectors = embed(endpoint, model, [row["embedding_text"] for _offset, row in missing])
            if len(fresh_vectors) != len(missing):
                raise RuntimeError("Embedding provider returned a different number of vectors than requested.")
            for (offset, _row), vector in zip(missing, fresh_vectors):
                vectors_by_offset[offset] = normalize(vector)
        ordered_chunk = [vectors_by_offset[offset] for offset in range(len(chunk))]
        chunk_dimensions = len(ordered_chunk[0]) if ordered_chunk else dimensions
        if not chunk_dimensions or any(len(vector) != chunk_dimensions for vector in ordered_chunk):
            raise RuntimeError("Embedding provider returned inconsistent vector dimensions.")
        if dimensions and dimensions != chunk_dimensions:
            raise RuntimeError("Embedding provider dimension changed while resuming candidate composite vectors.")
        dimensions = chunk_dimensions
        with vectors_path.open("r+b") as handle:
            handle.seek(0, os.SEEK_END)
            for vector in ordered_chunk:
                handle.write(struct.pack(f"<{dimensions}f", *vector))
            handle.flush()
            os.fsync(handle.fileno())
            completed = end
            handle.seek(0)
            handle.write(struct.pack("<II", completed, dimensions))
            handle.flush()
            os.fsync(handle.fileno())
        progress = {
            "schema_version": 1, "status": "vectorizing", "model": model, "endpoint": endpoint.rstrip("/"),
            "cache_sha256": cache_hash, "rows_sha256": planned_rows_sha256,
            "operation_identity_sha256": operation_identity_sha256,
            "completed_count": completed, "dimensions": dimensions,
        }
        write_json_atomic(progress_path, progress)
        print(f"[progress] stage=v3_index current={completed} total={len(planned)} label=embedding", flush=True)

    progress["status"] = "vectorization_complete"
    expected_length = 8 + len(planned) * dimensions * 4
    if completed != len(planned) or not dimensions or vectors_path.stat().st_size != expected_length:
        raise RuntimeError("Candidate composite vectors are incomplete; refusing to finalize the manifest.")
    with vectors_path.open("rb") as handle:
        stored_count, stored_dimensions = struct.unpack("<II", handle.read(8))
    if stored_count != len(planned) or stored_dimensions != dimensions:
        raise RuntimeError("Candidate composite vector header does not match its rows/checkpoint.")
    write_json(index_dir / "rows.json", planned)
    origins: dict[str, int] = {}
    for row in planned:
        origins[row["vector_origin"]] = origins.get(row["vector_origin"], 0) + 1
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": cache_hash, "model": model, "dimensions": dimensions,
        "endpoint": endpoint.rstrip("/"), "operation_identity_sha256": operation_identity_sha256,
        "value_selection_bundle_id": value_selection_bundle_id,
        "embedding_preprocessing_version": "genesis-v3-retrieval-text-v2" if retrieval_text_only else "genesis-v3-semantic-cache-v2",
        "value_selection_contract_version": 2,
        "parameter_count": len(planned),
        "dataset_version": latest["version_id"], "vector_origins": origins,
        "source_snapshot_sha256": snapshot["content_sha256"],
        "source_revision": snapshot["source_revision"],
        "excluded_count": snapshot["excluded_count"], "excluded_sha256": snapshot["excluded_sha256"],
        "text_policy": "retrieval" if retrieval_text_only else "semantic-cache-when-available",
        "source_parameter_count": len(planned),
        "files": {"rows": "rows.json", "embeddings": "embeddings.f32"},
    }
    write_json(manifest_path, manifest)
    progress_path.unlink(missing_ok=True)
    return manifest, True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--output-dir", type=Path, help="Optional isolated output directory; defaults to the Qwen composite index")
    parser.add_argument("--prepared-rows", type=Path, help="Use rows created and verified by model-free Prepare")
    parser.add_argument("--operation-identity-sha256", help="Candidate operation identity used to reject incompatible checkpoints")
    parser.add_argument("--value-selection-bundle-id", help="Immutable candidate bundle identity shared with value-candidate artifacts")
    parser.add_argument("--parameter-snapshot", type=Path, help="Use an immutable effective-catalogue JSON snapshot; never read latest/live membership")
    parser.add_argument("--source-revision", help="Revision recorded when --parameter-snapshot was captured")
    parser.add_argument("--source-snapshot-sha256", help="Current catalogue content fingerprint captured with the snapshot")
    parser.add_argument("--excluded-sha256", help="Exclusion registry hash captured with the snapshot")
    parser.add_argument("--excluded-count", type=int, default=0, help="Exclusion count captured with the snapshot")
    parser.add_argument("--retrieval-text-only", action="store_true", help="Use the same retrieval text policy as the Qwen V3 composite index")
    parser.add_argument("--prepare-only", action="store_true", help="Write the pinned model-free composite rows/plan without embedding")
    parser.add_argument("--reuse-index-dir", action="append", type=Path, default=[], help="Read compatible saved vectors from an additional index directory without copying them")
    args = parser.parse_args()
    manifest, created = build(args.model, args.endpoint, max(1, args.batch_size), args.output_dir, args.retrieval_text_only,
        args.parameter_snapshot, args.source_revision, args.source_snapshot_sha256, args.excluded_sha256, args.excluded_count,
        prepare_only=args.prepare_only, reuse_index_dirs=args.reuse_index_dir,
        prepared_rows=args.prepared_rows, operation_identity_sha256=args.operation_identity_sha256,
        value_selection_bundle_id=args.value_selection_bundle_id)
    print(json.dumps({"created": created, **manifest}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
