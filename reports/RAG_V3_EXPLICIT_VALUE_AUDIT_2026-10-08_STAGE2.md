# Flowmusic Genesis V3 — аудит явных значений Qwen · STAGE2

Дата: 2026-10-08T10:01:27+03:00

Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.

## Сводка

- Успешных HTTP-запросов: **20/20**
- Целевой technical_name найден: **19/20**
- Запрошенное значение выставлено правильно: **19/20**
- Все выбранные значения, отличающиеся от default: **423/476 (88.9%)**
- Среднее время запроса: **3.784 с**

## Результаты

### Тест 1 · Top-K 3

Запрос: `Set acoustic_feature_attack_density to 0.82`

Цель: `acoustic_feature_attack_density` → ожидалось `0.82`
Найдена: **нет**; результат: `None`; default: `None`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `cpu_affinity_core_assignment` | `all` | `auto` | да | `numeric` |
| 2 | `sympathetic_resonance_harmonic_series_activation` | `all` | `all` | нет | `numeric` |
| 3 | `visual_effect_frequency_domain_activation` | `all` | `all` | нет | `numeric` |

### Тест 2 · Top-K 5

Запрос: `Set basic_amplitude_envelope_attack_ms to 640 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `640`
Найдена: **да**; результат: `640`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **0**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `waveform_display_mode` | `envelope` | `peak` | да | `numeric` |
| 2 | `basic_amplitude_envelope_attack_ms` | `640` | `10` | да | `numeric` |
| 3 | `oscillator_pulse_width_modulation_source` | `envelope` | `lfo` | да | `numeric` |
| 4 | `convolution_reverb_predelay_offset_ms` | `268` | `0` | да | `value_anchor` |
| 5 | `basic_amplitude_envelope_release_ms` | `5530` | `200` | да | `value_anchor` |

### Тест 3 · Top-K 8

Запрос: `Set spectral_smoothing_attack_time to 48 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `48.0`
Найдена: **да**; результат: `48`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **0**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `waveform_display_mode` | `spectral` | `peak` | да | `numeric` |
| 2 | `spectral_smoothing_attack_time` | `48` | `2` | да | `numeric` |
| 3 | `spectral_bin_magnitude_smoothing_time_ms` | `255.3` | `20` | да | `value_anchor` |
| 4 | `spectral_transient_smearing_time_ms` | `253.5` | `0` | да | `value_anchor` |
| 5 | `lfo_step_interpolation_mode` | `smooth` | `linear` | да | `numeric` |
| 6 | `spectral_gate_lookahead_smoothing_ms` | `52.1` | `5` | да | `value_anchor` |
| 7 | `spectral_cepstral_smoothing_amount` | `0.53` | `0` | да | `value_anchor` |
| 8 | `layer_time_alignment_auto_detect_enable` | `on` | `off` | да | `numeric` |

### Тест 4 · Top-K 12

Запрос: `Set resonant_body_excitation_attack_damping to 0.84`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.84`
Найдена: **да**; результат: `0.84`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **12**, осталось default **0**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `oscillator_phase_distortion_curve` | `resonant` | `sine` | да | `numeric` |
| 2 | `resonant_body_excitation_attack_damping` | `0.84` | `0.3` | да | `numeric` |
| 3 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.5` | `0.2` | да | `value_anchor` |
| 4 | `reverb_damping_frequency_hz` | `200` | `4000` | да | `lexical` |
| 5 | `drum_shell_resonance_damping` | `0.52` | `0.2` | да | `value_anchor` |
| 6 | `reverb_late_reflection_highpass_resonance_db` | `5.2` | `0` | да | `value_anchor` |
| 7 | `reverb_late_reflection_highpass_resonance_q` | `4.5` | `0.707` | да | `value_anchor` |
| 8 | `reverb_late_reflection_decay_damping_slope_hz` | `5000` | `2500` | да | `value_anchor` |
| 9 | `modal_resonance_damping_ratio` | `0.504` | `0.1` | да | `value_anchor` |
| 10 | `acoustic_resonance_damping_factor` | `0.51` | `0.3` | да | `value_anchor` |
| 11 | `reverb_late_tail_damping_crossover_hz` | `7800` | `4000` | да | `value_anchor` |
| 12 | `algorithmic_reverb_decay_time_seconds` | `15` | `2.5` | да | `value_anchor` |

### Тест 5 · Top-K 20

