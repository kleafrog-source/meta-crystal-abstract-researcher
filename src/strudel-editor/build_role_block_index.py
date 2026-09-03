from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from build_pattern_index import build_vectors, load_jsonl


ROOT = Path(__file__).resolve().parent
DATASET_JSONL = ROOT / "data" / "datasets" / "strudel_role_blocks.jsonl"
INDEX_DIR = ROOT / "data" / "datasets" / "strudel_role_block_index"


def save_index(rows: list[dict[str, Any]], vectors: list[list[float]], output_dir: Path, backend: str, model: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata = [
        {
            "id": row["id"],
            "source_id": row.get("source_id"),
            "source_file": row.get("source_file"),
            "role": row.get("role"),
            "block_type": row.get("block_type"),
            "granularity": row.get("granularity"),
            "estimated_bars": row.get("estimated_bars"),
            "energy": row.get("energy"),
            "density": row.get("density"),
            "section_fit": row.get("section_fit", []),
            "style_tags": row.get("style_tags", []),
            "mood_tags": row.get("mood_tags", []),
            "instrument_family": row.get("instrument_family"),
            "tone_family": row.get("tone_family"),
            "scale_hint": row.get("scale_hint"),
            "sample_patterns": row.get("sample_patterns", []),
            "note_patterns": row.get("note_patterns", []),
            "struct_patterns": row.get("struct_patterns", []),
            "methods": row.get("methods", []),
            "renderable_code": row.get("renderable_code"),
            "retrieval_text": row["retrieval_text"],
            "vector": vector,
        }
        for row, vector in zip(rows, vectors)
    ]
    (output_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "vectors.json").write_text(json.dumps(vectors, ensure_ascii=False), encoding="utf-8")
    manifest = {
        "rows": len(rows),
        "dimension": len(vectors[0]) if vectors else 0,
        "backend": backend,
        "model": model,
        "files": {
            "vectors_json": str(output_dir / "vectors.json"),
            "metadata": str(output_dir / "metadata.json"),
            "manifest": str(output_dir / "manifest.json"),
        },
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build semantic retrieval index for Strudel role-block dataset.")
    parser.add_argument("--input", type=Path, default=DATASET_JSONL)
    parser.add_argument("--output", type=Path, default=INDEX_DIR)
    parser.add_argument("--backend", choices=["auto", "ollama", "sentence-transformers", "hash"], default="auto")
    parser.add_argument("--model", default="qllama/bge-m3:q8_0")
    parser.add_argument("--ollama-host", default="http://localhost:11434")
    parser.add_argument("--hash-dims", type=int, default=768)
    args = parser.parse_args()

    rows = load_jsonl(args.input.resolve())
    vectors, actual_backend = build_vectors(rows, backend=args.backend, model=args.model, host=args.ollama_host, dims=args.hash_dims)
    save_index(rows, vectors, args.output.resolve(), backend=actual_backend, model=args.model)
    print(f"Built role-block index for {len(rows)} rows -> {args.output.resolve()} [{actual_backend}]")


if __name__ == "__main__":
    main()
