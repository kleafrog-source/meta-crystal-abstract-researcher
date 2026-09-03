#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
anchoring.py — Этап G: runtime-модуль определения значений параметров.

API:
    anchor_query(query, scoped_params, current_values, cfg) -> AnchorResponse

Слои (точный порядок, см. раздел 2.1 задания):
    L0  numeric/lexical preempt — «120 BPM», «+6 dB», «7/16»
    L1  lexical direction+degree — словарь direction-слов per kind
    L2  axis projection (fallback) — только если L0/L1 не сработали
        и anchors_build.json не заглушка
    L3  применение формулы, clamp, snap, логирование источника решения

Зависимости: Python 3.10+, стандартная библиотека + Ollama-клиент из
build_anchors.py (для L2 эмбеддинга запроса). Без Ollama — рантайм работает
в lexical-only режиме (если anchors_build stub).

Сигнатура для интеграции в существующий retrieval-флоу:
    from anchoring import anchor_query, Config
    resp = anchor_query(query, scoped_params, current_values, Config(...))
    # resp = {param_name: {value, before, source, detail}}
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Any, Optional

# Импорт OllamaClient из build_anchors (тот же каталог)
try:
    from build_anchors import OllamaClient, cosine, _vec_dot, _vec_sub, _vec_normalize
    _HAS_OLLAMA_CLIENT = True
except ImportError:
    _HAS_OLLAMA_CLIENT = False
    OllamaClient = None  # type: ignore


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
@dataclass
class Config:
    gamma: float = 1.5              # глобальный gain
    epsilon_axis: float = 0.05     # гейт осевого движения
    axes_enabled: bool = True      # если stub → автоматически False
    use_meta_axis: bool = False    # semantic_control_strength модулирует γ (default off)
    dataset_path: str = "unified_parameters_enriched.json"
    axes_path: str = "axes.json"
    polarity_path: str = "polarity_matrix.json"
    anchors_path: str = "anchors_build.json"
    lexical_dir: str = "lexical"
    ollama_endpoint: str = "http://localhost:11434"
    ollama_model: str = "qllama/bge-m3:q8_0"
    # транзитно: загруженные артефакты (для повторных вызовов)
    _dataset: list | None = field(default=None, repr=False)
    _axes: dict | None = field(default=None, repr=False)
    _polarity: dict | None = field(default=None, repr=False)
    _anchors: dict | None = field(default=None, repr=False)
    _direction_lexicon: dict | None = field(default=None, repr=False)
    _degree_scale: dict | None = field(default=None, repr=False)
    _markers: dict | None = field(default=None, repr=False)
    _numeric_units: dict | None = field(default=None, repr=False)
    _ollama_client: Any | None = field(default=None, repr=False)
    _query_cache: dict[str, list[float]] = field(default_factory=dict, repr=False)


# ---------------------------------------------------------------------------
# Загрузка артефактов
# ---------------------------------------------------------------------------
def _load(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _ensure_loaded(cfg: Config) -> None:
    if cfg._dataset is None:
        cfg._dataset = _load(cfg.dataset_path)
    if cfg._axes is None:
        cfg._axes = _load(cfg.axes_path)
    if cfg._polarity is None:
        cfg._polarity = _load(cfg.polarity_path)
    if cfg._anchors is None:
        cfg._anchors = _load(cfg.anchors_path)
    if cfg._direction_lexicon is None:
        cfg._direction_lexicon = _load(os.path.join(cfg.lexical_dir, "direction_lexicon.json"))
    if cfg._degree_scale is None:
        cfg._degree_scale = _load(os.path.join(cfg.lexical_dir, "degree_scale.json"))
    if cfg._markers is None:
        cfg._markers = _load(os.path.join(cfg.lexical_dir, "markers.json"))
    if cfg._numeric_units is None:
        cfg._numeric_units = _load(os.path.join(cfg.lexical_dir, "numeric_units.json"))
    # если anchors — stub, отключаем оси
    if cfg._anchors.get("stub"):
        cfg.axes_enabled = False


# ---------------------------------------------------------------------------
# Токенизация
# ---------------------------------------------------------------------------
_STOP_RU = {"и", "в", "на", "с", "по", "для", "то", "это", "а", "но", "или",
            "как", "так", "что", "чтобы", "the", "a", "an", "of", "to", "in", "and"}
_TOKEN_RE = re.compile(r"[\wа-яА-ЯёЁ]+", re.U)


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text) if t.lower() not in _STOP_RU and len(t) > 1]


