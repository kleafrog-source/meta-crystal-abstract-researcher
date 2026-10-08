# Flowmusic Genesis V3 — аудит явных значений Qwen · STAGE3

Дата: 2026-10-08T11:02:32+03:00

Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.

## Сводка

- Успешных HTTP-запросов: **20/20**
- Целевой technical_name найден: **20/20**
- Запрошенное значение выставлено правильно: **20/20**
- Все выбранные значения, отличающиеся от default: **431/476 (90.5%)**
- Среднее время запроса: **3.485 с**

## Результаты

### Тест 1 · Top-K 3

Запрос: `Set acoustic_feature_attack_density to 0.82`

Цель: `acoustic_feature_attack_density` → ожидалось `0.82`
Найдена: **да**; результат: `0.8200000000000001`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **0**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.8200000000000001` | `0.5` | да | `numeric` |
| 2 | `transient_shaper_attack_gain_db_offset` | `0.1` | `0` | да | `value_anchor` |
| 3 | `transient_shaper_attack_gain_factor_offset_scale` | `1.55` | `1` | да | `value_anchor` |

### Тест 2 · Top-K 5

Запрос: `Set basic_amplitude_envelope_attack_ms to 640 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `640`
Найдена: **да**; результат: `640`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **0**. Время: 2.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `640` | `10` | да | `numeric` |
| 2 | `envelope_generator_attack_time_ms` | `4832.3` | `10` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `97.60000000000001` | `5` | да | `value_anchor` |
| 4 | `transient_shaper_attack_length_ms` | `50.5` | `15` | да | `value_anchor` |
| 5 | `basic_amplitude_envelope_release_ms` | `5430` | `200` | да | `value_anchor` |

### Тест 3 · Top-K 8

Запрос: `Set spectral_smoothing_attack_time to 48 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `48.0`
Найдена: **да**; результат: `48`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **0**. Время: 2.8 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `48` | `2` | да | `numeric` |
| 2 | `spectral_bin_magnitude_smoothing_time_ms` | `257.40000000000003` | `20` | да | `value_anchor` |
| 3 | `spectral_gate_attack_time_ms` | `97.31` | `5` | да | `value_anchor` |
| 4 | `spectral_band_compression_attack_ms` | `243.9` | `10` | да | `value_anchor` |
| 5 | `spectral_transient_smearing_time_ms` | `255.5` | `0` | да | `value_anchor` |
| 6 | `spectral_gate_lookahead_smoothing_ms` | `52.5` | `5` | да | `value_anchor` |
| 7 | `transient_shaper_attack_length_ms` | `49.5` | `15` | да | `value_anchor` |
| 8 | `spectral_smearing_time_constant_ms` | `1024` | `100` | да | `value_anchor` |

### Тест 4 · Top-K 12

Запрос: `Set resonant_body_excitation_attack_damping to 0.84`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.84`
Найдена: **да**; результат: `0.84`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **10**, осталось default **2**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.84` | `0.3` | да | `numeric` |
| 2 | `transient_shaper_attack_gain_db_offset` | `-0.5` | `0` | да | `value_anchor` |
| 3 | `transient_shaper_attack_gain_db_offset_scale` | `1.5` | `1` | да | `value_anchor` |
| 4 | `basic_oscillator_phase_reset_mode` | `reset_on_trigger` | `reset_on_trigger` | нет | `default` |
| 5 | `transient_shaper_attack_gain_factor_offset_scale` | `1.5` | `1` | да | `value_anchor` |
| 6 | `transient_shaper_attack_gain_factor_offset` | `-0.04` | `0` | да | `value_anchor` |
| 7 | `physical_model_b_resonance_frequency_offset` | `4` | `0` | да | `value_anchor` |
| 8 | `transient_shaper_attack_gain_factor_offset_scale_factor_offset` | `-0.01` | `0` | да | `value_anchor` |
| 9 | `multitap_delay_prime_number_tap_spacing_offset_ms` | `51.7` | `13.7` | да | `value_anchor` |
| 10 | `vibe_voodoo_cybernetics_polyrhythm_djembe_offset_ms` | `30` | `25` | да | `value_anchor` |
| 11 | `gamaka_oscillation_sruti_centroid_center_offset` | `0` | `0` | нет | `value_anchor` |
| 12 | `transient_shaper_attack_gain_factor_offset_scale_factor` | `1.5` | `1` | да | `value_anchor` |

### Тест 5 · Top-K 20

Запрос: `Set stereo_width_chorus_flanger_depth to 0.95`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.95`
Найдена: **да**; результат: `0.9500000000000001`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **19**, осталось default **1**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.9500000000000001` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.6` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `160` | `150` | да | `value_anchor` |
| 4 | `stereo_width_expansion_coefficient` | `1.55` | `1` | да | `value_anchor` |
| 5 | `dynamic_stereo_width_modulation_depth` | `78` | `0` | да | `value_anchor` |
| 6 | `mono_to_stereo_width_percent` | `156` | `100` | да | `value_anchor` |
| 7 | `multitap_delay_cross_quadrature_phase_offset_deg` | `186` | `90` | да | `value_anchor` |
| 8 | `spatial_width_frequency_dependent_amount` | `0.77` | `0` | да | `value_anchor` |
| 9 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `189` | `90` | да | `value_anchor` |
| 10 | `granular_grain_stereo_width_spread_ratio` | `0.78` | `0.5` | да | `value_anchor` |
| 11 | `cassette_wow_flutter_depth_percent` | `5.1000000000000005` | `0.5` | да | `value_anchor` |
| 12 | `multiband_stereo_width_low_frequency` | `1.58` | `0` | да | `value_anchor` |
| 13 | `wavefolder_symmetry_dc_offset_bias` | `0` | `0` | нет | `value_anchor` |
| 14 | `midside_mid_gain_attenuation` | `-17.3` | `0` | да | `value_anchor` |
| 15 | `phase_manipulation_haas_effect_delay_offset` | `20.1` | `15` | да | `value_anchor` |
| 16 | `stereo_width_coefficient_ratio` | `0.44` | `1` | да | `value_anchor` |
| 17 | `phase_offset_modulation_depth` | `183.4` | `90` | да | `value_anchor` |
| 18 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `183` | `90` | да | `value_anchor` |
| 19 | `spatial_width_compensation_frequency` | `7788` | `500` | да | `value_anchor` |
| 20 | `haas_effect_delay_offset_ms` | `20.1` | `12` | да | `value_anchor` |

### Тест 6 · Top-K 30

