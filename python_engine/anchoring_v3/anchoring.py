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
    ollama_model: str = "qwen3-embedding:4b"
    threshold_range: float = 0.25
    threshold_select: float = 0.30
    threshold_toggle: float = 0.20
    softmax_temp_explicit: float = 0.02
    softmax_temp_diffuse: float = 0.05
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
    _param_vectors: Any | None = field(default=None, repr=False)
    _param_row_by_name: dict[str, int] = field(default_factory=dict, repr=False)
    _a_home: dict[str, dict[str, float]] = field(default_factory=dict, repr=False)
    _value_anchor_vectors: Any | None = field(default=None, repr=False)
    _value_anchor_parameters: dict[str, list[dict]] = field(default_factory=dict, repr=False)
    _select_option_vectors: Any | None = field(default=None, repr=False)
    _select_option_parameters: dict[str, list[dict]] = field(default_factory=dict, repr=False)


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
    def present(value: str) -> bool:
        normalized = str(value).lower().replace("_", " ").strip()
        if not normalized:
            return False
        return re.search(rf"(?<![\w/.:]){re.escape(normalized)}(?![\w/.:])", ql) is not None
    for o in opts:
        if present(str(o)):
            return str(o)
    # проверяем aliases (nominal)
    aliases = param.get("option_aliases") or {}
    for opt, syns in aliases.items():
        for syn in syns:
            if present(syn):
                return opt
    # Ordinal commands are deterministic only when the query names the
    # control itself.  This avoids broadcasting "first option" across every
    # Select result in Top-K.
    technical_name = str(param.get("technical_name") or "")
    if technical_name and technical_name.lower() in ql:
        ordinal_words = {
            "first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4,
            "перв": 0, "втор": 1, "трет": 2, "четверт": 3, "пят": 4,
        }
        for word, index in ordinal_words.items():
            if re.search(rf"\b{word}\w*\b", ql) and index < len(opts):
                return str(opts[index])
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
    # An explicit technical_name binds the first following number directly to
    # that Range. This is required for unitless controls such as density,
    # damping and width_index, and for `technical_name: value` syntax.
    technical_name = str(param.get("technical_name") or "")
    name_match = re.search(re.escape(technical_name), query, re.IGNORECASE) if technical_name else None
    if name_match and param.get("ui_element") == "Range":
        explicit_number = _NUM_VALUE_RE.search(query[name_match.end():])
        if explicit_number:
            value = _parse_number(explicit_number.group(1))
            mn = param.get("min_value"); mx = param.get("max_value")
            if value is not None and mn is not None and mx is not None:
                value = _clamp(value, mn, mx)
                value = _snap(value, param.get("step"))
                return _clamp(value, mn, mx), "numeric"
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
    # Remove complete phrases before their shorter substrings (for example,
    # ``standard settings`` before ``set``), otherwise a short marker can
    # corrupt a longer neutral phrase and leave artificial query tokens.
    neutral = sorted(
        (w.lower() for w in markers.get("neutral_markers", [])),
        key=len,
        reverse=True,
    )
    # удаляем все neutral-маркеры из запроса
    remaining = ql
    for w in neutral:
        remaining = remaining.replace(w, "")
    # если после удаления остались только стоп-слова и пунктуация → neutral
    toks = tokenize(remaining)
    return len(toks) == 0


def _generic_anchor_direction(query: str) -> float:
    """Return only an unambiguous broad low/dark or high/bright direction."""
    low = re.search(r"\b(?:low|lower|dark|darker|muffled|muted)\b|\b(?:низк|темн|приглуш)", query, re.I)
    high = re.search(r"\b(?:high|higher|bright|brighter|screaming)\b|\b(?:высок|ярк|визг)", query, re.I)
    if bool(low) == bool(high):
        return 0.0
    return -1.0 if low else 1.0


