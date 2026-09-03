#!/usr/bin/env python
import argparse
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


def build_text(param: dict) -> str:
    parts = [
        param.get("technical_name", ""),
        param.get("category", ""),
        param.get("sub_category", ""),
        param.get("domain", ""),
        param.get("quantity_kind", ""),
    ]
    parts.extend(param.get("semantic_keywords") or [])
    parts.extend(param.get("lyria_prompt_tags") or [])
    return " | ".join(str(part) for part in parts if part)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))
    parser.add_argument("--model", default=os.environ.get("OLLAMA_EMBED_MODEL", "qllama/bge-m3:q8_0"))
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout", type=float, default=60.0)
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parents[2]
    anchoring_dir = repo_root / "z-ai-glm-flowmusic-rag-ui-v2" / "anchoring"
    sys.path.insert(0, str(anchoring_dir))
    from build_anchors import OllamaClient, _now_iso, sha256_json  # type: ignore

    dataset = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    client = OllamaClient(args.endpoint, args.model, timeout=args.timeout)
    probe = client.embed("ping")

    items: list[dict] = []
    total = len(dataset)
    for index, param in enumerate(dataset, start=1):
        text = build_text(param)
        vector = client.embed(text)
        items.append(
            {
                "technical_name": param.get("technical_name"),
                "embedding": vector,
            }
        )
        if index % 25 == 0 or index == total:
            print(f"[build_retrieval_index] embedded {index}/{total}", flush=True)

    payload = {
        "model": args.model,
        "endpoint": args.endpoint,
        "dim": len(probe),
        "dataset_sha": sha256_json(dataset),
        "generated_at": _now_iso(),
        "count": len(items),
        "items": items,
    }
    Path(args.out).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[build_retrieval_index] wrote {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
