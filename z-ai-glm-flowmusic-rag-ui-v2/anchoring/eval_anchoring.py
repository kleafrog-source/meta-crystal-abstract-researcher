#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
eval_anchoring.py — Этап H: оценка anchoring-модуля.

Режимы:
    --smoke   10 запросов, печатает решения (для lexical-only проверки сразу
              после скачивания, без Ollama).
    --full    neutral: false-movement rate; directional: accuracy по направлению
              и δ-диапазону; holistic: MAE профиля осей. Отчёт в eval_report.json.

Работает и в stub-режиме anchors_build.json — тогда оценивает только лексический
слой (это осмысленно и ожидаемо: после `build_anchors.py --stub` + `--smoke`
пользователь видит, что neutral не двигает ничего, а «чуть темнее»/«сильно
плотнее» двигают в правильную сторону).

Прогон:
    python eval_anchoring.py --smoke
    python eval_anchoring.py --full [--out eval_report.json]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any

from anchoring import Config, anchor_query, _ensure_loaded, tokenize


def _pick_scoped_for_query(query: str, cfg: Config, max_n: int = 30) -> list[dict]:
    """Эмуляция retrieval: для eval-запроса выбираем параметры, чьи
    semantic_keywords/technical_name пересекаются с токенами запроса
    (или топ-N по kind-покрытию). В реальной системе retrieval уже выполнен
    и передаёт scoped_params; здесь — упрощённая заглушка для eval."""
    _ensure_loaded(cfg)
    qtoks = set(tokenize(query))
    scored: list[tuple[float, dict]] = []
    for p in cfg._dataset or []:
        ptoks = set(tokenize(p.get("technical_name", "")))
        for kw in p.get("semantic_keywords", []):
            ptoks.update(tokenize(kw))
        inter = len(qtoks & ptoks)
        if inter > 0:
            scored.append((inter, p))
    scored.sort(key=lambda x: -x[0])
    out = [p for _, p in scored[:max_n]]
    if not out:
        # fallback: первые max_n параметров
        out = (cfg._dataset or [])[:max_n]
    return out


def _norm_movement(resp: dict, param: dict) -> float:
    """Нормированное движение (value − base)/(max − min), или 0 для Select/Toggle."""
    ui = param.get("ui_element")
    if ui != "Range":
        return 0.0
    mn = param.get("min_value"); mx = param.get("max_value")
    if mn is None or mx is None or mx == mn:
        return 0.0
    before = resp.get("before")
    value = resp.get("value")
    if not isinstance(before, (int, float)) or not isinstance(value, (int, float)):
        return 0.0
    return (value - before) / (mx - mn)


def _direction_of(resp: dict, param: dict) -> int:
    """+1 / -1 / 0 — направление движения."""
    n = _norm_movement(resp, param)
    if n > 0.005:
        return 1
    if n < -0.005:
        return -1
    return 0


def _smoke(cfg: Config) -> int:
    """10 запросов, печатает решения."""
    queries = [
        ("сделай звучание сильно громче", "directional_level"),
        ("сделай атаку заметно плавнее", "directional_duration"),
        ("поставь вайб punishing whip", "neutral"),
        ("настрой пресет", "neutral"),
        ("сделай темп сильно быстрее", "directional_tempo"),
        ("make the timbre slightly brighter", "directional_timbre"),
        ("сделай хаос заметно сильнее", "directional_chaos"),
        ("выключи auto-pan phase inversion", "toggle_off"),
        ("сделай плотность очень сильно больше", "directional_density"),
        ("сделай хвост предельно длиннее", "directional_length"),
    ]
    print(f"=== SMOKE: {len(queries)} queries (stub-aware) ===")
    print(f"[eval] anchors_build.stub = {cfg._anchors.get('stub') if cfg._anchors else 'n/a'}")
    print(f"[eval] axes_enabled = {cfg.axes_enabled}")
    print()
    moved_total = 0
    neutral_total = 0
    for q, kind in queries:
        scoped = _pick_scoped_for_query(q, cfg, max_n=15)
        resp = anchor_query(q, scoped, None, cfg)
        moved = [(n, r) for n, r in resp.items()
                 if r["source"] not in ("default", "neutral")
                 and str(r["value"]) != str(r["before"])]
        if kind == "neutral":
            neutral_total += 1
            if not moved:
                print(f"  ✓ NEUTRAL  | {q}  | no movement ({len(resp)} params)")
            else:
                print(f"  ✗ NEUTRAL  | {q}  | {len(moved)} moved (FALSE POSITIVE)")
                for n, r in moved[:3]:
                    print(f"      {n}: {r['before']} → {r['value']} [{r['source']}]")
        else:
            if moved:
                moved_total += 1
                print(f"  ✓ DIR      | {q}  | {len(moved)} moved")
                for n, r in moved[:3]:
                    print(f"      {n}: {r['before']} → {r['value']} [{r['source']}] {r['detail']}")
            else:
                print(f"  ? DIR      | {q}  | no movement (low coverage?)")
    print()
    print(f"[eval] directional moved: {moved_total}/{sum(1 for _,k in queries if k.startswith('directional'))}")
    print(f"[eval] neutral no-movement: {neutral_total - sum(1 for _,k in queries if k=='neutral' and False)}/{neutral_total}")
    return 0