Запрос: `Set psychoacoustic_loudness_sharpness_ratio to 1.5`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `1.5`
Найдена: **да**; результат: `1.5`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **26**, осталось default **4**. Время: 3.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `1.5` | `0.3` | да | `numeric` |
| 2 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `0.4` | `0` | да | `value_anchor` |
| 3 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1.6500000000000001` | `1` | да | `value_anchor` |
| 4 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0.05` | `0` | да | `value_anchor` |
| 5 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale_factor` | `1.6` | `1` | да | `value_anchor` |
| 6 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset` | `0.02` | `0` | да | `value_anchor` |
| 7 | `spectral_masking_psychoacoustic_threshold_offset` | `1.2000000000000002` | `0` | да | `value_anchor` |
| 8 | `simple_compressor_ratio_setting` | `4:1` | `4:1` | нет | `default` |
| 9 | `spectral_flatness_measure_db_scale_factor_offset` | `0.1` | `0` | да | `value_anchor` |
| 10 | `transient_shaper_attack_gain_db_offset_scale` | `1.6` | `1` | да | `value_anchor` |
| 11 | `spectral_shaping_target_curve_preset` | `pink_noise_balance` | `pink_noise_balance` | нет | `default` |
| 12 | `spectral_flatness_measure_db_scale_factor_offset_scale_factor` | `2.8000000000000003` | `1` | да | `value_anchor` |
| 13 | `spectral_flatness_measure_db_scale_factor_offset_scale` | `1.7000000000000002` | `1` | да | `value_anchor` |
| 14 | `transient_shaper_attack_gain_db_offset` | `0.5` | `0` | да | `value_anchor` |
| 15 | `spectral_flatness_measure_db_offset_scale` | `2.8000000000000003` | `1` | да | `value_anchor` |
| 16 | `generative_pattern_groove_humanize_velocity_offset` | `3` | `0` | да | `value_anchor` |
| 17 | `spectral_flatness_measure_db_offset` | `0.5` | `0` | да | `value_anchor` |
| 18 | `psychoacoustic_loudness_sone_units` | `65.3` | `8` | да | `value_anchor` |
| 19 | `transient_shaper_attack_gain_factor_offset_scale` | `1.6` | `1` | да | `value_anchor` |
| 20 | `spectral_frequency_to_hue_map_offset` | `195` | `0` | да | `value_anchor` |
| 21 | `dynamic_eq_threshold_offset_db` | `2` | `0` | да | `value_anchor` |
| 22 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset_scale` | `1.7000000000000002` | `1` | да | `value_anchor` |
| 23 | `transient_shaper_attack_gain_factor_offset` | `0.04` | `0` | да | `value_anchor` |
| 24 | `spectral_flatness_measure_db_offset_scale_factor` | `2.8000000000000003` | `1` | да | `value_anchor` |
| 25 | `psychoacoustic_masking_threshold_offset_db` | `0.5` | `0` | да | `value_anchor` |
| 26 | `sample_rate_base_setting_hz` | `44100` | `44100` | нет | `default` |
| 27 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `not_generated` |
| 28 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset_scale_factor` | `1.7000000000000002` | `1` | да | `value_anchor` |
| 29 | `liquid_scratch_pitch_lfo_sine_wave_phase_offset_deg` | `195` | `90` | да | `value_anchor` |
| 30 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset` | `0.05` | `0` | да | `value_anchor` |

### Тест 7 · Top-K 50

Запрос: `Set stereo_width_coefficient_ratio to 1.6`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.6`
Найдена: **да**; результат: `1.6`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **44**, осталось default **6**. Время: 4.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.6` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.56` | `1` | да | `value_anchor` |
| 3 | `spatial_width_frequency_dependent_amount` | `0.77` | `0` | да | `value_anchor` |
| 4 | `mono_to_stereo_width_percent` | `157` | `100` | да | `value_anchor` |
| 5 | `granular_grain_stereo_width_spread_ratio` | `0.78` | `0.5` | да | `value_anchor` |
| 6 | `stereo_width_expansion_ratio` | `1.56` | `1` | да | `value_anchor` |
| 7 | `dynamic_stereo_width_modulation_depth` | `79` | `0` | да | `value_anchor` |
| 8 | `multiband_stereo_width_low_frequency` | `1.59` | `0` | да | `value_anchor` |
| 9 | `spatial_width_compensation_frequency` | `7745` | `500` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `160` | `150` | да | `value_anchor` |
| 11 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.6` | `0.8` | да | `value_anchor` |
| 12 | `grain_cloud_spread_stereo_width` | `156` | `100` | да | `value_anchor` |
| 13 | `multitap_delay_cross_quadrature_phase_offset_deg` | `185` | `90` | да | `value_anchor` |
| 14 | `organic_granulation_spray_stereo_width_ratio` | `0.77` | `0.2` | да | `value_anchor` |
| 15 | `phase_manipulation_haas_effect_delay_offset` | `20.1` | `15` | да | `value_anchor` |
| 16 | `simple_compressor_ratio_setting` | `4:1` | `4:1` | нет | `default` |
| 17 | `sub_bass_stereo_decorrelation_index` | `0.23` | `0` | да | `value_anchor` |
| 18 | `spectral_shaping_target_curve_preset` | `pink_noise_balance` | `pink_noise_balance` | нет | `default` |
| 19 | `spectral_flatness_measure_db_scale_factor_offset` | `0.01` | `0` | да | `value_anchor` |
| 20 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale` | `1.5` | `1` | да | `value_anchor` |
| 21 | `spectral_masking_psychoacoustic_threshold_offset` | `0.2` | `0` | да | `value_anchor` |
| 22 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `not_generated` |
| 23 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `187` | `90` | да | `value_anchor` |
| 24 | `spectral_flatness_measure_db_scale_factor_offset_scale` | `1.55` | `1` | да | `value_anchor` |
| 25 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale_factor` | `1.5` | `1` | да | `value_anchor` |
| 26 | `spectral_flatness_measure_db_scale_factor_offset_scale_factor` | `2.6` | `1` | да | `value_anchor` |
| 27 | `sample_rate_base_setting_hz` | `44100` | `44100` | нет | `default` |
| 28 | `haas_effect_delay_offset_ms` | `20` | `12` | да | `value_anchor` |
| 29 | `sub_bass_phase_alignment_offset_degrees_scale` | `1.05` | `1` | да | `value_anchor` |
| 30 | `reverb_modulation_stereo_phase_offset` | `179.8` | `0` | да | `value_anchor` |
| 31 | `spectral_flatness_measure_db_offset_scale` | `2.6` | `1` | да | `value_anchor` |
| 32 | `sub_bass_phase_alignment_offset_ms_scale` | `2.7` | `1` | да | `value_anchor` |
| 33 | `transient_shaper_attack_gain_db_offset_scale` | `1.5` | `1` | да | `value_anchor` |
| 34 | `analog_tape_head_gap_loss_high_frequency_phase_offset_decay_rate_scaling_mode_type` | `Fixed` | `Fixed` | нет | `not_generated` |
| 35 | `sub_bass_phase_alignment_offset_time_us_scale_factor_offset_scale_factor` | `2.6500000000000004` | `1` | да | `value_anchor` |
| 36 | `sub_bass_phase_alignment_offset_time_us_scale_factor_offset_scale` | `1.6` | `1` | да | `value_anchor` |
| 37 | `dynamic_eq_threshold_offset_db` | `0` | `0` | нет | `value_anchor` |
| 38 | `spectral_frequency_to_hue_map_offset` | `180` | `0` | да | `value_anchor` |
| 39 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `-0.30000000000000004` | `0` | да | `value_anchor` |
| 40 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1.5` | `1` | да | `value_anchor` |
| 41 | `organic_granulation_spray_pan_width_ratio` | `0.22` | `0.5` | да | `value_anchor` |
| 42 | `reverb_late_reflection_density_growth_ms_scale_factor_offset_scale` | `1.6` | `1` | да | `value_anchor` |
| 43 | `collaboration_sync_offset_allowance` | `255` | `20` | да | `value_anchor` |
| 44 | `spatial_bass_mono_crossover_hz` | `128` | `120` | да | `value_anchor` |
| 45 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `-0.02` | `0` | да | `value_anchor` |
| 46 | `spatial_center_channel_extraction_gain_db` | `-47` | `0` | да | `value_anchor` |
| 47 | `midside_mid_gain_attenuation` | `-17.8` | `0` | да | `value_anchor` |
| 48 | `sub_bass_phase_alignment_offset_time_us_scale` | `2.7` | `1` | да | `value_anchor` |
| 49 | `omega_phase_3_vector_convolve_interchannel_offset_ms` | `50.5` | `14.5` | да | `value_anchor` |
| 50 | `sub_bass_phase_alignment_offset_degrees` | `7` | `0` | да | `value_anchor` |

