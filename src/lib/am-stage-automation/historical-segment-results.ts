import type { ActiveParameter } from "@/lib/rag-v3/types";

export interface HistoricalSegmentResult {
  id: string;
  startSeconds: number;
  endSeconds: number;
  banks: { gemmaAudio: ActiveParameter[]; gemmaAudioAwtd: ActiveParameter[]; gemmaAudioResolved: ActiveParameter[]; clap: ActiveParameter[]; siglip: ActiveParameter[] };
  reverseQuery?: { en?: string; ru?: string };
  interpretation?: { en?: string; ru?: string };
  audioDescriptions: Array<{
    sourceActionId: "audio.describe_segments.lfm3" | "audio.describe_gaps.lfm3";
    artifactId: string | null;
    text: string;
    language?: string;
    targetRange?: { startSeconds: number; endSeconds: number };
    evidenceRange?: { startSeconds: number; endSeconds: number };
    semantics?: string;
  }>;
}

export type HistoricalClientStage2Parameter = ActiveParameter & {
  automation_segment: string;
  consensus_frame: string;
};

export function projectHistoricalClientStage2(data: unknown): HistoricalClientStage2Parameter[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const parameter = asObject(item);
    if (!parameter || typeof parameter.technical_name !== "string"
      || typeof parameter.automation_segment !== "string" || typeof parameter.consensus_frame !== "string") return [];
    return [parameter as unknown as HistoricalClientStage2Parameter];
  });
}

type RunStageArtifact = { stageId: string; actionId: string; successfulAttemptId?: string | null; artifacts?: Array<{ id?: string; attemptId?: string; payload?: { data?: unknown } }> };
const asObject = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const successfulArtifacts = (stage: RunStageArtifact) => stage.successfulAttemptId === undefined
  ? stage.artifacts ?? []
  : stage.successfulAttemptId
    ? (stage.artifacts ?? []).filter((artifact) => artifact.attemptId === stage.successfulAttemptId)
    : [];
const asRange = (value: unknown): { startSeconds: number; endSeconds: number } | undefined => {
  const range = asObject(value);
  return range && Number.isFinite(range.startSeconds) && Number.isFinite(range.endSeconds) && Number(range.endSeconds) > Number(range.startSeconds)
    ? { startSeconds: Number(range.startSeconds), endSeconds: Number(range.endSeconds) }
    : undefined;
};

export function projectHistoricalAudioText(actionId: string, data: unknown): { text: string; model?: string; runtime?: string } | null {
  if (actionId !== "audio.describe.lfm3" && actionId !== "audio.transcribe.lfm3") return null;
  const artifact = asObject(data);
  if (typeof artifact?.text !== "string" || !artifact.text.trim()) return null;
  return {
    text: artifact.text,
    ...(typeof artifact.model === "string" ? { model: artifact.model } : {}),
    ...(typeof artifact.runtime === "string" ? { runtime: artifact.runtime } : {}),
  };
}

export function extractStageBankParameters(data: unknown, segmentId?: string): ActiveParameter[] {
  if (Array.isArray(data)) return data as ActiveParameter[];
  const artifact = asObject(data);
  if (Array.isArray(artifact?.parameters)) return artifact.parameters as ActiveParameter[];
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
  const plan = asObject(planStage ? successfulArtifacts(planStage)[0]?.payload?.data : undefined);
  const windows = Array.isArray(plan?.windows) ? plan.windows : [];
  const results = new Map<string, HistoricalSegmentResult>();
  for (const item of windows) {
    const window = asObject(item);
    if (typeof window?.id !== "string" || !Number.isFinite(window.startSeconds) || !Number.isFinite(window.endSeconds)) continue;
    const id = window.id;
    results.set(id, { id, startSeconds: Number(window.startSeconds), endSeconds: Number(window.endSeconds), banks: { gemmaAudio: [], gemmaAudioAwtd: [], gemmaAudioResolved: [], clap: [], siglip: [] }, audioDescriptions: [] });
  }
  const setParams = (target: ActiveParameter[], value: unknown) => {
    if (Array.isArray(value)) target.push(...value as ActiveParameter[]);
  };
  for (const stage of stages) {
    for (const artifact of successfulArtifacts(stage)) {
      const data = asObject(artifact.payload?.data);
      if (!Array.isArray(data?.segments)) continue;
      for (const entry of data.segments) {
        const segment = asObject(entry);
        if (typeof segment?.id !== "string") continue;
        const target = results.get(segment.id);
        if (!target) continue;
        if (stage.actionId === "audio.gemma.awtd") {
          setParams(target.banks.gemmaAudio, segment.parameters);
          setParams(target.banks.gemmaAudioAwtd, segment.parameters);
        }
        if (stage.actionId === "audio.gemma.resolved") {
          setParams(target.banks.gemmaAudio, segment.parameters);
          setParams(target.banks.gemmaAudioResolved, segment.parameters);
        }
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
        if (stage.actionId === "audio.describe_segments.lfm3" && typeof segment.text === "string" && segment.text.trim()) {
          target.audioDescriptions.push({ sourceActionId: stage.actionId, artifactId: artifact.id ?? null, text: segment.text, ...(typeof segment.language === "string" ? { language: segment.language } : {}) });
        }
        if (stage.actionId === "audio.describe_gaps.lfm3" && segment.status === "gap_described" && typeof result?.text === "string" && result.text.trim()) {
          const targetRange = asRange(segment.targetRange);
          const evidenceRange = asRange(segment.sentAudioRange);
          target.audioDescriptions.push({
            sourceActionId: stage.actionId,
            artifactId: artifact.id ?? null,
            text: result.text,
            ...(targetRange ? { targetRange } : {}),
            ...(evidenceRange ? { evidenceRange } : {}),
            ...(typeof data.semantics === "string" ? { semantics: data.semantics } : {}),
          });
        }
      }
    }
  }
  return [...results.values()].sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id));
}