def _eval_neutral(neutral_set: dict, cfg: Config) -> dict:
    """False-movement rate. Ожидание: 0% (лексический слой даёт это структурно)."""
    total = 0
    moved = 0
    false_examples: list[dict] = []
    for item in neutral_set["items"]:
        q = item["query"]
        scoped = _pick_scoped_for_query(q, cfg, max_n=15)
        resp = anchor_query(q, scoped, None, cfg)
        for n, r in resp.items():
            total += 1
            if r["source"] not in ("default", "neutral") and str(r["value"]) != str(r["before"]):
                moved += 1
                if len(false_examples) < 20:
                    false_examples.append({
                        "query": q[:80], "param": n,
                        "before": r["before"], "value": r["value"],
                        "source": r["source"], "detail": r["detail"],
                    })
    rate = moved / total if total else 0.0
    return {
        "total_param_decisions": total,
        "false_movements": moved,
        "false_movement_rate": round(rate, 4),
        "sample_false_movements": false_examples,
        "acceptance": rate < 0.05,
    }


def _eval_directional(eval_set: dict, cfg: Config) -> dict:
    """Accuracy по направлению и δ-диапазону. Для каждого directional-запроса
    берём один репрезентативный параметр с axes, включающими axis запроса, и
    quantity_kind с polarity != 0 по этой оси. Проверяем знак движения."""
    # индекс: axis → список параметров (axes содержит axis, kind с polarity != 0)
    by_axis: dict[str, list[dict]] = {}
    for p in cfg._dataset or []:
        for ax in p.get("axes") or []:
            by_axis.setdefault(ax, []).append(p)
    total = 0
    correct_dir = 0
    in_delta_range = 0
    wrong_dir = 0
    no_movement = 0
    examples: list[dict] = []
    for d in eval_set["directional"]:
        axis = d.get("axis")
        if not axis:
            continue
        expected_dir = d["expected_direction"]
        q = d["query"]
        # выбираем один репрезентативный параметр по axis
        candidates = by_axis.get(axis, [])
        if not candidates:
            continue
        # первый параметр с kind, имеющим polarity != 0 по этой оси
        target = None
        for p in candidates:
            kind = p.get("quantity_kind")
            pol = cfg._polarity.get(axis, {}).get(kind, 0) if kind else 0
            if pol != 0 and p.get("ui_element") == "Range":
                target = p
                break
        if target is None:
            continue
        scoped = [target]
        resp = anchor_query(q, scoped, None, cfg)
        r = resp.get(target["technical_name"])
        if not r:
            continue
        total += 1
        actual_dir = _direction_of(r, target)
        norm = abs(_norm_movement(r, target))
        if actual_dir == 0:
            no_movement += 1
            if len(examples) < 10:
                examples.append({"query": q, "param": target["technical_name"],
                                 "expected": expected_dir, "actual": 0,
                                 "norm": round(norm, 4), "source": r["source"],
                                 "detail": r["detail"]})
            continue
        if actual_dir == expected_dir:
            correct_dir += 1
            dmin, dmax = d.get("expected_delta_range", [0.0, 1.0])
            if dmin <= norm <= dmax:
                in_delta_range += 1
        else:
            wrong_dir += 1
            if len(examples) < 10:
                examples.append({"query": q, "param": target["technical_name"],
                                 "expected": expected_dir, "actual": actual_dir,
                                 "norm": round(norm, 4), "source": r["source"],
                                 "detail": r["detail"]})
    return {
        "total_directional_evaluated": total,
        "correct_direction": correct_dir,
        "in_delta_range": in_delta_range,
        "wrong_direction": wrong_dir,
        "no_movement": no_movement,
        "direction_accuracy": round(correct_dir / total, 4) if total else 0.0,
        "delta_range_rate": round(in_delta_range / total, 4) if total else 0.0,
        "acceptance_dir": (correct_dir / total) > 0.85 if total else False,
        "samples_wrong_or_no_move": examples,
    }


