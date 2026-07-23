import type { Profile } from "@/types";

export type EditableProfile = Profile & {
  custom_patterns: unknown[];
  disabled_patterns: string[];
};

export const DEFAULT_PROFILE: EditableProfile = {
  version: "7.2",
  name: "default",
  params: {
    generations: 2,
    batch: 100,
    top: 3,
    max_depth: 7,
    max_elements: 12,
    use_irrational: true,
    use_imaginary: true,
    use_infinity: true,
    invert_probability: 0.4,
    psychology_probability: 0.6,
  },
  flags: {},
  metrics: {
    enabled: true,
    influencing: ["V", "S", "N", "D_f", "G_S"],
    observational: ["QEC", "CHSH", "C_val"],
  },
  custom_patterns: [],
  disabled_patterns: [],
};

export const METRIC_KEYS = ["V", "S", "N", "D_f", "G_S", "QEC", "CHSH", "C_val"] as const;

export const PATTERN_PRESETS = [
  "линейный",
  "гибридный",
  "каскад",
  "цикл",
  "спираль",
  "рекурсия",
  "фрактальный",
  "квантовый",
  "топологический",
  "симметричный",
  "иерархический",
  "диалектический",
];

export const FLAG_GROUPS: Array<{ name: string; flags: string[] }> = [
  { name: "Базовые", flags: ["enable_linguistics", "enable_morpheme_generation", "enable_linguistic_principles", "enable_quantum", "enable_fractal", "enable_psychology", "enable_metrics", "enable_auto_correction", "enable_learning", "enable_saving", "enable_cataloging"] },
  { name: "v7.0 домены", flags: ["enable_eqgft", "enable_ethical_archon", "enable_bell_nonlocality", "enable_context_weaver", "enable_garden_between", "enable_meta_fractal_craft", "enable_json_prompt", "enable_quantum_geometry", "enable_research", "enable_fair_division"] },
  { name: "Математика/Алгебра", flags: ["enable_category_theory", "enable_algebra", "enable_knot_theory", "enable_number_theory", "enable_measure_probability", "enable_graph_combinatorics", "enable_optimization"] },
  { name: "Физика", flags: ["enable_thermodynamics", "enable_stat_mechanics", "enable_relativity", "enable_string_theory", "enable_cosmology", "enable_qft", "enable_condensed_matter"] },
  { name: "Информатика", flags: ["enable_complexity", "enable_cryptography", "enable_automata", "enable_neural_nets", "enable_evolutionary", "enable_cybernetics"] },
  { name: "Лингвистика/Семиотика", flags: ["enable_semiotics", "enable_phonology_typology", "enable_writing_systems"] },
  { name: "Когнитивное", flags: ["enable_jungian", "enable_cognitive_bias", "enable_consciousness", "enable_mindfulness", "enable_neuroscience"] },
  { name: "Философия", flags: ["enable_philosophy", "enable_eastern_phil", "enable_hermeticism", "enable_process_phil"] },
  { name: "Эзотерика", flags: ["enable_alchemy", "enable_kabbalah", "enable_iching", "enable_tarot", "enable_sacred_geometry", "enable_vedic"] },
  { name: "Системы/Биология", flags: ["enable_systems_ecology", "enable_permaculture", "enable_biomimicry", "enable_chaos_dynamics", "enable_network_science"] },
  { name: "Искусство/Архитектура", flags: ["enable_music_art", "enable_architecture"] },
  { name: "Теория игр/Решений", flags: ["enable_game_theory", "enable_decision_theory"] },
  { name: "Передовые теории", flags: ["enable_holographic", "enable_morphic_resonance", "enable_orch_or", "enable_simulation_hyp", "enable_quantum_info", "enable_metaprinciples"] },
];

export function normalizeEditableProfile(
  source?: Partial<EditableProfile> | Record<string, unknown> | null,
): EditableProfile {
  const input = source && typeof source === "object" ? source as Record<string, unknown> : {};
  const params = input.params && typeof input.params === "object" ? input.params as Record<string, unknown> : {};
  const metrics = input.metrics && typeof input.metrics === "object" ? input.metrics as Record<string, unknown> : {};

  return {
    ...DEFAULT_PROFILE,
    version: typeof input.version === "string" ? input.version : DEFAULT_PROFILE.version,
    name: typeof input.name === "string" ? input.name : DEFAULT_PROFILE.name,
    params: {
      ...DEFAULT_PROFILE.params,
      ...(params as Partial<EditableProfile["params"]>),
    },
    flags: input.flags && typeof input.flags === "object"
      ? { ...(input.flags as Record<string, boolean>) }
      : {},
    metrics: {
      enabled: metrics.enabled !== false,
      influencing: Array.isArray(metrics.influencing) ? metrics.influencing.map(String) : [...DEFAULT_PROFILE.metrics.influencing],
      observational: Array.isArray(metrics.observational) ? metrics.observational.map(String) : [...DEFAULT_PROFILE.metrics.observational],
    },
    custom_patterns: Array.isArray(input.custom_patterns)
      ? input.custom_patterns
      : Array.isArray(input.customPatterns)
        ? input.customPatterns
        : [],
    disabled_patterns: Array.isArray(input.disabled_patterns)
      ? input.disabled_patterns.map(String)
      : Array.isArray(input.disabledPatterns)
        ? input.disabledPatterns.map(String)
        : [],
  };
}

export function withDefaultFlags(profile: EditableProfile, flags: string[]) {
  if (!flags.length || Object.keys(profile.flags).length > 0) {
    return profile;
  }
  const nextFlags: Record<string, boolean> = {};
  for (const flag of flags) nextFlags[flag] = true;
  return { ...profile, flags: nextFlags };
}

