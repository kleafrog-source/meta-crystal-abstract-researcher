# RAG V3 semantic matrix — STAGE3

Дата: 2026-10-08T11:09:35+03:00

Все API-запросы выполнены строго последовательно.
Среднее время запроса: **3.265 с**.

## Dataset

- Всего: 6071
- UI: {'Range': 5597, 'Select': 448, 'Toggle': 15, 'Text': 7, 'Array': 1, 'String': 3}
- Уникальных unit: 1459

## Сводка

| Группа | корректно | target retrieved |
|---|---:|---:|
| Range | 9/10 | 9/10 |
| Select | 10/10 | 10/10 |
| Toggle | 10/10 | 10/10 |
| Text | 1/10 | 1/10 |
| String | 3/10 | 3/10 |
| Array | 10/10 | 10/10 |
| Unit | 13/13 | 13/13 |
| Complex | 10/10 | 0/10 |

## Тесты

### 1. Range · Top-K 8

- Query: `Make the sound sharpen it`
- Target: `groove_inharmonicity_spatial_shadowing_density`
- Expected: `up`
- Retrieved: **да**
- Value/default: `124.5` / `20`
- Source: `lexical`
- Direction/result: `up`
- Correct: **да**
- Changed in Top-K: 8/8

### 2. Range · Top-K 12

- Query: `Make the sound soften the texture`
- Target: `tb303_rhythmic_glide_neurophonic_mix`
- Expected: `down`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 10/12

### 3. Range · Top-K 20

- Query: `Make the sound sharpen it`
- Target: `groove_inharmonicity_spatial_shadowing_loudness`
- Expected: `up`
- Retrieved: **да**
- Value/default: `1.67` / `0.1`
- Source: `lexical`
- Direction/result: `up`
- Correct: **да**
- Changed in Top-K: 19/20

### 4. Range · Top-K 30

- Query: `Make the sound maintain a dense, consistent groove texture`
- Target: `groove_inharmonicity_spatial_shadowing_decay`
- Expected: `down`
- Retrieved: **да**
- Value/default: `0.05` / `0.55`
- Source: `lexical`
- Direction/result: `down`
- Correct: **да**
- Changed in Top-K: 29/30

### 5. Range · Top-K 50

- Query: `Make the sound push the filter into self-oscillating, screaming acid squelch`
- Target: `acid_tb303_resonance_screaming_bias`
- Expected: `up`
- Retrieved: **да**
- Value/default: `1` / `0.7`
- Source: `lexical`
- Direction/result: `up`
- Correct: **да**
- Changed in Top-K: 49/50

### 6. Range · Top-K 8

- Query: `Make the sound produce dry air with strong high-frequency attenuation`
- Target: `acoustic_air_absorption_humidity_ratio`
- Expected: `down`
- Retrieved: **да**
- Value/default: `0` / `0.5`
- Source: `lexical`
- Direction/result: `down`
- Correct: **да**
- Changed in Top-K: 8/8

### 7. Range · Top-K 12

- Query: `Make the sound create absorptive boundaries with reduced reflections and drier acoustics`
- Target: `acoustic_boundary_absorption_coefficient`
- Expected: `up`
- Retrieved: **да**
- Value/default: `0.8200000000000001` / `0.3`
- Source: `lexical`
- Direction/result: `up`
- Correct: **да**
- Changed in Top-K: 12/12

### 8. Range · Top-K 20

- Query: `Make the sound produce specular, mirror-like reflections`
- Target: `acoustic_boundary_scattering_coefficient`
- Expected: `down`
- Retrieved: **да**
- Value/default: `0` / `0.2`
- Source: `lexical`
- Direction/result: `down`
- Correct: **да**
- Changed in Top-K: 19/20

### 9. Range · Top-K 30

- Query: `Make the sound create strongly coupled cavities with split and shifted resonant modes`
- Target: `acoustic_cavity_coupling_coefficient`
- Expected: `up`
- Retrieved: **да**
- Value/default: `0.8200000000000001` / `0.3`
- Source: `lexical`
- Direction/result: `up`
- Correct: **да**
- Changed in Top-K: 29/30

