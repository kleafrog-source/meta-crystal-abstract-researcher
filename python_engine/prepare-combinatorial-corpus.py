#!/usr/bin/env python3
"""Prepare a quality-gated atom corpus and a bge-m3 semantic review queue."""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import math
import os
import random
import struct
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "combinatorial-genesis" / "flowmusic-output" / "unified_parameters_lexical.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "combinatorial-genesis" / "flowmusic-output"
DEFAULT_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "qwen3-embedding:4b")
DEFAULT_ENDPOINT = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
UNIT_TOKENS = {
    "bark", "bpm", "celsius", "cents", "db", "deg", "degrees", "hz", "kpa",
    "lufs", "meters", "microns", "milliseconds", "ms", "newtons", "octave",
    "octaves", "pascal", "pascals", "percent", "percentage", "phon", "rayls",
    "samples", "seconds", "semitones", "sone", "us", "volts",
}
PROPERTY_TOKENS = {
    "amount", "angle", "attack", "balance", "bias", "coefficient", "coherence",
    "count", "cutoff", "decay", "density", "depth", "drive", "duration", "entropy",
    "factor", "feedback", "flux", "frequency", "gain", "index", "jitter", "level",
    "loudness", "mix", "offset", "order", "phase", "pressure", "probability", "q",
    "range", "rate", "ratio", "release", "resonance", "sharpness", "slope", "spread",
    "strength", "sustain", "temperature", "threshold", "time", "velocity", "width",
}
TOKEN_ALIASES = {
    "decibels": "db", "degrees": "deg", "freq": "frequency", "milliseconds": "ms",
    "microsec": "microsecond", "oct": "octave", "percentage": "percent", "speed": "rate",
}
TIME_PROPERTIES = {"attack", "decay", "delay", "duration", "hold", "release", "sustain"}


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def repeated_sequence(tokens: list[str], max_width: int = 4) -> str | None:
    for width in range(1, min(max_width, len(tokens) // 2) + 1):
        for start in range(0, len(tokens) - (2 * width) + 1):
            chunk = tokens[start : start + width]
            if chunk == tokens[start + width : start + (2 * width)]:
                return "_".join(chunk)
    return None


def quality_flags(parameter: dict[str, Any]) -> list[dict[str, Any]]:
    tokens = [token for token in str(parameter.get("technical_name", "")).strip().lower().split("_") if token]
    flags: list[dict[str, Any]] = []
    repeated = repeated_sequence(tokens)
    if repeated:
        flags.append({"code": "repeated_token_sequence", "severity": "exclude", "detail": repeated})
    most_common = Counter(tokens).most_common(1)
    if most_common and most_common[0][1] >= 4:
        flags.append({
            "code": "excessive_token_repetition",
            "severity": "exclude",
            "detail": f"{most_common[0][0]}×{most_common[0][1]}",
        })
    if len(tokens) > 14:
        flags.append({"code": "excessive_token_count", "severity": "exclude", "detail": str(len(tokens))})
    elif len(tokens) > 11:
        flags.append({"code": "long_technical_name", "severity": "review", "detail": str(len(tokens))})
    return flags


def build_quality_gate(parameters: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    eligible: list[dict[str, Any]] = []
    flagged: list[dict[str, Any]] = []
    flag_counts: Counter[str] = Counter()
    for parameter in parameters:
        flags = quality_flags(parameter)
        flag_counts.update(flag["code"] for flag in flags)
        excluded = any(flag["severity"] == "exclude" for flag in flags)
        if not excluded:
            eligible.append(parameter)
        if flags:
            flagged.append({
                "technical_name": parameter.get("technical_name"),
                "disposition": "excluded" if excluded else "review",
                "flags": flags,
            })
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "automatic_changes": False,
            "excluded_from_downstream_only": True,
            "raw_and_canonical_records_preserved": True,
        },
        "canonical_records": len(parameters),
        "eligible_records": len(eligible),
        "excluded_records": len(parameters) - len(eligible),
        "review_only_records": sum(1 for item in flagged if item["disposition"] == "review"),
        "flag_counts": dict(sorted(flag_counts.items())),
        "flagged_records": flagged,
    }
    return eligible, report


def atom_role(atom: str) -> str:
    if atom in UNIT_TOKENS:
        return "unit"
    if atom in PROPERTY_TOKENS:
        return "property"
    return "concept_or_descriptor"


def build_atom_corpus(parameters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    atoms: dict[str, dict[str, Any]] = {}
    for parameter in parameters:
        name = str(parameter["technical_name"]).lower()
        tokens = [token for token in name.split("_") if token]
        occurrence_weight = int(parameter.get("_collection", {}).get("occurrence_count", 1))
        for position, atom in enumerate(tokens):
            entry = atoms.setdefault(atom, {
                "atom": atom,
                "role": atom_role(atom),
                "parameter_frequency": 0,
                "occurrence_weight": 0,
                "first_position_count": 0,
                "last_position_count": 0,
                "source_parameters": [],
                "categories": Counter(),
            })
            entry["parameter_frequency"] += 1
            entry["occurrence_weight"] += occurrence_weight
            entry["first_position_count"] += int(position == 0)
            entry["last_position_count"] += int(position == len(tokens) - 1)
            entry["source_parameters"].append(name)
            entry["categories"][str(parameter.get("category", "uncategorized"))] += 1

    result: list[dict[str, Any]] = []
    for entry in atoms.values():
        entry["source_parameters"] = sorted(set(entry["source_parameters"]))
        entry["categories"] = dict(entry["categories"].most_common())
        result.append(entry)
    return sorted(result, key=lambda item: (-item["parameter_frequency"], item["atom"]))


def embedding_text(parameter: dict[str, Any]) -> str:
    name = str(parameter.get("technical_name", ""))
    parts = [
        name.replace("_", " "), str(parameter.get("name_ru", "")),
        str(parameter.get("description_en", "")), str(parameter.get("description_ru", "")),
        f"category {parameter.get('category', '')}", f"subcategory {parameter.get('sub_category', '')}",
        "tags " + ", ".join(map(str, parameter.get("lyria_prompt_tags", []))),
        "keywords " + ", ".join(map(str, parameter.get("semantic_keywords", []))),
        f"unit {parameter.get('unit', '')}",
    ]
    return ". ".join(part.strip() for part in parts if part.strip())


def post_json(url: str, payload: dict[str, Any], timeout: float = 180.0) -> dict[str, Any]:
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def embed_batch(endpoint: str, model: str, texts: list[str]) -> list[list[float]]:
    try:
        payload = post_json(f"{endpoint}/api/embed", {"model": model, "input": texts})
        vectors = payload.get("embeddings")
        if isinstance(vectors, list) and len(vectors) == len(texts):
            return vectors
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        pass
    vectors = []
    for text in texts:
        payload = post_json(f"{endpoint}/api/embeddings", {"model": model, "prompt": text})
        vector = payload.get("embedding")
        if not isinstance(vector, list) or not vector:
            raise RuntimeError("Ollama returned an empty embedding")
        vectors.append(vector)
    return vectors


def normalize(vector: Iterable[float]) -> list[float]:
    values = [float(value) for value in vector]
    norm = math.sqrt(sum(value * value for value in values))
    if not norm:
        raise ValueError("Embedding norm is zero")
    return [value / norm for value in values]


def cache_key(parameters: list[dict[str, Any]], model: str) -> str:
    digest = hashlib.sha256(model.encode("utf-8"))
    for parameter in parameters:
        digest.update(str(parameter["technical_name"]).encode("utf-8"))
        digest.update(embedding_text(parameter).encode("utf-8"))
    return digest.hexdigest()


def write_embedding_cache(path: Path, vectors: list[list[float]]) -> int:
    dimensions = len(vectors[0]) if vectors else 0
    with path.open("wb") as handle:
        handle.write(struct.pack("<II", len(vectors), dimensions))
        for vector in vectors:
            if len(vector) != dimensions:
                raise ValueError("Embedding dimensions are inconsistent")
            handle.write(struct.pack(f"<{dimensions}f", *vector))
    return dimensions


def read_embedding_cache(path: Path) -> list[list[float]]:
    with path.open("rb") as handle:
        count, dimensions = struct.unpack("<II", handle.read(8))
        row_size = dimensions * 4
        vectors = []
        for _ in range(count):
            raw = handle.read(row_size)
            if len(raw) != row_size:
                raise ValueError("Embedding cache is truncated")
            vectors.append(list(struct.unpack(f"<{dimensions}f", raw)))
        return vectors


def load_or_create_embeddings(
    parameters: list[dict[str, Any]], output_dir: Path, endpoint: str, model: str, batch_size: int
) -> tuple[list[list[float]], dict[str, Any]]:
    binary_path = output_dir / "semantic_embeddings.f32"
    metadata_path = output_dir / "semantic_embeddings_meta.json"
    key = cache_key(parameters, model)
    if binary_path.exists() and metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("cache_key") == key:
            vectors = read_embedding_cache(binary_path)
            if len(vectors) == len(parameters):
                print(f"Using cached embeddings: {len(vectors)}")
                return vectors, metadata

    vectors: list[list[float]] = []
    texts = [embedding_text(parameter) for parameter in parameters]
    for start in range(0, len(texts), batch_size):
        vectors.extend(normalize(vector) for vector in embed_batch(endpoint, model, texts[start : start + batch_size]))
        print(f"Embedded {len(vectors)}/{len(texts)}", flush=True)
    dimensions = write_embedding_cache(binary_path, vectors)
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "model": model,
        "endpoint": endpoint, "cache_key": key, "record_count": len(vectors),
        "dimensions": dimensions, "embedding_text_version": 1,
    }
    write_json(metadata_path, metadata)
    return vectors, metadata


def signatures(vectors: list[list[float]], bit_count: int = 192, sample_width: int = 6) -> list[int]:
    if not vectors:
        return []
    dimensions = len(vectors[0])
    rng = random.Random(0xC0B1A7)
    projections = [
        [(rng.randrange(dimensions), 1.0 if rng.getrandbits(1) else -1.0) for _ in range(sample_width)]
        for _ in range(bit_count)
    ]
    result = []
    for vector in vectors:
        signature = 0
        for bit, projection in enumerate(projections):
            if sum(vector[index] * sign for index, sign in projection) >= 0:
                signature |= 1 << bit
        result.append(signature)
    return result


def approximate_neighbor_pairs(signatures_: list[int], neighbors: int = 16) -> set[tuple[int, int]]:
    heaps: list[list[tuple[int, int]]] = [[] for _ in signatures_]
    for left in range(len(signatures_)):
        for right in range(left + 1, len(signatures_)):
            distance = (signatures_[left] ^ signatures_[right]).bit_count()
            for owner, other in ((left, right), (right, left)):
                item = (-distance, other)
                if len(heaps[owner]) < neighbors:
                    heapq.heappush(heaps[owner], item)
                elif item > heaps[owner][0]:
                    heapq.heapreplace(heaps[owner], item)
    return {
        (min(index, other), max(index, other))
        for index, heap in enumerate(heaps) for _, other in heap if index != other
    }


def cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def token_jaccard(left: str, right: str) -> float:
    left_tokens, right_tokens = set(left.lower().split("_")), set(right.lower().split("_"))
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def normalized_tokens(value: str) -> tuple[str, ...]:
    tokens = [TOKEN_ALIASES.get(token, token) for token in value.lower().replace("-", "_").split("_") if token]
    normalized: list[str] = []
    index = 0
    while index < len(tokens):
        current = tokens[index]
        following = tokens[index + 1] if index + 1 < len(tokens) else None
        if current == "q" and following == "factor":
            normalized.append("q")
            index += 2
            continue
        if current in {"scale", "scaling"} and following == "factor":
            normalized.append(current)
            index += 2
            continue
        if current == "time" and normalized and normalized[-1] in TIME_PROPERTIES:
            index += 1
            continue
        if current in {"type", "value"} and index == len(tokens) - 1:
            index += 1
            continue
        normalized.append(current)
        index += 1
    return tuple(sorted(normalized))


def normalized_unit(value: Any) -> tuple[str, ...]:
    return normalized_tokens(str(value or "").replace("/", "_per_"))


def parameter_shape_compatible(left: dict[str, Any], right: dict[str, Any]) -> tuple[bool, str]:
    left_ui, right_ui = left.get("ui_element"), right.get("ui_element")
    if left_ui != right_ui:
        return False, "different ui_element"
    if left_ui == "Select":
        left_options = {str(item) for item in left.get("options", [])}
        right_options = {str(item) for item in right.get("options", [])}
        if left_options != right_options:
            return False, "different Select options"
        return True, "same Select options"
    if normalized_unit(left.get("unit")) != normalized_unit(right.get("unit")):
        return False, "different normalized units"
    return True, "same normalized unit"


def classify_semantic_pair(
    pair: dict[str, Any],
    left: dict[str, Any],
    right: dict[str, Any],
    p90: float,
    p95: float,
) -> tuple[str, float, list[str]]:
    score = float(pair["cosine_similarity"])
    jaccard = float(pair["token_jaccard"])
    same_structure = normalized_tokens(str(left["technical_name"])) == normalized_tokens(str(right["technical_name"]))
    compatible, compatibility_reason = parameter_shape_compatible(left, right)

    if same_structure and compatible and score >= p90:
        confidence = min(0.999, 0.92 + max(0.0, score - p90) * 0.7)
        return "same", round(confidence, 4), [
            "normalized token multiset matches",
            compatibility_reason,
            f"cosine {score:.4f} >= empirical p90 {p90:.4f}",
        ]
    if score >= p95 or (score >= p90 and jaccard >= 0.65):
        confidence = min(0.99, 0.68 + max(0.0, score - p90) * 1.5 + min(jaccard, 1.0) * 0.12)
        reasons = [f"strong semantic proximity (cosine {score:.4f})"]
        if not same_structure:
            reasons.append("normalized structures differ")
        if not compatible:
            reasons.append(compatibility_reason)
        return "related", round(confidence, 4), reasons

    distance_below_p90 = max(0.0, p90 - score)
    confidence = min(0.99, 0.70 + distance_below_p90 * 1.5 + max(0.0, 0.5 - jaccard) * 0.2)
    return "distinct", round(confidence, 4), [
        f"cosine {score:.4f} below empirical p90 {p90:.4f}",
        f"token Jaccard {jaccard:.4f}",
    ]


def read_manual_decisions(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    decisions = payload.get("decisions", []) if isinstance(payload, dict) else []
    return {
        "\u0000".join(sorted((str(item["left"]), str(item["right"])))): str(item["decision"])
        for item in decisions
        if isinstance(item, dict) and item.get("decision") in {"same", "related", "distinct"}
    }


def build_auto_triage(
    parameters: list[dict[str, Any]],
    review_queue: list[dict[str, Any]],
    semantic_report: dict[str, Any],
    manual_decisions: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_name = {str(parameter["technical_name"]): parameter for parameter in parameters}
    quantiles = semantic_report["nearest_neighbor_score_quantiles"]
    p90, p95 = float(quantiles["p90"]), float(quantiles["p95"])
    manual_decisions = manual_decisions or {}
    auto_counts: Counter[str] = Counter()
    counts: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    triage = []
    for pair in review_queue:
        left_name, right_name = str(pair["left"]), str(pair["right"])
        auto_decision, confidence, reasons = classify_semantic_pair(
            pair, by_name[left_name], by_name[right_name], p90, p95
        )
        key = "\u0000".join(sorted((left_name, right_name)))
        manual = manual_decisions.get(key)
        effective = manual or auto_decision
        source = "manual" if manual else "auto"
        auto_counts[auto_decision] += 1
        counts[effective] += 1
        sources[source] += 1
        triage.append({
            **pair,
            "auto_decision": auto_decision,
            "auto_confidence": confidence,
            "auto_reasons": reasons,
            "effective_decision": effective,
            "decision_source": source,
        })
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy_version": "SEMANTIC_AUTO_TRIAGE_V1",
        "automatic_canonical_overwrite": False,
        "thresholds": {"p90": p90, "p95": p95},
        "pair_count": len(triage),
        "auto_decision_counts": dict(sorted(auto_counts.items())),
        "effective_decision_counts": dict(sorted(counts.items())),
        "decision_source_counts": dict(sorted(sources.items())),
        "same_rule": "normalized token multiset + compatible UI/unit/options + cosine >= empirical p90",
        "note": "Manual decisions are optional overrides. Auto-same is intentionally conservative.",
    }
    return triage, report


def build_semantic_groups(
    parameters: list[dict[str, Any]], triage: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_name = {str(parameter["technical_name"]): parameter for parameter in parameters}
    parent = {name: name for name in by_name}

    def find(name: str) -> str:
        while parent[name] != name:
            parent[name] = parent[parent[name]]
            name = parent[name]
        return name

    def union(left: str, right: str) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parent[max(left_root, right_root)] = min(left_root, right_root)

    same_edges = []
    for pair in triage:
        if pair["effective_decision"] == "same":
            union(str(pair["left"]), str(pair["right"]))
            same_edges.append(pair)

    members_by_root: dict[str, list[str]] = defaultdict(list)
    for name in by_name:
        members_by_root[find(name)].append(name)

    groups = []
    draft = []
    for group_index, members in enumerate(sorted(members_by_root.values(), key=lambda values: min(values)), start=1):
        ordered_members = sorted(members)
        winner = min(
            ordered_members,
            key=lambda name: (
                -int(by_name[name].get("_collection", {}).get("occurrence_count", 1)),
                len(name.split("_")),
                len(name),
                name,
            ),
        )
        group_id = f"semantic-group-{group_index:04d}"
        group_edges = [
            {"left": edge["left"], "right": edge["right"], "confidence": edge["auto_confidence"],
             "decision_source": edge["decision_source"]}
            for edge in same_edges
            if str(edge["left"]) in ordered_members and str(edge["right"]) in ordered_members
        ]
        if len(ordered_members) > 1:
            groups.append({
                "group_id": group_id,
                "canonical_name": winner,
                "members": ordered_members,
                "same_edges": group_edges,
                "review_status": "auto_draft",
            })
        record = deepcopy(by_name[winner])
        record["_semantic_group"] = {
            "group_id": group_id,
            "canonical_name": winner,
            "members": ordered_members,
            "member_count": len(ordered_members),
            "status": "auto_draft",
        }
        draft.append(record)
    return groups, sorted(draft, key=lambda item: str(item["technical_name"]))


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))], 6)


