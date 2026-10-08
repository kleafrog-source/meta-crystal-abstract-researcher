#!/usr/bin/env python3
"""Autonomous Flowmusic Genesis V3 anchoring bridge."""

from __future__ import annotations

import json
import os
import struct
import sys
from pathlib import Path

import numpy as np


def load_composite_index(index_dir: Path) -> tuple[np.memmap, dict[str, int]]:
    manifest = json.loads((index_dir / "manifest.json").read_text(encoding="utf-8"))
    rows = json.loads((index_dir / manifest["files"]["rows"]).read_text(encoding="utf-8"))
    vectors_path = index_dir / manifest["files"]["embeddings"]
    with vectors_path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
    if count != len(rows) or count != manifest["parameter_count"] or dimensions != manifest["dimensions"]:
        raise ValueError("V3 composite index header mismatch")
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", offset=8, shape=(count, dimensions))
    return vectors, {str(row["technical_name"]): index for index, row in enumerate(rows)}


def load_value_artifact(manifest_path: Path) -> tuple[np.memmap | None, dict[str, list[dict]]]:
    if not manifest_path.exists():
        return None, {}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    vectors_path = manifest_path.parent / manifest["vectors_file"]
    with vectors_path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
    if count != manifest["count"] or dimensions != manifest["dimensions"]:
        raise ValueError(f"V3 value-anchor header mismatch: {manifest_path.name}")
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", offset=8, shape=(count, dimensions))
    return vectors, manifest.get("parameters") or {}


def main() -> int:
    project_root = Path(__file__).resolve().parents[2]
    module_dir = project_root / "python_engine" / "anchoring_v3"
    artifacts = project_root / "data" / "combinatorial-genesis" / "v3"
    anchoring_dir = artifacts / "anchoring"
    sys.path.insert(0, str(module_dir))
    from anchoring import Config, anchor_query  # type: ignore

    payload = json.load(sys.stdin)
    anchors_path = anchoring_dir / "anchors_build.json"
    anchors = json.loads(anchors_path.read_text(encoding="utf-8"))
    vectors, row_by_name = load_composite_index(artifacts / "composite-index")
    value_vectors, value_parameters = load_value_artifact(artifacts / "value-anchors" / "manifest.json")
    select_vectors, select_parameters = load_value_artifact(artifacts / "value-anchors" / "select-options.json")
    runtime_config = json.loads((module_dir / "config.json").read_text(encoding="utf-8"))
    cfg = Config(
        dataset_path=str(artifacts / "dataset.json"),
        axes_path=str(anchoring_dir / "axes.json"),
        polarity_path=str(anchoring_dir / "polarity_matrix.json"),
        anchors_path=str(anchors_path),
        lexical_dir=str(anchoring_dir / "lexical"),
        ollama_endpoint=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=os.environ.get("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b"),
        _param_vectors=vectors,
        _param_row_by_name=row_by_name,
        _a_home=anchors.get("a_home") or {},
        _value_anchor_vectors=value_vectors,
        _value_anchor_parameters=value_parameters,
        _select_option_vectors=select_vectors,
        _select_option_parameters=select_parameters,
        threshold_range=float(runtime_config["threshold_range"]),
        threshold_select=float(runtime_config["threshold_select"]),
        softmax_temp_explicit=float(runtime_config["softmax_temp_explicit"]),
        softmax_temp_diffuse=float(runtime_config["softmax_temp_diffuse"]),
    )
    response = anchor_query(
        payload.get("query", ""),
        payload.get("scoped_params", []),
        payload.get("current_values") or {},
        cfg,
        query_embeddings=payload.get("query_embeddings") or None,
        query_concepts=payload.get("concepts") or None,
        relation_hints=payload.get("relation_hints") or None,
    )
    json.dump(response, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