Запрос: `Set stereo_width_chorus_flanger_depth to 0.95`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.95`
Найдена: **да**; результат: `0.9500000000000001`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **17**, осталось default **3**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `dynamic_eq_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 2 | `emotion_blend_secondary_type` | `anger` | `joy` | да | `numeric` |
| 3 | `oscillator_pulse_width_modulation_source` | `lfo` | `lfo` | нет | `numeric` |
| 4 | `projection_position_tracking_source` | `depth` | `pan` | да | `numeric` |
| 5 | `semantic_primary_emotion_tag` | `anger` | `neutral` | да | `numeric` |
| 6 | `spectral_gate_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 7 | `stereo_width_chorus_flanger_depth` | `0.9500000000000001` | `0.7` | да | `numeric` |
| 8 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1` | `0.8` | да | `value_anchor` |
| 9 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `130` | `150` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_base_delay_ms` | `10.5` | `5` | да | `value_anchor` |
| 11 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `value_anchor` |
| 12 | `wavefolder_symmetry_bias_lfo_depth` | `49` | `15` | да | `value_anchor` |
| 13 | `chorus_lfo_phase_offset_deg` | `279` | `90` | да | `lexical` |
| 14 | `reverb_modulation_stereo_phase_offset` | `189` | `0` | да | `lexical` |
| 15 | `flanger_lfo_waveform_symmetry` | `0` | `0` | нет | `value_anchor` |
| 16 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `186` | `90` | да | `value_anchor` |
| 17 | `flanger_lfo_depth_ratio` | `0.51` | `0.5` | да | `value_anchor` |
| 18 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `181` | `90` | да | `value_anchor` |
| 19 | `reverb_stereo_width_amount` | `1.01` | `1` | да | `value_anchor` |
| 20 | `chorus_stereo_phase_spread` | `279` | `90` | да | `lexical` |

### Тест 6 · Top-K 30

Запрос: `Set psychoacoustic_loudness_sharpness_ratio to 1.5`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `1.5`
Найдена: **да**; результат: `1.5`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **23**, осталось default **7**. Время: 3.8 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_oscillator_sync_switch` | `off` | `off` | нет | `numeric` |
| 2 | `layer_time_alignment_auto_detect_enable` | `on` | `off` | да | `numeric` |
| 3 | `live_modulation_lfo_sync_to_performer` | `off` | `off` | нет | `numeric` |
| 4 | `midi_local_control_switch` | `on` | `on` | нет | `numeric` |
| 5 | `subharmonic_synthesizer_mode` | `Off` | `Octave_Below` | да | `numeric` |
| 6 | `system_power_saving_mode` | `off` | `off` | нет | `numeric` |
| 7 | `psychoacoustic_loudness_sharpness_coupling_weight` | `0.52` | `0.2` | да | `value_anchor` |
| 8 | `psychoacoustic_loudness_sharpness_ratio` | `1.5` | `0.3` | да | `numeric` |
| 9 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `0.4` | `0` | да | `value_anchor` |
| 10 | `psychoacoustic_sharpness_sone_bark_slope_offset` | `0.05` | `0` | да | `value_anchor` |
| 11 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale` | `1.6500000000000001` | `1` | да | `value_anchor` |
| 12 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset_scale_factor` | `1.6` | `1` | да | `value_anchor` |
| 13 | `psychoacoustic_sharpness_sone_bark_slope_scale_factor_offset` | `0.02` | `0` | да | `value_anchor` |
| 14 | `psychoacoustic_sharpness_spectral_weighting_mode` | `Bismarck` | `Bismarck` | нет | `value_anchor` |
| 15 | `psychoacoustic_loudness_sharpness_bark_start_index` | `11` | `8` | да | `value_anchor` |
| 16 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0` | `0.5` | да | `lexical` |
| 17 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode` | `Fixed` | `Fixed` | нет | `value_anchor` |
| 18 | `psychoacoustic_loudness_sharpness_bark_weight_decay_threshold` | `15` | `16` | да | `value_anchor` |
| 19 | `psychoacoustic_tonalness_sharpness_weight` | `0.53` | `0.2` | да | `value_anchor` |
| 20 | `psychoacoustic_loudness_sharpness_bark_weight_decay_floor` | `0.28` | `0.05` | да | `value_anchor` |
| 21 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_ms` | `552` | `50` | да | `value_anchor` |
| 22 | `psychoacoustic_loudness_bark_band_snr_smoothing_ms` | `547` | `50` | да | `value_anchor` |
| 23 | `psychoacoustic_loudness_sharpness_acum` | `2.5500000000000003` | `1` | да | `value_anchor` |
| 24 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode_strategy` | `Fixed` | `Fixed` | нет | `value_anchor` |
| 25 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_factor` | `5.5` | `0.707` | да | `value_anchor` |
| 26 | `psychoacoustic_sharpness_high_frequency_weight_exponent` | `1.75` | `1.2` | да | `value_anchor` |
| 27 | `psychoacoustic_loudness_sharpness_bark_weight_decay_exponent` | `1.6500000000000001` | `1` | да | `value_anchor` |
| 28 | `psychoacoustic_loudness_bark_band_snr_smoothing_q_factor` | `5.5` | `0.707` | да | `value_anchor` |
| 29 | `psychoacoustic_loudness_sharpness_bark_weight_exponent` | `1.8` | `1.5` | да | `value_anchor` |
| 30 | `psychoacoustic_loudness_bark_band_snr_decay_q_boost_db_value` | `6.4` | `0` | да | `value_anchor` |

### Тест 7 · Top-K 50

Запрос: `Set stereo_width_coefficient_ratio to 1.6`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.6`
Найдена: **да**; результат: `1.6`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **46**, осталось default **4**. Время: 4.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spatial_ambisonic_decoder_format` | `binaural` | `binaural` | нет | `numeric` |
| 2 | `stereo_width_coefficient_ratio` | `1.6` | `1` | да | `numeric` |
| 3 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `value_anchor` |
| 4 | `mono_to_stereo_width_percent` | `103` | `100` | да | `value_anchor` |
| 5 | `stereo_width_expansion_coefficient` | `1.01` | `1` | да | `value_anchor` |
| 6 | `granular_grain_stereo_width_spread_ratio` | `0.52` | `0.5` | да | `value_anchor` |
| 7 | `phase_manipulation_stereo_width_expansion` | `100` | `100` | нет | `value_anchor` |
| 8 | `stereo_correlation_meter_width` | `1.04` | `1` | да | `value_anchor` |
| 9 | `multiband_stereo_width_low_frequency` | `1.08` | `0` | да | `value_anchor` |
| 10 | `spectral_gate_stereo_width_preservation` | `0.48` | `1` | да | `lexical` |
| 11 | `reverb_stereo_width_amount` | `1.05` | `1` | да | `value_anchor` |
| 12 | `texture_noise_spectral_correlation_stereo_width` | `0.03` | `0` | да | `value_anchor` |
| 13 | `dynamic_stereo_width_modulation_depth` | `51` | `0` | да | `value_anchor` |
| 14 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `value_anchor` |
| 15 | `organic_granulation_spray_stereo_width_ratio` | `0.72` | `0.2` | да | `lexical` |
| 16 | `stereo_width_chorus_flanger_depth` | `0.5` | `0.7` | да | `value_anchor` |
| 17 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `140` | `150` | да | `value_anchor` |
| 18 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.1` | `0.8` | да | `value_anchor` |
| 19 | `spatial_width_interaural_coherence` | `0.51` | `0.5` | да | `value_anchor` |
| 20 | `basic_stereo_imager_width_percent` | `102` | `100` | да | `value_anchor` |
| 21 | `spatial_width_compensation_frequency` | `100` | `500` | да | `lexical` |
| 22 | `grain_cloud_spread_stereo_width` | `103` | `100` | да | `value_anchor` |
| 23 | `spatial_binaural_listener_head_width_m` | `0.203` | `0.215` | да | `value_anchor` |
| 24 | `stereo_vectorscope_phase_rotation_deg` | `5` | `0` | да | `value_anchor` |
| 25 | `stereo_matrix_mid_side_balance_db` | `1.5` | `0` | да | `value_anchor` |
| 26 | `interaural_cross_correlation_index` | `0.51` | `0.8` | да | `value_anchor` |
| 27 | `spatial_width_frequency_dependent_amount` | `0.5` | `0` | да | `value_anchor` |
| 28 | `stereo_mid_side_balance_ratio` | `0.53` | `0.5` | да | `value_anchor` |
| 29 | `posture_lean_angle_stereo_width_control` | `3` | `0` | да | `value_anchor` |
| 30 | `interaural_time_difference_max_ms` | `0.52` | `0.7` | да | `value_anchor` |
| 31 | `hrtf_binaural_torso_reflection_delay_ms` | `2.75` | `1.2` | да | `value_anchor` |
| 32 | `stereo_decorrelation_time_ms` | `38.800000000000004` | `12.5` | да | `lexical` |
| 33 | `hrtf_binaural_elevation_filter_notch_center_hz` | `10200` | `8500` | да | `value_anchor` |
| 34 | `sub_bass_stereo_decorrelation_index` | `0.54` | `0` | да | `value_anchor` |
| 35 | `multitap_delay_cross_quadrature_phase_offset_deg` | `190` | `90` | да | `value_anchor` |
| 36 | `spatial_bass_mono_crossover_hz` | `20` | `120` | да | `lexical` |
| 37 | `high_frequency_stereo_crossover` | `8900` | `8000` | да | `value_anchor` |
| 38 | `scene_width_expansion` | `99` | `100` | да | `value_anchor` |
| 39 | `multitap_delay_spatial_pan_spread_width` | `53` | `85` | да | `value_anchor` |
| 40 | `organic_granulation_spray_pan_width_ratio` | `0.51` | `0.5` | да | `value_anchor` |
| 41 | `spatial_width_phase_inversion_amount` | `0.52` | `0` | да | `lexical` |
| 42 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `193` | `90` | да | `value_anchor` |
| 43 | `noise_shaping_correlation_coefficient` | `0.06` | `0` | да | `value_anchor` |
| 44 | `vocal_allocation_matrix_layer_pan_binaural_decorrelation` | `0.52` | `0.85` | да | `value_anchor` |
| 45 | `vocal_vector_spatial_width_s` | `5` | `7` | да | `value_anchor` |
| 46 | `iacc_interaural_cross_correlation_envelope` | `0.51` | `0.2` | да | `value_anchor` |
| 47 | `binaural_decorrelation_bandwidth_hz` | `4200` | `2500` | да | `value_anchor` |
| 48 | `stereo_haas_delay_time_ms` | `26` | `15` | да | `value_anchor` |
| 49 | `hrtf_3d_elevation_azimuth_matrix_blend` | `0.52` | `0.5` | да | `value_anchor` |
| 50 | `binaural_head_radius_meters` | `0.18` | `0.0875` | да | `value_anchor` |

