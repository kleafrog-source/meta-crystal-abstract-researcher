# Flowmusic Genesis V3 — аудит явных значений Qwen · STAGE1

Дата: 2026-10-08T09:36:12+03:00

Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.

## Сводка

- Успешных HTTP-запросов: **20/20**
- Целевой technical_name найден: **19/20**
- Запрошенное значение выставлено правильно: **19/20**
- Все выбранные значения, отличающиеся от default: **55/476 (11.6%)**
- Среднее время запроса: **3.165 с**

## Результаты

### Тест 1 · Top-K 3

Запрос: `Set acoustic_feature_attack_density to 0.82`

Цель: `acoustic_feature_attack_density` → ожидалось `0.82`
Найдена: **да**; результат: `0.8200000000000001`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 3.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.8200000000000001` | `0.5` | да | `numeric` |
| 2 | `basic_amplitude_envelope_attack_ms` | `10` | `10` | нет | `default` |
| 3 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode` | `Fixed` | `Fixed` | нет | `default` |

### Тест 2 · Top-K 5

Запрос: `Set basic_amplitude_envelope_attack_ms to 640 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `640`
Найдена: **да**; результат: `640`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **4**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `640` | `10` | да | `numeric` |
| 2 | `basic_amplitude_envelope_release_ms` | `200` | `200` | нет | `default` |
| 3 | `reverb_diffusion_buildup_time_ms` | `50` | `50` | нет | `default` |
| 4 | `allpass_reverb_loop_delay_time_ms` | `35` | `35` | нет | `default` |
| 5 | `convolution_reverb_predelay_offset_ms` | `0` | `0` | нет | `default` |

### Тест 3 · Top-K 8

Запрос: `Set spectral_smoothing_attack_time to 48 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `48.0`
Найдена: **да**; результат: `48`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **7**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 2 | `spectral_smoothing_attack_time` | `48` | `2` | да | `numeric` |
| 3 | `spectral_cepstral_smoothing_amount` | `0` | `0` | нет | `default` |
| 4 | `spectral_transient_smearing_time_ms` | `0` | `0` | нет | `default` |
| 5 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 6 | `spectral_band_compression_attack_ms` | `10` | `10` | нет | `default` |
| 7 | `spectral_gate_attack_time_ms` | `5` | `5` | нет | `default` |
| 8 | `spectral_energy_centroid_high_pass_smoothing_ms` | `5` | `5` | нет | `default` |

### Тест 4 · Top-K 12

