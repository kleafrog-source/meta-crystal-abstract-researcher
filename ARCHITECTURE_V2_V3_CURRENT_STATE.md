# Техническое описание текущей архитектуры Flowmusic Genesis V3 и V2

Срез состояния: 2026-10-08. Документ описывает фактически существующий код и локальные артефакты. Предложения по изменению архитектуры не включены.

# Часть I. V3

## 1. Архитектура V3

### 1.1. Обработка Single query до embedding

**Файлы:** `src/components/rag-v3/SemanticSearch.tsx`, `src/store/rag-v3-store.ts`, `src/app/api/rag-v3/propose-parameters/route.ts`, `src/lib/rag-v3/instruction-support.ts`, `src/lib/rag-v3/search.ts`
**Функции:** `proposeParameters`, `POST`, `buildEffectiveQuery`, `searchV3`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560
**Формат хранения:** запрос передаётся как JSON по HTTP; состояния UI — Zustand/localStorage только для instruction settings, Top-K и source toggles.
**Обновление:** на каждый явный submit.

**Описание:**

`proposeParameters` обрезает пробелы, проверяет непустой query и отправляет `query`, `top_k`, пустой `current_values`, instruction context и переключатели источников в `/api/rag-v3/propose-parameters`. `buildEffectiveQuery` либо возвращает исходный query, либо добавляет включённые instruction blocks. Текст очищается функциями `sanitizeInstructionText`/`extractInstructionTheses`; instruction prefix модели не используется.

В `searchV3` сначала строится `baseQuery`. Первый embedding используется для поиска 20 runtime atoms. До 12 atoms, кроме role=`unit`, добавляются строкой `Combinatorial atoms: ...`; при наличии expansion выполняется второй embedding итогового `effectiveQuery`.

**Пробелы / известные ограничения:**

- Atom expansion является одной общей текстовой строкой, а не multi-vector decomposition.
- Включённые instruction slots изменяют embedding-текст запроса.

### 1.2. Преобразование запроса в вектор

**Файлы:** `src/lib/ollama-client.ts`, `src/lib/embedding-settings.ts`
**Функции:** `embedText`, `requestEmbedding`, `loadEmbeddingRuntimeSettings`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560
**Формат хранения:** runtime-вектор `number[]`; постоянный query cache отсутствует.
**Обновление:** новый вызов Ollama на каждый query/effective query.

**Описание:**

Клиент сначала вызывает Ollama `/api/embeddings` с `prompt`, затем при ошибке `/api/embed` с `input`. Явный pooling в приложении отсутствует: приложение принимает один вектор, возвращаемый Ollama. Явный instruction prefix отсутствует. Query-вектор нормализуется L2 непосредственно перед cosine/dot-product в `rankRuntimeAtoms` и `rankCompositeNames`.

**Пробелы / известные ограничения:** параметры pooling и внутренняя токенизация определяются Ollama/model implementation, а не кодом проекта.

### 1.3. Retrieval параметров

**Файлы:** `src/lib/rag-v3/search.ts`, `src/lib/rag-v3/composite-index.ts`, `src/lib/combinatorial-genesis/runtime-index.ts`
**Функции:** `searchV3`, `lexicalScore`, `rankRuntimeAtoms`, `rankCompositeNames`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560
**Формат хранения:** composite vectors — little-endian Float32 binary; rows/manifest — JSON.
**Обновление:** composite index переиспользует валидные cached vectors по model + text hash и вычисляет отсутствующие; runtime atom index создаётся pipeline для новой dataset version.

**Описание:**

Активные library и frozen параметры объединяются по `technical_name`; library имеет приоритет. Lexical prefilter сортирует все записи и оставляет `max(256, topK*4)`, но не больше размера корпуса. Для каждого кандидата composite cosine рассчитывается как dot product нормализованных векторов. Итоговая оценка:

```text
combined = cosine
         + min(20, lexical_score) * 0.02
         + 0.5, если query явно содержит Select option длиной >= 3
```

