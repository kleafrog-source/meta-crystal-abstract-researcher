# Flowmusic Genesis V3 — аудит явных значений BGE-M3

Дата: 2026-10-08T00:54:26+03:00

Все 20 запросов выполнены строго последовательно. `current_values` и instruction context очищены для изоляции retrieval и anchoring.

## Сводка

- Успешных HTTP-запросов: **20/20**
- Целевой technical_name найден: **20/20**
- Запрошенное значение выставлено правильно: **4/20**
- Все выбранные значения, отличающиеся от default: **30/476 (6.3%)**

## Результаты

### Тест 1 · Top-K 3

Запрос: `Set acoustic_feature_attack_density to 0.82`

Цель: `acoustic_feature_attack_density` → ожидалось `0.82`
Найдена: **да**; результат: `0.5`; default: `0.5`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **3**. Время: 6.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 2 | `dust_instability_sound_stretching_intensity` | `0.05` | `0.05` | нет | `default` |
| 3 | `asymmetric_glitch_psychoacoustic_distortion_density` | `20` | `20` | нет | `default` |

### Тест 2 · Top-K 5

Запрос: `Set basic_amplitude_envelope_attack_ms to 640 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `640`
Найдена: **да**; результат: `640`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **3**, осталось default **2**. Время: 1.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `640` | `10` | да | `numeric` |
| 2 | `spectral_band_compression_attack_ms` | `10` | `10` | нет | `default` |
| 3 | `acoustic_feature_attack_density` | `1` | `0.5` | да | `numeric` |
| 4 | `frequency_contrast_band_boost_depth` | `0.5` | `0.5` | нет | `default` |
| 5 | `basic_compressor_attack_time_ms` | `100` | `10` | да | `numeric` |

### Тест 3 · Top-K 8

Запрос: `Set spectral_smoothing_attack_time to 48 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `48.0`
Найдена: **да**; результат: `48`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **2**, осталось default **6**. Время: 1.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `48` | `2` | да | `numeric` |
| 2 | `spectral_transient_smearing_time_ms` | `0` | `0` | нет | `default` |
| 3 | `spectral_smearing_time_constant_ms` | `100` | `100` | нет | `default` |
| 4 | `spectral_blur_time_smearing` | `0` | `0` | нет | `default` |
| 5 | `spectral_skewness_decay_time_ms` | `48` | `100` | да | `numeric` |
| 6 | `spectral_coherence_cross_spectral_density_smoothing_time_ms` | `30` | `30` | нет | `default` |
| 7 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 8 | `spectral_gate_attack_time_ms` | `5` | `5` | нет | `default` |

### Тест 4 · Top-K 12

Запрос: `Set resonant_body_excitation_attack_damping to 0.84`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.84`
Найдена: **да**; результат: `0.3`; default: `0.3`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **2**, осталось default **10**. Время: 4.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.3` | `0.3` | нет | `default` |
| 2 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 3 | `resonant_body_attack_suppression_fade_in` | `65` | `100` | да | `lexical` |
| 4 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 5 | `spectral_resonator_excitation_decay` | `1` | `1` | нет | `default` |
| 6 | `recursion_entropy_damping_factor` | `0.8` | `0.8` | нет | `default` |
| 7 | `resonator_excitation_noise_mix` | `0.2` | `0.2` | нет | `default` |
| 8 | `phase_distortion_resonant_envelope_peak_height` | `50` | `50` | нет | `default` |
| 9 | `drum_shell_resonance_damping` | `0.3` | `0.2` | да | `lexical` |
| 10 | `resonant_body_decay_time_multiplier` | `1` | `1` | нет | `default` |
| 11 | `physical_resonator_excitation_position` | `0.5` | `0.5` | нет | `default` |
| 12 | `acoustic_room_mode_damping` | `0.2` | `0.2` | нет | `default` |

### Тест 5 · Top-K 20

Запрос: `Set stereo_width_chorus_flanger_depth to 0.95`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.95`
Найдена: **да**; результат: `0.7`; default: `0.7`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **2**, осталось default **18**. Время: 6.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.7` | `0.7` | нет | `default` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `140` | `150` | да | `lexical` |
| 3 | `chorus_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 4 | `chorus_modulation_depth_ratio` | `0.25` | `0.25` | нет | `default` |
| 5 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.7000000000000001` | `0.8` | да | `lexical` |
| 6 | `vocal_vcho_choral_binaural_spread_fx4_cho1` | `85` | `85` | нет | `default` |
| 7 | `dreamy_chorus_binaural_detune_cents` | `12` | `12` | нет | `default` |
| 8 | `vocal_vector_spatial_width_s` | `7` | `7` | нет | `default` |
| 9 | `liquid_scratch_chorus_flanger_base_delay_ms` | `5` | `5` | нет | `default` |
| 10 | `vocal_tremolo_depth_ratio` | `0` | `0` | нет | `default` |
| 11 | `audio_binaural_torso_supraglottal_depth` | `0` | `0` | нет | `default` |
| 12 | `chorus_voice_detune_spread_cents` | `10` | `10` | нет | `default` |
| 13 | `spatial_width_phase_inversion_amount` | `0` | `0` | нет | `default` |
| 14 | `vocal_formant_vibrato_extent_cents` | `15` | `15` | нет | `default` |
| 15 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 16 | `tonalness_breakdown_foldback_subconscious_depth` | `0` | `0` | нет | `default` |
| 17 | `simple_chorus_depth_percent` | `50` | `50` | нет | `default` |
| 18 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 19 | `vocal_allocation_matrix_layer_pan_binaural_decorrelation` | `0.85` | `0.85` | нет | `default` |
| 20 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |

### Тест 6 · Top-K 30

