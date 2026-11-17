import { createHash } from "node:crypto";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { MERGE_APPLY_POLICY } from "./merge-stage-metadata";
import type { MergeImportState, MergeOperationReceipt, MergeSource, WinningSource } from "./merge-stage-metadata";
import { filterFlowRows } from "./control-flow";
import { splitAutomationArtifact, validateDataSplitChannels, type DataSplitChannel } from "./data-split";

export { MERGE_APPLY_POLICY, restoreMergeImportState } from "./merge-stage-metadata";
export type { MergeImportState, MergeOperationReceipt, MergeSource, WinningSource } from "./merge-stage-metadata";

export type MergeInput = { artifactId: string; actionId: "text.qwen.resolved" | "text.gemma.awtd"; bankId: "qwen-text" | "gemma-text"; pass: "resolved" | "awtd"; data: unknown };
export type ValidatedMergeBank = { parameters: ActiveParameter[]; inputRefs: string[]; provenance: Record<string, WinningSource> };
export type MergeChange = { technicalName: string; status: "added" | "skipped"; reason?: "already_present" | "existing_value_preserved" | "tombstoned"; source: WinningSource; parameter: ActiveParameter };
export type MergePreview = { target: "v3.active_parameters"; policy: typeof MERGE_APPLY_POLICY; counts: { added: number; updated: number; skipped: number }; changes: MergeChange[]; conflicts: Array<{ technicalName: string; reason: string }> };
export type ParameterBankInput = { artifactId: string; actionId: string; data: unknown; kind?: string; bankId?: string | null; pass?: string | null; validity?: string };
export type Stage2ServerInput = { artifactId: string; actionId: string; kind: string; validity: string; data: unknown };

const isObject = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === "object" && !Array.isArray(x));
const isWinningSourceValue = (x: unknown): x is WinningSource => isObject(x)
  && typeof x.sourceArtifactId === "string" && x.sourceArtifactId.length > 0
  && ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server", "data.filter", "data.select", "data.split", "flow.if", "flow.router", "flow.join", "data.merge", "data.intersection", "data.difference", "vocal_allocation.search"].includes(String(x.sourceActionId));
const stable = (x: unknown): string => Array.isArray(x) ? "[" + x.map(stable).join(",") + "]" : isObject(x) ? "{" + Object.keys(x).sort().map((key) => JSON.stringify(key) + ":" + stable(x[key])).join(",") + "}" : String(JSON.stringify(x));
const validParameter = (x: unknown): x is ActiveParameter => {
  if (!isObject(x) || typeof x.technical_name !== "string" || !x.technical_name.trim() || typeof x.category !== "string" || typeof x.sub_category !== "string" || typeof x.detail !== "string" || !["Range", "Select", "Toggle", "Text", "Array", "String"].includes(String(x.ui_element)) || !["numeric", "value_anchor", "morpho_value_anchor", "lexical", "relation", "axis", "retrieval", "not_generated", "default", "neutral", "audio_similarity", "consensus", "transition", "stage2"].includes(String(x.source)) || !["sound", "structure", "metadata", "provenance", "administrative"].includes(String(x.retrieval_scope)) || !Array.isArray(x.lyria_prompt_tags) || !x.lyria_prompt_tags.every((v) => typeof v === "string") || !Array.isArray(x.semantic_keywords) || !x.semantic_keywords.every((v) => typeof v === "string") || !Array.isArray(x.axes) || !x.axes.every((v) => typeof v === "string") || typeof x.similarity !== "number" || !Number.isFinite(x.similarity) || !(typeof x.default === "string" || typeof x.default === "number") || !(typeof x.suggested_value === "string" || typeof x.suggested_value === "number") || !(typeof x.current_value === "string" || typeof x.current_value === "number") || !(typeof x.before === "string" || typeof x.before === "number")) return false;
  if (x.ui_element === "Range") return typeof x.min_value === "number" && typeof x.max_value === "number" && x.min_value <= x.max_value && [x.default, x.suggested_value, x.current_value, x.before].every((v) => typeof v === "number" && v >= Number(x.min_value) && v <= Number(x.max_value)) && (x.step === undefined || typeof x.step === "number" && x.step > 0);
  if (x.ui_element === "Select") { const options = x.options; return Array.isArray(options) && options.length > 0 && options.every((v) => typeof v === "string") && [x.default, x.suggested_value, x.current_value, x.before].every((v) => typeof v === "string" && options.includes(v)); }
  return true;
};

