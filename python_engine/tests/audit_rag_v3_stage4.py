#!/usr/bin/env python3
"""Sequential Stage 4 audit: selectivity, direction, isolation and anchor thresholds."""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = "http://localhost:3000/api/rag-v3/propose-parameters"
DATASET = ROOT / "data" / "combinatorial-genesis" / "v3" / "dataset.json"
LOG_DIR = ROOT / "reports" / "stage4_anchor_logs"
REPORT = ROOT / "reports" / f"STAGE4_TEST_REPORT_{datetime.now().date().isoformat()}.md"
TOP_K = 10

SELECTIVITY_CASES = [
    ("simple_lowpass_filter_cutoff_hz", 500, "Set simple_lowpass_filter_cutoff_hz to 500 Hz"),
    ("reverb_dry_wet_ratio", 0.9, "Set reverb_dry_wet_ratio to 0.9"),
    ("simple_compressor_ratio_setting", "8:1", "Set simple_compressor_ratio_setting to 8:1 mode"),
    ("basic_oscillator_waveform_shape", "square", "Set basic_oscillator_waveform_shape to square mode"),
    ("basic_amplitude_envelope_attack_ms", 800, "Set basic_amplitude_envelope_attack_ms to 800 ms"),
]

DIRECTION_CASES = [
    ("make it darker, lower cutoff, more muffled", [(r"cutoff|brightness|high_?freq|treble", -1)]),
    ("make it brighter, higher cutoff, screaming resonance", [(r"cutoff|brightness|resonance|high_?freq", 1)]),
    ("add more reverb, spacious, wet, long tail", [(r"reverb|wet|decay|spatial_width|stereo_width", 1)]),
    ("make it tighter, dry, punchy, short decay", [(r"reverb|wet|decay|attack", -1)]),
    ("slower attack, softer, gentler", [(r"attack_(?:time|duration)|envelope.*attack", 1), (r"attack_gain|drive|harsh", -1)]),
]

NEGATIVE_CASES = [
    ("Set reverb_dry_wet_ratio to 0.9", r"compress|filter|equaliz|\beq\b"),
    ("Set simple_lowpass_filter_cutoff_hz to 2000 Hz", r"reverb|spatial|stereo"),
    ("Set stereo_width_chorus_flanger_depth to 0.8", r"filter|cutoff|resonance"),
    ("Set psychoacoustic_loudness_compensation_bass_boost_db to 6 dB", r"treble|high_shelf"),
    ("Set simple_distortion_drive_amount to 0.7", r"reverb|wet|clean"),
]

COHERENCE_CASES = [
    ("warm analog bass, deep sub, soft attack", r"warm|analog|bass|sub|attack"),
    ("aggressive acid lead, screaming resonance", r"acid|lead|resonance|filter|cutoff"),
    ("airy pad, wide stereo, long reverb tail", r"air|pad|stereo|width|reverb|tail|release"),
    ("punchy drum, tight kick, short decay", r"punch|drum|kick|decay|attack|transient"),
    ("glitchy texture, granular, broken beats", r"glitch|texture|granular|grain|beat|rhythm"),
]

NEUTRAL_CASES = ["no changes", "standard settings", "neutral configuration", "default", "keep as is"]
RESTART_CASES = [case[2] for case in SELECTIVITY_CASES] + [case[0] for case in DIRECTION_CASES]


def same(left: Any, right: Any) -> bool:
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isclose(float(left), float(right), rel_tol=1e-9, abs_tol=1e-9)
    return str(left) == str(right)


def post(query: str, top_k: int = TOP_K) -> tuple[dict[str, Any], float]:
    body = json.dumps({
        "query": query, "top_k": top_k, "current_values": {}, "instruction_context": [],
        "sources": {"library": True, "frozen": True, "atoms": True, "generated": True},
    }).encode("utf-8")
    request = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json"}, method="POST")
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.load(response), time.perf_counter() - started


def changed(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in results if not same(item.get("current_value"), item.get("default"))]


def normalized_result(payload: dict[str, Any]) -> list[tuple[str, Any, Any, str]]:
    return [
        (item["technical_name"], item.get("current_value"), item.get("default"), item.get("source", ""))
        for item in payload.get("results", [])
    ]


def anchor_log(query: str) -> dict[str, Any]:
    query_id = hashlib.sha256(query.encode("utf-8")).hexdigest()[:16]
    return json.loads((LOG_DIR / f"{query_id}.json").read_text(encoding="utf-8"))