Запрос: `Set psychoacoustic_loudness_sharpness_ratio to 1.5`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `1.5`
Найдена: **да**; результат: `0.3`; default: `0.3`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **30**. Время: 1.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0.5` | `0.5` | нет | `default` |
| 2 | `psychoacoustic_loudness_sharpness_ratio` | `0.3` | `0.3` | нет | `default` |
| 3 | `psychoacoustic_tonalness_ratio` | `0.5` | `0.5` | нет | `default` |
| 4 | `perceptual_sharpness_acum_units` | `1` | `1` | нет | `default` |
| 5 | `psychoacoustic_spectral_sharpness_acum` | `1` | `1` | нет | `default` |
| 6 | `psychoacoustic_tonal_loudness_ratio` | `0.7` | `0.7` | нет | `default` |
| 7 | `psychoacoustic_spectral_contrast_ratio` | `0.5` | `0.5` | нет | `default` |
| 8 | `psychoacoustic_tonalness_sharpness_weight` | `0.2` | `0.2` | нет | `default` |
| 9 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.05` | `0.05` | нет | `default` |
| 10 | `psychoacoustic_loudness_sharpness_coupling_weight` | `0.2` | `0.2` | нет | `default` |
| 11 | `psychoacoustic_loudness_sharpness_acum` | `1` | `1` | нет | `default` |
| 12 | `psychoacoustic_loudness_sharpness_weight_factor` | `1` | `1` | нет | `default` |
| 13 | `psychoacoustic_spectral_sharpness_attenuation_db` | `0` | `0` | нет | `default` |
| 14 | `psychoacoustic_sharpness_attenuation_factor` | `0.2` | `0.2` | нет | `default` |
| 15 | `psychoacoustic_tonality_index_ratio` | `0.5` | `0.5` | нет | `default` |
| 16 | `asymmetric_glitch_psychoacoustic_distortion_density` | `20` | `20` | нет | `default` |
| 17 | `psychoacoustic_loudness_sharpness_sone_exponent` | `0.8` | `0.8` | нет | `default` |
| 18 | `psychoacoustic_masking_depth_ratio` | `0` | `0` | нет | `default` |
| 19 | `psychoacoustic_sharpness_sone_bark_ratio_scale` | `1` | `1` | нет | `default` |
| 20 | `psychoacoustic_tonality_index` | `0.5` | `0.5` | нет | `default` |
| 21 | `psychoacoustic_sharpness_sone_bark_ratio` | `1` | `1` | нет | `default` |
| 22 | `psychoacoustic_loudness_sharpness_integration_time_ms` | `50` | `50` | нет | `default` |
| 23 | `psychoacoustic_sharpness_sone_level` | `1` | `1` | нет | `default` |
| 24 | `feeling_whisper_sharpness_stiff_intensity` | `0.05` | `0.05` | нет | `default` |
| 25 | `psychoacoustic_pitch_salience_ratio` | `0.8` | `0.8` | нет | `default` |
| 26 | `psychoacoustic_pitch_salience` | `0.6` | `0.6` | нет | `default` |
| 27 | `psychoacoustic_loudness_exceedance_probability_ratio` | `0.05` | `0.05` | нет | `default` |
| 28 | `psychoacoustic_roughness_asper` | `0.2` | `0.2` | нет | `default` |
| 29 | `psychoacoustic_tonality_spectral_peak_isolation_ratio` | `0.5` | `0.5` | нет | `default` |
| 30 | `psychoacoustic_loudness_growth_exponent` | `0.6` | `0.6` | нет | `default` |

### Тест 7 · Top-K 50