export function validateMergeArtifactData(artifact: { runId?: string; stageId?: string; attemptId?: string; artifactId?: string; actionId?: string; schemaVersion?: number; kind?: string; bankId?: string | null; pass?: string | null; validity?: string; inputRefs?: unknown; data?: unknown }, inputs: MergeInput[]): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (!artifact.runId || !artifact.stageId || !artifact.attemptId || !artifact.artifactId || artifact.actionId !== "data.merge" || artifact.schemaVersion !== 1 || artifact.kind !== "parameter-bank" || artifact.bankId !== "merged" || artifact.pass !== "merge" || artifact.validity !== "valid") return fail("artifact_identity_or_validity_invalid");
  if (inputs.length !== 2 || new Set(inputs.map((input) => input.actionId)).size !== 2
    || !inputs.every((input) => input.actionId === "text.qwen.resolved" && input.bankId === "qwen-text" && input.pass === "resolved"
      || input.actionId === "text.gemma.awtd" && input.bankId === "gemma-text" && input.pass === "awtd")) return fail("input_order_or_contract_invalid");
  const data = artifact.data;
  if (!isObject(data) || data.schema !== "am_stage_merged_parameter_bank_v1" || !Array.isArray(data.parameters) || !isObject(data.provenance) || !isObject(data.merge)) return fail("merge_payload_invalid");
  const merge = data.merge;
  if (merge.key !== "technical_name" || !["binding-order", "first-occurrence"].includes(String(merge.order)) || !["keep_first", "keep_last", "error"].includes(String(merge.duplicatePolicy)) || !["keep_first", "keep_last", "error"].includes(String(merge.conflictPolicy)) || !Array.isArray(merge.inputs) || JSON.stringify(merge.inputs) !== JSON.stringify(inputs.map(({ artifactId, actionId }) => ({ artifactId, actionId })))) return fail("merge_policy_or_inputs_invalid");
  if (!Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify(inputs.map((item) => item.artifactId))) return fail("input_refs_invalid");
  const parameters = data.parameters;
  const names = new Set<string>();
  for (const row of parameters) { if (!validParameter(row) || names.has(row.technical_name)) return fail("parameter_invalid_or_duplicate"); names.add(row.technical_name); }
  const provenance = data.provenance as Record<string, unknown>;
  if (Object.keys(provenance).length !== names.size) return fail("provenance_shape_invalid");
  for (const row of parameters as ActiveParameter[]) {
    const winner = provenance[row.technical_name];
    if (!isObject(winner)) return fail("winning_provenance_missing");
    const input = inputs.find((item) => item.artifactId === winner.sourceArtifactId && item.actionId === winner.sourceActionId);
    if (!input || !Array.isArray(input.data) || !input.data.some((candidate) => validParameter(candidate) && candidate.technical_name === row.technical_name && stable(candidate) === stable(row))) return fail("winning_provenance_not_in_input");
  }
  return { ok: true, bank: { parameters: parameters as ActiveParameter[], inputRefs: inputs.map((item) => item.artifactId), provenance: provenance as Record<string, WinningSource> } };
}

export function validateVocalAllocationParameterBank(input: { artifactId: string; actionId: string; bankId: string | null; pass: string | null; validity: string; inputRefs: unknown; data: unknown }): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (input.actionId !== "vocal_allocation.search" || input.bankId !== "vocal-allocation" || input.pass !== "explicit-assignments" || input.validity !== "valid") return fail("vocal_assignment_identity_invalid");
  if (!Array.isArray(input.inputRefs) || !input.inputRefs.every((item) => typeof item === "string" && item.length > 0)) return fail("vocal_assignment_input_refs_invalid");
  if (!Array.isArray(input.data) || !input.data.every(validParameter)) return fail("vocal_assignment_parameters_invalid");
  const parameters = input.data as ActiveParameter[];
  const names = parameters.map((item) => item.technical_name);
  if (new Set(names).size !== names.length) return fail("vocal_assignment_duplicate_technical_name");
  return {
    ok: true,
    bank: {
      parameters,
      inputRefs: input.inputRefs as string[],
      provenance: Object.fromEntries(parameters.map((parameter) => [parameter.technical_name, { sourceArtifactId: input.artifactId, sourceActionId: "vocal_allocation.search" as const }])),
    },
  };
}