# ---------------------------------------------------------------------------
# L0: numeric/lexical preempt
# ---------------------------------------------------------------------------
_NUM_VALUE_RE = re.compile(
    r"([+\-−]?\d+(?:[.,]\d+)?)\s*(?:/\s*(\d+))?\s*([a-zA-Zа-яА-Я%]+)?"
)
_FRAC_RE = re.compile(r"\b(\d+)/(\d+)\b")


def _parse_number(s: str) -> float | None:
    s = s.replace(",", ".").replace("−", "-")
    try:
        return float(s)
    except ValueError:
        return None


def _normalize_unit(unit: str | None, numeric_units: dict) -> str | None:
    if not unit:
        return None
    u = unit.strip().lower()
    for canonical, info in numeric_units.get("unit_synonyms", {}).items():
        if u in [a.lower() for a in info.get("aliases", [])]:
            return info["canonical"]
        if u == canonical:
            return info["canonical"]
    return None


def _unit_to_kind(unit: str | None, numeric_units: dict) -> str | None:
    if not unit:
        return None
    u = unit.strip().lower()
    for canonical, info in numeric_units.get("unit_synonyms", {}).items():
        if u in [a.lower() for a in info.get("aliases", [])] or u == canonical:
            return info.get("quantity_kind")
    return None


def _find_option_match(query: str, param: dict) -> str | None:
    """Точный хит опции Select в запросе (L0-preempt)."""
    opts = param.get("options") or []
    ql = query.lower()
    for o in opts:
        if str(o).lower() in ql:
            return str(o)
    # проверяем aliases (nominal)
    aliases = param.get("option_aliases") or {}
    for opt, syns in aliases.items():
        for syn in syns:
            if syn.lower() in ql:
                return opt
    return None


def l0_numeric(query: str, param: dict, numeric_units: dict
               ) -> tuple[float | str | None, str]:
    """Возвращает (value, source). Применяется, если число + единица/дробь/опция
    совпадают с параметром."""
    # 1. exact option match (Select)
    if param.get("ui_element") == "Select":
        m = _find_option_match(query, param)
        if m is not None:
            return m, "numeric"
    # 2. fraction N/M
    for m in _FRAC_RE.finditer(query):
        num, den = int(m.group(1)), int(m.group(2))
        if den == 0:
            continue
        val = num / den
        # если у параметра есть option_positions (ordinal) — выбрать ближайшую
        if param.get("select_typing") == "ordinal":
            positions = param.get("option_positions") or []
            if positions:
                best = min(positions, key=lambda p: abs(p["position"] - val))
                # не применяем, если разница слишком велика (>0.5 норм. диапазона)
                if abs(best["position"] - val) <= 0.5:
                    return best["value"], "numeric"
        # иначе — если unit параметра подходит под fraction/ratio/length
        pu = (param.get("unit") or "").lower()
        if pu in ("ratio", "fraction", "bars", "") and param.get("ui_element") == "Range":
            mn = param.get("min_value"); mx = param.get("max_value")
            if mn is not None and mx is not None:
                return _clamp(val, mn, mx), "numeric"
    # 3. number + unit
    for m in _NUM_VALUE_RE.finditer(query):
        num_str, den_str, unit_str = m.group(1), m.group(2), m.group(3)
        num = _parse_number(num_str)
        if num is None:
            continue
        if den_str:
            try:
                num = num / int(den_str)
            except (ValueError, ZeroDivisionError):
                pass
        canonical = _normalize_unit(unit_str, numeric_units)
        if canonical is None:
            continue
        pu = (param.get("unit") or "").strip()
        if pu and pu.lower() == canonical.lower():
            mn = param.get("min_value"); mx = param.get("max_value")
            if mn is not None and mx is not None and param.get("ui_element") == "Range":
                return _clamp(num, mn, mx), "numeric"
        # match по quantity_kind
        kind = _unit_to_kind(unit_str, numeric_units)
        if kind and kind == param.get("quantity_kind") and param.get("ui_element") == "Range":
            mn = param.get("min_value"); mx = param.get("max_value")
            if mn is not None and mx is not None:
                return _clamp(num, mn, mx), "numeric"
    return None, "default"


