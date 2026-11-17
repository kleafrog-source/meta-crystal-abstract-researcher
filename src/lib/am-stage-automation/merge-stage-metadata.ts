export const MERGE_APPLY_POLICY = "add_missing_preserve_existing_v1" as const;
export const STAGE_APPLY_ACTION_IDS = ["data.merge", "data.intersection", "data.difference", "data.filter", "data.split", "data.select", "flow.join", "stage2.server", "vocal_allocation.search"] as const;
export function isStageApplyAction(actionId: string): actionId is typeof STAGE_APPLY_ACTION_IDS[number] {
  return STAGE_APPLY_ACTION_IDS.includes(actionId as typeof STAGE_APPLY_ACTION_IDS[number]);
}

export function stageArtifactMetadataConsistent(input: { artifactKind?: string | null; payloadKind?: string | null; payloadActionId?: string | null; stageActionId: string; artifactBankId?: string | null; payloadBankId?: string | null; artifactModality?: string | null; payloadModality?: string | null; artifactPass?: string | null; payloadPass?: string | null; artifactValidity?: string | null; payloadValidity?: string | null }): boolean {
  return input.artifactKind === input.payloadKind
    && input.payloadActionId === input.stageActionId
    && (input.artifactBankId ?? null) === (input.payloadBankId ?? null)
    && (input.artifactModality ?? null) === (input.payloadModality ?? null)
    && (input.artifactPass ?? null) === (input.payloadPass ?? null)
    && input.artifactValidity === input.payloadValidity;
}

export type MergeSource = {
  runId: string;
  stageId: string;
  attemptId: string;
  artifactId: string;
  actionId: "data.merge" | "data.intersection" | "data.difference" | "data.filter" | "data.split" | "data.select" | "flow.join" | "stage2.server" | "vocal_allocation.search";
  schemaVersion: 1;
  kind: "parameter-bank";
  bankId: string | null;
  pass: string | null;
  relatedArtifactIds?: string[];
  outputPort?: string;
};

export type WinningSource = {
  sourceArtifactId: string;
  sourceActionId: "text.qwen.resolved" | "text.gemma.awtd" | "text.gemma.resolved" | "audio.clap.resolved" | "spec.siglip.resolved" | "audio.gemma.awtd" | "audio.gemma.resolved" | "stage2.client" | "stage2.server" | "data.filter" | "data.select" | "data.split" | "flow.if" | "flow.router" | "flow.join" | "data.merge" | "data.intersection" | "data.difference" | "vocal_allocation.search";
};

export type MergeOperationReceipt = {
  operationId: string;
  idempotencyKey: string;
  source: MergeSource;
  target: "v3.active_parameters";
  policy: typeof MERGE_APPLY_POLICY;
  requestedRevision: string;
  resultingRevision: string;
  counts: { added: number; updated: number; skipped: number };
  appliedAt: string;
};

export type MergeImportState = {
  schema: "am_stage_merge_import_v1";
  tombstones: string[];
  provenance: Record<string, {
    source: MergeSource;
    winningSource: WinningSource;
    status: "applied" | "manually_modified" | "removed";
  }>;
  applied_sources: MergeSource[];
  operation_receipts: Record<string, MergeOperationReceipt>;
};

type ObjectRecord = Record<string, unknown>;
const isObject = (value: unknown): value is ObjectRecord => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function restoreMergeImportState(value: unknown): MergeImportState | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value) || value.schema !== "am_stage_merge_import_v1" || !Array.isArray(value.tombstones) || !value.tombstones.every((item) => typeof item === "string") || new Set(value.tombstones).size !== value.tombstones.length || !isObject(value.provenance) || !Array.isArray(value.applied_sources) || !value.applied_sources.every(isMergeSource) || !isObject(value.operation_receipts)) throw new Error("Invalid v3.merge_import metadata.");
  for (const [name, entry] of Object.entries(value.provenance)) if (!name || !isObject(entry) || !isMergeSource(entry.source) || !isWinningSource(entry.winningSource) || !["applied", "manually_modified", "removed"].includes(String(entry.status))) throw new Error("Invalid v3.merge_import provenance.");
  for (const name of value.tombstones as string[]) if (!isObject(value.provenance[name]) || (value.provenance[name] as ObjectRecord).status !== "removed") throw new Error("Invalid v3.merge_import tombstone.");
  for (const [id, receipt] of Object.entries(value.operation_receipts)) if (!id || !isObject(receipt) || receipt.operationId !== id || typeof receipt.idempotencyKey !== "string" || !/^[a-f0-9]{64}$/u.test(receipt.idempotencyKey) || !isMergeSource(receipt.source) || receipt.target !== "v3.active_parameters" || receipt.policy !== MERGE_APPLY_POLICY || typeof receipt.requestedRevision !== "string" || typeof receipt.resultingRevision !== "string" || typeof receipt.appliedAt !== "string" || !isObject(receipt.counts) || ![receipt.counts.added, receipt.counts.updated, receipt.counts.skipped].every((count) => Number.isInteger(count) && Number(count) >= 0)) throw new Error("Invalid v3.merge_import operation receipt.");
  return value as unknown as MergeImportState;
}

function isMergeSource(value: unknown): value is MergeSource {
  if (!isObject(value) || ![value.runId, value.stageId, value.attemptId, value.artifactId].every((item) => typeof item === "string" && item.length > 0) || value.schemaVersion !== 1 || value.kind !== "parameter-bank") return false;
  if (value.relatedArtifactIds !== undefined && (!Array.isArray(value.relatedArtifactIds) || !value.relatedArtifactIds.every((item) => typeof item === "string" && item.length > 0) || new Set(value.relatedArtifactIds).size !== value.relatedArtifactIds.length)) return false;
  if (value.outputPort !== undefined && (typeof value.outputPort !== "string" || !value.outputPort)) return false;
  return value.actionId === "data.merge" && value.bankId === "merged" && value.pass === "merge"
    || value.actionId === "data.intersection" && value.bankId === "intersection" && value.pass === "intersection"
    || value.actionId === "data.difference" && value.bankId === "difference" && value.pass === "difference"
    || value.actionId === "data.filter" && (value.bankId === null || typeof value.bankId === "string") && (value.pass === null || typeof value.pass === "string")
    || value.actionId === "data.split" && typeof value.outputPort === "string" && value.outputPort.length > 0 && (value.bankId === null || typeof value.bankId === "string") && (value.pass === null || typeof value.pass === "string")
    || value.actionId === "data.select" && value.bankId === null && value.pass === null
    || value.actionId === "flow.join" && value.bankId === null && value.pass === null
    || value.actionId === "stage2.server" && value.bankId === "server-stage2" && value.pass === "stage2"
    || value.actionId === "vocal_allocation.search" && value.bankId === "vocal-allocation" && value.pass === "explicit-assignments";
}

function isWinningSource(value: unknown): value is WinningSource {
  return isObject(value) && typeof value.sourceArtifactId === "string" && value.sourceArtifactId.length > 0 && ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server", "data.filter", "data.select", "data.split", "flow.if", "flow.router", "flow.join", "data.merge", "data.intersection", "data.difference", "vocal_allocation.search"].includes(String(value.sourceActionId));
}
