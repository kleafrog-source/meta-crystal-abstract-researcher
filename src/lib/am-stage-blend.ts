import type { ActiveParameter } from "@/lib/rag-v3/types";
import { ACOUSTIC_DOMAIN_LAYERS, GLOBAL_CONSENSUS_LAYER } from "@/lib/domain-layers";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";
import { interpolateParameterFrames } from "@/lib/audio-segment-timeline";

export type BlendCurve = "linear" | "cosine" | "cubic" | "exponential";

function cubicBezierS(x: number) {
  let low = 0;
  let high = 1;
  let t = x;
  for (let i = 0; i < 12; i += 1) {
    const inverse = 1 - t;
    const curveX = 3 * inverse * inverse * t * 0.42 + 3 * inverse * t * t * 0.58 + t * t * t;
    if (curveX < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  const inverse = 1 - t;
  return 3 * inverse * t * t + t * t * t;
}

export function parameterMatchesLayers(parameter: ActiveParameter, selectedLayers: string[]) {
  const layer = parameter.domain_layer ?? classifyDomainLayer(parameter.technical_name, parameter.category);
  if (layer === GLOBAL_CONSENSUS_LAYER.id) return false;
  if (layer && !ACOUSTIC_DOMAIN_LAYERS.some((item) => item.id === layer)) return false;
  return !layer || selectedLayers.includes(layer);
}

export function applyConsensusSmooth(frames: ActiveParameter[][], selectedLayers: string[], topK: number, centroidPercent: number) {
  const allowed = frames.map((frame) => frame.filter((parameter) => parameterMatchesLayers(parameter, selectedLayers))
    .sort((a, b) => b.similarity - a.similarity || a.technical_name.localeCompare(b.technical_name))
    .slice(0, Math.max(1, topK)));
  const values = new Map<string, number[]>();
  for (const frame of allowed) for (const parameter of frame) {
    if (parameter.ui_element !== "Range" || typeof parameter.current_value !== "number") continue;
    const list = values.get(parameter.technical_name) ?? [];
    list.push(parameter.current_value);
    values.set(parameter.technical_name, list);
  }
  const weight = Math.max(0, Math.min(100, centroidPercent)) / 100;
  return frames.map((frame, frameIndex) => frame.map((parameter) => {
    const peers = values.get(parameter.technical_name);
    if (!allowed[frameIndex].some((candidate) => candidate.technical_name === parameter.technical_name) || !parameterMatchesLayers(parameter, selectedLayers) || parameter.ui_element !== "Range" || typeof parameter.current_value !== "number" || !peers || peers.length < 2) return parameter;
    const centroid = peers.reduce((sum, value) => sum + value, 0) / peers.length;
    const value = Math.max(parameter.min_value ?? Number.NEGATIVE_INFINITY, Math.min(parameter.max_value ?? Number.POSITIVE_INFINITY, parameter.current_value * (1 - weight) + centroid * weight));
    return { ...parameter, current_value: value, suggested_value: value, source: "transition" as const, detail: `Stage-2 client smooth · query ${100 - Math.round(weight * 100)}% / centroid ${Math.round(weight * 100)}%` };
  }));
}

export function interpolateStageFrames(first: ActiveParameter[], second: ActiveParameter[], blendPercent: number, curve: BlendCurve) {
  const t = Math.max(0, Math.min(1, blendPercent / 100));
  const eased = curve === "cosine" ? (1 - Math.cos(Math.PI * t)) / 2
    : curve === "cubic" ? cubicBezierS(t)
      : curve === "exponential" ? (Math.exp(4 * t) - 1) / (Math.exp(4) - 1) : t;
  const rightNames = new Set(second.map((parameter) => parameter.technical_name));
  return interpolateParameterFrames(first.filter((parameter) => rightNames.has(parameter.technical_name)), second.filter((parameter) => first.some((candidate) => candidate.technical_name === parameter.technical_name)), eased);
}

export function averageParameterFrames(first: ActiveParameter[], second: ActiveParameter[]) {
  return interpolateParameterFrames(first, second, 50);
}