### Тест 8 · Top-K 5

Запрос: `Установи acoustic_feature_attack_density на 0.18`

Цель: `acoustic_feature_attack_density` → ожидалось `0.18`
Найдена: **да**; результат: `0.18`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **0**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.18` | `0.5` | да | `numeric` |
| 2 | `psychoacoustic_loudness_crossover_freq_hz` | `1970` | `1000` | да | `value_anchor` |
| 3 | `head_shadow_high_freq_attenuation_db` | `12.5` | `8` | да | `value_anchor` |
| 4 | `room_acoustic_air_attenuation_frequency_hz` | `10860` | `8000` | да | `value_anchor` |
| 5 | `psychoacoustic_loudness_bark_band_center_freq_hz` | `6673` | `1000` | да | `value_anchor` |

### Тест 9 · Top-K 8

Запрос: `Установи basic_amplitude_envelope_attack_ms ровно 1250 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `1250`
Найдена: **да**; результат: `1250`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **8**, осталось default **0**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `waveform_display_mode` | `envelope` | `peak` | да | `numeric` |
| 2 | `oscillator_pulse_width_modulation_source` | `envelope` | `lfo` | да | `numeric` |
| 3 | `basic_amplitude_envelope_attack_ms` | `1250` | `10` | да | `numeric` |
| 4 | `basic_amplitude_envelope_release_ms` | `5380` | `200` | да | `value_anchor` |
| 5 | `allpass_reverb_loop_delay_time_ms` | `108` | `35` | да | `value_anchor` |
| 6 | `wavetable_spectral_foldover_attenuation_db` | `-69` | `-72` | да | `value_anchor` |
| 7 | `reverb_tail_modulation_depth_ms` | `26.200000000000003` | `2` | да | `value_anchor` |
| 8 | `multi_tap_delay_amplitude_decay_slope` | `-47` | `-6` | да | `value_anchor` |

### Тест 10 · Top-K 12

Запрос: `Установи spectral_smoothing_attack_time ровно 155 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `155.0`
Найдена: **да**; результат: `155`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **10**, осталось default **2**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_cepstral_smoothing_amount` | `0.53` | `0` | да | `value_anchor` |
| 2 | `waveform_display_mode` | `spectral` | `peak` | да | `numeric` |
| 3 | `visual_effect_frequency_domain_activation` | `all` | `all` | нет | `numeric` |
| 4 | `spectral_smoothing_attack_time` | `155` | `2` | да | `numeric` |
| 5 | `sympathetic_resonance_harmonic_series_activation` | `all` | `all` | нет | `numeric` |
| 6 | `spectral_flux_smoothing_time_ms` | `513` | `50` | да | `value_anchor` |
| 7 | `spectral_flatness_measure_smoothing_window_ms` | `258` | `50` | да | `value_anchor` |
| 8 | `spectral_bin_magnitude_smoothing_time_ms` | `253.4` | `20` | да | `value_anchor` |
| 9 | `lfo_step_interpolation_mode` | `smooth` | `linear` | да | `numeric` |
| 10 | `spectral_energy_flux_smoothing_window_ms` | `99.5` | `20` | да | `value_anchor` |
| 11 | `spectral_gate_lookahead_smoothing_ms` | `51.7` | `5` | да | `value_anchor` |
| 12 | `spectral_leakage_windowing_attenuation_db` | `87` | `80` | да | `value_anchor` |

### Тест 11 · Top-K 20

Запрос: `Установи resonant_body_excitation_attack_damping на 0.08`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.08`
Найдена: **да**; результат: `0.08`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **20**, осталось default **0**. Время: 3.8 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `oscillator_phase_distortion_curve` | `resonant` | `sine` | да | `numeric` |
| 2 | `spatial_pan_law_attenuation_db` | `0.0` | `-3.0` | да | `numeric` |
| 3 | `drum_shell_resonance_damping` | `0.49` | `0.2` | да | `value_anchor` |
| 4 | `acoustic_resonance_damping_factor` | `0.49` | `0.3` | да | `value_anchor` |
| 5 | `modal_resonance_damping_ratio` | `0.484` | `0.1` | да | `value_anchor` |
| 6 | `resonant_body_excitation_attack_damping` | `0.08` | `0.3` | да | `numeric` |
| 7 | `hybrid_resonance_damping_factor` | `0.47000000000000003` | `0.3` | да | `value_anchor` |
| 8 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.48` | `0.2` | да | `value_anchor` |
| 9 | `acid_mud_viscosity_resonance_damping` | `0.48` | `0.25` | да | `value_anchor` |
| 10 | `reverb_late_reflection_highpass_resonance_db` | `4.9` | `0` | да | `value_anchor` |
| 11 | `reverb_late_reflection_highpass_resonance_q` | `4.3` | `0.707` | да | `value_anchor` |
| 12 | `reverb_damping_frequency_hz` | `200` | `4000` | да | `lexical` |
| 13 | `subharmonic_resonance_damping_factor` | `0.48` | `0.5` | да | `value_anchor` |
| 14 | `reverb_late_reflection_decay_damping_slope_hz` | `4800` | `2500` | да | `value_anchor` |
| 15 | `reverb_late_tail_damping_crossover_hz` | `7500` | `4000` | да | `value_anchor` |
| 16 | `reverb_diffuse_field_absorption_ratio` | `0.46` | `0.5` | да | `value_anchor` |
| 17 | `algorithmic_reverb_decay_time_seconds` | `14.4` | `2.5` | да | `value_anchor` |
| 18 | `reverb_high_frequency_damping` | `0.45` | `0.5` | да | `value_anchor` |
| 19 | `acoustic_structural_damping_loss_factor` | `0.048` | `0.005` | да | `value_anchor` |
| 20 | `vocal_subglottal_resonance_damping_factor` | `0.5` | `0.2` | да | `value_anchor` |

