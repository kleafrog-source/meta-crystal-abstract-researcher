#!/usr/bin/env python3
"""Autonomous Flowmusic Genesis V3 anchoring bridge."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> int:
    project_root = Path(__file__).resolve().parents[2]
    module_dir = project_root / "python_engine" / "anchoring_v3"
    artifacts = project_root / "data" / "combinatorial-genesis" / "v3"
    anchoring_dir = artifacts / "anchoring"
    sys.path.insert(0, str(module_dir))
    from anchoring import Config, anchor_query  # type: ignore

    payload = json.load(sys.stdin)
    cfg = Config(
        dataset_path=str(artifacts / "dataset.json"),
        axes_path=str(anchoring_dir / "axes.json"),
        polarity_path=str(anchoring_dir / "polarity_matrix.json"),
        anchors_path=str(anchoring_dir / "anchors_build.json"),
        lexical_dir=str(anchoring_dir / "lexical"),
        ollama_endpoint=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=os.environ.get("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b"),
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