def select_cases(dataset: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in dataset:
        if item.get("ui_element") == "Select" and len(item.get("options") or []) >= 2:
            grouped[str(item.get("select_typing") or "untyped")].append(item)
    cases = []
    words = ["first", "second", "third", "fourth", "fifth"]
    for typing in ("nominal", "ordinal", "untyped"):
        for item in grouped[typing][:10]:
            options = [str(option) for option in item["options"]]
            index = next((idx for idx, option in enumerate(options) if option != str(item.get("default"))), 0)
            option = options[index]
            if typing == "ordinal":
                query = f"Use the {words[min(index, len(words) - 1)]} option for {item['technical_name']}"
            elif typing == "nominal":
                query = f"Use {option.replace('_', ' ')} mode for {item['technical_name']}"
            else:
                query = f"Create the sound using {option.replace('_', ' ')} for {item['technical_name']}"
            cases.append({"typing": typing, "target": item["technical_name"], "expected": option, "query": query})
    return cases


def main() -> int:
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    elapsed: list[float] = []

    for target, expected, query in SELECTIVITY_CASES:
        payload, seconds = post(query); elapsed.append(seconds)
        results = payload.get("results", []); selected = next((item for item in results if item.get("technical_name") == target), None)
        count = len(changed(results)); ratio = count / len(results) if results else 0
        correct = bool(selected and same(selected.get("current_value"), expected))
        rows.append({"category": "A", "query": query, "pass": correct and 0.2 <= ratio <= 0.4, "selectivity": ratio, "target_correct": correct})
        print(f"A {query}: target={correct} selectivity={ratio:.1%}", flush=True)

    directed_total = directed_correct = 0
    for query, patterns in DIRECTION_CASES:
        payload, seconds = post(query); elapsed.append(seconds); results = changed(payload.get("results", []))
        case_total = case_correct = 0
        for item in results:
            for pattern, sign in patterns:
                if re.search(pattern, item["technical_name"], re.I) and isinstance(item.get("current_value"), (int, float)) and isinstance(item.get("default"), (int, float)):
                    case_total += 1
                    actual = 1 if item["current_value"] > item["default"] else -1
                    case_correct += int(actual == sign)
                    break
        directed_total += case_total; directed_correct += case_correct
        agreement = case_correct / case_total if case_total else 0
        rows.append({"category": "B", "query": query, "pass": case_total > 0 and agreement > 0.8, "direction_agreement": agreement, "related": case_total})
        print(f"B {query}: direction={agreement:.1%} ({case_total})", flush=True)

    unrelated_total = unrelated_unchanged = 0
    for query, unrelated_pattern in NEGATIVE_CASES:
        payload, seconds = post(query); elapsed.append(seconds); results = payload.get("results", [])
        unrelated = [item for item in results if re.search(unrelated_pattern, item["technical_name"], re.I)]
        stable = [item for item in unrelated if same(item.get("current_value"), item.get("default"))]
        unrelated_total += len(unrelated); unrelated_unchanged += len(stable)
        precision = len(stable) / len(unrelated) if unrelated else 1.0
        rows.append({"category": "C", "query": query, "pass": precision > 0.9, "negative_precision": precision, "unrelated": len(unrelated)})
        print(f"C {query}: negative_precision={precision:.1%} ({len(unrelated)})", flush=True)

    coherent_total = coherent_related = 0
    for query, related_pattern in COHERENCE_CASES:
        payload, seconds = post(query); elapsed.append(seconds); results = changed(payload.get("results", []))
        related = [item for item in results if re.search(related_pattern, item["technical_name"], re.I)]
        coherent_total += len(results); coherent_related += len(related)
        score = len(related) / len(results) if results else 0
        rows.append({"category": "D", "query": query, "pass": score > 0.7, "coherence_score": score})
        print(f"D {query}: coherence={score:.1%}", flush=True)

    isolation_matches = 0
    isolation_pairs = [(RESTART_CASES[index], RESTART_CASES[(index + 1) % len(RESTART_CASES)]) for index in range(5)]
    for query_a, query_b in isolation_pairs:
        first, seconds = post(query_a); elapsed.append(seconds)
        _, seconds = post(query_b); elapsed.append(seconds)
        repeated, seconds = post(query_a); elapsed.append(seconds)
        equal = normalized_result(first) == normalized_result(repeated); isolation_matches += int(equal)
        rows.append({"category": "E", "query": query_a, "pass": equal, "isolation": equal})
        print(f"E {query_a}: isolation={equal}", flush=True)

    below_total = below_stable = 0
    for query in [case[2] for case in SELECTIVITY_CASES] + [case[0] for case in DIRECTION_CASES] * 2:
        payload, seconds = post(query); elapsed.append(seconds)
        log = anchor_log(query)
        by_name = {item["technical_name"]: item for item in payload.get("results", [])}
        for item in log.get("parameters", []):
            confidence, threshold = item.get("confidence"), item.get("threshold")
            if isinstance(confidence, (int, float)) and isinstance(threshold, (int, float)) and confidence < threshold:
                below_total += 1
                result = by_name.get(item["technical_name"], {})
                below_stable += int(same(result.get("current_value"), result.get("default")))
    threshold_respect = below_stable / below_total if below_total else 1.0
    rows.append({"category": "F", "query": "aggregate", "pass": threshold_respect > 0.95, "threshold_respect": threshold_respect, "below_threshold": below_total})

    neutral_total = neutral_moved = 0
    for query in NEUTRAL_CASES:
        payload, seconds = post(query); elapsed.append(seconds); results = payload.get("results", [])
        moved = len(changed(results)); neutral_total += len(results); neutral_moved += moved
        rows.append({"category": "G", "query": query, "pass": moved == 0, "neutral_violations": moved})
        print(f"G {query}: moved={moved}", flush=True)

    select_summary = defaultdict(lambda: [0, 0])
    for case in select_cases(dataset):
        payload, seconds = post(case["query"]); elapsed.append(seconds)
        selected = next((item for item in payload.get("results", []) if item.get("technical_name") == case["target"]), None)
        correct = bool(selected and str(selected.get("current_value")) == case["expected"])
        select_summary[case["typing"]][0] += int(correct); select_summary[case["typing"]][1] += 1
        rows.append({"category": "I", "query": case["query"], "pass": correct, "typing": case["typing"]})
        print(f"I {case['typing']} {case['target']}: {correct}", flush=True)

    restart_matches = 0
    for query in RESTART_CASES:
        first, seconds = post(query); elapsed.append(seconds)
        second, seconds = post(query); elapsed.append(seconds)
        equal = normalized_result(first) == normalized_result(second); restart_matches += int(equal)
        rows.append({"category": "J", "query": query, "pass": equal, "restart_determinism": equal})

    selectivities = [row["selectivity"] for row in rows if row["category"] == "A"]
    coherence = coherent_related / coherent_total if coherent_total else 0
    metrics = {
        "selectivity": sum(selectivities) / len(selectivities),
        "direction_agreement": directed_correct / directed_total if directed_total else 0,
        "negative_precision": unrelated_unchanged / unrelated_total if unrelated_total else 1.0,
        "isolation_determinism": isolation_matches / len(isolation_pairs),
        "threshold_respect": threshold_respect,
        "neutral_violations": neutral_moved / neutral_total if neutral_total else 0,
        "coherence_score": coherence,
        "restart_determinism": restart_matches / len(RESTART_CASES),
    }
    targets = {"selectivity": "20–40%", "direction_agreement": ">80%", "negative_precision": ">90%", "isolation_determinism": "=100%", "threshold_respect": ">95%", "neutral_violations": "<5%", "coherence_score": ">70%", "restart_determinism": "=100%"}
    passed = {
        "selectivity": 0.2 <= metrics["selectivity"] <= 0.4,
        "direction_agreement": metrics["direction_agreement"] > 0.8,
        "negative_precision": metrics["negative_precision"] > 0.9,
        "isolation_determinism": metrics["isolation_determinism"] == 1,
        "threshold_respect": metrics["threshold_respect"] > 0.95,
        "neutral_violations": metrics["neutral_violations"] < 0.05,
        "coherence_score": metrics["coherence_score"] > 0.7,
        "restart_determinism": metrics["restart_determinism"] == 1,
    }
    lines = [
        "# Stage 4 test report", "", f"Дата: {datetime.now().astimezone().isoformat(timespec='seconds')}", "",
        "Все запросы выполнены строго последовательно; каждый HTTP-вызов запускает новый Python bridge process.", "", "## Метрики", "",
        "| Метрика | Значение | Target | Pass |", "|---|---:|---:|:---:|",
    ]
    for name, value in metrics.items():
        lines.append(f"| `{name}` | {value:.1%} | {targets[name]} | {'✅' if passed[name] else '❌'} |")
    lines.extend(["", "## Select coverage", ""])
    for typing in ("nominal", "ordinal", "untyped"):
        correct, total = select_summary[typing]
        lines.append(f"- {typing}: **{correct}/{total}**")
    lines.extend(["", f"Среднее время запроса: **{sum(elapsed) / len(elapsed):.3f} с**", "", "## Результаты по категориям", ""])
    for category in "ABCDEFGHIJ":
        category_rows = [row for row in rows if row["category"] == category]
        if category_rows:
            lines.append(f"- {category}: **{sum(bool(row['pass']) for row in category_rows)}/{len(category_rows)}**")
    lines.extend(["", "## Логи", "", "Anchor diagnostics: `reports/stage4_anchor_logs/*.json`.", ""])
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"metrics": metrics, "select": dict(select_summary), "report": str(REPORT)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
