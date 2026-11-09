import { describe, expect, it } from "vitest";
import {
  applyBriefArtifact,
  briefArtifactContractConsistent,
  briefSourceKey,
  markBriefManualEdit,
  validateBriefArtifact,
  type BriefImportState,
} from "./brief-stage-apply";

const source = { runId: "run-1", stageId: "stage-1", attemptId: "attempt-1", artifactId: "artifact-1", actionId: "brief.combine_segment_texts" as const, schemaVersion: 1 as const, modality: "text" as const };
const valid = {
  ...source,
  runOwnerId: "run-1",
  stageOwnerId: "stage-1",
  artifactOwner: { runId: "run-1", stageId: "stage-1", attemptId: "attempt-1", artifactId: "artifact-1" },
  successfulAttemptId: "attempt-1",
  kind: "brief",
  schemaVersion: 1,
  actionId: "brief.combine_segment_texts",
  modality: "text",
  validity: "valid",
  data: { text: "Generated brief" },
} as const;

describe("Brief Automation artifact validation and Apply", () => {
  it("accepts the API shape where absent payload bank/pass normalize to null metadata", () => {
    expect(briefArtifactContractConsistent({
      artifactKind: "brief", payloadKind: "brief", payloadActionId: "brief.combine_segment_texts", stageActionId: "brief.combine_segment_texts",
      artifactBankId: null, artifactPass: null, artifactModality: "text", payloadModality: "text", artifactValidity: "valid", payloadValidity: "valid",
    })).toBe(true);
    expect(briefArtifactContractConsistent({
      artifactKind: "brief", payloadKind: "brief", payloadActionId: "brief.combine_segment_texts", stageActionId: "brief.combine_segment_texts",
      artifactBankId: null, payloadBankId: "qwen-text", artifactModality: "text", payloadModality: "text", artifactValidity: "valid", payloadValidity: "valid",
    })).toBe(false);
  });

  it("requires Run → stage → successful attempt → artifact ownership", () => {
    expect(validateBriefArtifact(valid)).toEqual({ ok: true });
    expect(validateBriefArtifact({ ...valid, runOwnerId: "other-run" }).ok).toBe(false);
    expect(validateBriefArtifact({ ...valid, stageOwnerId: "other-stage" }).ok).toBe(false);
    expect(validateBriefArtifact({ ...valid, artifactOwner: { ...valid.artifactOwner, attemptId: "old-attempt" } }).ok).toBe(false);
    expect(validateBriefArtifact({ ...valid, successfulAttemptId: "retry-2" }).ok).toBe(false);
    expect(validateBriefArtifact({ ...valid, artifactOwner: { ...valid.artifactOwner, artifactId: "other-artifact" } }).ok).toBe(false);
  });

  it.each([
    ["actionId", "brief.from_crystal"],
    ["kind", "parameter-bank"],
    ["schemaVersion", 2],
    ["modality", "audio"],
    ["validity", "partial"],
    ["data", { text: "  " }],
  ] as const)("rejects incompatible %s", (key, value) => {
    expect(validateBriefArtifact({ ...valid, [key]: value } as typeof valid).ok).toBe(false);
  });

  it("fills an empty Brief and records source provenance without touching other state", () => {
    const result = applyBriefArtifact(null, "", "Generated brief", source, "op-1", "ordinary");
    expect(result).toMatchObject({ kind: "applied", text: "Generated brief", textChanged: true });
    if (result.kind !== "applied") throw new Error("Expected Apply result");
    expect(result.metadata.source).toEqual({ ...source, actionId: "brief.combine_segment_texts", schemaVersion: 1, modality: "text" });
    expect(result.metadata.appliedText).toBe("Generated brief");
    expect(result.metadata.operationReceipts["op-1"]).toBe(briefSourceKey(source));
  });

  it("asks for confirmation before replacing a different nonempty Brief", () => {
    expect(applyBriefArtifact(null, "Existing brief", "Generated brief", source, "op-1", "ordinary")).toEqual({ kind: "confirmation-required" });
    const confirmed = applyBriefArtifact(null, "Existing brief", "Generated brief", source, "op-1", "confirmed-replace");
    expect(confirmed).toMatchObject({ kind: "applied", text: "Generated brief", textChanged: true });
  });

  it("records provenance for identical text without reporting a text change", () => {
    const result = applyBriefArtifact(null, "Same brief", "Same brief", source, "op-1", "ordinary");
    expect(result).toMatchObject({ kind: "applied", text: "Same brief", textChanged: false });
  });

  it("treats redelivery and ordinary re-Apply as no-ops, preserving later manual edits", () => {
    const first = applyBriefArtifact(null, "", "Generated brief", source, "op-1", "ordinary");
    if (first.kind !== "applied") throw new Error("Expected first Apply");
    const redelivery = applyBriefArtifact(first.metadata, first.text, "Generated brief", source, "op-1", "ordinary");
    expect(redelivery).toEqual({ kind: "noop", text: first.text, metadata: first.metadata });
    const manuallyEdited: BriefImportState = markBriefManualEdit(first.metadata)!;
    const repeat = applyBriefArtifact(manuallyEdited, "My edited brief", "Generated brief", source, "op-2", "ordinary");
    expect(repeat).toEqual({ kind: "noop", text: "My edited brief", metadata: manuallyEdited });
    const intentional = applyBriefArtifact(manuallyEdited, "My edited brief", "Generated brief", source, "op-3", "confirmed-replace");
    expect(intentional).toMatchObject({ kind: "applied", text: "Generated brief", textChanged: true });
  });

  it("rejects reuse of one operation ID for a different source", () => {
    const first = applyBriefArtifact(null, "", "Generated brief", source, "op-1", "ordinary");
    if (first.kind !== "applied") throw new Error("Expected first Apply");
    expect(() => applyBriefArtifact(first.metadata, first.text, "Other brief", { ...source, artifactId: "artifact-2" }, "op-1", "confirmed-replace")).toThrow("OPERATION_ID_PAYLOAD_MISMATCH");
  });
});
