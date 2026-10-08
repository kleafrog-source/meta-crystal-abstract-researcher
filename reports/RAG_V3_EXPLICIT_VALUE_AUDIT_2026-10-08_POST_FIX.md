# Flowmusic Genesis V3 — аудит явных значений Qwen · POST_FIX

Дата: 2026-10-08T13:15:02+03:00

Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.

## Сводка

- Успешных HTTP-запросов: **20/20**
- Целевой technical_name найден: **20/20**
- Запрошенное значение выставлено правильно: **20/20**
- Все выбранные значения, отличающиеся от default: **140/476 (29.4%)**
- Среднее время запроса: **3.743 с**

## Результаты

### Тест 1 · Top-K 3

Запрос: `Set acoustic_feature_attack_density to 0.82`

Цель: `acoustic_feature_attack_density` → ожидалось `0.82`
Найдена: **да**; результат: `0.8200000000000001`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.8200000000000001` | `0.5` | да | `numeric` |
| 2 | `transient_shaper_attack_gain_db_offset` | `0` | `0` | нет | `default` |
| 3 | `pareto_front_diversity_maintenance_factor` | `0.5` | `0.5` | нет | `default` |

### Тест 2 · Top-K 5

Запрос: `Set basic_amplitude_envelope_attack_ms to 640 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `640`
Найдена: **да**; результат: `640`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **3**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `640` | `10` | да | `numeric` |
| 2 | `envelope_generator_attack_time_ms` | `9796.300000000001` | `10` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `5` | `5` | нет | `default` |
| 4 | `transient_shaper_attack_length_ms` | `15` | `15` | нет | `default` |
| 5 | `basic_amplitude_envelope_release_ms` | `200` | `200` | нет | `default` |

### Тест 3 · Top-K 8

Запрос: `Set spectral_smoothing_attack_time to 48 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `48.0`
Найдена: **да**; результат: `48`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **5**. Время: 2.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `48` | `2` | да | `numeric` |
| 2 | `spectral_bin_magnitude_smoothing_time_ms` | `493.90000000000003` | `20` | да | `value_anchor` |
| 3 | `spectral_gate_attack_time_ms` | `196.15` | `5` | да | `value_anchor` |
| 4 | `spectral_band_compression_attack_ms` | `10` | `10` | нет | `default` |
| 5 | `spectral_transient_smearing_time_ms` | `0` | `0` | нет | `default` |
| 6 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 7 | `transient_shaper_attack_length_ms` | `15` | `15` | нет | `default` |
| 8 | `spectral_smearing_time_constant_ms` | `100` | `100` | нет | `default` |

### Тест 4 · Top-K 12

Запрос: `Set resonant_body_excitation_attack_damping to 0.84`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.84`
Найдена: **да**; результат: `0.84`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **9**. Время: 3.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.84` | `0.3` | да | `numeric` |
| 2 | `transient_shaper_attack_gain_db_offset` | `11.4` | `0` | да | `value_anchor` |
| 3 | `transient_shaper_attack_gain_db_offset_scale` | `2.95` | `1` | да | `value_anchor` |
| 4 | `basic_oscillator_phase_reset_mode` | `reset_on_trigger` | `reset_on_trigger` | нет | `default` |
| 5 | `transient_shaper_attack_gain_factor_offset_scale` | `1` | `1` | нет | `default` |
| 6 | `transient_shaper_attack_gain_factor_offset` | `0` | `0` | нет | `default` |
| 7 | `physical_model_b_resonance_frequency_offset` | `0` | `0` | нет | `default` |
| 8 | `transient_shaper_attack_gain_factor_offset_scale_factor_offset` | `0` | `0` | нет | `default` |
| 9 | `multitap_delay_prime_number_tap_spacing_offset_ms` | `13.7` | `13.7` | нет | `default` |
| 10 | `vibe_voodoo_cybernetics_polyrhythm_djembe_offset_ms` | `25` | `25` | нет | `default` |
| 11 | `gamaka_oscillation_sruti_centroid_center_offset` | `0` | `0` | нет | `default` |
| 12 | `pareto_front_diversity_maintenance_factor` | `0.5` | `0.5` | нет | `default` |

### Тест 5 · Top-K 20

Запрос: `Set stereo_width_chorus_flanger_depth to 0.95`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.95`
Найдена: **да**; результат: `0.9500000000000001`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **6**, осталось default **14**. Время: 3.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.9500000000000001` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 4 | `stereo_width_expansion_coefficient` | `1.8900000000000001` | `1` | да | `value_anchor` |
| 5 | `dynamic_stereo_width_modulation_depth` | `95` | `0` | да | `value_anchor` |
| 6 | `mono_to_stereo_width_percent` | `190` | `100` | да | `value_anchor` |
| 7 | `multitap_delay_cross_quadrature_phase_offset_deg` | `90` | `90` | нет | `default` |
| 8 | `spatial_width_frequency_dependent_amount` | `0` | `0` | нет | `default` |
| 9 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `90` | `90` | нет | `default` |
| 10 | `granular_grain_stereo_width_spread_ratio` | `0.5` | `0.5` | нет | `default` |
| 11 | `cassette_wow_flutter_depth_percent` | `0.5` | `0.5` | нет | `default` |
| 12 | `multiband_stereo_width_low_frequency` | `0` | `0` | нет | `default` |
| 13 | `wavefolder_symmetry_dc_offset_bias` | `0` | `0` | нет | `default` |
| 14 | `midside_mid_gain_attenuation` | `0` | `0` | нет | `default` |
| 15 | `phase_manipulation_haas_effect_delay_offset` | `15` | `15` | нет | `default` |
| 16 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 17 | `phase_offset_modulation_depth` | `90` | `90` | нет | `default` |
| 18 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `90` | `90` | нет | `default` |
| 19 | `spatial_width_compensation_frequency` | `500` | `500` | нет | `default` |
| 20 | `pareto_front_diversity_maintenance_factor` | `0.5` | `0.5` | нет | `default` |

### Тест 6 · Top-K 30

Запрос: `Set psychoacoustic_loudness_sharpness_ratio to 1.5`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `1.5`
Найдена: **да**; результат: `1.5`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **22**. Время: 4.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `1.5` | `0.3` | да | `numeric` |
| 2 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `9.5` | `0` | да | `value_anchor` |
| 3 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `2.9000000000000004` | `1` | да | `value_anchor` |
| 4 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0.9500000000000001` | `0` | да | `value_anchor` |
| 5 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale_factor` | `2.9000000000000004` | `1` | да | `value_anchor` |
| 6 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset` | `0.47000000000000003` | `0` | да | `value_anchor` |
| 7 | `spectral_masking_psychoacoustic_threshold_offset` | `11.4` | `0` | да | `value_anchor` |
| 8 | `simple_compressor_ratio_setting` | `4:1` | `4:1` | нет | `default` |
| 9 | `spectral_flatness_measure_db_scale_factor_offset` | `0.9500000000000001` | `0` | да | `value_anchor` |
| 10 | `transient_shaper_attack_gain_db_offset_scale` | `1` | `1` | нет | `default` |
| 11 | `spectral_shaping_target_curve_preset` | `pink_noise_balance` | `pink_noise_balance` | нет | `default` |
| 12 | `spectral_flatness_measure_db_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 13 | `spectral_flatness_measure_db_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 14 | `transient_shaper_attack_gain_db_offset` | `0` | `0` | нет | `default` |
| 15 | `spectral_flatness_measure_db_offset_scale` | `1` | `1` | нет | `default` |
| 16 | `generative_pattern_groove_humanize_velocity_offset` | `0` | `0` | нет | `default` |
| 17 | `spectral_flatness_measure_db_offset` | `0` | `0` | нет | `default` |
| 18 | `psychoacoustic_loudness_sone_units` | `8` | `8` | нет | `default` |
| 19 | `transient_shaper_attack_gain_factor_offset_scale` | `1` | `1` | нет | `default` |
| 20 | `spectral_frequency_to_hue_map_offset` | `0` | `0` | нет | `default` |
| 21 | `dynamic_eq_threshold_offset_db` | `0` | `0` | нет | `default` |
| 22 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 23 | `transient_shaper_attack_gain_factor_offset` | `0` | `0` | нет | `default` |
| 24 | `spectral_flatness_measure_db_offset_scale_factor` | `1` | `1` | нет | `default` |
| 25 | `psychoacoustic_masking_threshold_offset_db` | `0` | `0` | нет | `default` |
| 26 | `sample_rate_base_setting_hz` | `44100` | `44100` | нет | `default` |
| 27 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 28 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 29 | `liquid_scratch_pitch_lfo_sine_wave_phase_offset_deg` | `90` | `90` | нет | `default` |
| 30 | `organic_vinyl_surface_noise_tilt_ratio_scale_factor_offset` | `0` | `0` | нет | `default` |

