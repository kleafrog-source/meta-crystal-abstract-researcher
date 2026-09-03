from __future__ import annotations

import argparse
import hashlib
import json
import math
import pickle
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATASET_JSONL = ROOT / "data" / "datasets" / "strudel_patterns.jsonl"
INDEX_DIR = ROOT / "data" / "datasets" / "strudel_pattern_index"

try:
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover
    np = None

try:
    from sklearn.neighbors import NearestNeighbors  # type: ignore
except ImportError:  # pragma: no cover
    NearestNeighbors = None


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def trim_embedding_text(text: str, max_chars: int = 2400) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= max_chars:
        return normalized
    head = normalized[: max_chars - 96]
    tail = normalized[-80:]
    return f"{head} ... {tail}"


def embed_hash(text: str, dims: int = 768) -> list[float]:
    vector = [0.0] * dims
    for token in text.lower().split():
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % dims
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[bucket] += sign
    return normalize(vector)


def get_embedding_ollama(text: str, model: str, host: str) -> list[float]:
    attempts = [trim_embedding_text(text, max_chars=2400), trim_embedding_text(text, max_chars=1400)]
    last_error: Exception | None = None
    for prompt in attempts:
        body = json.dumps({"model": model, "prompt": prompt}).encode("utf-8")
        request = urllib.request.Request(
            f"{host}/api/embeddings",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
            embedding = payload.get("embedding", [])
            if embedding:
                return normalize(embedding)
        except urllib.error.HTTPError as error:
            last_error = error
            continue
        except urllib.error.URLError as error:
            last_error = error
            continue
    if last_error is not None:
        raise last_error
    return []


def ollama_available(host: str, timeout: float = 3.0) -> bool:
    try:
        request = urllib.request.Request(f"{host}/api/tags", method="GET")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, ValueError):
        return False


_sentence_model = None


def get_embedding_sentence_transformers(text: str, model_name: str) -> list[float]:
    global _sentence_model
    from sentence_transformers import SentenceTransformer

    if _sentence_model is None:
        _sentence_model = SentenceTransformer(model_name)
    return _sentence_model.encode(text, normalize_embeddings=True).tolist()


def resolve_backend(backend: str, host: str) -> str:
    if backend != "auto":
        return backend
    if ollama_available(host):
        return "ollama"
    return "hash"


def embed_text(text: str, backend: str, model: str, host: str, dims: int) -> list[float]:
    backend = resolve_backend(backend, host)
    if backend == "hash":
        return embed_hash(text, dims=dims)
    if backend == "ollama":
        return get_embedding_ollama(text, model=model, host=host)
    if backend == "sentence-transformers":
        return get_embedding_sentence_transformers(text, model_name=model)
    raise ValueError(f"Unsupported backend: {backend}")


def build_vectors(rows: list[dict[str, Any]], backend: str, model: str, host: str, dims: int) -> tuple[list[list[float]], str]:
    actual_backend = resolve_backend(backend, host)
    vectors: list[list[float]] = []
    for index, row in enumerate(rows, start=1):
        vector = embed_text(row["retrieval_text"], backend=actual_backend, model=model, host=host, dims=dims)
        if not vector:
            raise RuntimeError(f"Embedding backend returned empty vector for row {row['id']}")
        vectors.append(vector)
        print(f"[{index}/{len(rows)}] embedded {row['id']} [{actual_backend}]")
    return vectors, actual_backend


def save_vectors_npy(vectors: list[list[float]], output_dir: Path) -> str:
    if np is None:
        return "skipped:numpy-not-installed"
    try:
        matrix = np.asarray(vectors, dtype=np.float32)
        np.save(output_dir / "vectors.npy", matrix)
        return "written"
    except Exception as error:  # pragma: no cover
        return f"skipped:{type(error).__name__}"


