# Stage 6 — Managed Rebuild

Дата: 2026-10-08

## Реализация

В Flowmusic Genesis V3 добавлена панель управляемой перестройки со статусами и отдельными кнопками:

1. Qwen composite;
2. runtime atoms;
3. live axes / anchors;
4. Range value anchors;
5. Select options;
6. relation anchors;
7. CLAP audio index — отдельная секция и отдельный процесс.

Кнопка «Перестроить всё (кроме CLAP)» выполняет Qwen-этапы строго последовательно. Одновременно может работать только один rebuild job. Общая кнопка остановки завершает активный дочерний процесс.

Каждый статус показывает `built` / `not_built` / `stale`, дату, модель, размерность, число строк, новые и исключённые элементы, а также точную причину stale.

## Фактическая миграция на 0.6B

До управляемой перестройки:

- composite: `qwen3-embedding:0.6b`, 1024D;
- live anchors: `qwen3-embedding:0.6b`, 1024D;
- Range/Select/relations: `qwen3-embedding:4b`, 2560D — stale;
- CLAP: `laion/clap-htsat-fused`, 512D.

Через новые отдельные операции перестроены только stale-слои. Итог:

| Артефакт | Статус | Модель | Размерность | Count |
|---|---|---|---:|---:|
| Composite | built | qwen3-embedding:0.6b | 1024 | 6083 |
| Runtime atoms | built | qwen3-embedding:0.6b | 1024 | 1274 |
| Live axes / anchors | built | qwen3-embedding:0.6b | 1024 | 6083 source params |
| Range value anchors | built | qwen3-embedding:0.6b | 1024 | 5607 params / 28035 anchors |
| Select options | built | qwen3-embedding:0.6b | 1024 | 450 params / 1985 options |
| Relations | built | qwen3-embedding:0.6b | 1024 | 12 relations / 6083 source params |
| CLAP | built | laion/clap-htsat-fused | 512 | 6083 |

После сборки Qwen-модель принудительно выгружена; `ollama ps` пуст.

## Инкрементальность

- Composite переиспользует векторы по SHA-256 embedding-текста и модели.
- Runtime atoms теперь переиспользует неизменившиеся vectors; повторно эмбеддит только отсутствующие atom-тексты.
- Range и Select хранят SHA каждого anchor/option и переиспользуют совпавшие vectors.
- Relations имеют deterministic cache SHA по модели, текстам и memberships.
- CLAP переиспользует элементы по canonical content SHA.
- Registry SHA входит в manifests и stale-проверку.

Повторный Range rebuild:

- `cache_sha256` не изменился;
- `created_at` не изменился;
- embedding model не была загружена.

Повторный composite rebuild:

- `created: false`;
- CLAP index SHA до и после полностью совпал;
- CLAP rebuild не запускался;
- embedding model не была загружена.

## Проверки после миграции

- Explicit target/value: 20/20.
- Range semantic: 9/10.
- Select semantic: 9/10 в полном прогоне; единственный конфликт `1` против `1/4` исправлен и целевой повторный тест проходит, итог 10/10.
- Toggle: 10/10.
- Unit: 13/13.
- Complex: 10/10.
- Registry leak: 0 в десяти запросах Top-K 50.
- Selectivity сохраняется около 20–37.5% в зависимости от Top-K.

Text/String низкие показатели старой semantic matrix отражают действующую retrieval-only политику и отсутствие генерации новых текстовых значений; это не регресс managed rebuild.

## Критерии приёмки

- [x] Каждая кнопка работает автономно.
- [x] Status stale выявил старые модель и размерность.
- [x] Инкрементальный повтор проверен по SHA, времени и отсутствию загрузки модели.
- [x] CLAP — отдельная кнопка и отдельный артефакт.
- [x] Composite rebuild не меняет и не запускает CLAP.
- [x] Qwen-индексы согласованы на одной модели и размерности.
- [x] Semantic/explicit проверки выполнены без критического регресса.
- [x] Registry leak = 0.
- [x] Процесс можно остановить из UI.
