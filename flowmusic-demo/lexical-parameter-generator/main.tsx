import React, { useState } from "react";
import { Copy, Check, RefreshCw, Layers, Terminal, Sparkles, Sliders, Dna, Hash, Download, Database } from "lucide-react";

export interface GeneratedParameter {
  technical_name: string;
  name_ru: string;
  description_en: string;
  description_ru: string;
  category: string;
  sub_category: string;
  ui_element: "Range" | "Select" | "Toggle" | "Text" | "String" | "Array";
  default: string | number | number[];
  unit: string;
  quantity_kind: string;
  lyria_prompt_tags: [string, string, string];
  semantic_keywords: [string, string, string, string, string, string, string];
  min_value?: number;
  max_value?: number;
  step?: number;
  options?: string[];
}

export interface GeneratedBatch {
  collection_protocol: "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1";
  batch_index: number;
  parameters: GeneratedParameter[];
}

export interface MultiBatchPayload {
  collection_protocol: "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1";
  batches_count: number;
  total_parameters: number;
  start_batch_index: number;
  end_batch_index: number;
  batches: GeneratedBatch[];
}

// PRNG generator
function createPRNG(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN<T>(arr: T[], count: number, rand: () => number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface DomainBlueprint {
  category: string;
  sub_categories: Array<{
    name: string;
    prefixes: Array<{ en: string; ru: string }>;
    cores: Array<{ en: string; ru: string; action_en: string; action_ru: string; kind: string }>;
    quantities: Array<{
      en: string;
      ru: string;
      element: "Range" | "Select" | "Toggle" | "Text" | "String" | "Array";
      unit: string;
      kind: string;
      rangeSpec?: { min: number; max: number; step: number; defaultGen: (rand: () => number) => number };
      selectSpec?: { options: string[]; defaultVal: string };
      toggleSpec?: { defaultVal: 0 | 1 };
      textSpec?: { defaultVal: string };
      stringSpec?: { defaultVal: string };
      arraySpec?: { defaultVal: number[]; unit: string };
    }>;
    tags: string[];
    keywords_ru: string[];
    keywords_en: string[];
  }>;
}

const BLUEPRINTS: DomainBlueprint[] = [
  // 1. Vocal morphology
  {
    category: "Vocal Morphology",
    sub_categories: [
      {
        name: "Guttural Resonator",
        prefixes: [
          { en: "vocal_guttural", ru: "гуттурального вокала" },
          { en: "subglottal_throat", ru: "подскладочного тракта" },
          { en: "false_chord", ru: "ложных голосовых связок" },
          { en: "arytenoid_mucosal", ru: "черпаловидной слизистой" },
          { en: "epiglottic_funnel", ru: "надгортанной воронки" },
          { en: "tracheal_column", ru: "трахеального столба" },
          { en: "visceral_subharmonic", ru: "висцеральных субгармоник" },
          { en: "ventricular_fold", ru: "вестибулярных складок" }
        ],
        cores: [
          { en: "cavity_resonance", ru: "резонанс полости", action_en: "throat acoustic mass", action_ru: "акустическую массу гортани", kind: "resonance" },
          { en: "subharmonic_injection", ru: "внедрение субгармоник", action_en: "sub-octave density", action_ru: "плотность суб-октавных обертонов", kind: "depth" },
          { en: "pharyngeal_overdrive", ru: "перегруз фаринкса", action_en: "growl spectral grit", action_ru: "спектральную зернистость гроула", kind: "saturation" },
          { en: "turbulent_vorticity", ru: "турбулентная вихреватость", action_en: "harsh phonation air vortex", action_ru: "вихревую струю жесткой фонации", kind: "turbulence" },
          { en: "compression_choke", ru: "сжатие замыкания", action_en: "glottal closure velocity", action_ru: "скорость смыкания голосовой щели", kind: "compression" },
          { en: "tissue_damping", ru: "демпфирование тканей", action_en: "viscous vocal fold attenuation", action_ru: "вязкое демпфирование голосовых складок", kind: "damping" }
        ],
        quantities: [
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.01, defaultGen: (r) => +(0.2 + r() * 0.6).toFixed(2) }
          },
          {
            en: "mode", ru: "режим", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["subharmonic_growl", "false_chord_slam", "visceral_drain", "arytenoid_crush", "tracheal_roar"], defaultVal: "false_chord_slam" }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          },
          {
            en: "depth_db", ru: "глубина дб", element: "Range", unit: "db", kind: "gain",
            rangeSpec: { min: -18.0, max: 12.0, step: 0.25, defaultGen: (r) => +(-6.0 + r() * 12.0).toFixed(1) }
          },
          {
            en: "envelope", ru: "огибающая", element: "Array", unit: "normalized_ratio_per_stage", kind: "envelope",
            arraySpec: { defaultVal: [0.0, 0.85, 0.45, 0.95], unit: "normalized_ratio_per_stage" }
          }
        ],
        tags: ["subterranean chest vocal growl", "heavy guttural vocal resonance", "dark textured extreme undertone", "deep subharmonic vocal mass", "cavernous false chord growl", "visceral arytenoid roar", "subglottal acoustic pressure"],
        keywords_ru: ["субгармоники", "гуттурал", "ложные связки", "фаринкс", "гроул", "гортанный резонанс", "экстремальный вокал", "надгортанник", "черпаловидный хрящ"],
        keywords_en: ["subharmonics", "guttural growl", "false vocal chords", "pharyngeal acoustic", "throat resonance", "undertone depth", "vocal grit", "arytenoid phonation", "tracheal roar"]
      },
      {
        name: "Formant Dispersion",
        prefixes: [
          { en: "vocal_formant", ru: "формант вокала" },
          { en: "spectral_vowel", ru: "гласных фонем" },
          { en: "larynx_acoustic", ru: "акустики гортани" },
          { en: "oral_tract", ru: "ротовой полости" },
          { en: "nasal_concha", ru: "носовых раковин" },
          { en: "velic_aperture", ru: "небного клапана" }
        ],
        cores: [
          { en: "dispersion_shift", ru: "сдвиг дисперсии", action_en: "perceived vocal tract geometry", action_ru: "геометрию вокального тракта", kind: "formant_shift" },
          { en: "cluster_attenuation", ru: "подавление кластера", action_en: "high vowel formant brilliance", action_ru: "яркость верхних формант", kind: "attenuation" },
          { en: "bandwidth_expansion", ru: "расширение полосы", action_en: "formant sharpness across speech frames", action_ru: "остроту формантных пиков речи", kind: "bandwidth" },
          { en: "spectral_tilt", ru: "спектральный наклон", action_en: "high frequency glottal roll-off", action_ru: "спад высоких частот голосового источника", kind: "tilt" }
        ],
        quantities: [
          {
            en: "semitones", ru: "полутонов", element: "Range", unit: "semitones", kind: "pitch_bend",
            rangeSpec: { min: -12.0, max: 12.0, step: 0.25, defaultGen: (r) => +(-3.0 - r() * 4.0).toFixed(2) }
          },
          {
            en: "profile", ru: "профиль", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["cavernous_elongation", "hyper_compressed_vowel", "nasal_metallic_chasm", "inverted_pharynx", "open_velum"], defaultVal: "cavernous_elongation" }
          },
          {
            en: "array", ru: "массив", element: "Array", unit: "hz_per_formant", kind: "frequency",
            arraySpec: { defaultVal: [450, 920, 2400, 3600], unit: "hz_per_formant" }
          },
          {
            en: "routing_tag", ru: "метка маршрута", element: "String", unit: "identifier", kind: "identifier",
            stringSpec: { defaultVal: "vocal_formant_bus_f1_f4" }
          }
        ],
        tags: ["formant shifted vocal tract", "cavernous larynx resonance", "visceral extreme vocal tone", "deep throat phonation", "metallic vocal dispersion", "nasal resonator coloring"],
        keywords_ru: ["формантный сдвиг", "акустика гортани", "гласные фонемы", "тракт вокала", "дисперсия звука", "спектральный формант", "тембр голоса", "носовые раковины"],
        keywords_en: ["formant shift", "vocal tract", "larynx acoustic", "vowel dispersion", "phonation modeling", "spectral throat", "formant cluster", "velum acoustic"]
      }
    ]
  },
  // 2. Synthesis physics
  {
    category: "Synthesis Physics",
    sub_categories: [
      {
        name: "Waveguide String",
        prefixes: [
          { en: "waveguide_string", ru: "волноводной струны" },
          { en: "physical_bore", ru: "акустического волновода" },
          { en: "coupled_beam", ru: "связанной балки" },
          { en: "struck_plate", ru: "ударной пластины" },
          { en: "spring_reverberator", ru: "пружинного диспергатора" },
          { en: "nonlinear_membrane", ru: "нелинейной мембраны" }
        ],
        cores: [
          { en: "inharmonicity_dispersion", ru: "дисперсионная негармоничность", action_en: "string structural stiffness", action_ru: "структурную жесткость струны", kind: "dispersion" },
          { en: "nonlinear_terminator_loss", ru: "нелинейные потери окончания", action_en: "bridge termination friction", action_ru: "трение на порожке волновода", kind: "friction" },
          { en: "mechanical_impedance", ru: "механический импеданс", action_en: "reflection energy retention", action_ru: "сохранение энергии отражения", kind: "impedance" },
          { en: "torsional_coupling", ru: "торсионное сопряжение", action_en: "rotational mode energy transfer", action_ru: "перенос энергии во вращательные моды", kind: "coupling" },
          { en: "collision_rebound", ru: "ударный отскок", action_en: "fretboard hammer restitution", action_ru: "упругость соударения о ладовый порожек", kind: "elasticity" }
        ],
        quantities: [
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.005, defaultGen: (r) => +(0.1 + r() * 0.4).toFixed(3) }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          },
          {
            en: "losses", ru: "потери", element: "Array", unit: "damping_coefficient_per_tap", kind: "damping",
            arraySpec: { defaultVal: [0.08, 0.19, 0.42, 0.81], unit: "damping_coefficient_per_tap" }
          },
          {
            en: "material", ru: "материал", element: "Select", unit: "mode", kind: "material_mode",
            selectSpec: { options: ["wound_tungsten", "phosphor_bronze", "crystalline_carbon", "cold_rolled_steel"], defaultVal: "wound_tungsten" }
          }
        ],
        tags: ["physical waveguide string resonance", "inharmonic metallic ring", "acoustic dispersion transient", "plucked mechanical boundary", "resonant bore reflection", "percussive membrane vibration"],
        keywords_ru: ["волноводная струна", "негармоничность", "механический импеданс", "физическое моделирование", "порожек струны", "акустический резонанс", "затухание волны", "торсионная мода"],
        keywords_en: ["waveguide string", "inharmonicity stiffness", "physical modeling", "mechanical impedance", "dispersion coefficient", "acoustic boundary", "modal reflection", "torsional coupling"]
      }
    ]
  },
  // 3. Spectral DSP
  {
    category: "Spectral DSP",
    sub_categories: [
      {
        name: "Spectral Smear",
        prefixes: [
          { en: "spectral_fft", ru: "быстрого преобразования фурье" },
          { en: "spectral_bin", ru: "частотных ячеек спектра" },
          { en: "spectral_phase", ru: "спектральной фазы" },
          { en: "fourier_flux", ru: "потока фурье" },
          { en: "cepstral_lifter", ru: "кепстрального фильтра" },
          { en: "wavelet_packet", ru: "вейвлет пакетов" }
        ],
        cores: [
          { en: "freeze_decay", ru: "затухание заморозки", action_en: "energy hold time across bins", action_ru: "время удержания энергии в ячейках", kind: "duration" },
          { en: "flux_threshold", ru: "порог спектрального потока", action_en: "transient isolation boundary", action_ru: "границу изоляции транзиентов", kind: "threshold" },
          { en: "morphology_smear", ru: "морфологическое размытие", action_en: "inter-bin diffusion blur", action_ru: "диффузионное размытие между бинами", kind: "diffusion" },
          { en: "spectral_centroid_shift", ru: "смещение спектрального центроида", action_en: "spectral brightness balance center", action_ru: "центр спектрального баланса яркости", kind: "frequency" },
          { en: "phase_vocoder_coherence", ru: "когерентность фазового вокодера", action_en: "sinusoidal phase locking precision", action_ru: "точность захвата фаз синусоид", kind: "coherence" }
        ],
        quantities: [
          {
            en: "ms", ru: "миллисекунд", element: "Range", unit: "ms", kind: "duration",
            rangeSpec: { min: 20.0, max: 8000.0, step: 20.0, defaultGen: (r) => +(200 + r() * 1500).toFixed(0) }
          },
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.01, defaultGen: (r) => +(0.3 + r() * 0.5).toFixed(2) }
          },
          {
            en: "kernel", ru: "ядро", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["gaussian_spread", "exponential_decay", "caustic_prism", "hyperbolic_blur", "lorentzian_window"], defaultVal: "gaussian_spread" }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          }
        ],
        tags: ["shimmering spectral smear pad", "infinite fft freeze drone", "complex frequency diffusion", "glassy overtone smear", "transient blur pad", "phase vocoder stretch"],
        keywords_ru: ["спектральное размытие", "заморозка fft", "частотные ячейки", "спектральный поток", "размытие фаз", "диффузия частот", "дроун текстура", "кепстр"],
        keywords_en: ["spectral smear", "fft freeze", "spectral flux", "bin diffusion", "phase smearing", "frequency blur", "spectral pad", "phase vocoder"]
      }
    ]
  },
  // 4. Spatial binaural
  {
    category: "Spatial Binaural",
    sub_categories: [
      {
        name: "HRTF Transaural",
        prefixes: [
          { en: "binaural_pinna", ru: "ушной раковины hrtf" },
          { en: "spatial_interaural", ru: "межслуховой акустики" },
          { en: "head_shadow", ru: "теневого эффекта головы" },
          { en: "spherical_torso", ru: "торакального отражения" },
          { en: "ambisonic_hoa", ru: "высших порядков амбисоники" },
          { en: "wavefield_boundary", ru: "границы волнового поля" }
        ],
        cores: [
          { en: "elevation_notch", ru: "спектральная вырезка высоты", action_en: "psychoacoustic vertical positioning", action_ru: "вертикальное позиционирование звука", kind: "frequency" },
          { en: "time_difference", ru: "временная разность прибытия", action_en: "lateral azimuth localization", action_ru: "азимутальную локализацию источника", kind: "delay" },
          { en: "crosstalk_cancellation", ru: "подавление взаимопроникновения", action_en: "transaural speaker field width", action_ru: "ширину трансаурального стереополя", kind: "crosstalk" },
          { en: "torso_acoustic_reflection", ru: "отражение от торса", action_en: "chest cavity comb filtering delay", action_ru: "гребенчатую задержку грудного отражения", kind: "delay" },
          { en: "diffuseness_coefficient", ru: "коэффициент диффузности", action_en: "surround spatial envelopment", action_ru: "окружающее пространственное охватывание", kind: "diffuseness" }
        ],
        quantities: [
          {
            en: "freq_hz", ru: "частота герц", element: "Range", unit: "hz", kind: "frequency",
            rangeSpec: { min: 2500.0, max: 14000.0, step: 50.0, defaultGen: (r) => +(4000 + r() * 5000).toFixed(0) }
          },
          {
            en: "ms", ru: "миллисекунд", element: "Range", unit: "ms", kind: "delay",
            rangeSpec: { min: 0.0, max: 1.2, step: 0.02, defaultGen: (r) => +(0.1 + r() * 0.6).toFixed(2) }
          },
          {
            en: "profile", ru: "профиль", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["diffuse_field_kemar", "individual_ear_mesh", "transaural_dipole", "spherical_torso_7th", "raytraced_anechoic"], defaultVal: "diffuse_field_kemar" }
          },
          {
            en: "azimuth_deg", ru: "азимут градусов", element: "Range", unit: "deg", kind: "azimuth",
            rangeSpec: { min: -180.0, max: 180.0, step: 1.0, defaultGen: (r) => Math.floor(-90 + r() * 180) }
          }
        ],
        tags: ["3d binaural spatialization", "pinna spectral notch depth", "hyper realistic head shadow", "accurate azimuth localization", "immersive binaural soundstage", "spherical ambisonic field"],
        keywords_ru: ["бинауральный звук", "локализация по высоте", "вырезка ушной раковины", "тень головы", "межслуховая разность", "пространственная глубина", "стереосцена", "амбисоника"],
        keywords_en: ["binaural hrtf", "pinna notch", "elevation cue", "head shadow", "interaural delay", "spatial immersion", "azimuth localization", "hoa ambisonic"]
      }
    ]
  },
  // 5. Dynamics envelope
  {
    category: "Dynamics Envelope",
    sub_categories: [
      {
        name: "Transient Splitter",
        prefixes: [
          { en: "transient_envelope", ru: "транзиентного огибающего" },
          { en: "dynamics_crest", ru: "пик-фактора динамики" },
          { en: "impact_chisel", ru: "ударного клипера" },
          { en: "feedforward_vca", ru: "прямоточного vca" },
          { en: "multiband_saturator", ru: "многополосного сатуратора" },
          { en: "lookahead_limiter", ru: "упреждающего лимитера" }
        ],
        cores: [
          { en: "attack_crest", ru: "гребень атаки", action_en: "initial percussive punch prominence", action_ru: "яркость начального перкуссионного щелчка", kind: "gain" },
          { en: "sustain_clamping", ru: "удержание сустейна", action_en: "body resonance level post-hit", action_ru: "уровень сустейна после удара", kind: "compression" },
          { en: "recovery_hysteresis", ru: "гистерезис восстановления", action_en: "release curve memory smoothing", action_ru: "сглаживание кривой отпускания", kind: "damping" },
          { en: "clipping_knee_softness", ru: "мягкость колена клиппинга", action_en: "saturation transition curvature", action_ru: "кривизну перехода в сатурацию", kind: "curvature" },
          { en: "crest_factor_gate", ru: "порог пик-фактора", action_en: "dynamic range separation trigger", action_ru: "триггер разделения динамического диапазона", kind: "threshold" }
        ],
        quantities: [
          {
            en: "gain_db", ru: "усиление дб", element: "Range", unit: "db", kind: "gain",
            rangeSpec: { min: -18.0, max: 24.0, step: 0.2, defaultGen: (r) => +(1.0 + r() * 6.0).toFixed(1) }
          },
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.01, defaultGen: (r) => +(0.4 + r() * 0.4).toFixed(2) }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          },
          {
            en: "topology", ru: "топология", element: "Select", unit: "mode", kind: "topology_mode",
            selectSpec: { options: ["feedforward_peak", "opto_hysteresis", "fet_hard_clip", "vari_mu_soft"], defaultVal: "feedforward_peak" }
          }
        ],
        tags: ["hyper dynamic transient punch", "crisp percussive attack snap", "tight drum body control", "aggressive impact crest boost", "punchy dynamic transient", "smooth optical recovery"],
        keywords_ru: ["гребень атаки", "транзиентный сплиттер", "ударный щелчок", "пик фактор", "сустейн компрессия", "динамический напор", "транзиент шейпер", "колено компрессора"],
        keywords_en: ["transient attack", "crest factor", "dynamic snap", "punch boost", "sustain clamping", "transient shaping", "percussive impact", "clipping knee"]
      }
    ]
  },
  // 6. Temporal rhythm
  {
    category: "Temporal Rhythm",
    sub_categories: [
      {
        name: "Microtiming Jitter",
        prefixes: [
          { en: "rhythm_microtiming", ru: "микротайминга ритма" },
          { en: "polymetric_drift", ru: "полиметрического дрейфа" },
          { en: "groove_jitter", ru: "флуктуаций грува" },
          { en: "subdivision_warp", ru: "деформации дробления долей" },
          { en: "syncopated_gravity", ru: "синкопированной гравитации" },
          { en: "metric_modulator", ru: "метрического модулятора" }
        ],
        cores: [
          { en: "gaussian_deviation", ru: "гауссово отклонение", action_en: "human feel timing dispersion", action_ru: "живое рассеивание времени ударов", kind: "duration" },
          { en: "syncopation_bias", ru: "смещение синкоп", action_en: "offbeat gravity pull", action_ru: "тяготение слабых долей", kind: "bias" },
          { en: "swing_curvature", ru: "кривизна свинга", action_en: "subdivision compression ratio", action_ru: "компрессию шестнадцатых долей", kind: "ratio" },
          { en: "polymetric_phase_offset", ru: "фазовый сдвиг полиметрии", action_en: "inter-metric cycle collision point", action_ru: "точку соударения метрических циклов", kind: "phase" },
          { en: "groove_inertia", ru: "инерция грува", action_en: "tempo acceleration resistance", action_ru: "сопротивление ускорению темпа", kind: "inertia" }
        ],
        quantities: [
          {
            en: "ms", ru: "миллисекунд", element: "Range", unit: "ms", kind: "duration",
            rangeSpec: { min: 0.0, max: 50.0, step: 0.5, defaultGen: (r) => +(3.0 + r() * 12.0).toFixed(1) }
          },
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.01, defaultGen: (r) => +(0.5 + r() * 0.3).toFixed(2) }
          },
          {
            en: "grid_weights", ru: "веса сетки", element: "Array", unit: "timing_bias_per_sixteenth", kind: "probability",
            arraySpec: { defaultVal: [0.0, 0.15, -0.05, 0.2], unit: "timing_bias_per_sixteenth" }
          },
          {
            en: "groove_template", ru: "шаблон грува", element: "String", unit: "label", kind: "identifier",
            stringSpec: { defaultVal: "quintuplet_shuffle_pocket" }
          }
        ],
        tags: ["organic humanized drum groove", "loose swing microtiming drift", "syncopated offbeat timing", "relaxed rhythmic pocket", "polyrhythmic micro jitter", "metric modulation shift"],
        keywords_ru: ["микротайминг", "гуманизация грува", "отклонение сетки", "синкопированный свинг", "дрейф долей", "ритмический карман", "полиритмический сдвиг", "полиметрия"],
        keywords_en: ["microtiming jitter", "humanized groove", "swing curvature", "timing deviation", "offbeat syncopation", "polymetric drift", "rhythmic pocket", "metric modulation"]
      }
    ]
  },
  // 7. Generative chaos
  {
    category: "Generative Chaos",
    sub_categories: [
      {
        name: "L-System Grammar",
        prefixes: [
          { en: "generative_lsystem", ru: "lsystem грамматики" },
          { en: "fractal_branching", ru: "фрактального ветвления" },
          { en: "cellular_automata", ru: "клеточного автомата" },
          { en: "strange_attractor", ru: "странного аттрактора" },
          { en: "markov_transition", ru: "марковских переходов" },
          { en: "mandelbrot_orbit", ru: "орбиты мандельброта" }
        ],
        cores: [
          { en: "recursion_depth", ru: "глубина рекурсии", action_en: "structural hierarchical complexity", action_ru: "иерархическую сложность структуры", kind: "recursion_depth" },
          { en: "axiom_expression", ru: "выражение аксиомы", action_en: "root seed symbolic structure", action_ru: "символьную структуру начального семени", kind: "identifier" },
          { en: "divergence_rate", ru: "скорость дивергенции", action_en: "chaotic attractor deviation speed", action_ru: "скорость отклонения аттрактора хаоса", kind: "entropy" },
          { en: "lyapunov_exponent", ru: "показатель ляпунова", action_en: "orbit unpredictability amplification", action_ru: "усиление непредсказуемости траектории", kind: "exponent" },
          { en: "self_similarity_scale", ru: "масштаб самоподобия", action_en: "inter-tier fractal motif reflection", action_ru: "отражение мотивов между фрактальными уровнями", kind: "scale" }
        ],
        quantities: [
          {
            en: "limit", ru: "предел", element: "Range", unit: "depth", kind: "recursion_depth",
            rangeSpec: { min: 1, max: 9, step: 1, defaultGen: (r) => Math.floor(3 + r() * 4) }
          },
          {
            en: "expression", ru: "строка", element: "String", unit: "expression", kind: "identifier",
            stringSpec: { defaultVal: "omega_axiom_root_branch" }
          },
          {
            en: "ruleset", ru: "набор правил", element: "Text", unit: "text", kind: "grammar",
            textSpec: { defaultVal: "A -> AB[+C]A; B -> BA[-A]; C -> [A+B]" }
          },
          {
            en: "entropy_ratio", ru: "коэффициент энтропии", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.01, defaultGen: (r) => +(0.4 + r() * 0.5).toFixed(2) }
          }
        ],
        tags: ["recursive fractal melody motif", "generative lsystem composition", "chaotic branching pitch lattice", "self similar algorithmic evolution", "fractal structural hierarchy", "strange attractor trajectory"],
        keywords_ru: ["глубина рекурсии", "lsystem грамматика", "фрактальная композиция", "алгоритмическое ветвление", "аксиома семени", "аттрактор хаоса", "генеративный мотив", "показатель ляпунова"],
        keywords_en: ["recursion depth", "lsystem grammar", "fractal branching", "generative composition", "seed axiom", "chaotic attractor", "algorithmic music", "lyapunov exponent"]
      }
    ]
  },
  // 8. Compositional vector
  {
    category: "Compositional Vector",
    sub_categories: [
      {
        name: "Microtonal Temperament",
        prefixes: [
          { en: "microtonal_edo", ru: "микрохроматики edo" },
          { en: "harmonic_lattice", ru: "гармонической решетки" },
          { en: "tonal_attractor", ru: "тонального аттрактора" },
          { en: "just_intonation", ru: "чистого строя" },
          { en: "shruti_gamaka", ru: "шрути орнаментики" },
          { en: "spectral_pitch_class", ru: "спектральных звукорядов" }
        ],
        cores: [
          { en: "scale_divisions", ru: "деления шкалы", action_en: "octave interval density", action_ru: "плотность делений октавы", kind: "mode" },
          { en: "gravitational_pull", ru: "гравитационное тяготение", action_en: "consonance resolution urgency", action_ru: "стремление к консонантному разрешению", kind: "ratio" },
          { en: "sruti_cents_offset", ru: "центовое смещение шрути", action_en: "pure third interval purity", action_ru: "чистоту звучания терцовых интервалов", kind: "cents" },
          { en: "tonic_inertia", ru: "инерция тоники", action_en: "key center stabilization resistance", action_ru: "сопротивление смене тонального центра", kind: "inertia" },
          { en: "voice_leading_friction", ru: "трение голосоведения", action_en: "stepwise movement impedance", action_ru: "сопротивление поступенному движению голосов", kind: "friction" }
        ],
        quantities: [
          {
            en: "count", ru: "количество", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["12_edo", "19_edo", "22_edo_sruti", "31_edo_fokker", "53_edo_mercat", "72_edo_ekmelic"], defaultVal: "22_edo_sruti" }
          },
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 2.0, step: 0.01, defaultGen: (r) => +(0.7 + r() * 0.8).toFixed(2) }
          },
          {
            en: "cents", ru: "центы", element: "Array", unit: "cents_deviation_per_degree", kind: "cents",
            arraySpec: { defaultVal: [0, 112, 204, 316, 498, 702], unit: "cents_deviation_per_degree" }
          },
          {
            en: "matrix_label", ru: "метка матрицы", element: "String", unit: "label", kind: "identifier",
            stringSpec: { defaultVal: "euler_fokker_genus_3_5_7" }
          }
        ],
        tags: ["microtonal sruti harmonies", "exotic xenharmonic scale tuning", "pure meantone chord consonance", "non western interval lattice", "subtle microtonal inflection", "euler fokker pitch space"],
        keywords_ru: ["микротональность", "деления октавы", "строй edo", "гармоническая решетка", "индийские шрути", "чистая интонация", "диссонансный наклон", "голосоведение"],
        keywords_en: ["microtonal edo", "xenharmonic tuning", "sruti temperament", "harmonic lattice", "just intonation", "octave division", "scale consonance", "voice leading"]
      }
    ]
  },
  // 9. Modulation performance
  {
    category: "Modulation Performance",
    sub_categories: [
      {
        name: "Complex LFO",
        prefixes: [
          { en: "modulation_lfo", ru: "модулирующего генератора lfo" },
          { en: "cross_matrix", ru: "кросс матрицы модуляции" },
          { en: "expressive_macro", ru: "экспрессивного макроса" },
          { en: "bipolar_shaper", ru: "двуполярного шейпера" },
          { en: "stochastic_slew", ru: "стохастического сглаживателя" },
          { en: "morphing_modulator", ru: "морфинг модулятора" }
        ],
        cores: [
          { en: "symmetry_skew", ru: "перекос симметрии", action_en: "oscillator wave shape slope", action_ru: "наклон фронта формы волны", kind: "ratio" },
          { en: "hysteresis_damping", ru: "демпфирование гистерезиса", action_en: "inertial response lag", action_ru: "инерционную задержку отклика", kind: "damping" },
          { en: "frequency_fm_bleed", ru: "проникновение fm модуляции", action_en: "sideband generation intensity", action_ru: "интенсивность генерации боковых полос", kind: "frequency" },
          { en: "slew_rate_rise_ms", ru: "скорость нарастания фронта", action_en: "control voltage transient softening", action_ru: "смягчение управляющего перепада напряжения", kind: "duration" },
          { en: "phase_quadrature_angle", ru: "квадратурный угол фазы", action_en: "stereo cross-modulation displacement", action_ru: "стерео сдвиг взаимосвязанных модуляторов", kind: "phase" }
        ],
        quantities: [
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.01, max: 0.99, step: 0.01, defaultGen: (r) => +(0.2 + r() * 0.6).toFixed(2) }
          },
          {
            en: "hz", ru: "герц", element: "Range", unit: "hz", kind: "frequency",
            rangeSpec: { min: 0.05, max: 40.0, step: 0.05, defaultGen: (r) => +(0.5 + r() * 8.0).toFixed(2) }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          },
          {
            en: "waveform", ru: "форма волны", element: "Select", unit: "mode", kind: "waveform_mode",
            selectSpec: { options: ["hyperbolic_sine", "exponential_saw", "stepped_random", "chaotic_lorenz_loop"], defaultVal: "hyperbolic_sine" }
          }
        ],
        tags: ["asymmetrical lfo pulse sweep", "dynamic matrix modulation gesture", "expressive parameter wobble", "nonlinear modulation curve", "rhythmic control voltage drift", "stochastic slew modulation"],
        keywords_ru: ["симметрия lfo", "форма волны", "кросс модуляция", "наклон фронта", "макро контроллер", "модуляционная матрица", "гистерезис сигнала", "скорость нарастания"],
        keywords_en: ["lfo symmetry", "wave skew", "cross modulation", "macro gesture", "hysteresis lag", "modulation matrix", "parameter sweep", "slew rate"]
      }
    ]
  },
  // 10. Cross-Domain controls
  {
    category: "Cross-Domain Controls",
    sub_categories: [
      {
        name: "Spectral To Spatial Coupling",
        prefixes: [
          { en: "cross_domain_spectral_spatial", ru: "спектрально пространственной связи" },
          { en: "cross_domain_rhythm_chaos", ru: "связи ритма и хаоса" },
          { en: "cross_domain_vocal_physics", ru: "связи вокала и физики струн" },
          { en: "cross_domain_dynamics_pitch", ru: "связи динамики и микрохроматики" },
          { en: "cross_domain_entropy_timbre", ru: "связи энтропии и тембрального спектра" },
          { en: "cross_domain_spatial_envelope", ru: "связи огибающей и бинаурального поля" }
        ],
        cores: [
          { en: "coupling_factor", ru: "фактор сцепления", action_en: "inter-domain modulation depth", action_ru: "глубину междисциплинарной модуляции", kind: "coupling_factor" },
          { en: "flux_inertia", ru: "инерция потока", action_en: "response decay lag between systems", action_ru: "задержку отклика между подсистемами", kind: "inertia" },
          { en: "link_state", ru: "состояние связи", action_en: "bilateral feedback routing", action_ru: "двусторонний маршрут обратной связи", kind: "state" },
          { en: "nonlinearity_threshold", ru: "порог нелинейности", action_en: "cross-modulation saturation trigger", action_ru: "триггер взаимного насыщения каналов", kind: "threshold" },
          { en: "feedback_absorption", ru: "поглощение обратной связи", action_en: "runaway signal dampening", action_ru: "гашение паразитных резонансов связи", kind: "damping" }
        ],
        quantities: [
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "coupling_factor",
            rangeSpec: { min: 0.0, max: 2.0, step: 0.02, defaultGen: (r) => +(0.5 + r() * 1.0).toFixed(2) }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          },
          {
            en: "mapping_expression", ru: "выражение отображения", element: "Text", unit: "text", kind: "expression",
            textSpec: { defaultVal: "spectral_flux(t) * sin(spatial_azimuth)" }
          },
          {
            en: "coupling_matrix", ru: "матрица сцепления", element: "Array", unit: "coupling_weight_per_node", kind: "weights",
            arraySpec: { defaultVal: [0.25, 0.75, 1.0, 0.45], unit: "coupling_weight_per_node" }
          }
        ],
        tags: ["dynamic cross domain coupling", "spectral stereo width flare", "chaotic rhythm interlock motion", "complex multi domain gesture", "organic interlinked sonic topology", "bilateral system feedback"],
        keywords_ru: ["междоменная связь", "спектрально пространственный фактор", "связь ритма и хаоса", "обратная связь систем", "стерео расширение", "модуляция топологии", "мультидоменная физика", "сцепление каналов"],
        keywords_en: ["cross domain coupling", "spectral spatial link", "chaos rhythm coupling", "interconnected parameter", "stereo flare", "multi domain dsp", "topology gesture", "bilateral feedback"]
      }
    ]
  }
];

