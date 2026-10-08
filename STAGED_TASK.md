# TASK.md — Развитие value-логики Flowmusic Genesis V3

## Контекст

V3 переведён на `qwen3-embedding:4b` (2560-D), независимость Single query реализована (`current_values={}`), composite index 6071 параметров собран. После миграции наблюдается деградация качества выбора значений относительно V2.

Анализ показал: деградация вызвана не сменой модели, а **удалением stateful merge V2** (который маскировал слабость value-логики) и **сломанным runtime axis projection** (`a_home` не читается, параметры переэмбеддятся на каждый запрос).

Цель: построить настоящую value-логику, в которой **embedding-модель выбирает значение**, а не Python-эвристика. Independence запросов сохраняется.

---

## Текущее состояние (факты из аудита)

### Что работает

- Composite index: 6071 × 2560 Qwen, binary Float32.
- Runtime atom index: 1274 × 2560.
- 15 global axes × 5 levels × 4 paraphrases = 300 anchor texts.
- `a_home` посчитан для 6071 параметров.
- Polarity matrix.
- Neutral / strong calibration (455 violations).
- L0 numeric, L1 lexical direction, L2 axis projection (`gamma=1.5`, `epsilon_axis=0.05`).
- `_description_direction` (добавлено в V3).
- Toggle on/off markers (10/10 в аудите).
- Select nominal aliases (194), Select ordinal option_positions (32).

### Что отсутствует / сломано

1. **Runtime `_param_eid` не читает `a_home` и composite vector.** Вместо этого переэмбеддит `semantic_keywords` на каждый запрос через новый Python process. Кэш не сохраняется. Это ломает L2 axis projection и даёт 455 neutral violations.
2. **Нет `retrieval_scope`.** Metadata/provenance/admin параметры (`interoperable_asset_*`, `provenance_*`, `smart_contract_*`) участвуют в retrieval наравне со sound.
3. **Нет per-parameter value anchors.** L2 умеет только сдвигать от default, не попадать в значение.
4. **Нет embeddings для Select options.** Только scalar `option_positions` и aliases.
5. **Нет multi-vector query.** Atom expansion сшивается в одну строку и один вектор.
6. **Нет согласования top-k.** Каждый параметр anchored независимо.
7. **Text/String/Array всегда default** (7+3+1 = 11 параметров).
8. **222 Select untyped** — для них только default.

### Метрики текущего состояния

| Метрика | Значение |
|---|---|
| Range (semantic matrix) | 5/10 |
| Select | 3/10 |
| Toggle | 10/10 |
| Unit | 13/13 |
| Complex | 8/10 |
| Target found (explicit) | 19/20 |
| Value correct (explicit) | 19/20 |
| Non-default в explicit | 50/476 = 10.5% |
| Neutral violations | 455 |
| Home violations | 0 |
| Correlated axis pairs | 0 |
| Determinism min cosine | 1.0 |

---

## Этап 1 — Фикс runtime axis projection + retrieval_scope

### 1.1. Задача: перестать переэмбеддить параметры

**Проблема:** `python_engine/anchoring_v3/anchoring.py::_param_eid` заново эмбеддит `semantic_keywords` через Qwen при каждом вызове. Bridge запускает новый process на каждый поиск — кэш теряется.

**Требуется:**

1. Bridge (`python_engine/anchoring_v3/bridge.py`) при старте загружает:
   - `data/combinatorial-genesis/v3/composite-index/manifest.json` — mapping `technical_name → row_index`;
   - `data/combinatorial-genesis/v3/composite-index/embeddings.f32` — binary vectors;
   - `data/combinatorial-genesis/v3/anchoring/anchors_build.json` — `a_home`.
2. `_param_eid(technical_name)` возвращает:
   - `E_parameter` — vector из `embeddings.f32` по row_index;
   - `a_home` — из `anchors_build.json`.
