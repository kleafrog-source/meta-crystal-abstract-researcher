#!/usr/bin/env python3
"""Incremental LAION-CLAP text index and cross-modal audio search for V3 parameters."""

from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from parameter_registry import excluded_names, read_registry, registry_sha256
from vector_cache import content_key, read_vector, sha256_file, write_vector

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"
INDEX_DIR = DATA_ROOT / "audio-clap-index"
INDEX_PATH = INDEX_DIR / "index.json"
STATUS_PATH = INDEX_DIR / "status.json"
SEARCH_CACHE_DIR = INDEX_DIR / "search-cache"
QUERY_VECTOR_CACHE_DIR = INDEX_DIR / "query-vector-cache"
SEARCH_CACHE_VERSION = "clap-ranking-matrix-v1"
QUERY_VECTOR_VERSION = "clap-audio-query-v1"
MODEL_NAME = os.environ.get("CLAP_MODEL", "laion/clap-htsat-fused")
DEVICE = os.environ.get("CLAP_DEVICE", "cpu")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_v3_parameters() -> list[dict[str, Any]]:
    latest = _read_json(DATA_ROOT / "datasets" / "latest.json")
    frozen = _read_json(DATA_ROOT / "datasets" / latest["version_id"] / "parameters.json")
    library_path = DATA_ROOT / "library" / "parameters.json"
    library = _read_json(library_path) if library_path.exists() else []
    records: dict[str, dict[str, Any]] = {}
    for source, rows in (("library", library), ("frozen", frozen)):
        for row in rows:
            name = str(row.get("technical_name", "")).strip()
            if name and name not in records:
                records[name] = {**row, "_v3_source": source}
    excluded = excluded_names(DATA_ROOT)
    return [parameter for name, parameter in records.items() if name not in excluded]


def _canonical_hash(parameter: dict[str, Any]) -> str:
    raw = json.dumps(parameter, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _text_chunks(parameter: dict[str, Any]) -> list[str]:
    priority = ["technical_name", "name_ru", "description_en", "description_ru", "category", "sub_category", "semantic_keywords", "lyria_prompt_tags", "domain", "axes", "quantity_kind"]
    ordered_keys = priority + [key for key in parameter if key not in priority]
    fields = []
    for key in ordered_keys:
        value = parameter.get(key)
        if key.startswith("_") or value in (None, "", [], {}):
            continue
        rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":")) if isinstance(value, (list, dict)) else str(value)
        fields.append(f"{key.replace('_', ' ')}: {rendered}")
    return [". ".join(fields)]


def _load_clap():
    try:
        import torch
        from transformers import ClapModel, ClapProcessor
    except ImportError as exc:
        raise RuntimeError("CLAP dependencies are missing. Run: python -m pip install -r requirements.txt") from exc
    processor = ClapProcessor.from_pretrained(MODEL_NAME)
    model = ClapModel.from_pretrained(MODEL_NAME).to(DEVICE)
    model.eval()
    return torch, processor, model