Запрос: `Set stereo_width_coefficient_ratio to 1.6`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.6`
Найдена: **да**; результат: `1`; default: `1`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **1**, осталось default **49**. Время: 13.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `default` |
| 4 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `default` |
| 5 | `basic_stereo_imager_width_percent` | `100` | `100` | нет | `default` |
| 6 | `stereo_correlation_coefficient_ratio` | `0.8` | `0.8` | нет | `default` |
| 7 | `spatial_width_frequency_dependent_amount` | `0` | `0` | нет | `default` |
| 8 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 9 | `spatial_width_compensation_frequency` | `500` | `500` | нет | `default` |
| 10 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0.5` | `0.5` | нет | `default` |
| 11 | `ambient_room_scattering_coefficient_ratio` | `0.2` | `0.2` | нет | `default` |
| 12 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 13 | `noise_shaping_correlation_coefficient` | `0` | `0` | нет | `default` |
| 14 | `chaotic_reverb_intensity_ratio` | `0` | `0` | нет | `default` |
| 15 | `dynamic_stereo_width_modulation_depth` | `0` | `0` | нет | `lexical` |
| 16 | `multiband_stereo_width_low_frequency` | `0` | `0` | нет | `default` |
| 17 | `consonant_sibilance_high_frequency_ratio` | `0.35` | `0.35` | нет | `default` |
| 18 | `stereo_shuffler_frequency_crossover` | `600` | `600` | нет | `default` |
| 19 | `high_frequency_stereo_crossover` | `8000` | `8000` | нет | `default` |
| 20 | `texture_noise_spectral_correlation_stereo_width` | `0` | `0` | нет | `default` |
| 21 | `stereo_mid_side_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 22 | `formant_filter_bandwidth_ratio` | `1` | `1` | нет | `default` |
| 23 | `phase_manipulation_stereo_width_expansion` | `100` | `100` | нет | `default` |
| 24 | `spectral_skewness_coefficient_ratio` | `0` | `0` | нет | `default` |
| 25 | `fm_operator_coarse_frequency_ratio` | `1` | `1` | нет | `default` |
| 26 | `comb_filter_array_harmonic_spacing_ratio` | `1` | `1` | нет | `default` |
| 27 | `stereo_imager_frequency_split_point_hz` | `200` | `200` | нет | `default` |
| 28 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 29 | `psychoacoustic_loudness_sharpness_ratio` | `0.3` | `0.3` | нет | `default` |
| 30 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 31 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `0.707` | `0.707` | нет | `default` |
| 32 | `interaural_cross_correlation_coefficient` | `1` | `1` | нет | `default` |
| 33 | `psychoacoustic_tonal_loudness_ratio` | `0.7` | `0.7` | нет | `default` |
| 34 | `organic_granulation_spray_stereo_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 35 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 36 | `acoustic_ray_tracing_scattering_coefficient` | `0.3` | `0.3` | нет | `default` |
| 37 | `vocalic_formant_bandwidth_compression_ratio` | `1` | `1` | нет | `default` |
| 38 | `granular_time_stretch_ratio` | `1` | `1` | нет | `default` |
| 39 | `granular_pan_spray_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 40 | `resistance_coefficient_ratio` | `0.01` | `0.01` | нет | `default` |
| 41 | `basic_reverb_size_parameter` | `50` | `50` | нет | `default` |
| 42 | `density_smoothing_kernel_width` | `1` | `1` | нет | `default` |
| 43 | `additive_subtractive_fusion_bandwidth` | `50` | `50` | нет | `default` |
| 44 | `granular_pan_spray_width` | `50` | `50` | нет | `default` |
| 45 | `vocal_formant_bandwidth_q_factor_expansion` | `1` | `1` | нет | `default` |
| 46 | `acoustic_rigid_wall_scattering_coefficient` | `0.1` | `0.1` | нет | `default` |
| 47 | `phase_distortion_carrier_modulator_ratio` | `1` | `1` | нет | `default` |
| 48 | `organic_granulation_spray_stereo_phase_ratio` | `0.1` | `0.1` | нет | `default` |
| 49 | `spectral_panning_frequency_spread_ratio` | `0` | `0` | нет | `default` |
| 50 | `stereo_pan_to_horizontal_position_scale` | `85` | `100` | да | `lexical` |

### Тест 8 · Top-K 5

Запрос: `Установи acoustic_feature_attack_density на 0.18`

Цель: `acoustic_feature_attack_density` → ожидалось `0.18`
Найдена: **да**; результат: `0.5`; default: `0.5`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **5**. Время: 1.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 2 | `dust_instability_sound_stretching_intensity` | `0.05` | `0.05` | нет | `default` |
| 3 | `feeling_whisper_sharpness_stiff_intensity` | `0.05` | `0.05` | нет | `default` |
| 4 | `room_acoustic_air_density_kg_per_m3` | `1.204` | `1.204` | нет | `default` |
| 5 | `groove_inharmonicity_spatial_shadowing_density` | `20` | `20` | нет | `default` |

### Тест 9 · Top-K 8

Запрос: `Установи basic_amplitude_envelope_attack_ms ровно 1250 ms`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `1250`
Найдена: **да**; результат: `1250`; default: `10`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **5**, осталось default **3**. Время: 1.7 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `1250` | `10` | да | `numeric` |
| 2 | `basic_compressor_attack_time_ms` | `100` | `10` | да | `numeric` |
| 3 | `spectral_band_compression_attack_ms` | `10` | `10` | нет | `default` |
| 4 | `basic_oscillator_phase_reset_mode` | `reset_on_trigger` | `reset_on_trigger` | нет | `default` |
| 5 | `transient_recovery_attack_envelope_shaper` | `12` | `3` | да | `numeric` |
| 6 | `frequency_contrast_band_boost_depth` | `0.5` | `0.5` | нет | `default` |
| 7 | `basic_amplitude_envelope_release_ms` | `1250` | `200` | да | `numeric` |
| 8 | `acoustic_feature_attack_density` | `1` | `0.5` | да | `numeric` |

### Тест 10 · Top-K 12

Запрос: `Установи spectral_smoothing_attack_time ровно 155 ms`

Цель: `spectral_smoothing_attack_time` → ожидалось `155.0`
Найдена: **да**; результат: `155`; default: `2`; отличается от default: **да**; запрос выполнен правильно: **да**.
Весь Top-K: изменено **4**, осталось default **8**. Время: 1.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `155` | `2` | да | `numeric` |
| 2 | `spectral_smearing_time_constant_ms` | `100` | `100` | нет | `default` |
| 3 | `spectral_skewness_decay_time_ms` | `155` | `100` | да | `numeric` |
| 4 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 5 | `spectral_transient_smearing_time_ms` | `0` | `0` | нет | `default` |
| 6 | `spectral_flux_transient_emphasis_smoothing_ms` | `2` | `2` | нет | `default` |
| 7 | `transient_smearing_time_window` | `100` | `10` | да | `numeric` |
| 8 | `spectral_coherence_cross_spectral_density_smoothing_time_ms` | `30` | `30` | нет | `default` |
| 9 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 10 | `spectral_flux_smoothing_time_ms` | `155` | `50` | да | `numeric` |
| 11 | `spectral_energy_flux_smoothing_ms` | `20` | `20` | нет | `default` |
| 12 | `spectral_coherence_cross_spectral_density_smoothing_ms` | `20` | `20` | нет | `default` |

### Тест 11 · Top-K 20

Запрос: `Установи resonant_body_excitation_attack_damping на 0.08`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.08`
Найдена: **да**; результат: `0.3`; default: `0.3`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **1**, осталось default **19**. Время: 6.0 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.3` | `0.3` | нет | `default` |
| 2 | `resonant_body_attack_suppression_fade_in` | `70` | `100` | да | `lexical` |
| 3 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 4 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 5 | `physical_resonator_excitation_position` | `0.5` | `0.5` | нет | `default` |
| 6 | `acoustic_room_mode_damping` | `0.2` | `0.2` | нет | `default` |
| 7 | `spectral_resonator_excitation_decay` | `1` | `1` | нет | `default` |
| 8 | `drum_shell_resonance_damping` | `0.2` | `0.2` | нет | `default` |
| 9 | `resonator_excitation_noise_mix` | `0.2` | `0.2` | нет | `default` |
| 10 | `modal_resonance_damping_ratio` | `0.1` | `0.1` | нет | `default` |
| 11 | `sub_bass_phase_alignment_damping_ratio` | `0.707` | `0.707` | нет | `default` |
| 12 | `recursion_entropy_damping_factor` | `0.8` | `0.8` | нет | `default` |
| 13 | `subharmonic_resonance_damping_factor` | `0.5` | `0.5` | нет | `default` |
| 14 | `physical_modeling_string_damping_coefficient` | `0.1` | `0.1` | нет | `default` |
| 15 | `reverb_early_reflections_damping_hz` | `8000` | `8000` | нет | `default` |
| 16 | `reverb_damping_slope_db_per_octave` | `6` | `6` | нет | `default` |
| 17 | `covariant_derivative_j_geom_divergence_damping` | `0.15` | `0.15` | нет | `default` |
| 18 | `phase_distortion_resonant_envelope_peak_height` | `50` | `50` | нет | `default` |
| 19 | `asymmetric_feedback_loop_cross_attenuation_dB` | `-6` | `-6` | нет | `default` |
| 20 | `liouville_spectral_entropy_damping` | `0.85` | `0.85` | нет | `default` |

### Тест 12 · Top-K 30

Запрос: `Установи stereo_width_chorus_flanger_depth на 0.15`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.15`
Найдена: **да**; результат: `0.6000000000000001`; default: `0.7`; отличается от default: **да**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **4**, осталось default **26**. Время: 8.6 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.6000000000000001` | `0.7` | да | `lexical` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `140` | `150` | да | `lexical` |
| 3 | `chorus_modulation_depth_ratio` | `0.25` | `0.25` | нет | `default` |
| 4 | `dreamy_chorus_binaural_detune_cents` | `12` | `12` | нет | `default` |
| 5 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.6000000000000001` | `0.8` | да | `lexical` |
| 6 | `chorus_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 7 | `liquid_scratch_chorus_flanger_base_delay_ms` | `5` | `5` | нет | `default` |
| 8 | `chorus_delay_time_spread_ms` | `15` | `15` | нет | `default` |
| 9 | `chorus_voice_detune_spread_cents` | `10` | `10` | нет | `default` |
| 10 | `spatial_width_phase_inversion_amount` | `0` | `0` | нет | `default` |
| 11 | `vocal_vcho_choral_binaural_spread_fx4_cho1` | `85` | `85` | нет | `default` |
| 12 | `simple_panning_lfo_depth_percent` | `0` | `0` | нет | `lexical` |
| 13 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 14 | `granular_pan_spray_width_ratio` | `0.2` | `0.2` | нет | `default` |
| 15 | `chorus_feedback_amount` | `0` | `0` | нет | `default` |
| 16 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 17 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 18 | `audio_binaural_torso_supraglottal_depth` | `0` | `0` | нет | `default` |
| 19 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 20 | `tonalness_breakdown_foldback_subconscious_depth` | `0` | `0` | нет | `default` |
| 21 | `vocal_vector_spatial_width_s` | `7` | `7` | нет | `default` |
| 22 | `bbd_delay_compander_noise_reduction_ratio` | `2` | `2` | нет | `default` |
| 23 | `basic_chorus_delay_ms` | `15` | `15` | нет | `default` |
| 24 | `vocal_tremolo_depth_ratio` | `0` | `0` | нет | `default` |
| 25 | `reverb_modulation_depth_amount` | `0.1` | `0.1` | нет | `default` |
| 26 | `comb_filter_array_harmonic_notch_depth_dB` | `-24` | `-24` | нет | `default` |
| 27 | `simple_chorus_depth_percent` | `50` | `50` | нет | `default` |
| 28 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 29 | `chorus_voices_count` | `2` | `2` | нет | `default` |
| 30 | `mono_to_stereo_width_percent` | `84` | `100` | да | `lexical` |

### Тест 13 · Top-K 50

Запрос: `Установи psychoacoustic_loudness_sharpness_ratio на 0.2`

Цель: `psychoacoustic_loudness_sharpness_ratio` → ожидалось `0.2`
Найдена: **да**; результат: `0.3`; default: `0.3`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **50**. Время: 1.3 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `psychoacoustic_loudness_sharpness_ratio` | `0.3` | `0.3` | нет | `default` |
| 2 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0.5` | `0.5` | нет | `default` |
| 3 | `psychoacoustic_tonalness_ratio` | `0.5` | `0.5` | нет | `default` |
| 4 | `perceptual_sharpness_acum_units` | `1` | `1` | нет | `default` |
| 5 | `psychoacoustic_spectral_contrast_ratio` | `0.5` | `0.5` | нет | `default` |
| 6 | `psychoacoustic_tonalness_sharpness_weight` | `0.2` | `0.2` | нет | `default` |
| 7 | `psychoacoustic_spectral_sharpness_acum` | `1` | `1` | нет | `default` |
| 8 | `psychoacoustic_spectral_sharpness_attenuation_db` | `0` | `0` | нет | `default` |
| 9 | `psychoacoustic_loudness_sharpness_coupling_weight` | `0.2` | `0.2` | нет | `default` |
| 10 | `psychoacoustic_loudness_sharpness_acum` | `1` | `1` | нет | `default` |
| 11 | `psychoacoustic_sharpness_attenuation_factor` | `0.2` | `0.2` | нет | `default` |
| 12 | `psychoacoustic_tonal_loudness_ratio` | `0.7` | `0.7` | нет | `default` |
| 13 | `psychoacoustic_loudness_sharpness_sone_exponent` | `0.8` | `0.8` | нет | `default` |
| 14 | `psychoacoustic_sharpness_sone_bark_ratio_scale` | `1` | `1` | нет | `default` |
| 15 | `psychoacoustic_loudness_sharpness_weight_factor` | `1` | `1` | нет | `default` |
| 16 | `psychoacoustic_tonality_index` | `0.5` | `0.5` | нет | `default` |
| 17 | `psychoacoustic_masking_depth_ratio` | `0` | `0` | нет | `default` |
| 18 | `psychoacoustic_loudness_sharpness_integration_time_ms` | `50` | `50` | нет | `default` |
| 19 | `psychoacoustic_tonality_index_ratio` | `0.5` | `0.5` | нет | `default` |
| 20 | `psychoacoustic_sharpness_sone_bark_ratio` | `1` | `1` | нет | `default` |
| 21 | `psychoacoustic_sharpness_sone_level` | `1` | `1` | нет | `default` |
| 22 | `psychoacoustic_spectral_sharpness_weight_slope` | `1` | `1` | нет | `default` |
| 23 | `asymmetric_glitch_psychoacoustic_distortion_density` | `20` | `20` | нет | `default` |
| 24 | `psychoacoustic_tonality_spectral_peak_isolation_ratio` | `0.5` | `0.5` | нет | `default` |
| 25 | `psychoacoustic_loudness_sharpness_sone_threshold` | `4` | `4` | нет | `default` |
| 26 | `psychoacoustic_pitch_salience_ratio` | `0.8` | `0.8` | нет | `default` |
| 27 | `psychoacoustic_sensory_pleasantness_index` | `0.5` | `0.5` | нет | `default` |
| 28 | `psychoacoustic_loudness_growth_exponent` | `0.6` | `0.6` | нет | `default` |
| 29 | `psychoacoustic_roughness_asper` | `0.2` | `0.2` | нет | `default` |
| 30 | `psychoacoustic_reflectivity_raspiness_lfo_mix` | `0.05` | `0.05` | нет | `default` |
| 31 | `psychoacoustic_tonality_spectral_flatness_inverse_ratio` | `0.8` | `0.8` | нет | `default` |
| 32 | `feeling_whisper_sharpness_stiff_intensity` | `0.05` | `0.05` | нет | `default` |
| 33 | `psychoacoustic_pitch_salience` | `0.6` | `0.6` | нет | `default` |
| 34 | `psychoacoustic_loudness_roughness_asper` | `0.2` | `0.2` | нет | `default` |
| 35 | `psychoacoustic_loudness_exceedance_probability_ratio` | `0.05` | `0.05` | нет | `default` |
| 36 | `perceptual_sharpness_sone_ratio` | `1` | `1` | нет | `default` |
| 37 | `psychoacoustic_loudness_level_phon` | `70` | `70` | нет | `default` |
| 38 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `default` |
| 39 | `psychoacoustic_auditory_roughness_modulation_index` | `0` | `0` | нет | `default` |
| 40 | `psychoacoustic_loudness_growth_threshold_db` | `20` | `20` | нет | `default` |
| 41 | `psychoacoustic_loudness_sharpness_slope_db_per_bark` | `0.25` | `0.25` | нет | `default` |
| 42 | `psychoacoustic_sharpness_spectral_weighting_mode` | `Bismarck` | `Bismarck` | нет | `default` |
| 43 | `psychoacoustic_loudness_contour_mode` | `iso_226` | `iso_226` | нет | `default` |
| 44 | `auditory_loudness_growth_rate` | `1` | `1` | нет | `default` |
| 45 | `psychoacoustic_loudness_sharpness_bark_weight_slope_scaling` | `1` | `1` | нет | `default` |
| 46 | `psychoacoustic_loudness_sharpness_bark_weight_slope_factor` | `1` | `1` | нет | `default` |
| 47 | `psychoacoustic_spectral_sharpness_weighting_mode` | `DIN_45692` | `DIN_45692` | нет | `default` |
| 48 | `psychoacoustic_loudness_sharpness_bark_weight_offset` | `0` | `0` | нет | `default` |
| 49 | `psychoacoustic_roughness_asper_units` | `0.5` | `0.5` | нет | `default` |
| 50 | `psychoacoustic_loudness_adaptation_time_ms` | `200` | `200` | нет | `default` |

