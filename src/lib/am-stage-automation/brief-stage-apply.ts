export type BriefSourceIdentity = {
  runId: string;
  stageId: string;
  attemptId: string;
  artifactId: string;
  actionId: "brief.combine_segment_texts";
  schemaVersion: 1;
  modality: "text";
};

export type BriefSelectionIdentity = Pick<BriefSourceIdentity, "runId" | "stageId" | "attemptId" | "artifactId">;

export type BriefImportState = {
  source: BriefSourceIdentity;
  appliedText: string;
  manuallyEdited: boolean;
  appliedSources: string[];
  operationReceipts: Record<string, string>;
};

export type BriefArtifactValidationInput = BriefSelectionIdentity & {
  runOwnerId: string;
  stageOwnerId: string;
  successfulAttemptId: string | null;
  artifactOwner: BriefSelectionIdentity;
  kind: string;
  schemaVersion: number;
  actionId: string;
  modality?: string;
  validity: string;
  data: unknown;
};

export type BriefArtifactContractInput = {
  artifactKind: string;
  payloadKind: string;
  payloadActionId: string;
  stageActionId: string;
  artifactBankId?: string | null;
  payloadBankId?: string | null;
  artifactModality?: string | null;
  payloadModality?: string | null;
  artifactPass?: string | null;
  payloadPass?: string | null;
  artifactValidity?: string | null;
  payloadValidity?: string | null;
};

export type BriefApplyResult =
  | { kind: "applied"; text: string; metadata: BriefImportState; textChanged: boolean }
  | { kind: "noop"; text: string; metadata: BriefImportState | null }
  | { kind: "confirmation-required" };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function briefSourceKey(source: Pick<BriefSourceIdentity, "runId" | "stageId" | "attemptId" | "artifactId">): string {
  return JSON.stringify([source.runId, source.stageId, source.attemptId, source.artifactId]);
}

export function isCurrentBriefSelection(expected: BriefSelectionIdentity, current: BriefSelectionIdentity): boolean {
  return expected.runId === current.runId && expected.stageId === current.stageId && expected.attemptId === current.attemptId && expected.artifactId === current.artifactId;
}

export function briefArtifactContractConsistent(input: BriefArtifactContractInput): boolean {
  return input.payloadKind === input.artifactKind && input.payloadActionId === input.stageActionId &&
    (input.payloadBankId ?? null) === (input.artifactBankId ?? null) &&
    (input.payloadModality ?? null) === (input.artifactModality ?? null) &&
    (input.payloadPass ?? null) === (input.artifactPass ?? null) &&
    (input.payloadValidity ?? null) === (input.artifactValidity ?? null);
}

export function validateBriefArtifact(input: BriefArtifactValidationInput): { ok: true } | { ok: false; reason: string } {
  if (!input.runId || !input.stageId || !input.attemptId || !input.artifactId) return { ok: false, reason: "artifact selection is incomplete" };
  if (input.runOwnerId !== input.runId || input.stageOwnerId !== input.stageId) return { ok: false, reason: "run or stage ownership mismatch" };
  if (input.artifactOwner.runId !== input.runId || input.artifactOwner.stageId !== input.stageId || input.artifactOwner.attemptId !== input.attemptId || input.artifactOwner.artifactId !== input.artifactId) return { ok: false, reason: "artifact ownership mismatch" };
  if (input.attemptId !== input.successfulAttemptId) return { ok: false, reason: "artifact is not from the successful attempt" };
  if (input.schemaVersion !== 1) return { ok: false, reason: "unsupported artifact schema" };
  if (input.kind !== "brief") return { ok: false, reason: "unsupported artifact kind" };
  if (input.actionId !== "brief.combine_segment_texts") return { ok: false, reason: "unsupported Brief producer" };
  if (input.modality !== "text") return { ok: false, reason: "unsupported Brief modality" };
  if (input.validity !== "valid") return { ok: false, reason: "artifact is not valid" };
  const data = asRecord(input.data);
  if (!data || typeof data.text !== "string" || !data.text.trim()) return { ok: false, reason: "artifact Brief text is empty or malformed" };
  return { ok: true };
}

export function markBriefManualEdit(state: BriefImportState | null): BriefImportState | null {
  return state && !state.manuallyEdited ? { ...state, manuallyEdited: true } : state;
}

export function applyBriefArtifact(
  state: BriefImportState | null,
  currentText: string,
  incomingText: string,
  source: BriefSourceIdentity,
  operationId: string,
  mode: "ordinary" | "confirmed-replace",
): BriefApplyResult {
  const sourceKey = briefSourceKey(source);
  const priorOperationSource = state?.operationReceipts[operationId];
  if (priorOperationSource) {
    if (priorOperationSource !== sourceKey) throw new Error("OPERATION_ID_PAYLOAD_MISMATCH");
    return { kind: "noop", text: currentText, metadata: state };
  }

  const alreadyApplied = state?.appliedSources.includes(sourceKey) ?? false;
  if (alreadyApplied && mode === "ordinary") return { kind: "noop", text: currentText, metadata: state };

  const textChanged = currentText !== incomingText;
  if (textChanged && currentText.trim() && mode === "ordinary") return { kind: "confirmation-required" };

  const metadata: BriefImportState = {
    source: { ...source, actionId: "brief.combine_segment_texts", schemaVersion: 1, modality: "text" },
    appliedText: incomingText,
    manuallyEdited: false,
    appliedSources: alreadyApplied ? state!.appliedSources : [...(state?.appliedSources ?? []), sourceKey],
    operationReceipts: { ...(state?.operationReceipts ?? {}), [operationId]: sourceKey },
  };
  return { kind: "applied", text: textChanged ? incomingText : currentText, metadata, textChanged };
}

export function restoreBriefImportState(value: unknown): BriefImportState | null {
  const metadata = asRecord(value);
  const source = asRecord(metadata?.source);
  if (!metadata || !source || typeof metadata.appliedText !== "string" || typeof metadata.manuallyEdited !== "boolean") return null;
  if (typeof source.runId !== "string" || typeof source.stageId !== "string" || typeof source.attemptId !== "string" || typeof source.artifactId !== "string" || source.actionId !== "brief.combine_segment_texts" || source.schemaVersion !== 1 || source.modality !== "text") return null;
  const appliedSources = Array.isArray(metadata.appliedSources) ? metadata.appliedSources.filter((item): item is string => typeof item === "string") : [];
  const receipts = asRecord(metadata.operationReceipts);
  return {
    source: source as BriefSourceIdentity,
    appliedText: metadata.appliedText,
    manuallyEdited: metadata.manuallyEdited,
    appliedSources,
    operationReceipts: Object.fromEntries(Object.entries(receipts ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  };
}

export function briefImportStateForSnapshot(state: BriefImportState | null): BriefImportState | undefined {
  return state ?? undefined;
}
