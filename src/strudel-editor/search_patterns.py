from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from build_pattern_index import embed_text, resolve_backend


ROOT = Path(__file__).resolve().parent
INDEX_DIR = ROOT / "data" / "datasets" / "strudel_pattern_index"


def load_metadata(index_dir: Path) -> list[dict[str, Any]]:
    path = index_dir / "metadata.json"
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    if len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a * a for a in vec_a))
    mag_b = math.sqrt(sum(b * b for b in vec_b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def filter_rows(
    rows: list[dict[str, Any]],
    role: str | None,
    granularity: str | None,
    target: str | None,
) -> list[dict[str, Any]]:
    filtered = rows
    if role:
        filtered = [row for row in filtered if row.get("role") == role]
    if granularity:
        filtered = [row for row in filtered if row.get("granularity") == granularity]
    if target:
        filtered = [row for row in filtered if row.get("target") == target]
    return filtered


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic retrieval over the Strudel pattern index.")
    parser.add_argument("query", type=str)
    parser.add_argument("--index", type=Path, default=INDEX_DIR)
    parser.add_argument("--backend", choices=["auto", "hash", "ollama", "sentence-transformers"], default="auto")
    parser.add_argument("--model", default="qllama/bge-m3:q8_0")
    parser.add_argument("--ollama-host", default="http://localhost:11434")
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--role", type=str, default=None)
    parser.add_argument("--granularity", type=str, default=None)
    parser.add_argument("--target", type=str, default=None)
    parser.add_argument("--hash-dims", type=int, default=768)
    args = parser.parse_args()

    rows = load_metadata(args.index.resolve())
    rows = filter_rows(rows, role=args.role, granularity=args.granularity, target=args.target)
    if not rows:
        raise SystemExit("No rows matched the provided filters.")

    actual_backend = resolve_backend(args.backend, args.ollama_host)
    query_vector = embed_text(
        args.query,
        backend=actual_backend,
        model=args.model,
        host=args.ollama_host,
        dims=args.hash_dims,
    )

    scored = []
    for row in rows:
        score = cosine_similarity(query_vector, row["vector"])
        scored.append((score, row))

    scored.sort(key=lambda item: item[0], reverse=True)
    results = []
    for score, row in scored[: args.top_k]:
        results.append(
            {
                "id": row["id"],
                "score": round(score, 6),
                "role": row["role"],
                "granularity": row["granularity"],
                "target": row["target"],
                "source_file": row["source_file"],
                "line_start": row["line_start"],
                "template_expression": row["template_expression"],
                "retrieval_text": row["retrieval_text"],
            }
        )

    print(json.dumps({"query": args.query, "backend": actual_backend, "count": len(results), "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
