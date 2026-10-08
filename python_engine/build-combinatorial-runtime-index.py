#!/usr/bin/env python3
"""Build a local bge-m3 atom index for the latest frozen Combinatorial Genesis dataset."""

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
from typing import Any, Callable, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"
DEFAULT_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b")
DEFAULT_ENDPOINT = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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


def build_runtime_index(
    data_root: Path,
    model: str,
    endpoint: str,
    batch_size: int,
    embedder: Callable[[str, str, list[str]], list[list[float]]] = embed_batch,
) -> tuple[Path, dict[str, Any], bool]:
    latest = json.loads((data_root / "datasets" / "latest.json").read_text(encoding="utf-8"))
    version_id = str(latest["version_id"])
    version_dir = data_root / "datasets" / version_id
    manifest = json.loads((version_dir / "manifest.json").read_text(encoding="utf-8"))
    atoms = json.loads((version_dir / "atoms.json").read_text(encoding="utf-8"))
    texts = [atom_embedding_text(atom) for atom in atoms]
    cache_hash = hashlib.sha256(
        json.dumps(
            {"version_id": version_id, "model": model, "texts": texts},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    index_dir = data_root / "indexes" / version_id
    index_manifest_path = index_dir / "manifest.json"
    if index_manifest_path.exists():
        index_manifest = json.loads(index_manifest_path.read_text(encoding="utf-8"))
        if index_manifest.get("cache_sha256") == cache_hash:
            return index_dir, index_manifest, False

    index_dir.mkdir(parents=True, exist_ok=True)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        chunk = texts[start : start + batch_size]
        vectors.extend(normalize(vector) for vector in embedder(endpoint, model, chunk))
        print(f"Embedded atoms {len(vectors)}/{len(texts)}", flush=True)

    dimensions = write_vectors(index_dir / "atom_embeddings.f32", vectors)
    rows = [
        {
            "atom": atom.get("atom"),
            "role": atom.get("role"),
            "parameter_frequency": atom.get("parameter_frequency", 0),
            "occurrence_weight": atom.get("occurrence_weight", 0),
            "source_parameters": list(atom.get("source_parameters", []))[:24],
            "embedding_text": text,
        }
        for atom, text in zip(atoms, texts)
    ]
    write_json(index_dir / "atoms.json", rows)
    index_manifest = {
        "schema_version": 1,
        "version_id": version_id,
        "frozen_content_sha256": manifest["content_sha256"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": cache_hash,
        "model": model,
        "dimensions": dimensions,
        "atom_count": len(rows),
        "files": {"rows": "atoms.json", "embeddings": "atom_embeddings.f32"},
    }
    write_json(index_manifest_path, index_manifest)
    return index_dir, index_manifest, True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=DATA_ROOT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--batch-size", type=int, default=64)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    index_dir, manifest, created = build_runtime_index(
        args.data_root.resolve(), args.model, args.endpoint, max(1, args.batch_size)
    )
    print(
        f"{'Created' if created else 'Reused'} atom index for {manifest['version_id']}: "
        f"{manifest['atom_count']} x {manifest['dimensions']} ({manifest['model']})\nPath: {index_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