### Тест 12 · Top-K 30

Запрос: `Установи stereo_width_chorus_flanger_depth на 0.15`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.15`
Найдена: **да**; результат: `0.15000000000000002`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **28**, осталось default **2**. Время: 3.8 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `dynamic_eq_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 2 | `emotion_blend_secondary_type` | `anger` | `joy` | да | `numeric` |
| 3 | `oscillator_pulse_width_modulation_source` | `lfo` | `lfo` | нет | `numeric` |
| 4 | `pattern_alignment_merge_style` | `fade` | `overlap` | да | `numeric` |
| 5 | `projection_position_tracking_source` | `depth` | `pan` | да | `numeric` |
| 6 | `semantic_primary_emotion_tag` | `anger` | `neutral` | да | `numeric` |
| 7 | `spectral_gate_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 8 | `stereo_width_chorus_flanger_depth` | `0.15000000000000002` | `0.7` | да | `numeric` |
| 9 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1` | `0.8` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `130` | `150` | да | `value_anchor` |
| 11 | `liquid_scratch_chorus_flanger_base_delay_ms` | `10` | `5` | да | `value_anchor` |
| 12 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `value_anchor` |
| 13 | `chorus_lfo_phase_offset_deg` | `279` | `90` | да | `lexical` |
| 14 | `flanger_lfo_waveform_symmetry` | `-0.03` | `0` | да | `value_anchor` |
| 15 | `reverb_stereo_width_amount` | `0.97` | `1` | да | `value_anchor` |
| 16 | `synth_unison_stereo_phase_spread` | `170` | `90` | да | `value_anchor` |
| 17 | `flanger_lfo_depth_ratio` | `0.49` | `0.5` | да | `value_anchor` |
| 18 | `wavefolder_symmetry_bias_lfo_depth` | `47` | `15` | да | `value_anchor` |
| 19 | `chorus_stereo_phase_spread` | `279` | `90` | да | `lexical` |
| 20 | `reverb_tail_modulation_depth_ms` | `25` | `2` | да | `value_anchor` |
| 21 | `stereo_pan_lfo_speed` | `9.75` | `1` | да | `value_anchor` |
| 22 | `reverb_modulation_stereo_phase_offset` | `189` | `0` | да | `lexical` |
| 23 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `181` | `90` | да | `value_anchor` |
| 24 | `synth_pulse_width_lfo_modulation_speed` | `9.9` | `1` | да | `value_anchor` |
| 25 | `spatial_reverb_tail_stereo_rotation_rate` | `4.84` | `0.2` | да | `value_anchor` |
| 26 | `asymmetric_waveshaper_folding_threshold` | `0.53` | `0.7` | да | `value_anchor` |
| 27 | `chorus_feedback_amount` | `0.5` | `0` | да | `lexical` |
| 28 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.49` | `0.05` | да | `value_anchor` |
| 29 | `chaotic_reverb_intensity_ratio` | `0.48` | `0` | да | `value_anchor` |
| 30 | `reverb_modulation_depth_amount` | `0.49` | `0.1` | да | `value_anchor` |

### Тест 13 · Top-K 50

Запрос: `Установи psychoacoustic_loudness_sharpness_ratio на 0.2`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `0.2`
Найдена: **да**; результат: `0.2`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **43**, осталось default **7**. Время: 4.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_oscillator_sync_switch` | `off` | `off` | нет | `numeric` |
| 2 | `dynamic_eq_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 3 | `layer_time_alignment_auto_detect_enable` | `on` | `off` | да | `numeric` |
| 4 | `live_modulation_lfo_sync_to_performer` | `off` | `off` | нет | `numeric` |
| 5 | `midi_local_control_switch` | `on` | `on` | нет | `numeric` |
| 6 | `oscillator_pulse_width_modulation_source` | `lfo` | `lfo` | нет | `numeric` |
| 7 | `spectral_gate_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 8 | `subharmonic_synthesizer_mode` | `Off` | `Octave_Below` | да | `numeric` |
| 9 | `system_power_saving_mode` | `off` | `off` | нет | `numeric` |
| 10 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode` | `Fixed` | `Fixed` | нет | `value_anchor` |
| 11 | `psychoacoustic_loudness_sharpness_bark_start_index` | `11` | `8` | да | `value_anchor` |
| 12 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_mode_strategy` | `Fixed` | `Fixed` | нет | `value_anchor` |
| 13 | `psychoacoustic_loudness_sharpness_bark_weight_decay_threshold` | `14` | `16` | да | `value_anchor` |
| 14 | `psychoacoustic_loudness_sharpness_bark_weight_decay_floor` | `0.27` | `0.05` | да | `value_anchor` |
| 15 | `psychoacoustic_loudness_sharpness_bark_weight_decay_exponent` | `1.55` | `1` | да | `value_anchor` |
| 16 | `psychoacoustic_loudness_sharpness_bark_weight_exponent` | `1.75` | `1.5` | да | `value_anchor` |
| 17 | `psychoacoustic_loudness_sharpness_bark_weight_slope_type` | `Exponential` | `Linear` | да | `value_anchor` |
| 18 | `psychoacoustic_loudness_sharpness_coupling_weight` | `0.5` | `0.2` | да | `value_anchor` |
| 19 | `psychoacoustic_loudness_sharpness_acum` | `2.45` | `1` | да | `value_anchor` |
| 20 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0` | `0.5` | да | `lexical` |
| 21 | `psychoacoustic_loudness_sharpness_bark_weight_gain_db` | `-0.4` | `0` | да | `value_anchor` |
| 22 | `psychoacoustic_loudness_sharpness_bark_end_index` | `17` | `24` | да | `value_anchor` |
| 23 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `-0.1` | `0` | да | `value_anchor` |
| 24 | `psychoacoustic_loudness_sharpness_bark_weight_decay_scaling` | `2.6500000000000004` | `1` | да | `value_anchor` |
| 25 | `psychoacoustic_loudness_sharpness_sone_exponent` | `1` | `0.8` | да | `value_anchor` |
| 26 | `psychoacoustic_loudness_sharpness_sone_weight_factor` | `0` | `0.5` | да | `lexical` |
| 27 | `psychoacoustic_loudness_sharpness_bark_weight_decay_floor_scaling_factor` | `2.75` | `1` | да | `value_anchor` |
| 28 | `psychoacoustic_loudness_sharpness_slope_db_per_bark` | `1.5` | `0.25` | да | `value_anchor` |
| 29 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_scaling_factor` | `2.6` | `1` | да | `value_anchor` |
| 30 | `psychoacoustic_loudness_sharpness_bark_weight_slope_scaling` | `2.5500000000000003` | `1` | да | `value_anchor` |
| 31 | `psychoacoustic_loudness_sharpness_integration_time_ms` | `491` | `50` | да | `value_anchor` |
| 32 | `psychoacoustic_loudness_sharpness_weight_factor` | `2.45` | `1` | да | `value_anchor` |
| 33 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate` | `1.05` | `0.1` | да | `value_anchor` |
| 34 | `psychoacoustic_loudness_sharpness_ratio` | `0.2` | `0.3` | да | `numeric` |
| 35 | `psychoacoustic_loudness_sharpness_sone_threshold` | `32.5` | `4` | да | `value_anchor` |
| 36 | `psychoacoustic_loudness_sharpness_bark_weight_decay_rate_factor` | `2.6500000000000004` | `1` | да | `value_anchor` |
| 37 | `psychoacoustic_loudness_sharpness_bark_weight_slope_factor` | `2.5500000000000003` | `1` | да | `value_anchor` |
| 38 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_ms` | `528` | `50` | да | `value_anchor` |
| 39 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_factor` | `5.300000000000001` | `0.707` | да | `value_anchor` |
| 40 | `psychoacoustic_loudness_bark_band_snr_smoothing_ms` | `522` | `50` | да | `value_anchor` |
| 41 | `psychoacoustic_loudness_bark_band_snr_decay_q_boost_db_value` | `6.1000000000000005` | `0` | да | `value_anchor` |
| 42 | `psychoacoustic_loudness_bark_band_snr_smoothing_q_factor` | `5.2` | `0.707` | да | `value_anchor` |
| 43 | `psychoacoustic_loudness_bark_band_snr_decay_ms` | `529` | `100` | да | `value_anchor` |
| 44 | `psychoacoustic_loudness_bark_band_snr_decay_q_factor` | `5.300000000000001` | `0.707` | да | `value_anchor` |
| 45 | `psychoacoustic_loudness_bark_band_snr_q_factor` | `5.2` | `1` | да | `value_anchor` |
| 46 | `psychoacoustic_loudness_bark_band_snr_decay_q_factor_boost_db` | `6` | `0` | да | `value_anchor` |
| 47 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_boost_db_final` | `6` | `0` | да | `value_anchor` |
| 48 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_boost_db_absolute` | `5.9` | `0` | да | `value_anchor` |
| 49 | `psychoacoustic_loudness_bark_band_snr_smoothing_decay_rate_hz` | `53.6` | `10` | да | `value_anchor` |
| 50 | `psychoacoustic_loudness_bark_band_snr_decay_smoothing_q_boost_db` | `5.9` | `0` | да | `value_anchor` |

### Тест 14 · Top-K 3

Запрос: `Установи stereo_width_coefficient_ratio на 0.35`

Цель: `stereo_width_coefficient_ratio` → ожидалось `0.35`
Найдена: **да**; результат: `0.35000000000000003`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **1**, осталось default **2**. Время: 3.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spatial_ambisonic_decoder_format` | `binaural` | `binaural` | нет | `numeric` |
| 2 | `stereo_width_coefficient_ratio` | `0.35000000000000003` | `1` | да | `numeric` |
| 3 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `value_anchor` |