def _semantic_anchor_direction(query: str, param: dict) -> float:
    """Resolve common sound-control directions only when name and intent agree."""
    ql = query.lower()
    name = str(param.get("technical_name") or "").lower()
    if re.search(r"wet|dry_wet|reverb_mix", name):
        if re.search(r"\b(?:wet|more reverb|wetter|spacious)\b|\b(?:влажн|больше реверб)", ql):
            return 1.0
        if re.search(r"\b(?:dry|drier|less reverb)\b|\b(?:сух|меньше реверб)", ql):
            return -1.0
    if "decay" in name or "release" in name or "tail" in name:
        if re.search(r"\b(?:long|longer|more sustain)\b|\b(?:длин|дольше)", ql):
            return 1.0
        if re.search(r"\b(?:short|shorter|tight|tighter|punchy)\b|\b(?:корот|плотн|хлест)", ql):
            return -1.0
    if "attack" in name and re.search(r"time|duration|envelope", name):
        if re.search(r"\b(?:slow|slower|soft|softer|gentle|gentler)\b|\b(?:медлен|мягк)", ql):
            return 1.0
        if re.search(r"\b(?:fast|faster|sharp|hard)\b|\b(?:быстр|резк|жестк)", ql):
            return -1.0
    if re.search(r"drive|distortion|harsh|attack_gain", name):
        if re.search(r"\b(?:soft|softer|gentle|gentler|clean|cleaner)\b|\b(?:мягк|чист)", ql):
            return -1.0
        if re.search(r"\b(?:hard|harder|aggressive|harsh|distorted)\b|\b(?:жестк|агрессив|искаж)", ql):
            return 1.0
    return 0.0


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


def _attention_score(query: str, param: dict) -> int:
    qtoks = set(tokenize(query))
    ptoks = set(tokenize(str(param.get("technical_name", "")).replace("_", " ")))
    for field_name in ("name_ru", "description_en", "description_ru"):
        ptoks.update(tokenize(str(param.get(field_name, ""))))
    for field_name in ("semantic_keywords", "lyria_prompt_tags", "options"):
        for value in param.get(field_name) or []:
            ptoks.update(tokenize(str(value)))
    return len(qtoks & ptoks)


def _description_direction(query: str, param: dict) -> tuple[float, str] | None:
    """Infer direct low/high value direction from bilingual parameter descriptions."""
    query_tokens = set(tokenize(query))
    if not query_tokens:
        return None
    low_markers = re.compile(r"lower values?|low values?|низкие значения", re.I)
    high_markers = re.compile(r"higher values?|high values?|высокие значения", re.I)
    low_tokens: set[str] = set()
    high_tokens: set[str] = set()
    for description in (param.get("description_en"), param.get("description_ru")):
        text = str(description or "")
        if not text:
            continue
        markers = list(re.finditer(r"lower values?|low values?|higher values?|high values?|низкие значения|высокие значения", text, re.I))
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
            clause_tokens = set(tokenize(text[marker.end():end]))
            if low_markers.fullmatch(marker.group(0)):
                low_tokens.update(clause_tokens)
            elif high_markers.fullmatch(marker.group(0)):
                high_tokens.update(clause_tokens)
    low_score = len(query_tokens & low_tokens)
    high_score = len(query_tokens & high_tokens)
    if high_score > low_score and high_score >= 2:
        return 0.35, f"description-high overlap={high_score}"
    if low_score > high_score and low_score >= 2:
        return -0.35, f"description-low overlap={low_score}"
    return None


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


def _axis_delta(ex: list[float], e_id: Any, axis_vec: dict,
                axis_id: str, a_home: dict[str, float]) -> float | None:
    u = axis_vec.get("u")
    if not u or e_id is None:
        return None
    kappa = axis_vec.get("kappa", 1.0)
    home = a_home.get(axis_id)
    center = axis_vec.get("c")
    if home is not None and center:
        query_position = 0.5 + kappa * _vec_dot(_vec_sub(ex, center), u)
        return query_position - home
    return kappa * _vec_dot(_vec_sub(ex, e_id), u)