### Тест 7 · Top-K 50

Запрос: `Set stereo_width_coefficient_ratio to 1.6`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.6`
Найдена: **да**; результат: `1.6`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **15**, осталось default **35**. Время: 4.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.6` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.87` | `1` | да | `value_anchor` |
| 3 | `spatial_width_frequency_dependent_amount` | `0.93` | `0` | да | `value_anchor` |
| 4 | `mono_to_stereo_width_percent` | `188` | `100` | да | `value_anchor` |
| 5 | `granular_grain_stereo_width_spread_ratio` | `0.93` | `0.5` | да | `value_anchor` |
| 6 | `stereo_width_expansion_ratio` | `1.87` | `1` | да | `value_anchor` |
| 7 | `dynamic_stereo_width_modulation_depth` | `94` | `0` | да | `value_anchor` |
| 8 | `multiband_stereo_width_low_frequency` | `1.8800000000000001` | `0` | да | `value_anchor` |
| 9 | `spatial_width_compensation_frequency` | `9329` | `500` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 11 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 12 | `grain_cloud_spread_stereo_width` | `188` | `100` | да | `value_anchor` |
| 13 | `multitap_delay_cross_quadrature_phase_offset_deg` | `351` | `90` | да | `value_anchor` |
| 14 | `organic_granulation_spray_stereo_width_ratio` | `0.93` | `0.2` | да | `value_anchor` |
| 15 | `phase_manipulation_haas_effect_delay_offset` | `38.900000000000006` | `15` | да | `value_anchor` |
| 16 | `simple_compressor_ratio_setting` | `4:1` | `4:1` | нет | `default` |
| 17 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `default` |
| 18 | `spectral_shaping_target_curve_preset` | `pink_noise_balance` | `pink_noise_balance` | нет | `default` |
| 19 | `spectral_flatness_measure_db_scale_factor_offset` | `0` | `0` | нет | `default` |
| 20 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 21 | `spectral_masking_psychoacoustic_threshold_offset` | `0` | `0` | нет | `default` |
| 22 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 23 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `90` | `90` | нет | `default` |
| 24 | `spectral_flatness_measure_db_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 25 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 26 | `spectral_flatness_measure_db_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 27 | `sample_rate_base_setting_hz` | `44100` | `44100` | нет | `default` |
| 28 | `haas_effect_delay_offset_ms` | `12` | `12` | нет | `default` |
| 29 | `sub_bass_phase_alignment_offset_degrees_scale` | `1` | `1` | нет | `default` |
| 30 | `reverb_modulation_stereo_phase_offset` | `0` | `0` | нет | `default` |
| 31 | `spectral_flatness_measure_db_offset_scale` | `1` | `1` | нет | `default` |
| 32 | `sub_bass_phase_alignment_offset_ms_scale` | `1` | `1` | нет | `default` |
| 33 | `transient_shaper_attack_gain_db_offset_scale` | `1` | `1` | нет | `default` |
| 34 | `analog_tape_head_gap_loss_high_frequency_phase_offset_decay_rate_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 35 | `sub_bass_phase_alignment_offset_time_us_scale_factor_offset_scale_factor` | `1` | `1` | нет | `default` |
| 36 | `sub_bass_phase_alignment_offset_time_us_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 37 | `dynamic_eq_threshold_offset_db` | `0` | `0` | нет | `default` |
| 38 | `spectral_frequency_to_hue_map_offset` | `0` | `0` | нет | `default` |
| 39 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `0` | `0` | нет | `default` |
| 40 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 41 | `organic_granulation_spray_pan_width_ratio` | `0.5` | `0.5` | нет | `default` |
| 42 | `reverb_late_reflection_density_growth_ms_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 43 | `collaboration_sync_offset_allowance` | `20` | `20` | нет | `default` |
| 44 | `spatial_bass_mono_crossover_hz` | `120` | `120` | нет | `default` |
| 45 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0` | `0` | нет | `default` |
| 46 | `spatial_center_channel_extraction_gain_db` | `0` | `0` | нет | `default` |
| 47 | `midside_mid_gain_attenuation` | `0` | `0` | нет | `default` |
| 48 | `sub_bass_phase_alignment_offset_time_us_scale` | `1` | `1` | нет | `default` |
| 49 | `omega_phase_3_vector_convolve_interchannel_offset_ms` | `14.5` | `14.5` | нет | `default` |
| 50 | `sub_bass_phase_alignment_offset_degrees` | `0` | `0` | нет | `default` |

### Тест 8 · Top-K 5

Запрос: `Установи acoustic_feature_attack_density на 0.18`

Цель: `acoustic_feature_attack_density` → ожидалось `0.18`
Найдена: **да**; результат: `0.18`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **3**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.18` | `0.5` | да | `numeric` |
| 2 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.03` | `0.3` | да | `value_anchor` |
| 3 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 4 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 5 | `affective_arousal_change_rate` | `0.2` | `0.2` | нет | `default` |

### Тест 9 · Top-K 8

Запрос: `Установи basic_amplitude_envelope_attack_ms ровно 1250 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `1250`
Найдена: **да**; результат: `1250`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **5**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `1250` | `10` | да | `numeric` |
| 2 | `envelope_generator_attack_time_ms` | `9805.300000000001` | `10` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `196.20000000000002` | `5` | да | `value_anchor` |
| 4 | `envelope_follower_attack_time_ms` | `10` | `10` | нет | `default` |
| 5 | `basic_amplitude_envelope_release_ms` | `200` | `200` | нет | `default` |
| 6 | `dynamic_envelope_follower_attack_time_ms` | `10` | `10` | нет | `default` |
| 7 | `attack_min_ms` | `10` | `10` | нет | `default` |
| 8 | `basic_adsr_decay_time_ms` | `200` | `200` | нет | `default` |

