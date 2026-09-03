# Semantic Value Anchoring — Flowmusic Parameter RAG

Локальный слой **определения значений** параметров поверх существующего
retrieval-слоя (косинусное сходство эмбеддингов `bge-m3:q8_0` через Ollama).
**Без LLM в рантайме** — только эмбеддинги + косинус + лексика.

---

## Манифест артефактов

| Файл | Роль | Этап |
|---|---|---|
| `unified_parameters_enriched.json` | Датасет 2733 параметров + машинные поля (`domain`, `axes`, `quantity_kind`, `vibe_id`, `dedupe`, `select_typing`, `option_positions`, `option_aliases`, `polarity_override`). **Существующие поля не изменены.** | A |
| `enrichment_report.json` | Отчёт обогащения: распределения domain/kind/axes, все dedupe-пары, `manual_assignments` с обоснованиями. | A |
| `enrich_dataset.py` | Детерминированный источник истины — генерит enriched-датасет + отчёт. | A |
| `gen_axes.py` | Автор + валидатор `axes.json` (правило «без чисел/компаративов», word-count 8-15). | C |
| `axes.json` | 15 осей × 5 якорей × 4 парафразы (RU+EN, description+imperative). 300 авторских текстов. | C |
| `axes_build_meta.json` | sha256 + validation-мета для `axes.json`. | C |
| `lexical/direction_lexicon.json` | Direction-слова per quantity_kind (9 kinds × increase/decrease, ≥16 слов на категорию). | B |
| `lexical/degree_scale.json` | Степени δ (0.20/0.30/0.45/0.60), default 0.30. | B |
| `lexical/markers.json` | neutral/relative/toggle_on/toggle_off маркёры. | B |
| `lexical/numeric_units.json` | L0-парсер: синонимы единиц, дроби N/M, паттерны относительных выражений. | B |
| `polarity_matrix.json` | π ∈ {−1, 0, +1}, 15 осей × 9 kinds, без null. | D |
| `calibration/strong_set.json` | 156 запросов для калибровки κ_a (per-axis шаблоны + per-kind лексические пробы). | E |
| `calibration/neutral_set.json` | 188 запросов без direction-слов (99 вайбов + 89 инструкций). Ожидание: 0 движений. | E |
| `eval/eval_set.json` | 360 directional (180 уникальных combos + 180 парафраз) + 40 holistic с axis-профилем. | E |
| `gen_sets.py` | Детерминированный генератор калибровочных/eval-сетов. | E |
| `build_anchors.py` | Сборка `anchors_build.json` с Ollama (или `--stub` без Ollama). | F |
| `anchors_build.json` | Якоря, u_a, c_a, κ_a, a_home, диагностика. **stub=true** по умолчанию (lexical-only режим). | F |
| `anchoring.py` | Runtime-модуль: `anchor_query(query, scoped_params, current_values, cfg) → AnchorResponse`. | G |
| `eval_anchoring.py` | `--smoke` (10 запросов) / `--full` (neutral + directional + holistic). | H |
| `eval_report.json` | Отчёт `--full`: false-movement rate, direction accuracy, holistic MAE. | H |
| `README.md` | Этот файл. | I |

---

## Архитектура слоёв рантайма

```
запрос x, scoped_params (от существующего retrieval), session_state
 ├─ L0: numeric/lexical preempt    — «120 BPM», «+6 dB», «7/16» → прямые значения
 ├─ L1: lexical direction+degree   — словарь direction-слов per quantity_kind
 │        (приоритет над осями)
 ├─ L2: axis projection (fallback) — только если L0/L1 не сработали
 │        и anchors_build.json не заглушка
 └─ L3: применение формулы, clamp, snap, логирование источника решения
```

**Главная формула (Range):** `pos(v) = (v − min)/(max − min)`; слайдер = величина;
min = «меньше величины», max = «больше» (исключения — через `polarity_override`).

**Лексический путь:**
```
s = +1 для слов «увеличить величину kind», −1 для «уменьшить»
δ = степень (degree_scale)
v_p = clamp( base_p + s · δ · (max_p − min_p) ) → snap
```
`base_p = default_p`, но если запрос содержит relative-маркер («ещё», «сильнее»)
**И** параметр уже менялся в сессии → `base_p = текущее значение слайдера`.

