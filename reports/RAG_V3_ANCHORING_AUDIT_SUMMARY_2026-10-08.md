# Flowmusic Genesis V3 — итоговый аудит retrieval и anchoring

Дата: 2026-10-08 (Europe/Moscow)

## Методика

- Все запросы выполнялись строго последовательно через `/api/rag-v3/propose-parameters`.
- Использовались разные Top-K: 8, 12, 20, 30 и 50.
- Выполнено 83 baseline-проверки: минимум 10 для каждого `ui_element`, 13 канонических unit-классов и 10 комплексных запросов.
- После исправлений выполнено 83 повторных теста, затем отдельные повторные серии Select (10) и Unit (13).
- Перестроение CLAP или V3 индексов не выполнялось.

## Окружение

- Python 3.14.7, pip 26.2.1.
- `pip check`: конфликтов зависимостей нет.
- Импорты `torch`, `numpy`, `sklearn`, `requests`, `matplotlib`, `umap`, `transformers`, `librosa`, `soundfile`, `faster_whisper` успешны.
- Torch 2.14.1+cpu. V3 получает embeddings через Ollama, поэтому отсутствие CUDA у Python Torch не отключает BGE-M3.
- Активный V3 composite index: `bge-m3:latest`, 1024 dimensions, 6064 параметра.
- Активные V3 anchors: `bge-m3:latest`, `stub=false`.
- Latest dataset/index: `cg-v1-fb2507102e8f`, модель `bge-m3:latest`.

## Состояние данных

- UI-типы: Range 5589, Select 449, Toggle 15, Text 7, String 3, Array 1.
- Уникальных строк `unit`: 1459. Это не 1459 поддерживаемых физических единиц, а большое число неканонических доменных меток.
- Без `description_en`: 2763 параметра; без `description_ru`: 2763.
- Без `quantity_kind`: 3241.
- Range с axes: 2483 из 5589.
- Select с `option_positions`: 32 из 449; с `option_aliases`: 194 из 449.
- В anchors присутствует диагностический долг: `neutral_check.violations = 554`.

## Baseline до исправлений

| Группа | Корректно | Target retrieved |
|---|---:|---:|
| Range | 0/10 | 8/10 |
| Select | 0/10 | 0/10 |
| Toggle | 9/10 | 9/10 |
| Text | 5/10 | 5/10 |
| String | 4/10 | 4/10 |
| Array | 4/10 | 4/10 |
| Unit | 13/13 | 13/13 |
| Complex | 7/10 | — |

Примечание: baseline Range использовал корректные смысловые фразы, но часть автоматически собранных query содержала обе половины исходной low/high-фразы. В post-fix генератор очищен, поэтому абсолютное сравнение Range следует читать вместе с подробными строками отчётов.

## Доказанные причины

1. Runtime lexical prefilter не учитывал `name_ru`, descriptions, options и unit.
2. При нормализации Select терялись `option_positions` и `option_aliases`.
3. Anchoring не интерпретировал описанные в `description_en/ru` low/high-направления.
4. Число с unit назначалось сразу многим параметрам одинакового типа.
5. Natural form технического имени (`abstraction level`) не считалась явной привязкой.
6. `Text`, `String` и `Array` по текущей архитектуре не синтезируют новые значения: anchoring возвращает default. BGE-M3 используется только для retrieval.

## Внесённые исправления

- В lexical retrieval добавлены `name_ru`, `description_en`, `description_ru`, options, unit и естественная форма technical name.
- Возвращено использование Select metadata.
- Добавлено low/high-направление по двуязычным descriptions.
- Числовое значение с unit ограничено наиболее релевантным параметром вместо широкого broadcast.
- Natural technical name из двух и более слов распознаётся как точная цель.
- Exact option получает дополнительный вес при reranking.
- Runtime defaults активных модулей переведены на `bge-m3:latest`.

## Post-fix

| Группа | Корректно | Target retrieved | Вывод |
|---|---:|---:|---|
| Range | 8/10 | 8/10 | Все найденные targets получили правильное low/high-направление. |
| Select | 2/10 | 2/10 | Уникальные options работают; общие `1`, `triangle`, `down`, `32` без контекста неоднозначны. |
| Toggle | 9/10 | 9/10 | Работает стабильно. |
| Text | 3/10 | 3/10 | Найденные параметры корректно остаются unchanged; генерация текста не реализована. |
| String | 4/10 | 4/10 | То же ограничение. |
| Array | 6/10 | 6/10 | Единственный Array остаётся unchanged; retrieval зависит от формулировки. |
| Unit | 12/13 | 13/13 | После дополнительного исправления и retest: 13/13. |
| Complex | 7/10 | — | Три формулировки не дали ни одного изменения. |

## Модель и старые артефакты

В активном Flowmusic Genesis V3 не найдено использование `qllama/bge-m3:q8_0`. Старое имя остаётся только:

- в историческом документе `COMBINATORIAL_GENESIS_ENGINE.md`;
- в manifest-файлах старых версий datasets/indexes, которые не являются latest;
- в отдельном Strudel role-block manifest. Этот индекс не используется Flowmusic Genesis V3 и требует самостоятельной ревекторизации, если нужен режим Strudel.

Исторические manifests намеренно не переписаны: изменение строки model создало бы ложную запись о происхождении существующих векторов.

## Оставшиеся ограничения

1. Неоднозначная Select option без описания объекта управления не позволяет выбрать конкретный параметр. Рекомендуемый query: `use cardioid radiation pattern`, а не только `use cardioid mode`; для общих options обязательно добавлять семантический контекст.
2. Text/String/Array требуют отдельной политики значения или LLM-генерации. BGE embedding не может самостоятельно создать новый текст или массив.
3. 1459 unit-строк следует нормализовать до канонической taxonomy, сохранив исходный unit как display metadata.
4. Нужно отдельно устранить 554 neutral violations в anchors и повторить calibration suite.
5. 2763 параметра без descriptions и 3241 без quantity_kind не могут полноценно использовать description/direction anchoring.
