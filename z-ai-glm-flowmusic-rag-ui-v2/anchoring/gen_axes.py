#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_axes.py — авторинг и эмит axes.json (Этап C).

Содержит все 15 осей × 5 якорей × 4 парафразы (RU+EN, description+imperative).
Тексты якорей написаны вручную по контракту (раздел 5):
  - живые предложения 8–15 слов;
  - БЕЗ чисел и единиц измерения;
  - БЕЗ сравнительных степеней («быстрее»/«faster») — только состояния
    (description) и императивы результата (imperative);
  - все 4 парафразы семантически соответствуют своей позиции;
  - якорь 0.5 — нейтральная формулировка (калибровочная точка).

Прогон:
    python3 gen_axes.py --out axes.json

Скрипт также валидирует структуру и word-count, и пишет sha256 в отчёт.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from typing import Any

AXES: list[dict[str, Any]] = [
    # 1 ─────────────────────────────────────────────────────────────────
    {
        "id": "affective_arousal",
        "domain": "affective",
        "description": "Общая энергетическая заряженность и возбуждение эмоционального состояния трека.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A profoundly calm, meditative, almost motionless emotional state"},
                {"lang": "en", "register": "imperative", "text": "Keep the emotional energy profoundly calm, meditative and almost motionless"},
                {"lang": "ru", "register": "description", "text": "Глубоко спокойное, медитативное, почти неподвижное эмоциональное состояние"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональную энергию глубоко спокойной, медитативной и почти неподвижной"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A settled, low-key emotional presence with gentle stillness"},
                {"lang": "en", "register": "imperative", "text": "Hold the emotional energy settled and low-key with gentle stillness"},
                {"lang": "ru", "register": "description", "text": "Умеренно спокойное, низкоэнергетичное эмоциональное присутствие с мягкой неподвижностью"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональную энергию умеренно спокойной и низкоэнергетичной"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A balanced, neutral emotional presence with even energy"},
                {"lang": "en", "register": "imperative", "text": "Keep the emotional energy balanced, neutral and even"},
                {"lang": "ru", "register": "description", "text": "Сбалансированное, нейтральное эмоциональное присутствие с ровной энергией"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональную энергию сбалансированной, нейтральной и ровной"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "An engaged, lively emotional state with clear momentum"},
                {"lang": "en", "register": "imperative", "text": "Make the emotional energy engaged and lively with clear momentum"},
                {"lang": "ru", "register": "description", "text": "Вовлечённое, живое эмоциональное состояние с явным движением"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональную энергию вовлечённой и живой с явным движением"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "An extreme, feverish intensity with peak emotional arousal"},
                {"lang": "en", "register": "imperative", "text": "Drive the emotional energy to extreme, feverish, peak arousal"},
                {"lang": "ru", "register": "description", "text": "Экстремальная, лихорадочная интенсивность с пиковым эмоциональным возбуждением"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональную энергию экстремальной, лихорадочной и пиково возбуждённой"},
            ]},
        ],
    },
    # 2 ─────────────────────────────────────────────────────────────────
    {
        "id": "affective_valence",
        "domain": "affective",
        "description": "Эмоциональный тон по шкале мрачное—светлое (гедонистическая валентность).",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A very dark, gloomy, oppressive emotional atmosphere"},
                {"lang": "en", "register": "imperative", "text": "Make the emotional tone very dark, gloomy and oppressive"},
                {"lang": "ru", "register": "description", "text": "Очень тёмная, мрачная, гнетущая эмоциональная атмосфера"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональный тон очень тёмным, мрачным и гнетущим"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A somber, melancholic mood with a heavy undertone"},
                {"lang": "en", "register": "imperative", "text": "Keep the mood somber and melancholic with a heavy undertone"},
                {"lang": "ru", "register": "description", "text": "Мрачноватое, меланхоличное настроение с тяжёлым подтоном"},
                {"lang": "ru", "register": "imperative", "text": "Сделай настроение мрачноватым и меланхоличным с тяжёлым подтоном"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "An emotionally neutral, balanced tonal character"},
                {"lang": "en", "register": "imperative", "text": "Keep the emotional tone neutral and balanced"},
                {"lang": "ru", "register": "description", "text": "Эмоционально нейтральный, ровно сбалансированный тональный характер без перекосов"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональный тон нейтральным и сбалансированным"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A bright, hopeful mood with warm emotional light"},
                {"lang": "en", "register": "imperative", "text": "Make the mood bright and hopeful with warm emotional light"},
                {"lang": "ru", "register": "description", "text": "Светлое, надеждное настроение с тёплым эмоциональным светом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай настроение светлым и надеждным с тёплым эмоциональным светом"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A very bright, joyful, ecstatic emotional radiance"},
                {"lang": "en", "register": "imperative", "text": "Make the emotional tone very bright, joyful and ecstatic"},
                {"lang": "ru", "register": "description", "text": "Очень светлое, радостное, восторженное эмоциональное сияние"},
                {"lang": "ru", "register": "imperative", "text": "Сделай эмоциональный тон очень светлым, радостным и восторженным"},
            ]},
        ],
    },
    # 3 ─────────────────────────────────────────────────────────────────
    {
        "id": "energy_speed",
        "domain": "energy_flow",
        "description": "Скорость изменений энергии: от ледниково-медленных до мгновенных.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Glacial, almost imperceptible shifts in the energy flow"},
                {"lang": "en", "register": "imperative", "text": "Keep the energy shifts glacial and almost imperceptible"},
                {"lang": "ru", "register": "description", "text": "Ледниковые, почти незаметные сдвиги в потоке энергии"},
                {"lang": "ru", "register": "imperative", "text": "Сделай сдвиги энергии ледниковыми и почти незаметными"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Slow, gradual unfolding of the energy over long arcs"},
                {"lang": "en", "register": "imperative", "text": "Keep the energy unfolding slow and gradual over long arcs"},
                {"lang": "ru", "register": "description", "text": "Медленное, постепенное развёртывание энергии на длинных дугах"},
                {"lang": "ru", "register": "imperative", "text": "Сделай развёртывание энергии медленным и постепенным на длинных дугах"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate, even pace of energy changes"},
                {"lang": "en", "register": "imperative", "text": "Keep the pace of energy changes moderate and even"},
                {"lang": "ru", "register": "description", "text": "Умеренный, ровный и устойчивый темп изменений энергии в потоке"},
                {"lang": "ru", "register": "imperative", "text": "Сделай темп изменений энергии умеренным и ровным"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Quick, lively transitions in the energy flow"},
                {"lang": "en", "register": "imperative", "text": "Make the energy transitions quick and lively"},
                {"lang": "ru", "register": "description", "text": "Быстрые, живые переходы в потоке энергии"},
                {"lang": "ru", "register": "imperative", "text": "Сделай переходы энергии быстрыми и живыми"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Explosive, instantaneous switches in the energy"},
                {"lang": "en", "register": "imperative", "text": "Make the energy switches explosive and instantaneous"},
                {"lang": "ru", "register": "description", "text": "Очень взрывные, мгновенные и резкие переключения энергии в потоке"},
                {"lang": "ru", "register": "imperative", "text": "Сделай переключения энергии взрывными и мгновенными"},
            ]},
        ],
    },
    # 4 ─────────────────────────────────────────────────────────────────
    {
        "id": "energy_peak_intensity",
        "domain": "energy_flow",
        "description": "Контрастность динамики: от плоской ровной до резких частых пиков.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A flat, even dynamic contour without any peaks"},
                {"lang": "en", "register": "imperative", "text": "Keep the dynamics flat and even without peaks"},
                {"lang": "ru", "register": "description", "text": "Плоский, ровный динамический контур без каких-либо пиков"},
                {"lang": "ru", "register": "imperative", "text": "Сделай динамику плоской и ровной без пиков"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A gentle dynamic range with soft, mild swells"},
                {"lang": "en", "register": "imperative", "text": "Keep the dynamic range gentle with soft swells"},
                {"lang": "ru", "register": "description", "text": "Мягкий динамический диапазон с плавными, умеренными всплесками"},
                {"lang": "ru", "register": "imperative", "text": "Сделай динамический диапазон мягким с плавными всплесками"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A balanced dynamic contour with even rises and falls"},
                {"lang": "en", "register": "imperative", "text": "Keep the dynamic contour balanced with even rises and falls"},
                {"lang": "ru", "register": "description", "text": "Сбалансированный динамический контур с ровными подъёмами и спадами"},
                {"lang": "ru", "register": "imperative", "text": "Сделай динамический контур сбалансированным с ровными подъёмами"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Pronounced dynamic peaks with clear forward impact"},
                {"lang": "en", "register": "imperative", "text": "Make the dynamic peaks pronounced with clear impact"},
                {"lang": "ru", "register": "description", "text": "Выраженные динамические пики с явной ударностью"},
                {"lang": "ru", "register": "imperative", "text": "Сделай динамические пики выраженными с явной ударностью"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Extreme dynamic contrast with frequent sharp peaks"},
                {"lang": "en", "register": "imperative", "text": "Make the dynamic contrast extreme with frequent sharp peaks"},
                {"lang": "ru", "register": "description", "text": "Экстремальный динамический контраст с частыми резкими пиками"},
                {"lang": "ru", "register": "imperative", "text": "Сделай динамический контраст экстремальным с частыми резкими пиками"},
            ]},
        ],
    },
    # 5 ─────────────────────────────────────────────────────────────────
    {
        "id": "timbre_brightness",
        "domain": "timbre",
        "description": "Тональная яркость тембра: от тёмного глухого до звонкого верхами.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A very dark, muffled timbre with all energy in the lows"},
                {"lang": "en", "register": "imperative", "text": "Make the timbre very dark and muffled, all lows"},
                {"lang": "ru", "register": "description", "text": "Очень тёмный, глухой тембр со всей энергией в низах"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тембр очень тёмным и глухим, со всей энергией в низах"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A warm, slightly dark tone with rounded presence"},
                {"lang": "en", "register": "imperative", "text": "Keep the tone warm and slightly dark with rounded presence"},
                {"lang": "ru", "register": "description", "text": "Тёплый, слегка тёмный тон с округлым присутствием"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тон тёплым и слегка тёмным с округлым присутствием"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A neutral tonal balance across the spectrum"},
                {"lang": "en", "register": "imperative", "text": "Keep the tonal balance neutral across the spectrum"},
                {"lang": "ru", "register": "description", "text": "Нейтральный тональный баланс по всему спектру"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тональный баланс нейтральным по всему спектру"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A bright, present tone with clear high content"},
                {"lang": "en", "register": "imperative", "text": "Make the tone bright and present with clear highs"},
                {"lang": "ru", "register": "description", "text": "Яркий, присутствующий тон с явным верхним содержанием"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тон ярким и присутствующим с явными верхами"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A very bright, ringing timbre rich in highs"},
                {"lang": "en", "register": "imperative", "text": "Make the timbre very bright and ringing, rich in highs"},
                {"lang": "ru", "register": "description", "text": "Очень яркий, звонкий тембр, богатый верхами"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тембр очень ярким и звонким, богатым верхами"},
            ]},
        ],
    },
    # 6 ─────────────────────────────────────────────────────────────────
    {
        "id": "timbre_roughness",
        "domain": "timbre",
        "description": "Грубость/жёсткость тембра: от идеально гладкого до предельно жёсткого.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A perfectly smooth, clean, almost sterile timbre"},
                {"lang": "en", "register": "imperative", "text": "Make the timbre perfectly smooth and clean, almost sterile"},
                {"lang": "ru", "register": "description", "text": "Идеально гладкий, чистый, почти стерильный тембр"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тембр идеально гладким и чистым, почти стерильным"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A smooth, polished texture with mild edge"},
                {"lang": "en", "register": "imperative", "text": "Keep the texture smooth and polished with mild edge"},
                {"lang": "ru", "register": "description", "text": "Гладкая, отполированная текстура с лёгкой гранью"},
                {"lang": "ru", "register": "imperative", "text": "Сделай текстуру гладкой и отполированной с лёгкой гранью"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A neutral texture, neither smooth nor harsh"},
                {"lang": "en", "register": "imperative", "text": "Keep the texture neutral, neither smooth nor harsh"},
                {"lang": "ru", "register": "description", "text": "Нейтральная текстура, ни гладкая, ни жёсткая"},
                {"lang": "ru", "register": "imperative", "text": "Сделай текстуру нейтральной, без гладкости и жёсткости"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A rough, gritty texture with a clear edge"},
                {"lang": "en", "register": "imperative", "text": "Make the texture rough and gritty with a clear edge"},
                {"lang": "ru", "register": "description", "text": "Грубая, зернистая текстура с явной гранью"},
                {"lang": "ru", "register": "imperative", "text": "Сделай текстуру грубой и зернистой с явной гранью"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A maximally harsh, grainy, dissonant timbre"},
                {"lang": "en", "register": "imperative", "text": "Make the timbre maximally harsh, grainy and dissonant"},
                {"lang": "ru", "register": "description", "text": "Максимально жёсткий, зернистый и диссонирующий тембр с явной гранью"},
                {"lang": "ru", "register": "imperative", "text": "Сделай тембр максимально жёстким, зернистым и диссонирующим"},
            ]},
        ],
    },
    # 7 ─────────────────────────────────────────────────────────────────
    {
        "id": "rhythmic_density",
        "domain": "rhythm_density",
        "description": "Плотность потока событий: от редких до почти непрерывных.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Sparse events with a lot of empty space between them"},
                {"lang": "en", "register": "imperative", "text": "Keep the events sparse with a lot of empty space"},
                {"lang": "ru", "register": "description", "text": "Редкие события с большим пустым пространством между ними"},
                {"lang": "ru", "register": "imperative", "text": "Сделай события редкими с большим пустым пространством"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A relaxed, open rhythm with breathing room"},
                {"lang": "en", "register": "imperative", "text": "Keep the rhythm relaxed and open with breathing room"},
                {"lang": "ru", "register": "description", "text": "Расслабленный, открытый ритм с пространством для дыхания"},
                {"lang": "ru", "register": "imperative", "text": "Сделай ритм расслабленным и открытым с пространством для дыхания"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate density of events across the rhythm"},
                {"lang": "en", "register": "imperative", "text": "Keep the event density moderate across the rhythm"},
                {"lang": "ru", "register": "description", "text": "Умеренная, ровная плотность событий по всему ритму и потоку"},
                {"lang": "ru", "register": "imperative", "text": "Сделай плотность событий умеренной по ритму"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A busy, dense rhythm with little open space"},
                {"lang": "en", "register": "imperative", "text": "Make the rhythm busy and dense with little open space"},
                {"lang": "ru", "register": "description", "text": "Наполненный, плотный ритм с малым открытым пространством"},
                {"lang": "ru", "register": "imperative", "text": "Сделай ритм наполненным и плотным с малым открытым пространством"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A near-continuous, very dense stream of events"},
                {"lang": "en", "register": "imperative", "text": "Make the event stream near-continuous and very dense"},
                {"lang": "ru", "register": "description", "text": "Почти непрерывный, очень плотный поток событий"},
                {"lang": "ru", "register": "imperative", "text": "Сделай поток событий почти непрерывным и очень плотным"},
            ]},
        ],
    },
    # 8 ─────────────────────────────────────────────────────────────────
    {
        "id": "chaos_amplitude",
        "domain": "chaos_nonlinearity",
        "description": "Амплитуда хаоса: от полной предсказуемости до дикой непредсказуемости.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Full stability and complete predictability throughout"},
                {"lang": "en", "register": "imperative", "text": "Keep everything fully stable and completely predictable"},
                {"lang": "ru", "register": "description", "text": "Полная стабильность и абсолютная предсказуемость повсюду"},
                {"lang": "ru", "register": "imperative", "text": "Сделай всё полностью стабильным и абсолютно предсказуемым"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Mostly stable behavior with slight controlled variation"},
                {"lang": "en", "register": "imperative", "text": "Keep behavior mostly stable with slight controlled variation"},
                {"lang": "ru", "register": "description", "text": "Преимущественно стабильное поведение с лёгким контролируемым разбросом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай поведение преимущественно стабильным с лёгким разбросом"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate amount of controlled, balanced variation"},
                {"lang": "en", "register": "imperative", "text": "Keep the variation moderate, controlled and balanced"},
                {"lang": "ru", "register": "description", "text": "Умеренное количество контролируемого и сбалансированного разброса в поведении"},
                {"lang": "ru", "register": "imperative", "text": "Сделай разброс умеренным, контролируемым и сбалансированным"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Unpredictable behavior with strong chaotic modulation"},
                {"lang": "en", "register": "imperative", "text": "Make the behavior unpredictable with strong chaotic modulation"},
                {"lang": "ru", "register": "description", "text": "Непредсказуемое поведение с сильной хаотической модуляцией"},
                {"lang": "ru", "register": "imperative", "text": "Сделай поведение непредсказуемым с сильной хаотической модуляцией"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Wild unpredictability with very strong chaotic modulation"},
                {"lang": "en", "register": "imperative", "text": "Make the behavior wild and unpredictable with strong chaotic modulation"},
                {"lang": "ru", "register": "description", "text": "Дикая непредсказуемость с очень сильной хаотической модуляцией"},
                {"lang": "ru", "register": "imperative", "text": "Сделай поведение диким и непредсказуемым с сильной хаотической модуляцией"},
            ]},
        ],
    },
    # 9 ─────────────────────────────────────────────────────────────────
    {
        "id": "spatial_motion",
        "domain": "spatial",
        "description": "Движение звука в пространстве: от статичного до стремительного сложного.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A static sound fixed firmly in the stereo field"},
                {"lang": "en", "register": "imperative", "text": "Keep the sound static and fixed in the stereo field"},
                {"lang": "ru", "register": "description", "text": "Статичный звук, жёстко зафиксированный в стереополе"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звук статичным и зафиксированным в стереополе"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Subtle, slow spatial movement across the field"},
                {"lang": "en", "register": "imperative", "text": "Keep the spatial movement subtle and slow across the field"},
                {"lang": "ru", "register": "description", "text": "Едва заметное, медленное пространственное движение по полю"},
                {"lang": "ru", "register": "imperative", "text": "Сделай пространственное движение едва заметным и медленным"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate amount of spatial motion in the field"},
                {"lang": "en", "register": "imperative", "text": "Keep the spatial motion moderate in the field"},
                {"lang": "ru", "register": "description", "text": "Умеренное, ровное пространственное движение в стереополе и по глубине"},
                {"lang": "ru", "register": "imperative", "text": "Сделай пространственное движение умеренным в стереополе"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Lively, active movement across the stereo field"},
                {"lang": "en", "register": "imperative", "text": "Make the stereo movement lively and active"},
                {"lang": "ru", "register": "description", "text": "Живое и активное движение по всему стереополю звука"},
                {"lang": "ru", "register": "imperative", "text": "Сделай движение по стереополю живым и активным"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Rapid, complex motion through stereo and three dimensions"},
                {"lang": "en", "register": "imperative", "text": "Make the motion rapid and complex through stereo and three dimensions"},
                {"lang": "ru", "register": "description", "text": "Стремительное, сложное движение через стерео и три измерения"},
                {"lang": "ru", "register": "imperative", "text": "Сделай движение стремительным и сложным в стерео и трёх измерениях"},
            ]},
        ],
    },
    # 10 ────────────────────────────────────────────────────────────────
    {
        "id": "spatial_depth",
        "domain": "spatial",
        "description": "Глубина пространства: от сухого плоского до залитого эхом.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A dry, flat, close sound with no echo"},
                {"lang": "en", "register": "imperative", "text": "Keep the sound dry, flat, close and without echo"},
                {"lang": "ru", "register": "description", "text": "Сухой, плоский, близкий звук без эха"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звук сухим, плоским, близким и без эха"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A small, intimate space with a short tail"},
                {"lang": "en", "register": "imperative", "text": "Keep the space small and intimate with a short tail"},
                {"lang": "ru", "register": "description", "text": "Маленькое, интимное пространство с коротким хвостом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай пространство маленьким и интимным с коротким хвостом"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate room ambience around the sound"},
                {"lang": "en", "register": "imperative", "text": "Keep a moderate room ambience around the sound"},
                {"lang": "ru", "register": "description", "text": "Умеренная комнатная атмосфера вокруг звука в небольшом пространстве"},
                {"lang": "ru", "register": "imperative", "text": "Сделай комнатную атмосферу вокруг звука умеренной"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A deep, hall-like space with a long tail"},
                {"lang": "en", "register": "imperative", "text": "Make the space deep and hall-like with a long tail"},
                {"lang": "ru", "register": "description", "text": "Глубокое, залообразное пространство с длинным хвостом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай пространство глубоким и залообразным с длинным хвостом"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A deep, voluminous space drenched in echo"},
                {"lang": "en", "register": "imperative", "text": "Make the space deep and voluminous, drenched in echo"},
                {"lang": "ru", "register": "description", "text": "Очень глубокое и объёмное пространство, плотно залитое эхом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай пространство глубоким и объёмным, залитым эхом"},
            ]},
        ],
    },
    # 11 ────────────────────────────────────────────────────────────────
    {
        "id": "organic_mechanical",
        "domain": "organic_mechanical",
        "description": "Органичность: от предельно механического до предельно живого.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A maximally mechanical, rigid, synthetic character"},
                {"lang": "en", "register": "imperative", "text": "Make the character maximally mechanical, rigid and synthetic"},
                {"lang": "ru", "register": "description", "text": "Максимально механический, жёсткий и синтетический характер звука без жизни"},
                {"lang": "ru", "register": "imperative", "text": "Сделай характер максимально механическим, жёстким и синтетическим"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A mostly mechanical, precise and exact feel"},
                {"lang": "en", "register": "imperative", "text": "Keep the feel mostly mechanical, precise and exact"},
                {"lang": "ru", "register": "description", "text": "Преимущественно механическое, точное и выверенное ощущение"},
                {"lang": "ru", "register": "imperative", "text": "Сделай ощущение преимущественно механическим и выверенным"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A balance of organic warmth and mechanical precision"},
                {"lang": "en", "register": "imperative", "text": "Keep a balance of organic warmth and mechanical precision"},
                {"lang": "ru", "register": "description", "text": "Баланс органического тепла и механической точности"},
                {"lang": "ru", "register": "imperative", "text": "Сделай баланс органического тепла и механической точности"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A mostly organic, living, breathing feel"},
                {"lang": "en", "register": "imperative", "text": "Make the feel mostly organic, living and breathing"},
                {"lang": "ru", "register": "description", "text": "Преимущественно органическое, живое и дышащее ощущение звука в целом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай ощущение преимущественно органическим и живым"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A maximally organic, alive, fully natural character"},
                {"lang": "en", "register": "imperative", "text": "Make the character maximally organic, alive and natural"},
                {"lang": "ru", "register": "description", "text": "Максимально органический, живой, полностью естественный характер"},
                {"lang": "ru", "register": "imperative", "text": "Сделай характер максимально органическим, живым и естественным"},
            ]},
        ],
    },
    # 12 ────────────────────────────────────────────────────────────────
    {
        "id": "tonal_instability",
        "domain": "timbre",
        "description": "Стабильность строя: от идеально в строе до сильно расстроенного.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A perfectly in-tune, stable and locked pitch"},
                {"lang": "en", "register": "imperative", "text": "Keep the pitch perfectly in tune, stable and locked"},
                {"lang": "ru", "register": "description", "text": "Идеально чистый, стабильный и зафиксированный строй"},
                {"lang": "ru", "register": "imperative", "text": "Сделай строй идеально чистым, стабильным и зафиксированным"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A stable pitch with a slight hint of drift"},
                {"lang": "en", "register": "imperative", "text": "Keep the pitch stable with a slight hint of drift"},
                {"lang": "ru", "register": "description", "text": "Стабильный строй с лёгким намёком на плывучесть"},
                {"lang": "ru", "register": "imperative", "text": "Сделай строй стабильным с лёгким намёком на плывучесть"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A neutral tuning stability, neither locked nor wild"},
                {"lang": "en", "register": "imperative", "text": "Keep the tuning stability neutral, neither locked nor wild"},
                {"lang": "ru", "register": "description", "text": "Нейтральная стабильность строя, ни зафиксированная, ни дикая"},
                {"lang": "ru", "register": "imperative", "text": "Сделай стабильность строя нейтральной, без перекосов"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A noticeably drifting pitch with clear wobble"},
                {"lang": "en", "register": "imperative", "text": "Make the pitch noticeably drifting with clear wobble"},
                {"lang": "ru", "register": "description", "text": "Заметно плывущая высота с явным вибрато-дрейфом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай высоту заметно плывущей с явным дрейфом"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A heavily detuned sound with a wandering pitch"},
                {"lang": "en", "register": "imperative", "text": "Make the sound heavily detuned with a wandering pitch"},
                {"lang": "ru", "register": "description", "text": "Сильно расстроенный звук с блуждающей высотой"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звук сильно расстроенным с блуждающей высотой"},
            ]},
        ],
    },
    # 13 ────────────────────────────────────────────────────────────────
    {
        "id": "semantic_control_strength",
        "domain": "semantic_control",
        "description": "Meta-ось: насколько сильно семантика запроса управляет параметрами (модулирует γ).",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Semantics barely influence the parameter values"},
                {"lang": "en", "register": "imperative", "text": "Let semantics barely influence the parameter values"},
                {"lang": "ru", "register": "description", "text": "Семантика почти не влияет на значения параметров"},
                {"lang": "ru", "register": "imperative", "text": "Сделай так, чтобы семантика почти не влияла на параметры"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A weak influence of semantics on the parameters"},
                {"lang": "en", "register": "imperative", "text": "Keep the semantic influence on the parameters weak"},
                {"lang": "ru", "register": "description", "text": "Слабое влияние семантики на значения параметров в целом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай влияние семантики на параметры слабым"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate semantic control over the parameters"},
                {"lang": "en", "register": "imperative", "text": "Keep the semantic control over the parameters moderate"},
                {"lang": "ru", "register": "description", "text": "Умеренный семантический контроль над значениями параметров в целом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай семантический контроль над параметрами умеренным"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A strong influence of semantics on the parameters"},
                {"lang": "en", "register": "imperative", "text": "Make the semantic influence on the parameters strong"},
                {"lang": "ru", "register": "description", "text": "Сильное влияние семантики на значения параметров в целом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай влияние семантики на параметры сильным"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Semantics maximally control the parameter values"},
                {"lang": "en", "register": "imperative", "text": "Let semantics maximally control the parameter values"},
                {"lang": "ru", "register": "description", "text": "Семантика максимально и напрямую управляет всеми значениями параметров"},
                {"lang": "ru", "register": "imperative", "text": "Сделай так, чтобы семантика максимально управляла параметрами"},
            ]},
        ],
    },
    # 14 ────────────────────────────────────────────────────────────────
    {
        "id": "visual_metaphor_intensity",
        "domain": "visual_metaphor",
        "description": "Интенсивность визуальных образов: от чисто звукового до яркой синестезии.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A purely sonic description with no visual imagery"},
                {"lang": "en", "register": "imperative", "text": "Keep the description purely sonic, without visual imagery"},
                {"lang": "ru", "register": "description", "text": "Чисто звуковое описание без всякой образности"},
                {"lang": "ru", "register": "imperative", "text": "Сделай описание чисто звуковым, без визуальных образов"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Faint visual hints woven into the sonic description"},
                {"lang": "en", "register": "imperative", "text": "Keep only faint visual hints in the description"},
                {"lang": "ru", "register": "description", "text": "Слабые визуальные намёки, вплетённые в звуковое описание"},
                {"lang": "ru", "register": "imperative", "text": "Сделай в описании лишь слабые визуальные намёки"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A moderate amount of visual imagery in the description"},
                {"lang": "en", "register": "imperative", "text": "Keep a moderate amount of visual imagery"},
                {"lang": "ru", "register": "description", "text": "Умеренное количество визуальных образов в описании"},
                {"lang": "ru", "register": "imperative", "text": "Сделай количество визуальных образов в описании умеренным"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Vivid visual descriptions alongside the sound"},
                {"lang": "en", "register": "imperative", "text": "Make the visual descriptions vivid alongside the sound"},
                {"lang": "ru", "register": "description", "text": "Яркие визуальные описания рядом со звуком"},
                {"lang": "ru", "register": "imperative", "text": "Сделай визуальные описания яркими рядом со звуком"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "Bright synesthesia with saturated visual imagery"},
                {"lang": "en", "register": "imperative", "text": "Make the synesthesia bright with saturated visual imagery"},
                {"lang": "ru", "register": "description", "text": "Яркая синестезия с насыщенными визуальными образами"},
                {"lang": "ru", "register": "imperative", "text": "Сделай синестезию яркой с насыщенными визуальными образами"},
            ]},
        ],
    },
    # 15 ────────────────────────────────────────────────────────────────
    {
        "id": "style_traditional_radical",
        "domain": "style_identity",
        "description": "Жанровая идентичность: от строго традиционного до радикально экспериментального.",
        "anchors": [
            {"target_value": 0.1, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A strictly traditional and genre-faithful sound without deviation"},
                {"lang": "en", "register": "imperative", "text": "Keep the sound strictly traditional and genre-faithful"},
                {"lang": "ru", "register": "description", "text": "Строго традиционное, верное жанру и чистое звучание без отклонений"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звучание строго традиционным и верным жанру"},
            ]},
            {"target_value": 0.3, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A mostly conventional sound with small twists"},
                {"lang": "en", "register": "imperative", "text": "Keep the sound mostly conventional with small twists"},
                {"lang": "ru", "register": "description", "text": "Преимущественно conventional звучание с небольшими поворотами"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звучание преимущественно conventional с малыми поворотами"},
            ]},
            {"target_value": 0.5, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A balance of traditional and experimental elements"},
                {"lang": "en", "register": "imperative", "text": "Keep a balance of traditional and experimental elements"},
                {"lang": "ru", "register": "description", "text": "Ровный баланс традиционных и экспериментальных элементов в звучании в целом"},
                {"lang": "ru", "register": "imperative", "text": "Сделай баланс традиционных и экспериментальных элементов"},
            ]},
            {"target_value": 0.7, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A mostly experimental sound that bends the genre"},
                {"lang": "en", "register": "imperative", "text": "Make the sound mostly experimental, bending the genre"},
                {"lang": "ru", "register": "description", "text": "Преимущественно экспериментальное звучание, гнущее жанр в новую сторону"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звучание преимущественно экспериментальным, гнущим жанр"},
            ]},
            {"target_value": 0.9, "paraphrases": [
                {"lang": "en", "register": "description", "text": "A radically experimental sound that breaks the genre"},
                {"lang": "en", "register": "imperative", "text": "Make the sound radically experimental, breaking the genre"},
                {"lang": "ru", "register": "description", "text": "Радикально экспериментальное звучание, полностью ломающее жанр на части"},
                {"lang": "ru", "register": "imperative", "text": "Сделай звучание радикально экспериментальным, ломающим жанр"},
            ]},
        ],
    },
]


