export interface ParameterRecordBase {
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

export interface DomainArchetype {
  category: string;
  sub_categories: string[];
  quantity_kinds: string[];
  name_atoms: {
    prefixes: string[];
    cores: string[];
    quantities: string[];
  };
  sample_templates: ParameterRecordBase[];
}

export const DOMAINS: DomainArchetype[] = [
  {
    category: "Vocal Morphology",
    sub_categories: ["Guttural Resonator", "Pharyngeal Constriction", "Formant Dispersion", "Sub-Harmonic Generator"],
    quantity_kinds: ["ratio", "frequency", "depth", "formant_shift", "state"],
    name_atoms: {
      prefixes: ["vocal", "guttural", "subharmonic", "formant", "glottal", "pharyngeal"],
      cores: ["resonance", "fry_saturation", "cavity_volume", "constriction", "dispersion"],
      quantities: ["ratio", "hz", "depth", "decay_ms", "factor"]
    },
    sample_templates: [
      {
        technical_name: "vocal_subharmonic_generator_depth",
        name_ru: "Глубина субгармонического генератора вокала",
        description_en: "Controls the injection depth of sub-octave undertones in guttural vocal processing; lower values yield transparent vocal timbre, higher values induce heavy subterranean chest resonance.",
        description_ru: "Управляет глубиной внедрения субгармоник в гроул и гуттуральный вокал; низкие значения дают прозрачный естественный тембр, высокие значения создают массивный низкочастотный грудной резонанс.",
        category: "Vocal Morphology",
        sub_category: "Sub-Harmonic Generator",
        ui_element: "Range",
        min_value: 0.0,
        max_value: 1.0,
        step: 0.01,
        default: 0.45,
        unit: "normalized_ratio",
        quantity_kind: "depth",
        lyria_prompt_tags: ["subterranean chest vocal growl", "heavy subharmonic vocal resonance", "dark textured guttural undertone"],
        semantic_keywords: ["субгармоники", "гуттурал", "грудной резонанс", "subharmonics", "vocal fry", "chest resonance", "undertone depth"]
      },
      {
        technical_name: "vocal_pharyngeal_tract_mode",
        name_ru: "Режим фарингеального тракта вокала",
        description_en: "Selects physical throat cavity acoustic simulation; open_epiglottis gives breathable tone, constricted_arytenoid focuses dense harsh phonation, swallowed_larynx emphasizes cavernous resonance.",
        description_ru: "Выбирает режим симуляции глоточного резонатора; open_epiglottis дает открытый тембр, constricted_arytenoid концентрирует плотный экстремальный вокал, swallowed_larynx акцентирует пещерный резонанс.",
        category: "Vocal Morphology",
        sub_category: "Pharyngeal Constriction",
        ui_element: "Select",
        options: ["open_epiglottis", "constricted_arytenoid", "swallowed_larynx"],
        default: "constricted_arytenoid",
        unit: "mode",
        quantity_kind: "mode",
        lyria_prompt_tags: ["constricted harsh vocal tract", "cavernous throat resonance", "dense vocal phonation"],
        semantic_keywords: ["гортанный тракт", "фарингеальный резонанс", "экстремальный вокал", "vocal tract", "throat resonance", "constriction mode", "phonation modeling"]
      }
    ]
  },
  {
    category: "Spectral DSP",
    sub_categories: ["Spectral Smear", "Phase Demultiplexing", "Bin Masking", "Harmonic Comb"],
    quantity_kinds: ["frequency", "ratio", "decay_time", "coefficient", "bandwidth"],
    name_atoms: {
      prefixes: ["spectral", "fft", "bin", "phase", "harmonic"],
      cores: ["smear", "dispersion", "flux", "freeze", "centroid"],
      quantities: ["ratio", "hz", "ms", "db", "factor"]
    },
    sample_templates: [
      {
        technical_name: "spectral_freeze_smear_duration_ms",
        name_ru: "Длительность спектрального размытия заморозки",
        description_en: "Controls decay time of FFT bin energy retention; lower values yield fast transient recovery, higher values turn audio into infinite shimmering drone clouds.",
        description_ru: "Управляет временем затухания энергии в частотных ячейках FFT; низкие значения сохраняют быстрые транзиенты, высокие значения превращают звук в бесконечные мерцающие спектральные дроны.",
        category: "Spectral DSP",
        sub_category: "Spectral Smear",
        ui_element: "Range",
        min_value: 10.0,
        max_value: 5000.0,
        step: 10.0,
        default: 850.0,
        unit: "ms",
        quantity_kind: "duration",
        lyria_prompt_tags: ["infinite spectral drone pad", "shimmering fft smear texture", "glassy frequency freeze"],
        semantic_keywords: ["спектральное размытие", "заморозка частот", "дроун текстура", "spectral freeze", "fft smearing", "drone texture", "bin decay"]
      },
      {
        technical_name: "spectral_phase_cancellation_suppression_active",
        name_ru: "Подавление фазового взаимного гашения",
        description_en: "Toggles dynamic phase coherence realignment across Fourier frames; state 0 leaves raw phase interference intact, state 1 actively rotates opposing bins to preserve mono punch.",
        description_ru: "Переключает динамическое выравнивание фазовой когерентности в полосах Фурье; состояние 0 сохраняет естественную интерференцию, состояние 1 поворачивает фазы для моно-совместимости и плотности.",
        category: "Spectral DSP",
        sub_category: "Phase Demultiplexing",
        ui_element: "Toggle",
        min_value: 0,
        max_value: 1,
        step: 1,
        default: 1,
        unit: "boolean",
        quantity_kind: "boolean_state",
        lyria_prompt_tags: ["coherent phase punch", "aligned spectral transient", "mono solid low end"],
        semantic_keywords: ["фазовая когерентность", "подавление противофазы", "моно совместимость", "phase coherence", "phase cancellation", "fourier alignment", "anti phase suppression"]
      }
    ]
  },
  {
    category: "Synthesis Physics",
    sub_categories: ["Waveguide String", "Nonlinear Saturation", "Mechanical Impedance", "Torus Resonator"],
    quantity_kinds: ["impedance", "damping", "stiffness", "ratio", "resonance"],
    name_atoms: {
      prefixes: ["waveguide", "torus", "membrane", "bar", "string"],
      cores: ["stiffness", "damping", "coupling", "impedance", "reflection"],
      quantities: ["coefficient", "hz", "ratio", "db", "factor"]
    },
    sample_templates: [
      {
        technical_name: "waveguide_string_inharmonicity_stiffness",
        name_ru: "Коэффициент жесткости струнного волновода",
        description_en: "Adjusts dispersion stiffness in physical string modeling; lower values produce pure harmonic overtones, higher values produce metallic, bell-like inharmonic clangs.",
        description_ru: "Регулирует коэффициент жесткости в модели струнного волновода; низкие значения дают гармонический чистый тон, высокие значения формируют металлические колоколообразные обертоны.",
        category: "Synthesis Physics",
        sub_category: "Waveguide String",
        ui_element: "Range",
        min_value: 0.0,
        max_value: 1.0,
        step: 0.005,
        default: 0.12,
        unit: "normalized_ratio",
        quantity_kind: "ratio",
        lyria_prompt_tags: ["inharmonic metallic clang", "physical string dispersion", "acoustic bell harmonics"],
        semantic_keywords: ["негармоничность", "жесткость струны", "физическое моделирование", "inharmonicity", "waveguide stiffness", "physical modeling", "dispersion coefficient"]
      },
      {
        technical_name: "torus_resonator_modal_damping_array",
        name_ru: "Массив затухания мод тороидального резонатора",
        description_en: "Supplies decay attenuation ratios for the first four resonant modes of the acoustic torus; lower list values allow prolonged ring, higher list values choke corresponding modal harmonics.",
        description_ru: "Задает коэффициенты затухания для первых четырех резонансных мод тороидального акустического тела; низкие значения дают долгий сустейн, высокие резко приглушают гармоники.",
        category: "Synthesis Physics",
        sub_category: "Torus Resonator",
        ui_element: "Array",
        default: [0.15, 0.35, 0.65, 0.95],
        unit: "normalized_ratio_per_mode",
        quantity_kind: "damping",
        lyria_prompt_tags: ["resonant hollow cylinder ring", "modal body acoustic decay", "tuned acoustic torus"],
        semantic_keywords: ["затухание мод", "модальный резонатор", "тороид", "modal damping", "torus resonance", "acoustic decay", "harmonic ringing"]
      }
    ]
  },
  {
    category: "Spatial Binaural",
    sub_categories: ["HRTF Transaural", "Interaural Delay", "Interaural Intensity", "Ambisonic Decoupling"],
    quantity_kinds: ["azimuth", "elevation", "spatial_width", "delay", "gain"],
    name_atoms: {
      prefixes: ["binaural", "spatial", "hrtf", "transaural", "pinna"],
      cores: ["azimuth_spread", "pinna_notch", "crosstalk", "diffuseness", "distance"],
      quantities: ["deg", "ms", "ratio", "db", "factor"]
    },
    sample_templates: [
      {
        technical_name: "binaural_pinna_elevation_notch_freq_hz",
        name_ru: "Частота ушной спектральной вырезки высоты",
        description_en: "Adjusts the center frequency of the HRTF pinna spectral notch; lower frequencies place auditory perception below horizontal plane, higher frequencies psychoacoustically elevate source above listener.",
        description_ru: "Управляет центральной частотой анатомической ушной вырезки HRTF; низкие частоты сдвигают локализацию источника вниз, высокие частоты создают психоакустическое ощущение звука над головой.",
        category: "Spatial Binaural",
        sub_category: "HRTF Transaural",
        ui_element: "Range",
        min_value: 3000.0,
        max_value: 12000.0,
        step: 50.0,
        default: 7200.0,
        unit: "hz",
        quantity_kind: "frequency",
        lyria_prompt_tags: ["immersive height localization", "binaural overhead perspective", "3d spatial soundstage"],
        semantic_keywords: ["локализация по высоте", "бинауральный слух", "ушная вырезка", "pinna notch", "elevation localization", "binaural spatialization", "hrtf cue"]
      },
      {
        technical_name: "spatial_ambisonic_decode_target",
        name_ru: "Целевой формат амбисоник декодирования",
        description_en: "Selects spatial rendering matrix; binaural_kearns optimizes for headphones with head-shadow filtering, stereo_blumlein renders coincident pair speaker stereo, quad_cube projects surround field.",
        description_ru: "Выбирает матрицу пространственного рендеринга; binaural_kearns оптимизирует для наушников с тенью головы, stereo_blumlein формирует стереопару Блюмлейна, quad_cube строит четырехканальный куб.",
        category: "Spatial Binaural",
        sub_category: "Ambisonic Decoupling",
        ui_element: "Select",
        options: ["binaural_kearns", "stereo_blumlein", "quad_cube"],
        default: "binaural_kearns",
        unit: "mode",
        quantity_kind: "mode",
        lyria_prompt_tags: ["spherical ambisonic soundstage", "surround acoustic immersion", "3d binaural rendering"],
        semantic_keywords: ["амбисоника", "пространственный звук", "декодер стерео", "ambisonics", "spatial decode", "binaural matrix", "surround perspective"]
      }
    ]
  },
  {
    category: "Dynamics Envelope",
    sub_categories: ["Transient Splitter", "Downward Expander", "RMS Leveler", "Multiband Saturator"],
    quantity_kinds: ["gain", "threshold", "ratio", "duration", "coefficient"],
    name_atoms: {
      prefixes: ["transient", "dynamics", "envelope", "sidechain", "crest"],
      cores: ["attack_curvature", "expansion_ratio", "sustain_boost", "crest_factor", "knee"],
      quantities: ["db", "ratio", "ms", "factor", "percent"]
    },
    sample_templates: [
      {
        technical_name: "transient_attack_crest_boost_db",
        name_ru: "Усиление гребня атаки транзиента",
        description_en: "Adjusts decibel amplification applied to isolated attack spikes; lower values soften aggressive percussive hits, higher values punch transient snap through dense walls of sound.",
        description_ru: "Регулирует децибельное усиление изолированных пиков атаки; низкие значения смягчают резкие транзиенты, высокие значения пробивают ударный щелчок сквозь плотный микс.",
        category: "Dynamics Envelope",
        sub_category: "Transient Splitter",
        ui_element: "Range",
        min_value: -12.0,
        max_value: 18.0,
        step: 0.2,
        default: 4.5,
        unit: "db",
        quantity_kind: "gain",
        lyria_prompt_tags: ["snappy transient punch", "hyper dynamic drum impact", "crisp percussive bite"],
        semantic_keywords: ["гребень атаки", "транзиентный шейпер", "ударный щелчок", "transient attack", "crest factor", "dynamic snap", "punch boost"]
      },
      {
        technical_name: "dynamics_auto_makeup_gain_active",
        name_ru: "Активность автоматической компенсации громкости",
        description_en: "Toggles dynamic RMS-based makeup compensation post gain-reduction; state 0 leaves raw compressed level down, state 1 automatically restores perceived loudness to pre-compressed energy.",
        description_ru: "Переключает автоматическую компенсацию уровня по среднеквадратичной мощности после компрессии; состояние 0 сохраняет ослабленный сигнал, состояние 1 восстанавливает громкость.",
        category: "Dynamics Envelope",
        sub_category: "RMS Leveler",
        ui_element: "Toggle",
        min_value: 0,
        max_value: 1,
        step: 1,
        default: 1,
        unit: "boolean",
        quantity_kind: "boolean_state",
        lyria_prompt_tags: ["constant loudness dynamic glue", "transparent rms leveler", "balanced output gain"],
        semantic_keywords: ["авто компенсация", "громкость RMS", "компрессор левелер", "auto makeup", "rms leveling", "loudness compensation", "gain match"]
      }
    ]
  },
  {
    category: "Temporal Rhythm",
    sub_categories: ["Polyrhythm Engine", "Microtiming Jitter", "Euclidean Gate", "Metric Modulation"],
    quantity_kinds: ["duration", "ratio", "probability", "bpm", "offset"],
    name_atoms: {
      prefixes: ["tempo", "rhythm", "euclidean", "groove", "polymetric"],
      cores: ["jitter_window", "swing_ratio", "pulse_density", "metric_shift", "syncopation"],
      quantities: ["ms", "ratio", "steps", "percent", "factor"]
    },
    sample_templates: [
      {
        technical_name: "rhythm_microtiming_human_jitter_ms",
        name_ru: "Микротайминг вариации сетки ритма",
        description_en: "Controls Gaussian time deviation applied to quantized note starts; lower values ensure mechanical grid precision, higher values inject organic loose human performance drift.",
        description_ru: "Управляет гауссовым отклонением времени начала квантованных нот; низкие значения гарантируют механическую точность сетки, высокие значения вносят живой человеческий свинг.",
        category: "Temporal Rhythm",
        sub_category: "Microtiming Jitter",
        ui_element: "Range",
        min_value: 0.0,
        max_value: 40.0,
        step: 0.5,
        default: 6.5,
        unit: "ms",
        quantity_kind: "duration",
        lyria_prompt_tags: ["humanized groove timing", "loose organic drum swing", "natural percussive microtiming"],
        semantic_keywords: ["микротайминг", "гуманизация ритма", "отклонение сетки", "microtiming", "humanize jitter", "groove drift", "percussive swing"]
      },
      {
        technical_name: "euclidean_rhythm_pulse_density_steps",
        name_ru: "Количество импульсов евклидова ритма",
        description_en: "Specifies active distributed triggers within a fixed 16-step cycle; lower values produce sparse syncopated downbeat accents, higher values generate rapid driving polyrhythmic grooves.",
        description_ru: "Определяет число активных распределенных триггеров в 16-шаговом цикле; низкие значения создают редкие синкопированные акценты, высокие значения формируют плотный полиритмический грув.",
        category: "Temporal Rhythm",
        sub_category: "Euclidean Gate",
        ui_element: "Range",
        min_value: 1,
        max_value: 16,
        step: 1,
        default: 7,
        unit: "steps",
        quantity_kind: "density",
        lyria_prompt_tags: ["polyrhythmic euclidean pattern", "complex tribal drum pulse", "syncopated geometric groove"],
        semantic_keywords: ["евклидов ритм", "число импульсов", "полиритмия", "euclidean rhythm", "pulse density", "polyrhythm", "geometric step"]
      }
    ]
  },
  {
    category: "Generative Chaos",
    sub_categories: ["L-System Grammar", "Lorenz Attractor", "Cellular Automata", "Perlin Vector Field"],
    quantity_kinds: ["chaos_entropy", "recursion_depth", "probability", "rate", "state"],
    name_atoms: {
      prefixes: ["generative", "lsystem", "lorenz", "automata", "chaotic"],
      cores: ["recursion_depth", "attractor_divergence", "entropy_seed", "rule_weight", "mutation"],
      quantities: ["depth", "ratio", "rate_hz", "factor", "limit"]
    },
    sample_templates: [
      {
        technical_name: "generative_lsystem_recursion_depth_limit",
        name_ru: "Предел глубины рекурсии lsystem",
        description_en: "Limits recursive grammar substitution iterations for generative melodic branches; lower values keep motifs short and predictable, higher values blossom into dense self-similar fractal passages.",
        description_ru: "Ограничивает число шагов рекурсивной подстановки в грамматике мелодических ветвей; низкие значения сохраняют мотивы предсказуемыми, высокие разворачивают плотные фрактальные пассажи.",
        category: "Generative Chaos",
        sub_category: "L-System Grammar",
        ui_element: "Range",
        min_value: 1,
        max_value: 8,
        step: 1,
        default: 4,
        unit: "depth",
        quantity_kind: "recursion_depth",
        lyria_prompt_tags: ["recursive fractal melody", "self-similar algorithmic branching", "generative lsystem composition"],
        semantic_keywords: ["глубина рекурсии", "lsystem грамматика", "фрактальная мелодия", "recursion depth", "lsystem branching", "generative grammar", "fractal motif"]
      },
      {
        technical_name: "generative_lsystem_axiom_seed_expression",
        name_ru: "Аксиома начального состояния lsystem",
        description_en: "Defines the root seed string interpreted by the grammar compiler; sets initial harmonic letters that determine branching root topology across entire movements.",
        description_ru: "Задает начальную строку-аксиому для компилятора грамматики; определяет базовые гармонические символы, формирующие топологию ветвления во всей композиции.",
        category: "Generative Chaos",
        sub_category: "L-System Grammar",
        ui_element: "String",
        default: "omega_root_alpha",
        unit: "expression",
        quantity_kind: "identifier",
        lyria_prompt_tags: ["symbolic generative seed", "algorithmic root topology", "complex structural evolution"],
        semantic_keywords: ["аксиома семени", "строка lsystem", "генеративное зерно", "axiom expression", "seed string", "generative topology", "grammar root"]
      }
    ]
  },
  {
    category: "Compositional Vector",
    sub_categories: ["Tonal Gravity", "Voice Leading Lattice", "Microtonal Temperament", "Harmonic Tension"],
    quantity_kinds: ["pitch_bend", "ratio", "frequency", "interval", "mode"],
    name_atoms: {
      prefixes: ["harmonic", "vector", "voice_leading", "microtonal", "tonal"],
      cores: ["gravitational_pull", "root_attractor", "edo_divisions", "tension_slope", "drift"],
      quantities: ["semitones", "ratio", "cents", "factor", "steps"]
    },
    sample_templates: [
      {
        technical_name: "microtonal_edo_scale_divisions_count",
        name_ru: "Количество равных делений октавы edo",
        description_en: "Specifies equal temperament scale divisions per octave; 12 represents standard western tuning, 22 unlocks sruti microtonality, 31 provides pristine extended quarter-comma meantone consonances.",
        description_ru: "Задает количество равных интервальных делений октавы; 12 соответствует стандартному строю, 22 раскрывает шрути-микротональность, 31 дает чистейшие расширенные среднетоновые созвучия.",
        category: "Compositional Vector",
        sub_category: "Microtonal Temperament",
        ui_element: "Select",
        options: ["12_edo", "19_edo", "22_edo", "31_edo", "53_edo"],
        default: "22_edo",
        unit: "mode",
        quantity_kind: "mode",
        lyria_prompt_tags: ["microtonal sruti harmonies", "exotic xenharmonic scale", "pure temperament resonance"],
        semantic_keywords: ["микротональность", "деления октавы", "строй edo", "microtonality", "equal temperament", "xenharmonic", "quarter tone"]
      },
      {
        technical_name: "harmonic_tension_dissonance_slope_ratio",
        name_ru: "Коэффициент наклона гармонической напряженности",
        description_en: "Modulates tension weighting applied across chord progression transitions; lower values enforce gentle diatonic cadence resolution, higher values drive chord transitions toward dissonant cluster friction.",
        description_ru: "Модулирует наклон гармонического натяжения при смене аккордовых переходов; низкие значения сохраняют мягкое диатоническое разрешение, высокие направляют гармонию к диссонансным кластерам.",
        category: "Compositional Vector",
        sub_category: "Harmonic Tension",
        ui_element: "Range",
        min_value: 0.0,
        max_value: 2.0,
        step: 0.02,
        default: 1.15,
        unit: "normalized_ratio",
        quantity_kind: "ratio",
        lyria_prompt_tags: ["dissonant harmonic tension", "intense chord cluster climax", "suspenseful harmonic release"],
        semantic_keywords: ["гармоническое напряжение", "диссонансный кластер", "аккордовая прогрессия", "harmonic tension", "dissonance slope", "chord friction", "cadence resolution"]
      }
    ]
  },
  {
    category: "Modulation Performance",
    sub_categories: ["Complex LFO", "Pressure Expression", "Cross-Domain Matrix", "Envelope Follower"],
    quantity_kinds: ["rate", "depth", "phase", "ratio", "sensitivity"],
    name_atoms: {
      prefixes: ["modulation", "lfo", "expression", "follower", "matrix"],
      cores: ["shape_skew", "cross_depth", "pressure_smoothing", "hysteresis", "rate"],
      quantities: ["hz", "ratio", "ms", "percent", "factor"]
    },
    sample_templates: [
      {
        technical_name: "modulation_lfo_symmetry_skew_ratio",
        name_ru: "Коэффициент перекоса симметрии lfo",
        description_en: "Controls wave asymmetry of the primary modulation oscillator; 0.5 delivers symmetric triangle or sine, lower values create sharp attack ramps, higher values create snappy sawtooth decays.",
        description_ru: "Управляет асимметрией формы волны главного модулятора lfo; 0.5 дает симметричный треугольник, низкие значения формируют резкий нарастающий фронт, высокие — крутой срез спада.",
        category: "Modulation Performance",
        sub_category: "Complex LFO",
        ui_element: "Range",
        min_value: 0.01,
        max_value: 0.99,
        step: 0.01,
        default: 0.5,
        unit: "normalized_ratio",
        quantity_kind: "ratio",
        lyria_prompt_tags: ["asymmetrical lfo pulse", "dynamic modulation sweep", "expressive rhythmic wobble"],
        semantic_keywords: ["симметрия модулятора", "перекос lfo", "форма волны", "lfo symmetry", "skew ratio", "modulation waveform", "wave shaping"]
      },
      {
        technical_name: "modulation_cross_matrix_routing_label",
        name_ru: "Метка маршрутизации кросс матричной модуляции",
        description_en: "Specifies target routing bus connection for primary macro gesture; routes expressive controller delta to simultaneous filter and pitch micro-fluctuations.",
        description_ru: "Задает идентификатор шины назначения для главного макро-жеста; направляет дельту контроллера одновременно на микрофлуктуации фильтра и высоты тона.",
        category: "Modulation Performance",
        sub_category: "Cross-Domain Matrix",
        ui_element: "Text",
        default: "vocal_resonance_cutoff_and_pitch_flutter",
        unit: "text",
        quantity_kind: "expression",
        lyria_prompt_tags: ["complex macro matrix routing", "expressive multi-target modulation", "interconnected parameter gesture"],
        semantic_keywords: ["маршрутизация матрицы", "кросс модуляция", "макро шина", "matrix routing", "cross modulation", "bus assignment", "macro gesture"]
      }
    ]
  },
  {
    category: "Cross-Domain Controls",
    sub_categories: ["Spectral To Spatial Coupling", "Rhythm To Formant Morpher", "Chaos To Density Binder", "Acoustic Flux Integrator"],
    quantity_kinds: ["coupling_factor", "ratio", "threshold", "depth", "frequency"],
    name_atoms: {
      prefixes: ["cross_domain", "coupling", "flux", "binder", "spectral_spatial"],
      cores: ["transfer_slope", "inertia", "divergence_link", "damping_spread", "resonance_bleed"],
      quantities: ["factor", "ratio", "db", "ms", "coefficient"]
    },
    sample_templates: [
      {
        technical_name: "cross_domain_spectral_spatial_coupling_factor",
        name_ru: "Коэффициент связки спектра и пространственной ширины",
        description_en: "Determines how strongly high-frequency spectral flux expands binaural stereo width; lower values keep stereo staging static, higher values cause bright transients to violently fling wide into outer ears.",
        description_ru: "Определяет степень расширения бинауральной стереосцены под воздействием высокочастотного спектрального потока; низкие значения фиксируют стереополе, высокие разбрасывают яркие транзиенты вширь.",
        category: "Cross-Domain Controls",
        sub_category: "Spectral To Spatial Coupling",
        ui_element: "Range",
        min_value: 0.0,
        max_value: 2.0,
        step: 0.02,
        default: 0.85,
        unit: "normalized_ratio",
        quantity_kind: "coupling_factor",
        lyria_prompt_tags: ["dynamic spectral stereo expansion", "hyper-wide binaural transient flare", "interlinked soundstage motion"],
        semantic_keywords: ["спектрально пространственная связка", "расширение стерео", "бинауральная ширина", "spectral spatial coupling", "stereo expansion", "binaural flare", "transient spread"]
      },
      {
        technical_name: "cross_domain_temporal_entropy_link_active",
        name_ru: "Активность связи ритмической энтропии с хаосом",
        description_en: "Toggles bilateral coupling between polyrhythmic groove offsets and nonlinear chaotic attractor divergence; state 0 keeps rhythm separate from chaos, state 1 syncs timing jitters to attractor phase.",
        description_ru: "Переключает двухстороннюю связь между смещениями ритма и аттрактором хаоса; состояние 0 разделяет ритм и хаос, состояние 1 синхронизирует тайминг с фазой аттрактора.",
        category: "Cross-Domain Controls",
        sub_category: "Chaos To Density Binder",
        ui_element: "Toggle",
        min_value: 0,
        max_value: 1,
        step: 1,
        default: 1,
        unit: "boolean",
        quantity_kind: "boolean_state",
        lyria_prompt_tags: ["chaotic synchronized groove drift", "attractor linked rhythmic stutter", "organic mathematical polyrhythm"],
        semantic_keywords: ["энтропия ритма", "связь с хаосом", "аттрактор полиритмии", "temporal entropy", "chaos rhythm link", "attractor coupling", "groove jitter"]
      }
    ]
  }
];

