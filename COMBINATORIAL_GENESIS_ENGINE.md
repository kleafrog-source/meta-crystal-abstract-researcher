# COMBINATORIAL GENESIS ENGINE — скорректированный план

Статус: **автономный Dataset Lab, runtime и controlled library publish выполнены, 2026-09-23**.

## 1. Цель и два разных процесса

Новый раздел `Combinatorial Genesis` расширяет пространство параметров двумя связанными, но разными процессами:

1. **Dataset Lab (офлайн):** сбор ответов Flowmusic с нескольких аккаунтов на один канонический запрос, сохранение происхождения каждого ответа, проверка схемы, дедупликация, сравнение и обогащение.
2. **⊗-Mode (runtime):** после обычного поиска Flowmusic Genesis V2 взять выбранные до 50 параметров, атомизировать их имена, построить новые структурные комбинации и пропустить их через фильтры связности, новизны и корректности единиц.

Главный инвариант: **рабочий Flowmusic Genesis V2 не изменяется и не читает экспериментальные данные автоматически**.

## 2. Как фактически работает Flowmusic Genesis V2

1. Источник: `z-ai-glm-flowmusic-rag-ui-v2/anchoring/unified_parameters_enriched.json` — 2733 параметра.
2. Для всех 2733 параметров построен `retrieval_index.json` моделью `qllama/bge-m3:q8_0`.
3. Next.js сначала делает лексическое сужение кандидатов.
4. bge-m3 строит embedding запроса, затем кандидаты ранжируются по cosine similarity.
5. До 50 параметров передаются в Python bridge.
6. Python anchoring назначает значения через numeric / lexical / axis / default / neutral правила.
7. UI отображает Anchored Control Bank и строит macro `technical_name: value`.

На новом ПК проверены Node.js `v24.21.0`, Python `3.14.7`, Ollama, модель `qllama/bge-m3:q8_0`, dataset/index `2733/2733` и активные anchors.

## 3. Ошибки и риски исходного плана Qwen

### Неверный основной стек

Qwen предложил PostgreSQL + FastAPI. Текущий API работает на Next.js, данные V2 находятся в JSON-артефактах, anchoring выполняется Python-sidecar, Prisma использует SQLite. Отдельный FastAPI/PostgreSQL-контур сейчас создал бы вторую несовместимую систему.

Решение: первый релиз — существующий Next.js-контур и отдельное файловое хранилище. Возможная миграция БД — только после стабилизации схемы.

### Комбинаторный взрыв

Полный перебор всех сочетаний 3–5 слов неприемлем: даже сотни токенов дают миллиарды вариантов.

Решение: роли токенов, ограниченные шаблоны, candidate budget, детерминированный seed и происхождение минимум из двух параметров.

### bge-m3 не является генератором или физическим validator

bge-m3 ранжирует семантическую близость. Она не создаёт текст и не доказывает корректность единиц, диапазона или downstream-поведения.

Решение: отдельно существуют generator, embedding ranker и technical validator.

### Пороги 0.70 / 0.85 не обоснованы

Cosine score зависит от модели, embedding-текста и распределения датасета. Пороги можно закрепить только после calibration set и анализа квантилей. До этого score — диагностическая величина.

### Значение нельзя назначать только по суффиксу

`_hz` задаёт размерность, но не безопасный диапазон. Золотое сечение само по себе ничего не валидирует.

Решение: unit/range/value наследуются или интерполируются только от совместимых родителей одной `quantity_kind`. Неоднозначные кандидаты остаются без значения до review.

### META-Ω JSON нельзя менять первым шагом

Новый root-блок может сломать существующие парсеры. До contract-тестов genesis metadata хранится отдельно; интеграция будет последней и только backwards-compatible.

## 4. Граница изоляции

Экспериментальный контур не должен:

- менять `unified_parameters_enriched.json` и `retrieval_index.json`;
- записывать кандидаты в Prisma `Parameter`;
- менять Python anchoring V2;
- автоматически добавлять controls в Anchored Control Bank;
- считать высокий bge score доказательством принятия.

Однократный снимок 2733 параметров хранится в `data/combinatorial-genesis/reference/base_parameters.json`.
Runtime использует его автономную рабочую копию `library/parameters.json`; после bootstrap файлы V2 не читаются.

## 5. Канонический запрос для пилотного сбора Flowmusic

