#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_dataset.py — детерминированный источник истины для этапа A
(Semantic Value Anchoring для Flowmusic Parameter RAG).

Прогон:
    python3 enrich_dataset.py \
        --dataset ../public/parameters-dataset.json \
        --out unified_parameters_enriched.json \
        --report enrichment_report.json

Скрипт НЕ обращается к сети и НЕ требует Ollama. Он детерминированно
выводит машинные поля для КАЖДОГО параметра из parameters-dataset.json:
    domain, axes, quantity_kind, polarity_override, vibe_id,
    dedupe, select_typing, option_positions, option_aliases

Существующие поля датасета НЕ изменяются; их порядок сохраняется, а
машинные поля ДОБАВЛЯЮТСЯ в конец записи в фиксированном порядке.

Правила вывода описаны в README и в контракте задачи (раздел 3).
Любое эвристическое решение (остаток, не покрытый правилами; auto-alias;
возможный polarity_override) фиксируется в enrichment_report.json с
обоснованием.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from typing import Any

# ---------------------------------------------------------------------------
# 1. Лексиконы правил
# ---------------------------------------------------------------------------

# Точные/суффиксные правила unit → quantity_kind.  unit нормализуется
# (lower, strip).  Сначала точное совпадение, затем — суффиксное.
# Приоритет unit над name (контракт 3.1).

UNIT_KIND_EXACT: dict[str, str] = {
    # tempo
    "bpm": "tempo", "tempo": "tempo",
    # duration
    "ms": "duration", "millisecond": "duration", "milliseconds": "duration",
    "s": "duration", "sec": "duration", "secs": "duration",
    "second": "duration", "seconds": "duration",
    "time": "duration", "t": "duration",
    # rate
    "hz": "rate", "khz": "rate", "mhz": "rate",
    "rate": "rate", "frequency": "rate", "lfo": "rate", "speed": "rate",
    "bpm_rate": "rate",
    # level
    "db": "level", "decibel": "level", "decibels": "level",
    "gain": "level", "level": "level", "volume": "level",
    "loudness": "level", "presence": "level",
    # density
    "grains_per_sec": "density", "grains_per_second": "density",
    "grains": "density", "particles": "density", "grain_rate": "density",
    "events_per_sec": "density",
    # detune
    "cents": "detune", "semitone": "detune", "semitones": "detune",
    "tuning": "detune", "microtone": "detune", "microtones": "detune",
    # length
    "ratio": "length", "fraction": "length", "bars": "length", "bar": "length",
    "delay_len": "length",
    # amount
    "percent": "amount", "percentage": "amount", "%": "amount",
    "probability": "amount", "depth": "amount", "mix": "amount",
    "intensity": "amount", "spread": "amount", "amount": "amount",
    "weight": "amount",
    # count (безразмерные целые)
    "count": "count", "number": "count", "voices": "count",
    "taps": "count", "steps": "count", "stages": "count",
    "order": "count", "index": "count",
}

# Суффиксы unit (в нижнем регистре) → kind.  Проверяются после точного.
UNIT_KIND_SUFFIX: list[tuple[str, str]] = [
    ("_bpm", "tempo"),
    ("_ms", "duration"), ("_msec", "duration"), ("_millisecond", "duration"),
    ("_sec", "duration"), ("_seconds", "duration"), ("_s", "duration"),
    ("_hz", "rate"), ("_khz", "rate"),
    ("_db", "level"),
    ("_cents", "detune"), ("_semitones", "detune"),
    ("_percent", "amount"), ("_pct", "amount"),
    ("_ratio", "length"), ("_fraction", "length"), ("_bars", "length"),
]

# Токены в technical_name (lowercased, по underscore-токенам и подстрокам)
# → kind.  Используются только если unit не дал результат.
NAME_KIND_RULES: list[tuple[list[str], str]] = [
    (["bpm", "tempo"], "tempo"),
    (["attack", "decay", "release", "duration", "glide", "click",
      "time", "length_ms", "ms", "hold", "sustain_time"], "duration"),
    (["rate", "frequency", "speed", "morph", "lfo", "vibrato_rate",
      "flutter_rate", "hz"], "rate"),
    (["gain", "level", "volume", "loudness", "presence", "db"], "level"),
    (["density", "grains", "particles", "events", "grain"], "density"),
    (["detune", "tuning", "pitch_drift", "pitch_shift", "microtonal",
      "cents"], "detune"),
    (["ratio", "fraction", "delay_len", "bars"], "length"),
    (["depth", "amount", "mix", "intensity", "probability", "spread",
      "percent", "weight"], "amount"),
    (["number", "count", "voices", "taps", "steps", "stages"], "count"),
]

