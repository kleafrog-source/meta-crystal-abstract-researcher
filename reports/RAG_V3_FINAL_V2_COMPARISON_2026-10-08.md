# Итог V3 после трёх этапов и сопоставление с V2

## Условия корректного сравнения

V3 измерен на едином пространстве `qwen3-embedding:4b`, 2560-D. V2 не перевекторизован: его persistent retrieval index и anchors созданы `qllama/bge-m3:q8_0` в 1024-D, тогда как текущий общий runtime query client настроен на Qwen 2560-D. Поэтому запуск V2 сейчас сравнивал бы первые 1024 координаты несовместимых пространств и не является валидным A/B. В таблице отсутствующие сопоставимые V2 метрики честно отмечены как `н/д`, а не заменены результатами mismatch-run.

## Сопоставимые факты

| Метрика / свойство | V2 | V3 после этапа 3 |
|---|---:|---:|
| Dataset | 2733 | 6071 |
| Persistent embedding model | `qllama/bge-m3:q8_0` | `qwen3-embedding:4b` |
| Размерность | 1024 | 2560 |
| Единое пространство query/index/anchors | нет после смены общей настройки | да |
| Range semantic matrix | н/д без перевекторизации V2 | **9/10** |
| Select semantic matrix | н/д без перевекторизации V2 | **10/10** |
| Toggle semantic matrix | н/д без перевекторизации V2 | **10/10** |
| Unit matrix | н/д без перевекторизации V2 | **13/13** |
| Complex matrix | н/д без перевекторизации V2 | **10/10** |
| Explicit target/value | н/д без перевекторизации V2 | **20/20 / 20/20** |
| Semantic default rate | свежего валидного отчёта нет | **13.7%** |
| Neutral violations | 524 в последнем real V2 anchors build | **127** |
| Determinism min repeat cosine | 1.0 | **1.0** |
| Query independence | stateful merge сохраняет control bank | `current_values={}`, независимые Single query |
| Value anchors | нет | 5 точек на каждый Range + Select options |
| Multi-vector query | нет | да, до 8 концептов |
| Relation anchors | нет | 12 |
| Retrieval scope | нет | sound/structure по умолчанию, остальные opt-in |
| Text/String/Array | default | retrieval-only, иначе `not_generated` + default |

## Динамика V3 по этапам

| Метрика | Baseline | Этап 1 | Этап 2 | Этап 3 |
|---|---:|---:|---:|---:|
| Range | 5/10 | 5/10 | 9/10 | **9/10** |
| Select | 3/10 | 3/10 | 10/10 | **10/10** |
| Toggle | 10/10 | 10/10 | 10/10 | **10/10** |
| Unit | 13/13 | 13/13 | 13/13 | **13/13** |
| Complex | 8/10 | 8/10 | 10/10 | **10/10** |
| explicit target/value | 19/20 / 19/20 | 19/20 / 19/20 | 19/20 / 19/20 | **20/20 / 20/20** |
| semantic default rate | около 90% | <80% target | 11.2% | **13.7%** |
| neutral violations | 455 | 127 | 127 | **127** |
| determinism | 1.0 | 1.0 | 1.0 | **1.0** |
| mean semantic search | baseline | 2.9 с | 3.739 с | **3.265 с** |

## Итог критериев STAGED_TASK

- [x] persistent composite vectors и `a_home` используются runtime без parameter re-embedding
- [x] retrieval scope заполнен и применяется до cosine ranking
- [x] Range value anchors и Select option embeddings работают
- [x] L0 numeric сохраняет приоритет
- [x] multi-vector query работает без LLM
- [x] построены 12 relation anchors и применяется adaptive relation bias
- [x] согласование Top-K обеспечивает concept/relation coverage; Sinkhorn остаётся доступным и выключенным
- [x] Text/String/Array имеют детерминированную retrieval-only политику
- [x] Range ≥ 8/10, Select ≥ 7/10, Complex ≥ 9/10
- [x] default rate < 20%
- [x] neutral violations < 150 и не выросли
- [x] determinism сохранён
- [x] independence Single query сохранена

Файлы исходных измерений: `reports/RAG_V3_STAGE_1_2026-10-08.md`, `reports/RAG_V3_STAGE_2_2026-10-08.md`, `reports/RAG_V3_STAGE_3_2026-10-08.md`, semantic/explicit audit reports соответствующих этапов. Фактическое описание V2 и причина несовместимости зафиксированы в `ARCHITECTURE_V2_V3_CURRENT_STATE.md`.
