# Stage 4 test report

Дата: 2026-10-08T13:13:42+03:00

Все запросы выполнены строго последовательно; каждый HTTP-вызов запускает новый Python bridge process.

## Метрики

| Метрика | Значение | Target | Pass |
|---|---:|---:|:---:|
| `selectivity` | 30.0% | 20–40% | ✅ |
| `direction_agreement` | 100.0% | >80% | ✅ |
| `negative_precision` | 100.0% | >90% | ✅ |
| `isolation_determinism` | 100.0% | =100% | ✅ |
| `threshold_respect` | 100.0% | >95% | ✅ |
| `neutral_violations` | 0.0% | <5% | ✅ |
| `coherence_score` | 100.0% | >70% | ✅ |
| `restart_determinism` | 100.0% | =100% | ✅ |

## Select coverage

- nominal: **10/10**
- ordinal: **10/10**
- untyped: **10/10**

Среднее время запроса: **3.150 с**

## Результаты по категориям

- A: **5/5**
- B: **5/5**
- C: **5/5**
- D: **5/5**
- E: **5/5**
- F: **1/1**
- G: **5/5**
- I: **30/30**
- J: **10/10**

## Логи

Anchor diagnostics: `reports/stage4_anchor_logs/*.json`.