### Тест 15 · Top-K 8

Запрос: `acoustic_feature_attack_density: 0.93`

Цель: `acoustic_feature_attack_density` → ожидалось `0.93`
Найдена: **да**; результат: `0.93`; default: `0.5`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **7**, осталось default **1**. Время: 3.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_oscillator_waveform_shape` | `noise` | `sawtooth` | да | `numeric` |
| 2 | `light_brightness_tracking_source` | `noise` | `kick` | да | `numeric` |
| 3 | `vocoder_carrier_synthesis_wave_type` | `noise` | `sawtooth` | да | `numeric` |
| 4 | `acoustic_feature_attack_density` | `0.93` | `0.5` | да | `numeric` |
| 5 | `whisper_phonetic_noise_spectral_tilt` | `0.5` | `-3` | да | `value_anchor` |
| 6 | `vocal_aspiration_breath_noise_friction_ratio` | `-18` | `-18` | нет | `value_anchor` |
| 7 | `vocal_vwsp_whisper_formant_air_turbulence_fx4_fmt1` | `-12` | `0` | да | `value_anchor` |
| 8 | `chaos_whisper_mix_resonance` | `4.7` | `0.707` | да | `value_anchor` |

### Тест 16 · Top-K 12

Запрос: `basic_amplitude_envelope_attack_ms: 80`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `80`
Найдена: **да**; результат: `80`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **7**, осталось default **5**. Время: 3.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_oscillator_sync_switch` | `off` | `off` | нет | `numeric` |
| 2 | `dynamic_eq_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 3 | `layer_time_alignment_auto_detect_enable` | `on` | `off` | да | `numeric` |
| 4 | `live_modulation_lfo_sync_to_performer` | `off` | `off` | нет | `numeric` |
| 5 | `midi_local_control_switch` | `on` | `on` | нет | `numeric` |
| 6 | `oscillator_pulse_width_modulation_source` | `lfo` | `lfo` | нет | `numeric` |
| 7 | `spectral_gate_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 8 | `subharmonic_synthesizer_mode` | `Off` | `Octave_Below` | да | `numeric` |
| 9 | `system_power_saving_mode` | `off` | `off` | нет | `numeric` |
| 10 | `waveform_display_mode` | `envelope` | `peak` | да | `numeric` |
| 11 | `wavetable_index_sweep_lfo_modulation_depth` | `50` | `25` | да | `value_anchor` |
| 12 | `basic_amplitude_envelope_attack_ms` | `80` | `10` | да | `numeric` |

### Тест 17 · Top-K 20

Запрос: `spectral_smoothing_attack_time: 12.5`

