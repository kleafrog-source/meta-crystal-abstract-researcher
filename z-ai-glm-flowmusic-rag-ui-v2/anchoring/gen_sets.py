#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_sets.py — Этап E: детерминированная генерация калибровочных и eval-сетов.

Эмитит три артефакта:
  calibration/strong_set.json  — per-axis шаблонные запросы (RU+EN) для
                                 калибровки κ_a на strong-сигналах,
                                 |Δa| ∈ [0.3, 0.6]; плюс per-kind лексические пробы.
  calibration/neutral_set.json — ≥50 названий вайбов + ≥50 инструкций
                                 без direction-слов (ожидание: 0 движений).
  eval/eval_set.json           — ≥180 directional запросов
                                 (15 осей × 2 языка × 3 степени × 2 направления,
                                 с парафразами) + 40 holistic инструкций.

Контракты ожиданий:
  strong:    expected_axis + expected_sign + target_|Δa| ∈ [0.3, 0.6]
  neutral:   expected_movement = 0
  eval dir:  expected_direction ∈ {+1, -1}, expected_delta_range = (min,max)
  eval holo: expected_axis_profile = {axis: Δa ∈ {−0.3, 0, +0.3}}

Прогон:
    python3 gen_sets.py \
        --strong calibration/strong_set.json \
        --neutral calibration/neutral_set.json \
        --eval eval/eval_set.json