3. Повторные Qwen-вызовы для параметров **удалить полностью**.
4. Memory-map binary (`numpy.memmap` или эквивалент) — не читать весь файл в RAM.

**Файлы:**
- `python_engine/anchoring_v3/bridge.py` — загрузка индекса;
- `python_engine/anchoring_v3/anchoring.py::_param_eid` — чтение из кэша;
- `python_engine/anchoring_v3/anchoring.py::_axis_delta` — использовать `E_parameter` из кэша и `a_home`.

**Проверка:**
- `_param_eid` не вызывает Qwen ни разу за весь поиск;
- L2 axis projection использует те же векторы, что при build `a_home`;
- neutral violations должны упасть (ожидание: < 150, цель < 100).

### 1.2. Задача: retrieval_scope

**Требуется:**

1. Добавить поле `retrieval_scope` в dataset (`data/combinatorial-genesis/v3/dataset.json`) и в composite rows.
2. Значения: `sound`, `structure`, `metadata`, `provenance`, `administrative`.
3. Классификация:
   - автоматически по эвристикам (`technical_name`, `category`, `sub_category`, `description_en`);
   - правило: `interoperable_asset_*`, `provenance_*`, `smart_contract_*`, `gas_limit`, `hash`, `address`, `licensing`, `ownership_proof` → `metadata` / `provenance` / `administrative`;
   - всё остальное, что влияет на звук → `sound`;
   - композиция/структура/тайминг → `structure`.
4. В UI V3 добавить переключатель scope (по умолчанию: `sound` + `structure`).
5. В `src/lib/rag-v3/search.ts` отфильтровать кандидатов по scope до cosine.

**Файлы:**
- `data/combinatorial-genesis/v3/dataset.json` — новое поле;
- `python_engine/build-genesis-v3-composite-index.py` — запись scope в rows;
- `src/lib/rag-v3/search.ts` — фильтр;
- `src/components/rag-v3/SemanticSearch.tsx` — UI toggle.

**Проверка:**
- в top-k нет `metadata`/`provenance`/`administrative` при scope=`sound`;
- число параметров по scope зафиксировано в отчёте;
- переключение scope не ломает существующие тесты.

### 1.3. Критерии приёмки Этапа 1

- [ ] `_param_eid` читает из binary, Qwen не вызывается для параметров;
- [ ] нейтральные нарушения < 150;
- [ ] `retrieval_scope` заполнен для всех 6071 параметров;
- [ ] по умолчанию scope = sound + structure;
- [ ] semantic matrix не хуже текущего (Range ≥ 5/10, Complex ≥ 8/10);
- [ ] время поиска сократилось (замерить до/после);
- [ ] ESLint, Python compile, `git diff --check` проходят.

---

## Этап 2 — Value anchors + Select option embeddings

### 2.1. Value anchors для Range

**Требуется:**

1. Для каждого Range-параметра построить 5 семантических точек:
   - `min` (level 0.0);
   - `low` (level 0.25);
   - `default` (level 0.5);
   - `high` (level 0.75);
   - `max` (level 1.0).
2. Для каждой точки сформировать текст анкора:
   ```text
   "<natural_name> <state_word>, <descriptor_1>, <descriptor_2>"
   ```
   Пример для `filter_cutoff`:
   - min: `"filter cutoff fully closed, dark, muted, no brightness"`
   - low: `"filter cutoff low, warm, partially closed"`
   - default: `"filter cutoff medium, neutral, half-open"`
   - high: `"filter cutoff high, bright, mostly open"`
   - max: `"filter cutoff fully open, screaming, bright, harsh"`
3. Тексты генерировать детерминированно из `description_en`, `quantity_kind`, `unit`, `category`:
   - низкие уровни — слова из `description` в low-клаузе;
   - высокие — из high-клаузы;
   - если описаний нет — использовать `quantity_kind` + standard adjectives по типу параметра.