Запрос: `Set resonant_body_excitation_attack_damping to 0.84`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.84`
Найдена: **да**; результат: `0.84`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **9**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.84` | `0.3` | да | `numeric` |
| 2 | `modal_resonance_damping_ratio` | `0.1` | `0.1` | нет | `default` |
| 3 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 4 | `drum_shell_resonance_damping` | `0.2` | `0.2` | нет | `default` |
| 5 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 6 | `hybrid_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 7 | `reverb_damping_frequency_hz` | `200` | `4000` | да | `lexical` |
| 8 | `reverb_high_frequency_damping` | `0.5` | `0.5` | нет | `default` |
| 9 | `acoustic_room_mode_damping` | `0.2` | `0.2` | нет | `default` |
| 10 | `reverb_damping_slope_db_per_octave` | `18.1` | `6` | да | `lexical` |
| 11 | `reverb_late_reflection_decay_damping_slope_hz` | `2500` | `2500` | нет | `default` |
| 12 | `reverb_early_reflections_damping_hz` | `8000` | `8000` | нет | `default` |

### Тест 5 · Top-K 20

Запрос: `Set stereo_width_chorus_flanger_depth to 0.95`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.95`
Найдена: **да**; результат: `0.9500000000000001`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **17**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.9500000000000001` | `0.7` | да | `numeric` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.8` | `0.8` | нет | `default` |
| 3 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `150` | `150` | нет | `default` |
| 4 | `liquid_scratch_chorus_flanger_base_delay_ms` | `5` | `5` | нет | `default` |
| 5 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `default` |
| 6 | `flanger_lfo_waveform_symmetry` | `0` | `0` | нет | `default` |
| 7 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `90` | `90` | нет | `default` |
| 8 | `flanger_lfo_depth_ratio` | `0.5` | `0.5` | нет | `default` |
| 9 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `90` | `90` | нет | `default` |
| 10 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 11 | `reverb_modulation_stereo_phase_offset` | `189` | `0` | да | `lexical` |
| 12 | `chorus_stereo_phase_spread` | `279` | `90` | да | `lexical` |
| 13 | `wavetable_index_sweep_lfo_modulation_depth` | `25` | `25` | нет | `default` |
| 14 | `spatial_reverb_tail_stereo_rotation_rate` | `0.2` | `0.2` | нет | `default` |
| 15 | `stereo_pan_lfo_speed` | `1` | `1` | нет | `default` |
| 16 | `reverb_tail_modulation_depth_ms` | `2` | `2` | нет | `default` |
| 17 | `reverb_modulation_phase_offset_degrees` | `0` | `0` | нет | `default` |
| 18 | `asymmetric_waveshaper_folding_threshold` | `0.7` | `0.7` | нет | `default` |
| 19 | `wavefolder_symmetry_bias_lfo_depth` | `15` | `15` | нет | `default` |
| 20 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.05` | `0.05` | нет | `default` |

### Тест 6 · Top-K 30

Запрос: `Set psychoacoustic_loudness_sharpness_ratio to 1.5`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `1.5`
Найдена: **да**; результат: `1.5`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **27**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0` | `0.5` | да | `lexical` |
| 2 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode` | `Fixed` | `Fixed` | нет | `default` |
| 3 | `psychoacoustic_tonalness_sharpness_weight` | `0.2` | `0.2` | нет | `default` |
| 4 | `psychoacoustic_loudness_sharpness_coupling_weight` | `0.2` | `0.2` | нет | `default` |
| 5 | `groove_inharmonicity_spatial_shadowing_loudness` | `0.1` | `0.1` | нет | `default` |
| 6 | `psychoacoustic_loudness_sharpness_bark_start_index` | `8` | `8` | нет | `default` |
| 7 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_ms` | `50` | `50` | нет | `default` |
| 8 | `psychoacoustic_loudness_bark_band_snr_smoothing_ms` | `50` | `50` | нет | `default` |
| 9 | `psychoacoustic_loudness_sharpness_acum` | `1` | `1` | нет | `default` |
| 10 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode_strategy` | `Fixed` | `Fixed` | нет | `default` |
| 11 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_factor` | `0.707` | `0.707` | нет | `default` |
| 12 | `psychoacoustic_loudness_sharpness_bark_weight_decay_exponent` | `1` | `1` | нет | `default` |
| 13 | `psychoacoustic_loudness_sharpness_bark_weight_decay_threshold` | `16` | `16` | нет | `default` |
| 14 | `psychoacoustic_loudness_bark_band_snr_smoothing_q_factor` | `0.707` | `0.707` | нет | `default` |
| 15 | `psychoacoustic_loudness_sharpness_bark_weight_decay_floor` | `0.05` | `0.05` | нет | `default` |
| 16 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0` | `0` | нет | `default` |
| 17 | `psychoacoustic_loudness_sharpness_bark_weight_exponent` | `1.5` | `1.5` | нет | `default` |
| 18 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 19 | `psychoacoustic_loudness_bark_band_snr_decay_q_boost_db_value` | `0` | `0` | нет | `default` |
| 20 | `psychoacoustic_loudness_sharpness_ratio` | `1.5` | `0.3` | да | `numeric` |
| 21 | `psychoacoustic_sharpness_spectral_weighting_mode` | `Bismarck` | `Bismarck` | нет | `default` |
| 22 | `psychoacoustic_loudness_bark_band_snr_decay_q_factor` | `0.707` | `0.707` | нет | `default` |
| 23 | `psychoacoustic_loudness_bark_band_snr_decay_ms` | `100` | `100` | нет | `default` |
| 24 | `psychoacoustic_loudness_sharpness_sone_exponent` | `0.8` | `0.8` | нет | `default` |
| 25 | `psychoacoustic_loudness_sharpness_bark_weight_slope_type` | `Linear` | `Linear` | нет | `default` |
| 26 | `psychoacoustic_loudness_bark_band_snr_q_factor` | `1` | `1` | нет | `default` |
| 27 | `psychoacoustic_sharpness_high_frequency_weight_exponent` | `1.2` | `1.2` | нет | `default` |
| 28 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `0` | `0` | нет | `default` |
| 29 | `psychoacoustic_loudness_bark_band_snr_decay_q_factor_boost_db` | `0` | `0` | нет | `default` |
| 30 | `psychoacoustic_loudness_sharpness_sone_weight_factor` | `0` | `0.5` | да | `lexical` |

### Тест 7 · Top-K 50

Запрос: `Set stereo_width_coefficient_ratio to 1.6`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.6`
Найдена: **да**; результат: `1.6`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **7**, осталось default **43**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.6` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `basic_stereo_imager_width_percent` | `100` | `100` | нет | `default` |
| 4 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 5 | `granular_grain_stereo_width_spread_ratio` | `0.5` | `0.5` | нет | `default` |
| 6 | `phase_manipulation_stereo_width_expansion` | `100` | `100` | нет | `default` |
| 7 | `interaural_time_difference_max_ms` | `0.7` | `0.7` | нет | `default` |
| 8 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 9 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `default` |
| 10 | `multiband_stereo_width_low_frequency` | `0` | `0` | нет | `default` |
| 11 | `spectral_gate_stereo_width_preservation` | `0.48` | `1` | да | `lexical` |
| 12 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 13 | `dynamic_stereo_width_modulation_depth` | `0` | `0` | нет | `default` |
| 14 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `default` |
| 15 | `spatial_width_interaural_coherence` | `0.5` | `0.5` | нет | `default` |
| 16 | `stereo_width_chorus_flanger_depth` | `0.7` | `0.7` | нет | `default` |
| 17 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `150` | `150` | нет | `default` |
| 18 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.8` | `0.8` | нет | `default` |
| 19 | `spatial_width_phase_inversion_amount` | `0.52` | `0` | да | `lexical` |
| 20 | `spatial_binaural_listener_head_width_m` | `0.215` | `0.215` | нет | `default` |
| 21 | `texture_noise_spectral_correlation_stereo_width` | `0` | `0` | нет | `default` |
| 22 | `vocal_allocation_matrix_layer_pan_binaural_decorrelation` | `0.85` | `0.85` | нет | `default` |
| 23 | `vocal_vector_spatial_width_s` | `7` | `7` | нет | `default` |
| 24 | `organic_granulation_spray_stereo_width_ratio` | `0.72` | `0.2` | да | `lexical` |
| 25 | `spatial_width_compensation_frequency` | `100` | `500` | да | `lexical` |
| 26 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 27 | `hrtf_3d_elevation_azimuth_matrix_blend` | `0.5` | `0.5` | нет | `default` |
| 28 | `iacc_interaural_cross_correlation_envelope` | `0.2` | `0.2` | нет | `default` |
| 29 | `stereo_matrix_mid_side_balance_db` | `0` | `0` | нет | `default` |
| 30 | `spatial_width_frequency_dependent_amount` | `0` | `0` | нет | `default` |
| 31 | `interaural_cross_correlation_index` | `0.8` | `0.8` | нет | `default` |
| 32 | `stereo_imager_frequency_split_point_hz` | `200` | `200` | нет | `default` |
| 33 | `binaural_decorrelation_bandwidth_hz` | `2500` | `2500` | нет | `default` |
| 34 | `stereo_mid_side_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 35 | `binaural_head_radius_meters` | `0.0875` | `0.0875` | нет | `default` |
| 36 | `posture_lean_angle_stereo_width_control` | `0` | `0` | нет | `default` |
| 37 | `stereo_haas_delay_time_ms` | `15` | `15` | нет | `default` |
| 38 | `reverb_modulation_stereo_phase_offset` | `0` | `0` | нет | `default` |
| 39 | `dreamy_chorus_binaural_detune_cents` | `12` | `12` | нет | `default` |
| 40 | `interaural_time_difference` | `0` | `0` | нет | `default` |
| 41 | `binaural_head_shadow_diffraction_index` | `0.75` | `0.75` | нет | `default` |
| 42 | `spatial_binaural_listener_head_size_cm` | `21.5` | `21.5` | нет | `default` |
| 43 | `hrtf_binaural_torso_reflection_delay_ms` | `1.2` | `1.2` | нет | `default` |
| 44 | `stereo_vectorscope_phase_rotation_deg` | `0` | `0` | нет | `default` |
| 45 | `stereo_shuffler_frequency_crossover` | `600` | `600` | нет | `default` |
| 46 | `stereo_decorrelation_time_ms` | `38.800000000000004` | `12.5` | да | `lexical` |
| 47 | `stereo_pan_to_horizontal_position_scale` | `100` | `100` | нет | `default` |
| 48 | `haas_effect_delay_offset_ms` | `33` | `12` | да | `lexical` |
| 49 | `hrtf_binaural_elevation_filter_notch_center_hz` | `8500` | `8500` | нет | `default` |
| 50 | `binaural_distance_cue_elevation_pinna_notch_width_hz` | `1000` | `1000` | нет | `default` |

### Тест 8 · Top-K 5

Запрос: `Установи acoustic_feature_attack_density на 0.18`

Цель: `acoustic_feature_attack_density` → ожидалось `0.18`
Найдена: **да**; результат: `0.18`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **4**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.18` | `0.5` | да | `numeric` |
| 2 | `head_shadow_high_freq_attenuation_db` | `8` | `8` | нет | `default` |
| 3 | `acoustic_modal_density_per_hz` | `10` | `10` | нет | `default` |
| 4 | `psychoacoustic_loudness_bark_band_snr_smoothing_decay_rate_hz` | `10` | `10` | нет | `default` |
| 5 | `psychoacoustic_loudness_bark_band_snr_q_factor` | `1` | `1` | нет | `default` |