### Тест 14 · Top-K 3

Запрос: `Установи stereo_width_coefficient_ratio на 0.35`

Цель: `stereo_width_coefficient_ratio` → ожидалось `0.35`
Найдена: **да**; результат: `1`; default: `1`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **3**. Время: 1.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `default` |

### Тест 15 · Top-K 8

Запрос: `acoustic_feature_attack_density: 0.93`

Цель: `acoustic_feature_attack_density` → ожидалось `0.93`
Найдена: **да**; результат: `0.5`; default: `0.5`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **8**. Время: 1.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 2 | `dust_instability_sound_stretching_intensity` | `0.05` | `0.05` | нет | `default` |
| 3 | `asymmetric_glitch_psychoacoustic_distortion_density` | `20` | `20` | нет | `default` |
| 4 | `groove_inharmonicity_spatial_shadowing_density` | `20` | `20` | нет | `default` |
| 5 | `room_acoustic_air_density_kg_per_m3` | `1.204` | `1.204` | нет | `default` |
| 6 | `feeling_whisper_sharpness_stiff_intensity` | `0.05` | `0.05` | нет | `default` |
| 7 | `acoustic_air_absorption_humidity_ratio` | `0.5` | `0.5` | нет | `default` |
| 8 | `hardness_vibrato_spark_intensity` | `0.05` | `0.05` | нет | `default` |

