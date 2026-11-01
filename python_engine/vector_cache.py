"""Small, model-agnostic content-addressed cache for normalized float vectors."""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from pathlib import Path

import numpy as np

CACHE_FORMAT_VERSION = "float32-vector-v1"


def content_key(**parts: object) -> str:
    canonical = json.dumps(
        {"format": CACHE_FORMAT_VERSION, **parts},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_vector(cache_dir: Path, key: str, dimensions: int | None = None) -> np.ndarray | None:
    path = cache_dir / (key + ".f32")
    try:
        vector = np.fromfile(path, dtype="<f4")
        if vector.size == 0 or (dimensions is not None and vector.size != dimensions):
            return None
        if not np.isfinite(vector).all():
            return None
        norm = float(np.linalg.norm(vector))
        if not np.isfinite(norm) or norm <= 0:
            return None
        return vector
    except (OSError, ValueError):
        return None


def write_vector(cache_dir: Path, key: str, vector: np.ndarray) -> None:
    values = np.asarray(vector, dtype="<f4").reshape(-1)
    if values.size == 0 or not np.isfinite(values).all():
        raise ValueError("Cannot cache an empty or non-finite vector")
    cache_dir.mkdir(parents=True, exist_ok=True)
    destination = cache_dir / (key + ".f32")
    temporary = cache_dir / (key + "." + str(os.getpid()) + "." + uuid.uuid4().hex + ".tmp")
    try:
        values.tofile(temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