### Тест 10 · Top-K 12

Запрос: `Установи spectral_smoothing_attack_time ровно 155 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `155.0`
Найдена: **да**; результат: `155`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **4**, осталось default **8**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `155` | `2` | да | `numeric` |
| 2 | `envelope_follower_attack_time_ms` | `492.90000000000003` | `10` | да | `value_anchor` |
| 3 | `dynamic_envelope_follower_attack_ms` | `196.9` | `5` | да | `value_anchor` |
| 4 | `envelope_generator_attack_time_ms` | `9843.400000000001` | `10` | да | `value_anchor` |
| 5 | `envelope_follow_smoothing_time_ms` | `10` | `10` | нет | `default` |
| 6 | `noise_gate_attack_time_ms` | `1` | `1` | нет | `default` |
| 7 | `dynamic_envelope_follower_attack_time_ms` | `10` | `10` | нет | `default` |
| 8 | `filter_cutoff_tracking_smoothing_ms` | `20` | `20` | нет | `default` |
| 9 | `lfo_smoothing_time_ms` | `0` | `0` | нет | `default` |
| 10 | `dynamic_equalizer_attack_time_ms` | `10` | `10` | нет | `default` |
| 11 | `liquid_scratch_transient_envelope_fade_in_ms` | `100` | `100` | нет | `default` |
| 12 | `attack_min_ms` | `10` | `10` | нет | `default` |

### Тест 11 · Top-K 20

Запрос: `Установи resonant_body_excitation_attack_damping на 0.08`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.08`
Найдена: **да**; результат: `0.08`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **6**, осталось default **14**. Время: 4.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.08` | `0.3` | да | `numeric` |
| 2 | `acoustic_room_mode_damping` | `0.016` | `0.2` | да | `value_anchor` |
| 3 | `acoustic_coupling_resonance_transfer_speed` | `10` | `100` | да | `value_anchor` |
| 4 | `additive_partial_amplitude_envelope_decay` | `150` | `500` | да | `value_anchor` |
| 5 | `acoustic_ray_tracing_bounce_count` | `1` | `10` | да | `value_anchor` |
| 6 | `adaptive_notch_filter_q` | `1.5` | `15` | да | `value_anchor` |
| 7 | `acoustic_structural_resonance_q_factor` | `5` | `5` | нет | `default` |
| 8 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.005` | `0.005` | нет | `default` |
| 9 | `additive_partial_phase_randomization_seed` | `0` | `0` | нет | `default` |
| 10 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 11 | `adaptive_filter_adaptation_memory` | `0.5` | `0.5` | нет | `default` |
| 12 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 13 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 14 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 15 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 16 | `adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `default` |
| 17 | `algorithmic_reverb_decay_time_seconds` | `2.5` | `2.5` | нет | `default` |
| 18 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 19 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_rate_hz` | `5` | `5` | нет | `default` |
| 20 | `affective_arousal_change_rate` | `0.2` | `0.2` | нет | `default` |

