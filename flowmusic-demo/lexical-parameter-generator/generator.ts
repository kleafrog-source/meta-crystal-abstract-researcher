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

// Deterministic seedable RNG (mulberry32) for reproducible or chaotic procedural generation
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

interface DomainBlueprint {
  category: string;
  sub_categories: Array<{
    name: string;
    allowed_elements: Array<"Range" | "Select" | "Toggle" | "Text" | "String" | "Array">;
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
        allowed_elements: ["Range", "Select", "Toggle"],
        prefixes: [
          { en: "vocal_guttural", ru: "гуттурального вокала" },
          { en: "subglottal_throat", ru: "подскладочного тракта" },
          { en: "false_chord", ru: "ложных голосовых связок" }
        ],
        cores: [
          { en: "cavity_resonance", ru: "резонанс полости", action_en: "throat acoustic mass", action_ru: "акустическую массу гортани", kind: "resonance" },
          { en: "subharmonic_injection", ru: "внедрение субгармоник", action_en: "sub-octave density", action_ru: "плотность суб-октавных обертонов", kind: "depth" },
          { en: "pharyngeal_overdrive", ru: "перегруз фаринкса", action_en: "growl spectral grit", action_ru: "спектральную зернистость гроула", kind: "saturation" }
        ],
        quantities: [
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 1.0, step: 0.01, defaultGen: (r) => +(0.2 + r() * 0.6).toFixed(2) }
          },
          {
            en: "mode", ru: "режим", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["subharmonic_growl", "false_chord_slam", "visceral_drain"], defaultVal: "false_chord_slam" }
          },
          {
            en: "active", ru: "активность", element: "Toggle", unit: "boolean", kind: "boolean_state",
            toggleSpec: { defaultVal: 1 }
          }
        ],
        tags: ["subterranean chest vocal growl", "heavy guttural vocal resonance", "dark textured extreme undertone", "deep subharmonic vocal mass", "cavernous false chord growl"],
        keywords_ru: ["субгармоники", "гуттурал", "ложные связки", "фаринкс", "гроул", "гортанный резонанс", "экстремальный вокал"],
        keywords_en: ["subharmonics", "guttural growl", "false vocal chords", "pharyngeal acoustic", "throat resonance", "undertone depth", "vocal grit"]
      },
      {
        name: "Formant Dispersion",
        allowed_elements: ["Range", "Select", "Array"],
        prefixes: [
          { en: "vocal_formant", ru: "формант вокала" },
          { en: "spectral_vowel", ru: "гласных фонем" },
          { en: "larynx_acoustic", ru: "акустики гортани" }
        ],
        cores: [
          { en: "dispersion_shift", ru: "сдвиг дисперсии", action_en: "perceived vocal tract geometry", action_ru: "геометрию вокального тракта", kind: "formant_shift" },
          { en: "cluster_attenuation", ru: "подавление кластера", action_en: "high vowel formant brilliance", action_ru: "яркость верхних формант", kind: "attenuation" }
        ],
        quantities: [
          {
            en: "semitones", ru: "полутонов", element: "Range", unit: "semitones", kind: "pitch_bend",
            rangeSpec: { min: -12.0, max: 12.0, step: 0.25, defaultGen: (r) => +(-3.0 - r() * 4.0).toFixed(2) }
          },
          {
            en: "profile", ru: "профиль", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["cavernous_elongation", "hyper_compressed_vowel", "nasal_metallic_chasm"], defaultVal: "cavernous_elongation" }
          },
          {
            en: "array", ru: "массив", element: "Array", unit: "hz_per_formant", kind: "frequency",
            arraySpec: { defaultVal: [450, 920, 2400, 3600], unit: "hz_per_formant" }
          }
        ],
        tags: ["formant shifted vocal tract", "cavernous larynx resonance", "visceral extreme vocal tone", "deep throat phonation", "metallic vocal dispersion"],
        keywords_ru: ["формантный сдвиг", "акустика гортани", "гласные фонемы", "тракт вокала", "дисперсия звука", "спектральный формант", "тембр голоса"],
        keywords_en: ["formant shift", "vocal tract", "larynx acoustic", "vowel dispersion", "phonation modeling", "spectral throat", "formant cluster"]
      }
    ]
  },
  // 2. Synthesis physics
  {
    category: "Synthesis Physics",
    sub_categories: [
      {
        name: "Waveguide String",
        allowed_elements: ["Range", "Toggle", "Array"],
        prefixes: [
          { en: "waveguide_string", ru: "волноводной струны" },
          { en: "physical_bore", ru: "акустического волновода" },
          { en: "coupled_beam", ru: "связанной балки" }
        ],
        cores: [
          { en: "inharmonicity_dispersion", ru: "дисперсионная негармоничность", action_en: "string structural stiffness", action_ru: "структурную жесткость струны", kind: "dispersion" },
          { en: "nonlinear_terminator_loss", ru: "нелинейные потери окончания", action_en: "bridge termination friction", action_ru: "трение на порожке волновода", kind: "friction" },
          { en: "mechanical_impedance", ru: "механический импеданс", action_en: "reflection energy retention", action_ru: "сохранение энергии отражения", kind: "impedance" }
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
          }
        ],
        tags: ["physical waveguide string resonance", "inharmonic metallic ring", "acoustic dispersion transient", "plucked mechanical boundary", "resonant bore reflection"],
        keywords_ru: ["волноводная струна", "негармоничность", "механический импеданс", "физическое моделирование", "порожек струны", "акустический резонанс", "затухание волны"],
        keywords_en: ["waveguide string", "inharmonicity stiffness", "physical modeling", "mechanical impedance", "dispersion coefficient", "acoustic boundary", "modal reflection"]
      }
    ]
  },
  // 3. Spectral DSP
  {
    category: "Spectral DSP",
    sub_categories: [
      {
        name: "Spectral Smear",
        allowed_elements: ["Range", "Toggle", "Select"],
        prefixes: [
          { en: "spectral_fft", ru: "быстрого преобразования фурье" },
          { en: "spectral_bin", ru: "частотных ячеек спектра" },
          { en: "spectral_phase", ru: "спектральной фазы" }
        ],
        cores: [
          { en: "freeze_decay", ru: "затухание заморозки", action_en: "energy hold time across bins", action_ru: "время удержания энергии в ячейках", kind: "duration" },
          { en: "flux_threshold", ru: "порог спектрального потока", action_en: "transient isolation boundary", action_ru: "границу изоляции транзиентов", kind: "threshold" },
          { en: "morphology_smear", ru: "морфологическое размытие", action_en: "inter-bin diffusion blur", action_ru: "диффузионное размытие между бинами", kind: "diffusion" }
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
            selectSpec: { options: ["gaussian_spread", "exponential_decay", "caustic_prism"], defaultVal: "gaussian_spread" }
          }
        ],
        tags: ["shimmering spectral smear pad", "infinite fft freeze drone", "complex frequency diffusion", "glassy overtone smear", "transient blur pad"],
        keywords_ru: ["спектральное размытие", "заморозка fft", "частотные ячейки", "спектральный поток", "размытие фаз", "диффузия частот", "дроун текстура"],
        keywords_en: ["spectral smear", "fft freeze", "spectral flux", "bin diffusion", "phase smearing", "frequency blur", "spectral pad"]
      }
    ]
  },
  // 4. Spatial binaural
  {
    category: "Spatial Binaural",
    sub_categories: [
      {
        name: "HRTF Transaural",
        allowed_elements: ["Range", "Select", "Array"],
        prefixes: [
          { en: "binaural_pinna", ru: "ушной раковины hrtf" },
          { en: "spatial_interaural", ru: "межслуховой акустики" },
          { en: "head_shadow", ru: "теневого эффекта головы" }
        ],
        cores: [
          { en: "elevation_notch", ru: "спектральная вырезка высоты", action_en: "psychoacoustic vertical positioning", action_ru: "вертикальное позиционирование звука", kind: "frequency" },
          { en: "time_difference", ru: "временная разность прибытия", action_en: "lateral azimuth localization", action_ru: "азимутальную локализацию источника", kind: "delay" },
          { en: "crosstalk_cancellation", ru: "подавление взаимопроникновения", action_en: "transaural speaker field width", action_ru: "ширину трансаурального стереополя", kind: "crosstalk" }
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
            selectSpec: { options: ["diffuse_field_kemar", "individual_ear_mesh", "transaural_dipole"], defaultVal: "diffuse_field_kemar" }
          }
        ],
        tags: ["3d binaural spatialization", "pinna spectral notch depth", "hyper realistic head shadow", "accurate azimuth localization", "immersive binaural soundstage"],
        keywords_ru: ["бинауральный звук", "локализация по высоте", "вырезка ушной раковины", "тень головы", "межслуховая разность", "пространственная глубина", "стереосцена"],
        keywords_en: ["binaural hrtf", "pinna notch", "elevation cue", "head shadow", "interaural delay", "spatial immersion", "azimuth localization"]
      }
    ]
  },
  // 5. Dynamics envelope
  {
    category: "Dynamics Envelope",
    sub_categories: [
      {
        name: "Transient Splitter",
        allowed_elements: ["Range", "Toggle", "Select"],
        prefixes: [
          { en: "transient_envelope", ru: "транзиентного огибающего" },
          { en: "dynamics_crest", ru: "пик-фактора динамики" },
          { en: "impact_chisel", ru: "ударного клипера" }
        ],
        cores: [
          { en: "attack_crest", ru: "гребень атаки", action_en: "initial percussive punch prominence", action_ru: "яркость начального перкуссионного щелчка", kind: "gain" },
          { en: "sustain_clamping", ru: "удержание сустейна", action_en: "body resonance level post-hit", action_ru: "уровень сустейна после удара", kind: "compression" },
          { en: "recovery_hysteresis", ru: "гистерезис восстановления", action_en: "release curve memory smoothing", action_ru: "сглаживание кривой отпускания", kind: "damping" }
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
          }
        ],
        tags: ["hyper dynamic transient punch", "crisp percussive attack snap", "tight drum body control", "aggressive impact crest boost", "punchy dynamic transient"],
        keywords_ru: ["гребень атаки", "транзиентный сплиттер", "ударный щелчок", "пик фактор", "сустейн компрессия", "динамический напор", "транзиент шейпер"],
        keywords_en: ["transient attack", "crest factor", "dynamic snap", "punch boost", "sustain clamping", "transient shaping", "percussive impact"]
      }
    ]
  },
  // 6. Temporal rhythm
  {
    category: "Temporal Rhythm",
    sub_categories: [
      {
        name: "Microtiming Jitter",
        allowed_elements: ["Range", "Select", "Array"],
        prefixes: [
          { en: "rhythm_microtiming", ru: "микротайминга ритма" },
          { en: "polymetric_drift", ru: "полиметрического дрейфа" },
          { en: "groove_jitter", ru: "флуктуаций грува" }
        ],
        cores: [
          { en: "gaussian_deviation", ru: "гауссово отклонение", action_en: "human feel timing dispersion", action_ru: "живое рассеивание времени ударов", kind: "duration" },
          { en: "syncopation_bias", ru: "смещение синкоп", action_en: "offbeat gravity pull", action_ru: "тяготение слабых долей", kind: "bias" },
          { en: "swing_curvature", ru: "кривизна свинга", action_en: "subdivision compression ratio", action_ru: "компрессию шестнадцатых долей", kind: "ratio" }
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
          }
        ],
        tags: ["organic humanized drum groove", "loose swing microtiming drift", "syncopated offbeat timing", "relaxed rhythmic pocket", "polyrhythmic micro jitter"],
        keywords_ru: ["микротайминг", "гуманизация грува", "отклонение сетки", "синкопированный свинг", "дрейф долей", "ритмический карман", "полиритмический сдвиг"],
        keywords_en: ["microtiming jitter", "humanized groove", "swing curvature", "timing deviation", "offbeat syncopation", "polymetric drift", "rhythmic pocket"]
      }
    ]
  },
  // 7. Generative chaos
  {
    category: "Generative Chaos",
    sub_categories: [
      {
        name: "L-System Grammar",
        allowed_elements: ["Range", "String", "Text"],
        prefixes: [
          { en: "generative_lsystem", ru: "lsystem грамматики" },
          { en: "fractal_branching", ru: "фрактального ветвления" },
          { en: "cellular_automata", ru: "клеточного автомата" }
        ],
        cores: [
          { en: "recursion_depth", ru: "глубина рекурсии", action_en: "structural hierarchical complexity", action_ru: "иерархическую сложность структуры", kind: "recursion_depth" },
          { en: "axiom_expression", ru: "выражение аксиомы", action_en: "root seed symbolic structure", action_ru: "символьную структуру начального семени", kind: "identifier" },
          { en: "divergence_rate", ru: "скорость дивергенции", action_en: "chaotic attractor deviation speed", action_ru: "скорость отклонения аттрактора хаоса", kind: "entropy" }
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
          }
        ],
        tags: ["recursive fractal melody motif", "generative lsystem composition", "chaotic branching pitch lattice", "self similar algorithmic evolution", "fractal structural hierarchy"],
        keywords_ru: ["глубина рекурсии", "lsystem грамматика", "фрактальная композиция", "алгоритмическое ветвление", "аксиома семени", "аттрактор хаоса", "генеративный мотив"],
        keywords_en: ["recursion depth", "lsystem grammar", "fractal branching", "generative composition", "seed axiom", "chaotic attractor", "algorithmic music"]
      }
    ]
  },
  // 8. Compositional vector
  {
    category: "Compositional Vector",
    sub_categories: [
      {
        name: "Microtonal Temperament",
        allowed_elements: ["Select", "Range", "Array"],
        prefixes: [
          { en: "microtonal_edo", ru: "микрохроматики edo" },
          { en: "harmonic_lattice", ru: "гармонической решетки" },
          { en: "tonal_attractor", ru: "тонального аттрактора" }
        ],
        cores: [
          { en: "scale_divisions", ru: "деления шкалы", action_en: "octave interval density", action_ru: "плотность делений октавы", kind: "mode" },
          { en: "gravitational_pull", ru: "гравитационное тяготение", action_en: "consonance resolution urgency", action_ru: "стремление к консонантному разрешению", kind: "ratio" },
          { en: "sruti_cents_offset", ru: "центовое смещение шрути", action_en: "pure third interval purity", action_ru: "чистоту звучания терцовых интервалов", kind: "cents" }
        ],
        quantities: [
          {
            en: "count", ru: "количество", element: "Select", unit: "mode", kind: "mode",
            selectSpec: { options: ["12_edo", "19_edo", "22_edo_sruti", "31_edo_fokker", "53_edo_mercat"], defaultVal: "22_edo_sruti" }
          },
          {
            en: "ratio", ru: "коэффициент", element: "Range", unit: "normalized_ratio", kind: "ratio",
            rangeSpec: { min: 0.0, max: 2.0, step: 0.01, defaultGen: (r) => +(0.7 + r() * 0.8).toFixed(2) }
          },
          {
            en: "cents", ru: "центы", element: "Array", unit: "cents_deviation_per_degree", kind: "cents",
            arraySpec: { defaultVal: [0, 112, 204, 316, 498, 702], unit: "cents_deviation_per_degree" }
          }
        ],
        tags: ["microtonal sruti harmonies", "exotic xenharmonic scale tuning", "pure meantone chord consonance", "non western interval lattice", "subtle microtonal inflection"],
        keywords_ru: ["микротональность", "деления октавы", "строй edo", "гармоническая решетка", "индийские шрути", "чистая интонация", "диссонансный наклон"],
        keywords_en: ["microtonal edo", "xenharmonic tuning", "sruti temperament", "harmonic lattice", "just intonation", "octave division", "scale consonance"]
      }
    ]
  },
  // 9. Modulation performance
  {
    category: "Modulation Performance",
    sub_categories: [
      {
        name: "Complex LFO",
        allowed_elements: ["Range", "Select", "Toggle"],
        prefixes: [
          { en: "modulation_lfo", ru: "модулирующего генератора lfo" },
          { en: "cross_matrix", ru: "кросс матрицы модуляции" },
          { en: "expressive_macro", ru: "экспрессивного макроса" }
        ],
        cores: [
          { en: "symmetry_skew", ru: "перекос симметрии", action_en: "oscillator wave shape slope", action_ru: "наклон фронта формы волны", kind: "ratio" },
          { en: "hysteresis_damping", ru: "демпфирование гистерезиса", action_en: "inertial response lag", action_ru: "инерционную задержку отклика", kind: "damping" },
          { en: "frequency_fm_bleed", ru: "проникновение fm модуляции", action_en: "sideband generation intensity", action_ru: "интенсивность генерации боковых полос", kind: "frequency" }
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
          }
        ],
        tags: ["asymmetrical lfo pulse sweep", "dynamic matrix modulation gesture", "expressive parameter wobble", "nonlinear modulation curve", "rhythmic control voltage drift"],
        keywords_ru: ["симметрия lfo", "форма волны", "кросс модуляция", "наклон фронта", "макро контроллер", "модуляционная матрица", "гистерезис сигнала"],
        keywords_en: ["lfo symmetry", "wave skew", "cross modulation", "macro gesture", "hysteresis lag", "modulation matrix", "parameter sweep"]
      }
    ]
  },
  // 10. Cross-Domain controls
  {
    category: "Cross-Domain Controls",
    sub_categories: [
      {
        name: "Spectral To Spatial Coupling",
        allowed_elements: ["Range", "Toggle", "Text"],
        prefixes: [
          { en: "cross_domain_spectral_spatial", ru: "спектрально пространственной связи" },
          { en: "cross_domain_rhythm_chaos", ru: "связи ритма и хаоса" },
          { en: "cross_domain_vocal_physics", ru: "связи вокала и физики струн" }
        ],
        cores: [
          { en: "coupling_factor", ru: "фактор сцепления", action_en: "inter-domain modulation depth", action_ru: "глубину междисциплинарной модуляции", kind: "coupling_factor" },
          { en: "flux_inertia", ru: "инерция потока", action_en: "response decay lag between systems", action_ru: "задержку отклика между подсистемами", kind: "inertia" },
          { en: "link_state", ru: "состояние связи", action_en: "bilateral feedback routing", action_ru: "двусторонний маршрут обратной связи", kind: "state" }
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
          }
        ],
        tags: ["dynamic cross domain coupling", "spectral stereo width flare", "chaotic rhythm interlock motion", "complex multi domain gesture", "organic interlinked sonic topology"],
        keywords_ru: ["междоменная связь", "спектрально пространственный фактор", "связь ритма и хаоса", "обратная связь систем", "стерео расширение", "модуляция топологии", "мультидоменная физика"],
        keywords_en: ["cross domain coupling", "spectral spatial link", "chaos rhythm coupling", "interconnected parameter", "stereo flare", "multi domain dsp", "topology gesture"]
      }
    ]
  }
];

export function generateProceduralBatch(batchIndex: number, userSeed?: number): GeneratedBatch {
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

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