# ---------------------------------------------------------------------------
# Валидация
# ---------------------------------------------------------------------------

NUM_RE = re.compile(r"\d")
# comparatives — грубый эвристический фильтр (предупреждения, не ошибки)
EN_COMPAR = re.compile(r"\b(faster|slower|louder|quieter|brighter|darker|denser|sparser|"
                       r"sharper|smoother|rougher|harder|softer|warmer|cooler|deeper|"
                       r"higher|lower|longer|shorter|stronger|weaker|more|less)\b", re.I)
RU_COMPAR = re.compile(r"\b(быстрее|медленнее|громче|тише|ярче|темнее|плотнее|"
                       r"реже|резче|мягче|жёстче|глубже|выше|ниже|длиннее|короче|"
                       r"сильнее|слабее|больше|меньше)\b", re.I)


def validate(axes: list[dict]) -> list[str]:
    warnings: list[str] = []
    if len(axes) != 15:
        warnings.append(f"axis count = {len(axes)} (expected 15)")
    ids = set()
    for ax in axes:
        ids.add(ax["id"])
        if len(ax["anchors"]) != 5:
            warnings.append(f"{ax['id']}: anchor count = {len(ax['anchors'])} (expected 5)")
        tvs = [a["target_value"] for a in ax["anchors"]]
        if tvs != [0.1, 0.3, 0.5, 0.7, 0.9]:
            warnings.append(f"{ax['id']}: target_values = {tvs} (expected 0.1..0.9)")
        for ai, a in enumerate(ax["anchors"]):
            if len(a["paraphrases"]) != 4:
                warnings.append(f"{ax['id']}@{a['target_value']}: paraphrase count = {len(a['paraphrases'])}")
            regs = set()
            for p in a["paraphrases"]:
                regs.add((p["lang"], p["register"]))
                wc = len(p["text"].split())
                if wc < 6 or wc > 18:
                    warnings.append(f"{ax['id']}@{a['target_value']} {p['lang']}/{p['register']}: word_count={wc} (target 8-15)")
                if NUM_RE.search(p["text"]):
                    warnings.append(f"{ax['id']}@{a['target_value']} {p['lang']}/{p['register']}: contains a digit: {p['text']!r}")
                if EN_COMPAR.search(p["text"]):
                    warnings.append(f"{ax['id']}@{a['target_value']} {p['lang']}/{p['register']}: EN comparative detected: {p['text']!r}")
                if RU_COMPAR.search(p["text"]):
                    warnings.append(f"{ax['id']}@{a['target_value']} {p['lang']}/{p['register']}: RU comparative detected: {p['text']!r}")
            expected_regs = {("en", "description"), ("en", "imperative"), ("ru", "description"), ("ru", "imperative")}
            if regs != expected_regs:
                warnings.append(f"{ax['id']}@{a['target_value']}: register set = {regs}")
    expected_ids = {
        "affective_arousal", "affective_valence", "energy_speed",
        "energy_peak_intensity", "timbre_brightness", "timbre_roughness",
        "rhythmic_density", "chaos_amplitude", "spatial_motion",
        "spatial_depth", "organic_mechanical", "tonal_instability",
        "semantic_control_strength", "visual_metaphor_intensity",
        "style_traditional_radical",
    }
    if ids != expected_ids:
        warnings.append(f"axis ids mismatch: missing={expected_ids - ids}, extra={ids - expected_ids}")
    return warnings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="axes.json")
    ap.add_argument("--report", default="axes_build_meta.json")
    args = ap.parse_args(argv)

    warnings = validate(AXES)
    payload = {"axes": AXES}
    raw = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(raw)
    meta = {
        "axes_count": len(AXES),
        "anchors_total": sum(len(a["anchors"]) for a in AXES),
        "paraphrases_total": sum(len(pa["paraphrases"]) for a in AXES for pa in a["anchors"]),
        "sha256": sha,
        "validation_warnings": warnings,
    }
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Wrote {args.out} ({len(AXES)} axes, {meta['anchors_total']} anchors, {meta['paraphrases_total']} paraphrases)")
    print(f"sha256={sha}")
    print(f"validation_warnings={len(warnings)}")
    for w in warnings[:40]:
        print("  !", w)
    return 0 if not warnings else 1


if __name__ == "__main__":
    raise SystemExit(main())
