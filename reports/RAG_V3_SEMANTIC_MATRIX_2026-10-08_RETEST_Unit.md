# RAG V3 semantic matrix — RETEST

Дата: 2026-10-08T02:15:19+03:00

Все API-запросы выполнены строго последовательно.

## Dataset

- Всего: 6064
- UI: {'Range': 5589, 'Select': 449, 'Toggle': 15, 'Text': 7, 'Array': 1, 'String': 3}
- Уникальных unit: 1459

## Сводка

| Группа | корректно | target retrieved |
|---|---:|---:|
| Range | 0/0 | 0/0 |
| Select | 0/0 | 0/0 |
| Toggle | 0/0 | 0/0 |
| Text | 0/0 | 0/0 |
| String | 0/0 | 0/0 |
| Array | 0/0 | 0/0 |
| Unit | 13/13 | 13/13 |
| Complex | 0/0 | 0/0 |

## Тесты

### 1. Unit · Top-K 8

- Query: `Set частота сердцебиения в биомеханических шумах to 154.1 bpm`
- Target: `biomechanical_heart_rate_bpm`
- Expected: `154.1`
- Retrieved: **да**
- Value/default: `154.1` / `72`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 1/8

### 2. Unit · Top-K 12

- Query: `Set якорная частота спектрального центроида для замыкания A3 to 7327 hz`
- Target: `a3_recurrence_closure_spectral_centroid_anchor_hz`
- Expected: `7327.0`
- Retrieved: **да**
- Value/default: `7327` / `1000`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 1/12

### 3. Unit · Top-K 20

- Query: `Set ultrasonic layer to 73 khz`
- Target: `ultrasonic_layer_frequency_khz`
- Expected: `73.0`
- Retrieved: **да**
- Value/default: `73` / `15`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 4/20

### 4. Unit · Top-K 30

- Query: `Set время перехода от ранних к поздним отражениям лучей to 147.35 ms`
- Target: `acoustic_ray_tracing_early_to_late_reflection_cross_time_ms`
- Expected: `147.35`
- Retrieved: **да**
- Value/default: `147.35` / `80`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 2/30

### 5. Unit · Top-K 50

- Query: `Set горизонт предсказания адаптивного эквалайзера to 7.3 sec`
- Target: `adaptive_eq_prediction_horizon`
- Expected: `7.3`
- Retrieved: **да**
- Value/default: `7.3` / `1`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 2/50

### 6. Unit · Top-K 8

- Query: `Set усиление ввода с микрофона окружения to -16.2 db`
- Target: `ambient_microphone_injection_gain`
- Expected: `-16.200000000000003`
- Retrieved: **да**
- Value/default: `-16.2` / `-40`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 3/8

### 7. Unit · Top-K 12

- Query: `Set стандартное отклонение джиттера частоты парциала to 73 cents`
- Target: `additive_partial_frequency_jitter_std_dev`
- Expected: `73.0`
- Retrieved: **да**
- Value/default: `73` / `0`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 3/12

### 8. Unit · Top-K 20

- Query: `Set диапазон базового питч-бенда в полутонах to 17.52 semitones`
- Target: `basic_pitch_bend_range_semitones`
- Expected: `17.52`
- Retrieved: **да**
- Value/default: `17.52` / `2`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 1/20

### 9. Unit · Top-K 30

- Query: `Set глубина подавления частотного маскирования to 73 percent`
- Target: `adaptive_masking_suppression_depth`
- Expected: `73.0`
- Retrieved: **да**
- Value/default: `73` / `0`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 2/30

### 10. Unit · Top-K 50

- Query: `Set abstraction level to 0.73 ratio`
- Target: `abstraction_level`
- Expected: `0.73`
- Retrieved: **да**
- Value/default: `0.73` / `0.3`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 5/50

### 11. Unit · Top-K 8

- Query: `Set гистерезис границ секций ИИ to 5.975 bars`
- Target: `ai_section_boundary_hysteresis_window_bars`
- Expected: `5.975`
- Retrieved: **да**
- Value/default: `5.975` / `2`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 2/8

### 12. Unit · Top-K 12

- Query: `Set плотность гранул конволюционной текстуры to 730.27 grains`
- Target: `convolved_texture_grain_density_per_sec`
- Expected: `730.27`
- Retrieved: **да**
- Value/default: `730.27` / `120`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 3/12

### 13. Unit · Top-K 20

- Query: `Set допуск фазового совмещения конечного якоря A3 to 32.85 degrees`
- Target: `a3_terminal_anchor_phase_alignment_tolerance_deg`
- Expected: `32.85`
- Retrieved: **да**
- Value/default: `32.85` / `5`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 1/20