Результаты сортируются по `combined`, затем cosine, затем имени и обрезаются до Top-K. Порог минимальной similarity отсутствует. Top-K ограничен диапазоном 1..200.

**Числа:**

- composite parameters: 6071;
- library: 2823;
- frozen: 3255;
- после дедупликации по имени: 6071;
- runtime atoms: 1274;
- atom expansion: top 20, в query включается до 12 non-unit atoms;
- composite lexical candidate pool: не менее 256.

### 1.4. Выбор значения и участие Python

**Файлы:** `src/lib/rag-v3/python-bridge.ts`, `python_engine/anchoring_v3/bridge.py`, `python_engine/anchoring_v3/anchoring.py`
**Функции:** `runV3AnchoringBridge`, `main`, `anchor_query`
**Модель:** Qwen используется только для L2 query embedding/axis projection.
**Размерность:** 2560 для L2.
**Формат хранения:** JSON через stdin/stdout отдельного Python process.
**Обновление:** Python sidecar запускается для каждого поиска.

**Описание:**

TypeScript выполняет query construction и retrieval. Python получает только уже отобранные Top-K параметры и определяет их значения слоями L0/L1/L2. Embedding-модель не возвращает числовое значение ручки; она участвует в retrieval и axis projection. Ответ Python содержит `value`, `before`, `source`, `detail` для каждого scoped parameter.

### 1.5. Формирование финального Top-K и независимость

**Файлы:** `src/lib/rag-v3/search.ts`, `src/store/rag-v3-store.ts`
**Функции:** `toActive`, `proposeParameters`, `buildTransitionResults`
**Модель:** не применимо.
**Размерность:** не применимо.
**Формат хранения:** `ActiveParameter[]` в Zustand.
**Обновление:** полностью заменяется результатом нового Single query.

**Описание:**

`toActive` соединяет metadata, similarity и результат anchoring. В Single mode `current_values` всегда `{}`; backend начинает от dataset default. Новый `searchResults` и `activeParameters` заменяют предыдущую выдачу. Ручные значения текущего control bank не передаются в следующий поиск.

### 1.6. Transition A/B

**Файлы:** `src/store/rag-v3-store.ts`, `src/lib/rag-v3/transition-flow.ts`
**Функции:** `proposeParameters`, `buildTransitionResults`, `blendValue`, `buildTransitionFlowReport`
**Описание:** Query A и Query B выполняются как два независимых поиска. Для совпадающих numeric параметров значение линейно интерполируется по ratio и затем clamp/snap; Toggle и non-numeric выбирают сторону относительно 50%. Параметры только одной стороны сохраняются с weighted similarity. Итог сортируется и обрезается до Top-K.

## 2. Данные V3

### 2.1. Dataset V3

**Файлы:** `data/combinatorial-genesis/v3/dataset.json`, `data/combinatorial-genesis/library/parameters.json`, `data/combinatorial-genesis/datasets/cg-v1-306d35099d5a/parameters.json`
**Функции:** `build` в `python_engine/build-genesis-v3-composite-index.py`, `readGenesisLibrary`, `readFrozen`
**Модель:** metadata не зависит от embedding-модели.
**Размерность:** не применимо.
**Формат хранения:** JSON array.
**Обновление:** dataset.json полностью перезаписывается объединённым snapshot; library и frozen version обновляются pipeline отдельно.

**Описание:** 6071 уникальная запись: 2823 library + недублирующиеся frozen из 3255. Основные поля: `technical_name`, `name_ru`, `description_en`, `description_ru`, `category`, `sub_category`, `ui_element`, range bounds/step/default, `unit`, `options`, `lyria_prompt_tags`, `semantic_keywords`, `domain`, `axes`, `quantity_kind`, `polarity_override`, `vibe_id`, `select_typing`, `option_positions`, `option_aliases`.

### 2.2. Composite index

