#!/usr/bin/env python3
"""Build a local qwen3-embedding:0.6b atom index for the latest frozen Combinatorial Genesis dataset."""

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
from typing import Any, Callable, Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parameter_registry import excluded_names, registry_sha256  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"
DEFAULT_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b")
DEFAULT_ENDPOINT = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
FROZEN_DONOR_FALLBACK_ENABLED = False


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_json_atomic(path: Path, payload: Any) -> None:
    temporary = path.with_name(f"{path.name}.tmp")
    write_json(temporary, payload)
    os.replace(temporary, path)


def atom_embedding_text(atom: dict[str, Any]) -> str:
    return str(atom.get("atom", "")).replace("_", " ").strip()


def normalize(vector: Iterable[float]) -> list[float]:
    values = [float(value) for value in vector]
    norm = math.sqrt(sum(value * value for value in values))
    if not norm:
        raise ValueError("Embedding norm is zero")
    return [value / norm for value in values]


def embed_batch(endpoint: str, model: str, texts: list[str]) -> list[list[float]]:
    request = urllib.request.Request(
        f"{endpoint}/api/embed",
        data=json.dumps({"model": model, "input": texts}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)
    vectors = payload.get("embeddings")
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise RuntimeError("Ollama /api/embed returned an unexpected embedding count")
    return vectors


def write_vectors(path: Path, vectors: list[list[float]]) -> int:
    dimensions = len(vectors[0]) if vectors else 0
    with path.open("wb") as handle:
        handle.write(struct.pack("<II", len(vectors), dimensions))
        for vector in vectors:
            if len(vector) != dimensions:
                raise ValueError("Embedding dimensions are inconsistent")
            handle.write(struct.pack(f"<{dimensions}f", *vector))
    return dimensions


def read_vectors(path: Path) -> list[list[float]]:
    with path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
        return [list(struct.unpack(f"<{dimensions}f", handle.read(dimensions * 4))) for _ in range(count)]


def read_parameter_names(path: Path) -> set[str]:
    if not path.exists():
        return set()
    parameters = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parameters, list):
        raise ValueError(f"Expected a parameter array in {path}")
    return {str(item["technical_name"]) for item in parameters if isinstance(item, dict) and item.get("technical_name")}


def resolve_source_parameters(
    names: list[str], live_names: set[str], frozen_names: set[str],
    tombstones: set[str], excluded: set[str],
) -> tuple[list[str], list[dict[str, str]]]:
    """Keep current live identities and preserve archived/unresolved reasons for diagnostics."""
    accepted: list[str] = []
    diagnostics: list[dict[str, str]] = []
    seen: set[str] = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        if name in tombstones:
            diagnostics.append({"technical_name": name, "reason": "tombstoned"})
        elif name in excluded:
            diagnostics.append({"technical_name": name, "reason": "excluded"})
        elif name in live_names:
            accepted.append(name)
        elif name in frozen_names:
            diagnostics.append({"technical_name": name, "reason": "archived_source_disabled"})
        else:
            diagnostics.append({"technical_name": name, "reason": "unresolved"})
    return accepted, diagnostics


