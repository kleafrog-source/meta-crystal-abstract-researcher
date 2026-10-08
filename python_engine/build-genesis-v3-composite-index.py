#!/usr/bin/env python3
"""Build an autonomous binary parameter index for Flowmusic Genesis V3."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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
        parameter.get("quantity_kind", ""), *(parameter.get("semantic_keywords") or []),
        *(parameter.get("lyria_prompt_tags") or []),
    ]
    return " | ".join(str(part) for part in parts if part)


def semantic_text(parameter: dict[str, Any]) -> str:
    name = str(parameter.get("technical_name", ""))
    parts = [
        name.replace("_", " "), str(parameter.get("name_ru", "")),
        str(parameter.get("description_en", "")), str(parameter.get("description_ru", "")),
        f"category {parameter.get('category', '')}", f"subcategory {parameter.get('sub_category', '')}",
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


def cached_vectors(model: str) -> dict[str, tuple[list[float], str, str, str]]:
    result: dict[str, tuple[list[float], str, str, str]] = {}
    index_dir = DATA_ROOT / "v3" / "composite-index"
    manifest_path = index_dir / "manifest.json"
    rows_path = index_dir / "rows.json"
    vectors_path = index_dir / "embeddings.f32"
    if manifest_path.exists() and rows_path.exists() and vectors_path.exists():
        manifest = read_json(manifest_path)
        if manifest.get("model") == model:
            rows, vectors = read_json(rows_path), read_vectors(vectors_path)
            for row, vector in zip(rows, vectors):
                name = row.get("technical_name")
                if name:
                    previous_origin = str(row.get("vector_origin") or "v3_persistent_cache")
                    origin = "v3_persistent_cache" if previous_origin == "v2_snapshot_bootstrap" else previous_origin
                    kind = "semantic" if origin == "flowmusic_semantic_cache" else "retrieval"
                    result[str(name)] = (
                        normalize(vector), origin,
                        kind, str(row.get("embedding_text_sha256") or ""),
                    )

    output = DATA_ROOT / "flowmusic-output"
    meta_path = output / "semantic_embeddings_meta.json"
    eligible_path = output / "eligible_parameters.json"
    vectors_path = output / "semantic_embeddings.f32"
    if meta_path.exists() and eligible_path.exists() and vectors_path.exists():
        meta = read_json(meta_path)
        if meta.get("model") == model:
            parameters, vectors = read_json(eligible_path), read_vectors(vectors_path)
            for parameter, vector in zip(parameters, vectors):
                text = semantic_text(parameter)
                result[str(parameter["technical_name"])] = (
                    normalize(vector), "flowmusic_semantic_cache", "semantic", sha256_text(text)
                )
    return result


def build(model: str, endpoint: str, batch_size: int) -> tuple[dict[str, Any], bool]:
    library = read_json(DATA_ROOT / "library" / "parameters.json")
    latest = read_json(DATA_ROOT / "datasets" / "latest.json")
    frozen = read_json(DATA_ROOT / "datasets" / latest["version_id"] / "parameters.json")
    records: dict[str, tuple[dict[str, Any], str]] = {
        str(item["technical_name"]): ({**item, "retrieval_scope": classify_retrieval_scope(item)}, "library") for item in library
    }
    for item in frozen:
        records.setdefault(str(item["technical_name"]), ({**item, "retrieval_scope": classify_retrieval_scope(item)}, "frozen"))
    write_json(DATA_ROOT / "v3" / "dataset.json", [item for item, _source in records.values()])

    cache = cached_vectors(model)
    planned: list[dict[str, Any]] = []
    reusable_names: set[str] = set()
    for name, (parameter, source) in sorted(records.items()):
        vector_info = cache.get(name)
        text_kind = vector_info[2] if vector_info else "retrieval"
        text = semantic_text(parameter) if text_kind == "semantic" else retrieval_text(parameter)
        if vector_info and vector_info[3] != sha256_text(text):
            vector_info = None
            text = retrieval_text(parameter)
        if vector_info:
            reusable_names.add(name)
        planned.append({
            "technical_name": name, "source": source, "generated": parameter.get("domain") == "experimental_combinatorial_genesis",
            "retrieval_scope": parameter["retrieval_scope"],
            "embedding_text": text, "embedding_text_sha256": sha256_text(text),
            "vector_origin": vector_info[1] if vector_info else "ollama",
        })
    cache_hash = sha256_text(json.dumps({"model": model, "rows": planned}, ensure_ascii=False, sort_keys=True))
    index_dir = DATA_ROOT / "v3" / "composite-index"
    manifest_path = index_dir / "manifest.json"
    if manifest_path.exists():
        current = read_json(manifest_path)
        if current.get("cache_sha256") == cache_hash:
            return current, False

    vectors_by_name = {name: cache[name][0] for name in reusable_names}
    missing = [row for row in planned if row["technical_name"] not in vectors_by_name]
    for start in range(0, len(missing), batch_size):
        chunk = missing[start:start + batch_size]
        vectors = embed_batch(endpoint, model, [row["embedding_text"] for row in chunk])
        for row, vector in zip(chunk, vectors):
            vectors_by_name[row["technical_name"]] = vector
        print(f"[progress] stage=v3_index current={min(start + len(chunk), len(missing))} total={len(missing)} label=embedding", flush=True)

    ordered_vectors = [vectors_by_name[row["technical_name"]] for row in planned]
    dimensions = len(ordered_vectors[0]) if ordered_vectors else 0
    index_dir.mkdir(parents=True, exist_ok=True)
    with (index_dir / "embeddings.f32").open("wb") as handle:
        handle.write(struct.pack("<II", len(ordered_vectors), dimensions))
        for vector in ordered_vectors:
            handle.write(struct.pack(f"<{dimensions}f", *vector))
    write_json(index_dir / "rows.json", planned)
    origins: dict[str, int] = {}
    for row in planned:
        origins[row["vector_origin"]] = origins.get(row["vector_origin"], 0) + 1
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": cache_hash, "model": model, "dimensions": dimensions,
        "parameter_count": len(planned), "library_count": len(library), "frozen_count": len(frozen),
        "dataset_version": latest["version_id"], "vector_origins": origins,
        "files": {"rows": "rows.json", "embeddings": "embeddings.f32"},
    }
    write_json(manifest_path, manifest)
    return manifest, True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()
    manifest, created = build(args.model, args.endpoint, max(1, args.batch_size))
    print(json.dumps({"created": created, **manifest}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