Полный initial prompt, continuation prompt и правила запуска находятся в `FLOWMUSIC_COLLECTION_PROMPT_V1.md`.

Рекомендуемый пилот:

- 5 независимых аккаунтов/сессий;
- 5 одинаково пронумерованных batches на аккаунт;
- 10 параметров в каждом JSON-ответе;
- до 250 сырых предложений.

Десять элементов на ответ выбраны намеренно: прежний процесс показал, что небольшие пакеты лучше удерживают качество и валидность схемы, чем один ответ из 50 больших объектов.

Файл из 2733 параметров в Flowmusic не передаётся. Совпадения с ним и совпадения между независимыми аккаунтами разрешены: на этапе merge они становятся frequency/provenance evidence, после чего exact и semantic dedup формируют canonical records.

Для лексического корпуса Flowmusic возвращает `technical_name`, краткое русское имя и двуязычные описания. Runtime-комбинаторика остаётся отдельным процессом и использует только алгоритм + bge-m3, без Flowmusic/LLM.

После пилота измеряются parse success rate, exact и semantic duplicates, ошибки диапазонов/units, доля новых областей и межаккаунтное согласие. Только после этой оценки protocol фиксируется как V1 или исправляется до V2.

## 6. Provenance для Dataset Lab

В системе нет пользовательских аккаунтов и квот. `source_label` — только происхождение импортированного ответа.

```json
{
  "batch_id": "uuid",
  "collection_protocol": "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1",
  "canonical_prompt_sha256": "...",
  "source_label": "flowmusic-account-A",
  "session_url": "https://www.flowmusic.app/session/...",
  "collected_at": "ISO-8601",
  "raw_response_sha256": "...",
  "parse_status": "valid | valid_with_warnings | rejected",
  "parameters": [],
  "warnings": []
}
```

Правила: raw хранится неизменным; normalized — отдельно; повторный импорт идемпотентен по SHA-256; provenance не удаляется при dedup; canonical winner ссылается на все batches; frozen dataset versions immutable.

## 7. Runtime pipeline ⊗-Mode

```text
macro (до 50 параметров)
  -> TokenDecomposer
  -> bounded structural generator
  -> exact-name stop-list (2733 + accepted experimental)
  -> bge-m3 query affinity + nearest neighbors
  -> unit / quantity-kind / range validator
  -> human review: accept | reject | mutate
  -> experimental dataset version
  -> controlled publish в автономную library
```

### TokenDecomposer

- нормализует snake_case/camelCase;
- сохраняет frequency, role и source parameters;
- различает descriptor, concept/process, measurable property и unit;
- не теряет provenance.

### CombinatorialGenerator

- только 3–5-токенные шаблоны;
- финальный смысловой токен — measurable property;
- минимум два source parameters;
- запрет exact duplicate;
- ограниченный budget;
- одинаковые input + seed дают одинаковый результат.

### BGE validation

Сохраняются similarity к query, ближайшие существующие/experimental соседи, calibrated percentile, модель/версия индекса и реальный embedding text. Novelty — отчёт, а не автоматическое доказательство качества.

### Technical validation

Проверяются совместимость property/unit/quantity kind, min/default/max/step, повторы токенов, aliases и объяснимое downstream-влияние.

## 8. Изолированное хранение

```text
data/combinatorial-genesis/
  flowmusic-inbox/
  flowmusic-output/
  reference/
  library/
  drafts/
  exports/
  datasets/
  reviews/
  indexes/
```

Prisma/PostgreSQL-миграция откладывается до появления проверенной схемы и реальных объёмов.

## 9. API по текущему стеку

- `POST /api/combinatorial-genesis/collections/inspect` — parse/validation без записи;
- `POST /api/combinatorial-genesis/pipeline` — полный inbox-to-runtime pipeline;
- `GET /api/combinatorial-genesis/prompt` — актуальный collection prompt для UI;
- `GET /api/combinatorial-genesis/collections/stats` — статистика;
- `POST /api/combinatorial-genesis/preview` — атомизация и кандидаты без записи;
- `POST /api/combinatorial-genesis/validate` — bge + technical validation;
- `POST /api/combinatorial-genesis/review` — accept/reject/mutate;
- `POST /api/combinatorial-genesis/datasets/freeze` — immutable version;
- `POST /api/combinatorial-genesis/publish` — dry-run или backup + идемпотентный merge в CG library.

