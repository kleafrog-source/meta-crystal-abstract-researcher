# Flowmusic Genesis V3 — аудит явных значений Qwen · POST_FIX

Дата: 2026-10-08T16:34:44+03:00

Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.

## Сводка

- Успешных HTTP-запросов: **20/20**
- Целевой technical_name найден: **20/20**
- Запрошенное значение выставлено правильно: **20/20**
- Все выбранные значения, отличающиеся от default: **133/476 (27.9%)**
- Среднее время запроса: **2.652 с**

## Результаты

### Тест 1 · Top-K 3

Запрос: `Set acoustic_feature_attack_density to 0.82`

Цель: `acoustic_feature_attack_density` → ожидалось `0.82`
Найдена: **да**; результат: `0.8200000000000001`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 6.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.8200000000000001` | `0.5` | да | `numeric` |
| 2 | `transient_shaper_attack_gain_db_offset_scale` | `1` | `1` | нет | `default` |
| 3 | `omega_protocol_phase_transition_sigmoid_center_offset` | `0` | `0` | нет | `default` |

### Тест 2 · Top-K 5

Запрос: `Set basic_amplitude_envelope_attack_ms to 640 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `640`
Найдена: **да**; результат: `640`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **3**. Время: 2.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `640` | `10` | да | `numeric` |
| 2 | `dynamic_envelope_follower_attack_ms` | `196.60000000000002` | `5` | да | `value_anchor` |
| 3 | `envelope_generator_attack_time_ms` | `10` | `10` | нет | `default` |
| 4 | `transient_envelope_follower_attack_time_ms` | `1` | `1` | нет | `default` |
| 5 | `sub_bass_phase_alignment_offset_ms_scale` | `1` | `1` | нет | `default` |

### Тест 3 · Top-K 8

Запрос: `Set spectral_smoothing_attack_time to 48 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `48.0`
Найдена: **да**; результат: `48`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **5**. Время: 2.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `48` | `2` | да | `numeric` |
| 2 | `spectral_smearing_time_constant_ms` | `1968` | `100` | да | `value_anchor` |
| 3 | `spectral_band_compression_attack_ms` | `490.3` | `10` | да | `value_anchor` |
| 4 | `spectral_transient_smearing_time_ms` | `0` | `0` | нет | `default` |
| 5 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 6 | `spectral_gate_attack_time_ms` | `5` | `5` | нет | `default` |
| 7 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 8 | `dynamic_transient_smear_duration_ms` | `0` | `0` | нет | `default` |

### Тест 4 · Top-K 12

Запрос: `Set resonant_body_excitation_attack_damping to 0.84`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.84`
Найдена: **да**; результат: `0.84`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **9**. Время: 2.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.84` | `0.3` | да | `numeric` |
| 2 | `physical_model_b_resonance_frequency_offset` | `194` | `0` | да | `value_anchor` |
| 3 | `basic_oscillator_phase_reset_mode` | `reset_on_trigger` | `reset_on_trigger` | нет | `default` |
| 4 | `transient_shaper_attack_gain_db_offset` | `11.600000000000001` | `0` | да | `value_anchor` |
| 5 | `transient_shaper_attack_gain_db_offset_scale` | `1` | `1` | нет | `default` |
| 6 | `transient_shaper_attack_gain_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 7 | `transient_shaper_attack_gain_factor_offset_scale` | `1` | `1` | нет | `default` |
| 8 | `transient_shaper_attack_gain_factor_offset` | `0` | `0` | нет | `default` |
| 9 | `transient_shaper_attack_gain_factor_offset_scale_factor_offset` | `0` | `0` | нет | `default` |
| 10 | `terminal_state_initial_state_subset_inclusion_ratio` | `0.95` | `0.95` | нет | `default` |
| 11 | `phase_coherence_reset_threshold` | `0.8` | `0.8` | нет | `default` |
| 12 | `cellular_automata_rule_set_number` | `30` | `30` | нет | `default` |

### Тест 5 · Top-K 20

Запрос: `Set stereo_width_chorus_flanger_depth to 0.95`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.95`
Найдена: **да**; результат: `0.9500000000000001`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **6**, осталось default **14**. Время: 2.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.9500000000000001` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `180` | `150` | да | `value_anchor` |
| 4 | `midside_mid_gain_attenuation` | `-20.5` | `0` | да | `value_anchor` |
| 5 | `spatial_width_compensation_frequency` | `9748` | `500` | да | `value_anchor` |
| 6 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `356` | `90` | да | `value_anchor` |
| 7 | `spectral_centroid_lfo_phase_offset_deg` | `0` | `0` | нет | `default` |
| 8 | `layer_time_alignment_offset_samples` | `0` | `0` | нет | `default` |
| 9 | `macro_climax_drop_transient_sub_delay_offset` | `10` | `10` | нет | `default` |
| 10 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 11 | `tuning_root_frequency_offset` | `0` | `0` | нет | `default` |
| 12 | `dynamic_stereo_width_modulation_depth` | `0` | `0` | нет | `default` |
| 13 | `reverse_delay_pitch_offset` | `0` | `0` | нет | `default` |
| 14 | `multiband_stereo_width_low_frequency` | `0` | `0` | нет | `default` |
| 15 | `multitap_delay_cross_quadrature_phase_offset_deg` | `90` | `90` | нет | `default` |
| 16 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 17 | `reverb_modulation_phase_offset_degrees` | `0` | `0` | нет | `default` |
| 18 | `cassette_wow_flutter_depth_percent` | `0.5` | `0.5` | нет | `default` |
| 19 | `sample_pitch_semitone_offset` | `0` | `0` | нет | `default` |
| 20 | `terminal_state_initial_state_subset_inclusion_ratio` | `0.95` | `0.95` | нет | `default` |