4. Эмбеддить через Qwen 2560-D, один вектор на точку.
5. Хранить в `data/combinatorial-genesis/v3/value-anchors/`:
   - `manifest.json` — mapping `technical_name → {row_index, 5 offsets}`;
   - `embeddings.f32` — binary Float32, contiguous.

**Числа:** ~5597 Range × 5 = ~28k векторов × 2560 × 4 bytes ≈ 287 MB. Приемлемо.

**Runtime:**

1. Query embedding `E_q`.
2. Для каждого top-k параметра:
   - cosine `E_q` с 5 anchors → `scores[0..4]`;
   - softmax (temperature ~0.1) или min-max нормализация;
   - интерполяция позиции:
     ```text
     p = Σ (level_i * weight_i)   ∈ [0, 1]
     value = min + p * (max - min)
     value = snap(value, step)
     value = clamp(value, min, max)
     ```
3. Value anchors применяются **после** L0 numeric (явное число всегда приоритетно) и **до** L1 lexical / L2 axis (которые остаются как fallback, если anchors дают низкую уверенность).

**Порог уверенности:** если max cosine < 0.2 — откат на существующие L1/L2.

**Файлы:**
- `python_engine/anchoring_v3/build_value_anchors.py` — новый;
- `python_engine/anchoring_v3/anchoring.py::_value_anchors_apply` — новый;
- `python_engine/anchoring_v3/anchoring.py::anchor_query` — встроить шаг;
- `data/combinatorial-genesis/v3/value-anchors/` — новые артефакты.

**Проверка:**
- Range semantic matrix: цель ≥ 8/10;
- explicit value correct: цель ≥ 19/20 (не хуже);
- default rate на non-neutral запросах: цель < 30%.

### 2.2. Select option embeddings

**Требуется:**

1. Для каждой Select-опции (448 Select, ~2200 опций) построить embedding.
2. Текст опции:
   ```text
   "<technical_name> set to <option>, <option_description_if_any>"
   ```
3. Хранить в `data/combinatorial-genesis/v3/value-anchors/select-options.f32` + manifest.
4. Runtime:
   - cosine query с каждой опцией;
   - выбрать top-1, если max cosine ≥ порога;
   - иначе fallback на aliases/exact match;
   - для ordinal Select — комбинировать с `option_positions`.

**Проверка:**
- Select semantic matrix: цель ≥ 7/10;
- typed nominal Select: значение не default при явном упоминании опции.

### 2.3. Toggle — оставить как есть

Toggle работает 10/10. Не трогать, кроме случая, когда нужно добавить value anchors как fallback.

### 2.4. Критерии приёмки Этапа 2

- [ ] 5 anchors на каждый Range, эмбеддинги построены;
- [ ] Select options эмбеддированы;
- [ ] runtime использует cosine + softmax + интерполяция;
- [ ] L0 numeric имеет приоритет над anchors;
- [ ] L1/L2 работают как fallback при низкой уверенности anchors;
- [ ] Range ≥ 8/10, Select ≥ 7/10;
- [ ] default rate < 30% на non-neutral;
- [ ] neutral violations не выросли;
- [ ] время поиска выросло не более чем на 30%.

---

## Этап 3 — Multi-vector query + согласование top-k

### 3.1. Multi-vector query

**Проблема:** сейчас atom expansion — одна строка `"Combinatorial atoms: ..."` и один embedding. Концепты смешиваются.

**Требуется:**

1. Декомпозиция query на концепты без LLM:
   - split по `,`, `;`, `.`, ` and `, ` with `, ` plus `, ` without `;
   - либо attention pooling над токенами (если есть trained head);
   - либо простой вариант: n-граммы с весами через IDF.
2. Каждый концепт → отдельный Qwen-вектор.
3. Scoring:
   - параметр получает score = max(cos(q_i, param_anchor_i)) по всем i;
   - либо softmax-взвешенная сумма;
   - value anchors матчатся с соответствующим концептом, а не с общим query.
