import type { ActiveParameter } from "@/lib/rag-v3/types";

export type QwenSourceIdentity = { runId: string; stageId: string; attemptId: string; artifactId: string; bankId: "qwen-text"; pass: "resolved" };
export type QwenSelectionIdentity = Pick<QwenSourceIdentity, "runId" | "stageId" | "attemptId" | "artifactId">;
export type QwenArtifactPayload = { schemaVersion: number; kind: string; actionId: string; bankId?: string; pass?: string; validity?: string; data?: unknown };
export type QwenSessionState = {
  parameters: Array<Pick<ActiveParameter, "technical_name"> & Partial<ActiveParameter>>;
  manualNames: string[];
  tombstones: string[];
  provenance: Record<string, QwenSourceIdentity>;
  appliedSources: string[];
  operationReceipts: Record<string, string>;
};

export function qwenSourceKey(source: QwenSourceIdentity): string {
  return JSON.stringify([source.runId, source.stageId, source.attemptId, source.artifactId, "qwen3"]);
}

export function replaceQwenBank<T extends { qwen3: ActiveParameter[] }>(banks: T, state: QwenSessionState): T {
  return { ...banks, qwen3: state.parameters as ActiveParameter[] };
}

export function isCurrentQwenSelection(expected: QwenSelectionIdentity, current: QwenSelectionIdentity): boolean {
  return expected.runId === current.runId && expected.stageId === current.stageId && expected.attemptId === current.attemptId && expected.artifactId === current.artifactId;
}

export function validateQwenArtifact(input: {
  runId: string; stageId: string; attemptId: string; artifactId: string;
  selectedArtifactId: string; successfulAttemptId: string | null;
  artifactOwner: { runId: string; stageId: string; attemptId: string; artifactId: string };
  artifact: QwenArtifactPayload & { data?: unknown };
}): { ok: true } | { ok: false; reason: string } {
  if (input.artifactId !== input.selectedArtifactId) return { ok: false, reason: "selected artifact mismatch" };
  if (input.artifactOwner.runId !== input.runId || input.artifactOwner.stageId !== input.stageId || input.artifactOwner.attemptId !== input.attemptId || input.artifactOwner.artifactId !== input.artifactId) return { ok: false, reason: "artifact ownership mismatch" };
  if (input.attemptId !== input.successfulAttemptId) return { ok: false, reason: "artifact is not from the successful attempt" };
  const artifact = input.artifact;
  if (artifact.schemaVersion !== 1) return { ok: false, reason: "unsupported artifact schema" };
  if (artifact.kind !== "parameter-bank") return { ok: false, reason: "unsupported artifact kind" };
  if (artifact.actionId !== "text.qwen.resolved" || artifact.bankId !== "qwen-text" || artifact.pass !== "resolved") return { ok: false, reason: "artifact does not target Qwen resolved bank" };
  if (artifact.validity !== "valid") return { ok: false, reason: "artifact is not valid" };
  if (!Array.isArray(artifact.data)) return { ok: false, reason: "artifact data is not a parameter array" };
  if (artifact.data.some((item) => !item || typeof item !== "object" || typeof (item as { technical_name?: unknown }).technical_name !== "string" || !(item as { technical_name: string }).technical_name)) return { ok: false, reason: "artifact contains an invalid parameter" };
  if (!input.runId || !input.stageId || !input.attemptId) return { ok: false, reason: "artifact ownership is incomplete" };
  return { ok: true };
}

export function applyQwenArtifact(
  state: QwenSessionState,
  incoming: ActiveParameter[],
  source: QwenSourceIdentity,
  operationId: string,
  options: { reapply?: boolean } = {},
): QwenSessionState {
  const sourceKey = qwenSourceKey(source);
  const priorOperationSource = state.operationReceipts[operationId];
  if (priorOperationSource) {
    if (priorOperationSource !== sourceKey) throw new Error("OPERATION_ID_PAYLOAD_MISMATCH");
    return state;
  }
  if (state.appliedSources.includes(sourceKey) && !options.reapply) {
    return { ...state, operationReceipts: { ...state.operationReceipts, [operationId]: sourceKey } };
  }
  const names = new Set(state.parameters.map((item) => item.technical_name));
  const tombstones = new Set(state.tombstones);
  const additions = incoming.filter((item) => item && typeof item.technical_name === "string" && item.technical_name && !names.has(item.technical_name) && !tombstones.has(item.technical_name));
  const provenance = { ...state.provenance };
  for (const item of additions) provenance[item.technical_name] = source;
  return {
    ...state,
    parameters: [...state.parameters, ...additions],
    provenance,
    appliedSources: state.appliedSources.includes(sourceKey) ? state.appliedSources : [...state.appliedSources, sourceKey],
    operationReceipts: { ...state.operationReceipts, [operationId]: sourceKey },
  };
}

export function markQwenManual(state: QwenSessionState, technicalName: string, value?: number | string): QwenSessionState {
  return {
    ...state,
    parameters: value === undefined ? state.parameters : state.parameters.map((parameter) => parameter.technical_name === technicalName ? { ...parameter, current_value: value, suggested_value: value } : parameter),
    manualNames: [...new Set([...state.manualNames, technicalName])],
  };
}

export function removeQwenParameter(state: QwenSessionState, technicalName: string): QwenSessionState {
  return { ...state, parameters: state.parameters.filter((item) => item.technical_name !== technicalName), tombstones: [...new Set([...state.tombstones, technicalName])], manualNames: state.manualNames.filter((name) => name !== technicalName), provenance: Object.fromEntries(Object.entries(state.provenance).filter(([name]) => name !== technicalName)) };
}

export function restoreQwenSessionState(parameters: ActiveParameter[], metadata?: Partial<QwenSessionState> | null): QwenSessionState {
  return { parameters, manualNames: metadata?.manualNames ?? [], tombstones: metadata?.tombstones ?? [], provenance: metadata?.provenance ?? {}, appliedSources: metadata?.appliedSources ?? [], operationReceipts: metadata?.operationReceipts ?? {} };
}

export function qwenSessionMetadataForSnapshot(state: QwenSessionState) {
  return { manual_names: state.manualNames, tombstones: state.tombstones, provenance: state.provenance, applied_sources: state.appliedSources, operation_receipts: state.operationReceipts };
}

export function restoreQwenMetadataFromSnapshot(parameters: ActiveParameter[], metadata?: { manual_names?: string[]; tombstones?: string[]; provenance?: Record<string, QwenSourceIdentity>; applied_sources?: string[]; operation_receipts?: Record<string, string> } | null): QwenSessionState {
  return restoreQwenSessionState(parameters, metadata ? { manualNames: metadata.manual_names, tombstones: metadata.tombstones, provenance: metadata.provenance, appliedSources: metadata.applied_sources, operationReceipts: metadata.operation_receipts } : null);
}