# ---------------------------------------------------------------------------
# L1: lexical direction+degree
# ---------------------------------------------------------------------------
def _detect_direction_per_kind(query: str, direction_lexicon: dict
                              ) -> dict[str, float]:
    """Возвращает {kind: signed_delta} — для каждого kind сработавшие direction-слова.
    Если несколько direction-слов с разными знаками → суммируем signed-δ, итог
    δ = clamp(|Σ|, 0.15, 0.60), знак = sign(Σ)."""
    ql = query.lower()
    out: dict[str, float] = {}
    for kind, words in direction_lexicon.items():
        if kind == "_meta":
            continue
        inc = words.get("increase", [])
        dec = words.get("decrease", [])
        signed_sum = 0.0
        inc_hits = 0
        dec_hits = 0
        for w in inc:
            if w.lower() in ql:
                signed_sum += 1
                inc_hits += 1
        for w in dec:
            if w.lower() in ql:
                signed_sum -= 1
                dec_hits += 1
        if signed_sum == 0:
            continue
        sign = 1 if signed_sum > 0 else -1
        # если только одно направление — default-степень
        # если оба — clamp(|Σ|, 0.15, 0.60)
        if inc_hits > 0 and dec_hits > 0:
            mag = max(0.15, min(0.60, abs(signed_sum) * 0.30))
        else:
            mag = 0.30  # default; degree уточняется в _detect_degree
        out[kind] = sign * mag
    return out


def _detect_degree(query: str, degree_scale: dict) -> float:
    """Возвращает δ (0.20-0.60) по словам степени. Если несколько — берём макс.
    Если нет — degree_scale['default'] = 0.30."""
    ql = query.lower()
    best = degree_scale.get("default", 0.30)
    for lvl in degree_scale.get("levels", []):
        for w in lvl.get("words", []):
            if w.lower() in ql:
                if lvl["delta"] > best:
                    best = lvl["delta"]
    return best


def _detect_relative(query: str, markers: dict) -> bool:
    ql = query.lower()
    return any(w.lower() in ql for w in markers.get("relative_markers", []))


def _detect_neutral(query: str, markers: dict) -> bool:
    """Запрос из одних neutral-маркеров → не двигаем ничего."""
    ql = query.lower().strip()
    if not ql:
        return True
    neutral = [w.lower() for w in markers.get("neutral_markers", [])]
    # удаляем все neutral-маркеры из запроса
    remaining = ql
    for w in neutral:
        remaining = remaining.replace(w, "")
    # если после удаления остались только стоп-слова и пунктуация → neutral
    toks = tokenize(remaining)
    return len(toks) == 0


def _detect_attention(query: str, param: dict) -> bool:
    """Attention-фильтр (2.3): если токены запроса (без стоп-слов) пересекаются
    с токенами technical_name + semantic_keywords параметра — параметр
    attention-покрыт. Если хоть один параметр scope покрыт → двигаем только
    покрытые; иначе — все с direction-хитом по kind."""
    qtoks = set(tokenize(query))
    if not qtoks:
        return False
    ptoks = set(tokenize(param.get("technical_name", "")))
    for kw in param.get("semantic_keywords", []):
        ptoks.update(tokenize(kw))
    return bool(qtoks & ptoks)


