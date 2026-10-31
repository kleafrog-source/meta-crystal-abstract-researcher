import type { ActiveParameter } from "@/lib/rag-v3/types";

export interface ParameterTimelinePoint {
  time: number;
  offset?: number;
  duration?: number;
  clap: ActiveParameter[];
  siglip: ActiveParameter[];
}

export type ParamTextFragmentKind = "tag" | "keyword" | "description";
export type ParamTextRankingMode = "frequency" | "centroid" | "brief";

export interface ParamToTextEvidence {
  time_seconds: number;
  support_seconds: number;
  modality: "clap" | "siglip" | "both";
  similarity: number;
  value: number | string;
}

export interface ParamToTextEntry {
  technical_name: string;
  prevalence: number;
  sample_prevalence: number;
  occurrence_seconds: number;
  mean_similarity: number;
  similarity_min: number;
  similarity_max: number;
  contribution_score: number;
  intensity: string | null;
  normalized_position: number | null;
  value_min: number | string | null;
  value_max: number | string | null;
  value_mean: number | null;
  value_last: number | string | null;
  default_value: number | string | null;
  unit: string | null;
  lower_value_behavior: string | null;
  higher_value_behavior: string | null;
  value_distribution: Array<{ value: number | string; share: number }>;
  tags: string[];
  keywords: string[];
  description_fragments: string[];
  evidence: ParamToTextEvidence[];
}

export interface RankedParamTextFragment {
  id: string;
  technical_name: string;
  kind: ParamTextFragmentKind;
  text: string;
  intensity: string | null;
  score: number;
  contribution_score: number;
  prevalence: number;
  mean_similarity: number;
}

export interface ParamToTextSnapshot {
  schema: "param_to_text_snapshot_v1";
  generated_at: string;
  audio_name: string;
  audio_duration_seconds: number;
  sampled_points: number;
  analysis_coverage_seconds: number;
  analysis_coverage_ratio: number;
  analysis_range_seconds: { start: number; duration: number };
  options: {
    parameter_limit: number;
    modalities: Array<"clap" | "siglip">;
    excluded_text: string[];
    domain_layers: string[];
  };
  tags_only: string[];
  parameters: ParamToTextEntry[];
  ranked_fragments: RankedParamTextFragment[];
  ranking_comparison?: Partial<Record<ParamTextRankingMode, RankedParamTextFragment[]>>;
  active_ranking_mode?: ParamTextRankingMode;
  pinned_fragment_ids: string[];
  excluded_fragment_ids: string[];
  natural_descriptions?: {
    en: string;
    ru: string;
    provider: string;
    model: string;
    generated_at: string;
  };
}

function cleanStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
}

function valueKey(value: number | string): string {
  return `${typeof value}:${String(value)}`;
}