def save_neighbors_pickle(vectors: list[list[float]], output_dir: Path) -> str:
    if np is None or NearestNeighbors is None:
        return "skipped:sklearn-or-numpy-not-installed"
    try:
        matrix = np.asarray(vectors, dtype=np.float32)
        index = NearestNeighbors(metric="cosine", algorithm="brute")
        index.fit(matrix)
        with (output_dir / "neighbors.pkl").open("wb") as handle:
            pickle.dump(index, handle)
        return "written"
    except Exception as error:  # pragma: no cover
        return f"skipped:{type(error).__name__}"


def save_index(rows: list[dict[str, Any]], vectors: list[list[float]], output_dir: Path, backend: str, model: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    metadata = [
        {
            "id": row["id"],
            "source_file": row["source_file"],
            "target": row["target"],
            "role": row["role"],
            "granularity": row["granularity"],
            "line_start": row["line_start"],
            "line_end": row.get("line_end"),
            "label": row.get("label"),
            "expression": row.get("expression"),
            "template_expression": row["template_expression"],
            "template_slots": row.get("template_slots", []),
            "sample_patterns": row.get("sample_patterns", []),
            "note_patterns": row.get("note_patterns", []),
            "struct_patterns": row.get("struct_patterns", []),
            "methods": row.get("methods", []),
            "transport_methods": row.get("transport_methods", []),
            "tempo_markers": row.get("tempo_markers", []),
            "has_slots": row.get("has_slots", False),
            "estimated_bars": row.get("estimated_bars"),
            "density_score": row.get("density_score"),
            "intensity_score": row.get("intensity_score"),
            "mood_tags": row.get("mood_tags", []),
            "section_fit": row.get("section_fit", []),
            "tone_family": row.get("tone_family"),
            "instrument_family": row.get("instrument_family"),
            "unresolved_identifiers": row.get("unresolved_identifiers", []),
            "self_contained_score": row.get("self_contained_score"),
            "retrieval_text": row["retrieval_text"],
            "vector": vector,
        }
        for row, vector in zip(rows, vectors)
    ]
    (output_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "vectors.json").write_text(json.dumps(vectors, ensure_ascii=False), encoding="utf-8")

    npy_status = save_vectors_npy(vectors, output_dir)
    neighbors_status = save_neighbors_pickle(vectors, output_dir)

    manifest = {
        "rows": len(rows),
        "dimension": len(vectors[0]) if vectors else 0,
        "backend": backend,
        "model": model,
        "npy_status": npy_status,
        "neighbors_status": neighbors_status,
        "files": {
            "vectors_json": str(output_dir / "vectors.json"),
            "metadata": str(output_dir / "metadata.json"),
            "manifest": str(output_dir / "manifest.json"),
        },
    }
    if npy_status == "written":
        manifest["files"]["vectors_npy"] = str(output_dir / "vectors.npy")
    if neighbors_status == "written":
        manifest["files"]["neighbors"] = str(output_dir / "neighbors.pkl")
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build semantic retrieval index for Strudel pattern dataset.")
    parser.add_argument("--input", type=Path, default=DATASET_JSONL)
    parser.add_argument("--output", type=Path, default=INDEX_DIR)
    parser.add_argument(
        "--backend",
        choices=["auto", "ollama", "sentence-transformers", "hash"],
        default="auto",
    )
    parser.add_argument("--model", default="qllama/bge-m3:q8_0")
    parser.add_argument("--ollama-host", default="http://localhost:11434")
    parser.add_argument("--hash-dims", type=int, default=768)
    args = parser.parse_args()

    rows = load_jsonl(args.input.resolve())
    vectors, actual_backend = build_vectors(
        rows,
        backend=args.backend,
        model=args.model,
        host=args.ollama_host,
        dims=args.hash_dims,
    )
    save_index(rows, vectors, args.output.resolve(), backend=actual_backend, model=args.model)
    print(f"Built index for {len(rows)} rows -> {args.output.resolve()} [{actual_backend}]")


if __name__ == "__main__":
    main()