**Файлы:** `data/combinatorial-genesis/v3/composite-index/manifest.json`, `rows.json`, `embeddings.f32`
**Функции:** `build`, `cached_vectors`, `semantic_text`, `retrieval_text`, `loadIndex`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560
**Формат хранения:** manifest/rows JSON; header `<uint32 count,uint32 dimensions>` + contiguous little-endian Float32 vectors.
**Обновление:** инкрементальное переиспользование векторов при совпадении model и `embedding_text_sha256`; итоговые files переписываются атомарно на уровне build.

**Описание:** 6071 vector: 2823 origin=`ollama`, 3248 origin=`flowmusic_semantic_cache`. Semantic cache text включает natural technical name, name/descriptions, category/subcategory, tags, keywords и unit. Retrieval text включает technical name, category/subcategory, domain, quantity kind, keywords и tags.

### 2.3. Runtime atom index

**Файлы:** `data/combinatorial-genesis/indexes/cg-v1-306d35099d5a/manifest.json`, `atoms.json`, `atom_embeddings.f32`
**Функции:** `rankRuntimeAtoms`; build — `python_engine/build-combinatorial-runtime-index.py`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560
**Формат хранения:** JSON rows/manifest + Float32 binary.
**Обновление:** полностью для новой immutable dataset version; runtime cache reloads по version/cache SHA.

### 2.4. Live anchors, axes и calibration

**Файлы:** `data/combinatorial-genesis/v3/anchoring/anchors_build.json`, `axes.json`, `polarity_matrix.json`, `calibration/strong_set.json`, `calibration/neutral_set.json`, `lexical/*.json`
**Функции:** `build_axes_vectors`, `calibrate_kappa`, `check_neutral`, `build_a_home`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560
**Формат хранения:** JSON.
**Обновление:** live anchors полностью перестраиваются; composite parameter vectors читаются из persistent binary index.

**Числа:** 15 axes; 5 anchor levels на axis; 4 paraphrases на level; 300 anchor texts; strong set 156; neutral set 188; `a_home` 6071.

### 2.5. Value anchors и Select option embeddings

**Описание:** отдельных per-parameter value anchors для Range нет. Отдельных embeddings для Select options нет. `option_positions` и `option_aliases` являются JSON metadata, не vector index.

## 3. Anchors V3

### Типы и построение

**Файлы:** `python_engine/anchoring_v3/build_anchors.py`, `data/combinatorial-genesis/v3/anchoring/axes.json`
**Функции:** `build_axes_vectors`, `build_a_home`, `check_neutral`, `build_orthogonality_matrix`

**Описание:** существуют global semantic axis anchors и parameter home positions (`a_home`). Для каждого axis заданы target values 0.1/0.3/0.5/0.7/0.9. Каждая точка содержит четыре текста: EN/RU × description/imperative. Их embeddings усредняются. Направление оси:

```text
u_a = normalize(centroid_0.9 - centroid_0.1)
c_a = 0.5 * (centroid_0.9 + centroid_0.1)
a_home_a(p) = 0.5 + kappa_a * dot(E_parameter - c_a, u_a)
```

На runtime запрос не матчится к пяти anchor points напрямую. Используется direction vector `u_a`:

```text
axis_delta = kappa_a * dot(E_query - E_parameter, u_a)
signed_delta = polarity(axis, quantity_kind) * axis_delta
```

Сигнал применяется только при `abs(signed_delta) >= epsilon_axis=0.05`.

`neutral_check` прогоняет 188 запросов, ожидающих отсутствие движения, через каждую применимую axis/representative parameter pair. Нарушение фиксируется при `abs(kappa*raw_delta)>0.05`; при нарушении текущая kappa оси уменьшается вдвое, но не ниже 0.5. В Qwen build записано 455 нарушений.

`semantic_control_strength` — одна из 15 meta axes. Она помечена invalid, потому что cosine между centroid low=0.1 и high=0.9 оказался больше 0.80; build считает такие полюса недостаточно различимыми. Для неё strong calibration не получила samples (`n=0`, kappa=1). `use_meta_axis=false`, поэтому специальная модуляция global gamma этой осью отключена.