/** Validate an intersection result before the same protected Stage import path used by R. */
export function validateBankSetIntersectionData(
  artifact: { runId?: string; stageId?: string; attemptId?: string; artifactId?: string; actionId?: string; schemaVersion?: number; kind?: string; bankId?: string | null; pass?: string | null; validity?: string; inputRefs?: unknown; data?: unknown },
  inputs: MergeInput[],
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (!artifact.runId || !artifact.stageId || !artifact.attemptId || !artifact.artifactId || artifact.actionId !== "data.intersection" || artifact.schemaVersion !== 1 || artifact.kind !== "parameter-bank" || artifact.bankId !== "intersection" || artifact.pass !== "intersection" || artifact.validity !== "valid") return fail("artifact_identity_or_validity_invalid");
  if (inputs.length !== 2 || new Set(inputs.map((input) => input.artifactId)).size !== 2
    || !inputs.every((input) => input.actionId === "text.qwen.resolved" && input.bankId === "qwen-text" && input.pass === "resolved"
      || input.actionId === "text.gemma.awtd" && input.bankId === "gemma-text" && input.pass === "awtd")) return fail("input_order_or_contract_invalid");
  const data = artifact.data;
  if (!isObject(data) || data.schema !== "am_stage_bank_set_v1" || data.operation !== "intersection" || !Array.isArray(data.parameters) || !isObject(data.provenance) || !Array.isArray(data.inputRefs) || !isObject(data.set)) return fail("intersection_payload_invalid");
  const set = data.set;
  if (set.key !== "technical_name" || set.order !== "source-order" || !["from_a", "from_b"].includes(String(set.valuePolicy)) || JSON.stringify(data.inputRefs) !== JSON.stringify(inputs.map((input) => input.artifactId))) return fail("intersection_policy_or_input_refs_invalid");
  if (!Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify(inputs.map((input) => input.artifactId))) return fail("artifact_input_refs_invalid");
  const names = new Set<string>();
  for (const row of data.parameters) { if (!validParameter(row) || names.has(row.technical_name)) return fail("parameter_invalid_or_duplicate"); names.add(row.technical_name); }
  const provenance = data.provenance as Record<string, unknown>;
  if (Object.keys(provenance).length !== names.size) return fail("provenance_shape_invalid");
  const valueSource = set.valuePolicy === "from_a" ? inputs[0] : inputs[1];
  const otherSource = set.valuePolicy === "from_a" ? inputs[1] : inputs[0];
  const valueRows = Array.isArray(valueSource.data) ? valueSource.data : [];
  const otherRows = Array.isArray(otherSource.data) ? otherSource.data : [];
  const expectedKeys = valueRows.filter((candidate) => isObject(candidate) && typeof candidate.technical_name === "string" && otherRows.some((other) => isObject(other) && other.technical_name === candidate.technical_name)).map((candidate) => (candidate as Record<string, unknown>).technical_name as string);
  if (JSON.stringify((data.parameters as ActiveParameter[]).map((row) => row.technical_name)) !== JSON.stringify(expectedKeys)) return fail("intersection_membership_or_order_invalid");
  for (const row of data.parameters as ActiveParameter[]) {
    const winner = provenance[row.technical_name];
    if (!isObject(winner)) return fail("winning_provenance_missing");
    const input = inputs.find((item) => item.artifactId === winner.sourceArtifactId && item.actionId === winner.sourceActionId);
    if (!input || !Array.isArray(input.data) || !input.data.some((candidate) => validParameter(candidate) && candidate.technical_name === row.technical_name && stable(candidate) === stable(row))) return fail("winning_provenance_not_in_input");
    if (input.artifactId !== valueSource.artifactId) return fail("winning_provenance_violates_value_policy");
    const other = inputs.find((item) => item.artifactId !== input.artifactId);
    if (!other || !Array.isArray(other.data) || !other.data.some((candidate) => validParameter(candidate) && candidate.technical_name === row.technical_name)) return fail("intersection_membership_invalid");
  }
  return { ok: true, bank: { parameters: data.parameters as ActiveParameter[], inputRefs: inputs.map((item) => item.artifactId), provenance: provenance as Record<string, WinningSource> } };
}

