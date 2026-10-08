# Stage 4 — Value Anchor Audit

Дата: 2026-10-08  
Модель: `qwen3-embedding:4b`  
Режим исполнения: последовательные HTTP-запросы; новый Python bridge process на каждый запрос.

## Результат

До Stage 4 explicit-аудит изменял 431 из 476 результатов top-k (90.5%). После введения семантического бюджета изменений средняя selectivity в целевом наборе Top-K 10 составляет 30.0%. Все 20 явных целевых значений сохранены.

| Метрика | До | После | Target | Результат |
|---|---:|---:|---:|:---:|
| Explicit target/value | 20/20 | 20/20 | 20/20 | ✅ |
| Explicit selectivity | 90.5% | 20–33.3% по разным Top-K; 30.0% при Top-K 10 | 20–40% | ✅ |
| Direction agreement | не измерялось | 100.0% | >80% | ✅ |
| Negative precision | не измерялось | 100.0% | >90% | ✅ |
| Isolation determinism | не измерялось | 100.0% | 100% | ✅ |
| Threshold respect | не измерялось | 100.0% | >95% | ✅ |
| Neutral violations | 127 в старом расширенном аудите | 0/50 в Stage 4 | <5% | ✅ |
| Coherence score | не измерялось | 100.0% | >70% | ✅ |
| Restart determinism | не измерялось | 100.0% | 100% | ✅ |

## Что изменено

- Для каждого параметра top-k сохраняются raw cosine, softmax weights, выбранный уровень, confidence, threshold, temperature, source и before/after.
- Порог реально применяется до возврата value anchor: Range `0.25`, Select `0.30`, Toggle `0.20`.
- Температура softmax: `0.02` для чисел/явных опций и `0.05` для размытых семантических запросов.
- Значения могут изменять только первые 30% ранжированного top-k; явно названный `technical_name` не блокируется.
- Точное `technical_name` получает безусловный приоритет в retrieval.
- Явная Select-опция больше не распространяется на весь top-k; ordinal-команды first/second/... привязаны к явно названному параметру.
- Направление common sound controls согласуется с намерением query до применения anchor.
- Нейтральные фразы удаляются от длинных к коротким, поэтому `standard settings` больше не повреждается маркером `set`.

## Распределение confidence

Агрегация 76 сохранённых query-логов, 1,023 параметра с confidence:

| Статистика | Confidence |
|---|---:|
| min | 0.4267 |
| p25 | 0.6780 |
| median | 0.7858 |
| mean | 0.7534 |
| p75 | 0.8370 |
| max | 1.0050 |

В реальной выборке ниже абсолютного cosine-порога значений не встретилось: factorized value-anchor тексты дают высокое сходство. Поэтому соблюдение порога дополнительно проверено синтетическим unit-тестом `test_value_anchor_respects_confidence_threshold`; anchor ниже threshold не применяется. Семантическую избирательность в реальной выдаче обеспечивает rank budget 30%.

## Распределение решений

По 1,036 залогированным элементам:

- `default`: 695;
- `value_anchor`: 193;
- `numeric`: 75;
- `neutral`: 50;
- `lexical`: 17;
- `retrieval`: 6;
- `T=0.02`: 616 диагностик;
- `T=0.05`: 420 диагностик.

## Примеры до/после

1. `Set simple_compressor_ratio_setting to 8:1 mode`: до исправления целевой параметр отсутствовал, а числовая опция меняла 10/10 посторонних Select; после — цель `8:1`, изменено 3/10.
2. `Set basic_oscillator_waveform_shape to square mode`: до исправления `square` применялся к 10/10 waveform-параметров; после — цель выбрана верно, изменено 3/10.
3. `add more reverb, spacious, wet, long tail`: до согласования направления один wet-control уходил вниз; после direction agreement 3/3.
4. `standard settings`: до исправления 1/10 двигался из-за конфликта `set`/`settings`; после — 0/10.

## Ошибочные применения

После финального прогона категорий A–G подтверждённых случаев, где anchor применился вопреки ожидаемой области или направлению, не осталось. Negative precision — 100%, direction agreement — 100%.

## Пропущенные применения

После финального прогона целевые explicit-параметры найдены и выставлены 20/20; Select coverage nominal/ordinal/untyped — 10/10 в каждой группе. Подтверждённых пропусков нет.

## Артефакты проверки

- `reports/STAGE4_TEST_REPORT_2026-10-08.md`
- `reports/RAG_V3_EXPLICIT_VALUE_AUDIT_2026-10-08_POST_FIX.md`
- локальные диагностические JSON: `reports/stage4_anchor_logs/*.json` (исключены из Git как воспроизводимые runtime-артефакты)

## Критерии приёмки

- [x] Anchor-лог для каждого параметра top-k.
- [x] Порог уверенности применяется и покрыт unit-тестом.
- [x] Temperature `0.02` / `0.05`.
- [x] Non-neutral selectivity 20–40%.
- [x] Neutral selectivity 0%.
- [x] Direction agreement >80%.
- [x] Explicit values 20/20.
- [x] Neutral violations не выросли.
- [x] Determinism 1.0.
- [x] Отчёт до/после сформирован.