def _param_eid(param_name: str, cfg: Config) -> tuple[Any | None, dict[str, float]]:
    """Return the persistent composite vector and its precomputed axis home."""
    if cfg._anchors.get("stub"):
        return None, {}
    row_index = cfg._param_row_by_name.get(param_name)
    if row_index is None or cfg._param_vectors is None:
        return None, cfg._a_home.get(param_name, {})
    return cfg._param_vectors[row_index], cfg._a_home.get(param_name, {})


def _best_query_embedding(query_embeddings: list[list[float]], param_name: str,
                          cfg: Config) -> tuple[list[float] | None, int]:
    if not query_embeddings:
        return None, 0
    parameter_vector, _home = _param_eid(param_name, cfg)
    if parameter_vector is None or len(query_embeddings) == 1:
        return query_embeddings[0], 0
    best_index = max(
        range(len(query_embeddings)),
        key=lambda index: cosine(query_embeddings[index], parameter_vector),
    )
    return query_embeddings[best_index], best_index


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
    # Exact option and alias matching uses token/phrase boundaries.
    m = _find_option_match(query, param)
    if m is not None:
        return m, "lexical"
    return str(param.get("default", "")), "default"


def _softmax(scores: list[float], temperature: float) -> list[float]:
    if not scores:
        return []
    temperature = max(float(temperature), 1e-6)
    maximum = max(scores)
    values = [math.exp((score - maximum) / temperature) for score in scores]
    total = sum(values) or 1.0
    return [value / total for value in values]


def _anchor_scores(ex: list[float], entries: list[dict], vectors: Any) -> list[float]:
    return [cosine(ex, vectors[int(entry["row_index"])]) for entry in entries]


