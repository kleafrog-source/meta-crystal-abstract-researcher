#!/usr/bin/env python3
"""Sequential semantic matrix audit for all V3 UI types and canonical units."""

from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "data/combinatorial-genesis/v3/dataset.json"
NUMERIC_UNITS = ROOT / "data/combinatorial-genesis/v3/anchoring/lexical/numeric_units.json"
ENDPOINT = "http://localhost:3000/api/rag-v3/propose-parameters"
PHASE = sys.argv[1] if len(sys.argv) > 1 else "BEFORE"
GROUP_FILTER = sys.argv[2] if len(sys.argv) > 2 else None
REPORT = ROOT / "reports" / f"RAG_V3_SEMANTIC_MATRIX_2026-10-08_{PHASE}{'_' + GROUP_FILTER if GROUP_FILTER else ''}.md"
TOP_K_VALUES = [8, 12, 20, 30, 50]


def same(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-9)
    return str(a) == str(b)


def post(query, top_k):
    body = json.dumps({"query": query, "top_k": top_k, "current_values": {}, "instruction_context": [], "sources": {"library": True, "frozen": True, "atoms": True, "generated": True}}).encode()
    request = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json"}, method="POST")
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.load(response), time.perf_counter() - started


def distinct(items, key):
    seen = set(); result = []
    for item in items:
        value = key(item)
        if value and value not in seen:
            seen.add(value); result.append(item)
    return result


def build_cases(dataset):
    by_ui = defaultdict(list)
    for item in dataset:
        by_ui[str(item.get("ui_element"))].append(item)
    cases = []

    range_items = [x for x in by_ui["Range"] if x.get("min_value") is not None and x.get("max_value") is not None and x.get("default") is not None and (x.get("description_en") or x.get("description_ru"))]
    range_items = distinct([x for x in range_items if re.search(r"higher values|lower values|high values|low values|высокие значения|низкие значения", f"{x.get('description_en','')} {x.get('description_ru','')}", re.I)], lambda x: x.get("quantity_kind") or x.get("unit"))[:10]
    for i, item in enumerate(range_items):
        high = i % 2 == 0
        desc = str(item.get("description_en") or item.get("description_ru"))
        markers = list(re.finditer(r"lower values?|low values?|higher values?|high values?|низкие значения|высокие значения", desc, re.I))
        wanted = re.compile(r"higher values?|high values?|высокие значения" if high else r"lower values?|low values?|низкие значения", re.I)
        selected_index = next((index for index, match in enumerate(markers) if wanted.fullmatch(match.group(0))), 0)
        selected = markers[selected_index]
        end = markers[selected_index + 1].start() if selected_index + 1 < len(markers) else len(desc)
        outcome = desc[selected.end():end].strip(" ,;:.-")
        outcome = re.sub(r"\bwhile\b$", "", outcome, flags=re.I).strip(" ,;:.-")
        query = f"Make the sound {outcome}"
        cases.append({"group": "Range", "target": item["technical_name"], "query": query, "expect": "up" if high else "down", "description": desc})

    select_items = distinct([x for x in by_ui["Select"] if len(x.get("options") or []) >= 2], lambda x: next((str(o) for o in x.get("options", []) if str(o) != str(x.get("default"))), None))[:10]
    for item in select_items:
        option = next(str(o) for o in item["options"] if str(o) != str(item.get("default")) )
        cases.append({"group": "Select", "target": item["technical_name"], "query": f"Use {option.replace('_', ' ')} mode for this sound", "expect": option, "description": item.get("description_en") or ""})

    toggle_items = by_ui["Toggle"][:10]
    for i, item in enumerate(toggle_items):
        enable = i % 2 == 0
        concept = ((item.get("semantic_keywords") or [""])[0] or item["technical_name"].replace("_", " "))
        cases.append({"group": "Toggle", "target": item["technical_name"], "query": f"{'Enable' if enable else 'Disable'} {concept}", "expect": 1 if enable else 0, "description": item.get("description_en") or ""})

    for ui in ("Text", "String", "Array"):
        items = by_ui[ui]
        for i in range(10):
            item = items[i % len(items)]
            concept = ((item.get("semantic_keywords") or [""])[i % max(1, len(item.get("semantic_keywords") or []))] if item.get("semantic_keywords") else item["technical_name"].replace("_", " "))
            cases.append({"group": ui, "target": item["technical_name"], "query": f"Create a sound with {concept}", "expect": "unchanged", "description": item.get("description_en") or ""})

    units = json.loads(NUMERIC_UNITS.read_text(encoding="utf-8"))["unit_synonyms"]
    for canonical, info in units.items():
        aliases = {canonical.lower(), str(info.get("canonical", "")).lower(), *(str(x).lower() for x in info.get("aliases", []))}
        item = next((x for x in by_ui["Range"] if str(x.get("unit") or "").lower() in aliases and isinstance(x.get("min_value"), (int, float)) and isinstance(x.get("max_value"), (int, float))), None)
        if not item:
            continue
        mn, mx = float(item["min_value"]), float(item["max_value"])
        value = mn + 0.73 * (mx - mn)
        alias = canonical
        concept = ((item.get("semantic_keywords") or [item["technical_name"].replace("_", " ")])[0])
        cases.append({"group": "Unit", "unit_group": canonical, "target": item["technical_name"], "query": f"Set {concept} to {value:g} {alias}", "expect": value, "description": item.get("description_en") or ""})

    complex_queries = [
        ("Make the sound much brighter, sharper and more airy without increasing loudness", "up"),
        ("Сделай звук заметно темнее, мягче и менее резким", "down"),
        ("Create a very wide deep stereo space with slow evolving motion", "up"),
        ("Сузь стереополе почти до моно и уменьши пространственное движение", "down"),
        ("Increase rhythmic density and speed while keeping dynamics controlled", "up"),
        ("Сделай ритм разреженным, медленным и спокойным", "down"),
        ("Add strong roughness, distortion and unstable chaotic texture", "up"),
        ("Уменьши хаос и шероховатость, сделай тембр чистым и стабильным", "down"),
        ("Give the sound a long smooth attack and lingering decay", "up"),
        ("Сделай атаку мгновенной, а затухание очень коротким", "down"),
    ]
    for query, direction in complex_queries:
        cases.append({"group": "Complex", "target": None, "query": query, "expect": direction, "description": ""})
    return cases, by_ui


