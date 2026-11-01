import type { ActiveParameter } from "@/lib/rag-v3/types";
import { ACOUSTIC_DOMAIN_LAYERS, GLOBAL_CONSENSUS_LAYER } from "@/lib/domain-layers";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";
import { interpolateParameterFrames } from "@/lib/audio-segment-timeline";
import {
  computeModalityTrust,
  DEFAULT_MODALITY_TRUST_CONFIG,
  modalityTrustWeight,
  normalizeModalityTrustConfig,
  parameterDivergence,
  parameterTrustEvidence,
  type ModalityTrustConfig,
} from "@/lib/modality-trust";

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

export function applyConsensusSmooth(
  frames: ActiveParameter[][],
  selectedLayers: string[],
  topK: number,
  centroidPercent: number,
  trustConfig: ModalityTrustConfig = DEFAULT_MODALITY_TRUST_CONFIG,
) {
  const safeTrustConfig = normalizeModalityTrustConfig(trustConfig);
  const allowed = frames.map((frame) => frame.filter((parameter) => parameterMatchesLayers(parameter, selectedLayers))
    .sort((a, b) => (Number.isFinite(b.similarity) ? b.similarity : Number.NEGATIVE_INFINITY) - (Number.isFinite(a.similarity) ? a.similarity : Number.NEGATIVE_INFINITY) || a.technical_name.localeCompare(b.technical_name))
    .slice(0, Math.max(1, topK)));
  const trusts = allowed.map((frame) => computeModalityTrust(frame.map((parameter) => parameter.similarity)).trust);
  const values = new Map<string, Array<{ parameter: ActiveParameter; frameIndex: number }>>();
  for (const [frameIndex, frame] of allowed.entries()) for (const parameter of frame) {
    if (parameter.ui_element !== "Range" || typeof parameter.current_value !== "number") continue;
    const list = values.get(parameter.technical_name) ?? [];
    list.push({ parameter, frameIndex });
    values.set(parameter.technical_name, list);
  }
  const conflictingNames = new Set<string>();
  for (const [name, peers] of values) {
    for (let left = 0; left < peers.length; left += 1) for (let right = left + 1; right < peers.length; right += 1) {
      if (peers[left].frameIndex === peers[right].frameIndex) continue;
      const divergence = parameterDivergence(parameterTrustEvidence(peers[left].parameter), parameterTrustEvidence(peers[right].parameter));
      if (divergence > safeTrustConfig.divergenceThreshold) conflictingNames.add(name);
    }
  }
  const weight = Math.max(0, Math.min(100, centroidPercent)) / 100;
  return frames.map((frame, frameIndex) => frame.map((parameter) => {
    const peers = values.get(parameter.technical_name);
    if (!allowed[frameIndex].some((candidate) => candidate.technical_name === parameter.technical_name) || !parameterMatchesLayers(parameter, selectedLayers) || parameter.ui_element !== "Range" || typeof parameter.current_value !== "number" || !peers || peers.length < 2 || conflictingNames.has(parameter.technical_name)) return parameter;
    const centroidWeight = peers.reduce((sum, peer) => sum + modalityTrustWeight(trusts[peer.frameIndex], safeTrustConfig), 0);
    if (!Number.isFinite(centroidWeight) || centroidWeight <= 0) return parameter;
    const centroid = peers.reduce((sum, peer) => sum + (peer.parameter.current_value as number) * modalityTrustWeight(trusts[peer.frameIndex], safeTrustConfig), 0) / centroidWeight;
    const centroidConfidence = peers.reduce((sum, peer) => sum + modalityTrustWeight(trusts[peer.frameIndex], safeTrustConfig), 0) / peers.length;
    const effectiveWeight = weight * centroidConfidence;
    const value = Math.max(parameter.min_value ?? Number.NEGATIVE_INFINITY, Math.min(parameter.max_value ?? Number.POSITIVE_INFINITY, parameter.current_value * (1 - effectiveWeight) + centroid * effectiveWeight));
    return { ...parameter, current_value: value, suggested_value: value, source: "transition" as const, detail: `Stage-2 client smooth · query ${100 - Math.round(effectiveWeight * 100)}% / centroid ${Math.round(effectiveWeight * 100)}%` };
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