### Тест 16 · Top-K 12

Запрос: `basic_amplitude_envelope_attack_ms: 80`

Цель: `basic_amplitude_envelope_attack_ms` → ожидалось `80`
Найдена: **да**; результат: `10`; default: `10`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **1**, осталось default **11**. Время: 4.4 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `basic_amplitude_envelope_attack_ms` | `10` | `10` | нет | `default` |
| 2 | `acoustic_feature_attack_density` | `0.5` | `0.5` | нет | `default` |
| 3 | `basic_amplitude_envelope_release_ms` | `200` | `200` | нет | `default` |
| 4 | `basic_compressor_attack_time_ms` | `10` | `10` | нет | `default` |
| 5 | `granular_amplitude_modulation_depth` | `0.5` | `0.5` | нет | `default` |
| 6 | `tonalness_breakdown_foldback_subconscious_depth` | `0` | `0` | нет | `default` |
| 7 | `attack_min_ms` | `10` | `10` | нет | `default` |
| 8 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `0.707` | `0.707` | нет | `default` |
| 9 | `audio_binaural_torso_supraglottal_depth` | `0` | `0` | нет | `default` |
| 10 | `dispersion_warping_polyrhythmic_inharmonicity_mix` | `0.1` | `0.1` | нет | `default` |
| 11 | `morphing_inertia_dissonance_reverberant_depth` | `0` | `0` | нет | `default` |
| 12 | `basic_square_wave_pulse_width_percent` | `58` | `50` | да | `lexical` |

### Тест 17 · Top-K 20

Запрос: `spectral_smoothing_attack_time: 12.5`

Цель: `spectral_smoothing_attack_time` → ожидалось `12.5`
Найдена: **да**; результат: `2`; default: `2`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **20**. Время: 4.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `spectral_smoothing_attack_time` | `2` | `2` | нет | `default` |
| 2 | `spectral_blur_time_smearing` | `0` | `0` | нет | `default` |
| 3 | `spectral_smearing_time_constant_ms` | `100` | `100` | нет | `default` |
| 4 | `spectral_transient_smearing_time_ms` | `0` | `0` | нет | `default` |
| 5 | `spectral_cepstral_smoothing_amount` | `0` | `0` | нет | `default` |
| 6 | `spectral_skewness_decay_time_ms` | `100` | `100` | нет | `default` |
| 7 | `spectral_coherence_cross_spectral_density_smoothing_time_ms` | `30` | `30` | нет | `default` |
| 8 | `spectral_bin_magnitude_smoothing_time_ms` | `20` | `20` | нет | `default` |
| 9 | `spectral_coherence_cross_spectral_density_smoothing_ms` | `20` | `20` | нет | `default` |
| 10 | `spectral_flux_smoothing_time` | `0.08` | `0.08` | нет | `default` |
| 11 | `transient_smearing_time_window` | `10` | `10` | нет | `default` |
| 12 | `spectral_energy_flux_smoothing_ms` | `20` | `20` | нет | `default` |
| 13 | `spectral_flux_smoothing_time_ms` | `50` | `50` | нет | `default` |
| 14 | `spectrum_visualization_smoothing_time` | `50` | `50` | нет | `default` |
| 15 | `spectral_gate_lookahead_smoothing_ms` | `5` | `5` | нет | `default` |
| 16 | `crest_factor_envelope_follower_transient_smoothing_ms` | `5` | `5` | нет | `default` |
| 17 | `transient_smearing_intensity` | `0.3` | `0.3` | нет | `default` |
| 18 | `pan_modulation_smoothing_time` | `10` | `10` | нет | `default` |
| 19 | `spectral_flux_transient_emphasis_smoothing_ms` | `2` | `2` | нет | `default` |
| 20 | `spectral_coherence_cross_spectral_density_smoothing_decay_ms` | `50` | `50` | нет | `default` |

