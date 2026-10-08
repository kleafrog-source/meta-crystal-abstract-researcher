# Flowmusic Genesis V3 — Qwen3 transition audit

Дата: 2026-10-08

## Активные артефакты

- Dataset: `cg-v1-306d35099d5a`
- Composite index: `qwen3-embedding:4b`, 2560 dimensions, 6071 parameters
- Live anchors: `qwen3-embedding:4b`, 2560 dimensions, `stub=false`
- Построение axes не пропущено: оно входит в `Build V3 live anchors`.
- Anchors diagnostics: `semantic_control_strength` invalid; 455 neutral calibration violations.

## Результаты пользовательских прогонов

### Semantic matrix — 83 последовательных запроса

| Группа | корректно | target retrieved |
|---|---:|---:|
| Range | 5/10 | 5/10 |
| Select | 3/10 | 4/10 |
| Toggle | 10/10 | 10/10 |
| Text | 1/10 | 1/10 |
| String | 1/10 | 1/10 |
| Array | 2/10 | 2/10 |
| Unit | 13/13 | 13/13 |
| Complex | 8/10 | n/a |

### Explicit values — 20 последовательных запросов

- HTTP: 20/20
- Target retrieved: 19/20
- Explicit value correct: 19/20
- Non-default values across the complete returned Top-K: 50/476 (10.5%)

Последняя величина не означает 89.5% ошибок. В явном запросе ожидается изменение названного параметра; остальные параметры Top-K не получают собственного числового указания и закономерно остаются в default.

## Сравнение с последним BGE-M3 аудитом

| Группа | BGE-M3 | Qwen3 |
|---|---:|---:|
| Range | 8/10 | 5/10 |
| Select | 2/10 | 3/10 |
| Toggle | 9/10 | 10/10 |
| Unit | 13/13 | 13/13 |
| Complex | 7/10 | 8/10 |
| Explicit values | 20/20 | 19/20 |

Эти маленькие наборы показывают смешанный результат, а не безусловное превосходство одной модели. Qwen3 лучше прошла Toggle/Select/Complex, но хуже нашла целевые Range и один explicit target.

## Почему значения удерживаются около default

Embedding-модель не генерирует значение ручки. Она выполняет две операции: выбирает похожие параметры и проецирует текст запроса на заранее построенные семантические оси. Затем deterministic anchoring выбирает значение по приоритету:

1. Явное число или явная Select-опция.
2. Лексические направления и сила выражения.
3. Направление из `description_en` / `description_ru`.
4. Проекция запроса на live axes с polarity.
5. Default, если надёжного сигнала нет.

Default — преднамеренный безопасный fallback. Главная проблема сейчас не порог по умолчанию, а недостаток данных, связывающих смысл запроса с направлением конкретной ручки.

## Покрытие V3 dataset

- Всего: 6071
- Range: 5597; с axes: 2483; с quantity_kind: 2579
- Полные `name_ru` + descriptions: 3308
- Frozen-записи без domain/quantity_kind: 3248
- Select: 448; с option_positions: 32; с option_aliases: 194
- Уникальных строк unit: 1459 — слишком фрагментированный словарь единиц

## Архитектурная ошибка независимости запросов

UI передавал значения текущего control bank как `current_values` в следующий запрос. При отсутствии нового сигнала anchoring сохранял предыдущее значение. Это создавало скрытую зависимость между независимыми Single query.

Исправлено: каждый Single query и обе стороны Transition теперь вычисляются от dataset defaults с пустым `current_values`. Ручное редактирование текущего результата не влияет на следующий поиск.

## Поля, которые уводят retrieval от звуковой цели

Параметры вроде `interoperable_asset_licensing_smart_contract_address`, `interoperable_asset_ownership_proof_hash`, provenance hash/path и smart-contract gas limit технически валидны, но не описывают звук. Text/String/Array metadata также не имеют осмысленного автоматического числового anchoring. Их следует не удалять из базы, а исключить по умолчанию из sound-synthesis retrieval отдельным признаком `retrieval_scope`.

## Рекомендуемый следующий этап

Не заставлять Qwen напрямую «придумывать число». Для каждого Range/ordinal Select построить value anchors: текстовые точки для min/low/default/high/max или для каждой Select-опции. На запросе сравнивать embedding запроса с этими точками и интерполировать значение. Это сохраняет работу без LLM, независимость запросов и делает выбор значения объяснимым.

Перед этим требуется обогащение 3248 frozen-записей: descriptions, quantity_kind, axes/polarity и Select option semantics. Также следует нормализовать 1459 unit-строк и добавить sound-retrieval scope.