### Тест 8 · Top-K 5

Запрос: `Установи acoustic_feature_attack_density на 0.18`

Цель: `acoustic_feature_attack_density` → ожидалось `0.18`
Найдена: **да**; результат: `0.18`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **0**. Время: 3.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.18` | `0.5` | да | `numeric` |
| 2 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.51` | `0.3` | да | `value_anchor` |
| 3 | `a5_adapt_density_high_noise_smoothing_decay` | `0.52` | `0.85` | да | `value_anchor` |
| 4 | `adapt_density_sigma_threshold_trigger` | `0.53` | `0.3` | да | `value_anchor` |
| 5 | `adapt_density_lambda_decay_factor` | `1.05` | `0.85` | да | `value_anchor` |

### Тест 9 · Top-K 8

Запрос: `Установи basic_amplitude_envelope_attack_ms ровно 1250 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `1250`
Найдена: **да**; результат: `1250`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **0**. Время: 2.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `1250` | `10` | да | `numeric` |
| 2 | `envelope_generator_attack_time_ms` | `4833.8` | `10` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `97.5` | `5` | да | `value_anchor` |
| 4 | `envelope_follower_attack_time_ms` | `244.10000000000002` | `10` | да | `value_anchor` |
| 5 | `basic_amplitude_envelope_release_ms` | `5410` | `200` | да | `value_anchor` |
| 6 | `dynamic_envelope_follower_attack_time_ms` | `243.4` | `10` | да | `value_anchor` |
| 7 | `attack_min_ms` | `542` | `10` | да | `value_anchor` |
| 8 | `basic_adsr_decay_time_ms` | `2730` | `200` | да | `value_anchor` |

### Тест 10 · Top-K 12

Запрос: `Установи spectral_smoothing_attack_time ровно 155 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `155.0`
Найдена: **да**; результат: `155`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **12**, осталось default **0**. Время: 2.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `155` | `2` | да | `numeric` |
| 2 | `envelope_follower_attack_time_ms` | `243.70000000000002` | `10` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `97.30000000000001` | `5` | да | `value_anchor` |
| 4 | `envelope_generator_attack_time_ms` | `4830.6` | `10` | да | `value_anchor` |
| 5 | `envelope_follow_smoothing_time_ms` | `259.8` | `10` | да | `value_anchor` |
| 6 | `noise_gate_attack_time_ms` | `51.79` | `1` | да | `value_anchor` |
| 7 | `dynamic_envelope_follower_attack_time_ms` | `243` | `10` | да | `value_anchor` |
| 8 | `filter_cutoff_tracking_smoothing_ms` | `268.3` | `20` | да | `value_anchor` |
| 9 | `lfo_smoothing_time_ms` | `271.6` | `0` | да | `value_anchor` |
| 10 | `dynamic_equalizer_attack_time_ms` | `243.3` | `10` | да | `value_anchor` |
| 11 | `liquid_scratch_transient_envelope_fade_in_ms` | `130` | `100` | да | `value_anchor` |
| 12 | `attack_min_ms` | `540` | `10` | да | `value_anchor` |

### Тест 11 · Top-K 20

Запрос: `Установи resonant_body_excitation_attack_damping на 0.08`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.08`
Найдена: **да**; результат: `0.08`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **19**, осталось default **1**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.08` | `0.3` | да | `numeric` |
| 2 | `acoustic_room_mode_damping` | `0.526` | `0.2` | да | `value_anchor` |
| 3 | `acoustic_coupling_resonance_transfer_speed` | `470` | `100` | да | `value_anchor` |
| 4 | `additive_partial_amplitude_envelope_decay` | `4970` | `500` | да | `value_anchor` |
| 5 | `acoustic_ray_tracing_bounce_count` | `25` | `10` | да | `value_anchor` |
| 6 | `adaptive_notch_filter_q` | `25` | `15` | да | `value_anchor` |
| 7 | `acoustic_structural_resonance_q_factor` | `49.7` | `5` | да | `value_anchor` |
| 8 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.024900000000000002` | `0.005` | да | `value_anchor` |
| 9 | `additive_partial_phase_randomization_seed` | `464073` | `0` | да | `value_anchor` |
| 10 | `adapt_density_sigma_threshold_trigger` | `0.51` | `0.3` | да | `value_anchor` |
| 11 | `adaptive_filter_adaptation_memory` | `0.49` | `0.5` | да | `value_anchor` |
| 12 | `additive_synthesis_partial_count_limit` | `127` | `32` | да | `value_anchor` |
| 13 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.49` | `0.3` | да | `value_anchor` |
| 14 | `acoustic_resonance_damping_factor` | `0.53` | `0.3` | да | `value_anchor` |
| 15 | `additive_partial_frequency_jitter_std_dev` | `48.400000000000006` | `0` | да | `value_anchor` |
| 16 | `adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `value_anchor` |
| 17 | `algorithmic_reverb_decay_time_seconds` | `15.5` | `2.5` | да | `value_anchor` |
| 18 | `a5_adapt_density_high_noise_smoothing_decay` | `0.5` | `0.85` | да | `value_anchor` |
| 19 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_rate_hz` | `50.400000000000006` | `5` | да | `value_anchor` |
| 20 | `acoustic_feature_attack_density` | `0.47000000000000003` | `0.5` | да | `value_anchor` |