### Тест 18 · Top-K 30

Запрос: `resonant_body_excitation_attack_damping: 0.67`

Цель: `resonant_body_excitation_attack_damping` → ожидалось `0.67`
Найдена: **да**; результат: `0.3`; default: `0.3`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **4**, осталось default **26**. Время: 10.2 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `resonant_body_excitation_attack_damping` | `0.3` | `0.3` | нет | `default` |
| 2 | `resonant_body_attack_suppression_fade_in` | `65` | `100` | да | `lexical` |
| 3 | `acoustic_resonance_damping_factor` | `0.3` | `0.3` | нет | `default` |
| 4 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 5 | `spectral_resonator_excitation_decay` | `1` | `1` | нет | `default` |
| 6 | `modal_resonance_damping_ratio` | `0.1` | `0.1` | нет | `default` |
| 7 | `phase_distortion_resonant_envelope_peak_height` | `50` | `50` | нет | `default` |
| 8 | `recursion_entropy_damping_factor` | `0.8` | `0.8` | нет | `default` |
| 9 | `physical_interaction_damping_force` | `0.5` | `0.5` | нет | `default` |
| 10 | `resonant_body_decay_time_multiplier` | `1` | `1` | нет | `default` |
| 11 | `drum_shell_resonance_damping` | `0.31` | `0.2` | да | `lexical` |
| 12 | `hybrid_resonance_damping_factor` | `0.39` | `0.3` | да | `lexical` |
| 13 | `acoustic_room_mode_damping` | `0.2` | `0.2` | нет | `default` |
| 14 | `physical_modeling_string_damping_coefficient` | `0.1` | `0.1` | нет | `default` |
| 15 | `acceleration_harshness_boil_decay` | `35` | `35` | нет | `default` |
| 16 | `asymmetric_feedback_loop_cross_attenuation_dB` | `-6` | `-6` | нет | `default` |
| 17 | `covariant_derivative_j_geom_divergence_damping` | `0.15` | `0.15` | нет | `default` |
| 18 | `physical_model_a_material_damping` | `0.1` | `0.1` | нет | `default` |
| 19 | `acid_mud_viscosity_resonance_damping` | `0.25` | `0.25` | нет | `default` |
| 20 | `physical_resonator_excitation_position` | `0.5` | `0.5` | нет | `default` |
| 21 | `liouville_spectral_entropy_damping` | `0.85` | `0.85` | нет | `default` |
| 22 | `basic_reverb_damping_percent` | `50` | `50` | нет | `default` |
| 23 | `resonator_excitation_noise_mix` | `0.2` | `0.2` | нет | `default` |
| 24 | `subharmonic_resonance_damping_factor` | `0.5` | `0.5` | нет | `default` |
| 25 | `physical_model_decay_rate` | `1` | `1` | нет | `default` |
| 26 | `reverb_early_reflections_damping_hz` | `8000` | `8000` | нет | `default` |
| 27 | `sub_bass_phase_alignment_damping_ratio` | `0.707` | `0.707` | нет | `default` |
| 28 | `spectral_attenuation_ratio` | `2.5` | `2.5` | нет | `default` |
| 29 | `compressor_gain_reduction_smoothing` | `30` | `20` | да | `lexical` |
| 30 | `vocal_subglottal_vibration_damping_ratio` | `0.1` | `0.1` | нет | `default` |

### Тест 19 · Top-K 50

Запрос: `stereo_width_chorus_flanger_depth: 0.40`

Цель: `stereo_width_chorus_flanger_depth` → ожидалось `0.4`
Найдена: **да**; результат: `0.7`; default: `0.7`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **1**, осталось default **49**. Время: 16.5 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_chorus_flanger_depth` | `0.7` | `0.7` | нет | `default` |
| 2 | `liquid_scratch_chorus_flanger_stereo_width_max_degrees` | `150` | `150` | нет | `default` |
| 3 | `vocal_vcho_choral_binaural_spread_fx4_cho1` | `85` | `85` | нет | `default` |
| 4 | `chorus_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 5 | `granular_grain_size` | `20` | `20` | нет | `default` |
| 6 | `chorus_modulation_depth_ratio` | `0.25` | `0.25` | нет | `default` |
| 7 | `liquid_scratch_chorus_flanger_stereo_width_modulation_hz` | `0.8` | `0.8` | нет | `default` |
| 8 | `vocal_vector_spatial_width_s` | `7` | `7` | нет | `default` |
| 9 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 10 | `audio_binaural_torso_supraglottal_depth` | `0` | `0` | нет | `default` |
| 11 | `simple_chorus_depth_percent` | `50` | `50` | нет | `default` |
| 12 | `chorus_feedback_amount` | `0` | `0` | нет | `default` |
| 13 | `clxi_reverb_cathedral_size` | `0.5` | `0.5` | нет | `default` |
| 14 | `noise_shaping_correlation_coefficient` | `0` | `0` | нет | `default` |
| 15 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 16 | `liquid_scratch_chorus_flanger_base_delay_ms` | `5` | `5` | нет | `default` |
| 17 | `chorus_voices_count` | `2` | `2` | нет | `default` |
| 18 | `dreamy_chorus_binaural_detune_cents` | `12` | `12` | нет | `default` |
| 19 | `tonalness_breakdown_foldback_subconscious_depth` | `0` | `0` | нет | `default` |
| 20 | `texture_noise_spectral_correlation_stereo_width` | `0` | `0` | нет | `default` |
| 21 | `comb_filter_array_harmonic_notch_depth_dB` | `-24` | `-24` | нет | `default` |
| 22 | `density_smoothing_kernel_width` | `1` | `1` | нет | `default` |
| 23 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 24 | `spatial_width_interaural_coherence` | `0.5` | `0.5` | нет | `default` |
| 25 | `spatial_width_phase_inversion_amount` | `0` | `0` | нет | `default` |
| 26 | `basic_stereo_imager_width_percent` | `100` | `100` | нет | `default` |
| 27 | `morphing_inertia_dissonance_reverberant_depth` | `0` | `0` | нет | `default` |
| 28 | `bass_torso_harmonicity_sound_mix` | `0.05` | `0.05` | нет | `default` |
| 29 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 30 | `simple_panning_lfo_depth_percent` | `0` | `0` | нет | `default` |
| 31 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 32 | `stereo_imager_phase_correlation_threshold` | `0` | `0` | нет | `default` |
| 33 | `vocal_tremolo_depth_ratio` | `0` | `0` | нет | `default` |
| 34 | `chorus_voice_detune_spread_cents` | `10` | `10` | нет | `default` |
| 35 | `chorus_delay_time_spread_ms` | `15` | `15` | нет | `default` |
| 36 | `liquid_scratch_chorus_flanger_feedback_percent` | `25` | `25` | нет | `default` |
| 37 | `unison_voice_detune_spread_semitones` | `0.05` | `0.05` | нет | `default` |
| 38 | `color_saturation_loudness_depth` | `0.5` | `0.5` | нет | `default` |
| 39 | `granular_resynthesis_grain_size` | `350` | `350` | нет | `default` |
| 40 | `basic_chorus_delay_ms` | `15` | `15` | нет | `default` |
| 41 | `bbd_delay_compander_noise_reduction_ratio` | `2` | `2` | нет | `default` |
| 42 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 43 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `default` |
| 44 | `basic_chorus_rate_hz` | `1.5` | `1.5` | нет | `default` |
| 45 | `additive_synthesis_noise_blur_amount` | `0` | `0` | нет | `default` |
| 46 | `acoustic_coupling_cross_modulation_depth` | `0.3` | `0.3` | нет | `default` |
| 47 | `granular_pan_spray_width` | `50` | `50` | нет | `default` |
| 48 | `organic_granulation_spray_stereo_phase_width_ratio` | `0.5` | `0.5` | нет | `default` |
| 49 | `chaos_frequency_modulation_depth` | `0.09` | `0.2` | да | `lexical` |
| 50 | `chorus_voice_count` | `4` | `4` | нет | `default` |