# Токены в technical_name → (primary_axis, secondary_axis?) в порядке
# приоритета таблицы 3.2.  Первое совпадение выигрывает.
NAME_AXIS_RULES: list[tuple[list[str], str, list[str]]] = [
    # attack, transient, snap, punch, impact, percussive, whip, click
    (["attack", "transient", "snap", "punch", "impact", "percussive",
      "whip", "click", "pluck", "strike", "hit", "onset"],
     "timbre_roughness", ["timbre_brightness"]),
    # bright, brightness, dark, muffle, spectral, tilt, highs, lows, warmth
    (["bright", "brightness", "dark", "muffle", "spectral", "tilt",
      "highs", "lows", "warmth", "dull", "harsh", "mud"],
     "timbre_brightness", []),
    # detune, tuning, pitch, drift, microtonal, cents
    (["detune", "tuning", "pitch", "drift", "microtonal", "cents",
      "inharmonic"],
     "tonal_instability", []),
    # density, grains, particles, events
    (["density", "grains", "particles", "events", "grain"],
     "rhythmic_density", []),
    # chaos, random, stochastic, entropy, unpredict
    (["chaos", "random", "stochastic", "entropy", "unpredict", "noise",
      "disorder"],
     "chaos_amplitude", []),
    # motion, movement, pan, panning, swirl, orbit, rotation, lfo_pan
    (["motion", "movement", "pan", "panning", "swirl", "orbit",
      "rotation", "lfo_pan", "autopan", "doppler", "stereo"],
     "spatial_motion", []),
    # delay, reverb, echo, reflection, room, hall, space, tail, wet, early
    (["delay", "reverb", "echo", "reflection", "room", "hall", "space",
      "tail", "wet", "early", "ambience", "decay_tail", "ir_"],
     "spatial_depth", []),
    # organic, wood, mycelium, bio, cellular, natural, breath, moss
    (["organic", "wood", "mycelium", "bio", "cellular", "natural",
      "breath", "moss", "living", "fermentation", "mycelial"],
     "organic_mechanical", []),
    # bpm, tempo
    (["bpm", "tempo"], "affective_arousal", ["energy_speed"]),
    # build, energy, rise, swell, drop, peak, dynamics
    (["build", "energy", "rise", "swell", "drop", "peak", "dynamics",
      "climax", "tension", "intensity_envelope"],
     "energy_peak_intensity", []),
    # mood, emotion, arousal, valence, dark_mood, joy, dread
    (["mood", "emotion", "arousal", "valence", "dark_mood", "joy",
      "dread", "affect", "feeling", "sentiment"],
     "affective_arousal", ["affective_valence"]),
    # metaphor, imagery, visual, synesthes
    (["metaphor", "imagery", "visual", "synesthes", "painterly",
      "cinematic", "picture", "scene"],
     "visual_metaphor_intensity", []),
    # experimental, radical, traditional, classic, genre
    (["experimental", "radical", "traditional", "classic", "genre",
      "convention", "avant"],
     "style_traditional_radical", []),
]

# Fallback по kind (контракт 3.2): kind → primary axis.
KIND_AXIS_FALLBACK: dict[str, str] = {
    "duration": "timbre_roughness",
    "rate": "energy_speed",
    "level": "energy_peak_intensity",
    "amount": "energy_peak_intensity",
    "count": "rhythmic_density",
    "density": "rhythmic_density",
    "detune": "tonal_instability",
    "length": "spatial_depth",
    "tempo": "affective_arousal",
}

# domain выводится из primary-оси.
AXIS_DOMAIN: dict[str, str] = {
    "affective_arousal": "affective",
    "affective_valence": "affective",
    "energy_speed": "energy_flow",
    "energy_peak_intensity": "energy_flow",
    "timbre_brightness": "timbre",
    "timbre_roughness": "timbre",
    "tonal_instability": "timbre",
    "rhythmic_density": "rhythm_density",
    "chaos_amplitude": "chaos_nonlinearity",
    "spatial_motion": "spatial",
    "spatial_depth": "spatial",
    "organic_mechanical": "organic_mechanical",
    "semantic_control_strength": "semantic_control",
    "visual_metaphor_intensity": "visual_metaphor",
    "style_traditional_radical": "style_identity",
}