function generateProceduralBatch(batchIndex: number, userSeed?: number): GeneratedBatch {
  const seed = (userSeed ?? 1337) + batchIndex * 10007;
  const rand = createPRNG(seed);

  const parameters: GeneratedParameter[] = BLUEPRINTS.map((domainBlueprint, domainIdx) => {
    const subCat = pick(domainBlueprint.sub_categories, rand);
    const prefix = pick(subCat.prefixes, rand);
    const core = pick(subCat.cores, rand);
    const quantity = pick(subCat.quantities, rand);

    const technical_name = `${prefix.en}_${core.en}_${quantity.en}`;
    const name_ru = `${capitalize(quantity.ru)} ${core.ru} ${prefix.ru}`;

    let description_en = "";
    let description_ru = "";

    const tags = pickN(subCat.tags, 3, rand) as [string, string, string];
    const kw_ru = pickN(subCat.keywords_ru, 3, rand);
    const kw_en = pickN(subCat.keywords_en, 4, rand);
    const semantic_keywords: [string, string, string, string, string, string, string] = [
      kw_ru[0], kw_ru[1], kw_ru[2], kw_en[0], kw_en[1], kw_en[2], kw_en[3]
    ];

    const param: GeneratedParameter = {
      technical_name,
      name_ru,
      description_en: "",
      description_ru: "",
      category: domainBlueprint.category,
      sub_category: subCat.name,
      ui_element: quantity.element,
      default: 0,
      unit: quantity.unit,
      quantity_kind: quantity.kind,
      lyria_prompt_tags: tags,
      semantic_keywords
    };

    if (quantity.element === "Range" && quantity.rangeSpec) {
      const spec = quantity.rangeSpec;
      const def = spec.defaultGen(rand);
      param.min_value = spec.min;
      param.max_value = spec.max;
      param.step = spec.step;
      param.default = def;
      description_en = `Controls ${core.action_en}; lower values soften response, higher values aggressively amplify ${core.action_en}.`;
      description_ru = `Управляет ${core.action_ru}; низкие значения смягчают отклик, высокие значения агрессивно усиливают ${core.action_ru}.`;
    } else if (quantity.element === "Select" && quantity.selectSpec) {
      const spec = quantity.selectSpec;
      param.options = [...spec.options];
      param.default = spec.defaultVal;
      description_en = `Selects operational mode for ${core.action_en}; determines the internal routing and algorithmic acoustic behavior.`;
      description_ru = `Выбирает режим обработки для ${core.action_ru}; определяет внутреннюю маршрутизацию и акустическое поведение.`;
    } else if (quantity.element === "Toggle" && quantity.toggleSpec) {
      param.min_value = 0;
      param.max_value = 1;
      param.step = 1;
      param.default = quantity.toggleSpec.defaultVal;
      description_en = `Toggles dynamic active state of ${core.action_en}; state 0 bypasses the module, state 1 engages non-linear processing.`;
      description_ru = `Переключает активность блока ${core.action_ru}; состояние 0 отключает модуль, состояние 1 включает нелинейную обработку.`;
    } else if (quantity.element === "Array" && quantity.arraySpec) {
      param.default = [...quantity.arraySpec.defaultVal];
      description_en = `Specifies vector coefficients influencing ${core.action_en} across discrete acoustic stages or frequency bands.`;
      description_ru = `Задает вектор коэффициентов, определяющих ${core.action_ru} на дискретных этапах или частотных полосах.`;
    } else if (quantity.element === "String" && quantity.stringSpec) {
      param.default = `${quantity.stringSpec.defaultVal}_b${batchIndex}_d${domainIdx}`;
      description_en = `Defines machine identifier string configuring symbolic target for ${core.action_en}.`;
      description_ru = `Определяет символьный строковый идентификатор, задающий конфигурацию для ${core.action_ru}.`;
    } else if (quantity.element === "Text" && quantity.textSpec) {
      param.default = quantity.textSpec.defaultVal;
      description_en = `Human readable descriptive expression modulating dynamic behavior of ${core.action_en}.`;
      description_ru = `Текстовое выражение для управления динамическим поведением блока ${core.action_ru}.`;
    }

    param.description_en = description_en;
    param.description_ru = description_ru;

    return param;
  });

  return {
    collection_protocol: "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1",
    batch_index: batchIndex,
    parameters
  };
}