def _detect_toggle(query: str, markers: dict, param: dict) -> bool | None:
    """Для Toggle: «включи/выключи» + пересечение токенов запроса с именем."""
    ql = query.lower()
    on_hits = sum(1 for w in markers.get("toggle_on", []) if w.lower() in ql)
    off_hits = sum(1 for w in markers.get("toggle_off", []) if w.lower() in ql)
    if on_hits == 0 and off_hits == 0:
        return None
    if param.get("ui_element") != "Toggle":
        return None
    # нужно пересечение токенов запроса с именем параметра
    if not _detect_attention(query, param):
        return None
    return on_hits > off_hits


# ---------------------------------------------------------------------------
# L2: axis projection
# ---------------------------------------------------------------------------
def _embed_query(query: str, cfg: Config) -> list[float] | None:
    if not cfg.axes_enabled or not _HAS_OLLAMA_CLIENT:
        return None
    if query in cfg._query_cache:
        return cfg._query_cache[query]
    if cfg._ollama_client is None:
        cfg._ollama_client = OllamaClient(cfg.ollama_endpoint, cfg.ollama_model)
    try:
        vec = cfg._ollama_client.embed(query)
        cfg._query_cache[query] = vec
        return vec
    except Exception:
        return None


def _polarity(axis: str, kind: str, polarity_matrix: dict,
              param: dict) -> int:
    if kind not in polarity_matrix.get(axis, {}):
        return 0
    pi = polarity_matrix[axis][kind]
    if pi == 0:
        return 0
    ov = param.get("polarity_override")
    if ov is not None:
        pi = pi * int(ov)
    return pi


def _axis_delta(ex: list[float], e_id: list[float],
                axis_vec: dict) -> float | None:
    u = axis_vec.get("u")
    if not u:
        return None
    kappa = axis_vec.get("kappa", 1.0)
    return kappa * _vec_dot(_vec_sub(ex, e_id), u)


def _param_eid(param_name: str, cfg: Config) -> list[float]:
    """Возвращает ē_id(p) — эмбеддинг-вектор параметра. В stub-режиме
    используем a_home как прокси (но оси всё равно выключены). В реальном
    режиме — пере-эмбеддим semantic_keywords (или кэшируем)."""
    if cfg._anchors.get("stub"):
        return []
    # кэш по имени параметра
    cache = getattr(cfg, "_param_eid_cache", None)
    if cache is None:
        cache = {}
        setattr(cfg, "_param_eid_cache", cache)
    if param_name in cache:
        return cache[param_name]
    # ищем параметр в датасете
    for p in cfg._dataset or []:
        if p["technical_name"] == param_name:
            kws = p.get("semantic_keywords") or []
            if not kws or not _HAS_OLLAMA_CLIENT:
                cache[param_name] = []
                return []
            if cfg._ollama_client is None:
                cfg._ollama_client = OllamaClient(cfg.ollama_endpoint, cfg.ollama_model)
            vecs = [cfg._ollama_client.embed(k) for k in kws]
            eid = [0.0] * len(vecs[0]) if vecs else []
            for v in vecs:
                for i, x in enumerate(v):
                    eid[i] += x
            eid = [x / len(vecs) for x in eid] if vecs else []
            cache[param_name] = eid
            return eid
    cache[param_name] = []
    return []


# ---------------------------------------------------------------------------
# Применение формулы
# ---------------------------------------------------------------------------
def _clamp(v: float, mn: float, mx: float) -> float:
    return max(mn, min(mx, v))


def _snap(v: float, step: float | None) -> float:
    if step is None or step <= 0:
        return v
    return round(v / step) * step


def _range_apply(param: dict, base: float, signed_delta_norm: float,
                cfg: Config) -> tuple[float, str]:
    """signed_delta_norm — в долях диапазона (max-min)."""
    mn = param["min_value"]
    mx = param["max_value"]
    step = param.get("step")
    span = (mx - mn) or 0.0
    v = _clamp(base + cfg.gamma * signed_delta_norm * span, mn, mx)
    v = _snap(v, step)
    v = _clamp(v, mn, mx)
    return v, "lexical" if signed_delta_norm != 0 else "default"