При build V3 `a_home` рассчитывается с persistent vectors composite index. На runtime `_param_eid` не читает `a_home` и не извлекает parameter vector из composite binary: он заново эмбеддит `semantic_keywords` выбранного параметра и кэширует их centroid внутри одного Python process. Поскольку bridge запускает новый process на каждый поиск, этот runtime cache не сохраняется между запросами. Флаг invalid записывается в diagnostics, но сам axis vector не удаляется из `anchors_build.json`.

## 4. Axes V3

### Список и покрытие

**Файлы:** `data/combinatorial-genesis/v3/anchoring/axes.json`, `polarity_matrix.json`, `data/combinatorial-genesis/v3/dataset.json`

**Описание:** 15 axes: `affective_arousal`, `affective_valence`, `energy_speed`, `energy_peak_intensity`, `timbre_brightness`, `timbre_roughness`, `rhythmic_density`, `chaos_amplitude`, `spatial_motion`, `spatial_depth`, `organic_mechanical`, `tonal_instability`, `semantic_control_strength`, `visual_metaphor_intensity`, `style_traditional_radical`.

Из 5597 Range axes имеют 2483. Это все покрытые Range из исходного V2-корпуса кроме шести. 3114 Range без axes относятся преимущественно к новой combinatorial части. Крупнейшие непокрытые category: `spectral_processing` 193, `spatial_perception` 189, `synthesis` 183, `dynamics` 165, `Nonlinear Systems` 159, `Spectral Processing` 159, `Spatial Perception` 157, `Vocal Morphology` 156, `Organic Textures` 153, `Acoustic Physics` 150, `Psychoacoustics` 145.

Параметр получает axis membership из поля `axes`, а направление влияния — из `polarity_matrix[axis][quantity_kind]` с optional `polarity_override`. Параметры без axes переходят к default, если до L2 не сработали numeric, lexical или description signals.

## 5. Выбор значения V3

### Порядок и формулы

**Файлы:** `python_engine/anchoring_v3/anchoring.py`
**Функции:** `anchor_query`, `l0_numeric`, `_detect_direction_per_kind`, `_detect_degree`, `_description_direction`, `_axis_delta`, `_range_apply`

**Порог/константы:** `gamma=1.5`, `epsilon_axis=0.05`; default lexical degree 0.30; axis kappa индивидуальна и калибруется в диапазоне 0.5..5.0.

**Псевдокод:**

```text
query_vector = embed(query) when axes enabled
directions = direction words grouped by quantity_kind
degree = degree words or 0.30
numeric_target = explicit technical name, otherwise one best attention match

for p in retrieved_top_k:
    before = dataset.default
    if Range/Select and explicit number or exact option applies:
        value = parsed/clamped/snapped value
    else if Toggle:
        value = on/off only when marker + parameter attention intersect
    else if neutral query:
        value = before
    else if nominal Select:
        value = alias/exact option or default
    else if ordinal Select without option_positions:
        value = default
    else if direction exists for p.quantity_kind and attention passes:
        signed = direction * degree
        value = apply(signed)
    else if description low/high clause overlaps query:
        signed = +/-0.35
        value = apply(signed)
    else if p.axes and abs(best polarity*axis_delta) >= 0.05:
        value = apply(best axis delta)
    else:
        value = default
```

Range formula:

```text
value = clamp(default + gamma * signed_delta * (max-min), min, max)
value = snap(value, step)
```

Это интерполяция по нормализованному signed delta, но не интерполяция между per-parameter value anchors: таких anchors нет.

## 6. Select / Toggle / Text / String / Array V3

### Поведение типов

**Файлы:** `python_engine/anchoring_v3/anchoring.py`, `src/components/rag-v3/ParameterControl.tsx`
**Функции:** `_select_nominal_apply`, `_select_ordinal_apply`, `_detect_toggle`, `anchor_query`

**Описание:**

