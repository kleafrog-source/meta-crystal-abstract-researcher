#!/usr/bin/env python3
"""
Compute 2D UMAP coordinates for crystal embeddings stored in SQLite.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np
import umap


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_CANDIDATES = [
    REPO_ROOT / "prisma" / "dev.db",
    REPO_ROOT / "db" / "custom.db",
    REPO_ROOT / "dev.db",
]


def load_dotenv() -> None:
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def resolve_db_path() -> Path:
    load_dotenv()
    db_url = os.getenv("DATABASE_URL", "").strip()
    if db_url.startswith("file:"):
        relative_path = db_url[len("file:") :]
        candidate = Path(relative_path)
        if not candidate.is_absolute():
            candidate = (REPO_ROOT / candidate).resolve()
        if candidate.exists():
            return candidate
    for candidate in DEFAULT_DB_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
      "SQLite database was not found. Checked DATABASE_URL and default locations:\n"
      + "\n".join(f"- {item}" for item in DEFAULT_DB_CANDIDATES)
    )


def get_umap_config(sample_count: int) -> Dict[str, object]:
    requested_neighbors = int(os.getenv("UMAP_N_NEIGHBORS", "15"))
    min_dist = float(os.getenv("UMAP_MIN_DIST", "0.1"))
    metric = os.getenv("UMAP_METRIC", "cosine")
    n_neighbors = max(2, min(requested_neighbors, sample_count - 1))
    return {
        "n_components": 2,
        "n_neighbors": n_neighbors,
        "min_dist": min_dist,
        "metric": metric,
        "random_state": 42,
    }


def load_embeddings(conn: sqlite3.Connection) -> Tuple[List[str], np.ndarray]:
    rows = conn.execute(
      "SELECT id, embedding FROM Crystal WHERE embedding IS NOT NULL AND TRIM(embedding) <> ''"
    ).fetchall()
    ids: List[str] = []
    vectors: List[List[float]] = []
    expected_dim: int | None = None

    for crystal_id, embedding_raw in rows:
        try:
            parsed = json.loads(embedding_raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, list) or not parsed:
            continue
        try:
            vector = [float(value) for value in parsed]
        except (TypeError, ValueError):
            continue
        if expected_dim is None:
            expected_dim = len(vector)
        if len(vector) != expected_dim:
            continue
        ids.append(str(crystal_id))
        vectors.append(vector)

    if not ids:
        return [], np.empty((0, 0), dtype=np.float32)
    return ids, np.asarray(vectors, dtype=np.float32)


def update_coordinates(conn: sqlite3.Connection, payload: Iterable[Tuple[float, float, str]]) -> None:
    conn.executemany(
        "UPDATE Crystal SET umapX = ?, umapY = ? WHERE id = ?",
        payload,
    )
    conn.commit()


def main() -> int:
    try:
        db_path = resolve_db_path()
    except FileNotFoundError as exc:
        print(str(exc))
        return 1

    print(f"Using database: {db_path}")
    conn = sqlite3.connect(db_path)
    try:
        ids, matrix = load_embeddings(conn)
        if len(ids) == 0:
            print("No valid embeddings found in Crystal.embedding.")
            return 1

        if len(ids) == 1:
            update_coordinates(conn, [(0.0, 0.0, ids[0])])
            print("Only one embedding found. Saved (0, 0) for the single crystal.")
            return 0

        config = get_umap_config(len(ids))
        print(
            "Running UMAP with "
            f"n_neighbors={config['n_neighbors']}, min_dist={config['min_dist']}, metric={config['metric']}"
        )
        reducer = umap.UMAP(**config)
        coords = reducer.fit_transform(matrix)
        update_coordinates(
            conn,
            ((float(x), float(y), crystal_id) for crystal_id, (x, y) in zip(ids, coords)),
        )
        print(f"Updated UMAP coordinates for {len(ids)} crystals.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
