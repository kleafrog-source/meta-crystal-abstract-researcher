import { describe, expect, it } from "vitest";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { applyQwenArtifact, isCurrentQwenSelection, markQwenManual, qwenSessionMetadataForSnapshot, qwenSourceKey, removeQwenParameter, restoreQwenMetadataFromSnapshot, validateQwenArtifact } from "./qwen-stage-apply";

const param = (technical_name: string, current_value: string): ActiveParameter => ({
  technical_name, current_value, suggested_value: current_value, default: current_value, before: current_value,
  category: "test", sub_category: "test", ui_element: "Range", source: "default", detail: "test fixture",
  lyria_prompt_tags: [], semantic_keywords: [], similarity: 0, axes: [], retrieval_scope: "sound",
});
const source = { runId: "run-1", stageId: "stage-1", attemptId: "attempt-1", artifactId: "artifact-1", bankId: "qwen-text" as const, pass: "resolved" as const };
const artifact = { schemaVersion: 1, kind: "parameter-bank", actionId: "text.qwen.resolved", bankId: "qwen-text", pass: "resolved", validity: "valid", data: [param("new", "n")] };

describe("Qwen artifact apply", () => {
  it("fences a late result by the full selected Run/stage/attempt/artifact identity", () => {
    const expected = { runId: "run-1", stageId: "stage-1", attemptId: "attempt-1", artifactId: "artifact-1" };
    expect(isCurrentQwenSelection(expected, expected)).toBe(true);
    expect(isCurrentQwenSelection(expected, { ...expected, runId: "run-2" })).toBe(false);
    expect(isCurrentQwenSelection(expected, { ...expected, stageId: "stage-2" })).toBe(false);
    expect(isCurrentQwenSelection(expected, { ...expected, attemptId: "attempt-2" })).toBe(false);
    expect(isCurrentQwenSelection(expected, { ...expected, artifactId: "artifact-2" })).toBe(false);
  });
  it("requires the explicitly selected artifact and successful attempt", () => {
    const artifactOwner = { runId: source.runId, stageId: source.stageId, attemptId: source.attemptId, artifactId: source.artifactId };
    expect(validateQwenArtifact({ ...source, artifactOwner, selectedArtifactId: "artifact-1", successfulAttemptId: "attempt-1", artifact })).toEqual({ ok: true });
    expect(validateQwenArtifact({ ...source, artifactOwner, selectedArtifactId: "other", successfulAttemptId: "attempt-1", artifact }).ok).toBe(false);
    expect(validateQwenArtifact({ ...source, artifactOwner, selectedArtifactId: "artifact-1", successfulAttemptId: "other", artifact }).ok).toBe(false);
    expect(validateQwenArtifact({ ...source, artifactOwner: { ...artifactOwner, runId: "other-run" }, selectedArtifactId: "artifact-1", successfulAttemptId: "attempt-1", artifact }).ok).toBe(false);
  });
  it.each([
    { ...artifact, kind: "raw-model-output" },
    { ...artifact, schemaVersion: 2 },
    { ...artifact, actionId: "text.gemma.resolved" },
    { ...artifact, bankId: "gemma-text" },
    { ...artifact, pass: "awtd" },
  ])("rejects incompatible artifact contract %#", (bad) => {
    expect(validateQwenArtifact({ ...source, artifactOwner: { runId: source.runId, stageId: source.stageId, attemptId: source.attemptId, artifactId: source.artifactId }, selectedArtifactId: "artifact-1", successfulAttemptId: "attempt-1", artifact: bad }).ok).toBe(false);
  });
  it("adds only missing Qwen parameters, preserves manual values and tombstones, and persists provenance", () => {
    const initial = { parameters: [param("manual", "edited")], manualNames: ["manual"], tombstones: ["deleted"], provenance: {}, appliedSources: [], operationReceipts: {} };
    const result = applyQwenArtifact(initial, [param("manual", "incoming"), param("deleted", "incoming"), param("new", "n")], source, "operation-1");
    expect(result.parameters).toEqual([param("manual", "edited"), param("new", "n")]);
    expect(result.provenance.new).toMatchObject(source);
    expect(result.appliedSources).toContain(qwenSourceKey(source));
    expect(applyQwenArtifact(result, [param("new", "n")], source, "operation-1")).toEqual(result);
  });
  it("preserves a user-edited value and deletion after an ordinary Apply with a new operation id", () => {
    const first = applyQwenArtifact({ parameters: [], manualNames: [], tombstones: [], provenance: {}, appliedSources: [], operationReceipts: {} }, [param("manual", "source"), param("deleted", "source")], source, "operation-1");
    const edited = markQwenManual(first, "manual", "user value");
    const deleted = removeQwenParameter(edited, "deleted");
    const repeated = applyQwenArtifact(deleted, [param("manual", "source"), param("deleted", "source")], source, "operation-2");
    expect(repeated.parameters).toHaveLength(1);
    expect(repeated.parameters[0]).toMatchObject({ technical_name: "manual", current_value: "user value", suggested_value: "user value" });
    expect(repeated.manualNames).toContain("manual");
    expect(repeated.tombstones).toContain("deleted");
    expect(repeated.provenance.manual).toEqual(source);
    expect(repeated.provenance.deleted).toBeUndefined();
  });
  it("separates retransmission from intentional re-apply and survives snapshot round-trip", () => {
    const once = applyQwenArtifact({ parameters: [], manualNames: [], tombstones: [], provenance: {}, appliedSources: [], operationReceipts: {} }, [param("new", "n")], source, "operation-1");
    const roundTrip = JSON.parse(JSON.stringify(once));
    expect(applyQwenArtifact(roundTrip, [param("new", "n")], source, "operation-1")).toEqual(once);
    const deliveredAgain = applyQwenArtifact(roundTrip, [param("new", "n")], source, "operation-2");
    expect(deliveredAgain.parameters).toEqual(once.parameters);
    expect(deliveredAgain.provenance).toEqual(once.provenance);
    const reapply = applyQwenArtifact(roundTrip, [param("new", "n")], source, "operation-3", { reapply: true });
    expect(reapply.parameters).toEqual(once.parameters);
    expect(reapply.operationReceipts["operation-3"]).toBeDefined();
  });
  it("marks edited imports manual, tombstones deletions, and maps metadata through snapshot shape", () => {
    const state = applyQwenArtifact({ parameters: [], manualNames: [], tombstones: [], provenance: {}, appliedSources: [], operationReceipts: {} }, [param("x", "source")], source, "op-1");
    const edited = markQwenManual(state, "x");
    const deleted = removeQwenParameter(edited, "x");
    const metadata = qwenSessionMetadataForSnapshot(deleted);
    const restored = restoreQwenMetadataFromSnapshot([], JSON.parse(JSON.stringify(metadata)));
    expect(restored.tombstones).toContain("x");
    expect(restored.provenance.x).toBeUndefined();
    expect(restored.appliedSources).toEqual(state.appliedSources);
    expect(restored.operationReceipts).toEqual(state.operationReceipts);
  });
  it("rejects reuse of an operation id for a different source", () => {
    const once = applyQwenArtifact({ parameters: [], manualNames: [], tombstones: [], provenance: {}, appliedSources: [], operationReceipts: {} }, [param("new", "n")], source, "same-operation");
    expect(() => applyQwenArtifact(once, [], { ...source, artifactId: "other-artifact" }, "same-operation")).toThrow("OPERATION_ID_PAYLOAD_MISMATCH");
  });
});