- Select nominal: ищет substring в `option_aliases`, затем точное совпадение option; иначе default.
- Select ordinal: `option_positions` задаёт позиции 0..1. Новая позиция `clamp(base_position + gamma*signed_delta,0,1)`, выбирается ближайшая option.
- Toggle: on/off markers из `markers.json` применяются только при token intersection с параметром. Это обеспечило 10/10 в последнем Qwen-аудите.
- Text/String/Array: semantic generation отсутствует; значение остаётся dataset default.

**Числа:** Select 448; typed 226: 194 nominal, 32 ordinal; без typing 222. `option_aliases`: 194; `option_positions`: 32. Text 7, String 3, Array 1, Toggle 15.

## 7. Retrieval scope V3

### Текущее состояние

**Файлы:** `src/lib/rag-v3/search.ts`
**Описание:** поля `retrieval_scope` и разделения sound/structure/metadata/provenance/administrative нет. Доступны только source toggles: library, frozen, atoms, generated. Metadata/provenance не фильтруются по назначению и участвуют в общем lexical/vector retrieval.

**Числа:** точная метрика «noise for sound retrieval» не вычисляется и отдельной разметки нет. Фактически обнаружены как минимум именованные metadata/provenance/admin записи (`interoperable_asset_*`, `provenance_*`, `smart_contract_*`), но их полный count без scope-label отсутствует.

## 8. Метрики и отчёты V3

### Последние измерения

**Файлы:** `reports/RAG_V3_QWEN3_TRANSITION_AUDIT_2026-10-08.md`, `reports/RAG_V3_SEMANTIC_MATRIX_2026-10-08_BEFORE.md`, `reports/RAG_V3_EXPLICIT_VALUE_AUDIT_2026-10-08_POST_FIX.md`
**Модель:** `qwen3-embedding:4b`
**Размерность:** 2560

**Описание:** test scripts считают target retrieved/found, expected value/direction correctness, changed-vs-default и HTTP success. Default rate в explicit report выводится через количество unchanged Top-K. Anchors build считает invalid axes, neutral violations, home violations, correlated axes, determinism. Diversity и precision@k как формальные метрики не вычисляются.

**Числа:** semantic matrix: Range 5/10, Select 3/10, Toggle 10/10, Unit 13/13, Complex 8/10. Explicit: target 19/20, value correct 19/20, non-default 50/476 (10.5%). Neutral violations 455; home violations 0; correlated axis pairs 0; repeat cosine minimum 1.0.

## 9. Продвинутые подходы V3

- [ ] value anchors для Range — отсутствуют.
- [ ] value anchors для Select — отсутствуют; есть только scalar `option_positions`/aliases.
- [ ] multi-vector query — отсутствует; atom expansion объединяется в один текст и один финальный vector.
- [ ] relational / pairwise anchors — отсутствуют.
- [ ] configuration-level retrieval — отсутствует.
- [x] axis projection — `anchor_query`, `_axis_delta`; continuous Range и ordinal Select fallback.
- [ ] learned value head — отсутствует.
- [ ] optimal transport / Sinkhorn — отсутствует.
- [x] contrastive direction vectors — global axes используют `normalize(E_high-E_low)`; это axis-level, не per-parameter `more/less` vectors.
- [ ] глобальная синхронизация параметров в top-k — отсутствует; каждый value anchored независимо.
- [ ] retrieval_scope — отсутствует.
- [ ] политика Text/String/Array — генерации нет; deterministic default-only поведение.

# Часть II. V2

## 1. Архитектура V2

### Single query и retrieval

**Файлы:** `src/store/rag-v2-store.ts`, `src/app/api/rag-v2/propose-parameters/route.ts`, `src/lib/rag-v2/search.ts`, `src/lib/rag-v2/dataset.ts`, `python_engine/anchoring_v2/bridge.py`, `z-ai-glm-flowmusic-rag-ui-v2/anchoring/anchoring.py`
**Функции:** `proposeParameters`, `searchAndAnchor`, `loadRetrievalIndex`, `anchor_query`
**Модель:** persistent index/anchors — `bge-m3:latest`; runtime model setting сейчас `qwen3-embedding:4b`.
**Размерность:** persistent V2 vectors 1024; runtime Qwen query 2560.
**Формат хранения:** dataset/index/anchors JSON.
**Обновление:** retrieval index и anchors перестраиваются полностью отдельными UI jobs.

