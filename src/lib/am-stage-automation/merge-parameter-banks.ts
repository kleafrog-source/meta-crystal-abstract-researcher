export type MergePolicy = "keep_first" | "keep_last" | "error";

export interface ParameterBankMergeInput {
  artifactId: string;
  actionId: string;
  data: unknown;
}

export interface MergedParameterProvenance {
  sourceArtifactId: string;
  sourceActionId: string;
}

export interface ParameterBankMergeResult {
  parameters: Record<string, unknown>[];
  provenance: Record<string, MergedParameterProvenance>;
  duplicates: number;
  conflicts: Array<{ key: string; first: unknown; second: unknown }>;
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { parameters?: unknown }).parameters)
      ? (data as { parameters: unknown[] }).parameters
      : null;
  if (!rows) throw new Error("MERGE_BANK_INVALID: bank data must be an array or contain a parameters array.");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`MERGE_BANK_INVALID: entry ${index + 1} is not an object.`);
    const record = row as Record<string, unknown>;
    if (typeof record.technical_name !== "string" || !record.technical_name.trim()) throw new Error(`MERGE_BANK_INVALID: entry ${index + 1} has no stable technical_name.`);
    return record;
  });
}

// technical_name is the stable key. Only an actually present selected value
// participates in conflict comparison; catalogue defaults are never substituted.
export function mergeParameterBanks(
  inputs: readonly ParameterBankMergeInput[],
  policies: { duplicates: MergePolicy; conflicts: MergePolicy },
): ParameterBankMergeResult {
  if (inputs.length < 2 || inputs.length > 8) {
    throw new Error("MERGE_INPUT_COUNT_INVALID: data.merge accepts between two and eight inputs.");
  }
  if (!["keep_first", "keep_last", "error"].includes(policies.duplicates)
    || !["keep_first", "keep_last", "error"].includes(policies.conflicts)) {
    throw new Error("MERGE_POLICY_INVALID: duplicate and conflict policies must be keep_first, keep_last, or error.");
  }
  const byKey = new Map<string, { record: Record<string, unknown>; provenance: MergedParameterProvenance; comparableValue: unknown }>();
  const conflicts: ParameterBankMergeResult["conflicts"] = [];
  let duplicates = 0;

  for (const input of inputs) {
    if (!input.artifactId || !input.actionId) throw new Error("MERGE_BANK_PROVENANCE_REQUIRED: each input needs its artifact and action identity.");
    for (const record of rowsOf(input.data)) {
      const key = record.technical_name as string;
      const comparableValue = Object.prototype.hasOwnProperty.call(record, "selected_value")
        ? record.selected_value
        : Object.prototype.hasOwnProperty.call(record, "current_value")
          ? record.current_value
        : undefined;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { record, comparableValue, provenance: { sourceArtifactId: input.artifactId, sourceActionId: input.actionId } });
        continue;
      }

      duplicates += 1;
      const identical = JSON.stringify(existing.comparableValue) === JSON.stringify(comparableValue);
      if (!identical) {
        conflicts.push({ key, first: existing.comparableValue, second: comparableValue });
        if (policies.conflicts === "error") {
          throw Object.assign(new Error(`MERGE_CONFLICT: key "${key}" has different current/default values.`), { code: "MERGE_CONFLICT" });
        }
        if (policies.conflicts === "keep_last") {
          byKey.set(key, { record, comparableValue, provenance: { sourceArtifactId: input.artifactId, sourceActionId: input.actionId } });
        }
        continue;
      }

      if (policies.duplicates === "error") {
        throw Object.assign(new Error(`MERGE_DUPLICATE: key "${key}" appears more than once.`), { code: "MERGE_DUPLICATE" });
      }
      if (policies.duplicates === "keep_last") {
        byKey.set(key, { record, comparableValue, provenance: { sourceArtifactId: input.artifactId, sourceActionId: input.actionId } });
      }
    }
  }

  const entries = [...byKey.entries()];
  return {
    parameters: entries.map(([, value]) => value.record),
    provenance: Object.fromEntries(entries.map(([key, value]) => [key, value.provenance])),
    duplicates,
    conflicts,
  };
}