Цель: `spectral_smoothing_attack_time` → ожидалось `12.5`
Найдена: **да**; результат: `12.5`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **14**, осталось default **6**. Время: 3.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_oscillator_sync_switch` | `off` | `off` | нет | `numeric` |
| 2 | `basic_oscillator_waveform_shape` | `noise` | `sawtooth` | да | `numeric` |
| 3 | `cpu_affinity_core_assignment` | `all` | `auto` | да | `numeric` |
| 4 | `layer_time_alignment_auto_detect_enable` | `on` | `off` | да | `numeric` |
| 5 | `lfo_step_interpolation_mode` | `smooth` | `linear` | да | `numeric` |
| 6 | `light_brightness_tracking_source` | `noise` | `kick` | да | `numeric` |
| 7 | `live_modulation_lfo_sync_to_performer` | `off` | `off` | нет | `numeric` |
| 8 | `midi_local_control_switch` | `on` | `on` | нет | `numeric` |
| 9 | `pattern_alignment_merge_style` | `fade` | `overlap` | да | `numeric` |
| 10 | `subharmonic_synthesizer_mode` | `Off` | `Octave_Below` | да | `numeric` |
| 11 | `sympathetic_resonance_harmonic_series_activation` | `all` | `all` | нет | `numeric` |
| 12 | `system_power_saving_mode` | `off` | `off` | нет | `numeric` |
| 13 | `visual_effect_frequency_domain_activation` | `all` | `all` | нет | `numeric` |
| 14 | `vocoder_carrier_synthesis_wave_type` | `noise` | `sawtooth` | да | `numeric` |
| 15 | `waveform_display_mode` | `spectral` | `peak` | да | `numeric` |
| 16 | `spectral_smoothing_attack_time` | `12.5` | `2` | да | `numeric` |
| 17 | `spectral_cepstral_smoothing_amount` | `0.52` | `0` | да | `value_anchor` |
| 18 | `spectral_band_crossfade_width_octaves` | `1.92` | `0.5` | да | `value_anchor` |
| 19 | `spectral_flatness_measure_smoothing_factor` | `0.5` | `0.1` | да | `value_anchor` |
| 20 | `a5_adapt_density_high_noise_smoothing_decay` | `0.5` | `0.85` | да | `value_anchor` |

### Тест 18 · Top-K 30

Запрос: `resonant_body_excitation_attack_damping: 0.67`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.67`
Найдена: **да**; результат: `0.67`; default: `0.3`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **30**, осталось default **0**. Время: 4.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `oscillator_phase_distortion_curve` | `resonant` | `sine` | да | `numeric` |
| 2 | `resonant_body_excitation_attack_damping` | `0.67` | `0.3` | да | `numeric` |
| 3 | `drum_shell_resonance_damping` | `0.52` | `0.2` | да | `value_anchor` |
| 4 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.51` | `0.2` | да | `value_anchor` |
| 5 | `hybrid_resonance_damping_factor` | `0.5` | `0.3` | да | `value_anchor` |
| 6 | `modal_resonance_damping_ratio` | `0.512` | `0.1` | да | `value_anchor` |
| 7 | `acoustic_resonance_damping_factor` | `0.52` | `0.3` | да | `value_anchor` |
| 8 | `acoustic_room_mode_damping` | `0.517` | `0.2` | да | `value_anchor` |
| 9 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `4.800000000000001` | `0.707` | да | `value_anchor` |
| 10 | `acid_mud_viscosity_resonance_damping` | `0.51` | `0.25` | да | `value_anchor` |
| 11 | `reverb_late_reflection_highpass_resonance_q` | `4.6000000000000005` | `0.707` | да | `value_anchor` |
| 12 | `resonator_decay_time_seconds` | `10.21` | `1` | да | `value_anchor` |
| 13 | `reverb_late_reflection_highpass_resonance_db` | `5.300000000000001` | `0` | да | `value_anchor` |
| 14 | `subharmonic_resonance_damping_factor` | `0.51` | `0.5` | да | `value_anchor` |
| 15 | `reverb_damping_frequency_hz` | `10045` | `4000` | да | `value_anchor` |
| 16 | `acoustic_structural_resonance_q_factor` | `48.300000000000004` | `5` | да | `value_anchor` |
| 17 | `reverb_late_reflection_decay_damping_slope_hz` | `5050` | `2500` | да | `value_anchor` |
| 18 | `cavity_resonance_volume_liters` | `491.6` | `10` | да | `value_anchor` |
| 19 | `physical_model_a_material_damping` | `0.51` | `0.1` | да | `value_anchor` |
| 20 | `reverb_late_tail_damping_crossover_hz` | `7950` | `4000` | да | `value_anchor` |
| 21 | `room_acoustic_wall_reflection_attenuation_q_factor_resonance` | `4.9` | `0.707` | да | `value_anchor` |
| 22 | `resonator_wall_absorption_coefficient` | `0.49` | `0.1` | да | `value_anchor` |
| 23 | `resonator_excitation_noise_mix` | `0.46` | `0.2` | да | `value_anchor` |
| 24 | `vocal_subglottal_resonance_damping_factor` | `0.52` | `0.2` | да | `value_anchor` |
| 25 | `comb_filter_damped_feedback_decay_time_ms` | `2583` | `200` | да | `value_anchor` |
| 26 | `modal_filter_resonance_q_factor` | `480.5` | `10` | да | `value_anchor` |
| 27 | `concrete_shaft_transverse_mode_damping_db` | `24` | `18.5` | да | `value_anchor` |
| 28 | `comb_filter_feedback_decay_time_ms` | `2500` | `500` | да | `value_anchor` |
| 29 | `room_boundary_low_frequency_damping_hz` | `165` | `80` | да | `value_anchor` |
| 30 | `reverb_diffuse_field_absorption_ratio` | `0.49` | `0.5` | да | `value_anchor` |

### Тест 19 · Top-K 50

Запрос: `stereo_width_chorus_flanger_depth: 0.40`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.4`
Найдена: **да**; результат: `0.4`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **46**, осталось default **4**. Время: 4.1 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `dynamic_eq_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 2 | `emotion_blend_secondary_type` | `anger` | `joy` | да | `numeric` |
| 3 | `oscillator_pulse_width_modulation_source` | `lfo` | `lfo` | нет | `numeric` |
| 4 | `projection_position_tracking_source` | `depth` | `pan` | да | `numeric` |
| 5 | `semantic_primary_emotion_tag` | `anger` | `neutral` | да | `numeric` |
| 6 | `spectral_gate_sidechain_source` | `lfo` | `internal` | да | `numeric` |
| 7 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1` | `0.8` | да | `value_anchor` |
| 8 | `stereo_width_chorus_flanger_depth` | `0.4` | `0.7` | да | `numeric` |
| 9 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `130` | `150` | да | `value_anchor` |
| 10 | `liquid_scratch_chorus_flanger_base_delay_ms` | `10.5` | `5` | да | `value_anchor` |
| 11 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `value_anchor` |
| 12 | `flanger_lfo_waveform_symmetry` | `-0.01` | `0` | да | `value_anchor` |
| 13 | `reverb_stereo_width_amount` | `1` | `1` | нет | `value_anchor` |
| 14 | `synth_unison_stereo_phase_spread` | `174` | `90` | да | `value_anchor` |
| 15 | `wavefolder_symmetry_bias_lfo_depth` | `48` | `15` | да | `value_anchor` |
| 16 | `flanger_lfo_depth_ratio` | `0.5` | `0.5` | нет | `value_anchor` |
| 17 | `reverb_tail_modulation_depth_ms` | `25.6` | `2` | да | `value_anchor` |
| 18 | `chorus_stereo_phase_spread` | `279` | `90` | да | `lexical` |
| 19 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `185` | `90` | да | `value_anchor` |
| 20 | `chorus_feedback_amount` | `0.5` | `0` | да | `lexical` |
| 21 | `chaotic_reverb_intensity_ratio` | `0.49` | `0` | да | `value_anchor` |
| 22 | `synth_pulse_width_lfo_modulation_speed` | `10.100000000000001` | `1` | да | `value_anchor` |
| 23 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.5` | `0.05` | да | `value_anchor` |
| 24 | `spatial_reverb_tail_stereo_rotation_rate` | `4.95` | `0.2` | да | `value_anchor` |
| 25 | `reverb_modulation_stereo_phase_offset` | `189` | `0` | да | `lexical` |
| 26 | `stereo_pan_lfo_speed` | `10` | `1` | да | `value_anchor` |
| 27 | `chorus_lfo_phase_offset_deg` | `279` | `90` | да | `lexical` |
| 28 | `asymmetric_waveshaper_folding_threshold` | `0.54` | `0.7` | да | `value_anchor` |
| 29 | `simple_panning_lfo_depth_percent` | `51` | `0` | да | `value_anchor` |
| 30 | `reverb_modulation_depth_amount` | `0.5` | `0.1` | да | `value_anchor` |
| 31 | `chorus_delay_time_spread_ms` | `24.6` | `15` | да | `value_anchor` |
| 32 | `chorus_delay_time_base_ms` | `25.200000000000003` | `20` | да | `value_anchor` |
| 33 | `wavefolding_stages_count` | `2.5` | `0` | да | `value_anchor` |
| 34 | `basic_flanger_rate_hz` | `4.86` | `0.5` | да | `value_anchor` |
| 35 | `resonant_wavefolder_symmetry_lfo_phase_offset_deg` | `179` | `90` | да | `value_anchor` |
| 36 | `reverb_feedback_phase_rotation` | `-1` | `0` | да | `value_anchor` |
| 37 | `flanger_delay_line_min_time_ms` | `10.3` | `1` | да | `value_anchor` |
| 38 | `flanger_feedback_polarity_inversion` | `alternating` | `positive` | да | `value_anchor` |
| 39 | `basic_chorus_rate_hz` | `4.9` | `1.5` | да | `value_anchor` |
| 40 | `convolution_reverb_dry_wet_mix_phase_alignment` | `4` | `0` | да | `value_anchor` |
| 41 | `reverb_modulation_depth_ms` | `5.05` | `0.5` | да | `value_anchor` |
| 42 | `reverb_diffusion_shimmer_pitch` | `20` | `1200` | да | `value_anchor` |
| 43 | `mono_to_stereo_width_percent` | `98` | `100` | да | `value_anchor` |
| 44 | `reverb_modulation_frequency_hz` | `9.950000000000001` | `0.5` | да | `value_anchor` |
| 45 | `vocal_shimmer_reverb_octave_pitch_shift_semitones` | `0` | `12` | да | `value_anchor` |
| 46 | `basic_chorus_delay_ms` | `25.3` | `15` | да | `value_anchor` |
| 47 | `tremor_thermoacoustic_divergence_wavefolding_mix` | `0.5` | `0.05` | да | `value_anchor` |
| 48 | `flanger_through_zero_amount` | `0.5` | `0` | да | `value_anchor` |
| 49 | `reverb_late_reflection_decay_asymmetry_ratio` | `0.51` | `0` | да | `value_anchor` |
| 50 | `subtractive_filter_resonance_lfo_depth_ratio` | `0.52` | `0` | да | `value_anchor` |

### Тест 20 · Top-K 100

Запрос: `stereo_width_coefficient_ratio: 1.85`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.85`
Найдена: **да**; результат: `1.85`; default: `1`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **92**, осталось default **8**. Время: 4.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1.85` | `1` | да | `numeric` |
| 2 | `stereo_pan_to_horizontal_position_scale` | `103` | `100` | да | `value_anchor` |
| 3 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `value_anchor` |
| 4 | `stereo_width_expansion_ratio` | `2` | `1` | да | `lexical` |
| 5 | `stereo_correlation_meter_width` | `1.03` | `1` | да | `value_anchor` |
| 6 | `stereo_matrix_mid_side_balance_db` | `1` | `0` | да | `value_anchor` |
| 7 | `stereo_mid_side_balance_ratio` | `0.52` | `0.5` | да | `value_anchor` |
| 8 | `granular_grain_stereo_width_spread_ratio` | `0.51` | `0.5` | да | `value_anchor` |
| 9 | `mono_to_stereo_width_percent` | `102` | `100` | да | `value_anchor` |
| 10 | `phase_manipulation_stereo_width_expansion` | `98` | `100` | да | `value_anchor` |
| 11 | `stereo_width_chorus_flanger_depth` | `0.5` | `0.7` | да | `value_anchor` |
| 12 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `130` | `150` | да | `value_anchor` |
| 13 | `multiband_stereo_width_low_frequency` | `1.07` | `0` | да | `value_anchor` |
| 14 | `posture_lean_angle_stereo_width_control` | `2` | `0` | да | `value_anchor` |
| 15 | `dynamic_stereo_width_modulation_depth` | `50` | `0` | да | `value_anchor` |
| 16 | `spectral_gate_stereo_width_preservation` | `0.52` | `1` | да | `value_anchor` |
| 17 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `1.1` | `0.8` | да | `value_anchor` |
| 18 | `grain_cloud_spread_stereo_width` | `102` | `100` | да | `value_anchor` |
| 19 | `reverb_stereo_width_amount` | `1.03` | `1` | да | `value_anchor` |
| 20 | `scene_width_expansion` | `98` | `100` | да | `value_anchor` |
| 21 | `organic_granulation_spray_stereo_width_ratio` | `0.72` | `0.2` | да | `lexical` |
| 22 | `texture_noise_spectral_correlation_stereo_width` | `0.02` | `0` | да | `value_anchor` |
| 23 | `spatial_width_frequency_dependent_amount` | `0.5` | `0` | да | `value_anchor` |
| 24 | `high_frequency_stereo_crossover` | `8800` | `8000` | да | `value_anchor` |
| 25 | `basic_stereo_imager_width_percent` | `101` | `100` | да | `value_anchor` |
| 26 | `spatial_width_compensation_frequency` | `5076` | `500` | да | `value_anchor` |
| 27 | `organic_granulation_spray_pan_width_ratio` | `0.5` | `0.5` | нет | `value_anchor` |
| 28 | `multitap_delay_spatial_pan_spread_width` | `52` | `85` | да | `value_anchor` |
| 29 | `spatial_width_phase_inversion_amount` | `0.51` | `0` | да | `value_anchor` |
| 30 | `sub_bass_stereo_decorrelation_index` | `0.54` | `0` | да | `value_anchor` |
| 31 | `stereo_decorrelation_time_ms` | `38.800000000000004` | `12.5` | да | `lexical` |
| 32 | `stereo_vectorscope_phase_rotation_deg` | `2` | `0` | да | `value_anchor` |
| 33 | `psychoacoustic_binaural_width_ratio` | `0.99` | `1` | да | `value_anchor` |
| 34 | `stereo_rotation_angle` | `4` | `0` | да | `value_anchor` |
| 35 | `noise_shaping_correlation_coefficient` | `0.05` | `0` | да | `value_anchor` |
| 36 | `organic_granulation_spray_stereo_phase_decay_smoothing_ms_absolute` | `0` | `20` | да | `lexical` |
| 37 | `multitap_delay_cross_quadrature_phase_offset_deg` | `187` | `90` | да | `value_anchor` |
| 38 | `granular_pan_spray_width` | `51` | `50` | да | `value_anchor` |
| 39 | `asymmetric_feedback_cross_channel_phase_rotation_speed` | `370` | `45` | да | `value_anchor` |
| 40 | `asymmetric_feedback_cross_channel_phase_bleed` | `51` | `35` | да | `value_anchor` |
| 41 | `asymmetric_delay_cross_channel_gain_imbalance_dB` | `0.30000000000000004` | `1.5` | да | `value_anchor` |
| 42 | `organic_granulation_spray_stereo_phase_width_ratio` | `0.5` | `0.5` | нет | `value_anchor` |
| 43 | `vinyl_groove_vertical_horizontal_crosstalk_db` | `-35.5` | `-30` | да | `value_anchor` |
| 44 | `organic_granulation_spray_stereo_phase_decay_smoothing_ms_value` | `0` | `20` | да | `lexical` |
| 45 | `vocal_vector_spatial_width_s` | `4` | `7` | да | `value_anchor` |
| 46 | `multitap_delay_cross_channel_phase_inversion_balance` | `0.53` | `0.5` | да | `value_anchor` |
| 47 | `granular_pan_spray_width_ratio` | `0.5` | `0.2` | да | `value_anchor` |
| 48 | `organic_granulation_spray_stereo_phase_jitter_deg` | `0` | `0` | нет | `lexical` |
| 49 | `spatial_binaural_azimuth_angle_scale` | `2` | `1` | да | `lexical` |
| 50 | `stereo_mid_side_balance` | `0.07` | `0` | да | `value_anchor` |
| 51 | `asymmetric_delay_cross_channel_lfo_phase_offset` | `189` | `90` | да | `value_anchor` |
| 52 | `spatial_bass_mono_crossover_hz` | `20` | `120` | да | `lexical` |
| 53 | `stereo_field_visual_rotation_speed_deg_sec` | `180` | `10` | да | `value_anchor` |
| 54 | `multitap_delay_polymetric_phase_rotation_speed_deg` | `188` | `45` | да | `value_anchor` |
| 55 | `synth_unison_stereo_phase_spread` | `181` | `90` | да | `value_anchor` |
| 56 | `spatial_reverb_horizontal_plane_tilt` | `0.05` | `0` | да | `value_anchor` |
| 57 | `spatial_width_interaural_coherence` | `0.5` | `0.5` | нет | `value_anchor` |
| 58 | `stereo_widener_haas_delay_max_ms` | `20` | `10` | да | `value_anchor` |
| 59 | `stereo_haas_delay_time_ms` | `25.6` | `15` | да | `value_anchor` |
| 60 | `interaural_cross_correlation_index` | `0.51` | `0.8` | да | `value_anchor` |
| 61 | `center_channel_attenuation_midside` | `-11.200000000000001` | `0` | да | `value_anchor` |
| 62 | `midside_mid_gain_attenuation` | `-8.3` | `0` | да | `value_anchor` |
| 63 | `stereo_imager_phase_correlation_threshold` | `0.06` | `0` | да | `value_anchor` |
| 64 | `stereo_imager_frequency_split_point_hz` | `10230` | `200` | да | `value_anchor` |
| 65 | `liquid_scratch_texture_element_stereo_spread_degrees` | `140` | `150` | да | `value_anchor` |
| 66 | `vibe_intergalactic_haas_effect_stereo_delay_ms` | `11` | `12` | да | `value_anchor` |
| 67 | `high_gain_screen_grid_current_compression_ratio` | `5.5` | `2.85` | да | `value_anchor` |
| 68 | `saturator_triode_tube_screen_tap_ratio_decay_scaling_mode_type` | `Fixed` | `Fixed` | нет | `value_anchor` |
| 69 | `saturator_triode_tube_screen_tap_ratio_scaling` | `2` | `1` | да | `lexical` |
| 70 | `spatial_binaural_listener_head_width_m` | `0.201` | `0.215` | да | `value_anchor` |
| 71 | `stereo_correlation_coefficient_ratio` | `0.04` | `0.8` | да | `value_anchor` |
| 72 | `sidechain_input_filter_q_factor` | `10.4` | `1` | да | `value_anchor` |
| 73 | `liquid_scratch_spectral_delay_ping_pong_pan_width` | `0.75` | `0.8` | да | `value_anchor` |
| 74 | `stereo_field_rotation_angle_degrees` | `3` | `0` | да | `value_anchor` |
| 75 | `psychoacoustic_loudness_bark_band_width_ratio` | `1.24` | `1` | да | `value_anchor` |
| 76 | `psychoacoustic_tonality_bark_band_width_hz` | `1030` | `200` | да | `value_anchor` |
| 77 | `organic_granulation_spray_stereo_phase_cents` | `51.400000000000006` | `0` | да | `value_anchor` |
| 78 | `saturator_triode_tube_screen_tap_ratio_mode` | `Fixed` | `Fixed` | нет | `value_anchor` |
| 79 | `pipe_mouth_aperture_width` | `1.1` | `1` | да | `value_anchor` |
| 80 | `spatial_map_depth_visualization_scale` | `5.1000000000000005` | `1` | да | `value_anchor` |
| 81 | `spatial_stereo_decorrelation_filter_delay_ms` | `15.700000000000001` | `5` | да | `value_anchor` |
| 82 | `additive_subtractive_fusion_bandwidth` | `51` | `50` | да | `value_anchor` |
| 83 | `spectral_band_crossfade_width_octaves` | `2.04` | `0.5` | да | `value_anchor` |
| 84 | `auto_recursion_singularity_attractor_gravitational_pull_scale` | `5` | `2.618` | да | `value_anchor` |
| 85 | `interaural_time_difference_max_ms` | `0.51` | `0.7` | да | `value_anchor` |
| 86 | `high_gain_power_amp_screen_grid_dissipation_limit_watts` | `10.4` | `8.5` | да | `value_anchor` |
| 87 | `vibe_event_horizon_shimmer_reverb_octave_shift` | `none` | `+1 octave` | да | `value_anchor` |
| 88 | `micro_harmony_generator_amplitude_scale` | `0.51` | `0.5` | да | `value_anchor` |
| 89 | `spectral_delay_band_crossfade_width` | `0.52` | `0.1` | да | `value_anchor` |
| 90 | `stereo_pan_position_degrees` | `11` | `0` | да | `value_anchor` |
| 91 | `visual_event_duration_adaptive_scale` | `0.5` | `0.5` | нет | `value_anchor` |
| 92 | `supersaw_unison_voice_pan_distribution_spread` | `50` | `90` | да | `value_anchor` |
| 93 | `a5_adapt_density_micro_shruthi_smoothing_scale` | `0.53` | `0.85` | да | `value_anchor` |
| 94 | `vocal_allocation_matrix_layer_pan_binaural_decorrelation` | `0.51` | `0.85` | да | `value_anchor` |
| 95 | `visual_mapping_pan_to_position_x` | `0.04` | `0` | да | `value_anchor` |
| 96 | `spectral_crossover_transition_width_octaves` | `2.02` | `0.5` | да | `value_anchor` |
| 97 | `multi_tap_delay_pan_spread_angle` | `92` | `90` | да | `value_anchor` |
| 98 | `low_frequency_rumble_screen_shake_mm` | `25.3` | `5` | да | `value_anchor` |
| 99 | `stereo_phase_correlation_target` | `0.04` | `0.5` | да | `value_anchor` |
| 100 | `simple_stereo_delay_feedback_percent` | `50` | `30` | да | `value_anchor` |