# Токены technical_name → system (технические параметры, не двигаются
# семантически).  Проверяются ПЕРЕД axis-правилами.
SYSTEM_NAME_TOKENS: list[str] = [
    "buffer", "sample_rate", "block_size", "channel", "master_bypass",
    "bypass", "latency", "cpu", "oversampling", "oversample",
    "voice_count_limit", "max_polyphony", "midi_channel",
    "audio_buffer", "sr_", "_samples", "thread", "worker",
    "interpolation_quality", "render_quality",
]

# Хвостовые квант-суффиксы для vibe_id (порядок: длинные — первыми).
VIBE_QUANT_SUFFIXES: list[str] = [
    "_per_sec", "_per_second", "_seconds", "_millisecond",
    "_semitones", "_percent", "_degrees", "_cents",
    "_bpm", "_ms", "_db", "_hz", "_khz", "_s", "_ratio", "_rate",
    "_bars", "_fraction", "_weight", "_depth", "_index", "_factor",
    "_multiplier", "_gain", "_shape", "_curve", "_type", "_threshold",
    "_order", "_count", "_sensitivity", "_scale", "_step", "_bias",
    "_amount", "_intensity", "_probability", "_spread", "_mix",
    "_level", "_volume", "_loudness", "_presence", "_phase",
    "_envelope", "_slope", "_width", "_height", "_length",
]


def kind_from_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    u = unit.strip().lower()
    if not u:
        return None
    if u in UNIT_KIND_EXACT:
        return UNIT_KIND_EXACT[u]
    for suf, kind in UNIT_KIND_SUFFIX:
        if u.endswith(suf):
            return kind
    return None


def kind_from_name(name: str) -> str | None:
    n = name.lower()
    toks = set(n.split("_"))
    for tokens, kind in NAME_KIND_RULES:
        for t in tokens:
            if t in toks or t in n:
                return kind
    return None


def is_system_name(name: str) -> bool:
    n = name.lower()
    toks = set(n.split("_"))
    for t in SYSTEM_NAME_TOKENS:
        if t in toks or t in n:
            return True
    return False


def infer_kind(param: dict) -> tuple[str, str]:
    """Возвращает (kind, source).  source ∈ unit|name|fallback|system|ui."""
    if param.get("ui_element") == "Toggle":
        return ("toggle", "ui")
    # unit-приоритет
    k = kind_from_unit(param.get("unit"))
    if k:
        return (k, "unit")
    # name
    k = kind_from_name(param.get("technical_name", ""))
    if k:
        return (k, "name")
    # system по имени
    if is_system_name(param.get("technical_name", "")):
        return ("system", "system")
    # ui_element-фолбэки
    ui = param.get("ui_element")
    if ui == "Select":
        # Select-типизация происходит отдельно; provisional kind = enum,
        # уточняется в type_select().
        return ("enum", "ui")
    if ui in ("Text", "String", "Array"):
        return ("system", "ui_text")
    return ("amount", "fallback")


def infer_axes(param: dict, kind: str) -> tuple[list[str], str]:
    """Возвращает (axes, reason).  reason ∈ tokens|kind_fallback|system|none."""
    name = param.get("technical_name", "")
    n = name.lower()
    toks = set(n.split("_"))
    for tokens, primary, secondary in NAME_AXIS_RULES:
        for t in tokens:
            if t in toks or t in n:
                axes = [primary]
                if secondary:
                    axes.extend(secondary)
                return (axes, "tokens")
    if kind == "system":
        return ([], "system")
    fb = KIND_AXIS_FALLBACK.get(kind)
    if fb:
        return ([fb], "kind_fallback")
    return ([], "none")


def extract_vibe_id(name: str) -> str | None:
    """vibe_<name...>_<descriptor>_<unit> → первые 2 токена имени."""
    if not name.startswith("vibe_"):
        return None
    rest = name[len("vibe_"):]
    # strip trailing quant suffix (longest first)
    for suf in VIBE_QUANT_SUFFIXES:
        if rest.endswith(suf) and len(rest) - len(suf) > 0:
            rest = rest[: -len(suf)]
            break
    parts = [p for p in rest.split("_") if p]
    if not parts:
        return None
    vibe_id = "_".join(parts[:2])
    return vibe_id or None


# ---------------------------------------------------------------------------
# 2. Select-типизация
# ---------------------------------------------------------------------------

_NUM_RE = re.compile(r"^(-?\d+(?:\.\d+)?)$")
_FRAC_RE = re.compile(r"^(\d+)/(\d+)$")


