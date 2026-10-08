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
    )
    response = anchor_query(
        payload.get("query", ""),
        payload.get("scoped_params", []),
        payload.get("current_values") or {},
        cfg,
    )
    json.dump(response, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