### Тест 9 · Top-K 8

Запрос: `Установи basic_amplitude_envelope_attack_ms ровно 1250 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `1250`
Найдена: **да**; результат: `1250`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **6**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `waveform_display_mode` | `envelope` | `peak` | да | `lexical` |
| 2 | `basic_amplitude_envelope_attack_ms` | `1250` | `10` | да | `numeric` |
| 3 | `basic_amplitude_envelope_release_ms` | `200` | `200` | нет | `default` |
| 4 | `wavetable_spectral_foldover_attenuation_db` | `-72` | `-72` | нет | `default` |
| 5 | `reverb_tail_modulation_depth_ms` | `2` | `2` | нет | `default` |
| 6 | `allpass_reverb_loop_delay_time_ms` | `35` | `35` | нет | `default` |
| 7 | `multi_tap_delay_amplitude_decay_slope` | `-6` | `-6` | нет | `default` |
| 8 | `simple_reverb_pre_delay_ms` | `20` | `20` | нет | `default` |

### Тест 10 · Top-K 12

Запрос: `Установи spectral_smoothing_attack_time ровно 155 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `155.0`
Найдена: **да**; результат: `155`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **11**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 2 | `spectral_cepstral_smoothing_amount` | `0` | `0` | нет | `default` |
| 3 | `spectral_smoothing_attack_time` | `155` | `2` | да | `numeric` |
| 4 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 5 | `spectral_gate_attack_time_ms` | `5` | `5` | нет | `default` |
| 6 | `spectral_flux_smoothing_time_ms` | `50` | `50` | нет | `default` |
| 7 | `spectral_energy_centroid_high_pass_smoothing_ms` | `5` | `5` | нет | `default` |
| 8 | `spectral_band_compression_attack_ms` | `10` | `10` | нет | `default` |
| 9 | `spectral_energy_flux_smoothing_ms` | `20` | `20` | нет | `default` |
| 10 | `spectral_flux_transient_emphasis_smoothing_ms` | `2` | `2` | нет | `default` |
| 11 | `spectral_energy_centroid_smoothing_ms` | `20` | `20` | нет | `default` |
| 12 | `spectral_flatness_measure_smoothing_window_ms` | `50` | `50` | нет | `default` |

### Тест 11 · Top-K 20

Запрос: `Установи resonant_body_excitation_attack_damping на 0.08`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.08`
Найдена: **да**; результат: `0.08`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **4**, осталось default **16**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 2 | `modal_resonance_damping_ratio` | `0.1` | `0.1` | нет | `default` |
| 3 | `acoustic_room_mode_damping` | `0.2` | `0.2` | нет | `default` |
| 4 | `resonant_body_excitation_attack_damping` | `0.08` | `0.3` | да | `numeric` |
| 5 | `drum_shell_resonance_damping` | `0.2` | `0.2` | нет | `default` |
| 6 | `reverb_damping_frequency_hz` | `200` | `4000` | да | `lexical` |
| 7 | `reverb_high_frequency_damping` | `0.5` | `0.5` | нет | `default` |
| 8 | `hybrid_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 9 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 10 | `reverb_damping_slope_db_per_octave` | `18.1` | `6` | да | `lexical` |
| 11 | `reverb_late_reflection_decay_damping_slope_hz` | `2500` | `2500` | нет | `default` |
| 12 | `reverb_early_reflections_damping_hz` | `8000` | `8000` | нет | `default` |
| 13 | `reverb_diffuse_field_absorption_ratio` | `0.5` | `0.5` | нет | `default` |
| 14 | `subharmonic_resonance_damping_factor` | `0.5` | `0.5` | нет | `default` |
| 15 | `acid_mud_viscosity_resonance_damping` | `0.38` | `0.25` | да | `lexical` |
| 16 | `reverb_late_tail_damping_crossover_hz` | `4000` | `4000` | нет | `default` |
| 17 | `reverb_room_wall_viscoelastic_damping_index` | `0.15` | `0.15` | нет | `default` |
| 18 | `reverb_modal_density_per_hz` | `1.5` | `1.5` | нет | `default` |
| 19 | `reverb_late_reflection_highpass_resonance_db` | `0` | `0` | нет | `default` |
| 20 | `reverb_late_reflection_highpass_resonance_q` | `0.707` | `0.707` | нет | `default` |

### Тест 12 · Top-K 30