**Осевой путь:**
```
u_a = normalize( ē_a(0.9) − ē_a(0.1) )     c_a = 0.5·(ē_a(0.9) + ē_a(0.1))
ē_id(p) — центроид эмбеддингов semantic_keywords параметра
Δa_a(x,p) = κ_a · dot( E(x) − ē_id(p), u_a )
v_p = clamp( base_p + γ · π(p,a) · Δa_a(x,p) · (max_p − min_p) ) → snap
```
Движение по оси применяется, только если `|Δa| ≥ ε_axis` (0.05). Иначе параметр
не трогаем. Если у параметра 2 оси — берём ось с максимальным `|Δa|`.

**Нейтральный запрос** (нет direction-слов, нет чисел, нет relative-маркеров) →
все значения остаются на базе. Лексический слой даёт это структурно; осевой —
через ε_axis-гейт.

**Attention-фильтр:** если в запросе есть конкретика, движение применяется не
ко всему scope: токены запроса (без стоп-слов) пересекаются с токенами
`technical_name + semantic_keywords`. Если хоть у одного параметра scope
пересечение непусто — двигаем только покрытые; иначе — все с direction-хитом.

---

## Шаги локального запуска

### 0. Предусловия

```bash
# Python 3.10+
python3 --version
# Опционально: requests для Ollama-клиента (иначе urllib из stdlib)
pip install requests
# Ollama с bge-m3
ollama serve &            # в отдельном терминале
ollama pull bge-m3        # или нужный тег q8_0
```

### 1. Положить артефакты

Все файлы из этого каталога уже на месте. Проверить:

```bash
ls -la anchoring/
# должны быть: enrich_dataset.py, gen_axes.py, gen_sets.py,
#              build_anchors.py, anchoring.py, eval_anchoring.py,
#              unified_parameters_enriched.json, enrichment_report.json,
#              axes.json, polarity_matrix.json, anchors_build.json (stub),
#              lexical/, calibration/, eval/, README.md
```

### 2. (Опц.) Перегенерить enriched-датасет и оси

```bash
python3 enrich_dataset.py --dataset ../public/parameters-dataset.json \
  --out unified_parameters_enriched.json --report enrichment_report.json
python3 gen_axes.py --out axes.json --report axes_build_meta.json
python3 gen_sets.py --strong calibration/strong_set.json \
  --neutral calibration/neutral_set.json --eval eval/eval_set.json
```

### 3. Собрать якоря с Ollama

```bash
python3 build_anchors.py --endpoint http://localhost:11434 \
  --model qllama/bge-m3:q8_0 \
  --out anchors_build.json
```

Без Ollama (или для smoke-проверки):

```bash
python3 build_anchors.py --stub --out anchors_build.json
# рантайм будет в lexical-only режиме (L2 пропускается)
```

### 4. Smoke-проверка лексического слоя

```bash
python3 eval_anchoring.py --smoke
# печатает 10 запросов и решения; neutral → no movement, directional → movement
```

### 5. Полный eval

```bash
python3 eval_anchoring.py --full --out eval_report.json
# neutral: false-movement rate
# directional: accuracy по направлению и δ-диапазону
# holistic: MAE профиля осей (после build_anchors, не в stub)
```

### 6. Интеграция в существующий retrieval-флоу

```python
from anchoring import anchor_query, Config

cfg = Config(
    gamma=1.5,
    epsilon_axis=0.05,
    axes_enabled=True,         # auto-false если anchors_build stub
    use_meta_axis=False,
    dataset_path="unified_parameters_enriched.json",
    axes_path="axes.json",
    polarity_path="polarity_matrix.json",
    anchors_path="anchors_build.json",
    lexical_dir="lexical",
    ollama_endpoint="http://localhost:11434",
    ollama_model="qllama/bge-m3:q8_0",
)

# scoped_params — выдача существующего retrieval (полные записи из
# unified_parameters_enriched.json)
# current_values — состояние слайдеров сессии (для relative-base)

response = anchor_query(
    query="сделай атаку сильно плавнее и хвост подлиннее",
    scoped_params=scoped_params,
    current_values=current_slider_values,  # dict[str, float|str] | None
    cfg=cfg,
)

# response = {
#   "param_name": {
#       "value": <новое значение>,
#       "before": <значение до>,
#       "source": "numeric" | "lexical" | "axis" | "default" | "neutral",
#       "detail": "<текстовое объяснение>"
#   },
#   ...
# }
for name, r in response.items():
    if r["source"] != "default":
        print(f"{name}: {r['before']} → {r['value']} [{r['source']}] {r['detail']}")
```