### Тест 12 · Top-K 30

Запрос: `Установи stereo_width_chorus_flanger_depth на 0.15`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.15`
Найдена: **да**; результат: `0.15000000000000002`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **29**, осталось default **1**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.15000000000000002` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.6` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `160` | `150` | да | `value_anchor` |
| 4 | `stereo_width_expansion_coefficient` | `1.54` | `1` | да | `value_anchor` |
| 5 | `mono_to_stereo_width_percent` | `156` | `100` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `78` | `0` | да | `value_anchor` |
| 7 | `granular_grain_stereo_width_spread_ratio` | `0.77` | `0.5` | да | `value_anchor` |
| 8 | `multiband_stereo_width_low_frequency` | `1.58` | `0` | да | `value_anchor` |
| 9 | `spatial_width_frequency_dependent_amount` | `0.77` | `0` | да | `value_anchor` |
| 10 | `stereo_width_coefficient_ratio` | `0.34` | `1` | да | `value_anchor` |
| 11 | `grain_cloud_spread_stereo_width` | `155` | `100` | да | `value_anchor` |
| 12 | `midside_mid_gain_attenuation` | `-18.8` | `0` | да | `value_anchor` |
| 13 | `spatial_width_compensation_frequency` | `7769` | `500` | да | `value_anchor` |
| 14 | `spatial_center_channel_extraction_gain_db` | `-49` | `0` | да | `value_anchor` |
| 15 | `sub_bass_stereo_decorrelation_index` | `0.19` | `0` | да | `value_anchor` |
| 16 | `stereo_width_expansion_ratio` | `1.56` | `1` | да | `value_anchor` |
| 17 | `spatial_bass_mono_crossover_hz` | `114` | `120` | да | `value_anchor` |
| 18 | `vibe_intergalactic_haas_effect_stereo_delay_ms` | `11` | `12` | да | `value_anchor` |
| 19 | `adaptive_masking_suppression_depth` | `48` | `0` | да | `value_anchor` |
| 20 | `phase_correlation_target` | `-0.05` | `0.7` | да | `value_anchor` |
| 21 | `synth_unison_stereo_phase_spread` | `162` | `90` | да | `value_anchor` |
| 22 | `organic_granulation_spray_stereo_width_ratio` | `0.78` | `0.2` | да | `value_anchor` |
| 23 | `vibe_space_station_metallic_lf_damping_hz` | `2000` | `2000` | нет | `value_anchor` |
| 24 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.48` | `0.9` | да | `value_anchor` |
| 25 | `dynamics_envelope_stereo_link` | `47` | `100` | да | `value_anchor` |
| 26 | `granular_pan_spray_width` | `46` | `50` | да | `value_anchor` |
| 27 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.0239` | `0.005` | да | `value_anchor` |
| 28 | `adaptive_eq_band_centre_modulation` | `0.45` | `0.5` | да | `value_anchor` |
| 29 | `dissolution_process_s15_happening_equivalence` | `0.53` | `0.99` | да | `value_anchor` |
| 30 | `interaural_intensity_difference` | `-2.9000000000000004` | `0` | да | `value_anchor` |

### Тест 13 · Top-K 50

Запрос: `Установи psychoacoustic_loudness_sharpness_ratio на 0.2`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `0.2`
Найдена: **да**; результат: `0.2`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **48**, осталось default **2**. Время: 4.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `0.2` | `0.3` | да | `numeric` |
| 2 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.52` | `0.9` | да | `value_anchor` |
| 3 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.51` | `0.3` | да | `value_anchor` |
| 4 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.026000000000000002` | `0.005` | да | `value_anchor` |
| 5 | `acoustic_feature_roughness_index` | `0.48` | `0.3` | да | `value_anchor` |
| 6 | `algorithmic_markov_rhythmic_accent_velocity_ratio` | `1.97` | `1.25` | да | `value_anchor` |
| 7 | `adapt_density_sigma_threshold_trigger` | `0.53` | `0.3` | да | `value_anchor` |
| 8 | `a5_adapt_density_high_noise_smoothing_decay` | `0.52` | `0.85` | да | `value_anchor` |
| 9 | `adaptive_masking_suppression_depth` | `51` | `0` | да | `value_anchor` |
| 10 | `ai_hallucination_bias_spectral_entropy` | `0.5` | `0.15` | да | `value_anchor` |
| 11 | `adaptive_loudness_time_constant` | `4.94` | `0.3` | да | `value_anchor` |
| 12 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.53` | `0.85` | да | `value_anchor` |
| 13 | `additive_synthesis_partial_count_limit` | `132` | `32` | да | `value_anchor` |
| 14 | `acoustic_ray_tracing_air_absorption_humidity_factor` | `0.53` | `0.5` | да | `value_anchor` |
| 15 | `adaptive_notch_filter_q` | `26` | `15` | да | `value_anchor` |
| 16 | `algorithmic_markov_pitch_entropy_ratio` | `0.51` | `0.3` | да | `value_anchor` |
| 17 | `additive_partial_frequency_jitter_std_dev` | `50.5` | `0` | да | `value_anchor` |
| 18 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_ratio` | `0.54` | `0.1` | да | `value_anchor` |
| 19 | `air_absorption_hf_dampening_distance_meters` | `51.5` | `10` | да | `value_anchor` |
| 20 | `acoustic_feature_timbral_brightness` | `0.49` | `0.5` | да | `value_anchor` |
| 21 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_ms` | `517` | `50` | да | `value_anchor` |
| 22 | `additive_synthesis_noise_blur_amount` | `50` | `0` | да | `value_anchor` |
| 23 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_rate_hz` | `52.6` | `5` | да | `value_anchor` |
| 24 | `algorithmic_markov_pitch_class_entropy_decay_ms` | `1045` | `100` | да | `value_anchor` |
| 25 | `ai_section_boundary_hysteresis_window_bars` | `4.5` | `2` | да | `value_anchor` |
| 26 | `acceleration_harshness_boil_hole_threshold` | `766` | `75` | да | `value_anchor` |
| 27 | `additive_partial_amplitude_envelope_decay` | `5190` | `500` | да | `value_anchor` |
| 28 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_factor` | `5.2` | `1` | да | `value_anchor` |
| 29 | `acoustic_sound_speed_temperature_scaling` | `1.006` | `1` | да | `value_anchor` |
| 30 | `algorithmic_markov_pitch_class_entropy_scaling_factor` | `2.5100000000000002` | `1` | да | `value_anchor` |
| 31 | `algorithmic_markov_pitch_duration_correlation_ratio` | `0.51` | `0` | да | `value_anchor` |
| 32 | `aliasing_filter_steepness` | `24` | `24` | нет | `value_anchor` |
| 33 | `adaptive_eq_automation_intensity` | `0.49` | `0.5` | да | `value_anchor` |
| 34 | `acoustic_shadowing_pinna_notch_frequency` | `8200` | `8000` | да | `value_anchor` |
| 35 | `algorithmic_step_probability_decay_rate` | `0.54` | `0.1` | да | `value_anchor` |
| 36 | `envelope_generator_sustain_level_ratio` | `0.51` | `0.7` | да | `value_anchor` |
| 37 | `acoustic_feature_attack_density` | `0.49` | `0.5` | да | `value_anchor` |
| 38 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_slope_db_per_ms` | `12.600000000000001` | `3` | да | `value_anchor` |
| 39 | `algorithmic_markov_rhythmic_syncopation_probability_exponent` | `2.0500000000000003` | `1` | да | `value_anchor` |
| 40 | `adaptive_density_rho_increment_step` | `0.06` | `0.05` | да | `value_anchor` |
| 41 | `acoustic_ray_tracing_bounce_count` | `26` | `10` | да | `value_anchor` |
| 42 | `algorithmic_markov_rhythmic_accent_decay_ms` | `259` | `20` | да | `value_anchor` |
| 43 | `acoustic_turbulence_intensity_amount` | `0.47000000000000003` | `0.2` | да | `value_anchor` |
| 44 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 45 | `ai_hallucination_boundary_bias` | `0.49` | `0.15` | да | `value_anchor` |
| 46 | `algorithmic_composition_entropy_level` | `0.5` | `0.1` | да | `value_anchor` |
| 47 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_ms` | `1050` | `100` | да | `value_anchor` |
| 48 | `algorithmic_markov_rhythmic_syncopation_decay_ms` | `528` | `100` | да | `value_anchor` |
| 49 | `acoustic_shadow_occlusion_filter_freq_hz` | `10745` | `800` | да | `value_anchor` |
| 50 | `algorithmic_melody_leap_probability_ratio` | `0.51` | `0.15` | да | `value_anchor` |

### Тест 14 · Top-K 3

Запрос: `Установи stereo_width_coefficient_ratio на 0.35`

Цель: `stereo_width_coefficient_ratio` → ожидалось `0.35`
Найдена: **да**; результат: `0.35000000000000003`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **0**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `0.35000000000000003` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.55` | `1` | да | `value_anchor` |
| 3 | `granular_grain_stereo_width_spread_ratio` | `0.78` | `0.5` | да | `value_anchor` |