export function generateTenBatches(startBatchIndex: number, userSeed?: number): MultiBatchPayload {
  const batches: GeneratedBatch[] = [];
  for (let i = 0; i < 10; i++) {
    batches.push(generateProceduralBatch(startBatchIndex + i, userSeed));
  }
  return {
    collection_protocol: "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1",
    batches_count: 10,
    total_parameters: 100,
    start_batch_index: startBatchIndex,
    end_batch_index: startBatchIndex + 9,
    batches
  };
}

export default function Component() {
  const [batchIndex, setBatchIndex] = useState<number>(1);
  const [entropySeed, setEntropySeed] = useState<number>(42);
  const [currentBatch, setCurrentBatch] = useState<GeneratedBatch>(() => generateProceduralBatch(1, 42));
  const [copiedSingle, setCopiedSingle] = useState(false);
  const [copiedTen, setCopiedTen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "json" | "ten_batches_json">("cards");
  const [selectedParamIndex, setSelectedParamIndex] = useState<number>(0);
  const [totalGeneratedCount, setTotalGeneratedCount] = useState<number>(10);

  const handleNextBatch = () => {
    const nextIdx = batchIndex + 1;
    setBatchIndex(nextIdx);
    const newBatch = generateProceduralBatch(nextIdx, entropySeed);
    setCurrentBatch(newBatch);
    setTotalGeneratedCount(prev => prev + 10);
    setSelectedParamIndex(0);
  };

  const handleMutateEntropy = () => {
    const newSeed = Math.floor(Math.random() * 1000000);
    setEntropySeed(newSeed);
    const newBatch = generateProceduralBatch(batchIndex, newSeed);
    setCurrentBatch(newBatch);
    setSelectedParamIndex(0);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentBatch, null, 2));
    setCopiedSingle(true);
    setTimeout(() => setCopiedSingle(false), 2000);
  };

  const handleExportTenBatches = () => {
    const tenBatches = generateTenBatches(batchIndex, entropySeed);
    const jsonStr = JSON.stringify(tenBatches, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(jsonStr);
    setCopiedTen(true);
    setTimeout(() => setCopiedTen(false), 2000);

    // Also trigger file download
    try {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flowmusic_corpus_batches_${batchIndex}_to_${batchIndex + 9}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // In case sandbox restricts file download, clipboard copy still succeeds
    }
  };

  const selectedParam = currentBatch.parameters[selectedParamIndex] || currentBatch.parameters[0];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6 md:p-8">
      {/* Header Bar */}
      <header className="max-w-6xl w-full mx-auto flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Corpus 3x Expanded • 10-Batch Exporter
            </span>
            <span className="text-xs text-slate-400 font-mono">FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            Lexical Parameter Generator & Corpus Synthesizer
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Expanded 3x morpho-syntactic atom matrix with 100-parameter batch export capabilities
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono">
            <span className="text-slate-400 mr-2 flex items-center gap-1">
              <Hash className="w-3 h-3 text-emerald-400" />
              BATCH:
            </span>
            <input
              type="number"
              min={1}
              value={batchIndex}
              onChange={(e) => {
                const val = Math.max(1, parseInt(e.target.value) || 1);
                setBatchIndex(val);
                setCurrentBatch(generateProceduralBatch(val, entropySeed));
              }}
              className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-center focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={handleMutateEntropy}
            title="Randomize atom recombination seed"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium transition"
          >
            <Dna className="w-3.5 h-3.5" />
            Mutate Atoms
          </button>

          <button
            onClick={handleNextBatch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Next Batch
          </button>

          {/* 10 Batches Save Button */}
          <button
            onClick={handleExportTenBatches}
            title="Generate and export 10 sequential batches (100 parameters) in a single JSON"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-semibold transition shadow-md"
          >
            {copiedTen ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {copiedTen ? "Saved 10 Batches!" : "Save 10 Batches (100 params)"}
          </button>

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1 rounded text-xs transition ${viewMode === "cards" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
            >
              Inspector
            </button>
            <button
              onClick={() => setViewMode("json")}
              className={`px-3 py-1 rounded text-xs transition ${viewMode === "json" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
            >
              1 Batch JSON
            </button>
            <button
              onClick={() => setViewMode("ten_batches_json")}
              className={`px-3 py-1 rounded text-xs transition ${viewMode === "ten_batches_json" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
            >
              10 Batches JSON
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl w-full mx-auto flex-1 mt-6">
        {viewMode === "json" ? (
          <div className="relative bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/80">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Valid Protocol JSON payload • Batch #{currentBatch.batch_index} (10 parameters)
              </span>
              <button
                onClick={handleCopyJson}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono font-semibold"
              >
                {copiedSingle ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSingle ? "Copied Single Batch" : "Copy Batch JSON"}
              </button>
            </div>
            <pre className="font-mono text-xs text-emerald-300 overflow-x-auto p-2 bg-slate-950/70 rounded-lg max-h-[650px] leading-relaxed select-all">
              {JSON.stringify(currentBatch, null, 2)}
            </pre>
          </div>
        ) : viewMode === "ten_batches_json" ? (
          <div className="relative bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/80">
              <span className="text-xs font-mono text-amber-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Multi-Batch Corpus Payload • 10 Batches ({batchIndex}..{batchIndex + 9}) = 100 Parameters Total
              </span>
              <button
                onClick={handleExportTenBatches}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono font-semibold"
              >
                {copiedTen ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedTen ? "Copied 10-Batch JSON" : "Download / Copy 10 Batches"}
              </button>
            </div>
            <pre className="font-mono text-xs text-amber-300 overflow-x-auto p-2 bg-slate-950/70 rounded-lg max-h-[650px] leading-relaxed select-all">
              {JSON.stringify(generateTenBatches(batchIndex, entropySeed), null, 2)}
            </pre>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Parameter List (10 items) */}
            <div className="lg:col-span-5 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Synthesized in Batch #{currentBatch.batch_index}
                </span>
                <span className="text-xs font-mono text-slate-500">10 / 10 domains</span>
              </div>

              <div className="space-y-1.5 max-h-[650px] overflow-y-auto pr-1">
                {currentBatch.parameters.map((param, idx) => {
                  const isSelected = selectedParamIndex === idx;
                  return (
                    <button
                      key={param.technical_name + idx}
                      onClick={() => setSelectedParamIndex(idx)}
                      className={`w-full text-left p-3 rounded-lg border transition flex flex-col gap-1 ${
                        isSelected
                          ? "bg-slate-800/90 border-emerald-500/50 shadow-sm"
                          : "bg-slate-900/50 border-slate-800 hover:bg-slate-900 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          {param.category}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                          {param.ui_element}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-slate-200 truncate mt-1">
                        {param.technical_name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {param.name_ru}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Detailed Record Inspector */}
            <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      {selectedParam.category} / {selectedParam.sub_category}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      kind: {selectedParam.quantity_kind}
                    </span>
                  </div>
                  <h2 className="text-base font-mono font-bold text-white mt-2 select-all">
                    {selectedParam.technical_name}
                  </h2>
                  <p className="text-sm font-medium text-slate-300 mt-0.5">
                    {selectedParam.name_ru}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">UI Control</span>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 inline-block mt-1">
                    {selectedParam.ui_element}
                  </span>
                </div>
              </div>

              {/* Dynamic Value Simulator */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-3.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Interactive Preview & Specifications
                </span>

                {selectedParam.ui_element === "Range" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-300">
                      <span>min: {selectedParam.min_value} {selectedParam.unit}</span>
                      <span className="text-emerald-400 font-bold">default: {selectedParam.default} {selectedParam.unit}</span>
                      <span>max: {selectedParam.max_value} {selectedParam.unit}</span>
                    </div>
                    <input
                      type="range"
                      min={selectedParam.min_value ?? 0}
                      max={selectedParam.max_value ?? 1}
                      step={selectedParam.step ?? 0.01}
                      defaultValue={Number(selectedParam.default) || 0}
                      className="w-full accent-emerald-500"
                    />
                    <div className="text-[11px] text-slate-400 font-mono">step: {selectedParam.step} | unit: {selectedParam.unit}</div>
                  </div>
                )}

                {selectedParam.ui_element === "Select" && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-300 font-mono mb-1">
                      unit: {selectedParam.unit} | default: <span className="text-emerald-400">{selectedParam.default}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedParam.options?.map((opt) => (
                        <span
                          key={opt}
                          className={`px-2.5 py-1 rounded text-xs font-mono border ${
                            opt === selectedParam.default
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-slate-900 text-slate-400 border-slate-800"
                          }`}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedParam.ui_element === "Toggle" && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-300">Default: {selectedParam.default === 1 ? "1 (Active)" : "0 (Inactive)"}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      unit: boolean
                    </span>
                  </div>
                )}

                {selectedParam.ui_element === "String" && (
                  <div className="space-y-1 font-mono text-xs">
                    <div className="text-slate-400">Unit: {selectedParam.unit}</div>
                    <div className="bg-slate-900 border border-slate-800 p-2 rounded text-emerald-300">
                      "{selectedParam.default}"
                    </div>
                  </div>
                )}

                {selectedParam.ui_element === "Text" && (
                  <div className="space-y-1 font-mono text-xs">
                    <div className="text-slate-400">Unit: {selectedParam.unit}</div>
                    <div className="bg-slate-900 border border-slate-800 p-2 rounded text-emerald-300">
                      "{selectedParam.default}"
                    </div>
                  </div>
                )}

                {selectedParam.ui_element === "Array" && (
                  <div className="space-y-1 font-mono text-xs">
                    <div className="text-slate-400">Unit: {selectedParam.unit}</div>
                    <div className="bg-slate-900 border border-slate-800 p-2 rounded text-emerald-300">
                      {JSON.stringify(selectedParam.default)}
                    </div>
                  </div>
                )}
              </div>

              {/* Bilingual Descriptions */}
              <div className="space-y-3">
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                    English Description
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {selectedParam.description_en}
                  </p>
                </div>

                <div className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                    Russian Description
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {selectedParam.description_ru}
                  </p>
                </div>
              </div>

              {/* Lyria Prompt Tags & Semantic Keywords */}
              <div className="space-y-3 pt-1 border-t border-slate-800/80">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                    Lyria Prompt Tags (3 tags)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedParam.lyria_prompt_tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                    Semantic Keywords (3 RU + 4 EN)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedParam.semantic_keywords.map((kw, kIdx) => (
                      <span
                        key={kIdx}
                        className={`text-[11px] px-2 py-0.5 rounded font-mono border ${
                          kIdx < 3
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                        }`}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl w-full mx-auto mt-8 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 font-mono">
        <div>Total Corpus Synthesized in Session: {totalGeneratedCount}</div>
        <div>Protocol: FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1</div>
        <div>Matrix: 3x Expanded Morpho-Syntactic Atoms</div>
      </footer>
    </div>
  );
}