Запрос: `Установи stereo_width_chorus_flanger_depth на 0.15`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.15`
Найдена: **да**; результат: `0.15000000000000002`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **25**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.8` | `0.8` | нет | `default` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `150` | `150` | нет | `default` |
| 3 | `liquid_scratch_chorus_flanger_base_delay_ms` | `5` | `5` | нет | `default` |
| 4 | `stereo_width_chorus_flanger_depth` | `0.15000000000000002` | `0.7` | да | `numeric` |
| 5 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `default` |
| 6 | `flanger_lfo_waveform_symmetry` | `0` | `0` | нет | `default` |
| 7 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 8 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 9 | `flanger_lfo_depth_ratio` | `0.5` | `0.5` | нет | `default` |
| 10 | `wavefolder_symmetry_bias_lfo_depth` | `15` | `15` | нет | `default` |
| 11 | `chorus_stereo_phase_spread` | `279` | `90` | да | `lexical` |
| 12 | `reverb_tail_modulation_depth_ms` | `2` | `2` | нет | `default` |
| 13 | `stereo_pan_lfo_speed` | `1` | `1` | нет | `default` |
| 14 | `reverb_modulation_stereo_phase_offset` | `189` | `0` | да | `lexical` |
| 15 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `90` | `90` | нет | `default` |
| 16 | `synth_pulse_width_lfo_modulation_speed` | `1` | `1` | нет | `default` |
| 17 | `spatial_reverb_tail_stereo_rotation_rate` | `0.2` | `0.2` | нет | `default` |
| 18 | `asymmetric_waveshaper_folding_threshold` | `0.7` | `0.7` | нет | `default` |
| 19 | `chorus_feedback_amount` | `0.5` | `0` | да | `lexical` |
| 20 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.05` | `0.05` | нет | `default` |
| 21 | `chaotic_reverb_intensity_ratio` | `0` | `0` | нет | `default` |
| 22 | `reverb_modulation_depth_amount` | `0.1` | `0.1` | нет | `default` |
| 23 | `simple_panning_lfo_depth_percent` | `0` | `0` | нет | `default` |
| 24 | `basic_flanger_rate_hz` | `0.5` | `0.5` | нет | `default` |
| 25 | `wavefolding_stages_count` | `0` | `0` | нет | `default` |
| 26 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `90` | `90` | нет | `default` |
| 27 | `chorus_delay_time_spread_ms` | `15` | `15` | нет | `default` |
| 28 | `chorus_lfo_phase_offset_deg` | `279` | `90` | да | `lexical` |
| 29 | `chorus_delay_time_base_ms` | `20` | `20` | нет | `default` |
| 30 | `reverb_feedback_phase_rotation` | `0` | `0` | нет | `default` |

### Тест 13 · Top-K 50

Запрос: `Установи psychoacoustic_loudness_sharpness_ratio на 0.2`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `0.2`
Найдена: **нет**; результат: `None`; default: `None`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **50**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.05` | `0.05` | нет | `default` |
| 2 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode` | `Fixed` | `Fixed` | нет | `default` |
| 3 | `groove_inharmonicity_spatial_shadowing_loudness` | `0.1` | `0.1` | нет | `default` |
| 4 | `psychoacoustic_tonalness_sharpness_weight` | `0.2` | `0.2` | нет | `default` |
| 5 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_ms` | `50` | `50` | нет | `default` |
| 6 | `psychoacoustic_loudness_sharpness_bark_start_index` | `8` | `8` | нет | `default` |
| 7 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode_strategy` | `Fixed` | `Fixed` | нет | `default` |
| 8 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_contour_shape` | `exponential` | `exponential` | нет | `default` |
| 9 | `psychoacoustic_loudness_sharpness_bark_weight_decay_threshold` | `16` | `16` | нет | `default` |
| 10 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_ratio` | `0.1` | `0.1` | нет | `default` |
| 11 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_contour` | `exponential` | `exponential` | нет | `default` |
| 12 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_factor` | `0.707` | `0.707` | нет | `default` |
| 13 | `psychoacoustic_loudness_sharpness_bark_weight_decay_floor` | `0.05` | `0.05` | нет | `default` |
| 14 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_mode` | `single_pole` | `single_pole` | нет | `default` |
| 15 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_ms` | `20` | `20` | нет | `default` |
| 16 | `psychoacoustic_tonality_bark_band_snr_decay_rate_db_ms` | `0.5` | `0.5` | нет | `default` |
| 17 | `psychoacoustic_tonality_bark_band_snr_smoothing_type` | `exponential` | `exponential` | нет | `default` |
| 18 | `psychoacoustic_sharpness_high_frequency_weight_exponent` | `1.2` | `1.2` | нет | `default` |
| 19 | `psychoacoustic_loudness_bark_band_snr_smoothing_ms` | `50` | `50` | нет | `default` |
| 20 | `psychoacoustic_tonality_bark_band_snr_max_limit_mode` | `soft_saturate` | `soft_saturate` | нет | `default` |
| 21 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_contour_factor` | `1` | `1` | нет | `default` |
| 22 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_factor` | `0.2` | `0.2` | нет | `default` |
| 23 | `psychoacoustic_loudness_sharpness_bark_weight_decay_exponent` | `1` | `1` | нет | `default` |
| 24 | `psychoacoustic_loudness_contour_mode` | `iso_226` | `iso_226` | нет | `default` |
| 25 | `psychoacoustic_loudness_bark_band_snr_decay_q_boost_db_value` | `0` | `0` | нет | `default` |
| 26 | `psychoacoustic_sharpness_bark_band_slope_exponent` | `1.2` | `1.2` | нет | `default` |
| 27 | `psychoacoustic_tonality_bark_band_snr_decay_type` | `exponential` | `exponential` | нет | `default` |
| 28 | `psychoacoustic_loudness_bark_band_snr_smoothing_q_factor` | `0.707` | `0.707` | нет | `default` |
| 29 | `psychoacoustic_tonality_bark_band_snr_smoothing_ms` | `50` | `50` | нет | `default` |
| 30 | `psychoacoustic_sharpness_sone_bark_scale` | `1` | `1` | нет | `default` |
| 31 | `psychoacoustic_sharpness_bark_weight_threshold` | `-30` | `-30` | нет | `default` |
| 32 | `psychoacoustic_loudness_specific_bark_band_smoothing_ms` | `50` | `50` | нет | `default` |
| 33 | `psychoacoustic_loudness_sharpness_bark_weight_exponent` | `1.5` | `1.5` | нет | `default` |
| 34 | `psychoacoustic_spectral_sharpness_weight_slope` | `1` | `1` | нет | `default` |
| 35 | `psychoacoustic_loudness_bark_band_snr_decay_ms` | `100` | `100` | нет | `default` |
| 36 | `psychoacoustic_tonality_bark_band_snr_weight_exponent` | `1` | `1` | нет | `default` |
| 37 | `psychoacoustic_sharpness_sone_bark_ratio_scale` | `1` | `1` | нет | `default` |
| 38 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0` | `0` | нет | `default` |
| 39 | `psychoacoustic_loudness_bark_band_snr_decay_q_factor` | `0.707` | `0.707` | нет | `default` |
| 40 | `psychoacoustic_loudness_sharpness_bark_weight_slope_type` | `Linear` | `Linear` | нет | `default` |
| 41 | `psychoacoustic_sharpness_sone_bark_ratio` | `1` | `1` | нет | `default` |
| 42 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 43 | `psychoacoustic_loudness_bark_band_snr_q_factor` | `1` | `1` | нет | `default` |
| 44 | `psychoacoustic_tonal_loudness_bark_weight` | `1` | `1` | нет | `default` |
| 45 | `psychoacoustic_loudness_bark_band_snr_decay_q_factor_boost_db` | `0` | `0` | нет | `default` |
| 46 | `psychoacoustic_tonality_bark_band_snr_decay_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 47 | `psychoacoustic_sharpness_sone_bark_weight_exponent` | `1` | `1` | нет | `default` |
| 48 | `psychoacoustic_sharpness_bark_weight_slope` | `0.5` | `0.5` | нет | `default` |
| 49 | `psychoacoustic_sharpness_bark_band_start_index` | `11` | `11` | нет | `default` |
| 50 | `psychoacoustic_sharpness_bark_band_weight` | `1` | `1` | нет | `default` |

### Тест 14 · Top-K 3

Запрос: `Установи stereo_width_coefficient_ratio на 0.35`

Цель: `stereo_width_coefficient_ratio` → ожидалось `0.35`
Найдена: **да**; результат: `0.35000000000000003`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `0.35000000000000003` | `1` | да | `numeric` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `basic_stereo_imager_width_percent` | `100` | `100` | нет | `default` |

### Тест 15 · Top-K 8

Запрос: `acoustic_feature_attack_density: 0.93`

Цель: `acoustic_feature_attack_density` → ожидалось `0.93`
Найдена: **да**; результат: `0.93`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **7**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `vocoder_carrier_synthesis_wave_type` | `sawtooth` | `sawtooth` | нет | `default` |
| 2 | `whisper_phonetic_noise_spectral_tilt` | `-3` | `-3` | нет | `default` |
| 3 | `acoustic_feature_attack_density` | `0.93` | `0.5` | да | `numeric` |
| 4 | `vocal_aspiration_breath_noise_friction_ratio` | `-18` | `-18` | нет | `default` |
| 5 | `vocal_vwsp_whisper_formant_air_turbulence_fx4_fmt1` | `0` | `0` | нет | `default` |
| 6 | `chaos_whisper_mix_resonance` | `0.707` | `0.707` | нет | `default` |
| 7 | `formant_noise_breathiness_ratio` | `0` | `0` | нет | `default` |
| 8 | `noise_gate_attack_time_ms` | `1` | `1` | нет | `default` |

### Тест 16 · Top-K 12

Запрос: `basic_amplitude_envelope_attack_ms: 80`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `80`
Найдена: **да**; результат: `80`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **10**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `waveform_display_mode` | `envelope` | `peak` | да | `lexical` |
| 2 | `live_modulation_lfo_sync_to_performer` | `off` | `off` | нет | `numeric` |
| 3 | `basic_amplitude_envelope_attack_ms` | `80` | `10` | да | `numeric` |
| 4 | `rhythmic_pattern_syncopation_groove_humanize_lfo_waveform` | `sample_and_hold` | `sample_and_hold` | нет | `default` |
| 5 | `basic_tremolo_rate_hz` | `4` | `4` | нет | `default` |
| 6 | `basic_tremolo_depth_percent` | `50` | `50` | нет | `default` |
| 7 | `lfo_amplitude_modulation_depth` | `0.5` | `0.5` | нет | `default` |
| 8 | `multi_tap_delay_amplitude_decay_slope` | `-6` | `-6` | нет | `default` |
| 9 | `basic_lfo_waveform_shape` | `sine` | `sine` | нет | `default` |
| 10 | `liquid_scratch_pitch_lfo_waveform_shape` | `Sine` | `Sine` | нет | `default` |
| 11 | `lfo_waveform_type` | `sine` | `sine` | нет | `default` |
| 12 | `flanger_lfo_waveform_symmetry` | `0` | `0` | нет | `default` |

### Тест 17 · Top-K 20

Запрос: `spectral_smoothing_attack_time: 12.5`

Цель: `spectral_smoothing_attack_time` → ожидалось `12.5`
Найдена: **да**; результат: `12.5`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **18**. Время: 3.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `12.5` | `2` | да | `numeric` |
| 2 | `spectral_cepstral_smoothing_amount` | `0` | `0` | нет | `default` |
| 3 | `a5_adapt_density_high_noise_smoothing_decay` | `0.85` | `0.85` | нет | `default` |
| 4 | `spectral_envelope_attack_factor` | `0.5` | `0.5` | нет | `default` |
| 5 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 6 | `spectral_flatness_measure_smoothing_factor` | `0.1` | `0.1` | нет | `default` |
| 7 | `spectral_masking_notch_attenuation_bandwidth` | `0.5` | `0.5` | нет | `default` |
| 8 | `spectral_gate_attack_time_ms` | `5` | `5` | нет | `default` |
| 9 | `spectral_attack_sharpening_amount` | `0` | `0` | нет | `default` |
| 10 | `noise_gate_attack_time_ms` | `1` | `1` | нет | `default` |
| 11 | `spectral_band_compression_attack_ms` | `10` | `10` | нет | `default` |
| 12 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 13 | `spectral_flux_transient_emphasis_smoothing_ms` | `2` | `2` | нет | `default` |
| 14 | `spectral_diffusion_application_threshold` | `0.05` | `0.05` | нет | `default` |
| 15 | `basic_amplitude_envelope_attack_ms` | `398` | `10` | да | `lexical` |
| 16 | `spectral_freeze_crossfade_time_ms` | `100` | `100` | нет | `default` |
| 17 | `spectral_flatness_smoothness_factor` | `0.2` | `0.2` | нет | `default` |
| 18 | `noise_shaping_spectral_flux_modulation_rate` | `1` | `1` | нет | `default` |
| 19 | `spatial_interspeaker_crossfeed_delay_attenuation_smoothing_decay_ms` | `50` | `50` | нет | `default` |
| 20 | `spatial_interspeaker_crossfeed_delay_attenuation_smoothing_decay_rate_hz` | `5` | `5` | нет | `default` |

### Тест 18 · Top-K 30

Запрос: `resonant_body_excitation_attack_damping: 0.67`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.67`
Найдена: **да**; результат: `0.67`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **28**. Время: 3.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `drum_shell_resonance_damping` | `0.2` | `0.2` | нет | `default` |
| 2 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 3 | `hybrid_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 4 | `modal_resonance_damping_ratio` | `0.1` | `0.1` | нет | `default` |
| 5 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 6 | `acoustic_room_mode_damping` | `0.2` | `0.2` | нет | `default` |
| 7 | `resonant_body_excitation_attack_damping` | `0.67` | `0.3` | да | `numeric` |
| 8 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `0.707` | `0.707` | нет | `default` |
| 9 | `resonator_decay_time_seconds` | `1` | `1` | нет | `default` |
| 10 | `reverb_late_reflection_highpass_resonance_q` | `0.707` | `0.707` | нет | `default` |
| 11 | `subharmonic_resonance_damping_factor` | `0.5` | `0.5` | нет | `default` |
| 12 | `acid_mud_viscosity_resonance_damping` | `0.41000000000000003` | `0.25` | да | `lexical` |
| 13 | `reverb_damping_frequency_hz` | `4000` | `4000` | нет | `default` |
| 14 | `reverb_late_reflection_highpass_resonance_db` | `0` | `0` | нет | `default` |
| 15 | `acoustic_structural_resonance_q_factor` | `5` | `5` | нет | `default` |
| 16 | `reverb_late_reflection_decay_damping_slope_hz` | `2500` | `2500` | нет | `default` |
| 17 | `cavity_resonance_volume_liters` | `10` | `10` | нет | `default` |
| 18 | `physical_model_a_material_damping` | `0.1` | `0.1` | нет | `default` |
| 19 | `reverb_late_tail_damping_crossover_hz` | `4000` | `4000` | нет | `default` |
| 20 | `room_acoustic_wall_reflection_attenuation_q_factor_resonance` | `0.707` | `0.707` | нет | `default` |
| 21 | `resonator_wall_absorption_coefficient` | `0.1` | `0.1` | нет | `default` |
| 22 | `resonator_excitation_noise_mix` | `0.2` | `0.2` | нет | `default` |
| 23 | `vocal_subglottal_resonance_damping_factor` | `0.2` | `0.2` | нет | `default` |
| 24 | `comb_filter_damped_feedback_decay_time_ms` | `200` | `200` | нет | `default` |
| 25 | `modal_filter_resonance_q_factor` | `10` | `10` | нет | `default` |
| 26 | `concrete_shaft_transverse_mode_damping_db` | `18.5` | `18.5` | нет | `default` |
| 27 | `comb_filter_feedback_decay_time_ms` | `500` | `500` | нет | `default` |
| 28 | `room_boundary_low_frequency_damping_hz` | `80` | `80` | нет | `default` |
| 29 | `reverb_diffuse_field_absorption_ratio` | `0.5` | `0.5` | нет | `default` |
| 30 | `acoustic_structural_damping_loss_factor` | `0.005` | `0.005` | нет | `default` |

### Тест 19 · Top-K 50

Запрос: `stereo_width_chorus_flanger_depth: 0.40`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.4`
Найдена: **да**; результат: `0.4`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **6**, осталось default **44**. Время: 3.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.8` | `0.8` | нет | `default` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `150` | `150` | нет | `default` |
| 3 | `liquid_scratch_chorus_flanger_base_delay_ms` | `5` | `5` | нет | `default` |
| 4 | `stereo_width_chorus_flanger_depth` | `0.4` | `0.7` | да | `numeric` |
| 5 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `default` |
| 6 | `flanger_lfo_waveform_symmetry` | `0` | `0` | нет | `default` |
| 7 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 8 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 9 | `wavefolder_symmetry_bias_lfo_depth` | `15` | `15` | нет | `default` |
| 10 | `flanger_lfo_depth_ratio` | `0.5` | `0.5` | нет | `default` |
| 11 | `reverb_tail_modulation_depth_ms` | `2` | `2` | нет | `default` |
| 12 | `chorus_stereo_phase_spread` | `279` | `90` | да | `lexical` |
| 13 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `90` | `90` | нет | `default` |
| 14 | `chorus_feedback_amount` | `0.5` | `0` | да | `lexical` |
| 15 | `chaotic_reverb_intensity_ratio` | `0` | `0` | нет | `default` |
| 16 | `synth_pulse_width_lfo_modulation_speed` | `1` | `1` | нет | `default` |
| 17 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.05` | `0.05` | нет | `default` |
| 18 | `spatial_reverb_tail_stereo_rotation_rate` | `0.2` | `0.2` | нет | `default` |
| 19 | `reverb_modulation_stereo_phase_offset` | `189` | `0` | да | `lexical` |
| 20 | `stereo_pan_lfo_speed` | `1` | `1` | нет | `default` |
| 21 | `asymmetric_waveshaper_folding_threshold` | `0.7` | `0.7` | нет | `default` |
| 22 | `simple_panning_lfo_depth_percent` | `0` | `0` | нет | `default` |
| 23 | `reverb_modulation_depth_amount` | `0.1` | `0.1` | нет | `default` |
| 24 | `chorus_delay_time_spread_ms` | `15` | `15` | нет | `default` |
| 25 | `chorus_delay_time_base_ms` | `20` | `20` | нет | `default` |
| 26 | `wavefolding_stages_count` | `0` | `0` | нет | `default` |
| 27 | `basic_flanger_rate_hz` | `0.5` | `0.5` | нет | `default` |
| 28 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `90` | `90` | нет | `default` |
| 29 | `reverb_feedback_phase_rotation` | `0` | `0` | нет | `default` |
| 30 | `flanger_delay_line_min_time_ms` | `1` | `1` | нет | `default` |
| 31 | `flanger_feedback_polarity_inversion` | `positive` | `positive` | нет | `default` |
| 32 | `basic_chorus_rate_hz` | `1.5` | `1.5` | нет | `default` |
| 33 | `convolution_reverb_dry_wet_mix_phase_alignment` | `0` | `0` | нет | `default` |
| 34 | `chorus_lfo_phase_offset_deg` | `279` | `90` | да | `lexical` |
| 35 | `reverb_modulation_depth_ms` | `0.5` | `0.5` | нет | `default` |
| 36 | `reverb_diffusion_shimmer_pitch` | `1200` | `1200` | нет | `default` |
| 37 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 38 | `reverb_modulation_frequency_hz` | `0.5` | `0.5` | нет | `default` |
| 39 | `vocal_shimmer_reverb_octave_pitch_shift_semitones` | `12` | `12` | нет | `default` |
| 40 | `basic_chorus_delay_ms` | `15` | `15` | нет | `default` |
| 41 | `tremor_thermoacoustic_divergence_wavefolding_mix` | `0.05` | `0.05` | нет | `default` |
| 42 | `flanger_through_zero_amount` | `0` | `0` | нет | `default` |
| 43 | `reverb_late_reflection_decay_asymmetry_ratio` | `0` | `0` | нет | `default` |
| 44 | `subtractive_filter_resonance_lfo_depth_ratio` | `0` | `0` | нет | `default` |
| 45 | `reverb_modulation_rate_hz` | `1` | `1` | нет | `default` |
| 46 | `gamma_40hz_binaural_carrier_pan_modulation_speed` | `0.2` | `0.2` | нет | `default` |
| 47 | `dynamic_stereo_width_modulation_depth` | `0` | `0` | нет | `default` |
| 48 | `spatial_reverb_crossfeed_amount` | `0` | `0.5` | да | `lexical` |
| 49 | `allpass_reverb_loop_delay_time_ms` | `35` | `35` | нет | `default` |
| 50 | `reverb_allpass_delay_time` | `30` | `30` | нет | `default` |

