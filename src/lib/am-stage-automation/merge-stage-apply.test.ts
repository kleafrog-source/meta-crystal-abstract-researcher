import { describe, expect, it } from "vitest";
import {
  MERGE_APPLY_POLICY, applyMergePreview, buildMergePreview, mergeOperationIdempotencyKey,
  reconcileMergeImportOnSave, restoreMergeImportState, validateBankSetDifferenceData, validateBankSetIntersectionData, validateDataSplitParameterBankData, validateFilteredParameterBankData, validateJoinedParameterBankData, validateMergeArtifactData, validateSelectedParameterBankData, validateServerStage2ParameterBankData, validateVocalAllocationParameterBank,
  type MergeImportState, type ValidatedMergeBank,
} from "./merge-stage-apply";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { isStageApplyAction, stageArtifactMetadataConsistent } from "./merge-stage-metadata";

describe("Stage Apply action routing", () => {
  it("exposes Vocal Allocation parameter-bank results to the shared Apply handoff", () => {
    expect(isStageApplyAction("vocal_allocation.search")).toBe(true);
    expect(isStageApplyAction("data.select")).toBe(true);
    expect(isStageApplyAction("data.difference")).toBe(true);
    expect(isStageApplyAction("data.split")).toBe(true);
    expect(isStageApplyAction("stage2.server")).toBe(true);
    expect(isStageApplyAction("flowmusic.export")).toBe(false);
    expect(stageArtifactMetadataConsistent({ artifactKind: "parameter-bank", payloadKind: "parameter-bank", payloadActionId: "data.select", stageActionId: "data.select", artifactBankId: null, artifactPass: null, artifactModality: null, artifactValidity: "valid", payloadValidity: "valid" })).toBe(true);
    expect(stageArtifactMetadataConsistent({ artifactKind: "parameter-bank", payloadKind: "parameter-bank", payloadActionId: "data.select", stageActionId: "data.select", artifactBankId: "merged", payloadBankId: undefined, artifactValidity: "valid", payloadValidity: "valid" })).toBe(false);
  });
});

const parameter = (technical_name: string, value: string | number): ActiveParameter => typeof value === "number" ? ({
  technical_name, category: "fixture", sub_category: "range", ui_element: "Range", default: 0.2,
  suggested_value: value, current_value: value, before: 0.2, source: "retrieval", detail: "fixed fixture",
  min_value: 0, max_value: 1, step: 0.1, lyria_prompt_tags: [], semantic_keywords: [], similarity: 0.8,
  axes: [], retrieval_scope: "sound",
}) : ({
  technical_name, category: "fixture", sub_category: "select", ui_element: "Select", default: "low",
  suggested_value: value, current_value: value, before: "low", source: "retrieval", detail: "fixed fixture",
  options: ["low", "high"], lyria_prompt_tags: [], semantic_keywords: [], similarity: 0.8,
  axes: [], retrieval_scope: "sound",
});

const source = { runId: "run-r", stageId: "merge-stage", attemptId: "merge-attempt", artifactId: "merge-artifact", actionId: "data.merge" as const, schemaVersion: 1 as const, kind: "parameter-bank" as const, bankId: "merged" as const, pass: "merge" as const };
const vocalSource = { runId: "run-o", stageId: "vocal-stage", attemptId: "vocal-attempt", artifactId: "vocal-bank", actionId: "vocal_allocation.search" as const, schemaVersion: 1 as const, kind: "parameter-bank" as const, bankId: "vocal-allocation", pass: "explicit-assignments", relatedArtifactIds: ["vocal-matrix"] };
const qwen = { artifactId: "qwen-artifact", actionId: "text.qwen.resolved" as const, bankId: "qwen-text" as const, pass: "resolved" as const, data: [parameter("shared", "low"), parameter("qwen-only", 0.4)] };
const gemma = { artifactId: "gemma-artifact", actionId: "text.gemma.awtd" as const, bankId: "gemma-text" as const, pass: "awtd" as const, data: [parameter("shared", "high"), parameter("gemma-only", 0.7)] };
const bank: ValidatedMergeBank = {
  parameters: [qwen.data[0], qwen.data[1], gemma.data[1]], inputRefs: [qwen.artifactId, gemma.artifactId],
  provenance: {
    shared: { sourceArtifactId: qwen.artifactId, sourceActionId: qwen.actionId },
    "qwen-only": { sourceArtifactId: qwen.artifactId, sourceActionId: qwen.actionId },
    "gemma-only": { sourceArtifactId: gemma.artifactId, sourceActionId: gemma.actionId },
  },
};
const initialState: MergeImportState = { schema: "am_stage_merge_import_v1", tombstones: [], provenance: {}, applied_sources: [], operation_receipts: {} };