### Тест 15 · Top-K 8

Запрос: `acoustic_feature_attack_density: 0.93`

Цель: `acoustic_feature_attack_density` → ожидалось `0.93`
Найдена: **да**; результат: `0.93`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **0**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.93` | `0.5` | да | `numeric` |
| 2 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.51` | `0.3` | да | `value_anchor` |
| 3 | `ai_hallucination_bias_spectral_entropy` | `0.5` | `0.15` | да | `value_anchor` |
| 4 | `a5_adapt_density_high_noise_smoothing_decay` | `0.52` | `0.85` | да | `value_anchor` |
| 5 | `adaptive_masking_suppression_depth` | `52` | `0` | да | `value_anchor` |
| 6 | `adapt_density_sigma_threshold_trigger` | `0.53` | `0.3` | да | `value_anchor` |
| 7 | `ai_hallucination_boundary_bias` | `0.5` | `0.15` | да | `value_anchor` |
| 8 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.53` | `0.85` | да | `value_anchor` |

### Тест 16 · Top-K 12

Запрос: `basic_amplitude_envelope_attack_ms: 80`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `80`
Найдена: **да**; результат: `80`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **4**. Время: 2.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `80` | `10` | да | `numeric` |
| 2 | `additive_partial_amplitude_envelope_decay` | `5360` | `500` | да | `value_anchor` |
| 3 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `value_anchor` |
| 4 | `samapana_resolution_exponential_decay_half_life_ms` | `5550` | `2500` | да | `value_anchor` |
| 5 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.53` | `0.3` | да | `value_anchor` |
| 6 | `reverb_perceptual_clarity_index_c80_db` | `3.6` | `2` | да | `value_anchor` |
| 7 | `additive_synthesis_partial_count_limit` | `136` | `32` | да | `value_anchor` |
| 8 | `liquid_scratch_paulstretch_time_stretch_max_percent` | `600` | `600` | нет | `value_anchor` |
| 9 | `metric_velocity_v_threshold_ms` | `110` | `80` | да | `value_anchor` |
| 10 | `a5_adapt_density_high_noise_smoothing_decay` | `0.53` | `0.85` | да | `value_anchor` |
| 11 | `vibe_monkey_zoo_portamento_glide_randomness_ms` | `55` | `55` | нет | `value_anchor` |
| 12 | `vibe_monkey_zoo_portamento_glide_randomness` | `55` | `55` | нет | `value_anchor` |

### Тест 17 · Top-K 20

Запрос: `spectral_smoothing_attack_time: 12.5`

Цель: `spectral_smoothing_attack_time` → ожидалось `12.5`
Найдена: **да**; результат: `12.5`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **14**, осталось default **6**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `12.5` | `2` | да | `numeric` |
| 2 | `spectral_entropy_variance_kappa_threshold_floor` | `0.0257` | `0.001` | да | `value_anchor` |
| 3 | `spectral_entropy_variance_kappa_scale` | `0.51` | `0.12` | да | `value_anchor` |
| 4 | `metric_d_noise_sensitivity_kappa` | `0.26` | `0.12` | да | `value_anchor` |
| 5 | `omega_synthesis_d_metric_kappa_noise_weight` | `0.12` | `0.12` | нет | `value_anchor` |
| 6 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.51` | `0.3` | да | `value_anchor` |
| 7 | `filter_slope_db_per_octave` | `12` | `12` | нет | `not_generated` |
| 8 | `sidechain_resonance_target_frequency` | `10226` | `220` | да | `value_anchor` |
| 9 | `crossover_slope_attenuation_db_octave` | `24` | `24` | нет | `default` |
| 10 | `comb_array_allpass_diffusion_stage_count` | `4` | `4` | нет | `default` |
| 11 | `a5_adapt_density_high_noise_smoothing_decay` | `0.52` | `0.85` | да | `value_anchor` |
| 12 | `adapt_density_sigma_threshold_trigger` | `0.53` | `0.3` | да | `value_anchor` |
| 13 | `xenharmonic_periodicity_block_size` | `25` | `12` | да | `value_anchor` |
| 14 | `fft_window_size_selection` | `2048` | `2048` | нет | `default` |
| 15 | `additive_partial_phase_randomization_seed` | `477765` | `0` | да | `value_anchor` |
| 16 | `acoustic_feature_attack_density` | `0.48` | `0.5` | да | `value_anchor` |
| 17 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.53` | `0.85` | да | `value_anchor` |
| 18 | `microtonal_division_steps_per_octave` | `55` | `12` | да | `value_anchor` |
| 19 | `vibe_simulation_glitch_bitcrusher_downsample_bits` | `8-bit` | `8-bit` | нет | `default` |
| 20 | `samapana_resolution_exponential_decay_half_life_ms` | `5400` | `2500` | да | `value_anchor` |

