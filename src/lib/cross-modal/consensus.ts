import type { EnrichedParameter } from "@/lib/rag-v3/types";

import type { ConsensusContribution, ConsensusParameter, ConsensusResultRow, CrossModalModality } from "./types";

export interface ConsensusSourceInput { record_id: string; modality: CrossModalModality; weight: number; parameters: ConsensusParameter[] }
export interface GraphSuggestion { source_name: string; target_name: string; similarity: number }
export interface ConsensusResolvedRow extends ConsensusResultRow { selected_value: number | string }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number) => Number(value.toFixed(8));
const snap = (value: number, min: number, max: number, step: number) => Number((min + Math.round((Math.max(min, Math.min(max, value)) - min) / step) * step).toFixed(Math.min(8, Math.max(0, Math.ceil(-Math.log10(step || 1))))));

function weightedMedian(items: Array<{ value: number; weight: number; key: string }>) {
  const ordered = [...items].sort((a, b) => a.value - b.value || a.key.localeCompare(b.key)); const total = ordered.reduce((sum, item) => sum + item.weight, 0); let cursor = 0;
  for (const item of ordered) { cursor += item.weight; if (cursor >= total / 2) return item.value; }
  return ordered.at(-1)?.value ?? 0;
}

function resolveValue(parameter: EnrichedParameter, contributions: ConsensusContribution[]): { value: number | string; conflict: boolean } {
  const ui = parameter.ui_element;
  if (ui === "Range") {
    const min = parameter.min_value ?? 0; const max = parameter.max_value ?? 100; const step = parameter.step && parameter.step > 0 ? parameter.step : .01;
    const values = contributions.flatMap((item) => { const numeric = Number(item.selected_value); return Number.isFinite(numeric) ? [{ value: clamp01((numeric - min) / Math.max(max - min, Number.EPSILON)), weight: item.vote, key: item.record_id }] : []; });
    if (!values.length) return { value: typeof parameter.default === "number" ? parameter.default : min, conflict: false };
    const position = weightedMedian(values); return { value: snap(min + position * (max - min), min, max, step), conflict: Math.max(...values.map((item) => item.value)) - Math.min(...values.map((item) => item.value)) > .2 };
  }
  if (ui === "Select" || ui === "Toggle") {
    const votes = new Map<string, number>(); for (const item of contributions) votes.set(String(item.selected_value), (votes.get(String(item.selected_value)) ?? 0) + item.vote);
    const ordered = [...votes].sort((a, b) => b[1] - a[1] || (String(parameter.default) === a[0] ? -1 : String(parameter.default) === b[0] ? 1 : a[0].localeCompare(b[0])));
    return { value: ui === "Toggle" ? Number(ordered[0]?.[0] ?? parameter.default) : ordered[0]?.[0] ?? String(parameter.default), conflict: ordered.length > 1 };
  }
  const values = new Set(contributions.map((item) => JSON.stringify(item.selected_value)));
  return { value: values.size === 1 && contributions.length > 0 ? contributions[0].selected_value : (Array.isArray(parameter.default) ? JSON.stringify(parameter.default) : parameter.default), conflict: values.size > 1 };
}

export function buildConsensus(sources: ConsensusSourceInput[], metadata: Map<string, EnrichedParameter>, topK: number, graph: GraphSuggestion[] = [], graphPenalty = .35): ConsensusResolvedRow[] {
  const direct = new Map<string, ConsensusContribution[]>();
  for (const source of [...sources].sort((a, b) => a.record_id.localeCompare(b.record_id))) {
    const weight = clamp01(source.weight); if (weight <= 0) continue;
    for (const item of source.parameters) { const vote = clamp01(weight * clamp01(item.normalized_score)); if (vote <= 0 || !metadata.has(item.technical_name)) continue; const list = direct.get(item.technical_name) ?? []; list.push({ record_id: source.record_id, modality: source.modality, source_weight: weight, normalized_score: clamp01(item.normalized_score), vote, selected_value: item.selected_value }); direct.set(item.technical_name, list); }
  }
  const rows = new Map<string, ConsensusResolvedRow>();
  for (const [name, contributions] of direct) {
    const base = 1 - contributions.reduce((product, item) => product * (1 - item.vote), 1); const score = clamp01(base * (1 + .1 * Math.max(0, contributions.length - 1))); const resolved = resolveValue(metadata.get(name)!, contributions);
    rows.set(name, { technical_name: name, consensus_score: round(score), direct_source_count: contributions.length, graph_only: false, conflict: resolved.conflict, contributions, selected_value: resolved.value });
  }
  const graphCandidates = new Map<string, number>();
  for (const edge of graph) {
    const source = rows.get(edge.source_name); if (!source || rows.has(edge.target_name) || !metadata.has(edge.target_name)) continue;
    const score = clamp01(source.consensus_score * clamp01(edge.similarity) * clamp01(graphPenalty)); graphCandidates.set(edge.target_name, Math.max(graphCandidates.get(edge.target_name) ?? 0, score));
  }
  for (const [name, score] of [...graphCandidates].sort(([a], [b]) => a.localeCompare(b))) {
    const parameter = metadata.get(name)!;
    rows.set(name, { technical_name: name, consensus_score: round(score), direct_source_count: 0, graph_only: true, conflict: false, contributions: [], selected_value: Array.isArray(parameter.default) ? JSON.stringify(parameter.default) : parameter.default });
  }
  return [...rows.values()].sort((a, b) => b.consensus_score - a.consensus_score || a.technical_name.localeCompare(b.technical_name)).slice(0, Math.max(1, Math.min(100, topK)));
}