def parse_option_number(opt: str) -> float | None:
    s = str(opt).strip()
    if not s:
        return None
    m = _FRAC_RE.match(s)
    if m:
        num, den = int(m.group(1)), int(m.group(2))
        if den != 0:
            return num / den
    m = _NUM_RE.match(s)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    # triplet_1/8 etc → попробуем вытащить дробь в конце
    m = re.search(r"(\d+)/(\d+)$", s)
    if m:
        den = int(m.group(2))
        if den != 0:
            return int(m.group(1)) / den
    return None


def type_select(param: dict) -> tuple[str | None, list | None, dict | None]:
    """Возвращает (select_typing, option_positions, option_aliases)."""
    opts = param.get("options")
    if not opts or not isinstance(opts, list) or len(opts) == 0:
        return (None, None, None)
    nums = [parse_option_number(o) for o in opts]
    if all(n is not None for n in nums) and len(nums) >= 2:
        mono = all(nums[i] < nums[i + 1] for i in range(len(nums) - 1))
        if mono:
            lo, hi = nums[0], nums[-1]
            span = (hi - lo) or 1.0
            positions = [
                {"value": str(o), "position": round((nums[i] - lo) / span, 6)}
                for i, o in enumerate(opts)
            ]
            return ("ordinal", positions, None)
    # nominal
    aliases = build_option_aliases(opts)
    return ("nominal", None, aliases)


