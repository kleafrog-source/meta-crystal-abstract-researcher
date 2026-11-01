import type { ActiveParameter } from "@/lib/rag-v3/types";
import {
  computeModalityTrust,
  computeTrustAdjustedWeights,
  DEFAULT_MODALITY_TRUST_CONFIG,
  parameterDivergence,
  parameterTrustEvidence,
  normalizeModalityTrustConfig,
  type ModalityTrustConfig,
} from "@/lib/modality-trust";

export interface AudioAnalysisPoint {
  time: number;
  offset: number;
  duration: number;
}

export interface AudioTimelineSegment extends AudioAnalysisPoint {
  clap: ActiveParameter[];
  siglip: ActiveParameter[];
}

export interface PriorityTimelineOptions {
  audioName: string;
  audioDuration: number;
  rawInterval: number;
  nodeInterval: number;
  blend: boolean;
  clapWeight?: number;
  trustConfig?: ModalityTrustConfig;
  textScores?: number[];
  vocalMatrix?: boolean;
}

const TECHNICAL_NAME = /^[a-z0-9_]+$/;

export function buildAudioAnalysisPoints(
  totalDuration: number,
  interval: number,
  requestedStart = 0,
  requestedEnd = totalDuration,
): AudioAnalysisPoint[] {
  if (!Number.isFinite(totalDuration) || totalDuration < 0.1) return [];
  const safeInterval = Math.max(0.5, Math.min(30, interval || 2));
  const start = Math.max(0, Math.min(totalDuration, requestedStart || 0));
  const end = Math.max(start, Math.min(totalDuration, Number.isFinite(requestedEnd) ? requestedEnd : totalDuration));
  const rangeDuration = end - start;
  if (rangeDuration < 0.1) return [];
  const windowDuration = Math.min(rangeDuration, safeInterval);
  if (safeInterval >= rangeDuration) {
    return [
      { time: start, offset: start, duration: windowDuration },
      { time: end, offset: start, duration: windowDuration },
    ];
  }

  const times: number[] = [];
  for (let time = start; time < end; time += safeInterval) times.push(time);
  if (Math.abs((times.at(-1) ?? start) - end) > 0.001) times.push(end);
  return times.map((time) => ({
    time,
    offset: Math.min(time, Math.max(start, end - windowDuration)),
    duration: windowDuration,
  }));
}