## 10. Этапы и статус

### Phase 0 — аудит и изоляция: выполнено

- восстановлен pipeline V2;
- проверены 2733 dataset/index items, anchors и Ollama;
- добавлен `/combinatorial-genesis`;
- новый preview не пишет данные и не меняет V2.

### Phase 1A — structural preview: первый рабочий срез выполнен

- `TokenDecomposer`;
- bounded deterministic `CombinatorialGenerator`;
- exact-name stop-list из 2733 параметров;
- parent provenance;
- read-only preview API/UI;
- bge/value/publish намеренно отключены.

Критерий: одинаковые input + seed дают одинаковый набор; существующие имена исключены; каждый кандидат имеет минимум двух родителей.

### Phase 1B — Dataset Lab: выполнен первый полный корпус

- Prompt v1 скорректирован под лексический корпус без передачи dataset в Flowmusic;
- read-only inspector реализован;
- folder collector реализован с сохранением raw batches, occurrences и provenance;
- собрано 288 batches / 2880 raw occurrences из шести файлов;
- 247 batches валидны, 41 batch и 410 occurrences сохранены в quarantine;
- exact-name canonical: 2289 имён из 2470 принятых occurrences;
- quality-gate оставил 2256 параметров, исключив 33 явных артефакта повторяющихся token sequences;
- построен атомарный корпус: 941 английский атом с frequency и source provenance;
- prompt protocol зафиксирован как `FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1`.

### Phase 2 — локальный bge gate: первый проход выполнен

- отдельный cache содержит 2256 реальных embeddings `qllama/bge-m3:q8_0`, 1024 dimensions;
- сформировано 24887 ближайших пар с exact cosine, token Jaccard и unit evidence;
- результаты отсортированы для ручного review, auto-merge отключён;
- квантили nearest-neighbor score сохранены как диагностика, а не как автоматические пороги;
- следующий шаг: небольшой calibration/review set и решения `same | related | distinct` для верхних пар.

### Phase 3 — review и versions

- `SEMANTIC_AUTO_TRIAGE_V1` автоматически классифицирует все пары как `same | related | distinct`;
- `same` требует совпадения нормализованной token-структуры, совместимых UI/unit/options и score не ниже empirical p90;
- первый проход: 65 `same`, 80 `related`, 24742 `distinct`; построено 63 semantic groups;
- отдельный semantic draft содержит 2191 запись вместо 2256 quality-gated записей;
- ручной review остаётся только необязательным override и пишется в `semantic_decisions.json`;
- canonical records и V2 автоматически не меняются;
- создана immutable experimental-версия `cg-v1-e6e3b731d117`: 2191 parameters, 941 atoms, 63 groups;
- version ID зависит от содержания и policy, но не от timestamps/локального endpoint; повторный freeze идемпотентен;
- далее: export/diff и подключение frozen dataset к runtime-генератору.

### Phase 4 — value/range inference

Первый рабочий проход выполнен:

- terminal property сохраняет собственный provenance donors;
- donors группируются по совместимым UI/unit/options и bge-взвешиваются относительно полного candidate name;
- Range агрегирует median min/max/step/default только минимум из двух совместимых donors;
- каждый результат содержит quantity kind, confidence и explanation;
- неоднозначные варианты остаются `needs_review` и не входят в publishable subset;
- тестовый запрос автоматически разрешил 7 из 12 финальных кандидатов без снижения safety-порога.

### Runtime frozen-dataset integration — выполнен первый bge-проход

- построен отдельный atom index `941 × 1024` для `cg-v1-e6e3b731d117`;
- query/macro ранжирует frozen atoms через `qllama/bge-m3:q8_0`;
- connector/unit atoms не участвуют в структурной генерации, но сохраняются в frozen corpus;
- генератор использует гибрид current-macro + frozen-atom pool;
- применяется exact stop-list из автономной library и frozen semantic draft;
- готовые candidate names повторно ранжируются bge относительно query;
- одинаковые macro/query/seed дают одинаковый результат, у каждого кандидата минимум два parent sources;
- values/ranges подключены через консервативный donor inference.

### Phase 5 — controlled integration