### 10. Range · Top-K 50

- Query: `Make the sound produce strong low-frequency shadowing`
- Target: `acoustic_diffraction_edge_frequency`
- Expected: `down`
- Retrieved: **да**
- Value/default: `100` / `2000`
- Source: `lexical`
- Direction/result: `down`
- Correct: **да**
- Changed in Top-K: 49/50

### 11. Select · Top-K 8

- Query: `Use 1 mode for this sound`
- Target: `a5_adapt_density_smoothing_filter_order`
- Expected: `1`
- Retrieved: **да**
- Value/default: `1` / `2`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 8/8

### 12. Select · Top-K 12

- Query: `Use cardioid mode for this sound`
- Target: `acoustic_radiation_pattern_directivity`
- Expected: `cardioid`
- Retrieved: **да**
- Value/default: `cardioid` / `omnidirectional`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 5/12

### 13. Select · Top-K 20

- Query: `Use triangle mode for this sound`
- Target: `adaptive_eq_automation_shape`
- Expected: `triangle`
- Retrieved: **да**
- Value/default: `triangle` / `sine`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 17/20

### 14. Select · Top-K 30

- Query: `Use aggressive mode for this sound`
- Target: `adaptive_eq_learning_bias_curve`
- Expected: `aggressive`
- Retrieved: **да**
- Value/default: `aggressive` / `balanced`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 16/30

### 15. Select · Top-K 50

- Query: `Use down mode for this sound`
- Target: `arpeggiator_pattern_mode`
- Expected: `down`
- Retrieved: **да**
- Value/default: `down` / `up`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 30/50

### 16. Select · Top-K 8

- Query: `Use 1/4 mode for this sound`
- Target: `arpeggiator_rate_division`
- Expected: `1/4`
- Retrieved: **да**
- Value/default: `1/4` / `1/16`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 7/8

### 17. Select · Top-K 12

- Query: `Use exponential mode for this sound`
- Target: `articulation_velocity_to_parameter_bias`
- Expected: `exponential`
- Retrieved: **да**
- Value/default: `exponential` / `linear`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 9/12

### 18. Select · Top-K 20

- Query: `Use Left Only mode for this sound`
- Target: `asymmetric_delay_feedback_phase_inversion_toggle`
- Expected: `Left Only`
- Retrieved: **да**
- Value/default: `Left Only` / `Disabled`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 10/20

### 19. Select · Top-K 30

- Query: `Use rossler mode for this sound`
- Target: `attractor_type_selection`
- Expected: `rossler`
- Retrieved: **да**
- Value/default: `rossler` / `lorenz`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 14/30

### 20. Select · Top-K 50

- Query: `Use 32 mode for this sound`
- Target: `audio_buffer_size_samples`
- Expected: `32`
- Retrieved: **да**
- Value/default: `32` / `256`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 31/50

### 21. Toggle · Top-K 8

- Query: `Enable инверсия фазы LFO панорамы`
- Target: `autopan_interchannel_phase_inversion`
- Expected: `1`
- Retrieved: **да**
- Value/default: `1` / `1`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 4/8

### 22. Toggle · Top-K 12

- Query: `Disable защита от самовозбуждения дилея`
- Target: `infinite_loop_regeneration_safety`
- Expected: `0`
- Retrieved: **да**
- Value/default: `0` / `1`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 12/12

### 23. Toggle · Top-K 20

- Query: `Enable привязка цепи Маркова к темпу`
- Target: `markov_tempo_subdivision_lock`
- Expected: `1`
- Retrieved: **да**
- Value/default: `1` / `1`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 18/20

### 24. Toggle · Top-K 30

- Query: `Disable инверсия фазы`
- Target: `phase_inversion_toggle`
- Expected: `0`
- Retrieved: **да**
- Value/default: `0` / `0`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 16/30

### 25. Toggle · Top-K 50

- Query: `Enable квантование спектрального питча`
- Target: `spectral_pitch_quantization`
- Expected: `1`
- Retrieved: **да**
- Value/default: `1` / `0`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 44/50