4. Фильтр шума: концепты с низким IDF или стоп-слова отбрасываются.

**Файлы:**
- `src/lib/rag-v3/search.ts::buildEffectiveQuery` — вернуть массив;
- `src/lib/rag-v3/search.ts::searchV3` — multi-vector scoring;
- `python_engine/anchoring_v3/anchoring.py::anchor_query` — принимать массив векторов.

**Проверка:**
- Complex semantic matrix: цель ≥ 9/10;
- запрос с двумя концептами (`"dark cutoff + screaming resonance"`) активирует оба параметра независимо.

### 3.2. Relation anchors

**Требуется:**

1. Построить набор relation-анкоров для известных пар:
   - `cutoff ↔ resonance` (acid, screaming, filter sweep);
   - `attack ↔ decay` (punchy, plucky);
   - `dry ↔ wet` (tight, spacious);
   - `pitch_slide ↔ portamento` (303 glide);
   - `warmth ↔ brightness` (analog vs digital);
   - `density ↔ stereo_width` (dense but not muddy);
   - дополнительные по мере необходимости.
2. Текст relation-анкора:
   ```text
   "<effect>: <param_a> <direction_a> with <param_b> <direction_b>"
   ```
   Пример: `"screaming acid bass: high resonance with high cutoff, aggressive filter modulation"`
3. Эмбеддинг → вектор.
4. Runtime:
   - если query близок к relation-анкору (cosine ≥ порога), активируется constraint:
     - оба параметра получают согласованное направление;
     - значение каждого уточняется через value anchors.
5. Механизм применения:
   - не жёсткий rule, а bias: `score_adj = score + α * relation_match`;
   - α настраивается, стартовое значение 0.15.

**Файлы:**
- `python_engine/anchoring_v3/build_relation_anchors.py` — новый;
- `data/combinatorial-genesis/v3/relations/manifest.json` + `embeddings.f32`;
- `src/lib/rag-v3/search.ts` — применение bias.

**Проверка:**
- запрос `"acid bass"` активирует cutoff + resonance согласованно;
- запрос `"warm analog"` не активирует relation `bright`;
- complex matrix не падает.

### 3.3. Согласование top-k

**Требуется:**

1. После individual scoring собрать матрицу `scores[concept][param]`.
2. Опционально — применять Sinkhorn / optimal transport:
   - строки = концепты, столбцы = параметры;
   - цель — согласованное назначение;
   - регуляризация энтропией (Sinkhorn iterations ~50).
3. Если OT не нужен (мало концептов) — использовать relation bias из 3.2.

**Файлы:**
- `src/lib/rag-v3/alignment.ts` — новый модуль.

**Проверка:**
- top-k содержит параметры, согласованные по концептам;
- diversity top-k ≥ baseline (замерить до/после).

### 3.4. Политика Text/String/Array

**Требуется:**

1. Для Text (7), String (3), Array (1) — 11 параметров.
2. Политика:
   - retrieval из существующих значений в dataset (если есть варианты);
   - либо LLM-генерация (отдельно, вне embedding-модели);
   - либо явная пометка `"not_generated"` с сохранением default.
3. Приоритет: retrieval > LLM > default.

**Файлы:**
- `python_engine/anchoring_v3/anchoring.py` — новый шаг.

**Проверка:**
- 11 параметров не падают в default при явном упоминании в query.

### 3.5. Критерии приёмки Этапа 3

- [ ] multi-vector query реализован, работает без LLM;
- [ ] relation anchors построены, ≥ 6 relations;
- [ ] relation bias применяется с α, зафиксированной в config;
- [ ] согласование top-k (OT или bias) работает;
- [ ] Text/String/Array: retrieval > LLM > default;
- [ ] Range ≥ 8/10, Select ≥ 7/10, Complex ≥ 9/10;
- [ ] default rate < 20% на non-neutral;
- [ ] neutral violations не выросли;
- [ ] determinism сохранён (repeat cosine = 1.0);
- [ ] independence Single query не нарушена (`current_values={}`).

