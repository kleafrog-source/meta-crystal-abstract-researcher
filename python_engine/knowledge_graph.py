#!/usr/bin/env python3
"""Build a deterministic, read-only knowledge graph for the active V3 snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from v3_snapshot import DEFAULT_DATA_ROOT, load_v3_snapshot


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_vectors(path: Path) -> np.ndarray:
    with path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
        values = np.fromfile(handle, dtype="<f4", count=count * dimensions)
    if values.size != count * dimensions:
        raise ValueError("Composite vector file is truncated")
    return values.reshape(count, dimensions)


def node_id(kind: str, value: str) -> str:
    return f"{kind}:{value}"


def edge_id(kind: str, source: str, target: str) -> str:
    raw = f"{kind}\0{source}\0{target}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:20]


def semantic_edges(rows: list[dict[str, Any]], vectors: np.ndarray, active: set[str], k: int, threshold: float) -> list[dict[str, Any]]:
    selected = [i for i, row in enumerate(rows) if str(row.get("technical_name")) in active and str(row.get("retrieval_scope") or "sound") in {"sound", "structure"}]
    if len(selected) < 2:
        return []
    matrix = vectors[selected].astype(np.float32, copy=False)
    matrix /= np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
    actual_k = min(k, len(matrix) - 1)
    directed: dict[tuple[str, str], tuple[float, int]] = {}
    chunk = 192
    for start in range(0, len(matrix), chunk):
        scores = matrix[start:start + chunk] @ matrix.T
        for local, global_index in enumerate(range(start, min(start + chunk, len(matrix)))):
            scores[local, global_index] = -1.0
        candidates = np.argpartition(scores, -actual_k, axis=1)[:, -actual_k:]
        for local, indexes in enumerate(candidates):
            ordered = sorted(((int(index), float(scores[local, index])) for index in indexes), key=lambda item: (-item[1], item[0]))
            source_name = str(rows[selected[start + local]]["technical_name"])
            for rank, (position, similarity) in enumerate(ordered, 1):
                if similarity < threshold:
                    continue
                target_name = str(rows[selected[position]]["technical_name"])
                directed[(source_name, target_name)] = (similarity, rank)
        print(json.dumps({"event": "progress", "stage": "semantic_knn", "current": min(start + chunk, len(matrix)), "total": len(matrix)}), flush=True)

    result = []
    seen: set[tuple[str, str]] = set()
    for (left, right), (similarity, rank) in sorted(directed.items()):
        pair = tuple(sorted((left, right)))
        if pair in seen:
            continue
        reverse = directed.get((right, left))
        if reverse is None:
            continue
        seen.add(pair)
        score = max(similarity, reverse[0])
        source, target = node_id("parameter", pair[0]), node_id("parameter", pair[1])
        result.append({"id": edge_id("semantic_neighbor", source, target), "type": "semantic_neighbor", "source": source, "target": target, "similarity": round(score, 7), "ranks": [rank, reverse[1]]})
    return result


def connected_communities(parameter_names: list[str], semantic: list[dict[str, Any]]) -> tuple[dict[str, int], list[list[str]]]:
    adjacency: dict[str, set[str]] = {name: set() for name in parameter_names}
    for edge in semantic:
        left = edge["source"].split(":", 1)[1]
        right = edge["target"].split(":", 1)[1]
        adjacency[left].add(right)
        adjacency[right].add(left)
    communities: list[list[str]] = []
    remaining = set(parameter_names)
    while remaining:
        start = min(remaining)
        queue = deque([start]); component: list[str] = []
        remaining.remove(start)
        while queue:
            current = queue.popleft(); component.append(current)
            for neighbour in sorted(adjacency[current]):
                if neighbour in remaining:
                    remaining.remove(neighbour); queue.append(neighbour)
        communities.append(sorted(component))
    communities.sort(key=lambda group: (-len(group), group[0]))
    mapping = {name: index for index, group in enumerate(communities) for name in group}
    return mapping, communities


def build(data_root: Path, output: Path, k: int, threshold: float) -> dict[str, Any]:
    snapshot = load_v3_snapshot(data_root)
    index_dir = data_root / "v3" / "composite-index"
    manifest = read_json(index_dir / "manifest.json")
    if str(manifest.get("dataset_version")) != snapshot["dataset_version"] or int(manifest.get("parameter_count", -1)) != snapshot["parameter_count"] or str(manifest.get("excluded_sha256")) != snapshot["excluded_sha256"]:
        raise RuntimeError("V3 composite index is stale. Rebuild it before Knowledge Graph.")
    rows = read_json(index_dir / "rows.json")
    vectors = read_vectors(index_dir / "embeddings.f32")
    if len(rows) != len(vectors):
        raise ValueError("Composite rows/vector count mismatch")

    parameters = snapshot["parameters"]
    active = {str(item["technical_name"]) for item in parameters}
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    edge_keys: set[tuple[str, str, str]] = set()

    def add_node(kind: str, value: str, **extra: Any) -> str:
        identifier = node_id(kind, value)
        nodes.setdefault(identifier, {"id": identifier, "type": kind, "label": value, **extra})
        return identifier

    def add_edge(kind: str, source: str, target: str, **extra: Any) -> None:
        key = (kind, source, target)
        if key in edge_keys:
            return
        edge_keys.add(key)
        edges.append({"id": edge_id(kind, source, target), "type": kind, "source": source, "target": target, **extra})

    for item in parameters:
        name = str(item["technical_name"])
        source = add_node("parameter", name, name_ru=item.get("name_ru"), category=item.get("category"), sub_category=item.get("sub_category"), retrieval_scope=item.get("retrieval_scope", "sound"), source=item.get("source"))
        for field, kind, relation in (("category", "category", "belongs_to_category"), ("sub_category", "sub_category", "belongs_to_subcategory"), ("quantity_kind", "quantity_kind", "has_quantity_kind"), ("ui_element", "ui_element", "has_ui_element")):
            value = str(item.get(field) or "unspecified")
            add_edge(relation, source, add_node(kind, value))

    atoms_path = data_root / "datasets" / snapshot["dataset_version"] / "atoms.json"
    if atoms_path.exists():
        for atom in read_json(atoms_path):
            value = str(atom.get("atom") or "").strip()
            if not value:
                continue
            target = add_node("atom", value, role=atom.get("role"), parameter_frequency=atom.get("parameter_frequency"))
            for name in sorted({str(entry) for entry in atom.get("source_parameters", []) if str(entry) in active}):
                add_edge("contains_atom", node_id("parameter", name), target, provenance={"dataset_version": snapshot["dataset_version"], "role": atom.get("role")})

    semantic = semantic_edges(rows, vectors, active, k, threshold)
    edges.extend(semantic)
    parameter_names = sorted(active)
    community_map, communities = connected_communities(parameter_names, semantic)
    degrees = Counter()
    for edge in semantic:
        degrees[edge["source"]] += 1; degrees[edge["target"]] += 1
    for name in parameter_names:
        node = nodes[node_id("parameter", name)]
        node["community_id"] = community_map[name]
        node["semantic_degree"] = degrees[node["id"]]

    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        adjacency[edge["source"]].append(edge["id"])
        adjacency[edge["target"]].append(edge["id"])
    for value in adjacency.values():
        value.sort()
    isolated = sorted(name for name in parameter_names if degrees[node_id("parameter", name)] == 0)
    graph = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manifest": {"source_snapshot_sha256": snapshot["content_sha256"], "dataset_version": snapshot["dataset_version"], "excluded_sha256": snapshot["excluded_sha256"], "parameter_count": snapshot["parameter_count"], "composite_index_sha256": manifest.get("cache_sha256"), "embedding_model": manifest.get("model"), "dimensions": manifest.get("dimensions"), "knn_k": k, "similarity_threshold": threshold, "symmetrization": "mutual", "community_algorithm": "connected_components", "seed": 42},
        "summary": {"node_count": len(nodes), "edge_count": len(edges), "parameter_count": len(parameter_names), "semantic_edge_count": len(semantic), "community_count": len(communities), "isolated_parameter_count": len(isolated), "node_types": dict(sorted(Counter(node["type"] for node in nodes.values()).items())), "edge_types": dict(sorted(Counter(edge["type"] for edge in edges).items()))},
        "nodes": [nodes[key] for key in sorted(nodes)],
        "edges": sorted(edges, key=lambda item: (item["type"], item["source"], item["target"])),
        "adjacency": dict(sorted(adjacency.items())),
        "communities": [{"id": index, "size": len(group), "parameters": group} for index, group in enumerate(communities)],
        "isolated_parameters": isolated,
    }
    atomic_json(output, graph)
    return graph


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--knn-k", type=int, default=6)
    parser.add_argument("--threshold", type=float, default=0.0)
    args = parser.parse_args()
    output = args.output.resolve() if args.output else args.data_root.resolve() / "knowledge-graph" / "graph.json"
    graph = build(args.data_root.resolve(), output, max(2, min(20, args.knn_k)), max(-1.0, min(1.0, args.threshold)))
    print(json.dumps({"event": "completed", "path": str(output), "summary": graph["summary"]}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