/** Validate a difference result against its saved set policy and both source banks. */
export function validateBankSetDifferenceData(
  artifact: { runId?: string; stageId?: string; attemptId?: string; artifactId?: string; actionId?: string; schemaVersion?: number; kind?: string; bankId?: string | null; pass?: string | null; validity?: string; inputRefs?: unknown; data?: unknown },
  inputs: MergeInput[],
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (!artifact.runId || !artifact.stageId || !artifact.attemptId || !artifact.artifactId || artifact.actionId !== "data.difference" || artifact.schemaVersion !== 1 || artifact.kind !== "parameter-bank" || artifact.bankId !== "difference" || artifact.pass !== "difference" || artifact.validity !== "valid") return fail("artifact_identity_or_validity_invalid");
  if (inputs.length !== 2 || new Set(inputs.map((input) => input.artifactId)).size !== 2
    || !inputs.every((input) => input.actionId === "text.qwen.resolved" && input.bankId === "qwen-text" && input.pass === "resolved"
      || input.actionId === "text.gemma.awtd" && input.bankId === "gemma-text" && input.pass === "awtd")) return fail("input_order_or_contract_invalid");
  const data = artifact.data;
  if (!isObject(data) || data.schema !== "am_stage_bank_set_v1" || data.operation !== "difference" || !Array.isArray(data.parameters) || !isObject(data.provenance) || !Array.isArray(data.inputRefs) || !isObject(data.set)) return fail("difference_payload_invalid");
  const set = data.set;
  const mode = set.mode;
  if (set.key !== "technical_name" || set.order !== "source-order" || !["a_minus_b", "b_minus_a", "symmetric"].includes(String(mode)) || JSON.stringify(data.inputRefs) !== JSON.stringify(inputs.map((input) => input.artifactId))) return fail("difference_policy_or_input_refs_invalid");
  if (!Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify(inputs.map((input) => input.artifactId))) return fail("artifact_input_refs_invalid");
  const rows = inputs.map((input) => Array.isArray(input.data) ? input.data : null);
  if (!rows[0] || !rows[1] || !rows[0].every(validParameter) || !rows[1].every(validParameter)) return fail("difference_input_parameters_invalid");
  const keysA = new Set((rows[0] as ActiveParameter[]).map((row) => row.technical_name));
  const keysB = new Set((rows[1] as ActiveParameter[]).map((row) => row.technical_name));
  const selected = mode === "a_minus_b"
    ? (rows[0] as ActiveParameter[]).filter((row) => !keysB.has(row.technical_name)).map((row) => ({ row, input: inputs[0]! }))
    : mode === "b_minus_a"
      ? (rows[1] as ActiveParameter[]).filter((row) => !keysA.has(row.technical_name)).map((row) => ({ row, input: inputs[1]! }))
      : [
          ...(rows[0] as ActiveParameter[]).filter((row) => !keysB.has(row.technical_name)).map((row) => ({ row, input: inputs[0]! })),
          ...(rows[1] as ActiveParameter[]).filter((row) => !keysA.has(row.technical_name)).map((row) => ({ row, input: inputs[1]! })),
        ];
  if (JSON.stringify(data.parameters.map(stable)) !== JSON.stringify(selected.map(({ row }) => stable(row)))) return fail("difference_membership_order_or_value_invalid");
  const provenance = data.provenance as Record<string, unknown>;
  if (Object.keys(provenance).length !== selected.length) return fail("provenance_shape_invalid");
  for (const { row, input } of selected) {
    const winner = provenance[row.technical_name];
    if (!isObject(winner) || winner.sourceArtifactId !== input.artifactId || winner.sourceActionId !== input.actionId) return fail("winning_provenance_invalid");
  }
  return { ok: true, bank: { parameters: data.parameters as ActiveParameter[], inputRefs: inputs.map((item) => item.artifactId), provenance: provenance as Record<string, WinningSource> } };
}

