#!/usr/bin/env python3
"""Embedding-only typed value selection for a verified active V3 bundle."""

from __future__ import annotations

import hashlib
import json
import os
import struct
import sys
import uuid
from pathlib import Path
from typing import Any

import numpy as np


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected an object manifest: {path}")
    return value


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def json_default(value: Any) -> Any:
    """Convert NumPy scalars/arrays emitted by cosine scoring to JSON values."""
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def verify_bundle(payload: dict[str, Any]) -> tuple[Path, dict[str, Any], dict[str, Any], dict[str, Any]]:
    paths = payload.get("artifact_paths")
    identity = payload.get("selection_identity")
    if not isinstance(paths, dict) or not isinstance(identity, dict):
        raise ValueError("Selection bundle paths and identity are required; legacy artifact lookup is disabled.")
    bundle_root = Path(str(paths.get("bundle_root", ""))).resolve(strict=True)
    index_dir = Path(str(paths.get("text_index_directory", ""))).resolve(strict=True)
    value_dir = Path(str(paths.get("value_directory", ""))).resolve(strict=True)
    maintenance_root = (Path(__file__).resolve().parents[2] / "data" / "combinatorial-genesis" / "maintenance").resolve()
    if not bundle_root.is_relative_to(maintenance_root):
        raise ValueError("Selection bundle escapes the managed maintenance area.")
    for target in (index_dir, value_dir):
        if not target.is_relative_to(bundle_root):
            raise ValueError("Selection artifact path escapes the active bundle.")
    bundle_manifest_path = bundle_root / "bundle-manifest.json"
    retrieval_path = index_dir / "manifest.json"
    range_path = value_dir / "manifest.json"
    typed_path = value_dir / "select-options.json"
    bundle = read_json(bundle_manifest_path)
    retrieval = read_json(retrieval_path)
    range_manifest = read_json(range_path)
    typed_manifest = read_json(typed_path)
    bundle_id = str(identity.get("bundle_id") or "")
    model = str(identity.get("model") or "")
    encoder = str(identity.get("encoder") or "")
    dimensions = int(identity.get("dimensions") or 0)
    source_revision = str(identity.get("source_revision") or "")
    source_snapshot = str(identity.get("source_snapshot_sha256") or "")
    if not bundle_id or not model or not encoder or dimensions <= 0 or not source_revision or not source_snapshot:
        raise ValueError("Selection bundle identity is incomplete.")
    if bundle.get("status") != "complete" or bundle.get("encoder") != encoder or bundle.get("model") != model:
        raise ValueError("Active bundle manifest does not match the requested encoder/model identity.")
    if retrieval.get("model") != model or int(retrieval.get("dimensions") or 0) != dimensions:
        raise ValueError("Retrieval model or dimensions differ from value-selection artifacts.")
    if retrieval.get("value_selection_bundle_id") != bundle_id:
        raise ValueError("Retrieval artifact has a different value-selection bundle identity.")
    if retrieval.get("source_revision") != source_revision or retrieval.get("source_snapshot_sha256") != source_snapshot:
        raise ValueError("Retrieval source identity differs from the active bundle.")
    if bundle.get("source_revision") != source_revision:
        raise ValueError("Bundle source revision differs from selection identity.")
    bundle_snapshot = bundle.get("source_snapshot_sha256", bundle.get("source_snapshot_content_sha256"))
    if bundle_snapshot != source_snapshot:
        raise ValueError("Bundle source fingerprint differs from selection identity.")
    for label, manifest in (("Range", range_manifest), ("typed candidate", typed_manifest)):
        if (manifest.get("model") != model or int(manifest.get("dimensions") or 0) != dimensions
                or manifest.get("source_revision") != source_revision
                or manifest.get("source_snapshot_sha256") != source_snapshot
                or manifest.get("value_selection_bundle_id") != bundle_id
                or int(manifest.get("selection_contract_version") or 0) != 2
                or int(manifest.get("candidate_text_version") or 0) != 2
                or not manifest.get("embedding_preprocessing_version")):
            raise ValueError(f"Active {label} artifact is stale or incompatible.")
    files = bundle.get("files")
    if not isinstance(files, list):
        raise ValueError("Active bundle does not contain a file inventory.")
    for artifact_path in (retrieval_path, range_path, typed_path):
        relative = artifact_path.relative_to(bundle_root).as_posix()
        raw = artifact_path.read_bytes()
        entry = next((row for row in files if isinstance(row, dict) and row.get("path") == relative), None)
        if not entry or entry.get("bytes") != len(raw) or entry.get("sha256") != sha256_bytes(raw):
            raise ValueError(f"Bundle inventory does not authenticate {relative}.")
    return index_dir, retrieval, range_manifest, typed_manifest


