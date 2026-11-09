import { createHash } from "node:crypto";
import { NodeRequestError, withNodeRetries } from "./node-retry";
import { selectTextLlmSegments, type SegmentWindow } from "./segment-sampling";

export interface SegmentTextCheckpoint {
  [key: string]: unknown;
  schema: "automation_node_checkpoint_v1";
  nodeKey: string;
  segmentId: string;
  inputFingerprint: string;
  status: "retrying" | "succeeded" | "failed" | "stopped";
  attemptsUsed: number;
  elapsedMs: number;
  lastError?: string | null;
  waitMs?: number | null;
  requestDiagnostics: { nodeId: string; inputArtifactId: string | null; promptRouteVersion: string; payloadSha256: string; payloadBytes: number; credentialsPersisted: false };
  result?: unknown;
}

export async function executeSegmentTextNodes<T extends SegmentWindow, R>(options: {
  actionId: string;
  segments: readonly T[];
  sampleLimit: number;
  priorCheckpoints: readonly Record<string, unknown>[];
  inputArtifactId: string | null;
  promptRouteVersion: string;
  payloadFor: (segment: T) => unknown;
  request: (segment: T, payload: unknown, signal: AbortSignal) => Promise<R>;
  signal: AbortSignal;
  persist: (checkpoint: SegmentTextCheckpoint) => Promise<void>;
  progress: (event: Record<string, unknown>) => Promise<void>;
}): Promise<{ limit: number; selected: T[]; skipped: T[]; results: Array<{ id: string; startSeconds: number; endSeconds: number; status: "succeeded" | "not_selected"; result?: R }> }> {
  const selection = selectTextLlmSegments(options.segments, options.sampleLimit);
  const results: Array<{ id: string; startSeconds: number; endSeconds: number; status: "succeeded" | "not_selected"; result?: R }> = selection.skipped.map((segment) => ({ id: segment.id, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, status: "not_selected" }));
  for (let index = 0; index < selection.selected.length; index += 1) {
    const segment = selection.selected[index];
    if (options.signal.aborted) throw new DOMException("Automation stopped", "AbortError");
    const nodeKey = `${options.actionId}:${segment.id}`;
    const payload = options.payloadFor(segment);
    const serialized = JSON.stringify(payload);
    const inputFingerprint = createHash("sha256").update(JSON.stringify({ actionId: options.actionId, payload, promptRouteVersion: options.promptRouteVersion })).digest("hex");
    const requestDiagnostics = { nodeId: segment.id, inputArtifactId: options.inputArtifactId, promptRouteVersion: options.promptRouteVersion, payloadSha256: createHash("sha256").update(serialized).digest("hex"), payloadBytes: Buffer.byteLength(serialized, "utf8"), credentialsPersisted: false as const };
    const saved = options.priorCheckpoints.filter((item) => item.nodeKey === nodeKey && item.inputFingerprint === inputFingerprint && item.status === "succeeded").slice(-1)[0];
    if (saved) {
      results.push({ id: segment.id, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, status: "succeeded", result: saved.result as R });
      await options.progress({ phase: options.actionId, nodeId: segment.id, current: index + 1, total: selection.selected.length, reusedCheckpoint: true });
      continue;
    }
    const previous = options.priorCheckpoints.filter((item) => item.nodeKey === nodeKey && item.inputFingerprint === inputFingerprint).slice(-1)[0];
    let attemptsUsed = Math.max(0, Number(previous?.attemptsUsed ?? 0));
    let cycleAttemptsUsed = Math.max(0, Number(previous?.cycleAttemptsUsed ?? attemptsUsed));
    const totalAttemptsBeforeCycle = Math.max(0, attemptsUsed - cycleAttemptsUsed);
    const elapsedMs = Math.max(0, Number(previous?.elapsedMs ?? 0));
    let cycleElapsedMs = Math.max(0, Number(previous?.cycleElapsedMs ?? elapsedMs));
    const totalElapsedBeforeCycle = Math.max(0, elapsedMs - cycleElapsedMs);
    const retryErrors = Array.isArray(previous?.retryErrors) ? [...previous.retryErrors] : [];
    if (cycleAttemptsUsed >= 4 || cycleElapsedMs >= 180_000) throw new NodeRequestError(`Node ${segment.id} exhausted its persisted retry budget (cycle ${String(previous?.currentRetryCycle ?? 1)}: ${cycleAttemptsUsed}/4 attempts). Continue reuses saved nodes; choose the explicit retry action to open a new finite cycle.`, undefined, undefined, "invalid");
    const nodeStartedAt = Date.now();
    let latestAttempt = attemptsUsed;
    const persist = (patch: Partial<SegmentTextCheckpoint>) => {
      const cycleElapsedNow = cycleElapsedMs + Date.now() - nodeStartedAt;
      return options.persist({
        ...previous,
        schema: "automation_node_checkpoint_v1", nodeKey, segmentId: segment.id, inputFingerprint, requestDiagnostics,
        status: "retrying", attemptsUsed, cycleAttemptsUsed, ...patch,
        elapsedMs: totalElapsedBeforeCycle + cycleElapsedNow,
        cycleElapsedMs: cycleElapsedNow,
      });
    };
    await options.progress({ phase: options.actionId, nodeId: segment.id, current: index + 1, total: selection.selected.length, attempt: cycleAttemptsUsed + 1, totalAttempts: attemptsUsed + 1, retryLimit: 4, retryCycle: previous?.currentRetryCycle ?? 1 });
    try {
      const result = await withNodeRetries((signal) => options.request(segment, payload, signal), {
        signal: options.signal, maxAttempts: 4, initialAttempts: cycleAttemptsUsed, initialElapsedMs: cycleElapsedMs,
        maxElapsedMs: 180_000, perAttemptTimeoutMs: 45_000,
        onAttempt: async (attempt) => { cycleAttemptsUsed = attempt; latestAttempt = totalAttemptsBeforeCycle + attempt; attemptsUsed = latestAttempt; await persist({ status: "retrying", attemptsUsed, cycleAttemptsUsed: attempt }); await options.progress({ phase: options.actionId, nodeId: segment.id, current: index + 1, total: selection.selected.length, attempt, totalAttempts: latestAttempt, retryLimit: 4, retryCycle: previous?.currentRetryCycle ?? 1 }); },
        onRetry: async ({ nextAttempt, waitMs, message, error }) => {
          const errorDetails = error instanceof NodeRequestError ? error.diagnostics : undefined;
          retryErrors.push({ attempt: nextAttempt - 1, message, ...(errorDetails ? { details: errorDetails } : {}) });
          const cycleUsed = nextAttempt - 1;
          const totalUsed = totalAttemptsBeforeCycle + cycleUsed;
          attemptsUsed = totalUsed;
          cycleAttemptsUsed = cycleUsed;
          await persist({ status: "retrying", attemptsUsed: totalUsed, cycleAttemptsUsed: cycleUsed, lastError: message, ...(errorDetails ? { lastErrorDetails: errorDetails } : {}), retryErrors, waitMs });
          await options.progress({ phase: "retry_wait", actionId: options.actionId, nodeId: segment.id, current: index + 1, total: selection.selected.length, attempt: nextAttempt, totalAttempts: totalUsed, retryLimit: 4, retryCycle: previous?.currentRetryCycle ?? 1, waitMs, lastError: message });
        },
      });
      await persist({ status: "succeeded", attemptsUsed: latestAttempt, result, lastError: null, retryErrors, waitMs: null });
      results.push({ id: segment.id, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, status: "succeeded", result });
    } catch (error) {
      await persist({ status: options.signal.aborted ? "stopped" : "failed", attemptsUsed: latestAttempt, lastError: error instanceof Error ? error.message : String(error), retryErrors, ...(error instanceof NodeRequestError && error.diagnostics ? { lastErrorDetails: error.diagnostics } : {}) });
      throw error;
    }
  }
  results.sort((a, b) => options.segments.findIndex((item) => item.id === a.id) - options.segments.findIndex((item) => item.id === b.id));
  return { limit: selection.limit, selected: selection.selected, skipped: selection.skipped, results };
}