/** Validate the server consensus result as its own Stage-2 output, never as a merge artifact. */
export function validateServerStage2ParameterBankData(
  artifact: { artifactId: string; actionId: string; bankId: string | null; pass: string | null; validity: string; inputRefs: unknown; data: unknown },
  inputs: Stage2ServerInput[],
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (artifact.actionId !== "stage2.server" || artifact.bankId !== "server-stage2" || artifact.pass !== "stage2" || artifact.validity !== "valid") return fail("stage2_artifact_identity_or_validity_invalid");
  const refs = inputs.map((input) => input.artifactId);
  if (!inputs.length || new Set(refs).size !== refs.length || !Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify(refs)) return fail("stage2_input_refs_invalid");
  const data = artifact.data;
  if (!isObject(data) || !Array.isArray(data.stage2_hits) || !isObject(data.stage2_meta)) return fail("stage2_payload_invalid");
  const meta = data.stage2_meta;
  if (!(meta.text_index === "qwen3" || meta.text_index === "embeddinggemma2") || typeof meta.model !== "string" || !meta.model.trim() || !Number.isInteger(meta.dimensions) || Number(meta.dimensions) <= 0 || meta.query_method !== "weighted_centroid_of_stage1_text_vectors" || !Array.isArray(meta.seed_names) || !meta.seed_names.every((name) => typeof name === "string" && name.trim()) || new Set(meta.seed_names).size !== meta.seed_names.length || !Number.isInteger(meta.excluded_stage1_names)) return fail("stage2_meta_invalid");
  const parameterRowsOf = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value;
    if (!isObject(value)) return null;
    if (Array.isArray(value.results)) return value.results;
    if (Array.isArray(value.segments) && value.segments.every((segment) => isObject(segment) && Array.isArray(segment.parameters))) return value.segments.flatMap((segment) => (segment as { parameters: unknown[] }).parameters);
    return null;
  };
  const seedRows: ActiveParameter[] = [];
  for (const input of inputs) {
    if (input.kind === "brief" && ["brief.from_template", "brief.from_crystal"].includes(input.actionId) && input.validity === "valid") {
      if (!isObject(input.data) || typeof input.data.text !== "string" || !input.data.text.trim()) return fail("stage2_brief_input_invalid");
      continue;
    }
    if (input.kind !== "parameter-bank" || input.validity !== "valid" || !["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved"].includes(input.actionId)) return fail("stage2_input_contract_invalid");
    const rows = parameterRowsOf(input.data);
    if (!rows || !rows.every(validParameter)) return fail("stage2_input_parameters_invalid");
    seedRows.push(...rows as ActiveParameter[]);
  }
  const seedNames = [...new Set(seedRows.map((row) => row.technical_name))];
  if (JSON.stringify(meta.seed_names) !== JSON.stringify(seedNames) || meta.excluded_stage1_names !== seedNames.length) return fail("stage2_seed_identity_mismatch");
  const hits = data.stage2_hits;
  const hitNames: string[] = [];
  for (const hit of hits) {
    if (!validParameter(hit) || hit.source !== "stage2" || hit.excluded === true || seedNames.includes(hit.technical_name) || hitNames.includes(hit.technical_name)) return fail("stage2_hit_invalid_or_not_new");
    hitNames.push(hit.technical_name);
  }
  return { ok: true, bank: { parameters: hits as ActiveParameter[], inputRefs: refs, provenance: Object.fromEntries(hitNames.map((name) => [name, { sourceArtifactId: artifact.artifactId, sourceActionId: "stage2.server" as const }])) } };
}

/** Validate a persisted filter bank against its single bound source and saved rules. */
export function validateFilteredParameterBankData(
  artifact: { artifactId: string; actionId: string; validity: string; inputRefs: unknown; data: unknown },
  input: ParameterBankInput,
  rules: Array<{ field: string; op: string; value?: unknown }>,
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (artifact.actionId !== "data.filter" || artifact.validity !== "valid" || !Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify([input.artifactId])) return fail("filter_identity_or_input_refs_invalid");
  const inputRows = Array.isArray(input.data) ? input.data : input.data && typeof input.data === "object" && Array.isArray((input.data as { parameters?: unknown }).parameters) ? (input.data as { parameters: unknown[] }).parameters : null;
  if (!inputRows || !Array.isArray(rules) || rules.length === 0) return fail("filter_input_or_rules_invalid");
  let expected: Record<string, unknown>[];
  try { expected = filterFlowRows({ artifactId: input.artifactId, actionId: input.actionId, kind: "parameter-bank", validity: "valid", data: input.data }, rules); }
  catch { return fail("filter_rules_or_input_invalid"); }
  const data = artifact.data;
  const parameters = Array.isArray(data) ? data : isObject(data) && Array.isArray(data.parameters) ? data.parameters : null;
  if (!parameters || JSON.stringify(parameters.map(stable)) !== JSON.stringify(expected.map(stable))) return fail("filter_membership_or_order_invalid");
  const names = new Set<string>();
  for (const row of parameters) { if (!validParameter(row) || names.has(row.technical_name)) return fail("parameter_invalid_or_duplicate"); names.add(row.technical_name); }
  const provenance = Object.fromEntries((parameters as ActiveParameter[]).map((row) => [row.technical_name, { sourceArtifactId: artifact.artifactId, sourceActionId: "data.filter" as const }]));
  return { ok: true, bank: { parameters: parameters as ActiveParameter[], inputRefs: [input.artifactId], provenance } };
}

