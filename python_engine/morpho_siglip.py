#!/usr/bin/env python3
"""CPU-only SigLIP2 runtime diagnostics for Morpho-Acoustic RAG."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from v3_snapshot import DEFAULT_DATA_ROOT, load_v3_snapshot

MODEL_ID = "google/siglip2-base-patch16-224"
MODEL_REVISION = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"
DEFAULT_MODEL_PATH = Path(os.environ.get("MMSS_SIGLIP_MODEL", "D:/hfmodels/siglip2-base-patch16-224"))
DEFAULT_INDEX_DIR = DEFAULT_DATA_ROOT / "morpho-siglip"
VALUE_CACHE_VERSION = "morpho-values-v1"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def retrieval_text(parameter: dict[str, object]) -> str:
    name = str(parameter.get("technical_name") or "")
    values = [name.replace("_", " "), parameter.get("name_ru"), parameter.get("description_en"), parameter.get("description_ru"), parameter.get("category"), parameter.get("sub_category"), parameter.get("quantity_kind"), parameter.get("domain")]
    values.extend(parameter.get("axes") or [])
    values.extend(parameter.get("semantic_keywords") or [])
    values.extend(parameter.get("lyria_prompt_tags") or [])
    return " | ".join(str(value).strip() for value in values if value is not None and str(value).strip())


def text_hash(text: str) -> str:
    return hashlib.sha256((MODEL_REVISION + "\0" + text).encode("utf-8")).hexdigest()


def eligible(parameter: dict[str, object]) -> bool:
    if str(parameter.get("retrieval_scope") or "sound") not in {"sound", "structure"}:
        return False
    name = str(parameter.get("technical_name") or "").lower()
    blocked_prefixes = ("validation_json_", "provenance_", "descriptive_metadata_", "classification_", "semantic_concept_", "smart_contract_", "licensing_", "contract_address_")
    return not name.startswith(blocked_prefixes) and "ownership_proof" not in name


def write_vectors(path: Path, vectors: np.ndarray) -> None:
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    with temporary.open("wb") as handle:
        handle.write(struct.pack("<II", len(vectors), vectors.shape[1]))
        vectors.astype("<f4", copy=False).tofile(handle)
    temporary.replace(path)


def read_vectors(path: Path) -> np.ndarray:
    with path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
        values = np.fromfile(handle, dtype="<f4", count=count * dimensions)
    if values.size != count * dimensions:
        raise ValueError("Morpho vector file is truncated")
    return values.reshape(count, dimensions)


def load_runtime(model_path: Path):
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    import torch
    from transformers import AutoModel, AutoProcessor
    processor = AutoProcessor.from_pretrained(model_path, local_files_only=True)
    model = AutoModel.from_pretrained(model_path, local_files_only=True, dtype=torch.float32).to("cpu").eval()
    return torch, processor, model


def pooled(output, torch):
    return output if isinstance(output, torch.Tensor) else output.pooler_output


def embed_texts_cached(texts: list[str], torch, processor, model, cache_dir: Path, batch_size: int = 64) -> np.ndarray:
    cache_dir.mkdir(parents=True, exist_ok=True)
    hashes = [hashlib.sha256((MODEL_REVISION + "\0" + VALUE_CACHE_VERSION + "\0" + text).encode("utf-8")).hexdigest() for text in texts]
    vectors: list[np.ndarray | None] = []
    pending: list[int] = []
    for index, value in enumerate(hashes):
        path = cache_dir / f"{value}.f32"
        vector = np.fromfile(path, dtype="<f4") if path.exists() else np.asarray([], dtype=np.float32)
        if vector.size == 768: vectors.append(vector)
        else: vectors.append(None); pending.append(index)
    for start in range(0, len(pending), batch_size):
        indexes = pending[start:start + batch_size]
        inputs = processor(text=[texts[index] for index in indexes], padding="max_length", truncation=True, return_tensors="pt")
        with torch.inference_mode():
            output = pooled(model.get_text_features(**inputs), torch)
            output = torch.nn.functional.normalize(output.float(), dim=-1).cpu().numpy().astype(np.float32)
        for index, vector in zip(indexes, output):
            vectors[index] = vector
            path = cache_dir / f"{hashes[index]}.f32"; temporary = path.with_suffix(f".f32.{os.getpid()}.tmp")
            vector.astype("<f4", copy=False).tofile(temporary); temporary.replace(path)
    return np.stack(vectors).astype(np.float32)  # type: ignore[arg-type]


def weighted_position(scores: np.ndarray, levels: np.ndarray) -> tuple[float, float]:
    order = np.argsort(-scores); margin = float(scores[order[0]] - scores[order[1]]) if len(scores) > 1 else 1.0
    weights = np.exp((scores - float(scores.max())) * 40.0); weights /= max(float(weights.sum()), 1e-12)
    return float(weights @ levels), margin


def expressive_position(scores: np.ndarray, levels: np.ndarray) -> tuple[float, float]:
    """Choose the strongest semantic level without averaging unrelated anchors toward 0.5."""
    order = np.argsort(levels); ordered_scores, ordered_levels = scores[order], levels[order]
    winner = int(np.argmax(ordered_scores)); ranked = np.argsort(-ordered_scores)
    margin = float(ordered_scores[ranked[0]] - ordered_scores[ranked[1]]) if len(ranked) > 1 else 1.0
    if winner == 0 or winner == len(ordered_levels) - 1:
        return float(ordered_levels[winner]), margin
    left, center, right = (float(ordered_scores[index]) for index in (winner - 1, winner, winner + 1))
    denominator = left - 2.0 * center + right
    offset = 0.0 if abs(denominator) < 1e-12 else max(-0.5, min(0.5, 0.5 * (left - right) / denominator))
    step = float(ordered_levels[winner + 1] - ordered_levels[winner])
    return float(max(0.0, min(1.0, ordered_levels[winner] + offset * step))), margin


def default_position(parameter: dict[str, object]) -> float:
    try:
        minimum, maximum, value = float(parameter.get("min_value", 0)), float(parameter.get("max_value", 1)), float(parameter.get("default", 0))
        return 0.5 if maximum <= minimum else max(0.0, min(1.0, (value - minimum) / (maximum - minimum)))
    except (TypeError, ValueError):
        return 0.5


def numeric_value(parameter: dict[str, object], position: float) -> float | int:
    minimum, maximum = float(parameter.get("min_value", 0)), float(parameter.get("max_value", 1))
    value = minimum + max(0.0, min(1.0, position)) * (maximum - minimum)
    step = float(parameter.get("step") or 0)
    if step > 0: value = minimum + round((value - minimum) / step) * step
    value = max(minimum, min(maximum, value))
    integral = all(isinstance(parameter.get(key), int) and not isinstance(parameter.get(key), bool) for key in ("min_value", "max_value", "step"))
    return int(round(value)) if integral else round(value, 8)


def load_value_sources(data_root: Path):
    base = data_root / "v3"
    snapshot = load_v3_snapshot(data_root)
    parameters = {str(item["technical_name"]): item for item in snapshot["parameters"]}
    range_manifest = read_json(base / "value-anchors" / "manifest.json")
    select_manifest = read_json(base / "value-anchors" / "select-options.json")
    axes = read_json(base / "anchoring" / "axes.json").get("axes", [])
    polarity = read_json(base / "anchoring" / "polarity_matrix.json")
    relations = read_json(base / "relations" / "manifest.json").get("relations", [])
    ranges: dict[str, list[dict[str, object]]] = defaultdict(list); selects: dict[str, list[dict[str, object]]] = defaultdict(list)
    level_phrases = {0.0: "minimum, absent or extremely low", 0.25: "low and restrained", 0.5: "moderate and balanced", 0.75: "high and pronounced", 1.0: "maximum, extreme and dominant"}
    for name, rows in range_manifest.get("parameters", {}).items():
        parameter = parameters.get(str(name))
        if not parameter: continue
        context = retrieval_text(parameter)
        for row in rows:
            level = float(row.get("level", 0.5)); label = str(row.get("label") or level_phrases.get(level, "scaled intensity"))
            ranges[str(name)].append({**row, "technical_name": name, "text": f"{context}; visual and acoustic expression is {label}: {level_phrases.get(level, label)}"})
    for name, rows in select_manifest.get("parameters", {}).items():
        parameter = parameters.get(str(name))
        if not parameter: continue
        context = retrieval_text(parameter); aliases = parameter.get("option_aliases") or {}
        for row in rows:
            option = str(row.get("option") or ""); option_aliases = ", ".join(str(item) for item in aliases.get(option, [])) if isinstance(aliases, dict) else ""
            selects[str(name)].append({**row, "technical_name": name, "text": f"{context}; selected mode or option: {option.replace('_', ' ')}; {option_aliases}"})
    axis_rows = []
    for axis in axes:
        for anchor in axis.get("anchors", []):
            text = " | ".join(str(item.get("text")) for item in anchor.get("paraphrases", []) if item.get("text"))
            axis_rows.append({"axis": axis.get("id"), "level": anchor.get("target_value"), "text": text})
    return ranges, selects, axis_rows, polarity, relations


def anchor_values(parameters: list[dict[str, object]], image_vector: np.ndarray, mode: str, data_root: Path, cache_dir: Path, torch, processor, model) -> dict[str, dict[str, object]]:
    if mode == "default": return {}
    ranges, selects, axis_rows, polarity, relations = load_value_sources(data_root)
    requested: list[tuple[str, str, float | str, str]] = []
    selected_names = {str(item["technical_name"]) for item in parameters}
    for parameter in parameters:
        name, ui = str(parameter["technical_name"]), str(parameter.get("ui_element") or "")
        if ui == "Range":
            for row in sorted(ranges.get(name, []), key=lambda item: float(item.get("level", 0))): requested.append((name, "range", float(row.get("level", 0)), str(row.get("text") or "")))
        elif ui == "Select":
            for row in selects.get(name, []): requested.append((name, "select", str(row.get("option") or ""), str(row.get("text") or "")))
        elif ui == "Toggle":
            context = retrieval_text(parameter); requested.extend([(name, "toggle", "0", f"{context}; disabled, absent, inactive, switched off"), (name, "toggle", "1", f"{context}; enabled, present, active, switched on")])
    relevant_axes = {str(axis) for item in parameters for axis in (item.get("axes") or [])}
    for row in axis_rows:
        if str(row["axis"]) in relevant_axes: requested.append((str(row["axis"]), "axis", float(row["level"]), str(row["text"])))
    for relation in relations: requested.append((str(relation.get("id")), "relation", 0.0, str(relation.get("text") or "")))
    if not requested: return {}
    matrix = embed_texts_cached([item[3] for item in requested], torch, processor, model, cache_dir)
    scores = matrix @ image_vector
    grouped: dict[tuple[str, str], list[tuple[float | str, float]]] = defaultdict(list)
    for item, score in zip(requested, scores): grouped[(item[0], item[1])].append((item[2], float(score)))
    axis_positions: dict[str, tuple[float, float]] = {}
    for axis in relevant_axes:
        entries = grouped.get((axis, "axis"), [])
        if entries:
            scorer = expressive_position if mode == "expressive" else weighted_position
            axis_positions[axis] = scorer(np.asarray([score for _, score in entries]), np.asarray([float(level) for level, _ in entries]))
    relation_adjustments: dict[str, float] = defaultdict(float); relation_hits: dict[str, list[str]] = defaultdict(list)
    relation_scores = [(relation, grouped.get((str(relation.get("id")), "relation"), [(0, -1.0)])[0][1]) for relation in relations]
    relation_scores.sort(key=lambda item: -item[1])
    if len(relation_scores) > 1 and relation_scores[0][1] - relation_scores[1][1] >= 0.001:
        for relation, _score in relation_scores[:2]:
            relation_id = str(relation.get("id")); amount = 0.08 if mode == "expressive" else 0.03
            for side in ("a", "b"):
                direction = float(relation.get(f"direction_{side}") or 0)
                for name in relation.get(f"params_{side}", []):
                    if name in selected_names: relation_adjustments[name] += direction * amount; relation_hits[name].append(relation_id)
    result: dict[str, dict[str, object]] = {}
    parameter_by_name = {str(item["technical_name"]): item for item in parameters}
    for name, parameter in parameter_by_name.items():
        ui = str(parameter.get("ui_element") or "")
        if ui == "Range":
            entries = grouped.get((name, "range"), [])
            if len(entries) < 2: continue
            scorer = expressive_position if mode == "expressive" else weighted_position
            direct, margin = scorer(np.asarray([score for _, score in entries]), np.asarray([float(level) for level, _ in entries]))
            axis_values = []
            kind = str(parameter.get("quantity_kind") or "amount"); override = parameter.get("polarity_override")
            for axis in parameter.get("axes") or []:
                if axis not in axis_positions: continue
                sign = float(polarity.get(str(axis), {}).get(kind, 0))
                if isinstance(override, (int, float)) and override != 0: sign *= float(override)
                if sign: axis_values.append(axis_positions[str(axis)][0] if sign > 0 else 1.0 - axis_positions[str(axis)][0])
            target = direct if not axis_values else direct * 0.8 + float(np.mean(axis_values)) * 0.2
            target = max(0.0, min(1.0, target + relation_adjustments[name]))
            strength = 1.0 if mode == "expressive" else 0.35
            position = default_position(parameter) + (target - default_position(parameter)) * strength
            result[name] = {"value": numeric_value(parameter, position), "source": "morpho_value_anchor", "detail": f"Morpho Range anchors · mode {mode} · target {target:.3f} · margin {margin:.4f} · axes {len(axis_values)} · relations {','.join(relation_hits[name]) or 'none'}", "value_confidence": min(1.0, max(0.0, margin / 0.01)), "anchor_target": target}
        elif ui in {"Select", "Toggle"}:
            entries = grouped.get((name, ui.lower()), [])
            if len(entries) < 2: continue
            ordered = sorted(entries, key=lambda item: -item[1]); margin = ordered[0][1] - ordered[1][1]
            threshold = 0.0 if mode == "expressive" else 0.006
            if margin < threshold: continue
            value: object = ordered[0][0]
            if ui == "Toggle": value = numeric_value(parameter, float(value))
            result[name] = {"value": value, "source": "morpho_value_anchor", "detail": f"Morpho {ui} anchors · mode {mode} · margin {margin:.4f}", "value_confidence": min(1.0, margin / 0.01), "anchor_target": value}
    return result


def build_index(data_root: Path, index_dir: Path, model_path: Path, batch_size: int) -> dict[str, object]:
    snapshot = load_v3_snapshot(data_root)
    parameters = [item for item in snapshot["parameters"] if eligible(item)]
    rows = [{"technical_name": item["technical_name"], "text": retrieval_text(item)} for item in parameters]
    old_rows_path, old_vectors_path = index_dir / "rows.json", index_dir / "embeddings.f32"
    old_vectors_by_hash: dict[str, np.ndarray] = {}
    cache_dir = index_dir.parent / "morpho-siglip-row-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    if old_rows_path.exists() and old_vectors_path.exists():
        old_rows, old_vectors = read_json(old_rows_path), read_vectors(old_vectors_path)
        if len(old_rows) == len(old_vectors):
            for row, vector in zip(old_rows, old_vectors):
                old_vectors_by_hash[str(row.get("text_sha256"))] = vector
    hashes = [text_hash(row["text"]) for row in rows]
    for value in hashes:
        cached = cache_dir / f"{value}.f32"
        if value not in old_vectors_by_hash and cached.exists():
            vector = np.fromfile(cached, dtype="<f4")
            if vector.size == 768:
                old_vectors_by_hash[value] = vector
    pending = [index for index, value in enumerate(hashes) if value not in old_vectors_by_hash]
    vectors: list[np.ndarray | None] = [old_vectors_by_hash.get(value) for value in hashes]
    encoded = 0
    if pending:
        torch, processor, model = load_runtime(model_path)
        for start in range(0, len(pending), batch_size):
            indexes = pending[start:start + batch_size]
            inputs = processor(text=[rows[index]["text"] for index in indexes], padding="max_length", truncation=True, return_tensors="pt")
            with torch.inference_mode():
                output = pooled(model.get_text_features(**inputs), torch)
                output = torch.nn.functional.normalize(output.float(), dim=-1).cpu().numpy().astype(np.float32)
            for index, vector in zip(indexes, output):
                vectors[index] = vector
                cached = cache_dir / f"{hashes[index]}.f32"
                temporary = cached.with_suffix(f".f32.{os.getpid()}.tmp")
                vector.astype("<f4", copy=False).tofile(temporary)
                temporary.replace(cached)
            encoded += len(indexes)
            print(json.dumps({"event": "progress", "stage": "text_embeddings", "current": encoded, "total": len(pending)}), flush=True)
    if any(vector is None for vector in vectors):
        raise RuntimeError("Some Morpho vectors were not built")
    matrix = np.stack(vectors).astype(np.float32)  # type: ignore[arg-type]
    staging = index_dir.with_name(f"{index_dir.name}.building")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    write_vectors(staging / "embeddings.f32", matrix)
    stored_rows = [{"technical_name": row["technical_name"], "text_sha256": value} for row, value in zip(rows, hashes)]
    atomic_json(staging / "rows.json", stored_rows)
    manifest = {"schema_version": 1, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "model_id": MODEL_ID, "model_revision": MODEL_REVISION, "model_path": str(model_path), "device": "cpu", "dtype": "float32", "normalization": "l2", "parameter_count": len(rows), "dimensions": int(matrix.shape[1]), "source_snapshot_sha256": snapshot["content_sha256"], "dataset_version": snapshot["dataset_version"], "excluded_sha256": snapshot["excluded_sha256"], "encoded": encoded, "reused": len(rows) - encoded, "scopes": ["sound", "structure"]}
    atomic_json(staging / "manifest.json", manifest)
    backup = index_dir.with_name(f"{index_dir.name}.previous")
    shutil.rmtree(backup, ignore_errors=True)
    if index_dir.exists(): index_dir.replace(backup)
    try:
        staging.replace(index_dir)
    except Exception:
        if backup.exists() and not index_dir.exists(): backup.replace(index_dir)
        raise
    shutil.rmtree(backup, ignore_errors=True)
    return manifest


def index_status(data_root: Path, index_dir: Path) -> dict[str, object]:
    manifest_path = index_dir / "manifest.json"
    if not manifest_path.exists():
        return {"ready": False, "status": "not_built", "model_id": MODEL_ID}
    manifest = read_json(manifest_path)
    snapshot = load_v3_snapshot(data_root)
    stale = []
    if manifest.get("source_snapshot_sha256") != snapshot["content_sha256"]: stale.append("V3 dataset changed")
    if manifest.get("excluded_sha256") != snapshot["excluded_sha256"]: stale.append("excluded registry changed")
    if manifest.get("model_revision") != MODEL_REVISION: stale.append("model revision changed")
    return {"ready": not stale, "status": "stale" if stale else "ready", "stale_reasons": stale, **manifest}


def active_parameter(parameter: dict[str, object], similarity: float, anchored: dict[str, object] | None = None) -> dict[str, object]:
    default = parameter.get("default", "")
    if isinstance(default, list): default = ", ".join(str(item) for item in default)
    allowed = ("technical_name", "name_ru", "description_en", "description_ru", "category", "sub_category", "ui_element", "min_value", "max_value", "step", "unit", "options", "min_length", "max_length", "domain", "quantity_kind")
    result = {key: parameter[key] for key in allowed if key in parameter}
    value = anchored.get("value", default) if anchored else default
    return {**result, "default": default, "suggested_value": value, "current_value": value, "before": default, "source": anchored.get("source", "default") if anchored else "default", "detail": anchored.get("detail") if anchored else "SigLIP2 image similarity; value remains at V3 default", "value_confidence": anchored.get("value_confidence", 0.0) if anchored else 0.0, "anchor_target": anchored.get("anchor_target") if anchored else None, "similarity": round(similarity, 7), "axes": parameter.get("axes") or [], "lyria_prompt_tags": parameter.get("lyria_prompt_tags") or [], "semantic_keywords": parameter.get("semantic_keywords") or [], "retrieval_scope": parameter.get("retrieval_scope") or "sound"}


def search_image(image_path: Path, data_root: Path, index_dir: Path, model_path: Path, top_k: int, value_mode: str = "expressive") -> dict[str, object]:
    status = index_status(data_root, index_dir)
    if not status.get("ready"):
        raise RuntimeError("Morpho index is not ready: " + "; ".join(status.get("stale_reasons", [])))
    rows, vectors = read_json(index_dir / "rows.json"), read_vectors(index_dir / "embeddings.f32")
    if len(rows) != len(vectors) or vectors.shape[1] != int(status["dimensions"]):
        raise RuntimeError("Morpho index row/vector mismatch")
    torch, processor, model = load_runtime(model_path)
    from PIL import Image
    with Image.open(image_path) as source:
        image = source.convert("RGB")
        inputs = processor(images=[image], return_tensors="pt")
    with torch.inference_mode():
        query = pooled(model.get_image_features(**inputs), torch)
        query = torch.nn.functional.normalize(query.float(), dim=-1).cpu().numpy()[0]
    scores = vectors @ query
    count = min(max(1, top_k), len(rows))
    order = np.argsort(-scores)[:count]
    snapshot = load_v3_snapshot(data_root)
    parameters = {item["technical_name"]: item for item in snapshot["parameters"]}
    ranked_parameters = [parameters[rows[int(index)]["technical_name"]] for index in order]
    anchors = anchor_values(ranked_parameters, query, value_mode, data_root, index_dir.parent / "morpho-siglip-value-cache", torch, processor, model)
    results = [active_parameter(parameter, float(scores[int(index)]), anchors.get(str(parameter["technical_name"]))) for parameter, index in zip(ranked_parameters, order)]
    return {"results": results, "top_k": count, "value_mode": value_mode, "anchored_count": len(anchors), "index": status, "image": {"name": image_path.name}}


def smoke(model_path: Path) -> dict[str, object]:
    from PIL import Image
    started = time.perf_counter()
    torch, processor, model = load_runtime(model_path)
    loaded = time.perf_counter()
    image = Image.new("RGB", (224, 224), color=(25, 75, 140))
    text_inputs = processor(text=["a dark resonant blue acoustic texture"], padding="max_length", return_tensors="pt")
    image_inputs = processor(images=[image], return_tensors="pt")
    with torch.inference_mode():
        text = pooled(model.get_text_features(**text_inputs), torch)
        visual = pooled(model.get_image_features(**image_inputs), torch)
        text = torch.nn.functional.normalize(text.float(), dim=-1)
        visual = torch.nn.functional.normalize(visual.float(), dim=-1)
        similarity = float((text @ visual.T)[0, 0])
    finished = time.perf_counter()
    try:
        import psutil
        rss_mb = round(psutil.Process().memory_info().rss / 1024 / 1024, 1)
    except ImportError:
        rss_mb = None
    return {
        "status": "ok", "model_id": MODEL_ID, "revision": MODEL_REVISION,
        "model_path": str(model_path), "device": "cpu", "torch": torch.__version__,
        "dimensions": int(text.shape[-1]), "load_seconds": round(loaded - started, 3),
        "inference_seconds": round(finished - loaded, 3), "rss_mb": rss_mb,
        "sample_cosine_similarity": round(similarity, 7),
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["smoke", "status", "build-index", "search"])
    parser.add_argument("--model-path", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--index-dir", type=Path, default=DEFAULT_INDEX_DIR)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--image", type=Path)
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--value-mode", choices=["expressive", "conservative", "default"], default="expressive")
    args = parser.parse_args()
    if args.command == "smoke":
        print(json.dumps(smoke(args.model_path.resolve()), ensure_ascii=False), flush=True)
    elif args.command == "status":
        print(json.dumps(index_status(args.data_root.resolve(), args.index_dir.resolve()), ensure_ascii=False), flush=True)
    elif args.command == "build-index":
        print(json.dumps({"event": "completed", **build_index(args.data_root.resolve(), args.index_dir.resolve(), args.model_path.resolve(), max(1, min(128, args.batch_size)))}, ensure_ascii=False), flush=True)
    elif args.command == "search":
        if not args.image: parser.error("--image is required for search")
        print(json.dumps(search_image(args.image.resolve(), args.data_root.resolve(), args.index_dir.resolve(), args.model_path.resolve(), max(1, min(100, args.top_k)), args.value_mode), ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
