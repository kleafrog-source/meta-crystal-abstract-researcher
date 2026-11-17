import { mergeParameterBanks, type MergePolicy } from "./merge-parameter-banks";

export interface MergeableAutomationArtifact {
  artifactId: string;
  actionId: string;
  kind: string;
  data: unknown;
}

export interface MergeAutomationOptions {
  duplicates: MergePolicy;
  conflicts: MergePolicy;
  fieldKey?: string;
  textSeparator?: string;
}

export interface MergeAutomationResult {
  kind: "parameter-bank" | "record-set" | "text";
  data: Record<string, unknown>;
  metrics: { inputCount: number; total: number; duplicates: number; conflicts: number };
  warnings: string[];
}

type MergeGroup = "parameter-bank" | "record-set" | "text";
type KeyedRow = { key: string; record: Record<string, unknown> };

function groupForKind(kind: string): MergeGroup | null {
  if (kind === "parameter-bank") return "parameter-bank";
  if (kind === "record-set") return "record-set";
  if (kind === "brief" || kind === "text") return "text";
  return null;
}

function inputRefs(inputs: readonly MergeableAutomationArtifact[]) {
  return inputs.map(({ artifactId, actionId }) => ({ artifactId, actionId }));
}

function recordRows(data: unknown, fieldKey: string): KeyedRow[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : null;
  if (!rows) throw new Error("MERGE_RECORD_SET_INVALID: input must be an array or contain a records array.");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`MERGE_RECORD_SET_INVALID: entry ${index + 1} is not an object.`);
    }
    const record = row as Record<string, unknown>;
    return { key: fieldKey ? String(record[fieldKey] ?? "") : JSON.stringify(record), record };
  });
}

function mergeRecordSets(
  inputs: readonly MergeableAutomationArtifact[],
  options: MergeAutomationOptions,
): { records: Record<string, unknown>[]; fields: string[]; provenance: Record<string, { sourceArtifactId: string; sourceActionId: string }>; duplicates: number; conflicts: Array<{ key: string; first: unknown; second: unknown }> } {
  const byKey = new Map<string, { record: Record<string, unknown>; source: MergeableAutomationArtifact; comparableValue: unknown }>();
  const conflicts: Array<{ key: string; first: unknown; second: unknown }> = [];
  let duplicates = 0;

  for (const input of inputs) {
    for (const { key, record } of recordRows(input.data, options.fieldKey ?? "")) {
      const comparableValue = Object.prototype.hasOwnProperty.call(record, "selected_value")
        ? record.selected_value
        : Object.prototype.hasOwnProperty.call(record, "current_value")
          ? record.current_value
        : Object.prototype.hasOwnProperty.call(record, "value") ? record.value : undefined;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { record, source: input, comparableValue });
        continue;
      }

      duplicates += 1;
      const identical = JSON.stringify(existing.comparableValue) === JSON.stringify(comparableValue);
      if (!identical) {
        conflicts.push({ key, first: existing.comparableValue ?? null, second: comparableValue ?? null });
        if (options.conflicts === "error") throw new Error(`MERGE_CONFLICT: key "${key}" has different values.`);
        if (options.conflicts === "keep_last") byKey.set(key, { record, source: input, comparableValue });
      } else if (options.duplicates === "error") {
        throw new Error(`MERGE_DUPLICATE: key "${key}" appears more than once.`);
      } else if (options.duplicates === "keep_last") {
        byKey.set(key, { record, source: input, comparableValue });
      }
    }
  }

  const entries = [...byKey.entries()];
  const fields: string[] = [];
  const fieldSet = new Set<string>();
  for (const [, value] of entries) {
    for (const field of Object.keys(value.record)) {
      if (!fieldSet.has(field)) { fieldSet.add(field); fields.push(field); }
    }
  }
  return {
    records: entries.map(([, value]) => value.record),
    fields,
    provenance: Object.fromEntries(entries.map(([key, value]) => [key, {
      sourceArtifactId: value.source.artifactId,
      sourceActionId: value.source.actionId,
    }])),
    duplicates,
    conflicts,
  };
}

