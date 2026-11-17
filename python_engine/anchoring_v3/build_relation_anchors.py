#!/usr/bin/env python3
"""Build the 12 deterministic V3 relation anchors and parameter memberships."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python_engine"))
from parameter_registry import filter_parameters, read_registry, registry_sha256  # noqa: E402
from v3_snapshot import load_v3_snapshot  # noqa: E402
DEFAULT_DATASET = ROOT / "data" / "combinatorial-genesis" / "v3" / "dataset.json"
DEFAULT_OUTPUT = ROOT / "data" / "combinatorial-genesis" / "v3" / "relations"

RELATIONS = [
    {"id": "cutoff_resonance", "text": "screaming acid bass with high filter cutoff, high resonance and aggressive filter sweep", "triggers": ["acid", "screaming", "resonance", "filter sweep"], "a": ["cutoff", "filter frequency"], "b": ["resonance", "filter q"], "direction_a": 1, "direction_b": 1},
    {"id": "warmth_brightness", "text": "warm rounded analog tone with restrained brightness and soft high frequencies", "triggers": ["warm", "warmth", "analog"], "a": ["warmth", "analog warmth", "tube warmth"], "b": ["brightness", "sharpness", "high frequency"], "direction_a": 1, "direction_b": -1},
    {"id": "saturation_cleanliness", "text": "driven saturated distorted signal instead of transparent clean reproduction", "triggers": ["saturated", "saturation", "drive", "distortion"], "a": ["saturation", "drive", "distortion"], "b": ["cleanliness", "clean", "transparency"], "direction_a": 1, "direction_b": -1},
    {"id": "attack_decay", "text": "punchy plucky staccato envelope with fast attack and short decay", "triggers": ["punchy", "pluck", "plucky", "staccato"], "a": ["attack", "transient"], "b": ["decay"], "direction_a": -1, "direction_b": -1},
    {"id": "attack_release", "text": "smooth evolving pad envelope with slow attack and long release", "triggers": ["pad", "smooth attack", "evolving"], "a": ["attack"], "b": ["release", "tail"], "direction_a": 1, "direction_b": 1},
    {"id": "sustain_decay", "text": "sustained organ-like tone with high sustain and slow decay instead of a bell", "triggers": ["sustain", "organ", "bell"], "a": ["sustain"], "b": ["decay"], "direction_a": 1, "direction_b": 1},
    {"id": "dry_wet", "text": "spacious wet ambience with strong effect mix instead of a tight dry signal", "triggers": ["dry", "wet", "spacious", "ambience"], "a": ["dry", "direct signal"], "b": ["wet", "effect mix", "reverb mix"], "direction_a": -1, "direction_b": 1},
    {"id": "stereo_width_mono_center", "text": "wide stereo field with reduced mono center concentration and clear separation", "triggers": ["wide", "stereo", "mono"], "a": ["stereo width", "spatial width"], "b": ["mono center", "center concentration"], "direction_a": 1, "direction_b": -1},
    {"id": "reverb_size_decay", "text": "large reverberant hall with high room size and long reverb decay", "triggers": ["reverb", "hall", "room size"], "a": ["reverb size", "room size"], "b": ["reverb decay", "reverberation time"], "direction_a": 1, "direction_b": 1},
    {"id": "pitch_slide_portamento", "text": "TB-303 glide with strong pitch slide and smooth portamento between notes", "triggers": ["303", "glide", "portamento", "pitch slide"], "a": ["pitch slide", "glide"], "b": ["portamento"], "direction_a": 1, "direction_b": 1},
    {"id": "lfo_rate_depth", "text": "strong wobble vibrato with synchronized LFO rate and deep modulation depth", "triggers": ["lfo", "wobble", "vibrato"], "a": ["lfo rate", "modulation rate"], "b": ["lfo depth", "modulation depth"], "direction_a": 1, "direction_b": 1},
    {"id": "modulation_stability", "text": "chaotic unstable modulation with high movement and low stability", "triggers": ["chaotic", "chaos", "unstable", "stability"], "a": ["modulation", "chaos", "movement"], "b": ["stability", "stable"], "direction_a": 1, "direction_b": -1},
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def exclusion_metadata(data_root: Path, pinned: dict[str, Any] | None) -> tuple[str, int]:
    if pinned is not None:
        return str(pinned["excluded_sha256"]), int(pinned["excluded_count"])
    return registry_sha256(data_root), len(read_registry(data_root)["entries"])


def managed_candidate_bundle_id(output: Path) -> str | None:
    maintenance_root = (ROOT / "data" / "combinatorial-genesis" / "maintenance").resolve()
    try:
        relative = output.resolve().relative_to(maintenance_root)
    except ValueError:
        return None
    if len(relative.parts) == 4 and relative.parts[1:] == ("artifacts", "qwen3", "relations"):
        return relative.parts[0]
    return None


def parameter_text(parameter: dict) -> str:
    return " ".join([
        str(parameter.get("technical_name") or "").replace("_", " "),
        str(parameter.get("description_en") or ""), str(parameter.get("description_ru") or ""),
        " ".join(map(str, parameter.get("semantic_keywords") or [])),
        str(parameter.get("quantity_kind") or ""), str(parameter.get("unit") or ""),
    ]).lower()


def matching_parameters(dataset: list[dict], terms: list[str], limit: int = 12) -> list[str]:
    ranked = []
    for parameter in dataset:
        if parameter.get("retrieval_scope") not in ("sound", "structure"):
            continue
        text = parameter_text(parameter)
        name = str(parameter.get("technical_name") or "").replace("_", " ").lower()
        score = sum((6 if term in name else 0) + (2 if term in text else 0) for term in terms)
        if score:
            ranked.append((score, parameter.get("ui_element") == "Range", str(parameter["technical_name"])))
    ranked.sort(key=lambda item: (-item[0], -int(item[1]), item[2]))
    return [name for _score, _range, name in ranked[:limit]]


def embed(endpoint: str, model: str, texts: list[str]) -> list[list[float]]:
    request = urllib.request.Request(
        f"{endpoint.rstrip('/')}/api/embed",
        data=json.dumps({"model": model, "input": texts}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=1200) as response:
        vectors = json.load(response).get("embeddings")
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise RuntimeError("Ollama returned an unexpected relation embedding count")
    normalized = []
    for vector in vectors:
        norm = math.sqrt(sum(float(value) ** 2 for value in vector)) or 1.0
        normalized.append([float(value) / norm for value in vector])
    return normalized


def build_checkpointed_vectors(output: Path, rows: list[dict[str, Any]], *, endpoint: str, model: str,
                              identity_sha256: str | None, batch_size: int = 4,
                              embedder=embed) -> tuple[Path, int]:
    rows_sha = hashlib.sha256(json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8")).hexdigest()
    identity = hashlib.sha256(json.dumps({"model": model, "endpoint": endpoint.rstrip("/"), "rows_sha256": rows_sha,
        "operation_identity_sha256": identity_sha256}, sort_keys=True).encode("utf-8")).hexdigest()
    progress_path = output / "vectorization-progress.json"
    building_path = output / "embeddings.f32.building"
    output.mkdir(parents=True, exist_ok=True)
    progress = read_json(progress_path) if progress_path.exists() else None
    if progress and (progress.get("identity_sha256") != identity or progress.get("model") != model
            or progress.get("endpoint") != endpoint.rstrip("/") or progress.get("rows_sha256") != rows_sha):
        raise RuntimeError("Saved relation vector checkpoint does not match the prepared rows/model/endpoint.")
    completed = int(progress.get("completed_count", 0)) if progress else 0
    dimensions = int(progress.get("dimensions", 0)) if progress else 0
    if building_path.exists():
        if not progress:
            raise RuntimeError("Relation candidate vectors exist without a checkpoint receipt.")
        expected = 8 + completed * dimensions * 4
        if building_path.stat().st_size < expected or (completed and not dimensions):
            raise RuntimeError("Relation vector candidate is shorter than its durable checkpoint.")
        with building_path.open("r+b") as handle:
            handle.truncate(expected)
            handle.seek(0)
            count, stored_dim = struct.unpack("<II", handle.read(8))
            if count != completed or stored_dim != dimensions:
                handle.seek(0)
                handle.write(struct.pack("<II", completed, dimensions))
    else:
        if completed:
            raise RuntimeError("Relation checkpoint exists without its vector data file.")
        with building_path.open("wb") as handle:
            handle.write(struct.pack("<II", 0, 0))
            handle.flush()
            os.fsync(handle.fileno())
        progress = {"schema_version": 1, "status": "vectorizing", "identity_sha256": identity,
            "operation_identity_sha256": identity_sha256, "model": model, "endpoint": endpoint.rstrip("/"),
            "rows_sha256": rows_sha, "completed_count": 0, "dimensions": 0}
        write_json_atomic(progress_path, progress)
    while completed < len(rows):
        end = min(completed + max(1, batch_size), len(rows))
        vectors = embedder(endpoint, model, [str(row["text"]) for row in rows[completed:end]])
        if len(vectors) != end - completed:
            raise RuntimeError("Relation embedding provider returned an unexpected batch size.")
        batch_dimensions = len(vectors[0]) if vectors else 0
        if not batch_dimensions or any(len(vector) != batch_dimensions for vector in vectors) or (dimensions and dimensions != batch_dimensions):
            raise RuntimeError("Relation embedding provider returned incompatible vector dimensions.")
        dimensions = batch_dimensions
        with building_path.open("r+b") as handle:
            handle.seek(0, os.SEEK_END)
            for vector in vectors:
                handle.write(struct.pack(f"<{dimensions}f", *vector))
            completed = end
            handle.flush()
            os.fsync(handle.fileno())
            handle.seek(0)
            handle.write(struct.pack("<II", completed, dimensions))
            handle.flush()
            os.fsync(handle.fileno())
        progress = {"schema_version": 1, "status": "vectorizing", "identity_sha256": identity,
            "operation_identity_sha256": identity_sha256, "model": model, "endpoint": endpoint.rstrip("/"),
            "rows_sha256": rows_sha, "completed_count": completed, "dimensions": dimensions,
            "vectors_sha256": hashlib.sha256(building_path.read_bytes()).hexdigest()}
        write_json_atomic(progress_path, progress)
        print(f"[progress] stage=gemma_relations current={completed} total={len(rows)} label=embedding", flush=True)
    if completed != len(rows) or building_path.stat().st_size != 8 + completed * dimensions * 4:
        raise RuntimeError("Completed relation vectors failed row/vector alignment.")
    final_path = output / "embeddings.f32"
    os.replace(building_path, final_path)
    progress_path.unlink(missing_ok=True)
    return final_path, dimensions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--endpoint", default="http://localhost:11434")
    parser.add_argument("--model", default="qwen3-embedding:4b")
    parser.add_argument("--live-snapshot", action="store_true", help="Build current relation bindings from the effective V3 catalogue snapshot.")
    parser.add_argument("--parameter-snapshot", type=Path, help="Use one immutable effective-catalogue JSON snapshot; do not reread live membership")
    parser.add_argument("--source-revision", help="Revision recorded when --parameter-snapshot was captured")
    parser.add_argument("--source-snapshot-sha256", help="Current catalogue content fingerprint captured with the snapshot")
    parser.add_argument("--excluded-sha256", help="Exclusion registry hash captured with the snapshot")
    parser.add_argument("--excluded-count", type=int, default=0, help="Exclusion count captured with the snapshot")
    parser.add_argument("--prepare-only", action="store_true", help="Write snapshot-bound relation rows without embeddings.")
    parser.add_argument("--prepared-rows-file", type=Path, help="Use relation rows saved by model-free Prepare.")
    parser.add_argument("--operation-identity-sha256", help="Candidate operation identity used to reject incompatible vector checkpoints.")
    parser.add_argument("--value-selection-bundle-id", help="Pinned value-selection bundle identity for managed candidate relations.")
    args = parser.parse_args()
    derived_bundle_id = managed_candidate_bundle_id(args.output)
    if args.value_selection_bundle_id and derived_bundle_id and args.value_selection_bundle_id != derived_bundle_id:
        raise ValueError("Requested value-selection bundle identity does not match managed candidate output path.")
    value_selection_bundle_id = args.value_selection_bundle_id or derived_bundle_id
    data_root = ROOT / "data" / "combinatorial-genesis"
    pinned = load_v3_snapshot(data_root, snapshot_path=args.parameter_snapshot, source_revision=args.source_revision,
        source_snapshot_sha256=args.source_snapshot_sha256, excluded_sha256=args.excluded_sha256,
        excluded_count=args.excluded_count) if args.parameter_snapshot else load_v3_snapshot(data_root) if args.live_snapshot else None
    dataset = pinned["parameters"] if pinned else read_json(args.dataset)
    dataset = dataset if pinned else filter_parameters(dataset, data_root)
    rows = []
    for index, relation in enumerate(RELATIONS):
        rows.append({
            **relation, "row_index": index,
            "params_a": matching_parameters(dataset, relation["a"]),
            "params_b": matching_parameters(dataset, relation["b"]),
        })
    if args.prepared_rows_file:
        prepared = read_json(args.prepared_rows_file)
        expected_snapshot = pinned["content_sha256"] if pinned else load_v3_snapshot(data_root)["content_sha256"]
        if (prepared.get("source_revision") != (pinned["source_revision"] if pinned else None)
                or prepared.get("source_snapshot_sha256") != expected_snapshot or prepared.get("rows") != rows):
            raise RuntimeError("Prepared relation rows do not match the pinned source snapshot.")
        rows = prepared["rows"]
    if args.prepare_only:
        source_snapshot_sha256 = pinned["content_sha256"] if pinned else load_v3_snapshot(data_root)["content_sha256"]
        payload = {"schema_version": 1, "source_revision": pinned["source_revision"] if pinned else None,
            "source_snapshot_sha256": source_snapshot_sha256, "source_parameter_count": len(dataset),
            "rows": rows, "planned_outputs": ["manifest.json", "embeddings.f32"]}
        args.output.mkdir(parents=True, exist_ok=True)
        rows_path = args.output / "relations-rows.json"
        raw = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        if rows_path.exists() and rows_path.read_bytes() != raw:
            raise RuntimeError("Saved prepared relations differ from the pinned snapshot; refusing to replace them.")
        if not rows_path.exists(): rows_path.write_bytes(raw)
        saved = rows_path.read_bytes()
        digest = hashlib.sha256(saved).hexdigest()
        manifest = {"schema_version": 1, "status": "prepared", "model": args.model,
            "source_revision": pinned["source_revision"] if pinned else None,
            "source_snapshot_sha256": source_snapshot_sha256, "source_parameter_count": len(dataset),
            "rows_sha256": digest, "rows_file": rows_path.name, "row_count": len(rows),
            "planned_outputs": payload["planned_outputs"]}
        manifest_path = args.output / "prepare-manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if hashlib.sha256(rows_path.read_bytes()).hexdigest() != manifest["rows_sha256"] or read_json(manifest_path) != manifest:
            raise RuntimeError("Prepared relations failed read-back verification.")
        print(json.dumps({"status": "prepared", "model_called": False, "row_count": len(rows), "source_snapshot_sha256": source_snapshot_sha256}, ensure_ascii=False))
        return 0
    cache_sha256 = hashlib.sha256(json.dumps(
        {"model": args.model, "endpoint": args.endpoint.rstrip("/"), "operation_identity_sha256": args.operation_identity_sha256, "relations": rows},
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")).hexdigest()
    source_snapshot_sha256 = pinned["content_sha256"] if pinned else load_v3_snapshot(data_root)["content_sha256"]
    excluded_sha256, excluded_count = exclusion_metadata(data_root, pinned)
    manifest_path = args.output / "manifest.json"
    if manifest_path.exists():
        existing = read_json(manifest_path)
        vectors_path = args.output / str(existing.get("vectors_file") or "embeddings.f32")
        if existing.get("cache_sha256") == cache_sha256 and existing.get("endpoint") == args.endpoint.rstrip("/") and vectors_path.exists():
            existing["source_snapshot_sha256"] = source_snapshot_sha256
            existing["source_revision"] = pinned["source_revision"] if pinned else None
            existing["source_parameter_count"] = len(dataset)
            existing["excluded_sha256"] = excluded_sha256
            existing["excluded_count"] = excluded_count
            if value_selection_bundle_id:
                existing["value_selection_bundle_id"] = value_selection_bundle_id
            temporary = args.output / "manifest.json.tmp"
            temporary.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temporary, manifest_path)
            print(json.dumps({
                "relations": len(rows), "dimensions": existing.get("dimensions"),
                "model": args.model, "reused": True,
            }, ensure_ascii=False))
            return 0
    vectors_path, dimensions = build_checkpointed_vectors(args.output, rows, endpoint=args.endpoint, model=args.model,
        identity_sha256=args.operation_identity_sha256)
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model, "endpoint": args.endpoint.rstrip("/"), "operation_identity_sha256": args.operation_identity_sha256,
        "dimensions": dimensions, "count": len(rows),
        "cache_sha256": cache_sha256,
        "excluded_sha256": excluded_sha256,
        "excluded_count": excluded_count,
        "source_parameter_count": len(dataset),
        "source_snapshot_sha256": source_snapshot_sha256,
        "source_revision": pinned["source_revision"] if pinned else None,
        **({"value_selection_bundle_id": value_selection_bundle_id} if value_selection_bundle_id else {}),
        "alpha_base": 0.15, "alpha_max": 0.25, "activation_threshold": 0.55,
        "vectors_file": vectors_path.name, "relations": rows,
    }
    temporary = args.output / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, manifest_path)
    print(json.dumps({"relations": len(rows), "dimensions": dimensions, "model": args.model}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
