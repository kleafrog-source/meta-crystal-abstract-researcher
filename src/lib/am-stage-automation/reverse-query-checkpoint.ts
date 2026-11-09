import { parseReverseQueryOutput, REVERSE_QUERY_NORMALIZER_VERSION, REVERSE_QUERY_PROMPT_VERSION } from "@/lib/cross-modal/reverse-query";

type Checkpoint = Record<string, unknown> & {
  nodeKey: string;
  segmentId: string;
  inputFingerprint: string;
  attemptsUsed: number;
  elapsedMs?: number;
  requestDiagnostics?: Record<string, unknown>;
  lastError?: string;
  lastErrorDetails?: Record<string, unknown>;
  retryCycles?: Array<Record<string, unknown>>;
};

export function acceptSavedReverseQueryResponse(checkpoint: Checkpoint, inputFingerprint: string, acceptedAt = new Date().toISOString()) {
  const details = checkpoint.lastErrorDetails;
  const rawResponse = typeof details?.rawResponse === "string" ? details.rawResponse : "";
  if (checkpoint.status !== "failed" || checkpoint.nodeKey !== `text_features.reverse_query:${checkpoint.segmentId}`) throw new Error("Only a failed Reverse Query node can reuse a saved response.");
  if (!rawResponse) throw new Error(`No saved model response exists for ${checkpoint.segmentId}; retry the failed node to obtain one.`);
  const parsed = parseReverseQueryOutput(rawResponse);
  const modelRequest = details?.modelRequest && typeof details.modelRequest === "object" ? details.modelRequest as Record<string, unknown> : {};
  const sourceAttemptCount = Math.max(0, Number(checkpoint.attemptsUsed ?? 0));
  const accepted = {
    ...checkpoint,
    inputFingerprint,
    status: "succeeded",
    result: {
      ...parsed,
      provider: typeof modelRequest.provider === "string" ? modelRequest.provider : undefined,
      model: typeof modelRequest.actualModel === "string" ? modelRequest.actualModel : typeof modelRequest.requestedModel === "string" ? modelRequest.requestedModel : undefined,
      request_diagnostics: {
        ...checkpoint.requestDiagnostics,
        modelRequest,
        originalPromptRouteVersion: checkpoint.requestDiagnostics?.promptRouteVersion ?? modelRequest.promptRouteVersion,
        requestMessagesCaptured: Boolean(modelRequest.requestPayload),
      },
    },
    lastError: null,
    acceptedSavedResponse: {
      acceptedAt,
      acceptedByNormalizerVersion: REVERSE_QUERY_NORMALIZER_VERSION,
      currentPromptRouteVersion: REVERSE_QUERY_PROMPT_VERSION,
      sourcePromptRouteVersion: checkpoint.requestDiagnostics?.promptRouteVersion ?? modelRequest.promptRouteVersion ?? "unknown",
      sourceInputFingerprint: checkpoint.inputFingerprint,
      acceptedInputFingerprint: inputFingerprint,
      sourceAttemptCount,
      sourceRawResponseSha256: details?.rawResponseSha256 ?? null,
      requestMessagesCaptured: Boolean(modelRequest.requestPayload),
    },
    previousFailure: { message: checkpoint.lastError ?? "Previous parser rejected the response.", details },
  };
  return accepted;
}

export function beginNodeRetryCycle(checkpoint: Checkpoint, inputFingerprint: string, reason: string, startedAt = new Date().toISOString()) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 10) throw new Error("Enter a retry reason of at least 10 characters.");
  if (checkpoint.status !== "failed") throw new Error("Only a failed node can start a new retry cycle.");
  const priorCycles = Array.isArray(checkpoint.retryCycles) ? checkpoint.retryCycles : [];
  const cycleNumber = priorCycles.length + 2;
  const retryCycle = { cycleNumber, reason: cleanReason, startedAt, retryLimit: 4, promptRouteVersion: REVERSE_QUERY_PROMPT_VERSION, normalizerVersion: REVERSE_QUERY_NORMALIZER_VERSION, inputFingerprint };
  return {
    ...checkpoint,
    inputFingerprint,
    status: "failed",
    cycleAttemptsUsed: 0,
    cycleElapsedMs: 0,
    retryReason: cleanReason,
    retryCycles: [...priorCycles, retryCycle],
    currentRetryCycle: cycleNumber,
  };
}