**Описание:** effective query строится так же через instruction context. V2 делает lexical prefilter `max(64,topK*2)`, затем cosine по JSON retrieval index и обрезает Top-K 1..50. Sorting сначала cosine, затем lexical. Минимального similarity threshold нет. Python anchoring использует L0 numeric, L1 lexical и L2 axes.

Текущая V2 не перевекторизована на Qwen. Общий Ollama client уже создаёт 2560D Qwen query, тогда как V2 index содержит 1024D BGE vectors. `cosineSimilarity` использует `min(a.length,b.length)`, поэтому mismatch не отклоняется, а сравнение производится по первым 1024 компонентам несовместимых пространств. Фактическая сохранённая V2-конфигурация — BGE/1024; текущий runtime query model — Qwen/2560.

V2 имеет Single и Transition A/B. Transition реализован UI-интерполяцией аналогично V3. V2 передаёт текущий control bank в `current_values` и затем `mergeActiveParameters` сохраняет существующие ручные значения; независимость последовательных Single query в V2 не реализована так, как в V3.

**Принципиальное отличие:** V2 работает только с фиксированными 2733 параметрами и одним JSON index. V3 объединяет library+frozen, использует binary composite index, runtime atom expansion, source toggles и независимые query states.

## 2. Данные V2

### Dataset и артефакты

**Файлы:** `z-ai-glm-flowmusic-rag-ui-v2/anchoring/unified_parameters_enriched.json`, `retrieval_index.json`, `anchors_build.json`, `axes.json`, `polarity_matrix.json`, `calibration/*.json`, `lexical/*.json`
**Модель:** `bge-m3:latest`
**Размерность:** 1024
**Формат хранения:** JSON, включая все embedding arrays.
**Обновление:** полная перезапись index и anchors.

**Описание:** dataset содержит 2733 параметра. Retrieval text: technical name, derived category/subcategory, domain, quantity_kind, semantic_keywords, lyria tags. Index содержит 2733 `{technical_name, embedding}`. Anchors содержат 15 axes и `a_home` для 2733 параметров.

**Числа:** Range 2489, Select 226, Toggle 7, Text 7, Array 1, String 3. quantity_kind/domain/semantic_keywords/tags заполнены у 2733. axes есть у 2545 записей; Range with axes 2483/2489. Select: 194 nominal + 32 ordinal; aliases 194; positions 32.

## 3. Anchors и axes V2

### Построение и применение

**Файлы:** `z-ai-glm-flowmusic-rag-ui-v2/anchoring/build_anchors.py`, `anchoring.py`, `axes.json`
**Функции:** `build_axes_vectors`, `build_param_embeddings`, `calibrate_kappa`, `check_neutral`, `build_a_home`, `_axis_delta`
**Модель:** `bge-m3:latest`
**Размерность:** 1024

**Описание:** те же 15 axes, пять levels и четыре paraphrases на level. В отличие от V3 build, V2 parameter embeddings строятся центроидами embeddings `semantic_keywords` прямо в build. Формулы direction, center, kappa, a_home и runtime axis delta совпадают по структуре с V3.

**Числа:** anchors `stub=false`; invalid axes 0; neutral violations 524; home violations 0; vibe groups 63; correlated pairs 0; determinism min cosine 1.0.

## 4. Выбор значения V2

### Сигналы, порядок и псевдокод

**Файлы:** `z-ai-glm-flowmusic-rag-ui-v2/anchoring/anchoring.py`
**Функции:** `anchor_query`, `l0_numeric`, `_detect_direction_per_kind`, `_axis_delta`, `_range_apply`

**Описание:** L0 explicit numeric/option → Toggle marker → neutral → nominal Select → ordinal/Range lexical direction → axis projection → default. V2 не содержит добавленный в V3 `_description_direction`, потому что V2 dataset не содержит descriptions.