function snap(value: number, step?: number): number {
  if (!step || step <= 0) return value;
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

export function interpolateParameterFrames(
  current: ActiveParameter[],
  next: ActiveParameter[],
  progress: number,
): ActiveParameter[] {
  const ratio = Math.max(0, Math.min(1, progress));
  const left = new Map(
    current.map((parameter) => [parameter.technical_name, parameter]),
  );
  const right = new Map(
    next.map((parameter) => [parameter.technical_name, parameter]),
  );
  const names = [...new Set([...left.keys(), ...right.keys()])];

  return names.map((name) => {
    const a = left.get(name);
    const b = right.get(name);
    const base = (ratio < 0.5 ? (a ?? b) : (b ?? a))!;
    if (!a || !b) return { ...base };
    if (
      a.ui_element === "Range" &&
      typeof a.current_value === "number" &&
      typeof b.current_value === "number"
    ) {
      const min = a.min_value ?? Number.NEGATIVE_INFINITY;
      const max = a.max_value ?? Number.POSITIVE_INFINITY;
      const value = Math.max(
        min,
        Math.min(
          max,
          snap(
            a.current_value + (b.current_value - a.current_value) * ratio,
            a.step,
          ),
        ),
      );
      return {
        ...base,
        current_value: value,
        suggested_value: value,
        source: "transition",
        detail: `Timeline interpolation ${Math.round(ratio * 100)}%`,
      };
    }
    const value = ratio < 0.5 ? a.current_value : b.current_value;
    return {
      ...base,
      current_value: value,
      suggested_value: value,
      source: "transition",
      detail: `Timeline step transition ${Math.round(ratio * 100)}%`,
    };
  });
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function aggregateFrames(frames: ActiveParameter[][]): ActiveParameter[] {
  const limit = Math.max(0, ...frames.map((frame) => frame.length));
  const grouped = new Map<string, ActiveParameter[]>();
  for (const frame of frames) for (const parameter of frame) {
    if (!TECHNICAL_NAME.test(parameter.technical_name)) continue;
    const values = grouped.get(parameter.technical_name) ?? [];
    values.push(parameter);
    grouped.set(parameter.technical_name, values);
  }
  return [...grouped.values()].map((items) => {
    const base = items.reduce((best, item) => item.similarity > best.similarity ? item : best, items[0]);
    const numeric = items.map((item) => item.current_value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (base.ui_element === "Range" && numeric.length) {
      const value = snap(median(numeric), base.step);
      return { ...base, current_value: value, suggested_value: value, source: "transition" as const, detail: `Median-smoothed from ${numeric.length} raw samples` };
    }
    const votes = new Map<string, { count: number; item: ActiveParameter }>();
    for (const item of items) {
      const key = JSON.stringify(item.current_value);
      const vote = votes.get(key) ?? { count: 0, item };
      vote.count += Math.max(0.01, item.similarity);
      votes.set(key, vote);
    }
    return { ...[...votes.values()].sort((a, b) => b.count - a.count)[0].item };
  }).sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export function smoothTimelineSegments(segments: AudioTimelineSegment[], nodeInterval: number): AudioTimelineSegment[] {
  if (!segments.length) return [];
  const interval = Math.max(0.5, Math.min(360, nodeInterval || 20));
  const lastTime = segments.at(-1)?.time ?? 0;
  const nodes: AudioTimelineSegment[] = [];
  for (let time = 0; time <= lastTime + 0.001; time += interval) {
    const nearby = segments.filter((segment) => Math.abs(segment.time - time) <= interval / 2);
    const source = nearby.length ? nearby : [segments.reduce((best, item) => Math.abs(item.time - time) < Math.abs(best.time - time) ? item : best, segments[0])];
    nodes.push({ time: Math.min(time, lastTime), offset: Math.min(time, lastTime), duration: interval, clap: aggregateFrames(source.map((item) => item.clap)), siglip: aggregateFrames(source.map((item) => item.siglip)) });
  }
  if ((nodes.at(-1)?.time ?? 0) < lastTime) {
    const source = segments.filter((segment) => segment.time > lastTime - interval);
    nodes.push({ time: lastTime, offset: lastTime, duration: interval, clap: aggregateFrames(source.map((item) => item.clap)), siglip: aggregateFrames(source.map((item) => item.siglip)) });
  }
  return nodes;
}

function normalizedScores(parameters: ActiveParameter[]): Map<string, number> {
  if (!parameters.length) return new Map();
  const scores = parameters.map((item) => Number.isFinite(item.similarity) ? item.similarity : 0);
  const low = Math.min(...scores), high = Math.max(...scores), span = high - low;
  return new Map(parameters.map((item, index) => [item.technical_name, span > 1e-9 ? (scores[index] - low) / span : 1]));
}

export function blendParameterFrames(
  clap: ActiveParameter[],
  siglip: ActiveParameter[],
  clapWeight = 0.5,
  trustConfig: ModalityTrustConfig = DEFAULT_MODALITY_TRUST_CONFIG,
): ActiveParameter[] {
  const safeTrustConfig = normalizeModalityTrustConfig(trustConfig);
  const baselineWeight = Number.isFinite(clapWeight) ? Math.max(0, Math.min(1, clapWeight)) : 0.5;
  const clapTrust = computeModalityTrust(clap.map((item) => item.similarity)).trust;
  const siglipTrust = computeModalityTrust(siglip.map((item) => item.similarity)).trust;
  const trustWeights = computeTrustAdjustedWeights(baselineWeight, clapTrust, siglipTrust, safeTrustConfig);
  const cScores = normalizedScores(clap), sScores = normalizedScores(siglip);
  const cMap = new Map(clap.map((item) => [item.technical_name, item]));
  const sMap = new Map(siglip.map((item) => [item.technical_name, item]));
  return [...new Set([...cMap.keys(), ...sMap.keys()])].map((name) => {
    const c = cMap.get(name), s = sMap.get(name), base = c ?? s!;
    const both = Boolean(c && s);
    const score = both ? (cScores.get(name) ?? 0) * trustWeights.first + (sScores.get(name) ?? 0) * trustWeights.second : c ? (cScores.get(name) ?? 0) : (sScores.get(name) ?? 0);
    let value = (score >= 0.5 ? (c ?? s) : (s ?? c))!.current_value;
    const divergence = c && s ? parameterDivergence(parameterTrustEvidence(c), parameterTrustEvidence(s)) : 0;
    const preferClap = trustWeights.first >= trustWeights.second;
    const blockedAverage = Boolean(c && s && divergence > safeTrustConfig.divergenceThreshold);
    if (c && s && !blockedAverage && typeof c.current_value === "number" && typeof s.current_value === "number") {
      value = snap(c.current_value * trustWeights.first + s.current_value * trustWeights.second, base.step);
    } else if (c && s && blockedAverage) {
      value = (preferClap ? c : s).current_value;
    }
    const weightDetail = both ? `CLAP/SigLIP trust-adjusted fusion ${Math.round(trustWeights.first * 100)}/${Math.round(trustWeights.second * 100)}` : "Single-source normalized score";
    const divergenceDetail = blockedAverage ? ` · divergence ${divergence.toFixed(2)}; kept ${preferClap ? "CLAP" : "SigLIP2"}` : "";
    return { ...base, current_value: value, suggested_value: value, similarity: score, source: "consensus" as const, detail: `${weightDetail}${divergenceDetail}` };
  }).sort((a, b) => (Number.isFinite(b.similarity) ? b.similarity : Number.NEGATIVE_INFINITY) - (Number.isFinite(a.similarity) ? a.similarity : Number.NEGATIVE_INFINITY));
}

function dspTargets(name: string): Array<{ node: string; parameter: string }> {
  const targets: Array<{ node: string; parameter: string }> = [];
  if (/(distortion|drive|overdrive|saturation)/.test(name)) targets.push({ node: "Distortion", parameter: "drive" });
  if (/(vocal.*scream.*distortion|scream.*drive)/.test(name)) targets.push({ node: "Compressor", parameter: "threshold" });
  if (/(compress|threshold)/.test(name)) targets.push({ node: "Compressor", parameter: name.includes("threshold") ? "threshold" : "amount" });
  if (/(reverb|reflection_density)/.test(name)) targets.push({ node: "Reverb", parameter: name.includes("density") ? "density" : "mix" });
  if (/(stereo_width|spatial_width|pan_)/.test(name)) targets.push({ node: "Spatial", parameter: name.includes("pan") ? "pan" : "width" });
  if (/(delay|echo)/.test(name)) targets.push({ node: "Delay", parameter: "time_or_mix" });
  return targets;
}

function stemEvents(segments: AudioTimelineSegment[], blend: boolean, clapWeight = 0.5, trustConfig: ModalityTrustConfig = DEFAULT_MODALITY_TRUST_CONFIG) {
  const events: Array<Record<string, unknown>> = [];
  let previous = new Map<string, string | number>();
  for (const segment of segments) {
    const frame = blend ? blendParameterFrames(segment.clap, segment.siglip, clapWeight, trustConfig) : [...segment.clap, ...segment.siglip];
    const current = new Map(frame.filter((item) => /^(iso_language_|technique_|fx_chain_)|^vocal_(delivery_archetype|layer_count|layering_count|allocation_)|vocal_spectral_masking|parallel_vocal_spectral/.test(item.technical_name)).map((item) => [item.technical_name, item.current_value]));
    for (const [name, value] of current) if (!previous.has(name) || previous.get(name) !== value) events.push({ t: segment.time, stem: "VOCAL_MAIN", action: previous.has(name) ? (name.includes("layer") || name.includes("language") ? "SET_LAYER_ROUTING" : "SWITCH_FX_CHAIN") : "INITIALIZE_VOCAL_LAYER", parameter: name, value });
    previous = current;
  }
  return events;
}

export function buildPriorityTimeline(segments: AudioTimelineSegment[], options: PriorityTimelineOptions) {
  const trustConfig = normalizeModalityTrustConfig(options.trustConfig ?? DEFAULT_MODALITY_TRUST_CONFIG);
  const valid = (items: ActiveParameter[]) => items.filter((item) => TECHNICAL_NAME.test(item.technical_name));
  const clapRegistry = [...new Set(segments.flatMap((segment) => valid(segment.clap).map((item) => item.technical_name)))];
  const siglipRegistry = [...new Set(segments.flatMap((segment) => valid(segment.siglip).map((item) => item.technical_name)))];
  const blendedRegistry = [...new Set(segments.flatMap((segment) => blendParameterFrames(valid(segment.clap), valid(segment.siglip), options.clapWeight, trustConfig).map((item) => item.technical_name)))];
  const pairs = (items: ActiveParameter[], registry: string[]) => items.map((item) => [registry.indexOf(item.technical_name), item.current_value]);
  const timeline = segments.map((segment) => options.blend ? { t: segment.time, blended: pairs(blendParameterFrames(valid(segment.clap), valid(segment.siglip), options.clapWeight, trustConfig), blendedRegistry) } : { t: segment.time, clap: pairs(valid(segment.clap), clapRegistry), siglip: pairs(valid(segment.siglip), siglipRegistry) });
  const all = segments.flatMap((segment) => options.blend ? blendParameterFrames(segment.clap, segment.siglip, options.clapWeight, trustConfig) : [...segment.clap, ...segment.siglip]);
  const modalityTrust = segments.map((segment) => {
    const clapTrust = computeModalityTrust(segment.clap.map((item) => item.similarity));
    const siglipTrust = computeModalityTrust(segment.siglip.map((item) => item.similarity));
    const siglipByName = new Map(segment.siglip.map((item) => [item.technical_name, item]));
    const divergences = segment.clap.flatMap((item) => {
      const peer = siglipByName.get(item.technical_name);
      return peer ? [parameterDivergence(parameterTrustEvidence(item), parameterTrustEvidence(peer))] : [];
    });
    return {
      t: segment.time,
      clap_trust: clapTrust.trust,
      siglip_trust: siglipTrust.trust,
      mean_shared_value_divergence: divergences.length ? divergences.reduce((sum, value) => sum + value, 0) / divergences.length : null,
      high_divergence_names: divergences.length
        ? segment.clap.filter((item) => {
          const peer = siglipByName.get(item.technical_name);
          return peer && parameterDivergence(parameterTrustEvidence(item), parameterTrustEvidence(peer)) > trustConfig.divergenceThreshold;
        }).map((item) => item.technical_name)
        : [],
    };
  });
  return {
    schema: "FLOWMUSIC_PRIORITY_TIMELINE_V1",
    audio: { name: options.audioName, duration_seconds: options.audioDuration },
    sampling: { interval_seconds: options.rawInterval, node_interval_seconds: options.nodeInterval, smoothing: "weighted_median" },
    modality_trust: {
      method: "one_minus_normalized_softmax_entropy",
      low_trust_threshold: trustConfig.lowTrustThreshold,
      floor_weight: trustConfig.floorWeight,
      divergence_threshold: trustConfig.divergenceThreshold,
      ...(options.textScores ? { text_trust: computeModalityTrust(options.textScores).trust } : {}),
      segments: modalityTrust,
    },
    ...(options.blend ? { blended_registry: blendedRegistry } : { clap_registry: clapRegistry, siglip_registry: siglipRegistry }),
    timeline,
    dsp_graph: Object.fromEntries([...new Set(all.map((item) => item.technical_name))].map((name) => [name, dspTargets(name)]).filter(([, targets]) => (targets as unknown[]).length)),
    events: stemEvents(segments, options.blend, options.clapWeight, trustConfig),
    vocal_allocation_matrix: options.vocalMatrix ? true : undefined,
  };
}