---

## Acceptance-критерии

| Критерий | Цель | Где проверяется |
|---|---|---|
| Neutral false-movement | < 5% (лексический: 0% структурно) | `eval_anchoring.py --full` → `neutral.false_movement_rate` |
| Directional accuracy | > 85% (по направлению) | `directional.direction_accuracy` |
| Оси валидны | `cos(ē_0.1, ē_0.9) ≤ 0.80` для всех 15 осей | `anchors_build.diagnostics.invalid_axes` (пусто) |
| Коррелированные оси | пары `cos(u_a,u_b) > 0.80` просмотрены | `anchors_build.diagnostics.orthogonality.correlated_axis_pairs` |
| Home-консистентность | `std(a_home)` внутри vibe_id ≤ 0.12 | `anchors_build.diagnostics.home_violations` |
| Детерминизм | повторный прогон 20 текстов → косинус ≥ 0.999 | `anchors_build.diagnostics.determinism.deterministic` |

**В stub-режиме** (без Ollama): neutral = 0% (выполняется), directional
покрытие ограничено лексическим слоем (long-tail формулировки без direction-слов
остаются no-movement — это правильно, осевой слой закроет их после `build_anchors.py`).

---

## Важное правило

**Якоря (ē_a), κ_a, a_home живут ТОЛЬКО в `anchors_build.json` и
пересчитываются тем же артефактом модели, что и поиск.** В датасете их нет.
Смена модели/датасета/осей → пересборка (проверяется по `dataset_sha` и
`axes_sha` в `anchors_build.json`).

---

## Структура каталога

```
anchoring/
├── README.md                          ← этот файл
├── enrich_dataset.py                  ← детерминированный источник истины (Этап A)
├── gen_axes.py                        ← автор + валидатор axes.json (Этап C)
├── gen_sets.py                        ← генератор калибровочных/eval-сетов (Этап E)
├── build_anchors.py                   ← сборка anchors_build.json (Этап F)
├── anchoring.py                       ← runtime-модуль (Этап G)
├── eval_anchoring.py                  ← eval-скрипт (Этап H)
├── unified_parameters_enriched.json   ← enriched датасет (2733, ~3.5 МБ)
├── enrichment_report.json             ← отчёт обогащения
├── axes.json                          ← 15 осей × 5 якорей × 4 парафразы
├── axes_build_meta.json               ← sha256 + validation
├── polarity_matrix.json               ← 15×9 матрица полярностей
├── anchors_build.json                 ← якоря + κ + a_home (stub по умолчанию)
├── eval_report.json                   ← отчёт --full (после прогона)
├── lexical/
│   ├── direction_lexicon.json
│   ├── degree_scale.json
│   ├── markers.json
│   └── numeric_units.json
├── calibration/
│   ├── strong_set.json                ← 156 запросов
│   └── neutral_set.json               ← 188 запросов
└── eval/
    └── eval_set.json                  ← 400 запросов (360 dir + 40 holistic)
```

---

## Чеклист самопроверки (выполнен)

- [x] 2733 параметров обогащены; количество сверено с исходником; пропусков нет.
- [x] У каждого параметра: domain, quantity_kind, vibe_id, dedupe; axes — список или пусто с причиной (system).
- [x] Все nominal Select имеют option_aliases; все ordinal — option_positions.
- [x] 15 осей × 5 якорей × 4 парафразы; правило «без чисел/компаративов» соблюдено (0 warnings).
- [x] direction_lexicon покрывает все 9 kinds; degree/marker/numeric_units файлы на месте.
- [x] polarity_matrix 15×9 заполнена полностью, без null.
- [x] build/eval-скрипты синтаксически валидны; stub-режим описан и работает.
- [x] Все JSON прошли round-trip валидацию.
- [x] README содержит шаги запуска и acceptance-критерии.