### Тест 20 · Top-K 100

Запрос: `stereo_width_coefficient_ratio: 1.85`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.85`
Найдена: **да**; результат: `1.85`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **9**, осталось default **91**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_pan_to_horizontal_position_scale` | `100` | `100` | нет | `default` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `stereo_width_coefficient_ratio` | `1.85` | `1` | да | `numeric` |
| 4 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 5 | `stereo_width_expansion_ratio` | `2` | `1` | да | `lexical` |
| 6 | `basic_stereo_imager_width_percent` | `100` | `100` | нет | `default` |
| 7 | `granular_grain_stereo_width_spread_ratio` | `0.5` | `0.5` | нет | `default` |
| 8 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 9 | `phase_manipulation_stereo_width_expansion` | `100` | `100` | нет | `default` |
| 10 | `stereo_matrix_mid_side_balance_db` | `0` | `0` | нет | `default` |
| 11 | `stereo_width_chorus_flanger_depth` | `0.7` | `0.7` | нет | `default` |
| 12 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `150` | `150` | нет | `default` |
| 13 | `multiband_stereo_width_low_frequency` | `0` | `0` | нет | `default` |
| 14 | `posture_lean_angle_stereo_width_control` | `0` | `0` | нет | `default` |
| 15 | `dynamic_stereo_width_modulation_depth` | `0` | `0` | нет | `default` |
| 16 | `spectral_gate_stereo_width_preservation` | `1` | `1` | нет | `default` |
| 17 | `stereo_mid_side_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 18 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.8` | `0.8` | нет | `default` |
| 19 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 20 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 21 | `spatial_width_phase_inversion_amount` | `0` | `0` | нет | `default` |
| 22 | `scene_width_expansion` | `100` | `100` | нет | `default` |
| 23 | `organic_granulation_spray_stereo_width_ratio` | `0.72` | `0.2` | да | `lexical` |
| 24 | `stereo_rotation_angle` | `0` | `0` | нет | `default` |
| 25 | `texture_noise_spectral_correlation_stereo_width` | `0` | `0` | нет | `default` |
| 26 | `granular_pan_spray_width` | `50` | `50` | нет | `default` |
| 27 | `spatial_width_frequency_dependent_amount` | `0` | `0` | нет | `default` |
| 28 | `organic_granulation_spray_stereo_phase_width_ratio` | `0.5` | `0.5` | нет | `default` |
| 29 | `vinyl_groove_vertical_horizontal_crosstalk_db` | `-30` | `-30` | нет | `default` |
| 30 | `vocal_vector_spatial_width_s` | `7` | `7` | нет | `default` |
| 31 | `granular_pan_spray_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 32 | `spatial_binaural_azimuth_angle_scale` | `2` | `1` | да | `lexical` |
| 33 | `high_frequency_stereo_crossover` | `8000` | `8000` | нет | `default` |
| 34 | `stereo_mid_side_balance` | `0` | `0` | нет | `default` |
| 35 | `stereo_field_visual_rotation_speed_deg_sec` | `10` | `10` | нет | `default` |
| 36 | `spatial_width_compensation_frequency` | `500` | `500` | нет | `default` |
| 37 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 38 | `spatial_reverb_horizontal_plane_tilt` | `0` | `0` | нет | `default` |
| 39 | `organic_granulation_spray_pan_width_ratio` | `0.5` | `0.5` | нет | `default` |
| 40 | `multitap_delay_spatial_pan_spread_width` | `85` | `85` | нет | `default` |
| 41 | `spatial_width_interaural_coherence` | `0.5` | `0.5` | нет | `default` |
| 42 | `stereo_widener_haas_delay_max_ms` | `10` | `10` | нет | `default` |
| 43 | `stereo_haas_delay_time_ms` | `15` | `15` | нет | `default` |
| 44 | `center_channel_attenuation_midside` | `0` | `0` | нет | `default` |
| 45 | `midside_mid_gain_attenuation` | `0` | `0` | нет | `default` |
| 46 | `stereo_imager_phase_correlation_threshold` | `0` | `0` | нет | `default` |
| 47 | `stereo_imager_frequency_split_point_hz` | `200` | `200` | нет | `default` |
| 48 | `liquid_scratch_texture_element_stereo_spread_degrees` | `150` | `150` | нет | `default` |
| 49 | `vibe_intergalactic_haas_effect_stereo_delay_ms` | `12` | `12` | нет | `default` |
| 50 | `high_gain_screen_grid_current_compression_ratio` | `2.85` | `2.85` | нет | `default` |
| 51 | `sub_bass_stereo_decorrelation_index` | `0` | `0` | нет | `default` |
| 52 | `saturator_triode_tube_screen_tap_ratio_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `default` |
| 53 | `saturator_triode_tube_screen_tap_ratio_scaling` | `2` | `1` | да | `lexical` |
| 54 | `spatial_binaural_listener_head_width_m` | `0.215` | `0.215` | нет | `default` |
| 55 | `stereo_decorrelation_time_ms` | `38.800000000000004` | `12.5` | да | `lexical` |
| 56 | `stereo_vectorscope_phase_rotation_deg` | `0` | `0` | нет | `default` |
| 57 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `default` |
| 58 | `stereo_correlation_coefficient_ratio` | `0.8` | `0.8` | нет | `default` |
| 59 | `sidechain_input_filter_q_factor` | `1` | `1` | нет | `default` |
| 60 | `liquid_scratch_spectral_delay_ping_pong_pan_width` | `0.8` | `0.8` | нет | `default` |
| 61 | `stereo_field_rotation_angle_degrees` | `0` | `0` | нет | `default` |
| 62 | `psychoacoustic_loudness_bark_band_width_ratio` | `1` | `1` | нет | `default` |
| 63 | `psychoacoustic_tonality_bark_band_width_hz` | `200` | `200` | нет | `default` |
| 64 | `organic_granulation_spray_stereo_phase_cents` | `0` | `0` | нет | `default` |
| 65 | `saturator_triode_tube_screen_tap_ratio_mode` | `Fixed` | `Fixed` | нет | `default` |
| 66 | `pipe_mouth_aperture_width` | `1` | `1` | нет | `default` |
| 67 | `spatial_map_depth_visualization_scale` | `1` | `1` | нет | `default` |
| 68 | `spatial_stereo_decorrelation_filter_delay_ms` | `5` | `5` | нет | `default` |
| 69 | `additive_subtractive_fusion_bandwidth` | `50` | `50` | нет | `default` |
| 70 | `spectral_band_crossfade_width_octaves` | `0.5` | `0.5` | нет | `default` |
| 71 | `auto_recursion_singularity_attractor_gravitational_pull_scale` | `2.618` | `2.618` | нет | `default` |
| 72 | `interaural_time_difference_max_ms` | `0.7` | `0.7` | нет | `default` |
| 73 | `high_gain_power_amp_screen_grid_dissipation_limit_watts` | `8.5` | `8.5` | нет | `default` |
| 74 | `vibe_event_horizon_shimmer_reverb_octave_shift` | `+1 octave` | `+1 octave` | нет | `default` |
| 75 | `micro_harmony_generator_amplitude_scale` | `0.5` | `0.5` | нет | `default` |
| 76 | `spectral_delay_band_crossfade_width` | `0.1` | `0.1` | нет | `default` |
| 77 | `stereo_pan_position_degrees` | `32` | `0` | да | `lexical` |
| 78 | `visual_event_duration_adaptive_scale` | `0.5` | `0.5` | нет | `default` |
| 79 | `supersaw_unison_voice_pan_distribution_spread` | `90` | `90` | нет | `default` |
| 80 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.85` | `0.85` | нет | `default` |
| 81 | `vocal_allocation_matrix_layer_pan_binaural_decorrelation` | `0.85` | `0.85` | нет | `default` |
| 82 | `visual_mapping_pan_to_position_x` | `0` | `0` | нет | `default` |
| 83 | `spectral_crossover_transition_width_octaves` | `0.5` | `0.5` | нет | `default` |
| 84 | `multi_tap_delay_pan_spread_angle` | `90` | `90` | нет | `default` |
| 85 | `low_frequency_rumble_screen_shake_mm` | `5` | `5` | нет | `default` |
| 86 | `noise_shaping_correlation_coefficient` | `-0.16` | `0` | да | `lexical` |
| 87 | `stereo_phase_correlation_target` | `0.5` | `0.5` | нет | `default` |
| 88 | `organic_granulation_spray_stereo_phase_decay_smoothing_ms_absolute` | `0` | `20` | да | `lexical` |
| 89 | `simple_stereo_delay_feedback_percent` | `30` | `30` | нет | `default` |
| 90 | `spatial_binaural_elevation_angle_offset_degrees_scale_factor_offset_scale` | `1` | `1` | нет | `default` |
| 91 | `multitap_delay_cross_quadrature_phase_offset_deg` | `90` | `90` | нет | `default` |
| 92 | `asymmetric_feedback_cross_channel_phase_rotation_speed` | `45` | `45` | нет | `default` |
| 93 | `analog_saturator_eighth_harmonic_gain_db` | `0` | `0` | нет | `default` |
| 94 | `stereo_shuffler_frequency_crossover` | `600` | `600` | нет | `default` |
| 95 | `delay_ping_pong_stereo_amount` | `0.5` | `0.5` | нет | `default` |
| 96 | `embedding_direction_vector_scale` | `1` | `1` | нет | `default` |
| 97 | `geometric_current_stereo_field_pan_rate` | `0.618` | `0.618` | нет | `default` |
| 98 | `high_gain_power_amp_screen_grid_current_surge_amps` | `0.085` | `0.085` | нет | `default` |
| 99 | `noise_gate_hysteresis_width` | `3` | `3` | нет | `default` |
| 100 | `kick_drum_visual_impulse_radius_pixels` | `200` | `200` | нет | `default` |