**Псевдокод:**

```text
for p in retrieved_top_k:
    before = current_values[p] if present else default
    if explicit numeric/option: apply it
    elif Toggle marker and attention: set 0/1
    elif neutral: keep before
    elif nominal Select: alias/exact option or default
    elif lexical direction for quantity_kind: move from default/current if relative
    elif valid axis signal >= 0.05: move from default/current if relative
    else: keep before/default
```

Range formula, gamma=1.5, epsilon=0.05 и clamp/snap совпадают с V3. Отдельных value anchors нет. Актуальная measured default rate для production BGE/real anchors в repository report отсутствует.

## 5. Select / Toggle / Text / String / Array V2

### Поведение

**Файлы:** `z-ai-glm-flowmusic-rag-ui-v2/anchoring/anchoring.py`
**Описание:** nominal Select использует aliases/exact option; ordinal Select — option_positions и nearest position; Toggle — on/off markers плюс attention; Text/String/Array остаются current/default. Политики генерации текста/строк/массивов нет.

## 6. Метрики и отчёты V2

### Существующие отчёты

**Файлы:** `z-ai-glm-flowmusic-rag-ui-v2/anchoring/eval_report.json`, `eval/eval_set.json`, `calibration/neutral_set.json`, `calibration/strong_set.json`
**Описание:** `eval_report.json` является старым stub-mode отчётом (`axes_enabled=false`) и не описывает текущие real BGE anchors. Он содержит neutral false-movement rate, directional accuracy/delta range и holistic flag.

**Числа старого stub report:** neutral 0/1823 false movements; directional correct 6/312 = 1.92%; in-range 2/312; holistic не оценивался. Текущий real anchors build содержит build diagnostics, но отдельного свежего full V2 eval report нет.

## 7. Продвинутые подходы V2

- [ ] value anchors для Range.
- [ ] value anchors для Select.
- [ ] multi-vector query.
- [ ] relational / pairwise anchors.
- [ ] configuration-level retrieval.
- [x] axis projection.
- [ ] learned value head.
- [ ] optimal transport / Sinkhorn.
- [x] contrastive global axis direction vectors.
- [ ] глобальная синхронизация top-k.
- [ ] retrieval_scope.
- [ ] политика Text/String/Array; присутствует только default/current preservation.

# Часть III. Сравнение V2 и V3

| Аспект | V2 | V3 |
|---|---|---|
| Embedding-модель | Артефакты `bge-m3:latest`; runtime setting сейчас Qwen, что создаёт mismatch | `qwen3-embedding:4b` |
| Размерность | index/anchors 1024; runtime query 2560 при текущих settings | 2560 |
| Dataset | 2733 enriched parameters | 6071 unique: library 2823 + frozen 3255 |
| Composite index | Нет; один JSON index | Binary Float32 composite index + rows/manifest |
| Anchors | 15 global axes, a_home 2733 | 15 global axes, a_home 6071 |
| Axes | 2483/2489 Range | 2483/5597 Range |
| Value anchors | Нет | Нет |
| Select options | aliases 194, positions 32 | aliases 194, positions 32; 222 Select untyped |
| Neutral calibration | 188 queries; real BGE build 524 violations | 188 queries; Qwen build 455 violations |
| Retrieval scope | Нет | Нет; только source toggles |
| Выбор значения | Numeric → lexical → axis → current/default | Numeric → lexical → descriptions → axis → default |
| Text/String/Array | current/default | default |
| Independence запросов | Нет: current bank передаётся и merge сохраняет значения | Да: `current_values={}` для каждого A/B |
| Transition A/B | Два поиска + UI blend, но shared prior bank возможен | Два независимых поиска + UI blend |
| Основные отчёты | Старый stub `eval_report.json`; build diagnostics | Qwen semantic 83, explicit 20, anchors diagnostics |
| Известные ограничения | Qwen/BGE dimension-space mismatch; JSON vector files; stale eval | Неполное axes/kind/description coverage; untyped Select; no scope/value anchors |
