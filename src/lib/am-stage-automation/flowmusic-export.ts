import type { ActiveParameter } from "@/lib/rag-v3/types";
import { buildPriorityTimeline, type AudioTimelineSegment } from "@/lib/audio-segment-timeline";

export interface FlowmusicInputArtifact {
  artifactId?: string;
  actionId?: string;
  kind?: string;
  validity?: string;
  data?: unknown;
}

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function validateFlowmusicDocument(value: unknown): string[] {
  const issues: string[] = [];
  const doc = object(value);
  if (!doc) return ["$: document must be an object"];
  const audio = object(doc.audio);
  if (doc.schema !== "FLOWMUSIC_PRIORITY_TIMELINE_V1") issues.push("schema: expected FLOWMUSIC_PRIORITY_TIMELINE_V1");
  if (typeof audio?.name !== "string" || !audio.name.trim()) issues.push("audio.name: required non-empty string");
  if (typeof audio?.duration_seconds !== "number" || !Number.isFinite(audio.duration_seconds)) issues.push("audio.duration_seconds: required finite number");
  const sampling = object(doc.sampling);
  if (!sampling) issues.push("sampling: required object");
  else {
    if (typeof sampling.interval_seconds !== "number" || !Number.isFinite(sampling.interval_seconds)) issues.push("sampling.interval_seconds: required finite number");
    if (typeof sampling.node_interval_seconds !== "number" || !Number.isFinite(sampling.node_interval_seconds)) issues.push("sampling.node_interval_seconds: required finite number");
    if (sampling.smoothing !== "weighted_median") issues.push("sampling.smoothing: expected weighted_median");
  }
  if (!Array.isArray(object(doc.modality_trust)?.segments)) issues.push("modality_trust.segments: required array");
  if (!Array.isArray(doc.timeline) || doc.timeline.length === 0) issues.push("timeline: expected non-empty array");
  else doc.timeline.forEach((point, index) => { if (typeof object(point)?.t !== "number" || !Number.isFinite(object(point)?.t as number)) issues.push(`timeline[${index}].t: required finite number`); });
  if (!object(doc.dsp_graph)) issues.push("dsp_graph: required object");
  if (!Array.isArray(doc.events)) issues.push("events: required array");
  if (!(Array.isArray(doc.blended_registry) || (Array.isArray(doc.clap_registry) && Array.isArray(doc.siglip_registry)))) issues.push("registry: expected blended_registry or clap_registry and siglip_registry");
  return issues;
}

function readSegmentBank(artifact: FlowmusicInputArtifact, windows: Array<{ id: string; startSeconds: number; endSeconds: number }>): Map<string, ActiveParameter[]> {
  if (artifact.kind !== "parameter-bank" || artifact.validity !== "valid") throw new Error(`FLOWMUSIC_BANK_INVALID: ${artifact.actionId ?? "unknown"} must be a valid parameter-bank artifact.`);
  const data = object(artifact.data);
  if (data?.schema !== "am_stage_segment_bank_v1" || !Array.isArray(data.segments)) throw new Error(`FLOWMUSIC_SEGMENT_BANK_INVALID: ${artifact.actionId ?? "unknown"} is not a per-segment bank.`);
  const rows = new Map<string, ActiveParameter[]>();
  for (const segment of data.segments) {
    const item = object(segment);
    if (!item || typeof item.id !== "string" || !Array.isArray(item.parameters) || rows.has(item.id)) throw new Error("FLOWMUSIC_SEGMENT_BANK_INVALID: segment IDs must be unique and each segment needs a parameter array.");
    if (item.parameters.some((parameter) => {
      const name = object(parameter)?.technical_name;
      return typeof name !== "string" || !/^[a-z0-9_]+$/u.test(name);
    })) throw new Error(`FLOWMUSIC_PARAMETER_INVALID: ${item.id}`);
    rows.set(item.id, item.parameters as ActiveParameter[]);
  }
  if (rows.size !== windows.length || windows.some((window) => !rows.has(window.id))) throw new Error(`FLOWMUSIC_SEGMENT_COVERAGE_INVALID: ${artifact.actionId ?? "unknown"} must contain exactly one row per segment-plan window.`);
  return rows;
}

