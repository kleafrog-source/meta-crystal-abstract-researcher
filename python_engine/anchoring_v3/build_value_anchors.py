#!/usr/bin/env python3
"""Build incremental Qwen value anchors for V3 Range and Select controls."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import struct
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python_engine"))
from parameter_registry import filter_parameters, registry_sha256  # noqa: E402
DEFAULT_DATASET = ROOT / "data" / "combinatorial-genesis" / "v3" / "dataset.json"
DEFAULT_OUTPUT = ROOT / "data" / "combinatorial-genesis" / "v3" / "value-anchors"
LEVELS = ((0.0, "minimum"), (0.25, "low"), (0.5, "default"), (0.75, "high"), (1.0, "maximum"))
LOW_MARKER = re.compile(r"\b(?:lower|low|minimum|minimal) values?\b|\bнизкие значения\b", re.I)
HIGH_MARKER = re.compile(r"\b(?:higher|high|maximum|maximal) values?\b|\bвысокие значения\b", re.I)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def natural_name(parameter: dict) -> str:
    return str(parameter.get("technical_name") or "").replace("_", " ")


def compact(value: Any, limit: int = 420) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" ,.;:-")
    return text[:limit].rstrip(" ,.;:-")


def directional_clauses(parameter: dict) -> tuple[str, str]:
    description = compact(parameter.get("description_en") or parameter.get("description_ru"), 900)
    low_match = LOW_MARKER.search(description)
    high_match = HIGH_MARKER.search(description)
    low_clause = ""
    high_clause = ""
    if low_match:
        end = high_match.start() if high_match and high_match.start() > low_match.end() else len(description)
        low_clause = compact(description[low_match.end():end])
    if high_match:
        end = low_match.start() if low_match and low_match.start() > high_match.end() else len(description)
        high_clause = compact(description[high_match.end():end])
    keywords = [compact(item, 80) for item in (parameter.get("semantic_keywords") or []) if compact(item, 80)]
    fallback = ", ".join(keywords[:5]) or compact(parameter.get("quantity_kind") or parameter.get("unit") or "control amount")
    return low_clause or f"reduced {fallback}", high_clause or f"increased {fallback}"


def range_anchor_text(parameter: dict, level: float, label: str) -> str:
    name = natural_name(parameter)
    low_clause, high_clause = directional_clauses(parameter)
    context = ", ".join(compact(item, 70) for item in (parameter.get("semantic_keywords") or [])[:5])
    base = f"{name} at {label} level ({level:.2f})"
    if level == 0.0:
        state = f"fully minimized, extremely low; sound result: {low_clause}"
    elif level == 0.25:
        state = f"low, reduced; sound result: {low_clause}"
    elif level == 0.5:
        state = f"neutral default midpoint; balanced between {low_clause} and {high_clause}"
    elif level == 0.75:
        state = f"high, increased; sound result: {high_clause}"
    else:
        state = f"fully maximized, extremely high; sound result: {high_clause}"
    details = "; ".join(part for part in (
        compact(parameter.get("category")), compact(parameter.get("sub_category")),
        compact(parameter.get("quantity_kind")), compact(parameter.get("unit")), context,
    ) if part)
    return f"{base}; {state}" + (f"; context: {details}" if details else "")


def select_option_text(parameter: dict, option: Any) -> str:
    option_text = compact(option, 160)
    context = ", ".join(compact(item, 70) for item in (parameter.get("semantic_keywords") or [])[:5])
    description = compact(parameter.get("description_en") or parameter.get("description_ru"), 360)
    details = "; ".join(part for part in (
        compact(parameter.get("category")), compact(parameter.get("sub_category")), context, description,
    ) if part)
    return f"{natural_name(parameter)} set to {option_text}; {option_text} mode or option" + (f"; context: {details}" if details else "")


def build_rows(dataset: list[dict]) -> tuple[list[dict], list[dict]]:
    range_rows: list[dict] = []
    select_rows: list[dict] = []
    for parameter in sorted(dataset, key=lambda item: str(item.get("technical_name") or "")):
        name = str(parameter.get("technical_name") or "")
        if parameter.get("ui_element") == "Range" and parameter.get("min_value") is not None and parameter.get("max_value") is not None:
            for level, label in LEVELS:
                text = range_anchor_text(parameter, level, label)
                range_rows.append({
                    "anchor_key": f"{name}:{level:.2f}", "technical_name": name,
                    "level": level, "label": label, "text": text,
                    "text_sha256": sha256_text(text), "row_index": len(range_rows),
                })
        if parameter.get("ui_element") == "Select":
            for option in parameter.get("options") or []:
                text = select_option_text(parameter, option)
                select_rows.append({
                    "anchor_key": f"{name}:{str(option)}", "technical_name": name,
                    "option": option, "text": text,
                    "text_sha256": sha256_text(text), "row_index": len(select_rows),
                })
    return range_rows, select_rows


def embed_batch(endpoint: str, model: str, texts: list[str], timeout: int) -> np.ndarray:
    request = urllib.request.Request(
        f"{endpoint.rstrip('/')}/api/embed",
        data=json.dumps({"model": model, "input": texts}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        vectors = json.load(response).get("embeddings")
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise RuntimeError("Ollama returned an unexpected value-anchor embedding count")
    matrix = np.asarray(vectors, dtype="<f4")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms == 0):
        raise RuntimeError("Ollama returned a zero value-anchor embedding")
    return matrix / norms


def open_binary(path: Path, count: int, dimensions: int, create: bool) -> np.memmap:
    if create:
        with path.open("wb") as handle:
            handle.write(struct.pack("<II", count, dimensions))
            handle.truncate(8 + count * dimensions * 4)
    return np.memmap(path, dtype="<f4", mode="r+", offset=8, shape=(count, dimensions))


def existing_cache(manifest_path: Path, vectors_path: Path, model: str, dimensions: int) -> tuple[dict[str, tuple[str, int]], np.memmap | None]:
    if not manifest_path.exists() or not vectors_path.exists():
        return {}, None
    manifest = read_json(manifest_path)
    if manifest.get("model") != model or manifest.get("dimensions") != dimensions:
        return {}, None
    with vectors_path.open("rb") as handle:
        count, stored_dimensions = struct.unpack("<II", handle.read(8))
    rows = manifest.get("rows") or []
    if count != len(rows) or stored_dimensions != dimensions:
        return {}, None
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", offset=8, shape=(count, dimensions))
    lookup = {str(row["anchor_key"]): (str(row["text_sha256"]), int(row["row_index"])) for row in rows}
    return lookup, vectors


def build_artifact(*, label: str, rows: list[dict], manifest_path: Path, vectors_path: Path,
                   endpoint: str, model: str, dimensions: int, batch_size: int, timeout: int) -> dict:
    specification_sha = sha256_text(json.dumps({"model": model, "rows": rows}, ensure_ascii=False, sort_keys=True))
    if manifest_path.exists() and vectors_path.exists():
        current = read_json(manifest_path)
        if current.get("cache_sha256") == specification_sha:
            print(f"[progress] stage={label} current={len(rows)} total={len(rows)} label=reused", flush=True)
            return current

    old_lookup, old_vectors = existing_cache(manifest_path, vectors_path, model, dimensions)
    building_path = vectors_path.with_suffix(vectors_path.suffix + ".building")
    state_path = manifest_path.with_suffix(manifest_path.suffix + ".building")
    completed = 0
    if state_path.exists() and building_path.exists():
        state = read_json(state_path)
        if state.get("cache_sha256") == specification_sha and state.get("dimensions") == dimensions:
            completed = int(state.get("completed") or 0)
    if completed == 0:
        vectors = open_binary(building_path, len(rows), dimensions, True)
    else:
        vectors = open_binary(building_path, len(rows), dimensions, False)

    reused = 0
    embedded = 0
    try:
        for start in range(completed, len(rows), batch_size):
            chunk = rows[start:start + batch_size]
            missing_rows: list[dict] = []
            for row in chunk:
                cached = old_lookup.get(str(row["anchor_key"]))
                if cached and cached[0] == row["text_sha256"] and old_vectors is not None:
                    vectors[row["row_index"]] = old_vectors[cached[1]]
                    reused += 1
                else:
                    missing_rows.append(row)
            if missing_rows:
                fresh = embed_batch(endpoint, model, [row["text"] for row in missing_rows], timeout)
                for row, vector in zip(missing_rows, fresh):
                    vectors[row["row_index"]] = vector
                embedded += len(missing_rows)
            vectors.flush()
            completed_now = start + len(chunk)
            write_json(state_path, {"cache_sha256": specification_sha, "dimensions": dimensions, "completed": completed_now})
            print(f"[progress] stage={label} current={completed_now} total={len(rows)} label=embedding", flush=True)
    finally:
        if old_vectors is not None:
            old_vectors._mmap.close()
        vectors._mmap.close()

    os.replace(building_path, vectors_path)
    state_path.unlink(missing_ok=True)
    parameters: dict[str, list[dict]] = {}
    for row in rows:
        entry = {key: row[key] for key in ("row_index", "text_sha256")}
        if "level" in row:
            entry.update({"level": row["level"], "label": row["label"]})
        else:
            entry["option"] = row["option"]
        parameters.setdefault(row["technical_name"], []).append(entry)
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": specification_sha, "model": model, "dimensions": dimensions,
        "count": len(rows), "parameter_count": len(parameters), "reused": reused,
        "embedded": embedded, "vectors_file": vectors_path.name,
        "parameters": parameters, "rows": rows,
    }
    write_json(manifest_path, manifest)
    return manifest


def load_composite(dataset_root: Path) -> tuple[dict[str, int], np.memmap, int]:
    index_dir = dataset_root / "composite-index"
    manifest = read_json(index_dir / "manifest.json")
    rows = read_json(index_dir / manifest["files"]["rows"])
    vectors_path = index_dir / manifest["files"]["embeddings"]
    with vectors_path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
    if count != len(rows) or dimensions != manifest["dimensions"]:
        raise ValueError("V3 composite index header mismatch")
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", offset=8, shape=(count, dimensions))
    return {str(row["technical_name"]): index for index, row in enumerate(rows)}, vectors, dimensions


def prototype_rows(range_rows: list[dict], select_rows: list[dict]) -> tuple[list[dict], list[dict]]:
    state_texts = {
        0.0: "fully minimum extremely low closed absent reduced soft dark dry slow narrow stable clean",
        0.25: "low reduced subtle gentle restrained soft dark slow narrow stable",
        0.5: "neutral default medium balanced moderate unchanged centered",
        0.75: "high increased strong bright fast wide intense rough active",
        1.0: "fully maximum extremely high open saturated bright fast wide intense aggressive chaotic",
    }
    ranges = []
    for level, label in LEVELS:
        text = state_texts[level]
        ranges.append({
            "anchor_key": f"state:{level:.2f}", "technical_name": "__state__",
            "level": level, "label": label, "text": text,
            "text_sha256": sha256_text(text), "row_index": len(ranges),
        })
    options = []
    for option in sorted({str(row["option"]) for row in select_rows}, key=lambda value: (value.lower(), value)):
        text = f"select option {option.replace('_', ' ')}; mode {option.replace('_', ' ')}"
        options.append({
            "anchor_key": f"option:{option}", "technical_name": "__option__",
            "option": option, "text": text, "text_sha256": sha256_text(text),
            "row_index": len(options),
        })
    return ranges, options


def composed_manifest(*, rows: list[dict], output_path: Path, manifest_path: Path,
                      model: str, dimensions: int, row_by_name: dict[str, int],
                      base_vectors: np.memmap, prototype_vectors: np.memmap,
                      prototype_index: dict[str, int], prototype_key: str,
                      base_weight: float, prototype_weight: float) -> dict:
    specification_sha = sha256_text(json.dumps({
        "model": model, "rows": rows, "origin": "factorized_qwen",
        "base_weight": base_weight, "prototype_weight": prototype_weight,
    }, ensure_ascii=False, sort_keys=True))
    if manifest_path.exists() and output_path.exists():
        current = read_json(manifest_path)
        if current.get("cache_sha256") == specification_sha:
            return current
    building = output_path.with_suffix(output_path.suffix + ".building")
    vectors = open_binary(building, len(rows), dimensions, True)
    for row in rows:
        base = base_vectors[row_by_name[row["technical_name"]]]
        prototype = prototype_vectors[prototype_index[str(row[prototype_key])]]
        combined = base_weight * base + prototype_weight * prototype
        norm = float(np.linalg.norm(combined)) or 1.0
        vectors[row["row_index"]] = combined / norm
    vectors.flush()
    vectors._mmap.close()
    os.replace(building, output_path)
    parameters: dict[str, list[dict]] = {}
    for row in rows:
        entry = {"row_index": row["row_index"], "text_sha256": row["text_sha256"]}
        if "level" in row:
            entry.update({"level": row["level"], "label": row["label"]})
        else:
            entry["option"] = row["option"]
        parameters.setdefault(row["technical_name"], []).append(entry)
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": specification_sha, "model": model, "dimensions": dimensions,
        "count": len(rows), "parameter_count": len(parameters), "reused": len(rows),
        "embedded": 0, "vector_origin": "factorized_qwen",
        "base_weight": base_weight, "prototype_weight": prototype_weight,
        "vectors_file": output_path.name, "parameters": parameters, "rows": rows,
    }
    write_json(manifest_path, manifest)
    return manifest


def build_option_prototypes_from_composite(*, prototype_rows_value: list[dict], select_rows: list[dict],
                                           manifest_path: Path, vectors_path: Path, model: str,
                                           dimensions: int, row_by_name: dict[str, int],
                                           base_vectors: np.memmap) -> dict:
    specification_sha = sha256_text(json.dumps({
        "model": model, "rows": prototype_rows_value, "source": "qwen_composite_option_centroids",
        "select_rows": [(row["technical_name"], str(row["option"])) for row in select_rows],
    }, ensure_ascii=False, sort_keys=True))
    if manifest_path.exists() and vectors_path.exists():
        current = read_json(manifest_path)
        if current.get("cache_sha256") == specification_sha:
            return current
    names_by_option: dict[str, set[str]] = {}
    for row in select_rows:
        names_by_option.setdefault(str(row["option"]), set()).add(str(row["technical_name"]))
    building = vectors_path.with_suffix(vectors_path.suffix + ".building")
    vectors = open_binary(building, len(prototype_rows_value), dimensions, True)
    for row in prototype_rows_value:
        names = sorted(names_by_option[str(row["option"])])
        matrix = np.asarray([base_vectors[row_by_name[name]] for name in names], dtype=np.float32)
        centroid = np.mean(matrix, axis=0)
        vectors[row["row_index"]] = centroid / (float(np.linalg.norm(centroid)) or 1.0)
    vectors.flush()
    vectors._mmap.close()
    os.replace(building, vectors_path)
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "cache_sha256": specification_sha, "model": model, "dimensions": dimensions,
        "count": len(prototype_rows_value), "parameter_count": 1,
        "reused": len(prototype_rows_value), "embedded": 0,
        "vector_origin": "qwen_composite_option_centroids", "vectors_file": vectors_path.name,
        "parameters": {"__option__": [
            {"row_index": row["row_index"], "text_sha256": row["text_sha256"], "option": row["option"]}
            for row in prototype_rows_value
        ]},
        "rows": prototype_rows_value,
    }
    write_json(manifest_path, manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--endpoint", default="http://localhost:11434")
    parser.add_argument("--model", default="qwen3-embedding:4b")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--timeout", type=int, default=1200)
    parser.add_argument("--direct", action="store_true", help="Embed every complete anchor text instead of factorized Qwen vectors")
    args = parser.parse_args()
    data_root = ROOT / "data" / "combinatorial-genesis"
    dataset = filter_parameters(read_json(args.dataset), data_root)
    range_rows, select_rows = build_rows(dataset)
    args.output.mkdir(parents=True, exist_ok=True)
    row_by_name, base_vectors, dimensions = load_composite(args.dataset.parent)
    if args.direct:
        range_manifest = build_artifact(
            label="range_value_anchors", rows=range_rows,
            manifest_path=args.output / "manifest.json", vectors_path=args.output / "embeddings.f32",
            endpoint=args.endpoint, model=args.model, dimensions=dimensions,
            batch_size=max(1, args.batch_size), timeout=args.timeout,
        )
        select_manifest = build_artifact(
            label="select_option_anchors", rows=select_rows,
            manifest_path=args.output / "select-options.json", vectors_path=args.output / "select-options.f32",
            endpoint=args.endpoint, model=args.model, dimensions=dimensions,
            batch_size=max(1, args.batch_size), timeout=args.timeout,
        )
    else:
        range_prototypes, option_prototypes = prototype_rows(range_rows, select_rows)
        range_prototype_manifest = build_artifact(
            label="range_state_prototypes", rows=range_prototypes,
            manifest_path=args.output / "range-prototypes.json", vectors_path=args.output / "range-prototypes.f32",
            endpoint=args.endpoint, model=args.model, dimensions=dimensions,
            batch_size=max(1, args.batch_size), timeout=args.timeout,
        )
        option_prototype_manifest = build_option_prototypes_from_composite(
            prototype_rows_value=option_prototypes, select_rows=select_rows,
            manifest_path=args.output / "option-prototypes.json",
            vectors_path=args.output / "option-prototypes.f32", model=args.model,
            dimensions=dimensions, row_by_name=row_by_name, base_vectors=base_vectors,
        )
        range_prototype_vectors = np.memmap(
            args.output / range_prototype_manifest["vectors_file"], dtype="<f4", mode="r", offset=8,
            shape=(range_prototype_manifest["count"], dimensions),
        )
        option_prototype_vectors = np.memmap(
            args.output / option_prototype_manifest["vectors_file"], dtype="<f4", mode="r", offset=8,
            shape=(option_prototype_manifest["count"], dimensions),
        )
        range_manifest = composed_manifest(
            rows=range_rows, output_path=args.output / "embeddings.f32",
            manifest_path=args.output / "manifest.json", model=args.model, dimensions=dimensions,
            row_by_name=row_by_name, base_vectors=base_vectors,
            prototype_vectors=range_prototype_vectors,
            prototype_index={str(row["level"]): row["row_index"] for row in range_prototypes},
            prototype_key="level", base_weight=0.82, prototype_weight=0.38,
        )
        select_manifest = composed_manifest(
            rows=select_rows, output_path=args.output / "select-options.f32",
            manifest_path=args.output / "select-options.json", model=args.model, dimensions=dimensions,
            row_by_name=row_by_name, base_vectors=base_vectors,
            prototype_vectors=option_prototype_vectors,
            prototype_index={str(row["option"]): row["row_index"] for row in option_prototypes},
            prototype_key="option", base_weight=0.78, prototype_weight=0.48,
        )
        range_prototype_vectors._mmap.close()
        option_prototype_vectors._mmap.close()
    base_vectors._mmap.close()
    excluded_sha = registry_sha256(data_root)
    range_manifest["excluded_sha256"] = excluded_sha
    select_manifest["excluded_sha256"] = excluded_sha
    write_json(args.output / "manifest.json", range_manifest)
    write_json(args.output / "select-options.json", select_manifest)
    print(json.dumps({
        "model": args.model, "dimensions": dimensions,
        "range_count": range_manifest["count"], "range_parameters": range_manifest["parameter_count"],
        "select_count": select_manifest["count"], "select_parameters": select_manifest["parameter_count"],
    }, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
