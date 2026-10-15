#!/usr/bin/env python3
"""Build deterministic taxonomy, atom-coverage and semantic-density gap signals."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from v3_snapshot import DEFAULT_DATA_ROOT, load_v3_snapshot


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_id(kind: str, evidence: dict[str, Any]) -> str:
    raw = json.dumps({"kind": kind, "evidence": evidence}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"{kind}-{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]}"


def gap(kind: str, priority: float, confidence: float, evidence: dict[str, Any], query: str, target: str) -> dict[str, Any]:
    return {
        "gap_id": stable_id(kind, evidence), "kind": kind,
        "priority": round(float(priority), 6), "confidence": round(float(confidence), 6),
        "evidence": evidence, "suggested_query": query, "target_mode": target,
    }


def taxonomy_gaps(parameters: list[dict[str, Any]], minimum_group: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    matrix: Counter[tuple[str, str, str, str, str]] = Counter()
    for item in parameters:
        category = str(item.get("category") or "uncategorized")
        sub = str(item.get("sub_category") or "uncategorized")
        quantity = str(item.get("quantity_kind") or "unspecified")
        ui = str(item.get("ui_element") or "unspecified")
        scope = str(item.get("retrieval_scope") or "sound")
        groups[(category, sub)].append(item)
        matrix[(category, sub, quantity, ui, scope)] += 1

    result: list[dict[str, Any]] = []
    for (category, sub), items in sorted(groups.items()):
        if len(items) < minimum_group:
            continue
        quantities = sorted({str(item.get("quantity_kind") or "unspecified") for item in items})
        elements = sorted({str(item.get("ui_element") or "unspecified") for item in items})
        scopes = sorted({str(item.get("retrieval_scope") or "sound") for item in items})
        observed = {(str(item.get("quantity_kind") or "unspecified"), str(item.get("ui_element") or "unspecified"), str(item.get("retrieval_scope") or "sound")) for item in items}
        for quantity in quantities:
            for ui in elements:
                for scope in scopes:
                    if (quantity, ui, scope) in observed:
                        continue
                    q_count = sum(str(item.get("quantity_kind") or "unspecified") == quantity for item in items)
                    ui_count = sum(str(item.get("ui_element") or "unspecified") == ui for item in items)
                    if q_count < 2 or ui_count < 2:
                        continue
                    evidence = {"category": category, "sub_category": sub, "quantity_kind": quantity, "ui_element": ui, "retrieval_scope": scope, "group_size": len(items), "quantity_count": q_count, "ui_count": ui_count}
                    confidence = min(q_count, ui_count) / max(q_count, ui_count)
                    result.append(gap("taxonomy", min(1.0, len(items) / 40.0) * confidence, confidence, evidence, f"Создай независимый параметр {scope} для категории {category}, подкатегории {sub}, типа величины {quantity} и элемента управления {ui}. Не дублируй существующие параметры.", "meta-crystal-v3-lab"))
    cells = [{"category": key[0], "sub_category": key[1], "quantity_kind": key[2], "ui_element": key[3], "retrieval_scope": key[4], "count": count} for key, count in sorted(matrix.items())]
    return result, {"cells": cells, "group_count": len(groups), "minimum_group": minimum_group}


def atom_gaps(data_root: Path, snapshot: dict[str, Any], maximum_sources: int) -> list[dict[str, Any]]:
    version_dir = data_root / "datasets" / snapshot["dataset_version"]
    atoms_path = version_dir / "atoms.json"
    if not atoms_path.exists():
        return []
    active = {item["technical_name"] for item in snapshot["parameters"]}
    result = []
    for atom in read_json(atoms_path):
        sources = sorted({str(name) for name in atom.get("source_parameters", []) if str(name) in active})
        if len(sources) > maximum_sources:
            continue
        name = str(atom.get("atom") or "").strip()
        if not name:
            continue
        evidence = {"atom": name, "role": atom.get("role"), "active_source_count": len(sources), "active_sources": sources[:12], "reported_frequency": atom.get("parameter_frequency", 0)}
        confidence = 1.0 if not sources else 0.75
        result.append(gap("atom_coverage", 1.0 / (1 + len(sources)), confidence, evidence, f"Исследуй самостоятельный звуковой параметр вокруг семантического корня {name.replace('_', ' ')}, сохраняя физически или музыкально осмысленное управление и избегая существующих названий.", "combinatorial-synthesis"))
    return result


def read_vectors(path: Path) -> np.ndarray:
    with path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
        values = np.fromfile(handle, dtype="<f4", count=count * dimensions)
    if values.size != count * dimensions:
        raise ValueError("Composite vector file is truncated")
    return values.reshape(count, dimensions)


def semantic_density(data_root: Path, parameters: list[dict[str, Any]], neighbours: int, limit: int) -> list[dict[str, Any]]:
    index_dir = data_root / "v3" / "composite-index"
    rows = read_json(index_dir / "rows.json")
    vectors = read_vectors(index_dir / "embeddings.f32")
    if len(rows) != len(vectors):
        raise ValueError("Composite rows/vector count mismatch")
    allowed = {str(item["technical_name"]) for item in parameters if str(item.get("retrieval_scope") or "sound") in {"sound", "structure"}}
    selected = [idx for idx, row in enumerate(rows) if str(row.get("technical_name")) in allowed and str(row.get("retrieval_scope") or "sound") in {"sound", "structure"}]
    if len(selected) <= neighbours:
        return []
    matrix = vectors[selected].astype(np.float32, copy=False)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    matrix = matrix / np.maximum(norms, 1e-12)
    mean_scores = np.empty(len(matrix), dtype=np.float32)
    chunk = 256
    k = min(neighbours, len(matrix) - 1)
    for start in range(0, len(matrix), chunk):
        sims = matrix[start:start + chunk] @ matrix.T
        for local, global_index in enumerate(range(start, min(start + chunk, len(matrix)))):
            sims[local, global_index] = -1.0
        top = np.partition(sims, -k, axis=1)[:, -k:]
        mean_scores[start:start + len(top)] = top.mean(axis=1)
        print(json.dumps({"event": "progress", "stage": "semantic_density", "current": min(start + chunk, len(matrix)), "total": len(matrix)}), flush=True)
    order = np.argsort(mean_scores)[:limit]
    result = []
    for position in order:
        row = rows[selected[int(position)]]
        name = str(row["technical_name"])
        evidence = {"technical_name": name, "mean_knn_similarity": round(float(mean_scores[position]), 6), "k": k, "retrieval_scope": row.get("retrieval_scope", "sound")}
        result.append(gap("semantic_density", max(0.0, 1.0 - float(mean_scores[position])), 0.65, evidence, f"Исследуй слабо представленную семантическую область вокруг {name.replace('_', ' ')}. Создай новый независимый параметр, который расширяет область, но не дублирует исходный контроль.", "meta-crystal-v3-lab"))
    return result


def graph_gaps(data_root: Path, snapshot: dict[str, Any], composite: dict[str, Any], limit: int) -> tuple[list[dict[str, Any]], str | None]:
    graph_path = data_root / "knowledge-graph" / "graph.json"
    if not graph_path.exists():
        return [], None
    graph = read_json(graph_path)
    manifest = graph.get("manifest", {})
    if manifest.get("source_snapshot_sha256") != snapshot["content_sha256"] or manifest.get("composite_index_sha256") != composite.get("cache_sha256"):
        return [], None
    nodes = {node["id"]: node for node in graph.get("nodes", [])}
    result = []
    for name in sorted(graph.get("isolated_parameters", []))[:limit]:
        node = nodes.get(f"parameter:{name}", {})
        evidence = {"technical_name": name, "signal": "no_mutual_semantic_neighbors", "knn_k": manifest.get("knn_k"), "category": node.get("category"), "sub_category": node.get("sub_category"), "retrieval_scope": node.get("retrieval_scope")}
        result.append(gap("graph", 0.7, 0.8, evidence, f"Проверь изолированную область вокруг {name.replace('_', ' ')} и исследуй независимый параметр, который осмысленно связывает её с существующей V3-таксономией без дублирования.", "meta-crystal-v3-lab"))
    return result, hashlib.sha256(graph_path.read_bytes()).hexdigest()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def build(data_root: Path, output: Path, minimum_group: int, maximum_atom_sources: int, neighbours: int, semantic_limit: int, graph_limit: int = 60) -> dict[str, Any]:
    snapshot = load_v3_snapshot(data_root)
    composite = read_json(data_root / "v3" / "composite-index" / "manifest.json")
    compatibility_errors = []
    if str(composite.get("dataset_version")) != str(snapshot["dataset_version"]):
        compatibility_errors.append("dataset version")
    if str(composite.get("excluded_sha256")) != str(snapshot["excluded_sha256"]):
        compatibility_errors.append("excluded registry")
    if int(composite.get("parameter_count", -1)) != int(snapshot["parameter_count"]):
        compatibility_errors.append(
            f"parameter count ({composite.get('parameter_count')} indexed, {snapshot['parameter_count']} active)"
        )
    if compatibility_errors:
        raise RuntimeError(
            "V3 composite index is stale: " + ", ".join(compatibility_errors)
            + ". Rebuild the composite index before White Space Discovery."
        )
    taxonomy, matrix = taxonomy_gaps(snapshot["parameters"], minimum_group)
    atoms = atom_gaps(data_root, snapshot, maximum_atom_sources)
    semantic = semantic_density(data_root, snapshot["parameters"], neighbours, semantic_limit)
    graph, graph_sha = graph_gaps(data_root, snapshot, composite, graph_limit)
    gaps = sorted([*taxonomy, *atoms, *semantic, *graph], key=lambda item: (-item["priority"], -item["confidence"], item["gap_id"]))
    report = {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(), "status": "ready",
        "source_snapshot_sha256": snapshot["content_sha256"], "dataset_version": snapshot["dataset_version"],
        "excluded_sha256": snapshot["excluded_sha256"], "parameter_count": snapshot["parameter_count"],
        "composite_index_sha256": composite.get("cache_sha256"), "embedding_model": composite.get("model"),
        "dimensions": composite.get("dimensions"), "settings": {"minimum_group": minimum_group, "maximum_atom_sources": maximum_atom_sources, "knn_k": neighbours, "semantic_limit": semantic_limit},
        "knowledge_graph_sha256": graph_sha,
        "summary": {"gap_count": len(gaps), "taxonomy": len(taxonomy), "atom_coverage": len(atoms), "semantic_density": len(semantic), "graph": len(graph)},
        "taxonomy_matrix": matrix, "gaps": gaps,
    }
    atomic_json(output, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--minimum-group", type=int, default=8)
    parser.add_argument("--maximum-atom-sources", type=int, default=1)
    parser.add_argument("--knn-k", type=int, default=12)
    parser.add_argument("--semantic-limit", type=int, default=60)
    parser.add_argument("--graph-limit", type=int, default=60)
    args = parser.parse_args()
    data_root = args.data_root.resolve()
    output = args.output.resolve() if args.output else data_root / "white-space" / "report.json"
    report = build(data_root, output, max(4, args.minimum_group), max(0, args.maximum_atom_sources), max(3, args.knn_k), max(1, args.semantic_limit), max(0, args.graph_limit))
    print(json.dumps({"event": "completed", "path": str(output), "summary": report["summary"]}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