# Кураторский словарь синонимов для часто встречающихся nominal-опций.
# RU+EN, 3–5 алиасов на опцию.  Покрывает основной общий словарь опций.
CURATED_ALIASES: dict[str, list[str]] = {
    # waveforms
    "sine": ["sine wave", "sinusoidal", "синусоида", "синус", "sin"],
    "square": ["square wave", "прямоугольник", "meander", "меандр", "squarish"],
    "triangle": ["triangle wave", "треугольник", "triangular", "пила треугольная", "tri"],
    "sawtooth": ["saw", "пила", "saw wave", "зубчатая", "sawtooth wave"],
    "saw": ["sawtooth", "пила", "зубчатая волна", "saw wave", "пилообразная"],
    "noise": ["шум", "white noise", "белый шум", "статический шум", "hiss"],
    "random": ["случайный", "randomised", "рандомный", "произвольный", "stochastic"],
    "random walk": ["случайное блуждание", "random-walk", "блуждающий", "brownian", "дрейф"],
    "none": ["нет", "ничего", "off", "выключено", "без эффекта"],
    "off": ["выключено", "off state", "нет", "disabled", "выкл"],
    "on": ["включено", "on state", "enabled", "вкл", "active"],
    "internal": ["внутренний", "internal source", "встроенный", "inner", "внутр."],
    "external": ["внешний", "external source", "наружный", "side-chain", "внешн."],
    # curves / shapes
    "linear": ["линейный", "linear curve", "прямая", "прямолинейный", "lin"],
    "exponential": ["экспоненциальный", "expo", "exp", "экспонента", "exponential curve"],
    "logarithmic": ["логарифмический", "log", "логарифм", "log curve", "логарифмика"],
    "inverse": ["обратный", "inverted curve", "обратная", "reverse curve", "реверс"],
    "curve": ["кривая", "curved", "изогнутая", "bent", "spline"],
    "s‑curve": ["s-кривая", "s-curve", "сигмоида", "sigmoid", "s shaped"],
    "sigmoid": ["сигмоида", "s-curve", "сигмоидальная", "logistic curve", "s-shape"],
    "gaussian": ["гауссов", "gaussian curve", "колокол", "bell", "гауссиана"],
    "logistic": ["логистический", "logistic curve", "s-образный", "s-curve", "логистика"],
    "custom": ["пользовательский", "custom curve", "ручной", "manual", "свой"],
    "cyclic": ["циклический", "cyclic mode", "зацикленный", "looping", "цикл"],
    "step": ["ступенчатый", "step curve", "staircase", "лесенка", "ступеньки"],
    "cosine": ["косинусоида", "косинус", "cosine wave", "cos", "косинусоидальный"],
    "uniform": ["равномерный", "uniform spread", "однородный", "even", "равномерно"],
    "chaotic": ["хаотичный", "chaos", "хаос", "unpredictable", "непредсказуемый"],
    # directions / modes
    "up": ["вверх", "ascending", "возрастающий", "upward", "повышающий"],
    "down": ["вниз", "descending", "убывающий", "downward", "понижающий"],
    "up_down": ["вверх-вниз", "up-down", "bi-directional", "туда-обратно", "two-way"],
    "as_played": ["как сыграно", "as-played", "в порядке игры", "played order", "по очереди"],
    # polarities
    "aggressive": ["агрессивный", "aggressive mode", "жёсткий", "жесткий", "напористый"],
    "conservative": ["консервативный", "умеренный", "мягкий", "cautious", "осторожный"],
    "balanced": ["сбалансированный", "balanced mode", "уравновешенный", "even", "нейтральный"],
    "gradual": ["плавный", "постепенный", "gradual mode", "slow ramp", "постепенно"],
    "smooth": ["гладкий", "smooth curve", "плавный", "seamless", "бесшовный"],
    "sharp": ["резкий", "sharp curve", "жёсткий", "abrupt", "обрывистый"],
    # levels
    "low": ["низкий", "low band", "низы", "low range", "нижний"],
    "high": ["высокий", "high band", "верхи", "high range", "верхний"],
    "mid": ["средний", "mid band", "средние", "middle", "центр"],
    "all": ["все", "all bands", "весь", "полный", "full"],
    "max": ["максимум", "maximum", "максимальный", "полный", "peak"],
    "min": ["минимум", "minimum", "минимальный", "полный", "floor"],
    # spatial
    "omnidirectional": ["омнинаправленный", "omni", "всенаправленный", "360", "круговой"],
    "cardioid": ["кардиоидный", "cardioid pattern", "сердцевидный", "cardioid", "однонаправленный"],
    "figure_eight": ["восьмёрка", "bi-directional", "bi-polar", "figure-8", "двунаправленный"],
    "super_cardioid": ["суперкардиоидный", "hyper-cardioid", "супер-кардиоид", "tight cardioid", "узкий кардиоид"],
    # metrics / distance
    "euclidean": ["евклидов", "euclidean distance", "прямое расстояние", "l2", "евклид"],
    "manhattan": ["манхэттенский", "manhattan distance", "l1", "grid distance", "городской"],
    "anticipation": ["anticipation", "предвосхищение", "ожидание", "anticipate", "предчувствие"],
    "surprise": ["surprise", "неожиданность", "удивление", "unexpected", "сюрприз"],
    # aesthetic
    "dark": ["тёмный", "dark mode", "мрачный", "deep", "глубокий"],
    "nature": ["природа", "natural mode", "естественный", "organic", "натуральный"],
    "space": ["пространство", "spacious", "просторный", "room", "пространный"],
    # misc common
    "auto": ["авто", "automatic", "автоматический", "self", "сам"],
    "manual": ["ручной", "manual mode", "руками", "by hand", "вручную"],
    "fixed": ["фиксированный", "fixed value", "постоянный", "constant", "статичный"],
    "adaptive": ["адаптивный", "adaptive mode", "подстраивающийся", "self-adjusting", "адаптивно"],
    "static": ["статичный", "static value", "постоянный", "fixed", "неподвижный"],
    "free": ["свободный", "free run", "свободно", "unlocked", "независимый"],
    "synced": ["синхронный", "synced", "привязанный", "locked", "синхронизированный"],
    "locked": ["зафиксированный", "locked", "синхронный", "synced", "привязанный"],
    "bypass": ["байпас", "bypass", "в обход", "through", "напрямую"],
    "through": ["напрямую", "through", "сквозь", "bypass", "pass"],
    "wet": ["мокрый", "wet", "с эффектом", "processed", "обработанный"],
    "dry": ["сухой", "dry", "без эффекта", "unprocessed", "необработанный"],
    "mono": ["моно", "mono", "monaural", "одноканальный", "single channel"],
    "stereo": ["стерео", "stereo", "двухканальный", "two channel", "стереофонический"],
    "left": ["левый", "left channel", "слева", "l", "лев"],
    "right": ["правый", "right channel", "справа", "r", "прав"],
    "side": ["боковой", "side channel", "side", "бок", "lateral"],
    "mid_side": ["mid-side", "ms", "мид-сайд", "middle-side", "мс"],
    "parallel": ["параллельный", "parallel", "параллельно", "sidechain", "в параллель"],
    "series": ["последовательный", "series", "serial", "каскад", "цепочкой"],
    "pre": ["до", "pre", "pre-fader", "перед", "pre-effect"],
    "post": ["после", "post", "post-fader", "после эффекта", "после"],
    "fast": ["быстрый", "fast", "быстро", "quick", "скорый"],
    "slow": ["медленный", "slow", "медленно", "slow rate", "тихий"],
}