### Тест 6 · Top-K 30

Запрос: `Set psychoacoustic_loudness_sharpness_ratio to 1.5`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `1.5`
Найдена: **да**; результат: `1.5`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **22**. Время: 2.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `1.5` | `0.3` | да | `numeric` |
| 2 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `2.95` | `1` | да | `value_anchor` |
| 3 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset` | `0.48` | `0` | да | `value_anchor` |
| 4 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale_factor` | `2.95` | `1` | да | `value_anchor` |
| 5 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `9.700000000000001` | `0` | да | `value_anchor` |
| 6 | `spectral_shaping_target_curve_preset` | `pink_noise_balance` | `pink_noise_balance` | нет | `default` |
| 7 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0.96` | `0` | да | `value_anchor` |
| 8 | `spectral_flatness_measure_db_scale_factor_offset` | `0.96` | `0` | да | `value_anchor` |
| 9 | `spectral_flatness_measure_db_scale_factor_offset_scale` | `2.95` | `1` | да | `value_anchor` |
| 10 | `transient_shaper_attack_gain_db_offset_scale` | `1` | `1` | нет | `default` |
| 11 | `spectral_flatness_measure_db_offset_scale` | `1` | `1` | нет | `default` |
| 12 | `spectral_masking_psychoacoustic_threshold_offset` | `0` | `0` | нет | `default` |
| 13 | `spectral_flatness_measure_db_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 14 | `dynamic_eq_threshold_offset_db` | `0` | `0` | нет | `default` |
| 15 | `spectral_flatness_measure_db_offset` | `0` | `0` | нет | `default` |
| 16 | `spectral_flatness_measure_db_offset_scale_factor` | `1` | `1` | нет | `default` |
| 17 | `transient_shaper_attack_gain_db_offset` | `0` | `0` | нет | `default` |
| 18 | `transient_shaper_attack_gain_factor_offset_scale` | `1` | `1` | нет | `default` |
| 19 | `tuning_root_frequency_offset` | `0` | `0` | нет | `default` |
| 20 | `transient_shaper_attack_gain_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 21 | `reverb_late_reflection_density_growth_ms_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 22 | `sample_rate_base_setting_hz` | `44100` | `44100` | нет | `default` |
| 23 | `reverb_late_reflection_density_growth_ms_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 24 | `psychoacoustic_loudness_sone_units` | `8` | `8` | нет | `default` |
| 25 | `simple_compressor_ratio_setting` | `4:1` | `4:1` | нет | `default` |
| 26 | `glottal_pulse_subharmonic_bloom_onset_delay_ms` | `20` | `20` | нет | `default` |
| 27 | `transient_shaper_attack_gain_factor_offset` | `0` | `0` | нет | `default` |
| 28 | `transient_shaper_attack_gain_factor_offset_scale_factor_offset` | `0` | `0` | нет | `default` |
| 29 | `layer_time_alignment_offset_samples` | `0` | `0` | нет | `default` |
| 30 | `spectral_centroid_lfo_phase_offset_deg` | `0` | `0` | нет | `default` |

### Тест 7 · Top-K 50

Запрос: `Set stereo_width_coefficient_ratio to 1.6`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.6`
Найдена: **да**; результат: `1.6`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **13**, осталось default **37**. Время: 2.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.6` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.8900000000000001` | `1` | да | `value_anchor` |
| 3 | `spatial_width_compensation_frequency` | `9349` | `500` | да | `value_anchor` |
| 4 | `mono_to_stereo_width_percent` | `185` | `100` | да | `value_anchor` |
| 5 | `multiband_stereo_width_low_frequency` | `1.85` | `0` | да | `value_anchor` |
| 6 | `spatial_width_frequency_dependent_amount` | `0.92` | `0` | да | `value_anchor` |
| 7 | `granular_grain_stereo_width_spread_ratio` | `0.93` | `0.5` | да | `value_anchor` |
| 8 | `dynamic_stereo_width_modulation_depth` | `92` | `0` | да | `value_anchor` |
| 9 | `stereo_width_expansion_ratio` | `1.83` | `1` | да | `value_anchor` |
| 10 | `simple_compressor_ratio_setting` | `4:1` | `4:1` | нет | `default` |
| 11 | `multitap_delay_cross_quadrature_phase_offset_deg` | `349` | `90` | да | `value_anchor` |
| 12 | `organic_granulation_spray_stereo_width_ratio` | `0.9400000000000001` | `0.2` | да | `value_anchor` |
| 13 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `value_anchor` |
| 14 | `phase_manipulation_haas_effect_delay_offset` | `38.900000000000006` | `15` | да | `value_anchor` |
| 15 | `haas_effect_delay_offset_ms` | `39` | `12` | да | `value_anchor` |
| 16 | `midside_mid_gain_attenuation` | `0` | `0` | нет | `default` |
| 17 | `sample_rate_base_setting_hz` | `44100` | `44100` | нет | `default` |
| 18 | `layer_time_alignment_offset_samples` | `0` | `0` | нет | `default` |
| 19 | `video_timecode_sync_offset` | `0` | `0` | нет | `default` |
| 20 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor` | `1` | `1` | нет | `default` |
| 21 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 22 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 23 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 24 | `spatial_binaural_elevation_angle_offset_degrees_scale` | `1` | `1` | нет | `default` |
| 25 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `90` | `90` | нет | `default` |
| 26 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset` | `0` | `0` | нет | `default` |
| 27 | `reverb_modulation_stereo_phase_offset` | `0` | `0` | нет | `default` |
| 28 | `spectral_shaping_target_curve_preset` | `pink_noise_balance` | `pink_noise_balance` | нет | `default` |
| 29 | `spatial_binaural_azimuth_angle_scale` | `1` | `1` | нет | `default` |
| 30 | `spatial_bass_mono_crossover_hz` | `120` | `120` | нет | `default` |
| 31 | `spatial_center_channel_extraction_gain_db` | `0` | `0` | нет | `default` |
| 32 | `spatial_binaural_elevation_angle_offset_scale` | `1` | `1` | нет | `default` |
| 33 | `phase_coherence_reset_threshold` | `0.8` | `0.8` | нет | `default` |
| 34 | `cassette_wow_flutter_depth_percent` | `0.5` | `0.5` | нет | `default` |
| 35 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 36 | `sub_bass_phase_alignment_offset_degrees_scale` | `1` | `1` | нет | `default` |
| 37 | `tuning_root_frequency_offset` | `0` | `0` | нет | `default` |
| 38 | `sub_bass_phase_alignment_offset_ms_scale` | `1` | `1` | нет | `default` |
| 39 | `dynamic_eq_threshold_offset_db` | `0` | `0` | нет | `default` |
| 40 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 41 | `binaural_distance_cue_air_absorption_humidity_offset_percentage` | `0` | `0` | нет | `default` |
| 42 | `collaboration_sync_offset_allowance` | `20` | `20` | нет | `default` |
| 43 | `sub_bass_phase_alignment_offset_time_us_scale` | `1` | `1` | нет | `default` |
| 44 | `reverb_modulation_phase_offset_degrees` | `0` | `0` | нет | `default` |
| 45 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 46 | `spectral_flatness_measure_db_offset_scale` | `1` | `1` | нет | `default` |
| 47 | `spectral_flatness_measure_db_scale_factor_offset` | `0` | `0` | нет | `default` |
| 48 | `wavefolder_symmetry_dc_offset_bias` | `0` | `0` | нет | `default` |
| 49 | `spectral_flatness_measure_db_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 50 | `spatial_binaural_azimuth_angle_offset_degrees` | `0` | `0` | нет | `default` |

### Тест 8 · Top-K 5

Запрос: `Установи acoustic_feature_attack_density на 0.18`

Цель: `acoustic_feature_attack_density` → ожидалось `0.18`
Найдена: **да**; результат: `0.18`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **3**. Время: 2.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.18` | `0.5` | да | `numeric` |
| 2 | `adapt_density_lambda_decay_factor` | `0.15000000000000002` | `0.85` | да | `value_anchor` |
| 3 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 4 | `a5_adapt_density_noise_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 5 | `aesthetic_axis_traditional_radical` | `0` | `0` | нет | `default` |

### Тест 9 · Top-K 8

Запрос: `Установи basic_amplitude_envelope_attack_ms ровно 1250 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `1250`
Найдена: **да**; результат: `1250`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **5**. Время: 2.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `1250` | `10` | да | `numeric` |
| 2 | `dynamic_envelope_follower_attack_ms` | `196.9` | `5` | да | `value_anchor` |
| 3 | `envelope_generator_attack_time_ms` | `9823.5` | `10` | да | `value_anchor` |
| 4 | `envelope_follower_attack_time_ms` | `10` | `10` | нет | `default` |
| 5 | `envelope_follower_release_time_ms` | `100` | `100` | нет | `default` |
| 6 | `dynamic_envelope_follower_attack_time_ms` | `10` | `10` | нет | `default` |
| 7 | `multiband_compressor_attack_time_ms` | `15` | `15` | нет | `default` |
| 8 | `envelope_generator_release_time_ms` | `300` | `300` | нет | `default` |

