export const PUBLISHED_PARAMETER_FIELDS = [
  "technical_name", "name_ru", "description_en", "description_ru", "category", "sub_category",
  "ui_element", "min_value", "max_value", "step", "default", "unit", "quantity_kind",
  "options", "lyria_prompt_tags", "semantic_keywords", "domain", "domain_layer",
] as const;

export const DOMAIN_LAYERS = [
  "VOCAL_MORPHOLOGY_LAYER", "SYNTHESIS_PHYSICS_LAYER", "SPECTRAL_DSP_LAYER",
  "SPATIAL_BINAURAL_LAYER", "DYNAMICS_ENVELOPE_LAYER", "TEMPORAL_RHYTHM_LAYER",
  "GENERATIVE_CHAOS_LAYER", "COMPOSITIONAL_VECTOR_LAYER", "MODULATION_PERFORMANCE_LAYER",
] as const;

export const PUBLISHED_PARAMETER_TYPES = ["Range", "Select", "Toggle", "Text", "Array", "String"] as const;
const PUBLISHED_FIELDS = new Set<string>(PUBLISHED_PARAMETER_FIELDS);

export type PublishedParameterType = (typeof PUBLISHED_PARAMETER_TYPES)[number];
export type PublishedParameter = Record<string, unknown> & { technical_name: string; ui_element: string };

export function cleanPublishedParameter(value: Record<string, unknown>): PublishedParameter {
  const clean: Record<string, unknown> = {};
  for (const field of PUBLISHED_PARAMETER_FIELDS) {
    if (Object.hasOwn(value, field)) clean[field] = value[field];
  }
  const type = clean.ui_element;
  if (type !== "Range" && type !== "Toggle") {
    delete clean.min_value;
    delete clean.max_value;
    delete clean.step;
  }
  if (type !== "Select") delete clean.options;
  return clean as PublishedParameter;
}

export function parameterOutOfBandFields(value: Record<string, unknown>): Record<string, unknown> {
  const clean = cleanPublishedParameter(value);
  return Object.fromEntries(Object.entries(value).filter(([field]) => !Object.hasOwn(clean, field)));
}

export function isPublishedParameterType(value: unknown): value is PublishedParameterType {
  return typeof value === "string" && (PUBLISHED_PARAMETER_TYPES as readonly string[]).includes(value);
}

export function hasForbiddenParameterKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(hasForbiddenParameterKeys);
  const forbidden = new Set(["genesis", "_collection", "_semantic_group", "_provenance", "source_file", "source_files", "source_label", "source_labels", "batch_id", "batch_index", "raw_sha256", "package_id", "parent_parameters", "selection_score"]);
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbidden.has(key) ? [key] : []),
    ...hasForbiddenParameterKeys(child),
  ]);
}

export function parameterSchemaFields(): readonly string[] {
  return PUBLISHED_PARAMETER_FIELDS;
}

export function isPublishedField(field: string): boolean {
  return PUBLISHED_FIELDS.has(field);
}