### 26. Toggle · Top-K 8

- Query: `Disable инверсия фазы четных нечетных субгармоник`
- Target: `sub_harmonic_even_odd_phase_invert`
- Expected: `0`
- Retrieved: **да**
- Value/default: `0` / `0`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 3/8

### 27. Toggle · Top-K 12

- Query: `Enable инверсия волны осциллятора 1`
- Target: `subtractive_oscillator_1_waveform_invert`
- Expected: `1`
- Retrieved: **да**
- Value/default: `1` / `0`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 10/12

### 28. Toggle · Top-K 20

- Query: `Disable инверсия фазы отражения`
- Target: `binaural_distance_cue_ground_reflection_phase_invert`
- Expected: `0`
- Retrieved: **да**
- Value/default: `0` / `Off`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 8/20

### 29. Toggle · Top-K 30

- Query: `Enable фильтр`
- Target: `filter_cutoff_envelope_inversion`
- Expected: `1`
- Retrieved: **да**
- Value/default: `1` / `False`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 27/30

### 30. Toggle · Top-K 50

- Query: `Disable гранула`
- Target: `granular_grain_waveform_phase_reset`
- Expected: `0`
- Retrieved: **да**
- Value/default: `0` / `False`
- Source: `lexical`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 42/50

### 31. Text · Top-K 8

- Query: `Create a sound with модификатор поджанра`
- Target: `classification_subgenre_modifier`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 8/8

### 32. Text · Top-K 12

- Query: `Create a sound with стилевой дескриптор`
- Target: `descriptive_metadata_genre_label`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 11/12

### 33. Text · Top-K 20

- Query: `Create a sound with термины`
- Target: `descriptive_metadata_keywords_list`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 19/20

### 34. Text · Top-K 30

- Query: `Create a sound with polyrhythm ratio`
- Target: `polyrhythm_numerator_denominator_pair`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `3:4` / `3:4`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 26/30

### 35. Text · Top-K 50

- Query: `Create a sound with provenance tag`
- Target: `provenance_generation_hash_seed`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 44/50

### 36. Text · Top-K 8

- Query: `Create a sound with process trace tag`
- Target: `provenance_operator_path_signature`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 8/8

### 37. Text · Top-K 12

- Query: `Create a sound with вторичная семантическая тема`
- Target: `semantic_concept_secondary_theme`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 11/12

### 38. Text · Top-K 20

- Query: `Create a sound with уточняющий стиль`
- Target: `classification_subgenre_modifier`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 19/20

### 39. Text · Top-K 30

- Query: `Create a sound with категория`
- Target: `descriptive_metadata_genre_label`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 28/30

### 40. Text · Top-K 50

- Query: `Create a sound with descriptive keywords`
- Target: `descriptive_metadata_keywords_list`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 47/50

### 41. String · Top-K 8

- Query: `Create a sound with адрес смарт-контракта лицензирования интероперабельных активов`
- Target: `interoperable_asset_licensing_smart_contract_address`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 8/8

### 42. String · Top-K 12

- Query: `Create a sound with права доступа`
- Target: `interoperable_asset_ownership_proof_hash`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 12/12

### 43. String · Top-K 20

- Query: `Create a sound with семя фрактального ритма`
- Target: `l_system_axiom_string_initial`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `F` / `F`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 18/20

### 44. String · Top-K 30

- Query: `Create a sound with interoperable asset licensing smart contract address ethereum`
- Target: `interoperable_asset_licensing_smart_contract_address`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 29/30

### 45. String · Top-K 50

- Query: `Create a sound with access rights verification`
- Target: `interoperable_asset_ownership_proof_hash`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 47/50

### 46. String · Top-K 8

- Query: `Create a sound with generative rule starting point`
- Target: `l_system_axiom_string_initial`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `F` / `F`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 7/8

### 47. String · Top-K 12

- Query: `Create a sound with digital property law engine`
- Target: `interoperable_asset_licensing_smart_contract_address`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 11/12

### 48. String · Top-K 20