def _auto_aliases(opt: str) -> list[str]:
    """Детерминированные авто-алиасы для опций, не покрытых кураторским
    словарём.  Гарантируют ≥3 валидных алиасов на опцию (опция + варианты
    нормализации), сохраняя JSON валидным."""
    s = str(opt).strip()
    out: list[str] = []
    seen: set[str] = set()
    def add(v: str) -> None:
        v = v.strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    add(s)
    if "_" in s:
        add(s.replace("_", " "))
        add(s.replace("_", "-"))
    if " " in s:
        add(s.replace(" ", "_"))
    # токены по отдельности
    toks = [t for t in re.split(r"[_\-\s]+", s) if t]
    if len(toks) >= 2:
        add(" ".join(toks))
    # ensure at least 3
    if len(out) < 3:
        add(s.lower())
    if len(out) < 3:
        add(s.upper())
    if len(out) < 3:
        add(f"{s} (normalized)")
    return out


def build_option_aliases(opts: list) -> dict[str, list[str]]:
    """{option_string: [aliases...]}.  Кураторский словарь → авто-алиасы."""
    out: dict[str, list[str]] = {}
    for o in opts:
        key = str(o)
        cur = CURATED_ALIASES.get(key.strip())
        if cur:
            # добиваем до 3, если вдруг меньше
            aliases = list(cur)
            if len(aliases) < 3:
                aliases = aliases + _auto_aliases(key)
                # дедуп сохранить порядок
                seen: set[str] = set()
                uniq: list[str] = []
                for a in aliases:
                    if a not in seen:
                        seen.add(a)
                        uniq.append(a)
                aliases = uniq[:5]
            out[key] = aliases[:5]
        else:
            out[key] = _auto_aliases(key)[:5]
    return out


# ---------------------------------------------------------------------------
# 3. Главный проход обогащения
# ---------------------------------------------------------------------------

def _scalar_signature(param: dict) -> tuple:
    """(min,max,default,unit) — ключ для dedupe-бакета."""
    return (
        param.get("min_value"),
        param.get("max_value"),
        json.dumps(param.get("default"), sort_keys=True, ensure_ascii=False),
        param.get("unit"),
    )


def enrich_param(param: dict) -> tuple[dict, dict]:
    """Возвращает (enriched_param, meta). meta — для отчёта."""
    # 1. kind
    kind, kind_source = infer_kind(param)
    # 2. Select-типизация (уточняет enum → ordinal/nominal)
    select_typing: str | None = None
    option_positions: list | None = None
    option_aliases: dict | None = None
    if param.get("ui_element") == "Select":
        select_typing, option_positions, option_aliases = type_select(param)
        if select_typing == "ordinal":
            kind = "ordinal_select"
        elif select_typing == "nominal":
            kind = "enum"
    # 3. axes + domain
    axes, axes_reason = infer_axes(param, kind)
    domain = AXIS_DOMAIN.get(axes[0], "system") if axes else (
        "system" if kind == "system" else "uncategorized"
    )
    if kind == "system":
        domain = "system"
        axes = []
        axes_reason = "system"
    # 4. vibe_id
    vibe_id = extract_vibe_id(param.get("technical_name", ""))
    # 5. polarity_override — null по умолчанию; ревью в отчёте
    polarity_override = None

    meta = {
        "kind": kind,
        "kind_source": kind_source,
        "axes": axes,
        "axes_reason": axes_reason,
        "domain": domain,
        "vibe_id": vibe_id,
        "select_typing": select_typing,
    }

    # порядок: существующие поля сохраняются, машинные — добавляются в конец
    enriched = dict(param)  # копия существующих
    enriched["domain"] = domain
    enriched["axes"] = axes
    enriched["quantity_kind"] = kind
    enriched["polarity_override"] = polarity_override
    enriched["vibe_id"] = vibe_id
    enriched["dedupe"] = {"canonical": None, "alias": False}
    enriched["select_typing"] = select_typing
    enriched["option_positions"] = option_positions
    enriched["option_aliases"] = option_aliases
    return enriched, meta