def evaluate(case, results):
    target = next((x for x in results if x.get("technical_name") == case.get("target")), None)
    changed = [x for x in results if not same(x.get("current_value"), x.get("default"))]
    correct = False; direction = "n/a"
    if case["group"] == "Complex":
        correct = len(changed) > 0
        direction = f"changed={len(changed)}"
    elif not target:
        direction = "target_not_retrieved"
    elif case["expect"] == "unchanged":
        correct = same(target.get("current_value"), target.get("default")); direction = "unchanged" if correct else "changed"
    elif case["expect"] in ("up", "down") and isinstance(target.get("current_value"), (int, float)) and isinstance(target.get("default"), (int, float)):
        delta = float(target["current_value"]) - float(target["default"]); direction = "up" if delta > 0 else "down" if delta < 0 else "default"
        correct = direction == case["expect"]
    else:
        expected = case["expect"]; actual = target.get("current_value"); tolerance = max(float(target.get("step") or 0), 1e-6)
        correct = (isinstance(actual, (int, float)) and isinstance(expected, (int, float)) and abs(float(actual) - float(expected)) <= tolerance) or str(actual) == str(expected)
        direction = "match" if correct else "mismatch"
    return target, changed, correct, direction


def main():
    dataset = json.loads(DATASET.read_text(encoding="utf-8")); cases, by_ui = build_cases(dataset)
    if GROUP_FILTER:
        cases = [case for case in cases if case["group"].lower() == GROUP_FILTER.lower()]
    records = []
    for index, case in enumerate(cases, 1):
        top_k = TOP_K_VALUES[(index - 1) % len(TOP_K_VALUES)]
        print(f"[{index:02d}/{len(cases)}] {case['group']} K={top_k}: {case['query'][:90]}", flush=True)
        try:
            payload, elapsed = post(case["query"], top_k); results = payload.get("results") or []
            target, changed, correct, direction = evaluate(case, results)
            records.append({**case, "top_k": top_k, "elapsed": elapsed, "results": results, "target_result": target, "changed_count": len(changed), "correct": correct, "direction": direction})
            print(f"  target={bool(target)} direction={direction} correct={correct} changed={len(changed)}/{len(results)} {elapsed:.1f}s", flush=True)
        except Exception as exc:
            records.append({**case, "top_k": top_k, "error": str(exc), "results": [], "correct": False})
            print(f"  ERROR {exc}", flush=True)

    summaries = {}
    for group in ("Range", "Select", "Toggle", "Text", "String", "Array", "Unit", "Complex"):
        rows = [r for r in records if r["group"] == group]
        summaries[group] = (sum(bool(r.get("correct")) for r in rows), len(rows), sum(bool(r.get("target_result")) for r in rows))
    units = Counter(str(x.get("unit") or "<empty>") for x in dataset)
    lines = [f"# RAG V3 semantic matrix — {PHASE}", "", f"Дата: {datetime.now().astimezone().isoformat(timespec='seconds')}", "", "Все API-запросы выполнены строго последовательно.", "", "## Dataset", "", f"- Всего: {len(dataset)}", f"- UI: {dict((k, len(v)) for k, v in by_ui.items())}", f"- Уникальных unit: {len(units)}", "", "## Сводка", "", "| Группа | корректно | target retrieved |", "|---|---:|---:|"]
    for group, (ok, total, found) in summaries.items(): lines.append(f"| {group} | {ok}/{total} | {found}/{total} |")
    lines += ["", "## Тесты", ""]
    for index, row in enumerate(records, 1):
        target = row.get("target_result") or {}
        lines += [f"### {index}. {row['group']} · Top-K {row['top_k']}", "", f"- Query: `{row['query']}`", f"- Target: `{row.get('target')}`", f"- Expected: `{row.get('expect')}`", f"- Retrieved: **{'да' if row.get('target_result') else 'нет'}**", f"- Value/default: `{target.get('current_value')}` / `{target.get('default')}`", f"- Source: `{target.get('source')}`", f"- Direction/result: `{row.get('direction')}`", f"- Correct: **{'да' if row.get('correct') else 'нет'}**", f"- Changed in Top-K: {row.get('changed_count', 0)}/{len(row.get('results', []))}", ""]
    REPORT.parent.mkdir(parents=True, exist_ok=True); REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"SUMMARY={summaries}", flush=True); print(f"REPORT={REPORT}", flush=True)


if __name__ == "__main__": main()