### Тест 12 · Top-K 30

Запрос: `Установи stereo_width_chorus_flanger_depth на 0.15`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.15`
Найдена: **да**; результат: `0.15000000000000002`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **9**, осталось default **21**. Время: 4.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.15000000000000002` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 4 | `stereo_width_expansion_coefficient` | `1.8900000000000001` | `1` | да | `value_anchor` |
| 5 | `mono_to_stereo_width_percent` | `190` | `100` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `95` | `0` | да | `value_anchor` |
| 7 | `granular_grain_stereo_width_spread_ratio` | `0.9400000000000001` | `0.5` | да | `value_anchor` |
| 8 | `multiband_stereo_width_low_frequency` | `1.9100000000000001` | `0` | да | `value_anchor` |
| 9 | `spatial_width_frequency_dependent_amount` | `0.9400000000000001` | `0` | да | `value_anchor` |
| 10 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 11 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 12 | `midside_mid_gain_attenuation` | `0` | `0` | нет | `default` |
| 13 | `spatial_width_compensation_frequency` | `500` | `500` | нет | `default` |
| 14 | `spatial_center_channel_extraction_gain_db` | `0` | `0` | нет | `default` |
| 15 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `default` |
| 16 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `default` |
| 17 | `spatial_bass_mono_crossover_hz` | `120` | `120` | нет | `default` |
| 18 | `vibe_intergalactic_haas_effect_stereo_delay_ms` | `12` | `12` | нет | `default` |
| 19 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 20 | `phase_correlation_target` | `0.7` | `0.7` | нет | `default` |
| 21 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 22 | `organic_granulation_spray_stereo_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 23 | `vibe_space_station_metallic_lf_damping_hz` | `2000` | `2000` | нет | `default` |
| 24 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.9` | `0.9` | нет | `default` |
| 25 | `dynamics_envelope_stereo_link` | `100` | `100` | нет | `default` |
| 26 | `granular_pan_spray_width` | `50` | `50` | нет | `default` |
| 27 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.005` | `0.005` | нет | `default` |
| 28 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 29 | `dissolution_process_s15_happening_equivalence` | `0.99` | `0.99` | нет | `default` |
| 30 | `interaural_intensity_difference` | `0` | `0` | нет | `default` |

### Тест 13 · Top-K 50

Запрос: `Установи psychoacoustic_loudness_sharpness_ratio на 0.2`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `0.2`
Найдена: **да**; результат: `0.2`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **14**, осталось default **36**. Время: 4.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `0.2` | `0.3` | да | `numeric` |
| 2 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.02` | `0.9` | да | `value_anchor` |
| 3 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.03` | `0.3` | да | `value_anchor` |
| 4 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.0015` | `0.005` | да | `value_anchor` |
| 5 | `acoustic_feature_roughness_index` | `0.02` | `0.3` | да | `value_anchor` |
| 6 | `algorithmic_markov_rhythmic_accent_velocity_ratio` | `1.04` | `1.25` | да | `value_anchor` |
| 7 | `adapt_density_sigma_threshold_trigger` | `0.07` | `0.3` | да | `value_anchor` |
| 8 | `a5_adapt_density_high_noise_smoothing_decay` | `0.03` | `0.85` | да | `value_anchor` |
| 9 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `value_anchor` |
| 10 | `ai_hallucination_bias_spectral_entropy` | `0.02` | `0.15` | да | `value_anchor` |
| 11 | `adaptive_loudness_time_constant` | `0.19` | `0.3` | да | `value_anchor` |
| 12 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.02` | `0.85` | да | `value_anchor` |
| 13 | `additive_synthesis_partial_count_limit` | `8` | `32` | да | `value_anchor` |
| 14 | `acoustic_ray_tracing_air_absorption_humidity_factor` | `0.03` | `0.5` | да | `value_anchor` |
| 15 | `adaptive_notch_filter_q` | `2` | `15` | да | `value_anchor` |
| 16 | `algorithmic_markov_pitch_entropy_ratio` | `0.3` | `0.3` | нет | `default` |
| 17 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 18 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_ratio` | `0.1` | `0.1` | нет | `default` |
| 19 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 20 | `acoustic_feature_timbral_brightness` | `0.5` | `0.5` | нет | `default` |
| 21 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_ms` | `50` | `50` | нет | `default` |
| 22 | `additive_synthesis_noise_blur_amount` | `0` | `0` | нет | `default` |
| 23 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_rate_hz` | `5` | `5` | нет | `default` |
| 24 | `algorithmic_markov_pitch_class_entropy_decay_ms` | `100` | `100` | нет | `default` |
| 25 | `ai_section_boundary_hysteresis_window_bars` | `2` | `2` | нет | `default` |
| 26 | `acceleration_harshness_boil_hole_threshold` | `75` | `75` | нет | `default` |
| 27 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 28 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_factor` | `1` | `1` | нет | `default` |
| 29 | `acoustic_sound_speed_temperature_scaling` | `1` | `1` | нет | `default` |
| 30 | `algorithmic_markov_pitch_class_entropy_scaling_factor` | `1` | `1` | нет | `default` |
| 31 | `algorithmic_markov_pitch_duration_correlation_ratio` | `0` | `0` | нет | `default` |
| 32 | `aliasing_filter_steepness` | `24` | `24` | нет | `default` |
| 33 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 34 | `acoustic_shadowing_pinna_notch_frequency` | `8000` | `8000` | нет | `default` |
| 35 | `algorithmic_step_probability_decay_rate` | `0.1` | `0.1` | нет | `default` |
| 36 | `envelope_generator_sustain_level_ratio` | `0.7` | `0.7` | нет | `default` |
| 37 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 38 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_slope_db_per_ms` | `3` | `3` | нет | `default` |
| 39 | `algorithmic_markov_rhythmic_syncopation_probability_exponent` | `1` | `1` | нет | `default` |
| 40 | `adaptive_density_rho_increment_step` | `0.05` | `0.05` | нет | `default` |
| 41 | `acoustic_ray_tracing_bounce_count` | `10` | `10` | нет | `default` |
| 42 | `algorithmic_markov_rhythmic_accent_decay_ms` | `20` | `20` | нет | `default` |
| 43 | `acoustic_turbulence_intensity_amount` | `0.2` | `0.2` | нет | `default` |
| 44 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 45 | `ai_hallucination_boundary_bias` | `0.15` | `0.15` | нет | `default` |
| 46 | `algorithmic_composition_entropy_level` | `0.1` | `0.1` | нет | `default` |
| 47 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_ms` | `100` | `100` | нет | `default` |
| 48 | `algorithmic_markov_rhythmic_syncopation_decay_ms` | `100` | `100` | нет | `default` |
| 49 | `acoustic_shadow_occlusion_filter_freq_hz` | `800` | `800` | нет | `default` |
| 50 | `algorithmic_melody_leap_probability_ratio` | `0.15` | `0.15` | нет | `default` |

### Тест 14 · Top-K 3

Запрос: `Установи stereo_width_coefficient_ratio на 0.35`

Цель: `stereo_width_coefficient_ratio` → ожидалось `0.35`
Найдена: **да**; результат: `0.35000000000000003`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `0.35000000000000003` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `ai_hallucination_bias_factor` | `0.2` | `0.2` | нет | `default` |

### Тест 15 · Top-K 8

Запрос: `acoustic_feature_attack_density: 0.93`

Цель: `acoustic_feature_attack_density` → ожидалось `0.93`
Найдена: **да**; результат: `0.93`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **5**. Время: 3.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.93` | `0.5` | да | `numeric` |
| 2 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.98` | `0.3` | да | `value_anchor` |
| 3 | `ai_hallucination_bias_spectral_entropy` | `0.98` | `0.15` | да | `value_anchor` |
| 4 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 5 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 6 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 7 | `ai_hallucination_boundary_bias` | `0.15` | `0.15` | нет | `default` |
| 8 | `ai_hallucination_bias_factor` | `0.2` | `0.2` | нет | `default` |

### Тест 16 · Top-K 12

Запрос: `basic_amplitude_envelope_attack_ms: 80`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `80`
Найдена: **да**; результат: `80`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **4**, осталось default **8**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `80` | `10` | да | `numeric` |
| 2 | `additive_partial_amplitude_envelope_decay` | `9850` | `500` | да | `value_anchor` |
| 3 | `acoustic_feature_attack_density` | `0.98` | `0.5` | да | `value_anchor` |
| 4 | `samapana_resolution_exponential_decay_half_life_ms` | `9800` | `2500` | да | `value_anchor` |
| 5 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 6 | `reverb_perceptual_clarity_index_c80_db` | `2` | `2` | нет | `default` |
| 7 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 8 | `liquid_scratch_paulstretch_time_stretch_max_percent` | `600` | `600` | нет | `default` |
| 9 | `metric_velocity_v_threshold_ms` | `80` | `80` | нет | `default` |
| 10 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 11 | `vibe_monkey_zoo_portamento_glide_randomness_ms` | `55` | `55` | нет | `default` |
| 12 | `vibe_monkey_zoo_portamento_glide_randomness` | `55` | `55` | нет | `default` |

### Тест 17 · Top-K 20

Запрос: `spectral_smoothing_attack_time: 12.5`

Цель: `spectral_smoothing_attack_time` → ожидалось `12.5`
Найдена: **да**; результат: `12.5`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **15**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `12.5` | `2` | да | `numeric` |
| 2 | `spectral_entropy_variance_kappa_threshold_floor` | `0.049300000000000004` | `0.001` | да | `value_anchor` |
| 3 | `spectral_entropy_variance_kappa_scale` | `0.99` | `0.12` | да | `value_anchor` |
| 4 | `metric_d_noise_sensitivity_kappa` | `0.49` | `0.12` | да | `value_anchor` |
| 5 | `omega_synthesis_d_metric_kappa_noise_weight` | `0.12` | `0.12` | нет | `value_anchor` |
| 6 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.99` | `0.3` | да | `value_anchor` |
| 7 | `filter_slope_db_per_octave` | `12` | `12` | нет | `default` |
| 8 | `sidechain_resonance_target_frequency` | `220` | `220` | нет | `default` |
| 9 | `crossover_slope_attenuation_db_octave` | `24` | `24` | нет | `default` |
| 10 | `comb_array_allpass_diffusion_stage_count` | `4` | `4` | нет | `default` |
| 11 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 12 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 13 | `xenharmonic_periodicity_block_size` | `12` | `12` | нет | `default` |
| 14 | `fft_window_size_selection` | `2048` | `2048` | нет | `default` |
| 15 | `additive_partial_phase_randomization_seed` | `0` | `0` | нет | `default` |
| 16 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 17 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 18 | `microtonal_division_steps_per_octave` | `12` | `12` | нет | `default` |
| 19 | `vibe_simulation_glitch_bitcrusher_downsample_bits` | `8-bit` | `8-bit` | нет | `default` |
| 20 | `samapana_resolution_exponential_decay_half_life_ms` | `2500` | `2500` | нет | `default` |