### Тест 10 · Top-K 12

Запрос: `Установи spectral_smoothing_attack_time ровно 155 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `155.0`
Найдена: **да**; результат: `155`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **4**, осталось default **8**. Время: 2.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `155` | `2` | да | `numeric` |
| 2 | `dynamic_transient_smear_duration_ms` | `197` | `0` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `196.10000000000002` | `5` | да | `value_anchor` |
| 4 | `attack_min_ms` | `985` | `10` | да | `value_anchor` |
| 5 | `granular_transient_slice_fade_in_smoothing_ms` | `1` | `1` | нет | `default` |
| 6 | `granular_grain_time_stretch_transient_decay_ms` | `50` | `50` | нет | `default` |
| 7 | `compressor_attack_time_ms` | `10` | `10` | нет | `default` |
| 8 | `dynamic_envelope_follower_attack_time_ms` | `10` | `10` | нет | `default` |
| 9 | `envelope_follow_smoothing_time_ms` | `10` | `10` | нет | `default` |
| 10 | `granular_transient_slice_attack_time_ms` | `1` | `1` | нет | `default` |
| 11 | `compressor_gain_reduction_smoothing_ms` | `5` | `5` | нет | `default` |
| 12 | `filter_cutoff_tracking_smoothing_ms` | `20` | `20` | нет | `default` |

### Тест 11 · Top-K 20

Запрос: `Установи resonant_body_excitation_attack_damping на 0.08`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.08`
Найдена: **да**; результат: `0.08`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **6**, осталось default **14**. Время: 2.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.08` | `0.3` | да | `numeric` |
| 2 | `adapt_density_lambda_decay_factor` | `0.15000000000000002` | `0.85` | да | `value_anchor` |
| 3 | `acceleration_harshness_boil_decay` | `25` | `35` | да | `value_anchor` |
| 4 | `adaptive_eq_automation_intensity` | `0.01` | `0.5` | да | `value_anchor` |
| 5 | `acoustic_medium_viscosity_damping` | `0.02` | `0.05` | да | `value_anchor` |
| 6 | `adaptive_release_time_constant` | `50` | `100` | да | `value_anchor` |
| 7 | `envelope_generator_sustain_level_ratio` | `0.7` | `0.7` | нет | `default` |
| 8 | `acid_mud_viscosity_resonance_damping` | `0.25` | `0.25` | нет | `default` |
| 9 | `adaptive_filter_adaptation_memory` | `0.5` | `0.5` | нет | `default` |
| 10 | `a1_monotonic_path_phase_irreversibility_index` | `1` | `1` | нет | `default` |
| 11 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 12 | `algorithmic_step_probability_decay_rate` | `0.1` | `0.1` | нет | `default` |
| 13 | `adaptive_filter_adaptation_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 14 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 15 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.35` | `0.35` | нет | `default` |
| 16 | `aesthetic_axis_traditional_radical` | `0` | `0` | нет | `default` |
| 17 | `a3_terminal_state_recurrence_distance_threshold` | `0.00124` | `0.00124` | нет | `default` |
| 18 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 19 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 20 | `adaptive_filter_adaptation_speed` | `0.5` | `0.5` | нет | `default` |

### Тест 12 · Top-K 30

Запрос: `Установи stereo_width_chorus_flanger_depth на 0.15`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.15`
Найдена: **да**; результат: `0.15000000000000002`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **22**. Время: 2.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.15000000000000002` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 4 | `multiband_stereo_width_low_frequency` | `1.93` | `0` | да | `value_anchor` |
| 5 | `spatial_width_compensation_frequency` | `9689` | `500` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `96` | `0` | да | `value_anchor` |
| 7 | `mono_to_stereo_width_percent` | `193` | `100` | да | `value_anchor` |
| 8 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `value_anchor` |
| 9 | `spatial_width_frequency_dependent_amount` | `0.96` | `0` | да | `value_anchor` |
| 10 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 11 | `midside_mid_gain_attenuation` | `0` | `0` | нет | `default` |
| 12 | `granular_grain_stereo_width_spread_ratio` | `0.5` | `0.5` | нет | `default` |
| 13 | `spatial_bass_mono_crossover_hz` | `120` | `120` | нет | `default` |
| 14 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 15 | `spatial_center_channel_extraction_gain_db` | `0` | `0` | нет | `default` |
| 16 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 17 | `vibe_space_station_metallic_lf_damping_hz` | `2000` | `2000` | нет | `default` |
| 18 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 19 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 20 | `organic_granulation_spray_stereo_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 21 | `spatial_binaural_azimuth_angle_scale` | `1` | `1` | нет | `default` |
| 22 | `interaural_intensity_difference` | `0` | `0` | нет | `default` |
| 23 | `sruti_raga_andolan_oscillation_depth_cents` | `25` | `25` | нет | `default` |
| 24 | `aftertouch_to_vibrato_depth_modulation` | `0.3` | `0.3` | нет | `default` |
| 25 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 26 | `metric_d_formula_weights_w` | `0.25` | `0.25` | нет | `default` |
| 27 | `dynamics_envelope_stereo_link` | `100` | `100` | нет | `default` |
| 28 | `tuning_system_base_frequency_hz` | `440` | `440` | нет | `default` |
| 29 | `auto_recursion_d_metric_weight_kick_bass_w1` | `0.15` | `0.15` | нет | `default` |
| 30 | `aesthetic_axis_traditional_radical` | `0` | `0` | нет | `default` |