def _value_anchor_apply(ex: list[float], param: dict, cfg: Config,
                        explicit_signal: bool = False,
                        direction_hint: float = 0.0,
                        audit: dict | None = None,
                        ) -> tuple[float | str, float, str] | None:
    """Map a query embedding onto persistent Range/Select semantic values."""
    name = str(param.get("technical_name") or "")
    ui = param.get("ui_element")
    if ui == "Range":
        entries = cfg._value_anchor_parameters.get(name) or []
        vectors = cfg._value_anchor_vectors
        threshold = cfg.threshold_range
    elif ui == "Select":
        entries = cfg._select_option_parameters.get(name) or []
        vectors = cfg._select_option_vectors
        threshold = cfg.threshold_select
    else:
        return None
    if not entries or vectors is None:
        return None
    raw_scores = _anchor_scores(ex, entries, vectors)
    scores = list(raw_scores)
    if direction_hint and ui == "Range":
        scores = [
            score + 0.10 * direction_hint * (2 * float(entry["level"]) - 1)
            for score, entry in zip(scores, entries)
        ]
    elif direction_hint and ui == "Select" and param.get("option_positions"):
        positions = {str(item["value"]): float(item["position"]) for item in param["option_positions"]}
        scores = [
            score + 0.10 * direction_hint * (2 * positions.get(str(entry["option"]), 0.5) - 1)
            for score, entry in zip(scores, entries)
        ]
    confidence = float(max(scores, default=-1.0))
    temperature = cfg.softmax_temp_explicit if explicit_signal else cfg.softmax_temp_diffuse
    weights = _softmax(scores, temperature)
    if audit is not None:
        audit.update({
            "query_cosines_to_anchors": [round(float(score), 8) for score in raw_scores],
            "softmax_weights": [round(float(weight), 8) for weight in weights],
            "confidence": confidence,
            "threshold": threshold,
            "temperature": temperature,
            "applied": False,
        })
    if confidence < threshold:
        return None
    if ui == "Select":
        best_index = max(range(len(scores)), key=lambda index: scores[index])
        if audit is not None:
            audit.update({"chosen_level": entries[best_index]["option"], "applied": True})
        return entries[best_index]["option"], confidence, f"Select option cosine={confidence:.4f}"
    position = sum(float(entry["level"]) * weight for entry, weight in zip(entries, weights))
    mn = float(param["min_value"])
    mx = float(param["max_value"])
    value = _clamp(_snap(mn + position * (mx - mn), param.get("step")), mn, mx)
    default_value = param.get("default")
    if direction_hint and isinstance(default_value, (int, float)):
        step = float(param.get("step") or 0)
        minimum_delta = step if step > 0 else (mx - mn) * 0.01
        if direction_hint < 0 and value > float(default_value):
            value = _clamp(_snap(float(default_value) - minimum_delta, param.get("step")), mn, mx)
        elif direction_hint > 0 and value < float(default_value):
            value = _clamp(_snap(float(default_value) + minimum_delta, param.get("step")), mn, mx)
    if audit is not None:
        audit.update({"chosen_level": position, "applied": True})
    return value, confidence, f"Range anchors cosine={confidence:.4f} p={position:.4f} T={temperature:.3f}"


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------
def anchor_query(query: str,
                 scoped_params: list[dict],
                 current_values: dict[str, float | str] | None,
                 cfg: Config,
                 query_embeddings: list[list[float]] | None = None,
                 query_concepts: list[str] | None = None,
                 relation_hints: dict[str, dict] | None = None,
                 audit_log: list[dict] | None = None) -> dict[str, dict]:
    """Главный runtime-вход. Возвращает
    {param_name: {value, before, source, detail}}.

    scoped_params — выдача существующего retrieval (полные записи).
    current_values — состояние слайдеров сессии (для relative-base).
    """
    _ensure_loaded(cfg)
    current_values = current_values or {}
    relation_hints = relation_hints or {}
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

    # Embeddings may be supplied by the multi-vector TypeScript retrieval.
    # Legacy callers still produce one query embedding locally.
    supplied_embeddings = [vector for vector in (query_embeddings or []) if isinstance(vector, list) and vector]
    if supplied_embeddings:
        embedding_candidates = supplied_embeddings
    else:
        embedded = _embed_query(query_norm, cfg) if cfg.axes_enabled else None
        embedding_candidates = [embedded] if embedded is not None else []

    # Attention-фильтр: какие параметры покрыты конкретикой?
    any_covered = any(_detect_attention(query_norm, p) for p in scoped_params)
    explicit_names = set()
    query_lower = query_norm.lower()
    for candidate in scoped_params:
        candidate_name = str(candidate.get("technical_name") or "").lower()
        natural_name = candidate_name.replace("_", " ")
        if candidate_name and candidate_name in query_lower:
            explicit_names.add(candidate["technical_name"])
        elif len(natural_name.split()) >= 2 and natural_name in query_lower:
            explicit_names.add(candidate["technical_name"])
    numeric_target_names = set(explicit_names)
    if not numeric_target_names:
        numeric_candidates = []
        for candidate in scoped_params:
            if candidate.get("ui_element") not in ("Range", "Select"):
                continue
            candidate_value, _candidate_source = l0_numeric(query_norm, candidate, cfg._numeric_units)
            if candidate_value is not None:
                numeric_candidates.append((_attention_score(query_norm, candidate), candidate["technical_name"]))
        if numeric_candidates:
            numeric_target_names.add(max(numeric_candidates, key=lambda item: item[0])[1])

    explicit_anchor_direction = 0.0
    for candidate in scoped_params:
        if candidate.get("technical_name") not in numeric_target_names or candidate.get("ui_element") != "Range":
            continue
        numeric_value, _numeric_source = l0_numeric(query_norm, candidate, cfg._numeric_units)
        default_value = candidate.get("default")
        if isinstance(numeric_value, (int, float)) and isinstance(default_value, (int, float)):
            explicit_anchor_direction = 1.0 if numeric_value > default_value else -1.0 if numeric_value < default_value else 0.0
            break
    broad_anchor_direction = explicit_anchor_direction or _generic_anchor_direction(query_norm)

    results: dict[str, dict] = {}
    anchor_audits: dict[str, dict] = {}
    explicit_value_signal = re.search(r"(?<![\w])-?\d+(?:[.,]\d+)?", query_norm) is not None
    for p in scoped_params:
        name = p["technical_name"]
        before = current_values.get(name, p.get("default"))
        kind = p.get("quantity_kind")
        ui = p.get("ui_element")
        param_ex, concept_index = _best_query_embedding(embedding_candidates, name, cfg)
        relation_hint = relation_hints.get(name) or {}
        relation_direction = float(relation_hint.get("direction") or 0) * float(relation_hint.get("confidence") or 0)
        semantic_anchor_direction = _semantic_anchor_direction(query_norm, p)
        anchor_direction = semantic_anchor_direction or relation_direction or broad_anchor_direction
        concept_detail = ""
        if query_concepts and 0 <= concept_index < len(query_concepts):
            concept_detail = f" concept={query_concepts[concept_index][:80]!r}"
        precomputed_anchor = None
        if ui in ("Range", "Select") and param_ex is not None:
            audit = anchor_audits.setdefault(name, {})
            precomputed_anchor = _value_anchor_apply(
                param_ex, p, cfg,
                explicit_signal=explicit_value_signal or degree >= 0.55,
                direction_hint=anchor_direction,
                audit=audit,
            )

        # L0: numeric
        if ui in ("Range", "Select"):
            # When a technical_name is explicit, do not broadcast its numeric
            # value to every other parameter sharing the same unit/kind.
            # Select option names are semantic labels rather than shared numeric
            # units, so an option explicitly present in the query remains local
            # and may safely preempt for every matching Select control.
            select_command = re.search(r"\b(?:mode|option|режим|вариант)\b", query_lower, re.I) is not None
            blocked = (
                (ui == "Range" and numeric_target_names and name not in numeric_target_names)
                or (
                    ui == "Select"
                    and name not in explicit_names
                    and (
                        not select_command
                        or not bool(p.get("_anchor_eligible", True))
                    )
                )
            )
            v0, src0 = (None, "default") if blocked else l0_numeric(query_norm, p, cfg._numeric_units)
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

        # Only the most relevant retrieval slice may alter values.  The rest of
        # Top-K remains visible but stays at default, which prevents a single
        # concept from broadcasting a value-anchor movement across the bank.
        if ui in ("Range", "Select") and not bool(p.get("_anchor_eligible", True)) and name not in explicit_names:
            results[name] = {
                "value": before, "before": before, "source": "default",
                "detail": "selectivity gate: outside semantic change budget",
            }
            continue

        # Persistent value anchors: after exact numeric/option preemption and
        # before lexical/axis fallbacks.  A low-confidence match deliberately
        # falls through to the established L1/L2 behavior.
        has_lexical_direction = bool(kind in final_dir) if kind else False
        has_description_direction = _description_direction(query_norm, p) is not None
        if ui in ("Range", "Select") and param_ex is not None and not has_lexical_direction and not has_description_direction:
            select_command = re.search(r"\b(?:mode|option|режим|вариант)\b", query_lower, re.I) is not None
            anchored_value = None if ui == "Select" and not select_command and name not in explicit_names else precomputed_anchor
            if anchored_value is not None:
                value, confidence, detail = anchored_value
                if ui == "Range" and anchor_direction and isinstance(value, (int, float)) and isinstance(p.get("default"), (int, float)):
                    default_value = float(p["default"])
                    if anchor_direction > 0 and value < default_value:
                        value = _clamp(default_value + (default_value - value), p.get("min_value"), p.get("max_value"))
                        value = _snap(value, p.get("step"))
                    elif anchor_direction < 0 and value > default_value:
                        value = _clamp(default_value - (value - default_value), p.get("min_value"), p.get("max_value"))
                        value = _snap(value, p.get("step"))
                relation_detail = ""
                if relation_hint:
                    relation_detail = (
                        f" relation={relation_hint.get('relation')}"
                        f" confidence={float(relation_hint.get('confidence') or 0):.3f}"
                    )
                results[name] = {
                    "value": value, "before": before, "source": "value_anchor",
                    "detail": detail + concept_detail + relation_detail,
                    "confidence": confidence,
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
            elif (description_direction := _description_direction(query_norm, p)) is not None:
                signed_norm, detail = description_direction
                source = "lexical"
            elif relation_direction:
                signed_norm = max(-0.45, min(0.45, relation_direction * 0.45))
                source = "relation"
                detail = f"relation={relation_hint.get('relation')} confidence={relation_hint.get('confidence', 0):.3f}"
            elif cfg.axes_enabled and param_ex is not None:
                # L2 axis projection (если параметр имеет axes и polarity != 0)
                axes_p = p.get("axes") or []
                if axes_p:
                    e_id, a_home = _param_eid(name, cfg)
                    if e_id is not None:
                        # выбрать ось с макс |Δa|
                        best_axis = None
                        best_abs = 0.0
                        for ax_id in axes_p:
                            av = cfg._anchors["axes"].get(ax_id, {})
                            delta = _axis_delta(param_ex, e_id, av, ax_id, a_home)
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
            elif (description_direction := _description_direction(query_norm, p)) is not None:
                signed_norm, detail = description_direction
                source = "lexical"
            elif relation_direction:
                signed_norm = max(-0.45, min(0.45, relation_direction * 0.45))
                source = "relation"
                detail = f"relation={relation_hint.get('relation')} confidence={relation_hint.get('confidence', 0):.3f}"
            elif cfg.axes_enabled and param_ex is not None:
                # L2 axis projection
                axes_p = p.get("axes") or []
                if axes_p:
                    e_id, a_home = _param_eid(name, cfg)
                    if e_id is not None:
                        best_axis = None
                        best_abs = 0.0
                        for ax_id in axes_p:
                            av = cfg._anchors["axes"].get(ax_id, {})
                            delta = _axis_delta(param_ex, e_id, av, ax_id, a_home)
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

        # Text / String / Array: deterministic retrieval-only policy.  There is
        # no LLM generation in the anchoring bridge.  Existing candidates, when
        # supplied by a dataset, win; otherwise the stored default is retained
        # and explicitly marked rather than silently presented as generated.
        existing_values = p.get("value_candidates") or p.get("published_values") or p.get("options") or []
        if existing_values and _detect_attention(query_norm, p):
            query_tokens = set(tokenize(query_norm))
            selected = max(
                existing_values,
                key=lambda value: len(query_tokens & set(tokenize(str(value)))),
            )
            results[name] = {"value": selected, "before": before,
                             "source": "retrieval", "detail": "retrieval-only existing value"}
        else:
            results[name] = {"value": before, "before": before,
                             "source": "not_generated", "detail": "retrieval-only: no existing alternative value"}

    if audit_log is not None:
        for p in scoped_params:
            name = p["technical_name"]
            result = results[name]
            ui = p.get("ui_element")
            threshold = cfg.threshold_range if ui == "Range" else cfg.threshold_select if ui == "Select" else cfg.threshold_toggle if ui == "Toggle" else None
            diagnostic = anchor_audits.get(name, {})
            audit_log.append({
                "technical_name": name,
                "ui_element": ui,
                "retrieval_rank": p.get("_retrieval_rank"),
                "retrieval_similarity": p.get("_retrieval_similarity"),
                "anchor_eligible": bool(p.get("_anchor_eligible", True)),
                "query_cosines_to_anchors": diagnostic.get("query_cosines_to_anchors", []),
                "chosen_level": diagnostic.get("chosen_level"),
                "softmax_weights": diagnostic.get("softmax_weights", []),
                "confidence": diagnostic.get("confidence"),
                "threshold": diagnostic.get("threshold", threshold),
                "temperature": diagnostic.get("temperature", cfg.softmax_temp_explicit if explicit_value_signal else cfg.softmax_temp_diffuse),
                "applied": result["source"] == "value_anchor",
                "source": result["source"],
                "before": result["before"],
                "after": result["value"],
                "detail": result["detail"],
            })
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