### Тест 18 · Top-K 30

Запрос: `resonant_body_excitation_attack_damping: 0.67`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.67`
Найдена: **да**; результат: `0.67`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **29**, осталось default **1**. Время: 3.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.67` | `0.3` | да | `numeric` |
| 2 | `acoustic_coupling_resonance_transfer_speed` | `510` | `100` | да | `value_anchor` |
| 3 | `additive_partial_phase_randomization_seed` | `490721` | `0` | да | `value_anchor` |
| 4 | `additive_partial_amplitude_envelope_decay` | `5270` | `500` | да | `value_anchor` |
| 5 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.52` | `0.3` | да | `value_anchor` |
| 6 | `adaptive_notch_filter_q` | `26.5` | `15` | да | `value_anchor` |
| 7 | `acoustic_feature_attack_density` | `0.49` | `0.5` | да | `value_anchor` |
| 8 | `acoustic_ray_tracing_bounce_count` | `26` | `10` | да | `value_anchor` |
| 9 | `acoustic_room_mode_damping` | `0.556` | `0.2` | да | `value_anchor` |
| 10 | `adaptive_filter_adaptation_memory` | `0.52` | `0.5` | да | `value_anchor` |
| 11 | `additive_partial_frequency_jitter_std_dev` | `51.300000000000004` | `0` | да | `value_anchor` |
| 12 | `air_absorption_hf_dampening_distance_meters` | `52.5` | `10` | да | `value_anchor` |
| 13 | `acceleration_harshness_boil_decay` | `411` | `35` | да | `value_anchor` |
| 14 | `algorithmic_markov_rhythmic_syncopation_decay_ms` | `538` | `100` | да | `value_anchor` |
| 15 | `additive_synthesis_partial_count_limit` | `134` | `32` | да | `value_anchor` |
| 16 | `adapt_density_sigma_threshold_trigger` | `0.54` | `0.3` | да | `value_anchor` |
| 17 | `adaptive_filter_adaptation_sensitivity` | `0.51` | `0.5` | да | `value_anchor` |
| 18 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `value_anchor` |
| 19 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.0263` | `0.005` | да | `value_anchor` |
| 20 | `acoustic_structural_resonance_q_factor` | `52.400000000000006` | `5` | да | `value_anchor` |
| 21 | `adapt_density_lambda_decay_factor` | `1.05` | `0.85` | да | `value_anchor` |
| 22 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_ms` | `1069` | `100` | да | `value_anchor` |
| 23 | `algorithmic_markov_rhythmic_syncopation_probability_exponent` | `2.1` | `1` | да | `value_anchor` |
| 24 | `algorithmic_reverb_decay_time_seconds` | `16.2` | `2.5` | да | `value_anchor` |
| 25 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_ms` | `525` | `50` | да | `value_anchor` |
| 26 | `acoustic_structural_loss_factor_frequency_exponent` | `1.05` | `0.5` | да | `value_anchor` |
| 27 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.54` | `0.85` | да | `value_anchor` |
| 28 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.54` | `0.35` | да | `value_anchor` |
| 29 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_rate_hz` | `53.400000000000006` | `5` | да | `value_anchor` |
| 30 | `aesthetic_axis_organic_mechanical` | `0.07` | `0` | да | `value_anchor` |

### Тест 19 · Top-K 50

Запрос: `stereo_width_chorus_flanger_depth: 0.40`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.4`
Найдена: **да**; результат: `0.4`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **46**, осталось default **4**. Время: 4.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.4` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.6` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `160` | `150` | да | `value_anchor` |
| 4 | `stereo_width_expansion_coefficient` | `1.57` | `1` | да | `value_anchor` |
| 5 | `mono_to_stereo_width_percent` | `158` | `100` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `79` | `0` | да | `value_anchor` |
| 7 | `granular_grain_stereo_width_spread_ratio` | `0.79` | `0.5` | да | `value_anchor` |
| 8 | `gamma_40hz_binaural_carrier_pan_modulation_speed` | `4.8` | `0.2` | да | `value_anchor` |
| 9 | `multiband_stereo_width_low_frequency` | `1.6` | `0` | да | `value_anchor` |
| 10 | `spatial_width_frequency_dependent_amount` | `0.78` | `0` | да | `value_anchor` |
| 11 | `stereo_width_coefficient_ratio` | `0.38` | `1` | да | `value_anchor` |
| 12 | `gamma_40hz_isochronic_pulse_duty_cycle_precision` | `48` | `50` | да | `value_anchor` |
| 13 | `grain_cloud_spread_stereo_width` | `157` | `100` | да | `value_anchor` |
| 14 | `gamma_band_40hz_phase_locking_value_plv` | `0.48` | `0.85` | да | `value_anchor` |
| 15 | `midside_mid_gain_attenuation` | `-18.3` | `0` | да | `value_anchor` |
| 16 | `spatial_center_channel_extraction_gain_db` | `-47.5` | `0` | да | `value_anchor` |
| 17 | `sub_bass_stereo_decorrelation_index` | `0.21` | `0` | да | `value_anchor` |
| 18 | `spatial_width_compensation_frequency` | `7888` | `500` | да | `value_anchor` |
| 19 | `stereo_width_expansion_ratio` | `1.57` | `1` | да | `value_anchor` |
| 20 | `spatial_bass_mono_crossover_hz` | `124` | `120` | да | `value_anchor` |
| 21 | `gamma_band_40hz_coherence_alignment` | `0.47000000000000003` | `0.4` | да | `value_anchor` |
| 22 | `liquid_scratch_paulstretch_time_stretch_max_percent` | `600` | `600` | нет | `value_anchor` |
| 23 | `additive_synthesis_partial_count_limit` | `129` | `32` | да | `value_anchor` |
| 24 | `adaptive_masking_suppression_depth` | `50` | `0` | да | `value_anchor` |
| 25 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.51` | `0.9` | да | `value_anchor` |
| 26 | `adaptive_eq_band_centre_modulation` | `0.48` | `0.5` | да | `value_anchor` |
| 27 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.0252` | `0.005` | да | `value_anchor` |
| 28 | `organic_granulation_spray_stereo_width_ratio` | `0.78` | `0.2` | да | `value_anchor` |
| 29 | `adaptive_eq_band_count` | `31` | `8` | да | `value_anchor` |
| 30 | `glottal_closure_harmonic_overtone_boost_dB` | `11.5` | `6` | да | `value_anchor` |
| 31 | `fft_window_size_selection` | `2048` | `2048` | нет | `default` |
| 32 | `additive_partial_amplitude_envelope_decay` | `5050` | `500` | да | `value_anchor` |
| 33 | `air_column_turbulence_noise_level` | `0.51` | `0.1` | да | `value_anchor` |
| 34 | `additive_partial_frequency_jitter_std_dev` | `49.1` | `0` | да | `value_anchor` |
| 35 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 36 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.2` | `0.5` | да | `value_anchor` |
| 37 | `sruti_microtonal_pitch_glide_smoothing_ms` | `255` | `40` | да | `value_anchor` |
| 38 | `validation_tempo_bpm_strictness_bound` | `154` | `147` | да | `value_anchor` |
| 39 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.52` | `0.85` | да | `value_anchor` |
| 40 | `liquid_scratch_paulstretch_grain_size_ms` | `200` | `200` | нет | `value_anchor` |
| 41 | `adaptive_eq_automation_intensity` | `0.48` | `0.5` | да | `value_anchor` |
| 42 | `ai_hallucination_bias_spectral_entropy` | `0.49` | `0.15` | да | `value_anchor` |
| 43 | `acoustic_ray_tracing_bounce_count` | `25` | `10` | да | `value_anchor` |
| 44 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.5` | `0.3` | да | `value_anchor` |
| 45 | `gamaka_pitch_bend_attack_inertia_ms` | `100` | `35` | да | `value_anchor` |
| 46 | `a3_sruti_polyphonic_isotropic_mix` | `0.5` | `0` | да | `value_anchor` |
| 47 | `air_absorption_hf_dampening_distance_meters` | `50.5` | `10` | да | `value_anchor` |
| 48 | `a5_adapt_density_high_noise_smoothing_decay` | `0.5` | `0.85` | да | `value_anchor` |
| 49 | `glottal_pulse_subharmonic_bloom_onset_delay_ms` | `102` | `20` | да | `value_anchor` |
| 50 | `binaural_beat_gamma_frequency_offset` | `28.3` | `40` | да | `value_anchor` |

### Тест 20 · Top-K 100

Запрос: `stereo_width_coefficient_ratio: 1.85`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.85`
Найдена: **да**; результат: `1.85`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **87**, осталось default **13**. Время: 5.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.85` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.57` | `1` | да | `value_anchor` |
| 3 | `mono_to_stereo_width_percent` | `158` | `100` | да | `value_anchor` |
| 4 | `granular_grain_stereo_width_spread_ratio` | `0.78` | `0.5` | да | `value_anchor` |
| 5 | `spatial_width_frequency_dependent_amount` | `0.78` | `0` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `79` | `0` | да | `value_anchor` |
| 7 | `multiband_stereo_width_low_frequency` | `1.6` | `0` | да | `value_anchor` |
| 8 | `stereo_width_expansion_ratio` | `1.56` | `1` | да | `value_anchor` |
| 9 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `160` | `150` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.6` | `0.8` | да | `value_anchor` |
| 11 | `grain_cloud_spread_stereo_width` | `157` | `100` | да | `value_anchor` |
| 12 | `spatial_width_compensation_frequency` | `7874` | `500` | да | `value_anchor` |
| 13 | `organic_granulation_spray_stereo_width_ratio` | `0.78` | `0.2` | да | `value_anchor` |
| 14 | `sub_bass_stereo_decorrelation_index` | `0.19` | `0` | да | `value_anchor` |
| 15 | `midside_mid_gain_attenuation` | `-18.8` | `0` | да | `value_anchor` |
| 16 | `spatial_center_channel_extraction_gain_db` | `-49` | `0` | да | `value_anchor` |
| 17 | `spatial_bass_mono_crossover_hz` | `115` | `120` | да | `value_anchor` |
| 18 | `organic_granulation_spray_pan_width_ratio` | `0.19` | `0.5` | да | `value_anchor` |
| 19 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.18` | `0.5` | да | `value_anchor` |
| 20 | `adapt_density_lambda_decay_factor` | `1` | `0.85` | да | `value_anchor` |
| 21 | `omega_axiom_a5_adapt_density_decay_exponent` | `2.5` | `0.85` | да | `value_anchor` |
| 22 | `omega_synthesis_adaptive_density_lambda_constant` | `0.85` | `0.85` | нет | `value_anchor` |
| 23 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.0245` | `0.005` | да | `value_anchor` |
| 24 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.49` | `0.9` | да | `value_anchor` |
| 25 | `aesthetic_axis_organic_mechanical` | `-0.01` | `0` | да | `value_anchor` |
| 26 | `adaptive_masking_suppression_depth` | `49` | `0` | да | `value_anchor` |
| 27 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.5` | `0.85` | да | `value_anchor` |
| 28 | `acoustic_shadowing_pinna_notch_frequency` | `7900` | `8000` | да | `value_anchor` |
| 29 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.48` | `0.3` | да | `value_anchor` |
| 30 | `drop_impact_timing_position` | `phi_62pct` | `phi_62pct` | нет | `default` |
| 31 | `acoustic_radiation_pattern_directivity` | `omnidirectional` | `omnidirectional` | нет | `default` |
| 32 | `acoustic_ray_tracing_early_to_late_reflection_cross_time_ms` | `101` | `80` | да | `value_anchor` |
| 33 | `acoustic_ray_tracing_bounce_count` | `24` | `10` | да | `value_anchor` |
| 34 | `air_absorption_hf_dampening_distance_meters` | `49` | `10` | да | `value_anchor` |
| 35 | `additive_partial_amplitude_envelope_decay` | `4900` | `500` | да | `value_anchor` |
| 36 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `not_generated` |
| 37 | `adaptive_eq_band_count` | `30` | `8` | да | `value_anchor` |
| 38 | `spatial_binaural_azimuth_angle_scale` | `0.35000000000000003` | `1` | да | `value_anchor` |
| 39 | `l6_spontaneous_consciousness_index` | `0.74` | `0.85` | да | `value_anchor` |
| 40 | `adapt_density_sigma_threshold_trigger` | `0.51` | `0.3` | да | `value_anchor` |
| 41 | `adaptive_notch_filter_q` | `24.5` | `15` | да | `value_anchor` |
| 42 | `acoustic_ray_tracing_specular_to_diffuse_scattering_ratio` | `0.49` | `0.5` | да | `value_anchor` |
| 43 | `adaptive_eq_automation_intensity` | `0.46` | `0.5` | да | `value_anchor` |
| 44 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 45 | `analog_tape_head_gap_loss_high_frequency_phase_offset_decay_rate_scaling_mode_type` | `Fixed` | `Fixed` | нет | `not_generated` |
| 46 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `4.800000000000001` | `0.707` | да | `value_anchor` |
| 47 | `ai_hallucination_bias_spectral_entropy` | `0.47000000000000003` | `0.15` | да | `value_anchor` |
| 48 | `additive_partial_frequency_jitter_std_dev` | `47.7` | `0` | да | `value_anchor` |
| 49 | `analog_tape_head_gap_azimuth_alignment_mode` | `perfect_alignment` | `perfect_alignment` | нет | `not_generated` |
| 50 | `a5_adapt_density_high_noise_smoothing_decay` | `0.49` | `0.85` | да | `value_anchor` |
| 51 | `additive_synthesis_partial_count_limit` | `125` | `32` | да | `value_anchor` |
| 52 | `a5_adapt_density_lambda_smoothing_coefficient` | `1.03` | `0.85` | да | `value_anchor` |
| 53 | `acoustic_ray_tracing_scattering_coefficient` | `0.49` | `0.3` | да | `value_anchor` |
| 54 | `acoustic_shadow_wall_absorption_ratio` | `0.509` | `0.95` | да | `value_anchor` |
| 55 | `adaptive_eq_learning_bias_curve` | `balanced` | `balanced` | нет | `default` |
| 56 | `adaptive_eq_band_width_modulation` | `0.47000000000000003` | `0.5` | да | `value_anchor` |
| 57 | `acoustic_ray_tracing_air_absorption_humidity_factor` | `0.5` | `0.5` | нет | `value_anchor` |
| 58 | `additive_subtractive_fusion_bandwidth` | `47` | `50` | да | `value_anchor` |
| 59 | `acoustic_ray_tracing_wall_absorption_coefficient` | `0.5` | `0.35` | да | `value_anchor` |
| 60 | `mmss_l6_spontaneous_consciousness_meta_observer_index` | `0.74` | `0.85` | да | `value_anchor` |
| 61 | `acoustic_ray_tracing_diffuse_reflection_order` | `4` | `4` | нет | `default` |
| 62 | `algorithmic_markov_rhythmic_accent_velocity_ratio` | `1.9100000000000001` | `1.25` | да | `value_anchor` |
| 63 | `adaptive_reverb_tail_prediction_sensitivity` | `0.48` | `0.5` | да | `value_anchor` |
| 64 | `a3_sruti_polyphonic_isotropic_mix` | `0.48` | `0` | да | `value_anchor` |
| 65 | `adaptive_eq_band_centre_modulation` | `0.46` | `0.5` | да | `value_anchor` |
| 66 | `ai_hybrid_source_b_style_extraction_depth` | `0.47000000000000003` | `0.5` | да | `value_anchor` |
| 67 | `amplitude_to_brightness_gamma_curve` | `2.4000000000000004` | `2.2` | да | `value_anchor` |
| 68 | `ai_hallucination_boundary_bias` | `0.47000000000000003` | `0.15` | да | `value_anchor` |
| 69 | `analog_noise_floor_level_db` | `-75.3` | `-90` | да | `value_anchor` |
| 70 | `allpass_reverb_diffuser_density_ratio` | `0.49` | `0.7` | да | `value_anchor` |
| 71 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.5` | `0.35` | да | `value_anchor` |
| 72 | `adaptive_filter_adaptation_memory` | `0.49` | `0.5` | да | `value_anchor` |
| 73 | `allpass_filter_dispersion_allpass_stage_delay_mode` | `Exponential` | `Exponential` | нет | `not_generated` |
| 74 | `aliasing_filter_steepness` | `24` | `24` | нет | `value_anchor` |
| 75 | `algorithmic_reverb_decay_time_seconds` | `15.3` | `2.5` | да | `value_anchor` |
| 76 | `amorphous_noise_viscous_gel_friction_decay_ms` | `1010` | `300` | да | `value_anchor` |
| 77 | `air_column_turbulence_noise_level` | `0.49` | `0.1` | да | `value_anchor` |
| 78 | `a3_terminal_state_recurrence_distance_threshold` | `0.024900000000000002` | `0.00124` | да | `value_anchor` |
| 79 | `algorithmic_markov_rhythmic_syncopation_decay_ms` | `501` | `100` | да | `value_anchor` |
| 80 | `acoustic_shadow_occlusion_filter_freq_hz` | `10188` | `800` | да | `value_anchor` |
| 81 | `acceleration_harshness_boil_hole_threshold` | `723` | `75` | да | `value_anchor` |
| 82 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_ms` | `488` | `50` | да | `value_anchor` |
| 83 | `analog_tape_head_gap_loss_filter_order` | `2nd_order` | `2nd_order` | нет | `not_generated` |
| 84 | `ai_hybrid_source_a_style_extraction_depth` | `0.47000000000000003` | `0.5` | да | `value_anchor` |
| 85 | `algorithmic_step_probability_decay_rate` | `0.51` | `0.1` | да | `value_anchor` |
| 86 | `ai_section_boundary_hysteresis_window_bars` | `4` | `2` | да | `value_anchor` |
| 87 | `aesthetic_collision_ratio` | `0.46` | `0.5` | да | `value_anchor` |
| 88 | `analog_tape_head_bump_q_factor` | `2.7` | `1.2` | да | `value_anchor` |
| 89 | `adaptive_spatialization_motion_prediction_gain` | `0.46` | `0.4` | да | `value_anchor` |
| 90 | `algorithmic_markov_pitch_entropy_ratio` | `0.48` | `0.3` | да | `value_anchor` |
| 91 | `amplitude_pan_modulation_depth` | `0.47000000000000003` | `0` | да | `value_anchor` |
| 92 | `ambient_microphone_injection_gain` | `-32` | `-40` | да | `value_anchor` |
| 93 | `acoustic_near_field_distance_meters` | `2.5500000000000003` | `0.5` | да | `value_anchor` |
| 94 | `algorithmic_markov_pitch_duration_correlation_ratio` | `0.48` | `0` | да | `value_anchor` |
| 95 | `ambient_harmonic_polyrhythmic_chaotic_mix` | `0.48` | `0.15` | да | `value_anchor` |
| 96 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_ratio` | `0.51` | `0.1` | да | `value_anchor` |
| 97 | `adaptive_filter_adaptation_sensitivity` | `0.47000000000000003` | `0.5` | да | `value_anchor` |
| 98 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_ms` | `995` | `100` | да | `value_anchor` |
| 99 | `acoustic_feature_timbral_brightness` | `0.46` | `0.5` | да | `value_anchor` |
| 100 | `adaptive_filter_adaptation_speed` | `0.47000000000000003` | `0.5` | да | `value_anchor` |