### Тест 13 · Top-K 50

Запрос: `Установи psychoacoustic_loudness_sharpness_ratio на 0.2`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `0.2`
Найдена: **да**; результат: `0.2`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **13**, осталось default **37**. Время: 2.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `0.2` | `0.3` | да | `numeric` |
| 2 | `adaptive_loudness_time_constant` | `0.29` | `0.3` | да | `value_anchor` |
| 3 | `adaptive_eq_band_count` | `4` | `8` | да | `value_anchor` |
| 4 | `a5_adapt_density_high_noise_smoothing_decay` | `0.06` | `0.85` | да | `value_anchor` |
| 5 | `adapt_density_lambda_decay_factor` | `0.2` | `0.85` | да | `value_anchor` |
| 6 | `adaptive_release_time_constant` | `90` | `100` | да | `value_anchor` |
| 7 | `adapt_density_sigma_threshold_trigger` | `0.11` | `0.3` | да | `value_anchor` |
| 8 | `additive_synthesis_spectral_tilt_slope` | `-22.200000000000003` | `-6` | да | `value_anchor` |
| 9 | `envelope_generator_sustain_level_ratio` | `0.04` | `0.7` | да | `value_anchor` |
| 10 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `value_anchor` |
| 11 | `adaptive_eq_prediction_horizon` | `0.6000000000000001` | `1` | да | `value_anchor` |
| 12 | `aliasing_filter_steepness` | `12` | `24` | да | `value_anchor` |
| 13 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.05` | `0.85` | да | `value_anchor` |
| 14 | `adaptive_notch_filter_q` | `4.5` | `15` | да | `value_anchor` |
| 15 | `additive_synthesis_noise_blur_amount` | `0` | `0` | нет | `value_anchor` |
| 16 | `acoustic_feature_roughness_index` | `0.3` | `0.3` | нет | `default` |
| 17 | `a5_adapt_density_noise_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 18 | `a5_adapt_density_lambda_smoothing_coefficient` | `0.85` | `0.85` | нет | `default` |
| 19 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 20 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 21 | `adaptive_reverb_tail_prediction_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 22 | `acoustic_shadowing_pinna_notch_frequency` | `8000` | `8000` | нет | `default` |
| 23 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 24 | `a5_adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `default` |
| 25 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.9` | `0.9` | нет | `default` |
| 26 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 27 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 28 | `acoustic_feature_timbral_brightness` | `0.5` | `0.5` | нет | `default` |
| 29 | `acoustic_shadow_occlusion_filter_freq_hz` | `800` | `800` | нет | `default` |
| 30 | `adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `default` |
| 31 | `algorithmic_reverb_decay_time_seconds` | `2.5` | `2.5` | нет | `default` |
| 32 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_ratio` | `0.1` | `0.1` | нет | `default` |
| 33 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 34 | `acoustic_diffusion_reflection_density_slope` | `1` | `1` | нет | `default` |
| 35 | `algorithmic_step_probability_decay_rate` | `0.1` | `0.1` | нет | `default` |
| 36 | `aftertouch_to_vibrato_depth_modulation` | `0.3` | `0.3` | нет | `default` |
| 37 | `acoustic_radiation_pattern_directivity` | `omnidirectional` | `omnidirectional` | нет | `default` |
| 38 | `acoustic_ray_tracing_specular_to_diffuse_scattering_ratio` | `0.5` | `0.5` | нет | `default` |
| 39 | `affective_arousal_modulation_depth` | `0.5` | `0.5` | нет | `default` |
| 40 | `acoustic_ray_tracing_air_absorption_humidity_factor` | `0.5` | `0.5` | нет | `default` |
| 41 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 42 | `acoustic_sound_speed_temperature_scaling` | `1` | `1` | нет | `default` |
| 43 | `additive_partials_slope` | `-12` | `-12` | нет | `default` |
| 44 | `algorithmic_markov_rhythmic_accent_decay_ms` | `20` | `20` | нет | `default` |
| 45 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 46 | `acoustic_diffraction_edge_frequency` | `2000` | `2000` | нет | `default` |
| 47 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 48 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 49 | `adaptive_filter_adaptation_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 50 | `acoustic_modal_density_per_hz` | `10` | `10` | нет | `default` |