function buildSupportWeights(points: ParameterTimelinePoint[], duration: number, rangeStart: number): number[] {
  const result = points.map(() => 0);
  const order = points.map((point, index) => ({ point, index, start: Math.max(0, (point.offset ?? point.time) - rangeStart), end: Math.min(duration, (point.offset ?? point.time) + Math.max(0, point.duration ?? 0) - rangeStart) }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let coveredUntil = 0;
  for (const item of order) {
    const start = Math.max(coveredUntil, item.start);
    const end = Math.max(start, item.end);
    result[item.index] = end - start;
    coveredUntil = Math.max(coveredUntil, end);
  }
  return result;
}

function behaviorFromDescription(parameter: ActiveParameter, direction: "lower" | "higher"): string | null {
  const descriptions = [parameter.description_en, parameter.description_ru].filter((text): text is string => typeof text === "string");
  const pattern = direction === "lower" ? /\b(lower|low|minimum|least|ниже|низк|миним|меньш)\b/i : /\b(higher|high|maximum|greatest|выше|высок|максим|больш)\b/i;
  return descriptions.flatMap((description) => description.split(/(?<=[;.!?])\s+|\n+/).map((clause) => clause.trim())).find((clause) => pattern.test(clause))?.slice(0, 260) ?? null;
}

function weightedValueSummary(rows: Array<{ parameter: ActiveParameter; weight: number }>): Pick<ParamToTextEntry, "intensity" | "normalized_position" | "value_min" | "value_max" | "value_mean" | "value_last" | "default_value" | "unit" | "lower_value_behavior" | "higher_value_behavior" | "value_distribution"> {
  const first = rows[0].parameter;
  const distribution = new Map<string, { value: number | string; weight: number }>();
  for (const row of rows) {
    const key = valueKey(row.parameter.current_value);
    const item = distribution.get(key) ?? { value: row.parameter.current_value, weight: 0 };
    item.weight += row.weight;
    distribution.set(key, item);
  }
  const valueDistribution = [...distribution.values()].sort((a, b) => b.weight - a.weight || String(a.value).localeCompare(String(b.value))).map((item) => ({ value: item.value, share: item.weight / Math.max(0.0001, rows.reduce((sum, row) => sum + row.weight, 0)) }));
  const numeric = rows.filter((row) => typeof row.parameter.current_value === "number" && Number.isFinite(row.parameter.current_value));
  if (first.ui_element === "Select" || first.ui_element === "Toggle" || !numeric.length) {
    return { intensity: valueDistribution[0]?.value == null ? null : String(valueDistribution[0].value), normalized_position: null, value_min: valueDistribution.at(-1)?.value ?? null, value_max: valueDistribution[0]?.value ?? null, value_mean: null, value_last: rows.at(-1)?.parameter.current_value ?? null, default_value: first.default, unit: first.unit ?? null, lower_value_behavior: behaviorFromDescription(first, "lower"), higher_value_behavior: behaviorFromDescription(first, "higher"), value_distribution: valueDistribution };
  }
  const min = first.min_value;
  const max = first.max_value;
  const totalWeight = numeric.reduce((sum, row) => sum + row.weight, 0) || numeric.length;
  const mean = numeric.reduce((sum, row) => sum + Number(row.parameter.current_value) * (row.weight || 1), 0) / totalWeight;
  const values = numeric.map((row) => Number(row.parameter.current_value));
  const normalized = typeof min === "number" && typeof max === "number" && max > min ? Math.max(0, Math.min(1, (mean - min) / (max - min))) : null;
  const defaultValue = typeof first.default === "number" ? first.default : null;
  const normalizedDefault = defaultValue !== null && typeof min === "number" && typeof max === "number" && max > min ? Math.max(0, Math.min(1, (defaultValue - min) / (max - min))) : null;
  const tolerance = typeof first.step === "number" && typeof min === "number" && typeof max === "number" && max > min ? Math.max(0.02, first.step / (max - min) / 2) : 0.03;
  let intensity: string | null = null;
  if (normalized !== null) {
    if (normalizedDefault !== null && Math.abs(normalized - normalizedDefault) <= tolerance) intensity = "at default";
    else if (normalized < 1 / 3) intensity = "near minimum";
    else if (normalized > 2 / 3) intensity = "near maximum";
    else intensity = normalizedDefault !== null && normalized < normalizedDefault ? "below default" : normalizedDefault !== null && normalized > normalizedDefault ? "above default" : "mid range";
  }
  return { intensity, normalized_position: normalized, value_min: Math.min(...values), value_max: Math.max(...values), value_mean: mean, value_last: numeric.at(-1)?.parameter.current_value ?? null, default_value: first.default, unit: first.unit ?? null, lower_value_behavior: behaviorFromDescription(first, "lower"), higher_value_behavior: behaviorFromDescription(first, "higher"), value_distribution: valueDistribution };
}

export function buildParamToTextSnapshot(
  points: ParameterTimelinePoint[],
  options: {
    audioName: string;
    audioDurationSeconds: number;
    limit?: number;
    generatedAt?: string;
    modalities?: Array<"clap" | "siglip">;
    excludedText?: string[];
    domainLayers?: string[];
    matchesLayer?: (parameter: ActiveParameter) => boolean;
    analysisRangeStartSeconds?: number;
    analysisRangeDurationSeconds?: number;
  },
): ParamToTextSnapshot {
  const duration = Math.max(0, options.audioDurationSeconds);
  const rangeStart = Math.max(0, options.analysisRangeStartSeconds ?? 0);
  const rangeDuration = Math.max(0, Math.min(options.analysisRangeDurationSeconds ?? duration, Math.max(0, duration - rangeStart)));
  const modalities = options.modalities ?? ["clap", "siglip"];
  const excludedText = cleanStrings(options.excludedText).map((item) => item.toLocaleLowerCase());
  const weights = buildSupportWeights(points, rangeDuration, rangeStart);
  let totalCovered = 0;
  let pointsWithData = 0;
  const byName = new Map<string, Array<{ parameter: ActiveParameter; weight: number; time: number; modality: "clap" | "siglip" | "both" }>>();
  points.forEach((point, index) => {
    const selectedClap = modalities.includes("clap") ? point.clap.filter((parameter) => !options.matchesLayer || options.matchesLayer(parameter)) : [];
    const selectedSiglip = modalities.includes("siglip") ? point.siglip.filter((parameter) => !options.matchesLayer || options.matchesLayer(parameter)) : [];
    const clapNames = new Set(selectedClap.map((parameter) => parameter.technical_name));
    const siglipNames = new Set(selectedSiglip.map((parameter) => parameter.technical_name));
    const atPoint = new Map<string, ActiveParameter>();
    for (const parameter of [...selectedClap, ...selectedSiglip]) {
      if (!parameter.technical_name) continue;
      const prior = atPoint.get(parameter.technical_name);
      if (!prior || parameter.similarity > prior.similarity) atPoint.set(parameter.technical_name, parameter);
    }
    if (atPoint.size) {
      pointsWithData += 1;
      totalCovered += weights[index];
    }
    for (const [name, parameter] of atPoint) {
      if (weights[index] <= 0) continue;
      const modality = clapNames.has(name) && siglipNames.has(name) ? "both" : clapNames.has(name) ? "clap" : "siglip";
      byName.set(name, [...(byName.get(name) ?? []), { parameter, weight: weights[index], time: point.time, modality }]);
    }
  });

  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 24)));
  const entries = [...byName.entries()].map(([technicalName, rows]) => {
    const representative = rows.reduce((best, row) => row.parameter.similarity > best.parameter.similarity ? row : best, rows[0]).parameter;
    const occurrence = rows.reduce((sum, row) => sum + row.weight, 0);
    const denominator = rows.reduce((sum, row) => sum + row.weight, 0) || rows.length;
    const similarities = rows.map((row) => row.parameter.similarity).filter(Number.isFinite);
    const meanSimilarity = rows.reduce((sum, row) => sum + row.parameter.similarity * (row.weight || 1), 0) / denominator;
    const allDescriptions = [representative.description_en, representative.description_ru].filter((text): text is string => typeof text === "string");
    const fragments = allDescriptions.flatMap((text) => text.split(/(?<=[.!?])\s+|\n+/).map((fragment) => fragment.trim()).filter((fragment) => fragment.length >= 12).slice(0, 3));
    const summary = weightedValueSummary(rows.map((row) => ({ parameter: row.parameter, weight: row.weight })));
    return {
      technical_name: technicalName,
      prevalence: rangeDuration > 0 ? occurrence / rangeDuration : 0,
      sample_prevalence: pointsWithData ? rows.length / pointsWithData : 0,
      occurrence_seconds: occurrence,
      mean_similarity: meanSimilarity,
      similarity_min: similarities.length ? Math.min(...similarities) : 0,
      similarity_max: similarities.length ? Math.max(...similarities) : 0,
      contribution_score: (rangeDuration > 0 ? occurrence / rangeDuration : 0) * meanSimilarity,
      ...summary,
      tags: cleanStrings(representative.lyria_prompt_tags).filter((text) => !excludedText.includes(text.toLocaleLowerCase())),
      keywords: cleanStrings(representative.semantic_keywords).filter((text) => !excludedText.includes(text.toLocaleLowerCase())),
      description_fragments: fragments.filter((text) => !excludedText.includes(text.toLocaleLowerCase())),
      evidence: rows.slice().sort((a, b) => (b.weight * b.parameter.similarity) - (a.weight * a.parameter.similarity)).slice(0, 5).map((row) => ({ time_seconds: row.time, support_seconds: row.weight, modality: row.modality, similarity: row.parameter.similarity, value: row.parameter.current_value })),
    } satisfies ParamToTextEntry;
  }).sort((a, b) => b.contribution_score - a.contribution_score || a.technical_name.localeCompare(b.technical_name)).slice(0, limit);

  const tagScores = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) tagScores.set(tag, (tagScores.get(tag) ?? 0) + entry.contribution_score);
  const tagsOnly = [...tagScores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
  return {
    schema: "param_to_text_snapshot_v1",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    audio_name: options.audioName,
    audio_duration_seconds: duration,
    sampled_points: points.length,
    analysis_coverage_seconds: totalCovered,
    analysis_coverage_ratio: rangeDuration ? Math.min(1, totalCovered / rangeDuration) : 0,
    analysis_range_seconds: { start: rangeStart, duration: rangeDuration },
    options: { parameter_limit: limit, modalities, excluded_text: cleanStrings(options.excludedText), domain_layers: options.domainLayers ?? [] },
    tags_only: tagsOnly,
    parameters: entries,
    ranked_fragments: entries.flatMap((entry) => [
      ...entry.tags.map((text) => ({ entry, kind: "tag" as const, text })),
      ...entry.keywords.map((text) => ({ entry, kind: "keyword" as const, text })),
      ...entry.description_fragments.map((text) => ({ entry, kind: "description" as const, text })),
    ]).map(({ entry, kind, text }) => ({ id: `${entry.technical_name}|${kind}|${text}`, technical_name: entry.technical_name, kind, text, intensity: entry.intensity, score: entry.contribution_score, contribution_score: entry.contribution_score, prevalence: entry.prevalence, mean_similarity: entry.mean_similarity })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 24),
    pinned_fragment_ids: [],
    excluded_fragment_ids: [],
  };
}

export function reviewedParamText(snapshot: ParamToTextSnapshot, mode = snapshot.active_ranking_mode): ParamToTextSnapshot {
  const source = (mode && snapshot.ranking_comparison?.[mode]) || snapshot.ranked_fragments;
  const fragments = source.filter((fragment) => !snapshot.excluded_fragment_ids.includes(fragment.id) || snapshot.pinned_fragment_ids.includes(fragment.id));
  const pinned = fragments.filter((fragment) => snapshot.pinned_fragment_ids.includes(fragment.id));
  const tags = [...new Set([...pinned.filter((fragment) => fragment.kind === "tag"), ...fragments.filter((fragment) => fragment.kind === "tag")].map((fragment) => fragment.text))];
  return { ...snapshot, ...(mode ? { active_ranking_mode: mode } : {}), ranked_fragments: fragments, tags_only: tags.length ? tags : snapshot.tags_only };
}