---

## Общие требования

### Что НЕ менять

- `qwen3-embedding:4b` — оставить.
- Independence Single query — сохранить.
- Transition A/B — сохранить независимость обоих поисков.
- Composite index structure — расширять, не ломать.
- ESLint / TypeScript strict / Python compile — не регрессировать.

### Инженерные правила

- Binary форматы — `numpy.memmap` или аналог, не грузить в RAM.
- Инкрементальность: при изменении dataset — переиспользовать неизменившиеся векторы (SHA-256).
- Каждый этап — отдельный commit с отчётом.
- Отчёты — в `reports/` с датой и конфигурацией (модель, индекс, anchors).
- Метрики — пересчитывать после каждого этапа и сравнивать с baseline.

### Метрики для замеров

| Метрика | Baseline | После этапа 1 | После этапа 2 | После этапа 3 |
|---|---|---|---|---|
| Range | 5/10 | ≥ 5/10 | ≥ 8/10 | ≥ 8/10 |
| Select | 3/10 | ≥ 3/10 | ≥ 7/10 | ≥ 7/10 |
| Toggle | 10/10 | 10/10 | 10/10 | 10/10 |
| Complex | 8/10 | ≥ 8/10 | ≥ 8/10 | ≥ 9/10 |
| default rate (non-neutral) | ~90% | < 80% | < 30% | < 20% |
| neutral violations | 455 | < 150 | < 150 | < 150 |
| determinism | 1.0 | 1.0 | 1.0 | 1.0 |
| search time | baseline | ↓ | ≤ +30% | ≤ +50% |

### Формат отчёта по каждому этапу

```text
reports/RAG_V3_STAGE_<N>_<DATE>.md

## Конфигурация
- model: qwen3-embedding:4b
- dataset: cg-v1-<hash>
- composite: <count> × <dim>
- anchors: <build date>
- value anchors: <yes/no>
- relations: <count>

## Изменения
- файлы
- функции

## Метрики
- таблица до/после

## Проверки
- ESLint: pass/fail
- Python compile: pass/fail
- git diff --check: pass/fail
- semantic matrix: <path>
- explicit audit: <path>

## Известные ограничения
- ...
```

---

## Порядок выполнения

1. **Этап 1** — фикс runtime axis + retrieval_scope.
2. **Замер** — semantic matrix + explicit audit, сравнение с baseline.
3. **Этап 2** — value anchors + Select options.
4. **Замер** — те же тесты.
5. **Этап 3** — multi-vector + relations + согласование.
6. **Замер** — те же тесты.
7. **Итоговый отчёт** — сравнение V3 после всех этапов с V2 (на согласованных метриках, без mismatch 2560/1024).

Каждый этап завершается отчётом и, при необходимости, отдельным PR.

---

## Вопросы, требующие уточнения от автора

1. Порог уверенности value anchors (стартово 0.2) — оставить или откалибровать?
2. Температура softmax для anchors (стартово 0.1) — согласовать.
3. α для relation bias (стартово 0.15) — согласовать.
4. Минимальный набор relation anchors — подтвердить список из 6 или расширить.
5. Политика Text/String/Array — retrieval-only или LLM допустим?
6. Sinkhorn — обязателен или опционален на Этапе 3?

---

# Ответы на 6 вопросов

## 1. Порог уверенности value anchors (стартово 0.2)

**Ответ: не фиксировать, а калибровать эмпирически на Этапе 2, стартово — 0.25.**

Почему не 0.2:
- Qwen cosine-шкала плотная; в аудите явные совпадения давали ~0.4–0.6, слабые — 0.15–0.25.
- Порог 0.2 пустит слишком много шума в интерполяцию.
- Порог 0.3 — слишком консервативен, будет часто откатываться на L1/L2.