function textBody(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { text?: unknown }).text === "string") {
    return (data as { text: string }).text;
  }
  throw new Error("MERGE_TEXT_INVALID: input must contain text.");
}

export function mergeAutomationArtifacts(
  inputs: readonly MergeableAutomationArtifact[],
  options: MergeAutomationOptions,
): MergeAutomationResult {
  if (inputs.length < 2 || inputs.length > 8) {
    throw new Error("MERGE_INPUT_COUNT_INVALID: data.merge accepts between two and eight inputs.");
  }
  if (!["keep_first", "keep_last", "error"].includes(options.duplicates)
    || !["keep_first", "keep_last", "error"].includes(options.conflicts)) {
    throw new Error("MERGE_POLICY_INVALID: duplicate and conflict policies must be keep_first, keep_last, or error.");
  }
  if (inputs.some((input) => !input.artifactId || !input.actionId)) {
    throw new Error("MERGE_PROVENANCE_REQUIRED: each input needs its artifact and action identity.");
  }

  const groups = inputs.map((input) => groupForKind(input.kind));
  const group = groups[0];
  if (!group || groups.some((candidate) => candidate !== group)) {
    throw new Error(`MERGE_KIND_MISMATCH: all inputs must be parameter-bank, record-set, or text-like; received ${inputs.map((input) => input.kind).join(", ")}.`);
  }

  const refs = inputRefs(inputs);
  if (group === "parameter-bank") {
    const merged = mergeParameterBanks(inputs.map((input) => ({ ...input, data: input.data })), options);
    const warnings = [
      ...(merged.duplicates ? [`Duplicate keys: ${merged.duplicates} (policy: ${options.duplicates}).`] : []),
      ...(merged.conflicts.length ? [`Conflicting values: ${merged.conflicts.length} (policy: ${options.conflicts}).`] : []),
    ];
    return {
      kind: "parameter-bank",
      data: {
        schema: "am_stage_merged_parameter_bank_v1",
        parameters: merged.parameters,
        provenance: merged.provenance,
        merge: { key: "technical_name", duplicatePolicy: options.duplicates, conflictPolicy: options.conflicts, order: "binding-order", inputs: refs },
        metrics: { inputCount: inputs.length, total: merged.parameters.length, duplicates: merged.duplicates, conflicts: merged.conflicts.length },
        inputRefs: refs.map((item) => item.artifactId),
      },
      metrics: { inputCount: inputs.length, total: merged.parameters.length, duplicates: merged.duplicates, conflicts: merged.conflicts.length },
      warnings,
    };
  }

  if (group === "text") {
    const separator = String(options.textSeparator ?? "\\n").replace(/\\n/gu, "\n");
    const parts = inputs.map((input) => textBody(input.data)).filter((text) => text.length > 0);
    const warnings: string[] = [];
    return {
      kind: "text",
      data: {
        schema: "am2_text_v1", text: parts.join(separator), parts: parts.length,
        sources: refs.map((item) => item.artifactId),
        policy: { duplicates: options.duplicates, conflicts: options.conflicts, separator },
        sourceKind: "merge", inputRefs: refs.map((item) => item.artifactId),
      },
      metrics: { inputCount: inputs.length, total: parts.length, duplicates: 0, conflicts: 0 },
      warnings,
    };
  }

  const merged = mergeRecordSets(inputs, options);
  const warnings = [
    ...(merged.duplicates ? [`Duplicate keys: ${merged.duplicates} (policy: ${options.duplicates}).`] : []),
    ...(merged.conflicts.length ? [`Conflicting values: ${merged.conflicts.length} (policy: ${options.conflicts}).`] : []),
  ];
  return {
    kind: "record-set",
    data: {
      schema: "am2_record_set_v1", fields: merged.fields, records: merged.records,
      sourceKind: inputs[0]!.kind, provenance: merged.provenance,
      merge: { fieldKey: options.fieldKey || null, duplicatePolicy: options.duplicates, conflictPolicy: options.conflicts, order: "binding-order", inputs: refs },
      inputRefs: refs.map((item) => item.artifactId),
    },
    metrics: { inputCount: inputs.length, total: merged.records.length, duplicates: merged.duplicates, conflicts: merged.conflicts.length },
    warnings,
  };
}