def build_semantic_review(
    parameters: list[dict[str, Any]], vectors: list[list[float]], metadata: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    candidate_pairs = approximate_neighbor_pairs(signatures(vectors))
    scored = []
    nearest_by_record: dict[int, float] = defaultdict(lambda: -1.0)
    for left, right in candidate_pairs:
        score = cosine(vectors[left], vectors[right])
        nearest_by_record[left] = max(nearest_by_record[left], score)
        nearest_by_record[right] = max(nearest_by_record[right], score)
        left_name, right_name = str(parameters[left]["technical_name"]), str(parameters[right]["technical_name"])
        scored.append({
            "left": left_name, "right": right_name, "cosine_similarity": round(score, 6),
            "token_jaccard": round(token_jaccard(left_name, right_name), 4),
            "left_unit": parameters[left].get("unit"), "right_unit": parameters[right].get("unit"),
            "same_unit_normalized": str(parameters[left].get("unit", "")).lower()
            == str(parameters[right].get("unit", "")).lower(),
            "review_status": "pending", "decision": None,
        })
    scored.sort(key=lambda item: (-item["cosine_similarity"], -item["token_jaccard"], item["left"], item["right"]))
    nearest_scores = list(nearest_by_record.values())
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": "bge-m3 embeddings + deterministic sparse-hyperplane approximate neighbors + exact cosine rerank",
        "automatic_merge": False, "record_count": len(parameters), "candidate_pair_count": len(scored),
        "nearest_neighbor_score_quantiles": {
            "p50": percentile(nearest_scores, 0.50), "p90": percentile(nearest_scores, 0.90),
            "p95": percentile(nearest_scores, 0.95), "p99": percentile(nearest_scores, 0.99),
        },
        "embedding": metadata,
        "note": "Scores are review evidence, not an acceptance threshold. No records were merged or deleted.",
    }
    return scored, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--skip-embeddings", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    parameters = json.loads(args.input.read_text(encoding="utf-8"))
    eligible, quality_report = build_quality_gate(parameters)
    atoms = build_atom_corpus(eligible)
    quality_report["atom_count"] = len(atoms)
    write_json(args.output_dir / "eligible_parameters.json", eligible)
    write_json(args.output_dir / "quality_report.json", quality_report)
    write_json(args.output_dir / "atom_corpus.json", atoms)
    print(f"Quality gate: {len(eligible)}/{len(parameters)} eligible; atoms: {len(atoms)}", flush=True)
    if args.skip_embeddings:
        return 0
    vectors, metadata = load_or_create_embeddings(
        eligible, args.output_dir, args.endpoint, args.model, max(1, args.batch_size)
    )
    queue, semantic_report = build_semantic_review(eligible, vectors, metadata)
    decisions_path = PROJECT_ROOT / "data" / "combinatorial-genesis" / "reviews" / "semantic_decisions.json"
    triage, triage_report = build_auto_triage(
        eligible,
        queue,
        semantic_report,
        read_manual_decisions(decisions_path),
    )
    groups, semantic_draft = build_semantic_groups(eligible, triage)
    triage_report["semantic_group_count"] = len(groups)
    triage_report["semantic_draft_record_count"] = len(semantic_draft)
    write_json(args.output_dir / "semantic_review_queue.json", queue)
    write_json(args.output_dir / "semantic_report.json", semantic_report)
    write_json(args.output_dir / "semantic_auto_triage.json", triage)
    write_json(args.output_dir / "semantic_auto_triage_report.json", triage_report)
    write_json(args.output_dir / "semantic_groups.json", groups)
    write_json(args.output_dir / "unified_parameters_semantic_draft.json", semantic_draft)
    print(
        f"Semantic review pairs: {len(queue)}; auto decisions: "
        f"{triage_report['effective_decision_counts']}; groups: {len(groups)}; "
        f"draft records: {len(semantic_draft)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