### Тест 20 · Top-K 100

Запрос: `stereo_width_coefficient_ratio: 1.85`

Цель: `stereo_width_coefficient_ratio` → ожидалось `1.85`
Найдена: **да**; результат: `1`; default: `1`; отличается от default: **нет**; запрос выполнен правильно: **нет**.
Весь Top-K: изменено **0**, осталось default **100**. Время: 27.9 с.

| # | parameter | value | default | отличается | source |
|---:|---|---:|---:|:---:|---|
| 1 | `stereo_width_coefficient_ratio` | `1` | `1` | нет | `default` |
| 2 | `stereo_width_expansion_coefficient` | `1` | `1` | нет | `default` |
| 3 | `basic_stereo_imager_width_percent` | `100` | `100` | нет | `default` |
| 4 | `spectral_attenuation_ratio` | `2.5` | `2.5` | нет | `default` |
| 5 | `stereo_width_expansion_ratio` | `1` | `1` | нет | `default` |
| 6 | `psychoacoustic_binaural_width_ratio` | `1` | `1` | нет | `default` |
| 7 | `stereo_correlation_coefficient_ratio` | `0.8` | `0.8` | нет | `default` |
| 8 | `spatial_width_frequency_dependent_amount` | `0` | `0` | нет | `default` |
| 9 | `noise_shaping_correlation_coefficient` | `0` | `0` | нет | `default` |
| 10 | `consonant_sibilance_high_frequency_ratio` | `0.35` | `0.35` | нет | `default` |
| 11 | `mono_to_stereo_width_percent` | `100` | `100` | нет | `default` |
| 12 | `ambient_room_scattering_coefficient_ratio` | `0.2` | `0.2` | нет | `default` |
| 13 | `sub_bass_acoustic_impedance_matching_ratio` | `1` | `1` | нет | `default` |
| 14 | `spatial_width_phase_inversion_amount` | `0` | `0` | нет | `default` |
| 15 | `infrasonic_woofer_excursion_asymmetry_ratio` | `1.45` | `1.45` | нет | `default` |
| 16 | `texture_noise_spectral_correlation_stereo_width` | `0` | `0` | нет | `default` |
| 17 | `stochastic_granular_asymmetric_roughness_resonance` | `0.707` | `0.707` | нет | `default` |
| 18 | `sympathetic_resonance_threshold_ratio` | `0.5` | `0.5` | нет | `default` |
| 19 | `spatial_width_compensation_frequency` | `500` | `500` | нет | `default` |
| 20 | `spectral_flatness_ratio` | `0.25` | `0.25` | нет | `default` |
| 21 | `amplitude_texture_ineharmonicity_fluctuation_resonance` | `0.707` | `0.707` | нет | `default` |
| 22 | `spatial_width_interaural_coherence` | `0.5` | `0.5` | нет | `default` |
| 23 | `psychoacoustic_loudness_sharpness_coupling_ratio` | `0.5` | `0.5` | нет | `default` |
| 24 | `interaural_cross_correlation_coefficient` | `1` | `1` | нет | `default` |
| 25 | `acoustic_ray_tracing_scattering_coefficient` | `0.3` | `0.3` | нет | `default` |
| 26 | `chaotic_reverb_intensity_ratio` | `0` | `0` | нет | `default` |
| 27 | `grain_cloud_spread_stereo_width` | `100` | `100` | нет | `default` |
| 28 | `spectral_tuning_inharmonicity_coefficient` | `0` | `0` | нет | `default` |
| 29 | `comb_filter_array_harmonic_spacing_ratio` | `1` | `1` | нет | `default` |
| 30 | `spatial_diffusion_coefficient` | `0.85` | `0.85` | нет | `default` |
| 31 | `vocalic_formant_bandwidth_compression_ratio` | `1` | `1` | нет | `default` |
| 32 | `high_frequency_stereo_crossover` | `8000` | `8000` | нет | `default` |
| 33 | `resistance_coefficient_ratio` | `0.01` | `0.01` | нет | `default` |
| 34 | `synth_unison_stereo_phase_spread` | `90` | `90` | нет | `default` |
| 35 | `spatial_room_boundary_reflection_coefficient` | `0.75` | `0.75` | нет | `default` |
| 36 | `spectral_skewness_coefficient_ratio` | `0` | `0` | нет | `default` |
| 37 | `viscous_sub_bass_acoustic_mass_inertia_ratio` | `2.4` | `2.4` | нет | `default` |
| 38 | `stereo_correlation_meter_width` | `1` | `1` | нет | `default` |
| 39 | `multiband_stereo_width_low_frequency` | `0` | `0` | нет | `default` |
| 40 | `stereo_mid_side_balance_ratio` | `0.5` | `0.5` | нет | `default` |
| 41 | `stereo_shuffler_frequency_crossover` | `600` | `600` | нет | `default` |
| 42 | `phase_distortion_carrier_modulator_ratio` | `1` | `1` | нет | `default` |
| 43 | `formant_filter_bandwidth_ratio` | `1` | `1` | нет | `default` |
| 44 | `fm_operator_coarse_frequency_ratio` | `1` | `1` | нет | `default` |
| 45 | `dynamic_stereo_width_modulation_depth` | `0` | `0` | нет | `default` |
| 46 | `groove_inharmonicity_spatial_shadowing_loudness` | `0.1` | `0.1` | нет | `default` |
| 47 | `psychoacoustic_loudness_sharpness_ratio` | `0.3` | `0.3` | нет | `default` |
| 48 | `reverb_late_reflection_spatial_diffusion_coefficient` | `0.8` | `0.8` | нет | `default` |
| 49 | `psychoacoustic_tonal_loudness_ratio` | `0.7` | `0.7` | нет | `default` |
| 50 | `density_smoothing_kernel_width` | `1` | `1` | нет | `default` |
| 51 | `reverb_late_reflection_decay_asymmetry_ratio` | `0` | `0` | нет | `default` |
| 52 | `reverb_stereo_width_amount` | `1` | `1` | нет | `default` |
| 53 | `stereo_imager_phase_correlation_threshold` | `0` | `0` | нет | `default` |
| 54 | `phase_manipulation_stereo_width_expansion` | `100` | `100` | нет | `default` |
| 55 | `additive_subtractive_fusion_bandwidth` | `50` | `50` | нет | `default` |
| 56 | `spectral_delay_frequency_spacing_ratio` | `12` | `12` | нет | `default` |
| 57 | `vocal_formant_bandwidth_q_factor_expansion` | `1` | `1` | нет | `default` |
| 58 | `acoustic_rigid_wall_scattering_coefficient` | `0.1` | `0.1` | нет | `default` |
| 59 | `acoustic_enclosure_absorption_coefficient` | `0.2` | `0.2` | нет | `default` |
| 60 | `acoustic_wall_absorption_coefficient` | `0.2` | `0.2` | нет | `default` |
| 61 | `oscillator_sync_frequency_ratio` | `2` | `2` | нет | `default` |
| 62 | `subharmonic_distortion_asymmetry_ratio` | `0` | `0` | нет | `default` |
| 63 | `turing_diffusion_field_coupling_coefficient` | `0.74` | `0.74` | нет | `default` |
| 64 | `vocal_sibilance_transient_suppression_ratio` | `0.5` | `0.5` | нет | `default` |
| 65 | `multi_band_dynamic_coupling_ratio` | `0.5` | `0.5` | нет | `default` |
| 66 | `dynamic_eq_bandwidth_coupling` | `0.5` | `0.5` | нет | `default` |
| 67 | `stereo_imager_frequency_split_point_hz` | `200` | `200` | нет | `default` |
| 68 | `scene_width_expansion` | `100` | `100` | нет | `default` |
| 69 | `a5_adapt_density_lambda_smoothing_coefficient` | `0.85` | `0.85` | нет | `default` |
| 70 | `stereo_width_chorus_flanger_depth` | `0.7` | `0.7` | нет | `default` |
| 71 | `reverberation_subharmonic_uncoupling_dampening_mix` | `0.2` | `0.2` | нет | `default` |
| 72 | `spectral_coherence_cross_spectral_phase_dispersion_ratio` | `0.1` | `0.1` | нет | `default` |
| 73 | `stereo_pan_lfo_speed` | `1` | `1` | нет | `default` |
| 74 | `dynamic_eq_band_coupling_ratio` | `0.3` | `0.3` | нет | `default` |
| 75 | `membrane_damping_coefficient` | `0.3` | `0.3` | нет | `default` |
| 76 | `vocal_formant_f1_bandwidth_glottal_coupling_ratio` | `0.4` | `0.4` | нет | `default` |
| 77 | `acoustic_ray_tracing_wall_absorption_coefficient` | `0.35` | `0.35` | нет | `default` |
| 78 | `acoustic_air_absorption_humidity_ratio` | `0.5` | `0.5` | нет | `default` |
| 79 | `vocal_vector_spatial_width_s` | `7` | `7` | нет | `default` |
| 80 | `room_wall_absorption_high_frequency_ratio` | `0.2` | `0.2` | нет | `default` |
| 81 | `wcag_audio_contrast_ratio_compliance_level` | `level_aa` | `level_aa` | нет | `default` |
| 82 | `vocal_subglottal_pressure_shimmer_ratio` | `0.05` | `0.05` | нет | `default` |
| 83 | `infrasonic_phase_coherence_bandwidth_hz` | `35` | `35` | нет | `default` |
| 84 | `resonance_frequency_peak_width` | `1` | `1` | нет | `default` |
| 85 | `spectral_delay_time_spread_ratio` | `0` | `0` | нет | `default` |
| 86 | `shadowing_reflections_subconscious_foldback_frequency` | `500` | `500` | нет | `default` |
| 87 | `subharmonic_generator_mix_ratio` | `0.2` | `0.2` | нет | `default` |
| 88 | `granular_resynthesis_grain_size` | `350` | `350` | нет | `default` |
| 89 | `audio_buffer_size_samples` | `256` | `256` | нет | `default` |
| 90 | `shepard_tone_spectral_octave_bandwidth_blend` | `4` | `4` | нет | `default` |
| 91 | `spectral_kurtosis_coefficient_ratio` | `3` | `3` | нет | `default` |
| 92 | `stereo_matrix_mid_side_balance_db` | `0` | `0` | нет | `default` |
| 93 | `granular_pan_spray_width` | `50` | `50` | нет | `default` |
| 94 | `spectrogram_time_resolution_hop_size` | `256` | `256` | нет | `default` |
| 95 | `oscillator_sync_ratio` | `2` | `2` | нет | `default` |
| 96 | `analog_tape_asymmetric_saturator_bias_ratio` | `0` | `0` | нет | `default` |
| 97 | `micro_harmony_generator_amplitude_scale` | `0.5` | `0.5` | нет | `default` |
| 98 | `granular_time_stretch_ratio` | `1` | `1` | нет | `default` |
| 99 | `subharmonic_frequency_divider_ratio` | `2` | `2` | нет | `default` |
| 100 | `perceptual_sharpness_sone_ratio` | `1` | `1` | нет | `default` |