describe("AM Stage merge Apply contract", () => {
  it("accepts only the explicit Vocal Allocation assignment bank and preserves its source identity", () => {
    const data = [parameter("technique_primary_lead_layer", "high")];
    const result = validateVocalAllocationParameterBank({ artifactId: vocalSource.artifactId, actionId: vocalSource.actionId, bankId: vocalSource.bankId, pass: vocalSource.pass, validity: "valid", inputRefs: ["brief-artifact"], data });
    expect(result).toEqual({ ok: true, bank: { parameters: data, inputRefs: ["brief-artifact"], provenance: { technique_primary_lead_layer: { sourceArtifactId: "vocal-bank", sourceActionId: "vocal_allocation.search" } } } });
    expect(validateVocalAllocationParameterBank({ artifactId: vocalSource.artifactId, actionId: vocalSource.actionId, bankId: vocalSource.bankId, pass: vocalSource.pass, validity: "partial", inputRefs: [], data }).ok).toBe(false);
    expect(validateVocalAllocationParameterBank({ artifactId: vocalSource.artifactId, actionId: vocalSource.actionId, bankId: vocalSource.bankId, pass: vocalSource.pass, validity: "valid", inputRefs: [], data: [...data, ...data] })).toMatchObject({ ok: false, reason: "vocal_assignment_duplicate_technical_name" });
    expect(restoreMergeImportState({ ...initialState, applied_sources: [vocalSource] })).not.toBeNull();
  });

  it("validates a merged payload against the two ordered source banks and winning rows", () => {
    const output = {
      schema: "am_stage_merged_parameter_bank_v1", parameters: bank.parameters, provenance: bank.provenance,
      merge: { key: "technical_name", duplicatePolicy: "keep_first", conflictPolicy: "keep_first", order: "first-occurrence", inputs: [qwen, gemma].map(({ artifactId, actionId }) => ({ artifactId, actionId })) },
    };
    expect(validateMergeArtifactData({ ...source, validity: "valid", inputRefs: bank.inputRefs, data: output }, [qwen, gemma])).toEqual({ ok: true, bank });
    expect(validateMergeArtifactData({ ...source, validity: "partial", inputRefs: bank.inputRefs, data: output }, [qwen, gemma]).ok).toBe(false);
    expect(validateMergeArtifactData({ ...source, validity: "valid", inputRefs: [gemma.artifactId, qwen.artifactId], data: output }, [qwen, gemma]).ok).toBe(false);
  });

  it("rejects a segment-scoped audio bank from the active-parameters merge target", () => {
    const segmentArtifact = {
      ...source,
      actionId: "audio.clap.resolved",
      bankId: "clap",
      pass: "resolved",
      inputRefs: ["segment-plan-artifact"],
      data: {
        schema: "am_stage_segment_bank_v1",
        segments: [{ id: "segment-1", startSeconds: 0, endSeconds: 3, parameters: [parameter("clap-row", 0.6)] }],
      },
    };

    expect(validateMergeArtifactData(segmentArtifact, [qwen, gemma])).toEqual({ ok: false, reason: "artifact_identity_or_validity_invalid" });
  });

  it("validates Stage import of the intersection output and its winning input provenance", () => {
    const source = { runId: "run-i", stageId: "intersection-stage", attemptId: "intersection-attempt", artifactId: "intersection-artifact", actionId: "data.intersection", schemaVersion: 1, kind: "parameter-bank", bankId: "intersection", pass: "intersection" };
    const output = {
      schema: "am_stage_bank_set_v1", operation: "intersection", parameters: [qwen.data[0]],
      provenance: { shared: { sourceArtifactId: qwen.artifactId, sourceActionId: qwen.actionId } },
      inputRefs: [qwen.artifactId, gemma.artifactId], set: { key: "technical_name", valuePolicy: "from_a", order: "source-order" },
    };
    expect(validateBankSetIntersectionData({ ...source, validity: "valid", inputRefs: output.inputRefs, data: output }, [qwen, gemma])).toMatchObject({ ok: true, bank: { parameters: [qwen.data[0]], inputRefs: output.inputRefs } });
    const wrongWinner = { ...output, provenance: { shared: { sourceArtifactId: gemma.artifactId, sourceActionId: gemma.actionId } } };
    expect(validateBankSetIntersectionData({ ...source, validity: "valid", inputRefs: output.inputRefs, data: wrongWinner }, [qwen, gemma]).ok).toBe(false);
  });

  it("validates all difference modes, source ordering and per-row provenance", () => {
    const source = { runId: "run-i", stageId: "difference-stage", attemptId: "difference-attempt", artifactId: "difference-artifact", actionId: "data.difference", schemaVersion: 1, kind: "parameter-bank", bankId: "difference", pass: "difference" };
    const a = { ...qwen, data: [parameter("shared", "low"), parameter("a-only-1", 0.1), parameter("a-only-2", 0.2)] };
    const b = { ...gemma, data: [parameter("shared", "high"), parameter("b-only", 0.7)] };
    const validate = (mode: "a_minus_b" | "b_minus_a" | "symmetric", rows: ActiveParameter[], winners: Record<string, { sourceArtifactId: string; sourceActionId: string }>, sourceInputs = [a, b]) => {
      const inputRefs = sourceInputs.map((input) => input.artifactId);
      const data = { schema: "am_stage_bank_set_v1", operation: "difference", parameters: rows, provenance: winners, inputRefs, set: { key: "technical_name", mode, order: "source-order" } };
      return validateBankSetDifferenceData({ ...source, validity: "valid", inputRefs, data }, sourceInputs);
    };
    const winnerA = { sourceArtifactId: a.artifactId, sourceActionId: a.actionId };
    const winnerB = { sourceArtifactId: b.artifactId, sourceActionId: b.actionId };
    expect(validate("a_minus_b", a.data.slice(1), { "a-only-1": winnerA, "a-only-2": winnerA })).toMatchObject({ ok: true, bank: { parameters: a.data.slice(1), inputRefs: [a.artifactId, b.artifactId] } });
    expect(validate("b_minus_a", b.data.slice(1), { "b-only": winnerB })).toMatchObject({ ok: true, bank: { parameters: b.data.slice(1) } });
    expect(validate("symmetric", [...a.data.slice(1), ...b.data.slice(1)], { "a-only-1": winnerA, "a-only-2": winnerA, "b-only": winnerB })).toMatchObject({ ok: true });
    expect(validate("symmetric", [...b.data.slice(1), ...a.data.slice(1)], { "a-only-1": winnerA, "a-only-2": winnerA, "b-only": winnerB })).toMatchObject({ ok: false, reason: "difference_membership_order_or_value_invalid" });
    expect(validate("a_minus_b", a.data.slice(1), { "a-only-1": winnerB, "a-only-2": winnerA })).toMatchObject({ ok: false, reason: "winning_provenance_invalid" });
    expect(validate("a_minus_b", a.data.slice(1), { "a-only-1": winnerA })).toMatchObject({ ok: false, reason: "provenance_shape_invalid" });
    expect(validate("a_minus_b", [], {}, [{ ...a, data: [] }, { ...b, data: [] }])).toMatchObject({ ok: true, bank: { parameters: [] } });
  });

  it("validates server Stage-2 consensus as its own action and never as data.merge", () => {
    const stage2Source = { artifactId: "stage2-artifact", actionId: "stage2.server", bankId: "server-stage2", pass: "stage2", validity: "valid" };
    const brief = { artifactId: "brief-artifact", actionId: "brief.from_template", kind: "brief", validity: "valid", data: { text: "A fixture cue" } };
    const qwenInput = { artifactId: qwen.artifactId, actionId: qwen.actionId, kind: "parameter-bank", validity: "valid", data: [parameter("seed-a", 0.1)] };
    const gemmaInput = { artifactId: gemma.artifactId, actionId: gemma.actionId, kind: "parameter-bank", validity: "valid", data: [parameter("seed-b", 0.2)] };
    const inputs = [brief, qwenInput, gemmaInput];
    const selected = { ...parameter("new-stage2", 0.8), source: "stage2" as const };
    const data = { stage2_hits: [selected], stage2_meta: { text_index: "qwen3", model: "qwen-test", dimensions: 1024, query_method: "weighted_centroid_of_stage1_text_vectors", seed_names: ["seed-a", "seed-b"], excluded_stage1_names: 2 } };
    const result = validateServerStage2ParameterBankData({ ...stage2Source, inputRefs: inputs.map((input) => input.artifactId), data }, inputs);
    expect(result).toEqual({ ok: true, bank: { parameters: [selected], inputRefs: inputs.map((input) => input.artifactId), provenance: { "new-stage2": { sourceArtifactId: "stage2-artifact", sourceActionId: "stage2.server" } } } });
    expect(validateServerStage2ParameterBankData({ ...stage2Source, actionId: "data.merge", inputRefs: inputs.map((input) => input.artifactId), data }, inputs).ok).toBe(false);
    expect(validateServerStage2ParameterBankData({ ...stage2Source, inputRefs: inputs.map((input) => input.artifactId), data: { ...data, stage2_meta: { ...data.stage2_meta, seed_names: ["seed-a"] } } }, inputs)).toMatchObject({ ok: false, reason: "stage2_seed_identity_mismatch" });
    expect(validateServerStage2ParameterBankData({ ...stage2Source, inputRefs: inputs.map((input) => input.artifactId), data: { ...data, stage2_hits: [parameter("seed-a", 0.1)] } }, inputs)).toMatchObject({ ok: false, reason: "stage2_hit_invalid_or_not_new" });
    expect(validateServerStage2ParameterBankData({ ...stage2Source, inputRefs: inputs.map((input) => input.artifactId), data: { ...data, stage2_hits: [] } }, inputs)).toMatchObject({ ok: true, bank: { parameters: [], provenance: {} } });
  });

  it("preserves a user-edited binding order when validating keep-first winners", () => {
    const reversedInputs = [gemma, qwen];
    const reversedBank: ValidatedMergeBank = {
      parameters: [gemma.data[0], gemma.data[1], qwen.data[1]],
      inputRefs: reversedInputs.map((item) => item.artifactId),
      provenance: {
        shared: { sourceArtifactId: gemma.artifactId, sourceActionId: gemma.actionId },
        "gemma-only": { sourceArtifactId: gemma.artifactId, sourceActionId: gemma.actionId },
        "qwen-only": { sourceArtifactId: qwen.artifactId, sourceActionId: qwen.actionId },
      },
    };
    const output = {
      schema: "am_stage_merged_parameter_bank_v1", parameters: reversedBank.parameters, provenance: reversedBank.provenance,
      merge: { key: "technical_name", duplicatePolicy: "keep_first", conflictPolicy: "keep_first", order: "binding-order", inputs: reversedInputs.map(({ artifactId, actionId }) => ({ artifactId, actionId })) },
    };
    expect(validateMergeArtifactData({ ...source, validity: "valid", inputRefs: reversedBank.inputRefs, data: output }, reversedInputs)).toEqual({ ok: true, bank: reversedBank });
  });

  it("validates filtered bank membership against the saved rule and exact input identity", () => {
    const input = { artifactId: "qwen-source", actionId: "text.qwen.resolved", data: [parameter("keep", 0.6), { ...parameter("drop", 0.2), similarity: 0.2 }] };
    const rules = [{ field: "similarity", op: "gt", value: 0.5 }];
    const output = { artifactId: "filter-output", actionId: "data.filter", validity: "valid", inputRefs: [input.artifactId], data: [input.data[0]] };
    expect(validateFilteredParameterBankData(output, input, rules)).toMatchObject({ ok: true, bank: { parameters: [input.data[0]], inputRefs: [input.artifactId], provenance: { keep: { sourceArtifactId: "filter-output", sourceActionId: "data.filter" } } } });
    expect(validateFilteredParameterBankData({ ...output, data: [input.data[1]] }, input, rules).ok).toBe(false);
    expect(validateFilteredParameterBankData({ ...output, inputRefs: ["other"] }, input, rules).ok).toBe(false);
  });

  it("validates a selected data.split port against the input bank and saved channels", () => {
    const inputData = {
      schema: "am2_param_bank_v1",
      parameters: [parameter("split_a", 0.2), parameter("split_b", 0.5), parameter("split_c", 0.8)],
      provenance: {
        split_a: { sourceArtifactId: "qwen-source", sourceActionId: "text.qwen.resolved" },
        split_b: { sourceArtifactId: "qwen-source", sourceActionId: "text.qwen.resolved" },
        split_c: { sourceArtifactId: "qwen-source", sourceActionId: "text.qwen.resolved" },
      },
      inputRefs: ["qwen-source"],
    };
    const input = { artifactId: "qwen-bank", actionId: "text.qwen.resolved", kind: "parameter-bank", bankId: "qwen-text", pass: "resolved", validity: "valid", data: inputData };
    const channels = [
      { name: "even", rule: { type: "by_index_modulo" as const, modulus: 2, remainder: 0 } },
      { name: "firstTwo", rule: { type: "index_range" as const, from: 0, to: 1 } },
    ];
    const splitData = {
      ...inputData,
      parameters: [inputData.parameters[0], inputData.parameters[2]],
      provenance: { split_a: inputData.provenance.split_a, split_c: inputData.provenance.split_c },
      channel: "even",
      inputRefs: [input.artifactId],
    };
    const artifact = { artifactId: "split-even", actionId: "data.split", outputPort: "even", kind: "parameter-bank", bankId: "qwen-text", pass: "resolved", validity: "valid", inputRefs: [input.artifactId], data: splitData };
    const validated = validateDataSplitParameterBankData(artifact, input, channels);
    expect(validated).toEqual({ ok: true, bank: {
      parameters: splitData.parameters,
      inputRefs: [input.artifactId],
      provenance: {
        split_a: { sourceArtifactId: "split-even", sourceActionId: "data.split" },
        split_c: { sourceArtifactId: "split-even", sourceActionId: "data.split" },
      },
    } });
    expect(validateDataSplitParameterBankData({ ...artifact, outputPort: "firstTwo" }, input, channels).ok).toBe(false);
    expect(validateDataSplitParameterBankData({ ...artifact, kind: "record-set" }, input, channels).ok).toBe(false);
    expect(validateDataSplitParameterBankData({ ...artifact, validity: "partial" }, input, channels).ok).toBe(false);
  });

  it("validates flow.join as an ordered first-wins union with matching winning source provenance", () => {
    const inputs = [
      { artifactId: "filtered", actionId: "data.filter", data: [parameter("shared", 0.4), parameter("first", "low")] },
      { artifactId: "else-output", actionId: "flow.if", data: [parameter("shared", 0.8), parameter("second", "high")] },
    ];
    const outputData = {
      schema: "am2_param_bank_v1", parameters: [inputs[0]!.data[0], inputs[0]!.data[1], inputs[1]!.data[1]],
      provenance: {
        shared: { sourceArtifactId: "filtered", sourceActionId: "data.filter" },
        first: { sourceArtifactId: "filtered", sourceActionId: "data.filter" },
        second: { sourceArtifactId: "else-output", sourceActionId: "flow.if" },
      }, inputRefs: ["filtered", "else-output"], joinReport: [],
    };
    const output = { artifactId: "join-output", actionId: "flow.join", validity: "valid", inputRefs: outputData.inputRefs, data: outputData };
    expect(validateJoinedParameterBankData(output, inputs).ok).toBe(true);
    expect(validateJoinedParameterBankData({ ...output, inputRefs: ["else-output", "filtered"] }, inputs).ok).toBe(false);
    expect(validateJoinedParameterBankData({ ...output, data: { ...outputData, provenance: { ...outputData.provenance, shared: { sourceArtifactId: "else-output", sourceActionId: "flow.if" } } } }, inputs).ok).toBe(false);
  });

  it("validates parameter selection against exact source membership, order, input reference and provenance", () => {
    const input = { artifactId: "source-bank", actionId: "text.qwen.resolved", data: { parameters: [parameter("first", 0.4), parameter("second", "high")], provenance: { first: { sourceArtifactId: "model-artifact", sourceActionId: "text.qwen.resolved" } } } };
    const output = { artifactId: "selected-bank", actionId: "data.select", validity: "valid", inputRefs: [input.artifactId], data: { schema: "am2_param_bank_v1", parameters: [input.data.parameters[0]], provenance: { first: input.data.provenance.first } } };
    const settings = { mode: "parameters_by_name", fields: ["first", "absent"] };
    expect(validateSelectedParameterBankData(output, input, settings)).toMatchObject({ ok: true, bank: { parameters: [input.data.parameters[0]], inputRefs: [input.artifactId], provenance: { first: { sourceArtifactId: "model-artifact", sourceActionId: "text.qwen.resolved" } } } });
    expect(validateSelectedParameterBankData({ ...output, inputRefs: ["foreign"] }, input, settings).ok).toBe(false);
    expect(validateSelectedParameterBankData({ ...output, data: { ...output.data, parameters: [input.data.parameters[1]] } }, input, settings).ok).toBe(false);
    expect(validateSelectedParameterBankData({ ...output, data: { ...output.data, provenance: {} } }, input, settings).ok).toBe(false);
    expect(validateSelectedParameterBankData({ ...output, data: { ...output.data, parameters: [], provenance: {} } }, input, { mode: "summary", fields: [] }).ok).toBe(false);
    expect(validateSelectedParameterBankData({ ...output, data: { ...output.data, parameters: [], provenance: {} } }, input, { mode: "parameters_by_name", fields: ["absent"] })).toMatchObject({ ok: true, bank: { parameters: [], inputRefs: [input.artifactId], provenance: {} } });
  });

  it("uses the input artifact as provenance when the source bank has no provenance map", () => {
    const input = { artifactId: "source-bank", actionId: "text.gemma.awtd", data: [parameter("selected", "low")] };
    const output = { artifactId: "selected-bank", actionId: "data.select", validity: "valid", inputRefs: [input.artifactId], data: { schema: "am2_param_bank_v1", parameters: input.data } };
    expect(validateSelectedParameterBankData(output, input, { mode: "parameters_by_name", fields: ["selected"] })).toMatchObject({ ok: true, bank: { provenance: { selected: { sourceArtifactId: "source-bank", sourceActionId: "text.gemma.awtd" } } } });
  });

  it("rejects incomplete Stage records, duplicate names, and provenance that does not point at a winning input row", () => {
    const payload = (parameters: unknown[], provenance = bank.provenance) => ({
      ...source, validity: "valid", inputRefs: bank.inputRefs,
      data: { schema: "am_stage_merged_parameter_bank_v1", parameters, provenance, merge: { key: "technical_name", duplicatePolicy: "keep_first", conflictPolicy: "keep_first", order: "first-occurrence", inputs: [qwen, gemma].map(({ artifactId, actionId }) => ({ artifactId, actionId })) } },
    });
    expect(validateMergeArtifactData(payload([{ technical_name: "bad" }]), [qwen, gemma]).ok).toBe(false);
    expect(validateMergeArtifactData(payload([parameter("same", 0.1), parameter("same", 0.2)]), [qwen, gemma]).ok).toBe(false);
    expect(validateMergeArtifactData(payload(bank.parameters, { ...bank.provenance, shared: { sourceArtifactId: "foreign", sourceActionId: "text.qwen.resolved" } }), [qwen, gemma]).ok).toBe(false);
  });

  it("previews additions, existing values, conflicts and tombstones without overwriting Stage data", () => {
    const existing = [parameter("shared", "low"), parameter("manual", "high"), parameter("deleted", 0.3)];
    const state = { ...initialState, tombstones: ["gemma-only"] };
    const preview = buildMergePreview(existing, state, bank);
    expect(preview.counts).toEqual({ added: 1, updated: 0, skipped: 2 });
    expect(preview.changes.find((item) => item.technicalName === "qwen-only")).toMatchObject({ status: "added" });
    expect(preview.changes.find((item) => item.technicalName === "shared")).toMatchObject({ status: "skipped", reason: "already_present" });
    expect(preview.changes.find((item) => item.technicalName === "gemma-only")).toMatchObject({ status: "skipped", reason: "tombstoned" });
    expect(preview.conflicts).toEqual([]);
    const conflict = buildMergePreview([parameter("shared", "high")], initialState, bank);
    expect(conflict.conflicts).toHaveLength(1);
    expect(conflict.changes.find((item) => item.technicalName === "shared")).toMatchObject({ status: "skipped", reason: "existing_value_preserved" });
  });

  it("applies only missing rows, records merge and winning provenance, and distinguishes retries from a new explicit Apply", () => {
    const operationId = "op-apply-1";
    const preview = buildMergePreview([], initialState, bank);
    const key = mergeOperationIdempotencyKey({ sessionId: "session", source, target: "v3.active_parameters", policy: MERGE_APPLY_POLICY, operationId });
    const first = applyMergePreview([], initialState, preview, { sessionId: "session", source, operationId, idempotencyKey: key, requestedRevision: "rev-1", resultingRevision: "rev-2" });
    expect(first.parameters).toEqual(bank.parameters);
    expect(first.state.provenance.shared).toMatchObject({ source, winningSource: bank.provenance.shared, status: "applied" });
    expect(first.state.operation_receipts[operationId]).toMatchObject({ operationId, idempotencyKey: key, requestedRevision: "rev-1", resultingRevision: "rev-2", counts: { added: 3, updated: 0, skipped: 0 } });
    const newOperation = buildMergePreview(first.parameters, first.state, bank);
    expect(newOperation.counts).toEqual({ added: 0, updated: 0, skipped: 3 });
    expect(first.state.applied_sources).toHaveLength(1);
  });

  it("preserves legacy absence and requires explicit deletion intent before tombstoning", () => {
    expect(restoreMergeImportState(undefined)).toBeNull();
    expect(reconcileMergeImportOnSave(undefined, [], [])).toBeUndefined();
    const operationId = "op";
    const idempotencyKey = mergeOperationIdempotencyKey({ sessionId: "session", source, target: "v3.active_parameters", policy: MERGE_APPLY_POLICY, operationId });
    const imported = applyMergePreview([], initialState, buildMergePreview([], initialState, bank), { sessionId: "session", source, operationId, idempotencyKey, requestedRevision: "r1", resultingRevision: "r2" });
    const edited = parameter("shared", "high");
    const next = reconcileMergeImportOnSave(imported.state, bank.parameters, [edited, bank.parameters[1]]);
    expect(next?.provenance.shared.status).toBe("manually_modified");
    expect(next?.provenance["gemma-only"].status).toBe("applied");
    expect(next?.tombstones).not.toContain("gemma-only");
    const deleted = reconcileMergeImportOnSave(imported.state, bank.parameters, [edited, bank.parameters[1]], ["gemma-only"]);
    expect(deleted?.provenance["gemma-only"].status).toBe("removed");
    expect(deleted?.tombstones).toContain("gemma-only");
    expect(next?.provenance["qwen-only"].status).toBe("applied");
  });
});
