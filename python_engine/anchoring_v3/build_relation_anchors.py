#!/usr/bin/env python3
"""Build the 12 deterministic V3 relation anchors and parameter memberships."""

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
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--endpoint", default="http://localhost:11434")
    parser.add_argument("--model", default="qwen3-embedding:4b")
    args = parser.parse_args()
    dataset = read_json(args.dataset)
    rows = []
    for index, relation in enumerate(RELATIONS):
        rows.append({
            **relation, "row_index": index,
            "params_a": matching_parameters(dataset, relation["a"]),
            "params_b": matching_parameters(dataset, relation["b"]),
        })
    cache_sha256 = hashlib.sha256(json.dumps(
        {"model": args.model, "relations": rows},
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")).hexdigest()
    manifest_path = args.output / "manifest.json"
    if manifest_path.exists():
        existing = read_json(manifest_path)
        vectors_path = args.output / str(existing.get("vectors_file") or "embeddings.f32")
        if existing.get("cache_sha256") == cache_sha256 and vectors_path.exists():
            print(json.dumps({
                "relations": len(rows), "dimensions": existing.get("dimensions"),
                "model": args.model, "reused": True,
            }, ensure_ascii=False))
            return 0
    vectors = embed(args.endpoint, args.model, [row["text"] for row in rows])
    dimensions = len(vectors[0])
    args.output.mkdir(parents=True, exist_ok=True)
    vectors_path = args.output / "embeddings.f32"
    with vectors_path.open("wb") as handle:
        handle.write(struct.pack("<II", len(vectors), dimensions))
        for vector in vectors:
            handle.write(struct.pack(f"<{dimensions}f", *vector))
    manifest = {
        "schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model, "dimensions": dimensions, "count": len(rows),
        "cache_sha256": cache_sha256,
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
