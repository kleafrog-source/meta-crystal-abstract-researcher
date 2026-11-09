import type { ActiveParameter } from "@/lib/rag-v3/types";

export interface HistoricalSegmentResult {
  id: string;
  startSeconds: number;
  endSeconds: number;
  banks: { gemmaAudio: ActiveParameter[]; clap: ActiveParameter[]; siglip: ActiveParameter[] };
  reverseQuery?: { en?: string; ru?: string };
  interpretation?: { en?: string; ru?: string };
}

type RunStageArtifact = { stageId: string; actionId: string; artifacts?: Array<{ payload?: { data?: unknown } }> };
const asObject = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function extractStageBankParameters(data: unknown, segmentId?: string): ActiveParameter[] {
  if (Array.isArray(data)) return data as ActiveParameter[];
  const artifact = asObject(data);
  if (Array.isArray(artifact?.stage2_hits)) return artifact.stage2_hits as ActiveParameter[];
  if (!Array.isArray(artifact?.segments)) return [];
  const parameters: ActiveParameter[] = [];
  for (const item of artifact.segments) {
    const segment = asObject(item);
    if (!segment || (segmentId && segment.id !== segmentId) || !Array.isArray(segment.parameters)) continue;
    const startSeconds = Number(segment.startSeconds);
    const endSeconds = Number(segment.endSeconds);
    for (const parameter of segment.parameters) {
      const value = asObject(parameter);
      if (!value || typeof value.technical_name !== "string") continue;
      const sourceWindow = Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds > startSeconds
        ? { offset_seconds: startSeconds, duration_seconds: endSeconds - startSeconds }
        : undefined;
      parameters.push({
        ...value,
        ...(sourceWindow ? { source_window: sourceWindow } : {}),
      } as ActiveParameter);
    }
  }
  return parameters;
}

export function collectHistoricalSegmentResults(stages: RunStageArtifact[]): HistoricalSegmentResult[] {
  const planStage = stages.find((stage) => stage.actionId === "audio.segment");
  const plan = asObject(planStage?.artifacts?.[0]?.payload?.data);
  const windows = Array.isArray(plan?.windows) ? plan.windows : [];
  const results = new Map<string, HistoricalSegmentResult>();
  for (const item of windows) {
    const window = asObject(item);
    if (typeof window?.id !== "string" || !Number.isFinite(window.startSeconds) || !Number.isFinite(window.endSeconds)) continue;
    const id = window.id;
    results.set(id, { id, startSeconds: Number(window.startSeconds), endSeconds: Number(window.endSeconds), banks: { gemmaAudio: [], clap: [], siglip: [] } });
  }
  const setParams = (target: ActiveParameter[], value: unknown) => {
    if (Array.isArray(value)) target.push(...value as ActiveParameter[]);
  };
  for (const stage of stages) {
    const data = asObject(stage.artifacts?.[0]?.payload?.data);
    if (!Array.isArray(data?.segments)) continue;
    for (const entry of data.segments) {
      const segment = asObject(entry);
      if (typeof segment?.id !== "string") continue;
      const target = results.get(segment.id);
      if (!target) continue;
      if (stage.actionId === "audio.gemma.awtd" || stage.actionId === "audio.gemma.resolved") setParams(target.banks.gemmaAudio, segment.parameters);
      if (stage.actionId === "audio.clap.resolved") setParams(target.banks.clap, segment.parameters);
      if (stage.actionId === "spec.siglip.resolved") setParams(target.banks.siglip, segment.parameters);
      const result = asObject(segment.result);
      if (stage.actionId === "text_features.reverse_query") {
        const reverse = asObject(result?.reverse_query);
        if (typeof reverse?.query_en === "string" || typeof reverse?.query_ru === "string") target.reverseQuery = { en: typeof reverse.query_en === "string" ? reverse.query_en : undefined, ru: typeof reverse.query_ru === "string" ? reverse.query_ru : undefined };
      }
      if (stage.actionId === "text_features.describe_llm" && (typeof result?.description_natural_en === "string" || typeof result?.description_natural_ru === "string")) {
        target.interpretation = { en: typeof result.description_natural_en === "string" ? result.description_natural_en : undefined, ru: typeof result.description_natural_ru === "string" ? result.description_natural_ru : undefined };
      }
    }
  }
  return [...results.values()].sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id));
}