/** Validate one named data.split parameter-bank output against its saved source and channel rules. */
export function validateDataSplitParameterBankData(
  artifact: { artifactId: string; actionId: string; outputPort?: unknown; kind?: string; bankId?: string | null; pass?: string | null; validity: string; inputRefs: unknown; data: unknown },
  input: ParameterBankInput & { kind?: string; bankId?: string | null; pass?: string | null; validity?: string },
  channels: unknown,
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (artifact.actionId !== "data.split" || artifact.kind !== "parameter-bank" || artifact.validity !== "valid" || typeof artifact.outputPort !== "string" || !artifact.outputPort) return fail("split_artifact_identity_or_validity_invalid");
  if (input.kind !== "parameter-bank" || input.validity !== "valid" || !input.artifactId || input.artifactId === artifact.artifactId) return fail("split_input_identity_or_validity_invalid");
  if (!Array.isArray(channels) || validateDataSplitChannels(channels).length) return fail("split_channels_invalid");
  const selectedChannel = artifact.outputPort === "unmatched" ? null : (channels as DataSplitChannel[]).find((channel) => channel.name === artifact.outputPort);
  if (artifact.outputPort !== "unmatched" && !selectedChannel) return fail("split_output_port_invalid");
  if ((artifact.bankId ?? null) !== (input.bankId ?? null) || (artifact.pass ?? null) !== (input.pass ?? null)) return fail("split_bank_identity_mismatch");
  if (!Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify([input.artifactId])) return fail("split_input_refs_invalid");
  const inputData = input.data;
  const inputRows = Array.isArray(inputData) ? inputData : isObject(inputData) && Array.isArray(inputData.parameters) ? inputData.parameters : null;
  if (!inputRows || !inputRows.every(validParameter) || new Set(inputRows.map((row) => row.technical_name)).size !== inputRows.length) return fail("split_input_bank_invalid");
  let expected: unknown;
  try {
    const result = splitAutomationArtifact({ artifactId: input.artifactId, kind: "parameter-bank", data: inputData }, channels as DataSplitChannel[]);
    expected = artifact.outputPort === "unmatched" ? result.unmatched.data : result.channels.find((channel) => channel.name === selectedChannel?.name)?.data;
  } catch {
    return fail("split_channel_evaluation_failed");
  }
  if (expected === undefined || stable(expected) !== stable(artifact.data)) return fail("split_membership_order_or_payload_invalid");
  const parameters = Array.isArray(artifact.data) ? artifact.data : isObject(artifact.data) && Array.isArray(artifact.data.parameters) ? artifact.data.parameters : null;
  if (!parameters || !parameters.every(validParameter) || new Set(parameters.map((row) => row.technical_name)).size !== parameters.length) return fail("split_output_parameters_invalid");
  const provenance: Record<string, WinningSource> = Object.fromEntries((parameters as ActiveParameter[]).map((row) => [row.technical_name, { sourceArtifactId: artifact.artifactId, sourceActionId: "data.split" as const }]));
  return { ok: true, bank: { parameters: parameters as ActiveParameter[], inputRefs: [input.artifactId], provenance } };
}

/** Validate join output as an ordered first-wins union of the exact accepted input artifacts. */
export function validateJoinedParameterBankData(
  artifact: { artifactId: string; actionId: string; validity: string; inputRefs: unknown; data: unknown },
  inputs: ParameterBankInput[],
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  const data = artifact.data;
  if (artifact.actionId !== "flow.join" || artifact.validity !== "valid" || !isObject(data) || data.schema !== "am2_param_bank_v1" || !Array.isArray(data.parameters) || !isObject(data.provenance) || !Array.isArray(data.inputRefs) || !Array.isArray(data.joinReport)) return fail("join_payload_invalid");
  const refs = inputs.map((input) => input.artifactId);
  if (!inputs.length || new Set(refs).size !== refs.length || JSON.stringify(artifact.inputRefs) !== JSON.stringify(refs) || JSON.stringify(data.inputRefs) !== JSON.stringify(refs)) return fail("join_input_refs_invalid");
  const expectedRows = new Map<string, { row: Record<string, unknown>; input: ParameterBankInput }>();
  for (const input of inputs) {
    const rows = Array.isArray(input.data) ? input.data : isObject(input.data) && Array.isArray(input.data.parameters) ? input.data.parameters : null;
    if (!rows) return fail("join_input_data_invalid");
    for (const row of rows) {
      if (!isObject(row) || typeof row.technical_name !== "string" || !row.technical_name.trim()) return fail("join_input_parameter_invalid");
      if (!expectedRows.has(row.technical_name)) expectedRows.set(row.technical_name, { row, input });
    }
  }
  const parameters = data.parameters;
  if (JSON.stringify(parameters.map(stable)) !== JSON.stringify([...expectedRows.values()].map(({ row }) => stable(row)))) return fail("join_membership_order_or_value_invalid");
  const provenance = data.provenance as Record<string, unknown>;
  if (Object.keys(provenance).length !== expectedRows.size) return fail("join_provenance_shape_invalid");
  const names = new Set<string>();
  for (const row of parameters) {
    if (!validParameter(row) || names.has(row.technical_name)) return fail("parameter_invalid_or_duplicate");
    names.add(row.technical_name);
    const expected = expectedRows.get(row.technical_name)!;
    const winner = provenance[row.technical_name];
    if (!isObject(winner) || winner.sourceArtifactId !== expected.input.artifactId || winner.sourceActionId !== expected.input.actionId) return fail("join_winning_provenance_invalid");
  }
  return { ok: true, bank: { parameters: parameters as ActiveParameter[], inputRefs: refs, provenance: provenance as Record<string, WinningSource> } };
}