### Тест 18 · Top-K 30

Запрос: `resonant_body_excitation_attack_damping: 0.67`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.67`
Найдена: **да**; результат: `0.67`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **9**, осталось default **21**. Время: 4.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.67` | `0.3` | да | `numeric` |
| 2 | `acoustic_coupling_resonance_transfer_speed` | `990` | `100` | да | `value_anchor` |
| 3 | `additive_partial_phase_randomization_seed` | `972779` | `0` | да | `value_anchor` |
| 4 | `additive_partial_amplitude_envelope_decay` | `9810` | `500` | да | `value_anchor` |
| 5 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.98` | `0.3` | да | `value_anchor` |
| 6 | `adaptive_notch_filter_q` | `49` | `15` | да | `value_anchor` |
| 7 | `acoustic_feature_attack_density` | `0.98` | `0.5` | да | `value_anchor` |
| 8 | `acoustic_ray_tracing_bounce_count` | `49` | `10` | да | `value_anchor` |
| 9 | `acoustic_room_mode_damping` | `0.985` | `0.2` | да | `value_anchor` |
| 10 | `adaptive_filter_adaptation_memory` | `0.5` | `0.5` | нет | `default` |
| 11 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 12 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 13 | `acceleration_harshness_boil_decay` | `35` | `35` | нет | `default` |
| 14 | `algorithmic_markov_rhythmic_syncopation_decay_ms` | `100` | `100` | нет | `default` |
| 15 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 16 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 17 | `adaptive_filter_adaptation_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 18 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 19 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.005` | `0.005` | нет | `default` |
| 20 | `acoustic_structural_resonance_q_factor` | `5` | `5` | нет | `default` |
| 21 | `adapt_density_lambda_decay_factor` | `0.85` | `0.85` | нет | `default` |
| 22 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_ms` | `100` | `100` | нет | `default` |
| 23 | `algorithmic_markov_rhythmic_syncopation_probability_exponent` | `1` | `1` | нет | `default` |
| 24 | `algorithmic_reverb_decay_time_seconds` | `2.5` | `2.5` | нет | `default` |
| 25 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_ms` | `50` | `50` | нет | `default` |
| 26 | `acoustic_structural_loss_factor_frequency_exponent` | `0.5` | `0.5` | нет | `default` |
| 27 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 28 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.35` | `0.35` | нет | `default` |
| 29 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_rate_hz` | `5` | `5` | нет | `default` |
| 30 | `alien_phoneme_cluster_density` | `0.3` | `0.3` | нет | `default` |

### Тест 19 · Top-K 50

Запрос: `stereo_width_chorus_flanger_depth: 0.40`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.4`
Найдена: **да**; результат: `0.4`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **15**, осталось default **35**. Время: 4.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.4` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 4 | `stereo_width_expansion_coefficient` | `1.9000000000000001` | `1` | да | `value_anchor` |
| 5 | `mono_to_stereo_width_percent` | `191` | `100` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `96` | `0` | да | `value_anchor` |
| 7 | `granular_grain_stereo_width_spread_ratio` | `0.9500000000000001` | `0.5` | да | `value_anchor` |
| 8 | `gamma_40hz_binaural_carrier_pan_modulation_speed` | `0.19` | `0.2` | да | `value_anchor` |
| 9 | `multiband_stereo_width_low_frequency` | `1.9100000000000001` | `0` | да | `value_anchor` |
| 10 | `spatial_width_frequency_dependent_amount` | `0.9500000000000001` | `0` | да | `value_anchor` |
| 11 | `stereo_width_coefficient_ratio` | `0.09` | `1` | да | `value_anchor` |
| 12 | `gamma_40hz_isochronic_pulse_duty_cycle_precision` | `12` | `50` | да | `value_anchor` |
| 13 | `grain_cloud_spread_stereo_width` | `190` | `100` | да | `value_anchor` |
| 14 | `gamma_band_40hz_phase_locking_value_plv` | `0.02` | `0.85` | да | `value_anchor` |
| 15 | `midside_mid_gain_attenuation` | `-22.8` | `0` | да | `value_anchor` |
| 16 | `spatial_center_channel_extraction_gain_db` | `0` | `0` | нет | `default` |
| 17 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `default` |
| 18 | `spatial_width_compensation_frequency` | `500` | `500` | нет | `default` |
| 19 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `default` |
| 20 | `spatial_bass_mono_crossover_hz` | `120` | `120` | нет | `default` |
| 21 | `gamma_band_40hz_coherence_alignment` | `0.4` | `0.4` | нет | `default` |
| 22 | `liquid_scratch_paulstretch_time_stretch_max_percent` | `600` | `600` | нет | `default` |
| 23 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 24 | `adaptive_masking_suppression_depth` | `0` | `0` | нет | `default` |
| 25 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.9` | `0.9` | нет | `default` |
| 26 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 27 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.005` | `0.005` | нет | `default` |
| 28 | `organic_granulation_spray_stereo_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 29 | `adaptive_eq_band_count` | `8` | `8` | нет | `default` |
| 30 | `glottal_closure_harmonic_overtone_boost_dB` | `6` | `6` | нет | `default` |
| 31 | `fft_window_size_selection` | `2048` | `2048` | нет | `default` |
| 32 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 33 | `air_column_turbulence_noise_level` | `0.1` | `0.1` | нет | `default` |
| 34 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 35 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 36 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 37 | `sruti_microtonal_pitch_glide_smoothing_ms` | `40` | `40` | нет | `default` |
| 38 | `validation_tempo_bpm_strictness_bound` | `147` | `147` | нет | `default` |
| 39 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 40 | `liquid_scratch_paulstretch_grain_size_ms` | `200` | `200` | нет | `default` |
| 41 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 42 | `ai_hallucination_bias_spectral_entropy` | `0.15` | `0.15` | нет | `default` |
| 43 | `acoustic_ray_tracing_bounce_count` | `10` | `10` | нет | `default` |
| 44 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.3` | `0.3` | нет | `default` |
| 45 | `gamaka_pitch_bend_attack_inertia_ms` | `35` | `35` | нет | `default` |
| 46 | `a3_sruti_polyphonic_isotropic_mix` | `0` | `0` | нет | `default` |
| 47 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 48 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 49 | `glottal_pulse_subharmonic_bloom_onset_delay_ms` | `20` | `20` | нет | `default` |
| 50 | `binaural_beat_gamma_frequency_offset` | `40` | `40` | нет | `default` |

### Тест 20 · Top-K 100

Запрос: `stereo_width_coefficient_ratio: 1.85`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.85`
Найдена: **да**; результат: `1.85`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **27**, осталось default **73**. Время: 5.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.85` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1.8900000000000001` | `1` | да | `value_anchor` |
| 3 | `mono_to_stereo_width_percent` | `190` | `100` | да | `value_anchor` |
| 4 | `granular_grain_stereo_width_spread_ratio` | `0.9400000000000001` | `0.5` | да | `value_anchor` |
| 5 | `spatial_width_frequency_dependent_amount` | `0.9400000000000001` | `0` | да | `value_anchor` |
| 6 | `dynamic_stereo_width_modulation_depth` | `95` | `0` | да | `value_anchor` |
| 7 | `multiband_stereo_width_low_frequency` | `1.9000000000000001` | `0` | да | `value_anchor` |
| 8 | `stereo_width_expansion_ratio` | `1.8800000000000001` | `1` | да | `value_anchor` |
| 9 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `170` | `150` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.9000000000000001` | `0.8` | да | `value_anchor` |
| 11 | `grain_cloud_spread_stereo_width` | `189` | `100` | да | `value_anchor` |
| 12 | `spatial_width_compensation_frequency` | `9465` | `500` | да | `value_anchor` |
| 13 | `organic_granulation_spray_stereo_width_ratio` | `0.9400000000000001` | `0.2` | да | `value_anchor` |
| 14 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `value_anchor` |
| 15 | `midside_mid_gain_attenuation` | `-23.1` | `0` | да | `value_anchor` |
| 16 | `spatial_center_channel_extraction_gain_db` | `-58.5` | `0` | да | `value_anchor` |
| 17 | `spatial_bass_mono_crossover_hz` | `41` | `120` | да | `value_anchor` |
| 18 | `organic_granulation_spray_pan_width_ratio` | `0.05` | `0.5` | да | `value_anchor` |
| 19 | `sub_bass_harmonic_quadrature_phase_balance_ratio` | `0.03` | `0.5` | да | `value_anchor` |
| 20 | `adapt_density_lambda_decay_factor` | `1.9500000000000002` | `0.85` | да | `value_anchor` |
| 21 | `omega_axiom_a5_adapt_density_decay_exponent` | `4.8500000000000005` | `0.85` | да | `value_anchor` |
| 22 | `omega_synthesis_adaptive_density_lambda_constant` | `0.85` | `0.85` | нет | `value_anchor` |
| 23 | `a2_zero_flux_spectral_energy_conservator_tolerance` | `0.0487` | `0.005` | да | `value_anchor` |
| 24 | `a2_zero_flux_spectral_centroid_preservation_weight` | `0.98` | `0.9` | да | `value_anchor` |
| 25 | `aesthetic_axis_organic_mechanical` | `0.9500000000000001` | `0` | да | `value_anchor` |
| 26 | `adaptive_masking_suppression_depth` | `97` | `0` | да | `value_anchor` |
| 27 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.98` | `0.85` | да | `value_anchor` |
| 28 | `acoustic_shadowing_pinna_notch_frequency` | `11800` | `8000` | да | `value_anchor` |
| 29 | `a5_adapt_density_spectral_entropy_threshold_sigma` | `0.97` | `0.3` | да | `value_anchor` |
| 30 | `drop_impact_timing_position` | `phi_62pct` | `phi_62pct` | нет | `default` |
| 31 | `acoustic_radiation_pattern_directivity` | `omnidirectional` | `omnidirectional` | нет | `default` |
| 32 | `acoustic_ray_tracing_early_to_late_reflection_cross_time_ms` | `80` | `80` | нет | `default` |
| 33 | `acoustic_ray_tracing_bounce_count` | `10` | `10` | нет | `default` |
| 34 | `air_absorption_hf_dampening_distance_meters` | `10` | `10` | нет | `default` |
| 35 | `additive_partial_amplitude_envelope_decay` | `500` | `500` | нет | `default` |
| 36 | `allpass_filter_dispersion_stage_phase_shift_offset_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 37 | `adaptive_eq_band_count` | `8` | `8` | нет | `default` |
| 38 | `spatial_binaural_azimuth_angle_scale` | `1` | `1` | нет | `default` |
| 39 | `l6_spontaneous_consciousness_index` | `0.85` | `0.85` | нет | `default` |
| 40 | `adapt_density_sigma_threshold_trigger` | `0.3` | `0.3` | нет | `default` |
| 41 | `adaptive_notch_filter_q` | `15` | `15` | нет | `default` |
| 42 | `acoustic_ray_tracing_specular_to_diffuse_scattering_ratio` | `0.5` | `0.5` | нет | `default` |
| 43 | `adaptive_eq_automation_intensity` | `0.5` | `0.5` | нет | `default` |
| 44 | `adaptive_eq_automation_shape` | `sine` | `sine` | нет | `default` |
| 45 | `analog_tape_head_gap_loss_high_frequency_phase_offset_decay_rate_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 46 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `0.707` | `0.707` | нет | `default` |
| 47 | `ai_hallucination_bias_spectral_entropy` | `0.15` | `0.15` | нет | `default` |
| 48 | `additive_partial_frequency_jitter_std_dev` | `0` | `0` | нет | `default` |
| 49 | `analog_tape_head_gap_azimuth_alignment_mode` | `perfect_alignment` | `perfect_alignment` | нет | `default` |
| 50 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 51 | `additive_synthesis_partial_count_limit` | `32` | `32` | нет | `default` |
| 52 | `a5_adapt_density_lambda_smoothing_coefficient` | `0.85` | `0.85` | нет | `default` |
| 53 | `acoustic_ray_tracing_scattering_coefficient` | `0.3` | `0.3` | нет | `default` |
| 54 | `acoustic_shadow_wall_absorption_ratio` | `0.95` | `0.95` | нет | `default` |
| 55 | `adaptive_eq_learning_bias_curve` | `balanced` | `balanced` | нет | `default` |
| 56 | `adaptive_eq_band_width_modulation` | `0.5` | `0.5` | нет | `default` |
| 57 | `acoustic_ray_tracing_air_absorption_humidity_factor` | `0.5` | `0.5` | нет | `default` |
| 58 | `additive_subtractive_fusion_bandwidth` | `50` | `50` | нет | `default` |
| 59 | `acoustic_ray_tracing_wall_absorption_coefficient` | `0.35` | `0.35` | нет | `default` |
| 60 | `mmss_l6_spontaneous_consciousness_meta_observer_index` | `0.85` | `0.85` | нет | `default` |
| 61 | `acoustic_ray_tracing_diffuse_reflection_order` | `4` | `4` | нет | `default` |
| 62 | `algorithmic_markov_rhythmic_accent_velocity_ratio` | `1.25` | `1.25` | нет | `default` |
| 63 | `adaptive_reverb_tail_prediction_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 64 | `a3_sruti_polyphonic_isotropic_mix` | `0` | `0` | нет | `default` |
| 65 | `adaptive_eq_band_centre_modulation` | `0.5` | `0.5` | нет | `default` |
| 66 | `ai_hybrid_source_b_style_extraction_depth` | `0.5` | `0.5` | нет | `default` |
| 67 | `amplitude_to_brightness_gamma_curve` | `2.2` | `2.2` | нет | `default` |
| 68 | `ai_hallucination_boundary_bias` | `0.15` | `0.15` | нет | `default` |
| 69 | `analog_noise_floor_level_db` | `-90` | `-90` | нет | `default` |
| 70 | `allpass_reverb_diffuser_density_ratio` | `0.7` | `0.7` | нет | `default` |
| 71 | `acoustic_ray_tracing_surface_absorption_coeff` | `0.35` | `0.35` | нет | `default` |
| 72 | `adaptive_filter_adaptation_memory` | `0.5` | `0.5` | нет | `default` |
| 73 | `allpass_filter_dispersion_allpass_stage_delay_mode` | `Exponential` | `Exponential` | нет | `default` |
| 74 | `aliasing_filter_steepness` | `24` | `24` | нет | `default` |
| 75 | `algorithmic_reverb_decay_time_seconds` | `2.5` | `2.5` | нет | `default` |
| 76 | `amorphous_noise_viscous_gel_friction_decay_ms` | `300` | `300` | нет | `default` |
| 77 | `air_column_turbulence_noise_level` | `0.1` | `0.1` | нет | `default` |
| 78 | `a3_terminal_state_recurrence_distance_threshold` | `0.00124` | `0.00124` | нет | `default` |
| 79 | `algorithmic_markov_rhythmic_syncopation_decay_ms` | `100` | `100` | нет | `default` |
| 80 | `acoustic_shadow_occlusion_filter_freq_hz` | `800` | `800` | нет | `default` |
| 81 | `acceleration_harshness_boil_hole_threshold` | `75` | `75` | нет | `default` |
| 82 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_ms` | `50` | `50` | нет | `default` |
| 83 | `analog_tape_head_gap_loss_filter_order` | `2nd_order` | `2nd_order` | нет | `default` |
| 84 | `ai_hybrid_source_a_style_extraction_depth` | `0.5` | `0.5` | нет | `default` |
| 85 | `algorithmic_step_probability_decay_rate` | `0.1` | `0.1` | нет | `default` |
| 86 | `ai_section_boundary_hysteresis_window_bars` | `2` | `2` | нет | `default` |
| 87 | `aesthetic_collision_ratio` | `0.5` | `0.5` | нет | `default` |
| 88 | `analog_tape_head_bump_q_factor` | `1.2` | `1.2` | нет | `default` |
| 89 | `adaptive_spatialization_motion_prediction_gain` | `0.4` | `0.4` | нет | `default` |
| 90 | `algorithmic_markov_pitch_entropy_ratio` | `0.3` | `0.3` | нет | `default` |
| 91 | `amplitude_pan_modulation_depth` | `0` | `0` | нет | `default` |
| 92 | `ambient_microphone_injection_gain` | `-40` | `-40` | нет | `default` |
| 93 | `acoustic_near_field_distance_meters` | `0.5` | `0.5` | нет | `default` |
| 94 | `algorithmic_markov_pitch_duration_correlation_ratio` | `0` | `0` | нет | `default` |
| 95 | `ambient_harmonic_polyrhythmic_chaotic_mix` | `0.15` | `0.15` | нет | `default` |
| 96 | `algorithmic_markov_rhythmic_syncopation_threshold_smoothing_decay_ratio` | `0.1` | `0.1` | нет | `default` |
| 97 | `adaptive_filter_adaptation_sensitivity` | `0.5` | `0.5` | нет | `default` |
| 98 | `algorithmic_markov_rhythmic_syncopation_threshold_decay_ms` | `100` | `100` | нет | `default` |
| 99 | `acoustic_feature_timbral_brightness` | `0.5` | `0.5` | нет | `default` |
| 100 | `affective_arousal_change_rate` | `0.2` | `0.2` | нет | `default` |