Схема:
1. Старт: 0.25.
2. На тестовом наборе построить распределение `max_cosine` по всем top-k (гистограмма).
3. Найти точку, где `value_correct` максимален, а `default_rate` минимален без роста ошибок.
4. Зафиксировать в config, записать в отчёт.

Порог **не должен быть глобальным** для всех Range. Разумно:
- `threshold_range = 0.25`;
- `threshold_select = 0.30` (опции короче, шум выше);
- `threshold_toggle = 0.20` (Toggle работает и без anchors).

Значения хранить в `anchoring_v3/config.json`, а не в коде.

---

## 2. Температура softmax для anchors

**Ответ: 0.05, не 0.1.**

Почему:
- 5 anchors — это малое число классов.
- При T=0.1 softmax даёт слишком «размазанное» распределение: `min` и `max` получают заметный вес даже при сильном сигнале.
- При T=0.05 распределение становится более пиковым — модель уверенно выбирает ближайший уровень, но сохраняет плавность между соседними.

Практика:
- T=0.05 — рабочая.
- T=0.02 — если нужно почти дискретное поведение (для явных значений вроде «85% resonance»).
- T=0.1 — только если запрос действительно размытый («сделай потеплее»).

Рекомендую **двухуровневую схему**:
- явный сигнал (число, сильное слово) → T=0.02;
- размытый сигнал (направление, описание) → T=0.05.

Температуру хранить в config, калибровать вместе с порогом.

---

## 3. α для relation bias

**Ответ: 0.15 — оставить как старт, но сделать adaptive.**

Почему:
- 0.15 — достаточно, чтобы повлиять на ранжирование, но не сломать individual scores.
- Если α > 0.3 — relation начинает доминировать, что опасно: relation-анкоров мало, они могут «перетянуть» нерелевантные параметры.
- Если α < 0.05 — эффекта нет.

Рекомендуемая схема:
```text
α_base = 0.15
α_actual = α_base * relation_confidence
```
где `relation_confidence = max_cosine(query, relation_anchor)`.

То есть при слабом совпадении с relation — bias почти не применяется; при сильном — применяется в полную силу. Это защищает от ложных активаций.

Дополнительно:
- ограничить суммарный bias: `α_actual ≤ 0.25`;
- логировать, какие relations активировались для каждого query.

---

## 4. Минимальный набор relation anchors

**Ответ: расширить с 6 до 12.** 6 — слишком мало, покрывают только узкий класс acid/analog/punchy.

Рекомендуемый набор:

**Гармония и фильтр (ядро):**
1. `cutoff ↔ resonance` — acid, screaming, filter sweep
2. `warmth ↔ brightness` — analog vs digital
3. `saturation ↔ cleanliness` — drive vs transparent

**Динамика:**
4. `attack ↔ decay` — punchy, plucky, staccato
5. `attack ↔ release` — pad vs pluck
6. `sustain ↔ decay` — organ vs bell

**Пространство:**
7. `dry ↔ wet` — tight vs spacious
8. `stereo_width ↔ mono_center` — wide but not muddy
9. `reverb_size ↔ reverb_decay` — hall vs plate

**Модуляция:**
10. `pitch_slide ↔ portamento` — 303 glide, TB-style
11. `lfo_rate ↔ lfo_depth` — wobble, vibrato
12. `modulation ↔ stability` — chaos vs controlled

Это покрывает ключевые классы: acid, pad, pluck, bass, lead, texture, space. Расширять дальше — по мере появления новых классов запросов, не «на всякий случай».

Каждый relation хранить с:
- `id`;
- `text`;
- `params` — список technical_names;
- `directions` — какие идут вверх/вниз;
- `embedding`;
- `α_scale` — опциональная поправка для конкретного relation.

---

## 5. Политика Text/String/Array

**Ответ: retrieval-only, LLM — опционально отдельным флагом, отключённым по умолчанию.**