/** Validate data.select's parameter-bank mode against the server-loaded source bank. */
export function validateSelectedParameterBankData(
  artifact: { artifactId: string; actionId: string; validity: string; inputRefs: unknown; data: unknown },
  input: ParameterBankInput,
  settings: { mode: unknown; fields: unknown },
): { ok: true; bank: ValidatedMergeBank } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (artifact.actionId !== "data.select" || artifact.validity !== "valid") return fail("select_identity_or_validity_invalid");
  if (input.actionId === "data.select" && input.artifactId === artifact.artifactId) return fail("select_input_identity_invalid");
  if (!Array.isArray(artifact.inputRefs) || JSON.stringify(artifact.inputRefs) !== JSON.stringify([input.artifactId])) return fail("select_input_refs_invalid");
  if (settings.mode !== "parameters_by_name" || !Array.isArray(settings.fields) || settings.fields.length === 0 || !settings.fields.every((field) => typeof field === "string" && field.trim())) return fail("select_mode_or_fields_invalid");
  const inputData = input.data;
  const inputRows = Array.isArray(inputData) ? inputData : isObject(inputData) && Array.isArray(inputData.parameters) ? inputData.parameters : null;
  if (!inputRows || !inputRows.every(validParameter)) return fail("select_input_bank_invalid");
  const wanted = new Set(settings.fields as string[]);
  if (wanted.size !== settings.fields.length) return fail("select_fields_duplicate");
  const expectedRows = inputRows.filter((row) => wanted.has(row.technical_name));
  const data = artifact.data;
  if (!isObject(data) || data.schema !== "am2_param_bank_v1" || !Array.isArray(data.parameters) || !isObject(data.provenance) && data.provenance !== undefined) return fail("select_payload_invalid");
  const parameters = data.parameters;
  if (!parameters.every(validParameter) || JSON.stringify(parameters.map(stable)) !== JSON.stringify(expectedRows.map(stable))) return fail("select_membership_order_or_value_invalid");
  const names = parameters.map((row) => row.technical_name);
  if (new Set(names).size !== names.length) return fail("select_parameter_duplicate");
  const sourceProvenance = isObject(inputData) && isObject(inputData.provenance) ? inputData.provenance : null;
  const expectedProvenance = sourceProvenance
    ? Object.fromEntries(expectedRows.flatMap((row) => sourceProvenance[row.technical_name] === undefined ? [] : [[row.technical_name, sourceProvenance[row.technical_name]]]))
    : {};
  const outputProvenance = isObject(data.provenance) ? data.provenance : {};
  if (stable(outputProvenance) !== stable(expectedProvenance)) return fail("select_provenance_mismatch");
  const provenance: Record<string, WinningSource> = {};
  for (const row of parameters) {
    const winner = outputProvenance[row.technical_name];
    if (winner !== undefined) {
      if (!isWinningSourceValue(winner)) return fail("select_winning_provenance_invalid");
      provenance[row.technical_name] = winner as unknown as WinningSource;
    } else {
      provenance[row.technical_name] = { sourceArtifactId: input.artifactId, sourceActionId: input.actionId as WinningSource["sourceActionId"] };
    }
  }
  return { ok: true, bank: { parameters: parameters as ActiveParameter[], inputRefs: [input.artifactId], provenance } };
}