### Тест 14 · Top-K 3

Запрос: `Установи stereo_width_coefficient_ratio на 0.35`

Цель: `stereo_width_coefficient_ratio` → ожидалось `0.35`
Найдена: **да**; результат: `0.35000000000000003`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 2.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `0.35000000000000003` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |

### Тест 15 · Top-K 8

Запрос: `acoustic_feature_attack_density: 0.93`

Цель: `acoustic_feature_attack_density` → ожидалось `0.93`
Найдена: **да**; результат: `0.93`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **5**. Время: 2.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.93` | `0.5` | да | `numeric` |
| 2 | `acoustic_feature_roughness_index` | `0.99` | `0.3` | да | `value_anchor` |
| 3 | `adapt_density_lambda_decay_factor` | `1.9500000000000002` | `0.85` | да | `value_anchor` |
| 4 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 5 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 6 | `adaptive_eq_band_count` | `8` | `8` | нет | `default` |
| 7 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 8 | `a3_terminal_state_recurrence_distance_threshold` | `0.00124` | `0.00124` | нет | `default` |

### Тест 16 · Top-K 12

Запрос: `basic_amplitude_envelope_attack_ms: 80`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `80`
Найдена: **да**; результат: `80`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **4**, осталось default **8**. Время: 2.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `80` | `10` | да | `numeric` |
| 2 | `additive_partial_amplitude_envelope_decay` | `9890` | `500` | да | `value_anchor` |
| 3 | `gated_reverb_release_cutoff_time` | `990` | `150` | да | `value_anchor` |
| 4 | `aftertouch_to_vibrato_depth_modulation` | `0.99` | `0.3` | да | `value_anchor` |
| 5 | `adaptive_release_time_constant` | `100` | `100` | нет | `default` |
| 6 | `omega_synthesis_velocity_v_max_threshold_ms` | `80` | `80` | нет | `default` |
| 7 | `adaptive_eq_band_count` | `8` | `8` | нет | `default` |
| 8 | `dynamic_overdrive_bias` | `0` | `0` | нет | `default` |
| 9 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 10 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 11 | `adapt_density_lambda_decay_factor` | `0.85` | `0.85` | нет | `default` |
| 12 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |

### Тест 17 · Top-K 20

Запрос: `spectral_smoothing_attack_time: 12.5`

Цель: `spectral_smoothing_attack_time` → ожидалось `12.5`
Найдена: **да**; результат: `12.5`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **17**. Время: 2.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `12.5` | `2` | да | `numeric` |
| 2 | `vibe_simulation_glitch_bitcrusher_downsample_bits` | `8-bit` | `8-bit` | нет | `default` |
| 3 | `spectral_entropy_variance_kappa_threshold_floor` | `0.0494` | `0.001` | да | `value_anchor` |
| 4 | `omega_synthesis_d_metric_kappa_noise_weight` | `0.12` | `0.12` | нет | `value_anchor` |
| 5 | `metric_d_noise_sensitivity_kappa` | `0.5` | `0.12` | да | `value_anchor` |
| 6 | `comb_array_allpass_diffusion_stage_count` | `4` | `4` | нет | `default` |
| 7 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 8 | `sidechain_resonance_target_frequency` | `220` | `220` | нет | `default` |
| 9 | `spectral_entropy_variance_kappa_scale` | `0.12` | `0.12` | нет | `default` |
| 10 | `adapt_density_lambda_decay_factor` | `0.85` | `0.85` | нет | `default` |
| 11 | `euclidean_rhythm_step_count_mode` | `16` | `16` | нет | `default` |
| 12 | `xenharmonic_periodicity_block_size` | `12` | `12` | нет | `default` |
| 13 | `filter_resonance_q` | `1` | `1` | нет | `default` |
| 14 | `multiband_compressor_sidechain_filter_slope_db_per_octave` | `12 dB/Octave` | `12 dB/Octave` | нет | `default` |
| 15 | `adaptive_release_time_constant` | `100` | `100` | нет | `default` |
| 16 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 17 | `filter_slope_db_per_octave` | `12` | `12` | нет | `default` |
| 18 | `auto_recursion_d_metric_weighted_variance_kappa` | `0.12` | `0.12` | нет | `default` |
| 19 | `additive_synthesis_noise_blur_amount` | `0` | `0` | нет | `default` |
| 20 | `additive_partial_phase_randomization_seed` | `0` | `0` | нет | `default` |

### Тест 18 · Top-K 30

Запрос: `resonant_body_excitation_attack_damping: 0.67`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.67`
Найдена: **да**; результат: `0.67`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **9**, осталось default **21**. Время: 2.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.67` | `0.3` | да | `numeric` |
| 2 | `adaptive_release_time_constant` | `1970` | `100` | да | `value_anchor` |
| 3 | `acoustic_feature_roughness_index` | `0.99` | `0.3` | да | `value_anchor` |
| 4 | `affective_arousal_change_rate` | `0.99` | `0.2` | да | `value_anchor` |
| 5 | `algorithmic_step_probability_decay_rate` | `0.98` | `0.1` | да | `value_anchor` |
| 6 | `adapt_density_lambda_decay_factor` | `1.9500000000000002` | `0.85` | да | `value_anchor` |
| 7 | `acceleration_harshness_boil_decay` | `745` | `35` | да | `value_anchor` |
| 8 | `affective_arousal_modulation_depth` | `0.99` | `0.5` | да | `value_anchor` |
| 9 | `aesthetic_axis_organic_mechanical` | `0.98` | `0` | да | `value_anchor` |
| 10 | `aftertouch_to_vibrato_depth_modulation` | `0.3` | `0.3` | нет | `default` |
| 11 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.35` | `0.35` | нет | `default` |
| 12 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 13 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 14 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 15 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 16 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 17 | `adaptive_filter_adaptation_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 18 | `acoustic_ray_tracing_bounce_count` | `10` | `10` | нет | `default` |
| 19 | `adaptive_filter_adaptation_memory` | `0.5` | `0.5` | нет | `default` |
| 20 | `acoustic_ray_tracing_material_hardness` | `0.8` | `0.8` | нет | `default` |
| 21 | `adaptive_filter_adaptation_speed` | `0.5` | `0.5` | нет | `default` |
| 22 | `acoustic_coupling_cross_modulation_depth` | `0.3` | `0.3` | нет | `default` |
| 23 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 24 | `acoustic_shadow_occlusion_filter_freq_hz` | `800` | `800` | нет | `default` |
| 25 | `acoustic_coupling_resonance_transfer_speed` | `100` | `100` | нет | `default` |
| 26 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 27 | `a5_adapt_density_noise_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 28 | `acoustic_ray_tracing_wall_absorption_coefficient` | `0.35` | `0.35` | нет | `default` |
| 29 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 30 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |

### Тест 19 · Top-K 50

Запрос: `stereo_width_chorus_flanger_depth: 0.40`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.4`
Найдена: **да**; результат: `0.4`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **13**, осталось default **37**. Время: 2.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.4` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `180` | `150` | да | `value_anchor` |
| 4 | `gamma_40hz_binaural_carrier_pan_modulation_speed` | `0.19` | `0.2` | да | `value_anchor` |
| 5 | `mono_to_stereo_width_percent` | `196` | `100` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `98` | `0` | да | `value_anchor` |
| 7 | `multiband_stereo_width_low_frequency` | `1.96` | `0` | да | `value_anchor` |
| 8 | `midside_mid_gain_attenuation` | `-21.8` | `0` | да | `value_anchor` |
| 9 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `value_anchor` |
| 10 | `spatial_width_compensation_frequency` | `9840` | `500` | да | `value_anchor` |
| 11 | `gamma_40hz_isochronic_pulse_duty_cycle_precision` | `13` | `50` | да | `value_anchor` |
| 12 | `sub_harmonic_bloom_depth` | `0` | `0` | нет | `value_anchor` |
| 13 | `grain_cloud_spread_stereo_width` | `197` | `100` | да | `value_anchor` |
| 14 | `spatial_bass_mono_crossover_hz` | `60` | `120` | да | `value_anchor` |
| 15 | `spatial_center_channel_extraction_gain_db` | `-56` | `0` | да | `value_anchor` |
| 16 | `spatial_width_frequency_dependent_amount` | `0` | `0` | нет | `default` |
| 17 | `gamma_band_40hz_coherence_alignment` | `0.4` | `0.4` | нет | `default` |
| 18 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 19 | `gamma_band_40hz_phase_locking_value_plv` | `0.85` | `0.85` | нет | `default` |
| 20 | `granular_grain_stereo_width_spread_ratio` | `0.5` | `0.5` | нет | `default` |
| 21 | `gamaka_pitch_bend_attack_inertia_ms` | `35` | `35` | нет | `default` |
| 22 | `additive_synthesis_spectral_tilt_slope` | `-6` | `-6` | нет | `default` |
| 23 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 24 | `sitar_veena_jawari_pluck_fadein_time` | `100` | `100` | нет | `default` |
| 25 | `glottal_pulse_subharmonic_bloom_onset_delay_ms` | `20` | `20` | нет | `default` |
| 26 | `aftertouch_to_vibrato_depth_modulation` | `0.3` | `0.3` | нет | `default` |
| 27 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 28 | `fft_window_size_selection` | `2048` | `2048` | нет | `default` |
| 29 | `additive_synthesis_noise_blur_amount` | `0` | `0` | нет | `default` |
| 30 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 31 | `tuning_system_base_frequency_hz` | `440` | `440` | нет | `default` |
| 32 | `adaptive_reverb_tail_prediction_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 33 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 34 | `lfe_plosive_consonant_transient_suppression_ms` | `20` | `20` | нет | `default` |
| 35 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 36 | `adaptive_eq_band_count` | `8` | `8` | нет | `default` |
| 37 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 38 | `spatial_binaural_azimuth_angle_scale` | `1` | `1` | нет | `default` |
| 39 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 40 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 41 | `velum_open_nasal_coupling_coefficient` | `0.4` | `0.4` | нет | `default` |
| 42 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 43 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 44 | `temple_ir_early_reflection_suppression_ratio` | `0.85` | `0.85` | нет | `default` |
| 45 | `sruti_microtonal_pitch_glide_smoothing_ms` | `40` | `40` | нет | `default` |
| 46 | `adaptive_eq_prediction_horizon` | `1` | `1` | нет | `default` |
| 47 | `glottal_closure_harmonic_overtone_boost_dB` | `6` | `6` | нет | `default` |
| 48 | `adaptive_notch_filter_q` | `15` | `15` | нет | `default` |
| 49 | `organic_granulation_spray_stereo_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 50 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |

