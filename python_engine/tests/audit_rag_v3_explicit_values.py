#!/usr/bin/env python3
"""Sequential V3 retrieval/anchoring audit. Never sends concurrent requests."""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path


ENDPOINT = "http://localhost:3000/api/rag-v3/propose-parameters"
REPORT = Path(__file__).resolve().parents[2] / "reports" / "RAG_V3_EXPLICIT_VALUE_AUDIT_2026-10-08_POST_FIX.md"

TESTS = [
    ("acoustic_feature_attack_density", 0.82, 3, "Set acoustic_feature_attack_density to 0.82"),
    ("basic_amplitude_envelope_attack_ms", 640, 5, "Set basic_amplitude_envelope_attack_ms to 640 ms"),
    ("spectral_smoothing_attack_time", 48.0, 8, "Set spectral_smoothing_attack_time to 48 ms"),
    ("resonant_body_excitation_attack_damping", 0.84, 12, "Set resonant_body_excitation_attack_damping to 0.84"),
    ("stereo_width_chorus_flanger_depth", 0.95, 20, "Set stereo_width_chorus_flanger_depth to 0.95"),
    ("psychoacoustic_loudness_sharpness_ratio", 1.50, 30, "Set psychoacoustic_loudness_sharpness_ratio to 1.5"),
    ("stereo_width_coefficient_ratio", 1.60, 50, "Set stereo_width_coefficient_ratio to 1.6"),
    ("acoustic_feature_attack_density", 0.18, 5, "Установи acoustic_feature_attack_density на 0.18"),
    ("basic_amplitude_envelope_attack_ms", 1250, 8, "Установи basic_amplitude_envelope_attack_ms ровно 1250 ms"),
    ("spectral_smoothing_attack_time", 155.0, 12, "Установи spectral_smoothing_attack_time ровно 155 ms"),
    ("resonant_body_excitation_attack_damping", 0.08, 20, "Установи resonant_body_excitation_attack_damping на 0.08"),
    ("stereo_width_chorus_flanger_depth", 0.15, 30, "Установи stereo_width_chorus_flanger_depth на 0.15"),
    ("psychoacoustic_loudness_sharpness_ratio", 0.20, 50, "Установи psychoacoustic_loudness_sharpness_ratio на 0.2"),
    ("stereo_width_coefficient_ratio", 0.35, 3, "Установи stereo_width_coefficient_ratio на 0.35"),
    ("acoustic_feature_attack_density", 0.93, 8, "acoustic_feature_attack_density: 0.93"),
    ("basic_amplitude_envelope_attack_ms", 80, 12, "basic_amplitude_envelope_attack_ms: 80"),
    ("spectral_smoothing_attack_time", 12.5, 20, "spectral_smoothing_attack_time: 12.5"),
    ("resonant_body_excitation_attack_damping", 0.67, 30, "resonant_body_excitation_attack_damping: 0.67"),
    ("stereo_width_chorus_flanger_depth", 0.40, 50, "stereo_width_chorus_flanger_depth: 0.40"),
    ("stereo_width_coefficient_ratio", 1.85, 100, "stereo_width_coefficient_ratio: 1.85"),
]


def same(left, right) -> bool:
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isclose(float(left), float(right), rel_tol=1e-9, abs_tol=1e-9)
    return str(left) == str(right)


def request_v3(query: str, top_k: int) -> tuple[dict, float]:
    body = json.dumps({
        "query": query,
        "top_k": top_k,
        "current_values": {},
        "instruction_context": [],
        "sources": {"library": True, "frozen": True, "atoms": True, "generated": True},
    }).encode("utf-8")
    request = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json"}, method="POST")
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.load(response), time.perf_counter() - started


def main() -> int:
    cases = []
    for index, (target, expected, top_k, query) in enumerate(TESTS, 1):
        print(f"[{index:02d}/20] Top-K {top_k}: {query}", flush=True)
        try:
            payload, elapsed = request_v3(query, top_k)
            results = payload.get("results") or []
            selected = next((item for item in results if item.get("technical_name") == target), None)
            target_found = selected is not None
            target_changed = target_found and not same(selected.get("current_value"), selected.get("default"))
            tolerance = max(float(selected.get("step") or 0), 1e-9) if selected else 1e-9
            value_correct = bool(target_found and isinstance(selected.get("current_value"), (int, float)) and abs(float(selected["current_value"]) - float(expected)) <= tolerance + 1e-9)
            changed = sum(not same(item.get("current_value"), item.get("default")) for item in results)
            cases.append({"index": index, "query": query, "top_k": top_k, "target": target, "expected": expected, "elapsed": elapsed, "target_found": target_found, "target_value": selected.get("current_value") if selected else None, "target_default": selected.get("default") if selected else None, "target_source": selected.get("source") if selected else None, "target_detail": selected.get("detail") if selected else None, "target_changed": target_changed, "value_correct": value_correct, "changed": changed, "defaults": len(results) - changed, "results": results})
            print(f"  found={target_found} value={selected.get('current_value') if selected else None} correct={value_correct} changed/default={changed}/{len(results)-changed} elapsed={elapsed:.1f}s", flush=True)
        except Exception as exc:
            cases.append({"index": index, "query": query, "top_k": top_k, "target": target, "expected": expected, "error": str(exc), "results": []})
            print(f"  ERROR: {exc}", flush=True)

    successful = [case for case in cases if "error" not in case]
    total_results = sum(len(case["results"]) for case in successful)
    total_changed = sum(case.get("changed", 0) for case in successful)
    lines = [
        "# Flowmusic Genesis V3 — аудит явных значений BGE-M3",
        "",
        f"Дата: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        "",
        "Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.",
        "",
        "## Сводка",
        "",
        f"- Успешных HTTP-запросов: **{len(successful)}/20**",
        f"- Целевой technical_name найден: **{sum(bool(case.get('target_found')) for case in successful)}/20**",
        f"- Запрошенное значение выставлено правильно: **{sum(bool(case.get('value_correct')) for case in successful)}/20**",
        f"- Все выбранные значения, отличающиеся от default: **{total_changed}/{total_results} ({(100 * total_changed / total_results if total_results else 0):.1f}%)**",
        "",
        "## Результаты",
        "",
    ]
    for case in cases:
        lines += [f"### Тест {case['index']} · Top-K {case['top_k']}", "", f"Запрос: `{case['query']}`", ""]
        if "error" in case:
            lines += [f"Ошибка: `{case['error']}`", ""]
            continue
        lines += [
            f"Цель: `{case['target']}` → ожидалось `{case['expected']}`",
            f"Найдена: **{'да' if case['target_found'] else 'нет'}**; результат: `{case['target_value']}`; default: `{case['target_default']}`; отличается от default: **{'да' if case['target_changed'] else 'нет'}**; запрос выполнен правильно: **{'да' if case['value_correct'] else 'нет'}**.",
            f"Весь Top-K: изменено **{case['changed']}**, осталось default **{case['defaults']}**. Время: {case['elapsed']:.1f} с.",
            "",
            "| # | parameter | value | default | отличается | source |",
            "|---:|---|---:|---:|:---:|---|",
        ]
        for rank, item in enumerate(case["results"], 1):
            changed = not same(item.get("current_value"), item.get("default"))
            lines.append(f"| {rank} | `{item.get('technical_name')}` | `{item.get('current_value')}` | `{item.get('default')}` | {'да' if changed else 'нет'} | `{item.get('source')}` |")
        lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"REPORT={REPORT}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