- Query: `Create a sound with хеш доказательства владения интероперабельным активом`
- Target: `interoperable_asset_ownership_proof_hash`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 20/20

### 49. String · Top-K 30

- Query: `Create a sound with базовый паттерн рекурсии`
- Target: `l_system_axiom_string_initial`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `F` / `F`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 25/30

### 50. String · Top-K 50

- Query: `Create a sound with права использования`
- Target: `interoperable_asset_licensing_smart_contract_address`
- Expected: `unchanged`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `target_not_retrieved`
- Correct: **нет**
- Changed in Top-K: 48/50

### 51. Array · Top-K 8

- Query: `Create a sound with точки якорей энергии на таймлайне`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 7/8

### 52. Array · Top-K 12

- Query: `Create a sound with временные метки пиков`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 9/12

### 53. Array · Top-K 20

- Query: `Create a sound with структурные вехи трека`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 17/20

### 54. Array · Top-K 30

- Query: `Create a sound with energy timeline anchor timestamp array`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 23/30

### 55. Array · Top-K 50

- Query: `Create a sound with structural peak location markers`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 44/50

### 56. Array · Top-K 8

- Query: `Create a sound with arrangement milestone coordinates`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 5/8

### 57. Array · Top-K 12

- Query: `Create a sound with dynamic climax positioning points`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 10/12

### 58. Array · Top-K 20

- Query: `Create a sound with точки якорей энергии на таймлайне`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 19/20

### 59. Array · Top-K 30

- Query: `Create a sound with временные метки пиков`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 27/30

### 60. Array · Top-K 50

- Query: `Create a sound with структурные вехи трека`
- Target: `energy_timeline_anchor_points`
- Expected: `unchanged`
- Retrieved: **да**
- Value/default: `30, 120, 240` / `30, 120, 240`
- Source: `not_generated`
- Direction/result: `unchanged`
- Correct: **да**
- Changed in Top-K: 45/50

### 61. Unit · Top-K 8

- Query: `Set частота сердцебиения в биомеханических шумах to 154.1 bpm`
- Target: `biomechanical_heart_rate_bpm`
- Expected: `154.1`
- Retrieved: **да**
- Value/default: `154.1` / `72`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 8/8

### 62. Unit · Top-K 12

- Query: `Set якорная частота спектрального центроида для замыкания A3 to 7327 hz`
- Target: `a3_recurrence_closure_spectral_centroid_anchor_hz`
- Expected: `7327.0`
- Retrieved: **да**
- Value/default: `7327` / `1000`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 12/12

### 63. Unit · Top-K 20

- Query: `Set ultrasonic layer to 73 khz`
- Target: `ultrasonic_layer_frequency_khz`
- Expected: `73.0`
- Retrieved: **да**
- Value/default: `73` / `15`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 17/20

### 64. Unit · Top-K 30

- Query: `Set время перехода от ранних к поздним отражениям лучей to 147.35 ms`
- Target: `acoustic_ray_tracing_early_to_late_reflection_cross_time_ms`
- Expected: `147.35`
- Retrieved: **да**
- Value/default: `147.35` / `80`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 29/30

### 65. Unit · Top-K 50

- Query: `Set горизонт предсказания адаптивного эквалайзера to 7.3 sec`
- Target: `adaptive_eq_prediction_horizon`
- Expected: `7.3`
- Retrieved: **да**
- Value/default: `7.3` / `1`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 47/50

### 66. Unit · Top-K 8

- Query: `Set усиление ввода с микрофона окружения to -16.2 db`
- Target: `ambient_microphone_injection_gain`
- Expected: `-16.200000000000003`
- Retrieved: **да**
- Value/default: `-16.2` / `-40`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 8/8

### 67. Unit · Top-K 12

- Query: `Set стандартное отклонение джиттера частоты парциала to 73 cents`
- Target: `additive_partial_frequency_jitter_std_dev`
- Expected: `73.0`
- Retrieved: **да**
- Value/default: `73` / `0`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 12/12

### 68. Unit · Top-K 20