### Тест 20 · Top-K 100

Запрос: `stereo_width_coefficient_ratio: 1.85`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.85`
Найдена: **да**; результат: `1.85`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **28**, осталось default **72**. Время: 3.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.85` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.95` | `1` | да | `value_anchor` |
| 3 | `mono_to_stereo_width_percent` | `191` | `100` | да | `value_anchor` |
| 4 | `multiband_stereo_width_low_frequency` | `1.92` | `0` | да | `value_anchor` |
| 5 | `spatial_width_compensation_frequency` | `9637` | `500` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `95` | `0` | да | `value_anchor` |
| 7 | `spatial_width_frequency_dependent_amount` | `0.96` | `0` | да | `value_anchor` |
| 8 | `midside_mid_gain_attenuation` | `-23.1` | `0` | да | `value_anchor` |
| 9 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `value_anchor` |
| 10 | `granular_grain_stereo_width_spread_ratio` | `0.96` | `0.5` | да | `value_anchor` |
| 11 | `grain_cloud_spread_stereo_width` | `193` | `100` | да | `value_anchor` |
| 12 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 13 | `spatial_binaural_azimuth_angle_scale` | `0.05` | `1` | да | `value_anchor` |
| 14 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 15 | `spatial_bass_mono_crossover_hz` | `40` | `120` | да | `value_anchor` |
| 16 | `spatial_center_channel_extraction_gain_db` | `-58` | `0` | да | `value_anchor` |
| 17 | `adapt_density_lambda_decay_factor` | `1.9500000000000002` | `0.85` | да | `value_anchor` |
| 18 | `organic_granulation_spray_stereo_width_ratio` | `0.97` | `0.2` | да | `value_anchor` |
| 19 | `stereo_width_expansion_ratio` | `1.93` | `1` | да | `value_anchor` |
| 20 | `a5_adapt_density_lambda_smoothing_coefficient` | `1.97` | `0.85` | да | `value_anchor` |
| 21 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.02` | `0.5` | да | `value_anchor` |
| 22 | `omega_synthesis_adaptive_density_lambda_constant` | `0.85` | `0.85` | нет | `value_anchor` |
| 23 | `adaptive_eq_band_count` | `63` | `8` | да | `value_anchor` |
| 24 | `adaptive_eq_prediction_horizon` | `9.8` | `1` | да | `value_anchor` |
| 25 | `ambient_microphone_injection_gain` | `-1` | `-40` | да | `value_anchor` |
| 26 | `adaptive_reverb_tail_prediction_sensitivity` | `0.98` | `0.5` | да | `value_anchor` |
| 27 | `omega_axiom_a5_adapt_density_decay_exponent` | `4.9` | `0.85` | да | `value_anchor` |
| 28 | `aesthetic_axis_organic_mechanical` | `0.97` | `0` | да | `value_anchor` |
| 29 | `allpass_reverb_diffuser_density_ratio` | `0.98` | `0.7` | да | `value_anchor` |
| 30 | `aesthetic_collision_ratio` | `0.98` | `0.5` | да | `value_anchor` |
| 31 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 32 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.9` | `0.9` | нет | `default` |
| 33 | `adaptive_release_time_constant` | `100` | `100` | нет | `default` |
| 34 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 35 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 36 | `aliasing_filter_steepness` | `24` | `24` | нет | `default` |
| 37 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 38 | `acoustic_ray_tracing_bounce_count` | `10` | `10` | нет | `default` |
| 39 | `acoustic_shadowing_pinna_notch_frequency` | `8000` | `8000` | нет | `default` |
| 40 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 41 | `adaptive_notch_filter_q` | `15` | `15` | нет | `default` |
| 42 | `acoustic_radiation_pattern_directivity` | `omnidirectional` | `omnidirectional` | нет | `default` |
| 43 | `drop_impact_timing_position` | `phi_62pct` | `phi_62pct` | нет | `default` |
| 44 | `acoustic_reed_rest_position_offset` | `0` | `0` | нет | `default` |
| 45 | `additive_synthesis_spectral_tilt_slope` | `-6` | `-6` | нет | `default` |
| 46 | `acoustic_ray_tracing_specular_to_diffuse_scattering_ratio` | `0.5` | `0.5` | нет | `default` |
| 47 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 48 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 49 | `amplitude_to_brightness_gamma_curve` | `2.2` | `2.2` | нет | `default` |
| 50 | `aftertouch_to_vibrato_depth_modulation` | `0.3` | `0.3` | нет | `default` |
| 51 | `a5_adapt_density_noise_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 52 | `aliasing_harmonic_distribution_skew` | `0.5` | `0.5` | нет | `default` |
| 53 | `acoustic_feature_roughness_index` | `0.3` | `0.3` | нет | `default` |
| 54 | `organic_granulation_spray_pan_width_ratio` | `0.5` | `0.5` | нет | `default` |
| 55 | `amplitude_pan_modulation_depth` | `0` | `0` | нет | `default` |
| 56 | `air_column_turbulence_noise_level` | `0.1` | `0.1` | нет | `default` |
| 57 | `allpass_reverb_loop_delay_time_ms` | `35` | `35` | нет | `default` |
| 58 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 59 | `acoustic_ray_tracing_air_absorption_humidity_factor` | `0.5` | `0.5` | нет | `default` |
| 60 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 61 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 62 | `acoustic_ray_tracing_material_hardness` | `0.8` | `0.8` | нет | `default` |
| 63 | `allpass_filter_dispersion_allpass_stage_delay_mode` | `Exponential` | `Exponential` | нет | `default` |
| 64 | `additive_synthesis_noise_blur_amount` | `0` | `0` | нет | `default` |
| 65 | `acoustic_shadow_occlusion_filter_freq_hz` | `800` | `800` | нет | `default` |
| 66 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 67 | `a5_adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `default` |
| 68 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 69 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `0.707` | `0.707` | нет | `default` |
| 70 | `algorithmic_reverb_decay_time_seconds` | `2.5` | `2.5` | нет | `default` |
| 71 | `alpha_wave_binaural_carrier_amplitude_modulation_depth` | `0.25` | `0.25` | нет | `default` |
| 72 | `additive_subtractive_fusion_bandwidth` | `50` | `50` | нет | `default` |
| 73 | `adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `default` |
| 74 | `acoustic_ray_tracing_diffuse_reflection_order` | `4` | `4` | нет | `default` |
| 75 | `analog_noise_floor_level_db` | `-90` | `-90` | нет | `default` |
| 76 | `acoustic_ray_tracing_wall_absorption_coefficient` | `0.35` | `0.35` | нет | `default` |
| 77 | `allpass_reverb_recirculation_gain_db` | `-3` | `-3` | нет | `default` |
| 78 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.35` | `0.35` | нет | `default` |
| 79 | `mmss_l6_spontaneous_consciousness_meta_observer_index` | `0.85` | `0.85` | нет | `default` |
| 80 | `acoustic_ray_tracing_scattering_coefficient` | `0.3` | `0.3` | нет | `default` |
| 81 | `acoustic_shadow_diffraction_index` | `0.45` | `0.45` | нет | `default` |
| 82 | `aesthetic_axis_traditional_radical` | `0` | `0` | нет | `default` |
| 83 | `acoustic_sound_speed_temperature_scaling` | `1` | `1` | нет | `default` |
| 84 | `ambisonic_order_level` | `first_order` | `first_order` | нет | `default` |
| 85 | `algorithmic_step_probability_decay_rate` | `0.1` | `0.1` | нет | `default` |
| 86 | `adaptive_filter_adaptation_speed` | `0.5` | `0.5` | нет | `default` |
| 87 | `a5_adapt_density_smoothing_filter_order` | `2` | `2` | нет | `default` |
| 88 | `adaptive_spatialization_motion_prediction_gain` | `0.4` | `0.4` | нет | `default` |
| 89 | `acoustic_near_field_distance_meters` | `0.5` | `0.5` | нет | `default` |
| 90 | `l6_spontaneous_consciousness_index` | `0.85` | `0.85` | нет | `default` |
| 91 | `a3_recurrence_closure_spectral_centroid_anchor_hz` | `1000` | `1000` | нет | `default` |
| 92 | `additive_partials_slope` | `-12` | `-12` | нет | `default` |
| 93 | `acoustic_feature_timbral_brightness` | `0.5` | `0.5` | нет | `default` |
| 94 | `ambient_reverb_modal_density_scaling_exponent` | `1` | `1` | нет | `default` |
| 95 | `adaptive_filter_adaptation_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 96 | `acoustic_ray_tracing_early_to_late_reflection_cross_time_ms` | `80` | `80` | нет | `default` |
| 97 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 98 | `analog_drift_oscillator_detune_cents` | `3` | `3` | нет | `default` |
| 99 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 100 | `ai_section_boundary_hysteresis_window_bars` | `2` | `2` | нет | `default` |
