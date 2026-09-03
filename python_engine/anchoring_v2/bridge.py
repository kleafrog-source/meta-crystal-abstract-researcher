#!/usr/bin/env python
import json
import os
import sys
from pathlib import Path


def _configure_stdio() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


_configure_stdio()


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    anchoring_dir = repo_root / "z-ai-glm-flowmusic-rag-ui-v2" / "anchoring"
    sys.path.insert(0, str(anchoring_dir))

    from anchoring import Config, anchor_query  # type: ignore

    payload = json.load(sys.stdin)
    query = payload.get("query", "")
    scoped_params = payload.get("scoped_params", [])
    current_values = payload.get("current_values") or {}

    cfg = Config(
        dataset_path=str(anchoring_dir / "unified_parameters_enriched.json"),
        axes_path=str(anchoring_dir / "axes.json"),
        polarity_path=str(anchoring_dir / "polarity_matrix.json"),
        anchors_path=str(anchoring_dir / "anchors_build.json"),
        lexical_dir=str(anchoring_dir / "lexical"),
        ollama_endpoint=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=os.environ.get("OLLAMA_EMBED_MODEL", "qllama/bge-m3:q8_0"),
    )

    response = anchor_query(query, scoped_params, current_values, cfg)
    json.dump(response, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