export function buildAutomationFlowmusicTimeline(input: {
  plan: FlowmusicInputArtifact;
  banks: FlowmusicInputArtifact[];
  audioName?: string;
  audioDurationSeconds?: number;
  assetId?: string;
  settings: Record<string, unknown>;
}): { data: Record<string, unknown>; segmentRefs: Array<{ id: string; startSeconds: number; endSeconds: number }> } {
  if (input.plan.kind !== "segment-plan" || input.plan.validity !== "valid") throw new Error("FLOWMUSIC_SEGMENT_PLAN_INVALID: a valid segment-plan artifact is required.");
  if (input.banks.length !== 2 || input.banks[0]?.actionId !== "audio.clap.resolved" || input.banks[1]?.actionId !== "spec.siglip.resolved") throw new Error("FLOWMUSIC_BANK_ORDER_INVALID: bind exactly CLAP first, then SigLIP.");
  const plan = object(input.plan.data);
  if (!Array.isArray(plan?.windows) || !plan.windows.length) throw new Error("FLOWMUSIC_SEGMENT_PLAN_INVALID: at least one window is required.");
  const windows: Array<{ id: string; startSeconds: number; endSeconds: number }> = [];
  const ids = new Set<string>();
  for (const window of plan.windows) {
    const item = object(window);
    if (!item || typeof item.id !== "string" || !item.id || typeof item.startSeconds !== "number" || !Number.isFinite(item.startSeconds) || typeof item.endSeconds !== "number" || !Number.isFinite(item.endSeconds) || item.startSeconds < 0 || item.endSeconds <= item.startSeconds || ids.has(item.id)) throw new Error("FLOWMUSIC_SEGMENT_PLAN_INVALID: windows need unique IDs and finite increasing bounds.");
    ids.add(item.id);
    windows.push({ id: item.id, startSeconds: item.startSeconds, endSeconds: item.endSeconds });
  }
  const clapRows = readSegmentBank(input.banks[0]!, windows);
  const siglipRows = readSegmentBank(input.banks[1]!, windows);
  const segments: AudioTimelineSegment[] = windows.map((window) => ({
    time: window.startSeconds, offset: window.startSeconds, duration: window.endSeconds - window.startSeconds,
    clap: clapRows.get(window.id)!, siglip: siglipRows.get(window.id)!,
  }));
  const audioDuration = Number(input.audioDurationSeconds ?? windows.at(-1)?.endSeconds ?? 0);
  const audioName = String(input.audioName ?? "").trim() || input.assetId || "audio";
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error("FLOWMUSIC_MISSING_AUDIO: audio duration must be positive.");
  const firstGap = windows.length > 1 ? windows[1]!.startSeconds - windows[0]!.startSeconds : 0;
  const rawInterval = firstGap > 0 ? firstGap : windows[0]!.endSeconds - windows[0]!.startSeconds;
  const nodeInterval = Math.max(rawInterval, ...windows.map((window) => window.endSeconds - window.startSeconds));
  const document = buildPriorityTimeline(segments, {
    audioName, audioDuration, rawInterval, nodeInterval,
    blend: input.settings.blend === true,
    clapWeight: Number(input.settings.clapWeight ?? 0.5),
    vocalMatrix: input.settings.vocalMatrix === true,
  }) as Record<string, unknown>;
  const issues = validateFlowmusicDocument(document);
  if (issues.length) throw new Error(`FLOWMUSIC_VALIDATION_FAILED: ${issues.join("; ")}`);
  return {
    data: {
      ...document,
      validation: { ok: true, mode: "schema" },
      sourcePlan: input.plan.artifactId ?? null,
      sourceBanks: input.banks.map((bank) => bank.artifactId ?? null),
    },
    segmentRefs: windows,
  };
}