def run_dedupe(enriched: list[dict]) -> list[dict]:
    """Второй проход: находит дубликаты по (vibe_id, min,max,default,unit)."""
    buckets: dict[tuple, list[int]] = defaultdict(list)
    for i, p in enumerate(enriched):
        vid = p.get("vibe_id")
        if not vid:
            continue
        key = (vid, _scalar_signature(p))
        buckets[key].append(i)

    pairs: list[dict] = []
    for key, idxs in buckets.items():
        if len(idxs) < 2:
            continue
        # попарно проверяем name-условие
        for a_pos in range(len(idxs)):
            for b_pos in range(a_pos + 1, len(idxs)):
                i, j = idxs[a_pos], idxs[b_pos]
                pi, pj = enriched[i], enriched[j]
                ni, nj = pi["technical_name"], pj["technical_name"]
                related = _names_related(ni, nj) or _keywords_overlap(pi, pj)
                if related:
                    pairs.append({
                        "canonical_candidates": [ni, nj],
                        "vibe_id": key[0],
                        "unit": pi.get("unit"),
                        "min": pi.get("min_value"),
                        "max": pi.get("max_value"),
                        "default": pi.get("default"),
                    })
    # назначаем канонических: в каждой паре канонический = более короткое имя
    # (если в группе несколько — выбираем глобально самый короткий)
    canonical_map: dict[str, str] = {}
    for pair in pairs:
        names = pair["canonical_candidates"]
        # группа по vibe_id+sig уже в buckets; выберем канонического по длине имени
    # группируем пары в кластеры по (vibe_id, sig)
    clusters: dict[tuple, set[str]] = defaultdict(set)
    for pair in pairs:
        key = (pair["vibe_id"], _scalar_signature_from_pair(pair))
        for nm in pair["canonical_candidates"]:
            clusters[key].add(nm)
    name_to_index: dict[str, int] = {p["technical_name"]: i for i, p in enumerate(enriched)}
    for key, names in clusters.items():
        if len(names) < 2:
            continue
        canonical = min(names, key=len)
        for nm in names:
            if nm != canonical and nm in name_to_index:
                idx = name_to_index[nm]
                enriched[idx]["dedupe"] = {"canonical": canonical, "alias": True}
            # canonical остаётся {canonical: None, alias: False}
    return pairs


def _scalar_signature_from_pair(pair: dict) -> tuple:
    return (
        pair.get("min"),
        pair.get("max"),
        json.dumps(pair.get("default"), sort_keys=True, ensure_ascii=False),
        pair.get("unit"),
    )


def _names_related(a: str, b: str) -> bool:
    if a == b:
        return True
    if a.startswith(b + "_") or b.startswith(a + "_"):
        return True
    suf_set = {"_ms", "_db", "_hz", "_per_sec", "_s", "_sec", "_bpm",
               "_cents", "_semitones", "_ratio", "_percent", "_seconds"}
    for suf in suf_set:
        if a == b + suf or b == a + suf:
            return True
    return False


def _keywords_overlap(a: dict, b: dict, threshold: float = 0.9) -> bool:
    ka = set(" ".join(a.get("semantic_keywords", [])).lower().split())
    kb = set(" ".join(b.get("semantic_keywords", [])).lower().split())
    if not ka or not kb:
        return False
    inter = len(ka & kb)
    union = len(ka | kb)
    if union == 0:
        return False
    return (inter / union) >= threshold


# ---------------------------------------------------------------------------
# 4. Отчёт
# ---------------------------------------------------------------------------

def build_report(enriched: list[dict], metas: list[dict],
                 dedupe_pairs: list[dict],
                 manual_assignments: list[dict]) -> dict:
    domain_dist = Counter(p["domain"] for p in enriched)
    kind_dist = Counter(p["quantity_kind"] for p in enriched)
    axes_primary = Counter(p["axes"][0] if p["axes"] else "<none>" for p in enriched)
    with_axes = sum(1 for p in enriched if p["axes"])
    without_axes = sum(1 for p in enriched if not p["axes"])
    select_typing_dist = Counter(
        p["select_typing"] for p in enriched if p.get("ui_element") == "Select"
    )
    vibe_count = sum(1 for p in enriched if p.get("vibe_id"))
    alias_count = sum(1 for p in enriched if p["dedupe"]["alias"])

    report = {
        "total_parameters": len(enriched),
        "expected_total": 2733,
        "counts_match": len(enriched) == 2733,
        "distributions": {
            "domain": dict(domain_dist.most_common()),
            "quantity_kind": dict(kind_dist.most_common()),
            "primary_axis": dict(axes_primary.most_common()),
            "select_typing": dict(select_typing_dist.most_common()),
        },
        "axes_coverage": {
            "with_axes": with_axes,
            "without_axes": without_axes,
            "without_axes_breakdown": {
                "system": sum(1 for p in enriched if not p["axes"] and p["domain"] == "system"),
                "uncategorized": sum(1 for p in enriched if not p["axes"] and p["domain"] == "uncategorized"),
            },
        },
        "vibe": {
            "params_with_vibe_id": vibe_count,
            "vibe_ids_unique": len({p["vibe_id"] for p in enriched if p.get("vibe_id")}),
        },
        "dedupe": {
            "pairs_found": len(dedupe_pairs),
            "params_marked_alias": alias_count,
            "pairs": dedupe_pairs,
        },
        "polarity_override": {
            "assigned": sum(1 for p in enriched if p["polarity_override"] is not None),
            "note": "Все polarity_override = null по умолчанию. Ревью полярностей "
                    "выполняется на этапе D (polarity_matrix) и фиксируется в "
                    "отдельных overrides только при подтверждённой инверсии.",
        },
        "manual_assignments": manual_assignments,
    }
    return report