export function buildMergePreview(existing: ActiveParameter[], state: MergeImportState | null, bank: ValidatedMergeBank): MergePreview {
  const names = new Map(existing.map((row) => [row.technical_name, row]));
  const changes: MergeChange[] = []; const conflicts: MergePreview["conflicts"] = [];
  for (const row of bank.parameters) {
    const source = bank.provenance[row.technical_name];
    if (state?.tombstones.includes(row.technical_name)) { changes.push({ technicalName: row.technical_name, status: "skipped", reason: "tombstoned", source, parameter: row }); continue; }
    const current = names.get(row.technical_name);
    if (!current) { changes.push({ technicalName: row.technical_name, status: "added", source, parameter: row }); continue; }
    const identical = stable(current) === stable(row);
    const reason = identical ? "already_present" : "existing_value_preserved";
    if (!identical) conflicts.push({ technicalName: row.technical_name, reason });
    changes.push({ technicalName: row.technical_name, status: "skipped", reason, source, parameter: row });
  }
  return { target: "v3.active_parameters", policy: MERGE_APPLY_POLICY, counts: { added: changes.filter((item) => item.status === "added").length, updated: 0, skipped: changes.filter((item) => item.status === "skipped").length }, changes, conflicts };
}

export function mergeOperationIdempotencyKey(input: { sessionId: string; source: MergeSource; target: "v3.active_parameters"; policy: typeof MERGE_APPLY_POLICY; operationId: string }) {
  return createHash("sha256").update(JSON.stringify([input.sessionId, input.source.runId, input.source.stageId, input.source.attemptId, input.source.artifactId, input.target, input.policy, input.operationId])).digest("hex");
}

export function applyMergePreview(existing: ActiveParameter[], state: MergeImportState | null, preview: MergePreview, input: { sessionId: string; source: MergeSource; operationId: string; idempotencyKey: string; requestedRevision: string; resultingRevision: string }) {
  if (!input.operationId || input.idempotencyKey !== mergeOperationIdempotencyKey({ sessionId: input.sessionId, source: input.source, target: preview.target, policy: preview.policy, operationId: input.operationId })) throw new Error("idempotency_key_invalid");
  const restored = state ?? { schema: "am_stage_merge_import_v1" as const, tombstones: [], provenance: {}, applied_sources: [], operation_receipts: {} };
  const previous = restored.operation_receipts[input.operationId];
  if (previous) { if (previous.idempotencyKey !== input.idempotencyKey) throw new Error("operation_id_reused"); return { parameters: existing, state: restored, receipt: previous, replayed: true }; }
  const added = new Set(preview.changes.filter((item) => item.status === "added").map((item) => item.technicalName));
  const parameters = [...existing, ...preview.changes.filter((item) => item.status === "added").map((item) => item.parameter)];
  const provenance = { ...restored.provenance };
  for (const item of preview.changes) if (added.has(item.technicalName)) provenance[item.technicalName] = { source: input.source, winningSource: item.source, status: "applied" };
  const receipt: MergeOperationReceipt = { operationId: input.operationId, idempotencyKey: input.idempotencyKey, source: input.source, target: preview.target, policy: preview.policy, requestedRevision: input.requestedRevision, resultingRevision: input.resultingRevision, counts: preview.counts, appliedAt: new Date().toISOString() };
  const alreadyRecorded = restored.applied_sources.some((source) => source.runId === input.source.runId && source.stageId === input.source.stageId && source.attemptId === input.source.attemptId && source.artifactId === input.source.artifactId);
  const nextState: MergeImportState = { ...restored, provenance, applied_sources: alreadyRecorded ? restored.applied_sources : [...restored.applied_sources, input.source], operation_receipts: { ...restored.operation_receipts, [input.operationId]: receipt } };
  return { parameters, state: nextState, receipt, replayed: false };
}

export function applyMergeBank(existing: ActiveParameter[], state: MergeImportState | null, bank: ValidatedMergeBank, input: Parameters<typeof applyMergePreview>[3]) {
  const preview = buildMergePreview(existing, state, bank);
  return applyMergePreview(existing, state, preview, input);
}

export function reconcileMergeImportOnSave(state: MergeImportState | null | undefined, previous: ActiveParameter[], next: ActiveParameter[], explicitlyDeleted: string[] = []): MergeImportState | undefined {
  if (!state) return undefined;
  const byName = new Map(next.map((row) => [row.technical_name, row])); const nextProvenance = { ...state.provenance }; const tombstones = new Set(state.tombstones);
  for (const [name, entry] of Object.entries(nextProvenance)) {
    if (entry.status === "removed") continue;
    const before = previous.find((row) => row.technical_name === name); const after = byName.get(name);
    if (!before) continue;
    if (!after && explicitlyDeleted.includes(name)) { nextProvenance[name] = { ...entry, status: "removed" }; tombstones.add(name); }
    else if (after && stable(before) !== stable(after)) nextProvenance[name] = { ...entry, status: "manually_modified" };
  }
  return { ...state, provenance: nextProvenance, tombstones: [...tombstones] };
}
