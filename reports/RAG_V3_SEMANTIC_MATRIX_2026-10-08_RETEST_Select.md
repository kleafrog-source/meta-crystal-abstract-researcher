# RAG V3 semantic matrix — RETEST

Дата: 2026-10-08T02:14:00+03:00

Все API-запросы выполнены строго последовательно.

## Dataset

- Всего: 6064
- UI: {'Range': 5589, 'Select': 449, 'Toggle': 15, 'Text': 7, 'Array': 1, 'String': 3}
- Уникальных unit: 1459

## Сводка

| Группа | корректно | target retrieved |
|---|---:|---:|
| Range | 0/0 | 0/0 |
| Select | 2/10 | 2/10 |
| Toggle | 0/0 | 0/0 |
| Text | 0/0 | 0/0 |
| String | 0/0 | 0/0 |
| Array | 0/0 | 0/0 |
| Unit | 0/0 | 0/0 |
| Complex | 0/0 | 0/0 |

## Тесты

### 1. Select · Top-K 8

- Query: `Use 1 mode for this sound`
- Target: `a5_adapt_density_smoothing_filter_order`
- Expected: `1`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 1/8

### 2. Select · Top-K 12

- Query: `Use cardioid mode for this sound`
- Target: `acoustic_radiation_pattern_directivity`
- Expected: `cardioid`
- Retrieved: **да**
- Value/default: `cardioid` / `omnidirectional`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 2/12

### 3. Select · Top-K 20

- Query: `Use triangle mode for this sound`
- Target: `adaptive_eq_automation_shape`
- Expected: `triangle`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 4/20

### 4. Select · Top-K 30

- Query: `Use aggressive mode for this sound`
- Target: `adaptive_eq_learning_bias_curve`
- Expected: `aggressive`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 5/30

### 5. Select · Top-K 50

- Query: `Use down mode for this sound`
- Target: `arpeggiator_pattern_mode`
- Expected: `down`
- Retrieved: **да**
- Value/default: `down` / `up`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 7/50

### 6. Select · Top-K 8

- Query: `Use 1/4 mode for this sound`
- Target: `arpeggiator_rate_division`
- Expected: `1/4`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 1/8

### 7. Select · Top-K 12

- Query: `Use exponential mode for this sound`
- Target: `articulation_velocity_to_parameter_bias`
- Expected: `exponential`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 0/12

### 8. Select · Top-K 20

- Query: `Use Left Only mode for this sound`
- Target: `asymmetric_delay_feedback_phase_inversion_toggle`
- Expected: `Left Only`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 3/20

### 9. Select · Top-K 30

- Query: `Use rossler mode for this sound`
- Target: `attractor_type_selection`
- Expected: `rossler`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 3/30

### 10. Select · Top-K 50

- Query: `Use 32 mode for this sound`
- Target: `audio_buffer_size_samples`
- Expected: `32`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 8/50