def _normalize(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector.astype(np.float32) / (norm if norm else 1.0)


def _feature_tensor(output):
    if hasattr(output, "pooler_output"):
        return output.pooler_output
    if hasattr(output, "text_embeds"):
        return output.text_embeds
    if hasattr(output, "audio_embeds"):
        return output.audio_embeds
    return output


def _replace_index(temp_path: Path, destination: Path) -> None:
    """Publish a completed index despite transient Windows file handles."""
    last_error: PermissionError | None = None
    for attempt in range(12):
        try:
            temp_path.replace(destination)
            return
        except PermissionError as error:
            last_error = error
            time.sleep(0.25 * (attempt + 1))

    # Some Windows readers allow writes but deny delete/rename sharing. The
    # complete temporary file remains the source of truth for this fallback.
    try:
        with temp_path.open("rb") as source, destination.open("wb") as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
            target.flush()
            os.fsync(target.fileno())
        temp_path.unlink(missing_ok=True)
    except OSError:
        if last_error is not None:
            raise last_error
        raise


def _source_fingerprint(parameters: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256((MODEL_NAME + "\0" + DEVICE + "\0clap-text-v1").encode("utf-8"))
    for parameter in parameters:
        digest.update(str(parameter.get("technical_name", "")).encode("utf-8"))
        digest.update(_canonical_hash(parameter).encode("ascii"))
    return digest.hexdigest()


def _write_status(payload: dict[str, Any]) -> None:
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    temporary = STATUS_PATH.with_name(STATUS_PATH.name + ".tmp")
    temporary.write_text(json.dumps({key: payload.get(key) for key in (
        "ready", "model", "device", "created_at", "parameter_count", "dimensions",
        "excluded_count", "source_parameter_count", "source_fingerprint", "cache_version",
    )}, ensure_ascii=False), encoding="utf-8")
    _replace_index(temporary, STATUS_PATH)


def _write_search_cache(payload: dict[str, Any], fingerprint: str) -> None:
    SEARCH_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    rows_path, vectors_path = SEARCH_CACHE_DIR / "rows.json", SEARCH_CACHE_DIR / "vectors.f32"
    rows = [{"technical_name": item["technical_name"], "parameter": item["parameter"]} for item in payload["items"]]
    matrix = np.asarray([item["vector"] for item in payload["items"]], dtype="<f4")
    rows_tmp, vectors_tmp = rows_path.with_name(rows_path.name + ".tmp"), vectors_path.with_name(vectors_path.name + ".tmp")
    rows_tmp.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    matrix.tofile(vectors_tmp)
    _replace_index(rows_tmp, rows_path)
    _replace_index(vectors_tmp, vectors_path)
    _write_status({"ready": True, "model": payload["model"], "device": payload["device"], "created_at": payload["created_at"], "parameter_count": len(rows), "dimensions": matrix.shape[1] if matrix.ndim == 2 else 0, "excluded_count": payload.get("excluded_count", 0), "source_parameter_count": payload.get("source_parameter_count", 0), "source_fingerprint": fingerprint, "cache_version": SEARCH_CACHE_VERSION})


def _search_cache_exists(fingerprint: str) -> bool:
    try:
        status = _read_json(STATUS_PATH)
        count, dimensions = int(status["parameter_count"]), int(status["dimensions"])
        return (
            status.get("source_fingerprint") == fingerprint
            and status.get("cache_version") == SEARCH_CACHE_VERSION
            and (SEARCH_CACHE_DIR / "rows.json").is_file()
            and (SEARCH_CACHE_DIR / "vectors.f32").stat().st_size == count * dimensions * 4
        )
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return False


def _search_cache(fingerprint: str):
    try:
        status = _read_json(STATUS_PATH)
        if status.get("source_fingerprint") != fingerprint or status.get("cache_version") != SEARCH_CACHE_VERSION:
            return None
        rows = _read_json(SEARCH_CACHE_DIR / "rows.json")
        count, dimensions = int(status["parameter_count"]), int(status["dimensions"])
        vectors = np.fromfile(SEARCH_CACHE_DIR / "vectors.f32", dtype="<f4")
        if len(rows) != count or vectors.size != count * dimensions:
            return None
        return rows, vectors.reshape(count, dimensions)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def build_index(progress=None) -> dict[str, Any]:
    parameters = _load_v3_parameters()
    fingerprint = _source_fingerprint(parameters)
    if INDEX_PATH.exists() and _search_cache_exists(fingerprint):
        status = _read_json(STATUS_PATH)
        return {"model": MODEL_NAME, "parameter_count": len(parameters), "encoded": 0, "reused": len(parameters), "path": str(INDEX_PATH), "created_at": status.get("created_at"), "cache_hit": True, "source_fingerprint": fingerprint}
    previous: dict[str, Any] = {}
    if INDEX_PATH.exists():
        payload = _read_json(INDEX_PATH)
        if payload.get("model") == MODEL_NAME:
            previous = {item["technical_name"]: item for item in payload.get("items", [])}

    pending = [row for row in parameters if previous.get(str(row["technical_name"]), {}).get("content_sha256") != _canonical_hash(row)]
    reused = len(parameters) - len(pending)
    encoded: dict[str, list[float]] = {}
    if pending:
        torch, processor, model = _load_clap()
        chunk_rows = [(str(parameter["technical_name"]), text) for parameter in pending for text in _text_chunks(parameter)]
        vectors_by_name: dict[str, list[np.ndarray]] = {}
        batch_size = max(1, int(os.environ.get("CLAP_TEXT_BATCH_SIZE", "64")))
        for start in range(0, len(chunk_rows), batch_size):
            batch = chunk_rows[start:start + batch_size]
            inputs = processor(text=[text for _, text in batch], return_tensors="pt", padding=True, truncation=True)
            inputs = {key: value.to(DEVICE) for key, value in inputs.items()}
            with torch.no_grad():
                batch_vectors = _feature_tensor(model.get_text_features(**inputs)).cpu().numpy()
            for (name, _), vector in zip(batch, batch_vectors):
                vectors_by_name.setdefault(name, []).append(vector)
            if progress:
                progress(min(start + len(batch), len(chunk_rows)), len(chunk_rows), batch[-1][0])
        for name, vectors in vectors_by_name.items():
            encoded[name] = _normalize(np.mean(np.asarray(vectors), axis=0)).tolist()

    items = []
    for parameter in parameters:
        name = str(parameter["technical_name"])
        vector = encoded.get(name) or previous[name]["vector"]
        items.append({
            "technical_name": name,
            "content_sha256": _canonical_hash(parameter),
            "parameter": parameter,
            "vector": vector,
        })
    payload = {
        "schema_version": 1,
        "model": MODEL_NAME,
        "device": DEVICE,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parameter_count": len(items),
        "dimensions": len(items[0]["vector"]) if items else 0,
        "excluded_sha256": registry_sha256(DATA_ROOT),
        "excluded_count": len(read_registry(DATA_ROOT)["entries"]),
        "source_parameter_count": len(parameters),
        "items": items,
    }
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = INDEX_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    _replace_index(temp_path, INDEX_PATH)
    _write_search_cache(payload, fingerprint)
    return {"model": MODEL_NAME, "parameter_count": len(items), "encoded": len(pending), "reused": reused, "path": str(INDEX_PATH), "created_at": payload["created_at"], "cache_hit": False, "source_fingerprint": fingerprint}


def index_status() -> dict[str, Any]:
    if not INDEX_PATH.exists():
        return {"ready": False, "model": MODEL_NAME, "parameter_count": 0}
    if STATUS_PATH.exists():
        return _read_json(STATUS_PATH)
    payload = _read_json(INDEX_PATH)
    status = {"ready": True, "model": payload.get("model"), "device": payload.get("device"), "parameter_count": payload.get("parameter_count", 0), "dimensions": payload.get("dimensions", 0), "created_at": payload.get("created_at"), "excluded_count": payload.get("excluded_count", 0), "source_parameter_count": payload.get("source_parameter_count", 0)}
    _write_status(status)
    return status


def _round_step(value: float, minimum: float, step: float | None) -> float:
    if not step or step <= 0:
        return value
    decimals = max(0, min(6, math.ceil(-math.log10(step))))
    return round(minimum + round((value - minimum) / step) * step, decimals)


def _active_parameter(parameter: dict[str, Any], similarity: float, strength: float) -> dict[str, Any]:
    ui = str(parameter.get("ui_element") or "String")
    default = parameter.get("default", "")
    if isinstance(default, list):
        default = ", ".join(map(str, default))
    value: Any = default
    if ui in ("Range", "Toggle"):
        minimum = float(parameter.get("min_value", 0) or 0)
        maximum = float(parameter.get("max_value", 1) or 1)
        value = _round_step(minimum + strength * (maximum - minimum), minimum, parameter.get("step"))
        if ui == "Toggle":
            value = 1 if strength >= 0.5 else 0
    elif ui == "Select":
        options = parameter.get("options") or []
        if options:
            value = options[min(len(options) - 1, int(round(strength * (len(options) - 1))))]
    return {
        "technical_name": parameter["technical_name"],
        "name_ru": parameter.get("name_ru"),
        "description_en": parameter.get("description_en"),
        "description_ru": parameter.get("description_ru"),
        "category": str(parameter.get("category") or "audio_rag"),
        "sub_category": str(parameter.get("sub_category") or "clap_match"),
        "ui_element": ui,
        "min_value": parameter.get("min_value"),
        "max_value": parameter.get("max_value"),
        "step": parameter.get("step"),
        "default": default,
        "suggested_value": value,
        "current_value": value,
        "before": default,
        "source": "audio_similarity",
        "detail": f"LAION-CLAP audio-to-text similarity {similarity:.4f}; normalized strength {strength:.3f}",
        "unit": parameter.get("unit"),
        "options": parameter.get("options"),
        "lyria_prompt_tags": parameter.get("lyria_prompt_tags") or [],
        "semantic_keywords": parameter.get("semantic_keywords") or [],
        "similarity": similarity,
        "domain": parameter.get("domain"),
        "quantity_kind": parameter.get("quantity_kind"),
        "axes": parameter.get("axes") or [],
    }


def search_audio(audio_path: str, offset: float, duration: float, top_k: int, progress=None) -> dict[str, Any]:
    build = build_index(progress=progress)
    duration = max(1.0, min(800.0, duration))
    audio_file = Path(audio_path)
    query_key = content_key(kind="clap-audio-segment", version=QUERY_VECTOR_VERSION, model=MODEL_NAME, device=DEVICE, audio_sha256=sha256_file(audio_file), offset=max(0.0, offset), duration=duration, sample_rate=48000, mono=True, chunk_seconds=10, chunk_min_seconds=1)
    audio_vector = read_vector(QUERY_VECTOR_CACHE_DIR, query_key)
    query_meta = QUERY_VECTOR_CACHE_DIR / (query_key + ".json")
    if audio_vector is None:
        try:
            import librosa
        except ImportError as exc:
            raise RuntimeError("librosa is not installed. Run: python -m pip install -r requirements.txt") from exc
        torch, processor, model = _load_clap()
        audio, _ = librosa.load(str(audio_file), sr=48000, mono=True, offset=max(0.0, offset), duration=duration)
        if audio.size == 0:
            raise ValueError("Selected audio fragment is empty")
        chunk_samples = 10 * 48000
        chunks = [audio[start:start + chunk_samples] for start in range(0, audio.size, chunk_samples)]
        chunks = [chunk for chunk in chunks if chunk.size >= 48000]
        if not chunks:
            chunks = [audio]
        embedded = []
        for start in range(0, len(chunks), 8):
            batch = chunks[start:start + 8]
            inputs = processor(audio=batch, sampling_rate=48000, return_tensors="pt", padding=True)
            inputs = {key: value.to(DEVICE) for key, value in inputs.items()}
            with torch.no_grad():
                features = _feature_tensor(model.get_audio_features(**inputs)).cpu().numpy()
            embedded.extend(_normalize(vector) for vector in features)
        audio_vector = _normalize(np.mean(np.stack(embedded), axis=0))
        write_vector(QUERY_VECTOR_CACHE_DIR, query_key, audio_vector)
        meta_tmp = query_meta.with_name(query_meta.name + ".tmp")
        meta_tmp.write_text(json.dumps({"chunks": len(chunks)}), encoding="utf-8")
        _replace_index(meta_tmp, query_meta)
        chunk_count = len(chunks)
    else:
        try:
            cached_meta = _read_json(query_meta)
            chunk_count = int(cached_meta["chunks"])
            if chunk_count < 1:
                raise ValueError("Invalid cached chunk count")
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            (QUERY_VECTOR_CACHE_DIR / (query_key + ".f32")).unlink(missing_ok=True)
            return search_audio(audio_path, offset, duration, top_k, progress)
    cache = _search_cache(str(build["source_fingerprint"]))
    if cache is None:
        # A damaged derived sidecar is rebuilt from the backward-compatible index;
        # no embedding model is loaded and the published index remains untouched.
        legacy_payload = _read_json(INDEX_PATH)
        _write_search_cache(legacy_payload, str(build["source_fingerprint"]))
        cache = _search_cache(str(build["source_fingerprint"]))
    if cache is None:
        raise RuntimeError("CLAP ranking cache is unavailable after rebuilding from index.json")
    rows, matrix = cache
    if matrix.shape[1] != audio_vector.size:
        raise RuntimeError("CLAP query/index embedding dimensions differ")
    scores = matrix @ audio_vector
    order = np.lexsort((np.arange(len(scores)), -scores))[:max(1, min(100, int(top_k)))]
    scored = [(float(scores[index]), rows[int(index)]) for index in order]
    low = min((score for score, _ in scored), default=0.0)
    high = max((score for score, _ in scored), default=1.0)
    span = high - low or 1.0
    results = [_active_parameter(item["parameter"], score, (score - low) / span) for score, item in scored]
    build.pop("source_fingerprint", None)
    return {"model": MODEL_NAME, "offset": offset, "duration": duration, "fragment_chunks": chunk_count, "results": results, "index": build}


def save_audio_fragment(audio_path: str, output_path: str, offset: float, duration: float) -> dict[str, Any]:
    try:
        import librosa
        import soundfile as sf
    except ImportError as exc:
        raise RuntimeError("librosa and soundfile are required for saving audio fragments") from exc
    duration = max(1.0, min(800.0, duration))
    audio, sample_rate = librosa.load(audio_path, sr=None, mono=False, offset=max(0.0, offset), duration=duration)
    if audio.size == 0:
        raise ValueError("Selected audio fragment is empty")
    if audio.ndim > 1:
        audio = audio.T
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(target, audio, sample_rate, subtype="PCM_16")
    return {"filename": target.name, "path": str(target), "offset": offset, "duration": duration}