- Query: `Set диапазон базового питч-бенда в полутонах to 17.52 semitones`
- Target: `basic_pitch_bend_range_semitones`
- Expected: `17.52`
- Retrieved: **да**
- Value/default: `17.52` / `2`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 19/20

### 69. Unit · Top-K 30

- Query: `Set глубина подавления частотного маскирования to 73 percent`
- Target: `adaptive_masking_suppression_depth`
- Expected: `73.0`
- Retrieved: **да**
- Value/default: `73` / `0`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 30/30

### 70. Unit · Top-K 50

- Query: `Set abstraction level to 0.73 ratio`
- Target: `abstraction_level`
- Expected: `0.73`
- Retrieved: **да**
- Value/default: `0.73` / `0.3`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 43/50

### 71. Unit · Top-K 8

- Query: `Set гистерезис границ секций ИИ to 5.975 bars`
- Target: `ai_section_boundary_hysteresis_window_bars`
- Expected: `5.975`
- Retrieved: **да**
- Value/default: `5.975` / `2`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 6/8

### 72. Unit · Top-K 12

- Query: `Set плотность гранул конволюционной текстуры to 730.27 grains`
- Target: `convolved_texture_grain_density_per_sec`
- Expected: `730.27`
- Retrieved: **да**
- Value/default: `730.27` / `120`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 12/12

### 73. Unit · Top-K 20

- Query: `Set допуск фазового совмещения конечного якоря A3 to 32.85 degrees`
- Target: `a3_terminal_anchor_phase_alignment_tolerance_deg`
- Expected: `32.85`
- Retrieved: **да**
- Value/default: `32.85` / `5`
- Source: `numeric`
- Direction/result: `match`
- Correct: **да**
- Changed in Top-K: 20/20

### 74. Complex · Top-K 30

- Query: `Make the sound much brighter, sharper and more airy without increasing loudness`
- Target: `None`
- Expected: `up`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=26`
- Correct: **да**
- Changed in Top-K: 26/30

### 75. Complex · Top-K 50

- Query: `Сделай звук заметно темнее, мягче и менее резким`
- Target: `None`
- Expected: `down`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=38`
- Correct: **да**
- Changed in Top-K: 38/50

### 76. Complex · Top-K 8

- Query: `Create a very wide deep stereo space with slow evolving motion`
- Target: `None`
- Expected: `up`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=8`
- Correct: **да**
- Changed in Top-K: 8/8

### 77. Complex · Top-K 12

- Query: `Сузь стереополе почти до моно и уменьши пространственное движение`
- Target: `None`
- Expected: `down`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=11`
- Correct: **да**
- Changed in Top-K: 11/12

### 78. Complex · Top-K 20

- Query: `Increase rhythmic density and speed while keeping dynamics controlled`
- Target: `None`
- Expected: `up`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=19`
- Correct: **да**
- Changed in Top-K: 19/20

### 79. Complex · Top-K 30

- Query: `Сделай ритм разреженным, медленным и спокойным`
- Target: `None`
- Expected: `down`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=27`
- Correct: **да**
- Changed in Top-K: 27/30

### 80. Complex · Top-K 50

- Query: `Add strong roughness, distortion and unstable chaotic texture`
- Target: `None`
- Expected: `up`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=45`
- Correct: **да**
- Changed in Top-K: 45/50

### 81. Complex · Top-K 8

- Query: `Уменьши хаос и шероховатость, сделай тембр чистым и стабильным`
- Target: `None`
- Expected: `down`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=7`
- Correct: **да**
- Changed in Top-K: 7/8

### 82. Complex · Top-K 12

- Query: `Give the sound a long smooth attack and lingering decay`
- Target: `None`
- Expected: `up`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=12`
- Correct: **да**
- Changed in Top-K: 12/12

### 83. Complex · Top-K 20

- Query: `Сделай атаку мгновенной, а затухание очень коротким`
- Target: `None`
- Expected: `down`
- Retrieved: **нет**
- Value/default: `None` / `None`
- Source: `None`
- Direction/result: `changed=20`
- Correct: **да**
- Changed in Top-K: 20/20