def load_composite_index(index_dir: Path, manifest: dict[str, Any]) -> tuple[np.memmap, dict[str, int]]:
    rows = json.loads((index_dir / manifest["files"]["rows"]).read_text(encoding="utf-8"))
    vectors_path = index_dir / manifest["files"]["embeddings"]
    with vectors_path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
    if count != len(rows) or count != manifest["parameter_count"] or dimensions != manifest["dimensions"]:
        raise ValueError("V3 composite index header mismatch")
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", offset=8, shape=(count, dimensions))
    return vectors, {str(row["technical_name"]): index for index, row in enumerate(rows)}


def load_value_artifact(manifest_path: Path, manifest: dict[str, Any]) -> tuple[np.memmap, dict[str, list[dict[str, Any]]]]:
    vectors_path = manifest_path.parent / str(manifest["vectors_file"])
    with vectors_path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
    if count != manifest["count"] or dimensions != manifest["dimensions"]:
        raise ValueError(f"V3 value-candidate header mismatch: {manifest_path.name}")
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", offset=8, shape=(count, dimensions))
    parameters = manifest.get("parameters")
    if not isinstance(parameters, dict):
        raise ValueError(f"V3 value-candidate rows are missing: {manifest_path.name}")
    for name, entries in parameters.items():
        if not isinstance(entries, list) or any(not isinstance(entry, dict) or not isinstance(entry.get("row_index"), int) or not 0 <= entry["row_index"] < count for entry in entries):
            raise ValueError(f"V3 candidate row index is invalid for {name}.")
    return vectors, parameters


def main() -> int:
    project_root = Path(__file__).resolve().parents[2]
    module_dir = project_root / "python_engine" / "anchoring_v3"
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError("Expected a selection request object.")
    index_dir, retrieval_manifest, range_manifest, typed_manifest = verify_bundle(payload)
    vectors, row_by_name = load_composite_index(index_dir, retrieval_manifest)
    value_dir = Path(str(payload["artifact_paths"]["value_directory"]))
    range_vectors, range_parameters = load_value_artifact(value_dir / "manifest.json", range_manifest)
    typed_vectors, typed_parameters = load_value_artifact(value_dir / "select-options.json", typed_manifest)
    sys.path.insert(0, str(module_dir))
    from anchoring import Config, anchor_query  # type: ignore

    runtime_config = json.loads((module_dir / "config.json").read_text(encoding="utf-8"))
    model = str(payload["selection_identity"]["model"])
    cfg = Config(
        ollama_model=model,
        _anchors={"stub": False},
        _param_vectors=vectors,
        _param_row_by_name=row_by_name,
        _value_anchor_vectors=range_vectors,
        _value_anchor_parameters=range_parameters,
        _select_option_vectors=typed_vectors,
        _select_option_parameters=typed_parameters,
        threshold_range=float(runtime_config["threshold_range"]),
        threshold_select=float(runtime_config["threshold_select"]),
        threshold_toggle=float(runtime_config["threshold_toggle"]),
        softmax_temp_explicit=float(runtime_config["softmax_temp_explicit"]),
        softmax_temp_diffuse=float(runtime_config["softmax_temp_diffuse"]),
    )
    audit_log: list[dict[str, Any]] = []
    diagnostic_context = payload.get("diagnostic_context") if isinstance(payload.get("diagnostic_context"), dict) else {}
    response = anchor_query(
        str(payload.get("query") or ""),
        payload.get("scoped_params") if isinstance(payload.get("scoped_params"), list) else [],
        payload.get("current_values") if isinstance(payload.get("current_values"), dict) else {},
        cfg,
        query_embeddings=payload.get("query_embeddings") if isinstance(payload.get("query_embeddings"), list) else None,
        audit_log=audit_log,
        diagnostic_context={str(key): str(value) for key, value in diagnostic_context.items() if value is not None},
        selection_identity=payload["selection_identity"],
    )
    request_id = str(diagnostic_context.get("request_id") or uuid.uuid4())
    audit_dir = project_root / "reports" / "stage4_anchor_logs"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_payload = {
        "schema": "embedding_value_selection_audit_v2",
        "request_id": request_id,
        "query_sha256": sha256_bytes(str(payload.get("query") or "").encode("utf-8")),
        "text_index": payload["selection_identity"].get("encoder"),
        "model": model,
        "selection_identity": payload["selection_identity"],
        "diagnostic_context": diagnostic_context,
        "parameters": audit_log,
    }
    (audit_dir / f"{request_id}-{uuid.uuid4()}.json").write_text(
        json.dumps(audit_payload, ensure_ascii=False, indent=2, default=json_default) + "\n", encoding="utf-8"
    )
    json.dump(response, sys.stdout, ensure_ascii=False, default=json_default)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