Почему:
- 11 параметров — статистически незначимо, не стоит усложнять pipeline.
- LLM-генерация ломает determinism (аудит зафиксировал `cosine=1.0` на повторах) — это важное свойство, не хочется терять.
- LLM-генерация непредсказуема и дорога.
- Independence Single query сохраняется и без LLM.

Схема:
1. Приоритет 1: retrieval из существующих значений в dataset (если варианты есть).
2. Приоритет 2: если у параметра есть `default` и query явно его не отрицает — оставить default.
3. Приоритет 3 (опционально, флаг `enable_llm_text_generation=false`): LLM-генерация для Text.

Для Array:
- retrieval из published configs;
- интерполяция между двумя ближайшими массивами (если размерности совпадают);
- иначе default.

Для String:
- retrieval из существующих identifier'ов;
- иначе default.

Если в будущем понадобится LLM — включать отдельным флагом, не смешивать с embedding-логикой. LLM-вызов должен быть **вне** Python anchoring bridge, иначе потеряется determinism и вырастет latency.

---

## 6. Sinkhorn / optimal transport

**Ответ: опционален, включать только на Этапе 3 после multi-vector, и только как fallback.**

Почему не обязателен:
- Sinkhorn — сложный инструмент, решает согласование, но требует матрицу `concepts × params`.
- При небольшом числе концептов (2–4) и top-k 10–20 — обычного relation bias + individual scores достаточно.
- OT полезен, когда концептов много и они конфликтуют.
- OT ломает простоту отладки: трудно объяснить, почему параметр попал в top-k.

Рекомендуемая схема:
1. Этап 3 начинается без Sinkhorn.
2. Замер: Complex ≥ 9/10 достигается?
3. Если да — Sinkhorn не нужен.
4. Если нет — включить Sinkhorn как **отдельный режим**, сравнить метрики, оставить только если реально даёт прирост.

Параметры, если включать:
- `epsilon` (энтропийная регуляризация): 0.05–0.1;
- iterations: 50;
- конвергенция: по изменению транспортной матрицы `< 1e-4`.

Флаг: `enable_sinkhorn=false` по умолчанию. Включается только для диагностики или для запросов с ≥ 5 концептами.

---

## Сводная таблица

| # | Вопрос | Ответ | Флаг / файл |
|---|---|---|---|
| 1 | Порог anchors | 0.25 старт, калибровать, разные для Range/Select/Toggle | `anchoring_v3/config.json` |
| 2 | Температура softmax | 0.05; 0.02 для явных сигналов | `anchoring_v3/config.json` |
| 3 | α relation bias | 0.15 × confidence, ≤ 0.25 | `config.json` |
| 4 | Relation anchors | 12 вместо 6 | `relations/manifest.json` |
| 5 | Text/String/Array | retrieval-only, LLM off | `enable_llm_text_generation=false` |
| 6 | Sinkhorn | опционален, off by default | `enable_sinkhorn=false` |

---

## Зафиксированные параметры

| Параметр | Значение | Диапазон калибровки |
|---|---|---|
| threshold_range | 0.25 | 0.15–0.35 |
| threshold_select | 0.30 | 0.20–0.40 |
| threshold_toggle | 0.20 | 0.10–0.30 |
| softmax_temp_explicit | 0.02 | 0.01–0.05 |
| softmax_temp_diffuse | 0.05 | 0.03–0.10 |
| relation_alpha_base | 0.15 | 0.05–0.25 |
| relation_alpha_max | 0.25 | — |
| enable_llm_text_generation | false | — |
| enable_sinkhorn | false | — |
| sinkhorn_epsilon | 0.075 | 0.05–0.10 |
| sinkhorn_iterations | 50 | 30–100 |

Все параметры хранятся в `python_engine/anchoring_v3/config.json` и `src/lib/rag-v3/config.ts`.
Калибровка на Этапах 2 и 3 записывается в отчёты.
```