def build_runtime_index(
    data_root: Path,
    model: str,
    endpoint: str,
    batch_size: int,
    embedder: Callable[[str, str, list[str]], list[list[float]]] = embed_batch,
    output_dir: Path | None = None,
    version_id_override: str | None = None,
    version_dir_override: Path | None = None,
    rows_only: bool = False,
    effective_snapshot: Path | None = None,
    source_revision: str | None = None,
    source_snapshot_sha256: str | None = None,
    snapshot_excluded_sha256: str | None = None,
    vectorize_only: bool = False,
    finalize_only: bool = False,
    adopt_existing_complete_vectors: bool = False,
    prepare_only: bool = False,
    prepared_rows: Path | None = None,
    operation_identity_sha256: str | None = None,
) -> tuple[Path, dict[str, Any], bool]:
    if effective_snapshot is not None and not version_id_override:
        raise ValueError("An explicit immutable dataset version is required with an effective snapshot")
    latest = {} if version_id_override else json.loads((data_root / "datasets" / "latest.json").read_text(encoding="utf-8"))
    version_id = version_id_override or str(latest["version_id"])
    version_dir = version_dir_override.resolve() if version_dir_override else data_root / "datasets" / version_id
    manifest = json.loads((version_dir / "manifest.json").read_text(encoding="utf-8"))
    atoms = json.loads((version_dir / "atoms.json").read_text(encoding="utf-8"))
    excluded = set() if effective_snapshot else excluded_names(data_root)
    tombstones_path = data_root / "library" / "catalogue-deleted.json"
    if effective_snapshot:
        deleted_names: set[str] = set()
    elif tombstones_path.exists():
        stored_tombstones = json.loads(tombstones_path.read_text(encoding="utf-8"))
        deleted_names = set(stored_tombstones if isinstance(stored_tombstones, list) else stored_tombstones.get("technical_names", []))
    else:
        deleted_names = set()
    if effective_snapshot:
        snapshot_payload = json.loads(effective_snapshot.read_text(encoding="utf-8"))
        if not isinstance(snapshot_payload, list):
            raise ValueError(f"Invalid effective catalogue snapshot: {effective_snapshot}")
        live_names = {str(item.get("technical_name")) for item in snapshot_payload if isinstance(item, dict) and item.get("technical_name")}
        effective_catalogue_revision = source_revision or hashlib.sha256(effective_snapshot.read_bytes()).hexdigest()
        excluded_sha256 = snapshot_excluded_sha256 or hashlib.sha256(b"[]").hexdigest()
        effective_snapshot_sha256 = source_snapshot_sha256 or hashlib.sha256(effective_snapshot.read_bytes()).hexdigest()
        live_library_sha256 = None
        tombstones_sha256 = None
    else:
        live_names = read_parameter_names(data_root / "library" / "parameters.json")
        library_raw = (data_root / "library" / "parameters.json").read_bytes()
        tombstones_raw = tombstones_path.read_bytes() if tombstones_path.exists() else b"[]"
        live_library_sha256 = hashlib.sha256(library_raw).hexdigest()
        tombstones_sha256 = hashlib.sha256(tombstones_raw).hexdigest()
        excluded_sha256 = registry_sha256(data_root)
        effective_snapshot_sha256 = None
        effective_catalogue_revision = hashlib.sha256(
            f"{live_library_sha256}\0{tombstones_sha256}\0{excluded_sha256}".encode("utf-8")
        ).hexdigest()
    frozen_names = read_parameter_names(version_dir / "parameters.json")
    source_diagnostic_counts: dict[str, int] = {}
    source_diagnostics_by_atom: list[dict[str, Any]] = []
    truncated_source_count = 0
    filtered_atoms = []
    for atom in atoms:
        sources, source_diagnostics = resolve_source_parameters(
            list(atom.get("source_parameters", [])), live_names, frozen_names,
            deleted_names, excluded,
        )
        sources.sort()
        for item in source_diagnostics:
            reason = item["reason"]
            source_diagnostic_counts[reason] = source_diagnostic_counts.get(reason, 0) + 1
        source_diagnostics_by_atom.append({"atom": atom.get("atom"), "diagnostics": source_diagnostics})
        truncated_source_count += max(0, len(sources) - 24)
        if atom.get("source_parameters") and not sources:
            continue
        filtered_atoms.append({
            **atom,
            "source_parameters": sources[:24],
            "source_reference_diagnostics": source_diagnostics,
        })
    atoms = filtered_atoms
    texts = [atom_embedding_text(atom) for atom in atoms]
    cache_hash = hashlib.sha256(
        json.dumps(
            {
                "version_id": version_id,
                "model": model,
                "endpoint": endpoint.rstrip("/"),
                "operation_identity_sha256": operation_identity_sha256,
                "texts": texts,
                "excluded_sha256": excluded_sha256,
                "deleted_names": sorted(deleted_names),
                "live_names": sorted(live_names),
                "frozen_names": sorted(frozen_names),
                "frozen_donor_fallback_enabled": FROZEN_DONOR_FALLBACK_ENABLED,
                "source_parameters": [atom.get("source_parameters", []) for atom in atoms],
                "source_reference_diagnostics": [atom.get("source_reference_diagnostics", []) for atom in atoms],
                "source_diagnostics_by_atom": source_diagnostics_by_atom,
                "source_diagnostic_counts": source_diagnostic_counts,
                "truncated_source_reference_count": truncated_source_count,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    vector_alignment = {
        "row_file": "atoms.json",
        "vector_file": "atom_embeddings.f32",
        "order": "identical array index",
        "identity_key": "atom",
        "text_check": "embedding_text must equal atom_embedding_text(row)",
        "vector_dimensions": "one fixed-width vector per row",
    }
    index_dir = output_dir.resolve() if output_dir else data_root / "indexes" / version_id
    index_manifest_path = index_dir / "manifest.json"
    if index_manifest_path.exists():
        index_manifest = json.loads(index_manifest_path.read_text(encoding="utf-8"))
        rows_file = index_dir / str(index_manifest.get("files", {}).get("rows", "atoms.json"))
        vectors_file = index_dir / str(index_manifest.get("files", {}).get("embeddings", "atom_embeddings.f32"))
        integrity_matches = (
            rows_file.is_file() and vectors_file.is_file()
            and index_manifest.get("rows_sha256") == hashlib.sha256(rows_file.read_bytes()).hexdigest()
            and index_manifest.get("vectors_sha256") == hashlib.sha256(vectors_file.read_bytes()).hexdigest()
        )
        if (index_manifest.get("cache_sha256") == cache_hash and integrity_matches
                and index_manifest.get("effective_catalogue_revision") == effective_catalogue_revision
                and index_manifest.get("vector_alignment") == vector_alignment):
            return index_dir, index_manifest, False

    rows_path = index_dir / "atoms.json"
    vectors_path = index_dir / "atom_embeddings.f32"
    rows = [
        {
            "atom": atom.get("atom"),
            "role": atom.get("role"),
            "parameter_frequency": atom.get("parameter_frequency", 0),
            "occurrence_weight": atom.get("occurrence_weight", 0),
            "source_parameters": list(atom.get("source_parameters", [])),
            "source_reference_diagnostics": list(atom.get("source_reference_diagnostics", [])),
            "embedding_text": text,
        }
        for atom, text in zip(atoms, texts)
    ]
    expected_rows = (json.dumps(rows, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if prepared_rows is not None:
        saved_rows = json.loads(prepared_rows.read_text(encoding="utf-8"))
        if saved_rows != rows:
            raise RuntimeError("Prepared runtime atom rows do not match the pinned frozen/live source resolution.")
        rows = saved_rows
        expected_rows = prepared_rows.read_bytes()
    expected_rows_sha256 = hashlib.sha256(expected_rows).hexdigest()
    if prepare_only:
        index_dir.mkdir(parents=True, exist_ok=True)
        if rows_path.exists():
            try:
                if json.loads(rows_path.read_text(encoding="utf-8")) != rows:
                    raise RuntimeError("Saved prepared atom rows differ from this pinned snapshot; refusing to replace them.")
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError("Saved prepared atom rows are unreadable; refusing to replace them.") from error
        else:
            rows_path.write_bytes(expected_rows)
        prepare_manifest = {
            "schema_version": 1, "status": "prepared", "model_independent_rows": True,
            "version_id": version_id, "source_revision": effective_catalogue_revision,
            "source_snapshot_sha256": effective_snapshot_sha256,
            "rows_sha256": expected_rows_sha256, "row_count": len(rows),
            "planned_outputs": ["atoms.json", "atom_embeddings.f32", "manifest.json"],
        }
        write_json_atomic(index_dir / "prepare-manifest.json", prepare_manifest)
        if hashlib.sha256(rows_path.read_bytes()).hexdigest() != expected_rows_sha256:
            raise RuntimeError("Prepared atom rows failed read-back verification.")
        return index_dir, prepare_manifest, True
    dimensions = 0
    embedded_count = len(rows)
    reused_count = 0

    if output_dir:
        index_dir.mkdir(parents=True, exist_ok=True)
        progress_path = index_dir / "vectorization-progress.json"
        progress: dict[str, Any] | None = None
        if progress_path.exists():
            progress = json.loads(progress_path.read_text(encoding="utf-8"))
            if (progress.get("cache_sha256") != cache_hash or progress.get("model") != model
                    or progress.get("rows_sha256") != expected_rows_sha256
                    or progress.get("effective_catalogue_revision") != effective_catalogue_revision
                    or progress.get("endpoint") != endpoint.rstrip("/")
                    or (operation_identity_sha256 and progress.get("operation_identity_sha256") != operation_identity_sha256)):
                raise RuntimeError("Saved candidate vector checkpoint does not match the prepared snapshot/model; use a new candidate.")
        if rows_path.exists():
            try:
                saved_rows = json.loads(rows_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError("Saved candidate rows are unreadable; refusing to replace candidate files.") from error
            if saved_rows != rows:
                raise RuntimeError("Saved candidate rows differ from the prepared snapshot; refusing to replace candidate files.")
            if rows_path.read_bytes() != expected_rows:
                rows_path.write_bytes(expected_rows)
        else:
            rows_path.write_bytes(expected_rows)

        if vectors_path.exists() and progress is None:
            if not adopt_existing_complete_vectors:
                raise RuntimeError("Candidate vectors exist without a progress receipt; explicit verified adoption is required.")
            vector_raw = vectors_path.read_bytes()
            if len(vector_raw) < 8:
                raise RuntimeError("Existing candidate vector file has a truncated header.")
            stored_count, dimensions = struct.unpack_from("<II", vector_raw, 0)
            if (stored_count != len(rows) or not dimensions
                    or len(vector_raw) != 8 + stored_count * dimensions * 4):
                raise RuntimeError("Existing candidate vectors are incomplete or do not align with prepared rows.")
            values = struct.unpack_from(f"<{stored_count * dimensions}f", vector_raw, 8)
            for index in range(stored_count):
                vector = values[index * dimensions : (index + 1) * dimensions]
                norm = math.sqrt(sum(value * value for value in vector))
                if not all(math.isfinite(value) for value in vector) or not math.isclose(norm, 1.0, rel_tol=1e-4, abs_tol=1e-4):
                    raise RuntimeError(f"Existing candidate vector {index} is non-finite or not normalized.")
            progress = {
                "schema_version": 1, "status": "vectorization_complete", "model": model,
                "endpoint": endpoint.rstrip("/"), "operation_identity_sha256": operation_identity_sha256,
                "cache_sha256": cache_hash, "rows_sha256": expected_rows_sha256,
                "vectors_sha256": hashlib.sha256(vector_raw).hexdigest(),
                "effective_catalogue_revision": effective_catalogue_revision,
                "effective_snapshot_sha256": effective_snapshot_sha256,
                "completed_count": len(rows), "dimensions": dimensions,
                "reused_count": len(rows),
                "recovered_existing_vectors": True, "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            write_json_atomic(progress_path, progress)
            print(f"Verified and adopted saved candidate vectors: {len(rows)}/{len(rows)}", flush=True)
        elif not vectors_path.exists():
            with vectors_path.open("wb") as handle:
                handle.write(struct.pack("<II", 0, 0))
                handle.flush()
                os.fsync(handle.fileno())

        completed = int(progress.get("completed_count", 0)) if progress else 0
        dimensions = int(progress.get("dimensions", 0)) if progress else 0
        if completed < 0 or completed > len(rows):
            raise RuntimeError("Candidate vector checkpoint has an invalid completed row count.")
        vector_raw = vectors_path.read_bytes()
        if len(vector_raw) < 8:
            raise RuntimeError("Candidate vector file has a truncated header.")
        stored_count, stored_dimensions = struct.unpack_from("<II", vector_raw, 0)
        if completed:
            expected_bytes = 8 + completed * dimensions * 4
            if not dimensions or stored_dimensions != dimensions or len(vector_raw) < expected_bytes:
                raise RuntimeError("Candidate vector file is shorter than its durable checkpoint.")
            with vectors_path.open("r+b") as handle:
                handle.truncate(expected_bytes)
                handle.seek(0)
                handle.write(struct.pack("<II", completed, dimensions))
                handle.flush()
                os.fsync(handle.fileno())
        else:
            completed = 0
            dimensions = 0
            with vectors_path.open("r+b") as handle:
                handle.truncate(8)
                handle.seek(0)
                handle.write(struct.pack("<II", 0, 0))
                handle.flush()
                os.fsync(handle.fileno())
            progress = {
                "schema_version": 1, "status": "vectorizing", "model": model,
                "endpoint": endpoint.rstrip("/"), "operation_identity_sha256": operation_identity_sha256,
                "cache_sha256": cache_hash, "rows_sha256": expected_rows_sha256,
                "effective_catalogue_revision": effective_catalogue_revision,
                "effective_snapshot_sha256": effective_snapshot_sha256,
                "completed_count": 0, "dimensions": 0,
            }
            write_json_atomic(progress_path, progress)

        if finalize_only and (not progress or progress.get("status") != "vectorization_complete" or completed != len(rows)):
            raise RuntimeError("Finalize requires a completed candidate vectorization checkpoint.")
        if not finalize_only:
            for start in range(completed, len(rows), batch_size):
                chunk = rows[start : start + batch_size]
                vectors = embedder(endpoint, model, [str(row["embedding_text"]) for row in chunk])
                if len(vectors) != len(chunk):
                    raise RuntimeError("Embedding provider returned a different number of vectors than requested.")
                normalized = [normalize(vector) for vector in vectors]
                chunk_dimensions = len(normalized[0]) if normalized else 0
                if not chunk_dimensions or any(len(vector) != chunk_dimensions for vector in normalized):
                    raise RuntimeError("Embedding provider returned inconsistent vector dimensions.")
                if dimensions and dimensions != chunk_dimensions:
                    raise RuntimeError("Embedding provider dimension changed while resuming candidate vectors.")
                dimensions = chunk_dimensions
                with vectors_path.open("r+b") as handle:
                    if start == 0:
                        handle.seek(0)
                        handle.write(struct.pack("<II", 0, dimensions))
                        handle.truncate(8)
                    handle.seek(0, os.SEEK_END)
                    for vector in normalized:
                        handle.write(struct.pack(f"<{dimensions}f", *vector))
                    handle.flush()
                    os.fsync(handle.fileno())
                    completed = start + len(chunk)
                    handle.seek(0)
                    handle.write(struct.pack("<II", completed, dimensions))
                    handle.flush()
                    os.fsync(handle.fileno())
                vector_raw = vectors_path.read_bytes()
                progress = {
                    "schema_version": 1, "status": "vectorizing", "model": model,
                    "endpoint": endpoint.rstrip("/"), "operation_identity_sha256": operation_identity_sha256,
                    "cache_sha256": cache_hash, "rows_sha256": expected_rows_sha256,
                    "vectors_sha256": hashlib.sha256(vector_raw).hexdigest(),
                    "effective_catalogue_revision": effective_catalogue_revision,
                    "effective_snapshot_sha256": effective_snapshot_sha256,
                    "completed_count": completed, "dimensions": dimensions,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                write_json_atomic(progress_path, progress)
                print(f"Embedded atoms {completed}/{len(rows)}", flush=True)
        if completed != len(rows):
            raise RuntimeError("Candidate vectorization is incomplete.")
        vector_raw = vectors_path.read_bytes()
        stored_count, stored_dimensions = struct.unpack_from("<II", vector_raw, 0)
        if (stored_count != len(rows) or stored_dimensions != dimensions
                or len(vector_raw) != 8 + len(rows) * dimensions * 4):
            raise RuntimeError("Completed candidate vectors do not align with rows.")
        if progress is None or progress.get("status") != "vectorization_complete":
            progress = {
                "schema_version": 1, "status": "vectorization_complete", "model": model,
                "endpoint": endpoint.rstrip("/"), "operation_identity_sha256": operation_identity_sha256,
                "cache_sha256": cache_hash, "rows_sha256": expected_rows_sha256,
                "vectors_sha256": hashlib.sha256(vector_raw).hexdigest(),
                "effective_catalogue_revision": effective_catalogue_revision,
                "effective_snapshot_sha256": effective_snapshot_sha256,
                "completed_count": len(rows), "dimensions": dimensions,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            write_json_atomic(progress_path, progress)
        if vectorize_only:
            return index_dir, progress, True
        embedded_count = max(0, len(rows) - int(progress.get("reused_count", 0)))
        reused_count = int(progress.get("reused_count", 0))
    else:
        reusable: dict[str, list[float]] = {}
        if index_manifest_path.exists() and rows_path.exists() and vectors_path.exists():
            previous_manifest = json.loads(index_manifest_path.read_text(encoding="utf-8"))
            if previous_manifest.get("model") == model:
                try:
                    rows_bytes, vectors_bytes = rows_path.read_bytes(), vectors_path.read_bytes()
                    previous_rows = json.loads(rows_bytes)
                    previous_vectors = read_vectors(vectors_path)
                    integrity_matches = (
                        previous_manifest.get("rows_sha256") == hashlib.sha256(rows_bytes).hexdigest()
                        and previous_manifest.get("vectors_sha256") == hashlib.sha256(vectors_bytes).hexdigest()
                    )
                    dimensions_match = bool(previous_vectors) and len(previous_vectors[0]) == int(previous_manifest.get("dimensions", 0))
                    if integrity_matches and len(previous_rows) == len(previous_vectors) and dimensions_match:
                        for row, vector in zip(previous_rows, previous_vectors):
                            if row.get("embedding_text") == atom_embedding_text(row):
                                reusable[str(row.get("atom"))] = normalize(vector)
                except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, struct.error):
                    reusable.clear()
        if rows_only and any(str(atom.get("atom")) not in reusable for atom in atoms):
            raise RuntimeError("Rows-only rebuild requires an existing compatible vector for every atom; active index was not changed.")
        index_dir.mkdir(parents=True, exist_ok=True)
        vectors_by_atom = dict(reusable)
        pending = [(atom, text) for atom, text in zip(atoms, texts) if str(atom.get("atom")) not in vectors_by_atom]
        for start in range(0, len(pending), batch_size):
            chunk = pending[start : start + batch_size]
            embedded = embedder(endpoint, model, [text for _atom, text in chunk])
            for (atom, _text), vector in zip(chunk, embedded):
                vectors_by_atom[str(atom.get("atom"))] = normalize(vector)
        vector_list = [vectors_by_atom[str(atom.get("atom"))] for atom in atoms]
        dimensions = write_vectors(vectors_path, vector_list)
        rows_path.write_bytes(expected_rows)
        embedded_count = len(pending)
        reused_count = len(rows) - embedded_count

    vector_raw = vectors_path.read_bytes()
    vectors_sha256 = hashlib.sha256(vector_raw).hexdigest()
    rows_sha256 = hashlib.sha256(rows_path.read_bytes()).hexdigest()
    index_manifest = {
        "schema_version": 1,
        "version_id": version_id,
        "frozen_content_sha256": manifest["content_sha256"],
        "source_snapshot_sha256": manifest["content_sha256"],
        "effective_snapshot_sha256": effective_snapshot_sha256,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": cache_hash,
        "endpoint": endpoint.rstrip("/"), "operation_identity_sha256": operation_identity_sha256,
        "model": model,
        "dimensions": dimensions,
        "atom_count": len(rows),
        "excluded_count": len(excluded),
        "tombstone_count": len(deleted_names),
        "frozen_donor_fallback_enabled": FROZEN_DONOR_FALLBACK_ENABLED,
        "excluded_sha256": excluded_sha256,
        "effective_catalogue_revision": effective_catalogue_revision,
        "source_library_sha256": live_library_sha256,
        "tombstones_sha256": tombstones_sha256,
        "source_parameter_count": len({name for atom in atoms for name in atom.get("source_parameters", [])}),
        "source_reference_diagnostic_counts": dict(sorted(source_diagnostic_counts.items())),
        "truncated_source_reference_count": truncated_source_count,
        "embedded_count": embedded_count,
        "reused_count": reused_count,
        "files": {"rows": "atoms.json", "embeddings": "atom_embeddings.f32"},
        "vector_alignment": vector_alignment,
    }
    index_manifest["rows_sha256"] = rows_sha256
    index_manifest["vectors_sha256"] = vectors_sha256
    write_json(index_manifest_path, index_manifest)
    return index_dir, index_manifest, True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=DATA_ROOT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--output-dir", type=Path, help="Optional isolated artifact directory for another encoder.")
    parser.add_argument("--prepared-rows", type=Path, help="Use pinned atom rows created by model-free Prepare.")
    parser.add_argument("--operation-identity-sha256", help="Candidate operation identity used to reject incompatible checkpoints.")
    parser.add_argument("--version-id", help="Build against this immutable dataset version without changing latest.json.")
    parser.add_argument("--version-dir", type=Path, help="Use an explicitly pinned immutable dataset directory for an isolated candidate build.")
    parser.add_argument("--effective-snapshot", type=Path, help="Resolve active source IDs against one immutable effective-catalogue snapshot")
    parser.add_argument("--source-revision", help="Revision recorded when --effective-snapshot was captured")
    parser.add_argument("--source-snapshot-sha256", help="Canonical content fingerprint captured with --effective-snapshot")
    parser.add_argument("--excluded-sha256", help="Exclusion registry hash captured with --effective-snapshot")
    parser.add_argument("--rows-only", action="store_true", help="Fail unless every atom embedding can be reused from the existing index.")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--vectorize-only", action="store_true", help="Persist vector batches and checkpoint without writing the final index manifest.")
    modes.add_argument("--finalize-only", action="store_true", help="Validate a completed vector checkpoint and write its index manifest without embedding.")
    modes.add_argument("--prepare-only", action="store_true", help="Write pinned atom rows and an output plan without calling an embedding model.")
    parser.add_argument("--adopt-existing-complete-vectors", action="store_true", help="Validate and adopt a complete candidate vector file that predates progress receipts.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    index_dir, manifest, created = build_runtime_index(
        args.data_root.resolve(), args.model, args.endpoint, max(1, args.batch_size), output_dir=args.output_dir,
        version_id_override=args.version_id,
        version_dir_override=args.version_dir,
        rows_only=args.rows_only,
        effective_snapshot=args.effective_snapshot,
        source_revision=args.source_revision,
        source_snapshot_sha256=args.source_snapshot_sha256,
        snapshot_excluded_sha256=args.excluded_sha256,
        vectorize_only=args.vectorize_only,
        finalize_only=args.finalize_only,
        adopt_existing_complete_vectors=args.adopt_existing_complete_vectors,
        prepare_only=args.prepare_only,
        prepared_rows=args.prepared_rows,
        operation_identity_sha256=args.operation_identity_sha256,
    )
    if args.prepare_only:
        print(f"Prepared {manifest['row_count']} atom rows without embeddings: {index_dir}")
    elif args.vectorize_only:
        print(f"Vectorization {manifest['status']}: {manifest['completed_count']} x {manifest['dimensions']} ({manifest['model']})\nPath: {index_dir}")
    else:
        print(
            f"{'Created' if created else 'Reused'} atom index for {manifest['version_id']}: "
            f"{manifest['atom_count']} x {manifest['dimensions']} ({manifest['model']})\nPath: {index_dir}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