def _select_ordinal_apply(param: dict, base_pos: float,
                          signed_delta_norm: float, cfg: Config) -> tuple[str, str]:
    positions = param.get("option_positions") or []
    if not positions:
        return str(param.get("default", "")), "default"
    new_pos = _clamp(base_pos + cfg.gamma * signed_delta_norm, 0.0, 1.0)
    best = min(positions, key=lambda p: abs(p["position"] - new_pos))
    return best["value"], "lexical" if signed_delta_norm != 0 else "default"


def _select_nominal_apply(query: str, param: dict) -> tuple[str, str]:
    """Nominal → match по option_aliases; иначе default."""
    aliases = param.get("option_aliases") or {}
    ql = query.lower()
    for opt, syns in aliases.items():
        for syn in syns:
            if syn.lower() in ql:
                return opt, "lexical"
    # точное попадание опции
    m = _find_option_match(query, param)
    if m is not None:
        return m, "numeric"
    return str(param.get("default", "")), "default"


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------
def anchor_query(query: str,
                 scoped_params: list[dict],
                 current_values: dict[str, float | str] | None,
                 cfg: Config) -> dict[str, dict]:
    """Главный runtime-вход. Возвращает
    {param_name: {value, before, source, detail}}.

    scoped_params — выдача существующего retrieval (полные записи).
    current_values — состояние слайдеров сессии (для relative-base).
    """
    _ensure_loaded(cfg)
    current_values = current_values or {}
    query_norm = query.strip()
    if not query_norm:
        return {p["technical_name"]: {
            "value": current_values.get(p["technical_name"], p.get("default")),
            "before": current_values.get(p["technical_name"], p.get("default")),
            "source": "neutral",
            "detail": "empty query",
        } for p in scoped_params}

    # L1: detect direction per kind
    directions = _detect_direction_per_kind(query_norm, cfg._direction_lexicon)
    degree = _detect_degree(query_norm, cfg._degree_scale)
    is_relative = _detect_relative(query_norm, cfg._markers)
    is_neutral = _detect_neutral(query_norm, cfg._markers)

    # корректируем degree с учётом направлений: если direction есть без degree
    # → δ = 0.30 (default). Если degree есть — берём degree. Если несколько
    # направлений с разными знаками — magnitude уже учтён в _detect_direction_per_kind.
    # финальный signed_delta для kind = sign(direction[kind]) * degree (если degree
    # больше 0.30) — но если в directions[kind] уже учтён multi-sign clamp,
    # используем directions[kind] с заменой magnitude на max(|directions[kind]|, degree*sign)
    final_dir: dict[str, float] = {}
    for kind, signed in directions.items():
        sign = 1 if signed > 0 else (-1 if signed < 0 else 0)
        if sign == 0:
            continue
        # magnitude: если в directions есть multi-sign clamp — он уже задан,
        # иначе берём degree. Используем максимальный из них.
        mag = max(abs(signed), degree)
        final_dir[kind] = sign * mag

    # L2: embedding запроса (один раз, кэш)
    ex = _embed_query(query_norm, cfg) if cfg.axes_enabled else None

    # Attention-фильтр: какие параметры покрыты конкретикой?
    any_covered = any(_detect_attention(query_norm, p) for p in scoped_params)

    results: dict[str, dict] = {}
    for p in scoped_params:
        name = p["technical_name"]
        before = current_values.get(name, p.get("default"))
        kind = p.get("quantity_kind")
        ui = p.get("ui_element")

        # L0: numeric
        if ui in ("Range", "Select"):
            v0, src0 = l0_numeric(query_norm, p, cfg._numeric_units)
            if v0 is not None:
                results[name] = {
                    "value": v0,
                    "before": before,
                    "source": src0,
                    "detail": "L0 numeric preempt",
                }
                continue

        # Toggle: L1-on/off
        if ui == "Toggle":
            tval = _detect_toggle(query_norm, cfg._markers, p)
            if tval is None:
                results[name] = {
                    "value": before, "before": before, "source": "default",
                    "detail": "toggle: no on/off marker with name intersection",
                }
            else:
                results[name] = {
                    "value": 1 if tval else 0,
                    "before": before, "source": "lexical",
                    "detail": "toggle: " + ("on" if tval else "off"),
                }
            continue

        # Neutral query → no movement
        if is_neutral:
            results[name] = {
                "value": before, "before": before, "source": "neutral",
                "detail": "neutral query",
            }
            continue

        # Select nominal: L1 alias match
        if ui == "Select" and p.get("select_typing") == "nominal":
            v, src = _select_nominal_apply(query_norm, p)
            results[name] = {"value": v, "before": before, "source": src,
                             "detail": "nominal alias match" if src == "lexical" else "default nominal"}
            continue

        # Select ordinal: position-based, может двигаться по оси или лексически
        if ui == "Select" and p.get("select_typing") == "ordinal":
            positions = p.get("option_positions") or []
            if not positions:
                results[name] = {"value": before, "before": before,
                                 "source": "default", "detail": "no positions"}
                continue
            default_pos = next((pp["position"] for pp in positions
                                if str(pp["value"]) == str(p.get("default"))),
                               0.5)
            # base_pos: если relative + уже двигали — текущая позиция опции
            base_pos = default_pos
            if is_relative and name in current_values:
                cur_val = current_values[name]
                cur_pos = next((pp["position"] for pp in positions
                                if str(pp["value"]) == str(cur_val)), None)
                if cur_pos is not None:
                    base_pos = cur_pos
            signed_norm = 0.0
            source = "default"
            detail = ""
            # L1 по kind (ordinal_select kind → должен маппиться на один из 9)
            kind_for_lex = kind if kind in cfg._direction_lexicon else None
            if kind_for_lex and kind_for_lex in final_dir:
                # attention check
                if any_covered and not _detect_attention(query_norm, p):
                    results[name] = {"value": before, "before": before,
                                     "source": "default", "detail": "attention-filtered"}
                    continue
                signed_norm = final_dir[kind_for_lex]
                source = "lexical"
                detail = f"L1 kind={kind_for_lex} δ={signed_norm:.3f}"
            elif cfg.axes_enabled and ex is not None:
                # L2 axis projection (если параметр имеет axes и polarity != 0)
                axes_p = p.get("axes") or []
                if axes_p:
                    e_id = _param_eid(name, cfg)
                    if e_id:
                        # выбрать ось с макс |Δa|
                        best_axis = None
                        best_abs = 0.0
                        for ax_id in axes_p:
                            av = cfg._anchors["axes"].get(ax_id, {})
                            delta = _axis_delta(ex, e_id, av)
                            if delta is None:
                                continue
                            pi = _polarity(ax_id, kind, cfg._polarity, p)
                            if pi == 0:
                                continue
                            scaled = pi * delta
                            if abs(scaled) > best_abs:
                                best_abs = abs(scaled)
                                best_axis = (ax_id, scaled)
                        if best_axis and best_abs >= cfg.epsilon_axis:
                            ax_id, scaled = best_axis
                            signed_norm = scaled
                            source = "axis"
                            detail = f"L2 axis={ax_id} Δa={scaled:.3f} κ={cfg._anchors['axes'][ax_id].get('kappa',1.0):.3f}"
            if signed_norm == 0:
                results[name] = {"value": before, "before": before,
                                 "source": "default", "detail": "no signal"}
                continue
            v, src = _select_ordinal_apply(p, base_pos, signed_norm, cfg)
            results[name] = {"value": v, "before": before, "source": src,
                             "detail": detail}
            continue

        # Range: лексический путь + осевой fallback
        if ui == "Range":
            mn = p.get("min_value"); mx = p.get("max_value")
            if mn is None or mx is None:
                results[name] = {"value": before, "before": before,
                                 "source": "default", "detail": "no min/max"}
                continue
            # base: default или current (если relative + уже двигали)
            base = p.get("default")
            if is_relative and name in current_values:
                cv = current_values[name]
                if isinstance(cv, (int, float)):
                    base = float(cv)
            signed_norm = 0.0
            source = "default"
            detail = ""
            # L1: direction по kind
            kind_for_lex = kind if kind in cfg._direction_lexicon else None
            if kind_for_lex and kind_for_lex in final_dir:
                # attention filter
                if any_covered and not _detect_attention(query_norm, p):
                    results[name] = {"value": before, "before": before,
                                     "source": "default", "detail": "attention-filtered"}
                    continue
                signed_norm = final_dir[kind_for_lex]
                source = "lexical"
                detail = f"L1 kind={kind_for_lex} δ={signed_norm:.3f}"
            elif cfg.axes_enabled and ex is not None:
                # L2 axis projection
                axes_p = p.get("axes") or []
                if axes_p:
                    e_id = _param_eid(name, cfg)
                    if e_id:
                        best_axis = None
                        best_abs = 0.0
                        for ax_id in axes_p:
                            av = cfg._anchors["axes"].get(ax_id, {})
                            delta = _axis_delta(ex, e_id, av)
                            if delta is None:
                                continue
                            pi = _polarity(ax_id, kind, cfg._polarity, p)
                            if pi == 0:
                                continue
                            scaled = pi * delta
                            if abs(scaled) > best_abs:
                                best_abs = abs(scaled)
                                best_axis = (ax_id, scaled)
                        if best_axis and best_abs >= cfg.epsilon_axis:
                            ax_id, scaled = best_axis
                            signed_norm = scaled
                            source = "axis"
                            detail = f"L2 axis={ax_id} Δa={scaled:.3f}"
            if signed_norm == 0:
                results[name] = {"value": before, "before": before,
                                 "source": "default", "detail": "no signal"}
                continue
            v, src = _range_apply(p, float(base), signed_norm, cfg)
            results[name] = {"value": v, "before": before, "source": src,
                             "detail": detail}
            continue

        # Text / String / Array — не двигаются семантически
        results[name] = {"value": before, "before": before,
                         "source": "default", "detail": "non-numeric ui"}

    return results