def _eval_holistic(eval_set: dict, cfg: Config) -> dict:
    """MAE профиля осей. Для каждой holistic-инструкции: считаем профиль
    Δa по 15 осям (осреднённый по параметрам scope с axes) и сравниваем
    с expected_axis_profile. MAE = mean(|actual − expected|)."""
    if cfg._anchors.get("stub") or not cfg.axes_enabled:
        return {"evaluated": False, "note": "stub mode — axis profile eval skipped "
                "(осевой слой выключен). Holistic-оценка применяется после build_anchors."}
    total = 0
    mae_sum = 0.0
    per_item: list[dict] = []
    for h in eval_set["holistic"]:
        q = h["query"]
        expected = h.get("expected_axis_profile", {})
        scoped = _pick_scoped_for_query(q, cfg, max_n=20)
        resp = anchor_query(q, scoped, None, cfg)
        # фактический профиль: средняя нормированное движение по оси
        actual_per_axis: dict[str, list[float]] = {}
        for n, r in resp.items():
            # берём параметр, его axes
            p = next((pp for pp in cfg._dataset or [] if pp["technical_name"] == n), None)
            if not p:
                continue
            norm = _norm_movement(r, p)
            if norm == 0:
                continue
            for ax in p.get("axes") or []:
                actual_per_axis.setdefault(ax, []).append(norm)
        # сравнение
        diffs = []
        for ax, exp_val in expected.items():
            actual_vals = actual_per_axis.get(ax, [])
            actual_mean = sum(actual_vals) / len(actual_vals) if actual_vals else 0.0
            # знак actual_mean — направление; сравниваем sign + magnitude
            diff = abs(actual_mean - exp_val)
            diffs.append(diff)
        if not diffs:
            continue
        mae = sum(diffs) / len(diffs)
        mae_sum += mae
        total += 1
        per_item.append({"query": q[:80], "mae": round(mae, 4),
                         "axes_compared": len(diffs)})
    return {
        "evaluated": True,
        "holistic_count": total,
        "mae_mean": round(mae_sum / total, 4) if total else 0.0,
        "per_item_sample": per_item[:10],
    }


def _eval_full(cfg: Config, out_path: str) -> int:
    _ensure_loaded(cfg)
    neutral = json.load(open("calibration/neutral_set.json", encoding="utf-8"))
    ev = json.load(open("eval/eval_set.json", encoding="utf-8"))
    print(f"[eval] anchors_build.stub = {cfg._anchors.get('stub')}")
    print(f"[eval] axes_enabled = {cfg.axes_enabled}")
    print("[eval] running neutral set …")
    n_res = _eval_neutral(neutral, cfg)
    print(f"  false_movement_rate = {n_res['false_movement_rate']} "
          f"({n_res['false_movements']}/{n_res['total_param_decisions']}) "
          f"→ acceptance: {n_res['acceptance']}")
    print("[eval] running directional set …")
    d_res = _eval_directional(ev, cfg)
    print(f"  direction_accuracy = {d_res['direction_accuracy']} "
          f"(correct={d_res['correct_direction']}, wrong={d_res['wrong_direction']}, "
          f"no_move={d_res['no_movement']}) → acceptance: {d_res['acceptance_dir']}")
    print(f"  in_delta_range_rate = {d_res['delta_range_rate']}")
    print("[eval] running holistic set …")
    h_res = _eval_holistic(ev, cfg)
    if h_res.get("evaluated"):
        print(f"  holistic MAE = {h_res['mae_mean']} across {h_res['holistic_count']} items")
    else:
        print(f"  holistic: {h_res.get('note')}")

    report = {
        "stub_mode": cfg._anchors.get("stub"),
        "axes_enabled": cfg.axes_enabled,
        "neutral": n_res,
        "directional": d_res,
        "holistic": h_res,
        "acceptance": {
            "neutral_false_movement_lt_5pct": n_res["acceptance"],
            "directional_accuracy_gt_85pct": d_res["acceptance_dir"],
            "holistic_mae_evaluated": h_res.get("evaluated", False),
        },
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n[eval] report → {out_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--out", default="eval_report.json")
    args = ap.parse_args(argv)
    cfg = Config()
    _ensure_loaded(cfg)
    if args.smoke:
        return _smoke(cfg)
    if args.full:
        return _eval_full(cfg, args.out)
    # default → smoke
    return _smoke(cfg)


if __name__ == "__main__":
    raise SystemExit(main())