- content-addressed package `cg-draft-97eff16e9af0` сохраняет candidates и полный provenance;
- package validation повторно проверяет schema и exact stop-list;
- автономный снимок V2 проверен по SHA-256 и содержит 2733 параметра;
- dry-run содержал 7 auto-resolved parameters, collisions `0`, schema errors `0`;
- пакет опубликован в CG library: `2733 -> 2740`, перед записью создан backup;
- повторная публикация того же package ID ничего не добавляет;
- preview, package validation и publish больше не импортируют V2 runtime-модули;
- writes to V2 = false, контрольная сумма V2 после полного теста не изменилась.

### Phase 5B — inbox automation и UI

- одна кнопка запускает collector → quality/semantic → freeze → runtime index;
- invalid batches не блокируют валидный корпус и остаются в quarantine;
- повторный запуск текущих 6 файлов переиспользует `cg-v1-e6e3b731d117` и индекс;
- статистика автоматически обновляется после обработки;
- collection prompt открывается непосредственно в модальном окне UI.

### Phase 6 — optional META-Ω extension

Отдельная schema version, optional `combinatorial_genesis_insights`, contract tests старых parsers, обязательные поля не меняются.

### Phase 7A — Flowmusic Genesis V3: unified search

- добавлен отдельный `/rag-parameters-v3` и пункт `Flowmusic Genesis V3`; V2 UI/store/API не изменены;
- searchable union содержит 5043 уникальных параметра: autonomous library 2740 + frozen corpus 2305 с exact-name dedup;
- Combinatorial Atoms (текущая версия: 1112) bge-ранжируются и расширяют effective query, но не выдаются как controls без диапазонов;
- источники `Library`, `Flowmusic corpus`, `Atoms`, `Published combinations` включаются независимо;
- Top-K задаётся числом 1–200 и применяется только после Save; проверены Top-K 12 и 84;
- сохранены отдельные V3 state, single query, transition mode, instruction settings, Anchored control bank и Clean Macro Output;
- runtime semantic rerank читает собственный content-addressed composite index V3 и не обращается к retrieval index V2;
- numeric, lexical и axis values рассчитываются отдельным V3 anchoring bridge.

### Phase 7B — persistent composite index и автономные live anchors

- union 5043 параметров сохранён в `data/combinatorial-genesis/v3/dataset.json`;
- persistent index содержит 5043 × 1024 float32, manifest с hash и происхождением каждого вектора;
- повторная сборка с неизменными входами переиспользует content hash из manifest;
- пятый шаг общего inbox pipeline автоматически обновляет composite index после freeze/atom index;
- axes, polarity, lexical rules, calibration sets и `anchors_build.json` находятся в автономном каталоге V3;
- сборка live anchors использует persistent parameter vectors вместо повторного эмбеддинга 5043 наборов keywords;
- обе сборки запускаются кнопками в UI, имеют общее между API-маршрутами состояние, progress/log и exit code;
- проверочный запрос по всем источникам вернул Top-K 12 с numeric, lexical и default values через V3 bridge;
- диагностический долг: neutral-set фиксирует 563 превышения строгого порога 0.05 (V2 baseline: 520); anchors рабочие, но калибровку следует улучшить отдельным этапом.

### До финального V3

1. Добавить runtime-генерацию новых atom combinations прямо из результатов поиска, value inference и review до control bank.
2. Сделать редактор `needs_review`, accept/reject/mutate и публикацию одобренных комбинаций в autonomous library.
3. Добавить provenance/source badges в control bank и export session manifest.
4. Улучшить neutral calibration расширенного корпуса и добавить regression/e2e проверки single/transition/instructions.

## 11. Состояние репозитория после копирования

- `.git` восстановлен; ветка `main` совпадает с `origin/main`, обычные status/diff/log работают.
- повреждён только внутренний ref `refs/codex/turn-diffs/...` с нулевым SHA; на `main` и обычный diff он не влияет.
- Полный `tsc --noEmit` захватывает вложенные demo-проекты и показывает много существовавших ранее alias/type ошибок. Локальные проверки нового контура проходят.
- Production script использует `bun`, но Bun на новом ПК не установлен. Dev через npm работает.

До controlled publish рекомендуется восстановить Git-репозиторий или создать локальный baseline commit.

## 12. Текущее ограничение UI

Страница `Combinatorial Genesis` пока принимает macro вручную. Автоматическая передача текущих 50 controls из V2 будет добавлена отдельным контрактом после Dataset Lab, чтобы преждевременно не связывать состояния двух режимов.