"""
from __future__ import annotations

import argparse
import itertools
import json
import sys
from typing import Any

# ---------------------------------------------------------------------------
# Осевые слова для шаблонных запросов: состояния/императивы, которые
# запрос формирует вокруг слова-степени. БЕЗ компаративов (контракт якорей).
# (Здесь допустимы осевые прилагательные — это запросы, не якоря.)
# ---------------------------------------------------------------------------
AXIS_POLAR_TERMS: dict[str, dict[str, list[str]]] = {
    # sign +1 → в сторону 0.9, sign -1 → в сторону 0.1
    "affective_arousal": {
        "+": ["лихорадочно возбуждённым", "feverishly intense", "предельно возбуждённым", "extremely aroused"],
        "-": ["глубоко медитативным", "profoundly meditative", "спокойным и медитативным", "calm and meditative"],
    },
    "affective_valence": {
        "+": ["очень светлым и радостным", "bright and joyful", "восторженным", "ecstatic"],
        "-": ["очень тёмным и мрачным", "very dark and gloomy", "гнетущим", "oppressive"],
    },
    "energy_speed": {
        "+": ["взрывным по скорости", "explosively fast", "мгновенным по сменам", "instantaneous"],
        "-": ["ледниково медленным", "glacially slow", "почти неподвижным по энергии", "almost motionless"],
    },
    "energy_peak_intensity": {
        "+": ["контрастным и пиковым", "contrasty and peaky", "резким по динамике", "sharp dynamics"],
        "-": ["плоским и ровным", "flat and even", "без пиков", "without peaks"],
    },
    "timbre_brightness": {
        "+": ["очень ярким и звонким", "very bright and ringing", "богатым верхами", "rich in highs"],
        "-": ["очень тёмным и глухим", "very dark and muffled", "всё в низах", "all in the lows"],
    },
    "timbre_roughness": {
        "+": ["предельно жёстким и зернистым", "maximally harsh and grainy", "диссонирующим", "dissonant"],
        "-": ["идеально гладким и чистым", "perfectly smooth and clean", "почти стерильным", "almost sterile"],
    },
    "rhythmic_density": {
        "+": ["почти непрерывно плотным", "near-continuous and dense", "плотным потоком", "dense stream"],
        "-": ["редким и воздушным", "sparse and airy", "с большим пустым пространством", "with lots of space"],
    },
    "chaos_amplitude": {
        "+": ["дико непредсказуемым", "wildly unpredictable", "с сильной хаотической модуляцией", "strong chaotic modulation"],
        "-": ["полностью стабильным и предсказуемым", "fully stable and predictable", "без сюрпризов", "no surprises"],
    },
    "spatial_motion": {
        "+": ["стремительным в движении", "rapid in motion", "сложным в стерео", "complex in stereo"],
        "-": ["статичным в пространстве", "static in space", "зафиксированным в центре", "fixed in centre"],
    },
    "spatial_depth": {
        "+": ["очень глубоким и залитым эхом", "very deep and drenched in echo", "объёмным залом", "voluminous hall"],
        "-": ["сухим и плоским", "dry and flat", "без эха", "without echo"],
    },
    "organic_mechanical": {
        "+": ["максимально органичным и живым", "maximally organic and alive", "естественным", "natural"],
        "-": ["максимально механическим и синтетическим", "maximally mechanical and synthetic", "жёстким", "rigid"],
    },
    "tonal_instability": {
        "+": ["сильно расстроенным", "heavily detuned", "с блуждающей высотой", "wandering pitch"],
        "-": ["идеально в строе", "perfectly in tune", "стабильным", "locked and stable"],
    },
    "semantic_control_strength": {
        "+": ["с максимальным семантическим контролем", "with maximal semantic control", "семантика рулит", "semantics rule"],
        "-": ["с минимумом семантического контроля", "with minimal semantic control", "почти без семантики", "barely semantic"],
    },
    "visual_metaphor_intensity": {
        "+": ["с яркой синестезией", "with bright synesthesia", "насыщенными образами", "saturated imagery"],
        "-": ["чисто звуковым", "purely sonic", "без образности", "no imagery"],
    },
    "style_traditional_radical": {
        "+": ["радикально экспериментальным", "radically experimental", "ломающим жанр", "genre-breaking"],
        "-": ["строго традиционным", "strictly traditional", "верным жанру", "genre-faithful"],
    },
}

DEGREES = [
    {"key": "subtle",   "ru": "чуть",          "en": "slightly",        "delta_target": 0.35},
    {"key": "medium",  "ru": "заметно",        "en": "noticeably",      "delta_target": 0.45},
    {"key": "strong",  "ru": "сильно",        "en": "strongly",        "delta_target": 0.55},
]


def build_strong_set() -> dict[str, Any]:
    items: list[dict] = []
    for axis_id, polar in AXIS_POLAR_TERMS.items():
        for sign_key, terms in polar.items():
            sign = 1 if sign_key == "+" else -1
            for term_idx, term in enumerate(terms):
                # каждый term — это парафраза; язык по наличию латиницы
                lang = "en" if all(ord(c) < 128 for c in term if c.isalpha()) else "ru"
                # Если term чисто английский — ru-вариант отсутствует; иначе ru
                # (в нашем словаре чередуем RU/EN: 1,3 — RU; 2,4 — EN)
                if term_idx % 2 == 0:
                    lang = "ru"
                else:
                    lang = "en"
                # степень: cycle subtle→medium→strong
                deg = DEGREES[term_idx % len(DEGREES)]
                if lang == "ru":
                    query = f"сделай звучание {deg['ru']} {term}"
                else:
                    query = f"make the sound {deg['en']} {term}"
                items.append({
                    "axis": axis_id,
                    "language": lang,
                    "query": query,
                    "expected_sign": sign,
                    "target_delta_abs": round(deg["delta_target"], 3),
                    "expected_delta_range": [0.30, 0.60],
                    "category": "axis_strong",
                })
    # per-kind лексические пробы: «сильнее/слабее» + kind-слово из direction_lexicon
    KIND_TERMS = {
        "tempo":    {"+": "быстрее",    "-": "медленнее",    "label_ru": "темп",       "label_en": "tempo"},
        "duration": {"+": "плавнее",   "-": "резче",        "label_ru": "атаку",      "label_en": "attack"},
        "rate":     {"+": "быстрее",   "-": "медленнее",    "label_ru": "скорость LFO","label_en": "LFO rate"},
        "level":    {"+": "громче",    "-": "тише",         "label_ru": "уровень",    "label_en": "level"},
        "density":  {"+": "плотнее",   "-": "реже",         "label_ru": "плотность",  "label_en": "density"},
        "detune":   {"+": "расстроеннее","-": "точнее",     "label_ru": "строй",      "label_en": "tuning"},
        "length":   {"+": "длиннее",   "-": "короче",       "label_ru": "хвост",      "label_en": "tail"},
        "amount":   {"+": "глубже",    "-": "слабее",       "label_ru": "глубину",    "label_en": "depth"},
        "count":    {"+": "больше",    "-": "меньше",       "label_ru": "число",      "label_en": "count"},
    }
    for kind, t in KIND_TERMS.items():
        for sign_key, sign in [("+", 1), ("-", -1)]:
            for lang in ["ru", "en"]:
                if lang == "ru":
                    query = f"сделай {t[sign_key]} {t['label_ru']} заметно"
                else:
                    en_word = t[sign_key]
                    query = f"make the {t['label_en']} {en_word}, noticeably"
                items.append({
                    "axis": None,
                    "kind": kind,
                    "language": lang,
                    "query": query,
                    "expected_sign": sign,
                    "target_delta_abs": 0.45,
                    "expected_delta_range": [0.30, 0.60],
                    "category": "kind_lexical",
                })
    return {
        "_meta": {
            "description": "Strong-set: per-axis шаблонные запросы (RU+EN, 3 степени, 2 направления) + per-kind лексические пробы. Используется для калибровки κ_a (медиана raw-Δ на κ=1) и для per-kind лексического smoke.",
            "count": len(items),
        },
        "items": items,
    }


# ---------------------------------------------------------------------------
# Neutral set: ≥50 вайб-названий + ≥50 инструкций без direction-слов
# ---------------------------------------------------------------------------

VIBE_NAMES = [
    "punishing whip", "abyssal bioluminescence", "acid wonderland",
    "alchemical lab", "alien abduction", "alien microtonal",
    "amber resin", "ancient frostbite", "antimatter bloom",
    "arctic cathedral", "ash and bone", "atmospheric noir",
    "aurora drift", "banshee wail", "basalt hum",
    "black sun ritual", "blood moon sonata", "blue hour stillness",
    "bone cathedral", "brass serpent", "broken clockwork",
    "burning library", "cave reverb", "celestial tide",
    "chernobyl garden", "chrome labyrinth", "city under glass",
    "crimson decay", "crystal cavern", "dark matter bloom",
    "deep sea meditation", "desert mirage", "distant thunder",
    "drowned choir", "dust and myrrh", "ebon tide",
    "echoing monastery", "electric swamp", "ember procession",
    "ethereal mist", "feral choir", "forgotten lullaby",
    "frozen cathedral", "ghost in the shell", "glass forest",
    "golden hour drift", "hollow earth", "ice garden",
    "indigo dream", "iron blossom", "jade pavilion",
    "lava lullaby", "lunar tide", "magnetic north",
    "marble halls", "midnight garden", "molten core",
    "mossy grove", "neon cathedral", "obsidian rain",
    "phantom procession", "quartz dream", "raven song",
    "scarlet veil", "shadow bazaar", "silk and smoke",
    "silver undertow", "smoke and mercury", "solar flare",
    "spider silk", "stone circle", "storm glass",
    "sulphur bloom", "temple of rust", "tide pool",
    "twilight circus", "underwater bell", "velvet cavern",
    "verdant void", "whispering archive", "withered bloom",
    "xenon haze", "yellowed parchment", "zenith bloom",
    "палач whip", "бездна биолюминесценция", "кислотная страна чудес",
    "алхимическая лаборатория", "инопланетное похищение", "янтарная смола",
    "древний frostbite", "костяной собор", "чёрное солнце",
    "лунный прилив", "молёное ядро", "затопленный хор",
    "забытая колыбельная", "мраморные залы", "обсидиановый дождь",
]

NEUTRAL_INSTRUCTIONS = [
    "настрой пресет", "поставь вайб", "сделай звучание", "выбери профиль",
    "prepare the preset", "setup the vibe", "establish the sound",
    "configure the patch",
    "настрой вайб {vibe}", "поставь вайб {vibe}", "сделай пресет в стиле {vibe}",
    "сделай звучание вайба {vibe}", "оформи профиль {vibe}",
    "prepare the {vibe} preset", "setup the {vibe} vibe",
    "establish a {vibe} sound", "configure the {vibe} patch",
    "make a {vibe} atmosphere", "build a {vibe} profile",
    "make me a {vibe} preset", "настрой атмосферу {vibe}",
    "сделай {vibe}", "поставь {vibe}",
    "build the {vibe} sound", "configure {vibe}",
    "make a preset called {vibe}", "назови пресет {vibe} и настрой его",
    "set up the {vibe} configuration",
    "просто настрой вайб {vibe} без изменений",
    "выбери пресет {vibe} как есть",
    "keep the {vibe} preset as is",
    "load the {vibe} patch",
    "activate the {vibe} profile",
    "включи пресет {vibe}", "загрузи патч {vibe}",
]


def build_neutral_set() -> dict[str, Any]:
    items: list[dict] = []
    # 1) названия вайбов как самостоятельные «запросы-настрой»
    for i, v in enumerate(VIBE_NAMES):
        # формируем запрос «поставь вайб <name>» на языке имени
        if all(ord(c) < 128 for c in v if c.isalpha()):
            q = f"поставь вайб {v}"  # ru-frame для EN-имён тоже ок
        else:
            q = f"настрой вайб {v}"
        items.append({
            "query": q,
            "language": "ru",
            "expected_movement": 0,
            "category": "vibe_name_setup",
        })
    # 2) инструкции-шаблоны с подстановкой вайба
    for tpl in NEUTRAL_INSTRUCTIONS:
        if "{vibe}" in tpl:
            # берём ~3 разных вайба на шаблон
            for v in VIBE_NAMES[:3]:
                items.append({
                    "query": tpl.format(vibe=v),
                    "language": "ru" if any(c.isalpha() and ord(c) >= 128 for c in tpl) or "вайб" in tpl or "пресет" in tpl or "настрой" in tpl or "поставь" in tpl or "сделай" in tpl or "оформи" in tpl or "выбери" in tpl else "en",
                    "expected_movement": 0,
                    "category": "instruction_template",
                })
        else:
            lang = "ru" if any(ord(c) >= 128 for c in tpl) else "en"
            items.append({
                "query": tpl,
                "language": lang,
                "expected_movement": 0,
                "category": "bare_instruction",
            })
    return {
        "_meta": {
            "description": "Neutral-set: запросы без direction-слов. Ожидание: 0 движений. Лексический слой даёт это структурно; осевой — через ε_axis-гейт. False-movement rate — главный acceptance-критерий.",
            "count": len(items),
            "vibe_names_total": len(VIBE_NAMES),
        },
        "items": items,
    }


# ---------------------------------------------------------------------------
# Eval set: ≥180 directional (15 axes × 2 lang × 3 degree × 2 dir + paraphrases)
# + 40 holistic с axis-профилем
# ---------------------------------------------------------------------------

HOLISTIC_TEMPLATES = [
    # (template, profile-якорь по 4 осям: axis → Δa ∈ {-0.3, 0, +0.3})
    ("сделай тёмный, плотный, медитативный ambient с глубоким хвостом",
     {"timbre_brightness": -0.3, "rhythmic_density": +0.3, "affective_arousal": -0.3, "spatial_depth": +0.3}),
    ("make a bright, sparse, playful groove with dry transients",
     {"timbre_brightness": +0.3, "rhythmic_density": -0.3, "affective_valence": +0.3, "spatial_depth": -0.3}),
    ("сделай жёсткий, хаотичный, очень быстрый drum&bass с резкими пиками",
     {"timbre_roughness": +0.3, "chaos_amplitude": +0.3, "energy_speed": +0.3, "energy_peak_intensity": +0.3}),
    ("make a warm, organic, slow-breathing dub with deep space",
     {"organic_mechanical": +0.3, "energy_speed": -0.3, "spatial_depth": +0.3, "timbre_brightness": -0.3}),
    ("сделай радикально экспериментальный, расстроенный, зернистый noise",
     {"style_traditional_radical": +0.3, "tonal_instability": +0.3, "timbre_roughness": +0.3, "rhythmic_density": +0.3}),
    ("make a strictly traditional, in-tune, smooth jazz ballad",
     {"style_traditional_radical": -0.3, "tonal_instability": -0.3, "timbre_roughness": -0.3, "affective_arousal": -0.3}),
    ("сделай очень объёмное, лихорадочно возбуждённое, движущееся в стерео звучание",
     {"spatial_depth": +0.3, "affective_arousal": +0.3, "spatial_motion": +0.3, "energy_peak_intensity": +0.3}),
    ("make a flat, dry, static, in-tune click track",
     {"energy_peak_intensity": -0.3, "spatial_depth": -0.3, "spatial_motion": -0.3, "tonal_instability": -0.3}),
    ("сделай светлый, воздушный, редкий, естественный folk-вайб",
     {"affective_valence": +0.3, "rhythmic_density": -0.3, "organic_mechanical": +0.3, "timbre_brightness": +0.3}),
    ("make a dark, dense, mechanical, detuned industrial rumble",
     {"affective_valence": -0.3, "rhythmic_density": +0.3, "organic_mechanical": -0.3, "tonal_instability": +0.3}),
    ("сделай яркую синестезию с предельной семантической управляемостью",
     {"visual_metaphor_intensity": +0.3, "semantic_control_strength": +0.3, "timbre_brightness": +0.3, "affective_valence": +0.3}),
    ("make a purely sonic, minimal, neutral, balanced texture",
     {"visual_metaphor_intensity": -0.3, "affective_arousal": 0.0, "rhythmic_density": 0.0, "timbre_roughness": 0.0}),
    ("сделай медитативный, гладкий, в строе, тёплый drone",
     {"affective_arousal": -0.3, "timbre_roughness": -0.3, "tonal_instability": -0.3, "timbre_brightness": -0.3}),
    ("make a feverish, grainy, wandering, lo-fi tape distortion vibe",
     {"affective_arousal": +0.3, "timbre_roughness": +0.3, "tonal_instability": +0.3, "timbre_brightness": -0.3}),
    ("сделай глубокий, залитый эхом, медленный, почти неподвижный эмбиент",
     {"spatial_depth": +0.3, "energy_speed": -0.3, "affective_arousal": -0.3, "rhythmic_density": -0.3}),
    ("make a dry, tight, snappy, bright percussion loop",
     {"spatial_depth": -0.3, "timbre_brightness": +0.3, "timbre_roughness": +0.3, "rhythmic_density": +0.3}),
    ("сделай дико непредсказуемый, стремительный, хаотичный glitch",
     {"chaos_amplitude": +0.3, "energy_speed": +0.3, "spatial_motion": +0.3, "rhythmic_density": +0.3}),
    ("make a stable, predictable, slow, breathing ambient pad",
     {"chaos_amplitude": -0.3, "energy_speed": -0.3, "organic_mechanical": +0.3, "affective_arousal": -0.3}),
    ("сделай радикально жанро-ломающий, но очень чистый и в строе микротональный опыт",
     {"style_traditional_radical": +0.3, "tonal_instability": 0.0, "timbre_roughness": -0.3, "rhythmic_density": 0.0}),
    ("make a genre-faithful but rough and dense rockabilly",
     {"style_traditional_radical": -0.3, "timbre_roughness": +0.3, "rhythmic_density": +0.3, "energy_peak_intensity": +0.3}),
    ("сделай максимальную семантическую управляемость при нейтральной динамике",
     {"semantic_control_strength": +0.3, "energy_peak_intensity": 0.0, "affective_arousal": 0.0, "rhythmic_density": 0.0}),
    ("make minimal semantic control but extreme dynamic peaks",
     {"semantic_control_strength": -0.3, "energy_peak_intensity": +0.3, "affective_arousal": +0.3, "timbre_roughness": +0.3}),
    ("сделай звонкий, быстрый, плотный, громкий и резкий breakcore",
     {"timbre_brightness": +0.3, "energy_speed": +0.3, "rhythmic_density": +0.3, "level": 0.0}),
    ("make a muffled, slow, sparse, quiet and smooth lullaby",
     {"timbre_brightness": -0.3, "energy_speed": -0.3, "rhythmic_density": -0.3, "timbre_roughness": -0.3}),
    ("сделай органичный, естественный, дышащий, тёплый живой ансамбль",
     {"organic_mechanical": +0.3, "affective_valence": +0.3, "timbre_brightness": -0.3, "energy_peak_intensity": -0.3}),
    ("make a mechanical, rigid, synthetic, cold and detuned android choir",
     {"organic_mechanical": -0.3, "affective_valence": -0.3, "tonal_instability": +0.3, "timbre_roughness": +0.3}),
    ("сделай визуально-образный, кинематографичный, насыщенный вайб с яркими сценами",
     {"visual_metaphor_intensity": +0.3, "affective_arousal": +0.3, "spatial_depth": +0.3, "timbre_brightness": +0.3}),
    ("make a purely sonic, no-imagery, abstract texture study",
     {"visual_metaphor_intensity": -0.3, "affective_arousal": 0.0, "energy_speed": 0.0, "rhythmic_density": 0.0}),
    ("сделай экстремально контрастный, плоско-тихий посередине, с резкими пиками по краям",
     {"energy_peak_intensity": +0.3, "affective_arousal": 0.0, "level": 0.0, "timbre_brightness": 0.0}),
    ("make an even, flat, mid-energy drone with no peaks",
     {"energy_peak_intensity": -0.3, "affective_arousal": 0.0, "rhythmic_density": -0.3, "spatial_motion": 0.0}),
    ("сделай стремительное сложное движение в стерео при статичной высоте",
     {"spatial_motion": +0.3, "tonal_instability": -0.3, "energy_speed": +0.3, "rhythmic_density": +0.3}),
    ("make a static, centred, locked-pitch mono-compatible mix",
     {"spatial_motion": -0.3, "tonal_instability": -0.3, "spatial_depth": -0.3, "affective_arousal": 0.0}),
    ("сделай редкий, воздушный, прозрачный, с большим пустым пространством эмбиент",
     {"rhythmic_density": -0.3, "spatial_depth": +0.3, "affective_arousal": -0.3, "timbre_brightness": +0.3}),
    ("make a near-continuous, very dense, saturated event stream",
     {"rhythmic_density": +0.3, "chaos_amplitude": +0.3, "energy_speed": +0.3, "affective_arousal": +0.3}),
    ("сделай очень тёмное, мрачное, гнетущее, медленное дарк-эмбиент",
     {"affective_valence": -0.3, "affective_arousal": -0.3, "timbre_brightness": -0.3, "energy_speed": -0.3}),
    ("make a very bright, joyful, ecstatic, fast and bouncy groove",
     {"affective_valence": +0.3, "affective_arousal": +0.3, "energy_speed": +0.3, "timbre_brightness": +0.3}),
    ("сделай глубокий, объёмный, залитый эхом hall с длинным хвостом",
     {"spatial_depth": +0.3, "length": +0.3, "timbre_brightness": -0.3, "energy_peak_intensity": -0.3}),
    ("make a dry, flat, close, short-tailed, direct sound",
     {"spatial_depth": -0.3, "length": -0.3, "timbre_brightness": +0.3, "energy_peak_intensity": +0.3}),
    ("сделай предельно жёсткий, зернистый, диссонирующий, расстроенный noise",
     {"timbre_roughness": +0.3, "tonal_instability": +0.3, "affective_valence": -0.3, "chaos_amplitude": +0.3}),
    ("make a perfectly smooth, clean, in-tune, locked and stable pure tone",
     {"timbre_roughness": -0.3, "tonal_instability": -0.3, "chaos_amplitude": -0.3, "affective_arousal": -0.3}),
]


def build_eval_set() -> dict[str, Any]:
    directional: list[dict] = []
    for axis_id, polar in AXIS_POLAR_TERMS.items():
        for sign_key in ["+", "-"]:
            sign = 1 if sign_key == "+" else -1
            terms = polar[sign_key]
            # для каждой степени берём RU+EN термин
            for di, deg in enumerate(DEGREES):
                for li, lang in enumerate(["ru", "en"]):
                    term = terms[di * 2 + li] if (di * 2 + li) < len(terms) else terms[li]
                    if lang == "ru":
                        query = f"сделай звучание {deg['ru']} {term}"
                    else:
                        query = f"make the sound {deg['en']} {term}"
                    directional.append({
                        "axis": axis_id,
                        "language": lang,
                        "degree": deg["key"],
                        "direction": sign,
                        "query": query,
                        "expected_direction": sign,
                        "expected_delta_range": [0.20, 0.60],
                        "category": "directional",
                    })
    # парафразы: по 1 дополнительной на каждый directional (для разнообразия)
    paraphrased: list[dict] = []
    for d in directional:
        q = d["query"]
        if q.startswith("сделай "):
            alt = q.replace("сделай ", "сделай ", 1)
            alt = alt.replace(d["query"].split()[1], "сделай так чтобы было", 1) if False else alt
            alt = q.replace("сделай звучание", "пусть звучание станет", 1)
        else:
            alt = q.replace("make the sound", "let the sound become", 1)
        paraphrased.append({**d, "query": alt, "category": "directional_paraphrase"})
    directional_all = directional + paraphrased

    holistic: list[dict] = []
    for tpl, profile in HOLISTIC_TEMPLATES:
        holistic.append({
            "query": tpl,
            "language": "ru" if any(ord(c) >= 128 for c in tpl) else "en",
            "expected_axis_profile": profile,
            "category": "holistic",
        })
    return {
        "_meta": {
            "description": "Eval-set: directional (15 осей × 2 языков × 3 степени × 2 направления + парафразы) + holistic (40 инструкций с целевым профилем осей Δa ∈ {−0.3, 0, +0.3}).",
            "counts": {
                "directional": len(directional),
                "directional_paraphrased": len(paraphrased),
                "holistic": len(holistic),
                "total": len(directional_all) + len(holistic),
            },
        },
        "directional": directional_all,
        "holistic": holistic,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strong", default="calibration/strong_set.json")
    ap.add_argument("--neutral", default="calibration/neutral_set.json")
    ap.add_argument("--eval", default="eval/eval_set.json")
    args = ap.parse_args(argv)

    strong = build_strong_set()
    neutral = build_neutral_set()
    ev = build_eval_set()

    with open(args.strong, "w", encoding="utf-8") as f:
        json.dump(strong, f, ensure_ascii=False, indent=2)
    with open(args.neutral, "w", encoding="utf-8") as f:
        json.dump(neutral, f, ensure_ascii=False, indent=2)
    with open(args.eval, "w", encoding="utf-8") as f:
        json.dump(ev, f, ensure_ascii=False, indent=2)

    print(f"strong_set: {strong['_meta']['count']} items → {args.strong}")
    print(f"neutral_set: {neutral['_meta']['count']} items ({neutral['_meta']['vibe_names_total']} vibe names) → {args.neutral}")
    print(f"eval_set: {ev['_meta']['counts']} → {args.eval}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