# ---------------------------------------------------------------------------
# CLI smoke (быстрая проверка без интеграции в retrieval)
# ---------------------------------------------------------------------------
def _cli_smoke() -> int:
    cfg = Config()
    _ensure_loaded(cfg)
    # берём 10 случайных scoped-параметров с разными kind
    scoped = []
    seen_kinds: set[str] = set()
    for p in cfg._dataset or []:
        k = p.get("quantity_kind")
        if k in seen_kinds:
            continue
        seen_kinds.add(k)
        scoped.append(p)
        if len(scoped) >= 12:
            break
    queries = [
        "сделай звучание сильно громче",
        "сделай атаку заметно плавнее",
        "поставь вайб punishing whip",
        "настрой пресет",
        "сделай темп сильно быстрее",
        "make the timbre slightly brighter",
        "сделай хаос заметно сильнее",
        "выключи auto-pan phase inversion",
    ]
    print(f"=== SMOKE: {len(scoped)} params × {len(queries)} queries ===")
    for q in queries:
        print(f"\n>>> {q}")
        res = anchor_query(q, scoped, None, cfg)
        moved = [(n, r) for n, r in res.items()
                 if r["source"] != "default" and r["source"] != "neutral"
                 and str(r["value"]) != str(r["before"])]
        for n, r in moved[:6]:
            print(f"  {n}: {r['before']} → {r['value']} [{r['source']}] {r['detail']}")
        if not moved:
            print("  (no movement — это нормально для neutral/не-покрытых)")
    return 0


if __name__ == "__main__":
    # smoke-режим при прямом запуске
    sys.exit(_cli_smoke())