# ---------------------------------------------------------------------------
# 5. CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Enrich Flowmusic parameters dataset")
    ap.add_argument("--dataset", default="../public/parameters-dataset.json",
                    help="path to parameters-dataset.json")
    ap.add_argument("--out", default="unified_parameters_enriched.json",
                    help="output enriched JSON")
    ap.add_argument("--report", default="enrichment_report.json",
                    help="output enrichment report JSON")
    args = ap.parse_args(argv)

    with open(args.dataset, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print("ERROR: dataset must be a JSON array", file=sys.stderr)
        return 2

    enriched: list[dict] = []
    metas: list[dict] = []
    manual_assignments: list[dict] = []

    for p in data:
        e, m = enrich_param(p)
        enriched.append(e)
        metas.append(m)
        # manual_assignments: остаток, не покрытый правилами
        if m["kind_source"] == "fallback":
            manual_assignments.append({
                "technical_name": p.get("technical_name"),
                "unit": p.get("unit"),
                "ui_element": p.get("ui_element"),
                "assigned_kind": m["kind"],
                "assigned_axes": m["axes"],
                "reason": "Не сработало ни unit-, ни name-правило; назначен "
                          "kind='amount' как generic-скаляр (intensity/amount). "
                          "Ревью: при наличии доменного контекста можно уточнить.",
            })
        if m["axes_reason"] == "none":
            manual_assignments.append({
                "technical_name": p.get("technical_name"),
                "assigned_kind": m["kind"],
                "assigned_axes": [],
                "reason": "Нет осевых токенов и нет kind-fallback; axes=[]. "
                          "Параметр не двигается семантически (как system).",
            })

    # auto-alias flag для nominal Select
    for p, m in zip(enriched, metas):
        if p.get("ui_element") == "Select" and p.get("select_typing") == "nominal":
            opts = p.get("options") or []
            aliases = p.get("option_aliases") or {}
            auto_only = []
            for o in opts:
                key = str(o)
                cur = CURATED_ALIASES.get(key.strip())
                if not cur:
                    auto_only.append(key)
            if auto_only:
                manual_assignments.append({
                    "technical_name": p.get("technical_name"),
                    "select_typing": "nominal",
                    "auto_aliased_options": auto_only,
                    "reason": "Опции не покрыты кураторским словарём алиасов; "
                              "сгенерированы детерминированные авто-алиасы "
                              "(опция + нормализации). Ревью: добавить "
                              "синонимы RU/EN для повышения match-rate.",
                })

    # vibe_id truncation flag (3+ токена в исходном vibe-имени)
    for p in data:
        nm = p.get("technical_name", "")
        if nm.startswith("vibe_"):
            rest = nm[len("vibe_"):]
            for suf in VIBE_QUANT_SUFFIXES:
                if rest.endswith(suf) and len(rest) - len(suf) > 0:
                    rest = rest[: -len(suf)]
                    break
            parts = [x for x in rest.split("_") if x]
            if len(parts) >= 4:
                manual_assignments.append({
                    "technical_name": nm,
                    "vibe_id_extracted": extract_vibe_id(nm),
                    "vibe_token_count": len(parts),
                    "reason": "vibe-имя содержит ≥4 токенов; vibe_id обрезан до "
                              "первых 2 токенов (детерминированное правило). "
                              "Ревью: если vibe-концепция многословная, уточнить.",
                })

    dedupe_pairs = run_dedupe(enriched)
    report = build_report(enriched, metas, dedupe_pairs, manual_assignments)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # stdout-сводка
    print(f"Enriched {len(enriched)} parameters → {args.out}")
    print(f"Report → {args.report}")
    print(f"counts_match: {report['counts_match']}")
    print(f"domain distribution: {report['distributions']['domain']}")
    print(f"quantity_kind distribution: {report['distributions']['quantity_kind']}")
    print(f"with_axes={report['axes_coverage']['with_axes']} without_axes={report['axes_coverage']['without_axes']}")
    print(f"dedupe pairs={len(dedupe_pairs)} marked_alias={report['dedupe']['params_marked_alias']}")
    print(f"manual_assignments={len(manual_assignments)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
