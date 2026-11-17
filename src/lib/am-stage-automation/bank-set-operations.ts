export type BankSetMode = "a_minus_b" | "b_minus_a" | "symmetric";
export type BankSetOperationInput = { artifactId: string; actionId: string; data: unknown };
export type BankSetProvenance = { sourceArtifactId: string; sourceActionId: string };

export type BankSetResult = {
  parameters: Record<string, unknown>[];
  provenance: Record<string, BankSetProvenance>;
  inputRefs: string[];
  operation: "intersection" | "difference";
  settings: { key: "technical_name"; valuePolicy?: "from_a" | "from_b"; mode?: BankSetMode };
};

function rowsOf(data: unknown, source: string): Record<string, unknown>[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { parameters?: unknown }).parameters)
      ? (data as { parameters: unknown[] }).parameters
      : null;
  if (!rows) throw new Error(`BANK_SET_INPUT_INVALID: ${source} must contain a parameters array.`);
  const seen = new Set<string>();
  return rows.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`BANK_SET_INPUT_INVALID: ${source} entry ${index + 1} is not an object.`);
    const row = item as Record<string, unknown>;
    if (typeof row.technical_name !== "string" || !row.technical_name.trim()) throw new Error(`BANK_SET_INPUT_INVALID: ${source} entry ${index + 1} has no technical_name.`);
    if (seen.has(row.technical_name)) throw new Error(`BANK_SET_INPUT_INVALID: ${source} contains duplicate key '${row.technical_name}'.`);
    seen.add(row.technical_name);
    return row;
  });
}

function assertInputs(inputs: readonly [BankSetOperationInput, BankSetOperationInput]) {
  if (!inputs[0].artifactId || !inputs[1].artifactId || inputs[0].artifactId === inputs[1].artifactId
    || !inputs[0].actionId || !inputs[1].actionId) {
    throw new Error("BANK_SET_PROVENANCE_REQUIRED: two distinct artifact identities and action IDs are required.");
  }
  return [rowsOf(inputs[0].data, "a"), rowsOf(inputs[1].data, "b")] as const;
}

/** Parameter banks are sets by technical_name; output order follows the selected source order. */
export function intersectParameterBanks(
  inputs: readonly [BankSetOperationInput, BankSetOperationInput],
  valuePolicy: "from_a" | "from_b" = "from_a",
): BankSetResult {
  if (valuePolicy !== "from_a" && valuePolicy !== "from_b") throw new Error("BANK_SET_POLICY_INVALID: valuePolicy must be from_a or from_b.");
  const [a, b] = assertInputs(inputs);
  const aByKey = new Map(a.map((row) => [row.technical_name as string, row]));
  const bByKey = new Map(b.map((row) => [row.technical_name as string, row]));
  const ordered = valuePolicy === "from_a" ? a : b;
  const winningInput = valuePolicy === "from_a" ? inputs[0] : inputs[1];
  const parameters: Record<string, unknown>[] = [];
  const provenance: Record<string, BankSetProvenance> = {};
  for (const candidate of ordered) {
    const key = candidate.technical_name as string;
    if (!aByKey.has(key) || !bByKey.has(key)) continue;
    const winner = valuePolicy === "from_a" ? aByKey.get(key)! : bByKey.get(key)!;
    parameters.push(winner);
    provenance[key] = { sourceArtifactId: winningInput.artifactId, sourceActionId: winningInput.actionId };
  }
  return { parameters, provenance, inputRefs: inputs.map((item) => item.artifactId), operation: "intersection", settings: { key: "technical_name", valuePolicy } };
}

export function subtractParameterBanks(
  inputs: readonly [BankSetOperationInput, BankSetOperationInput],
  mode: BankSetMode = "a_minus_b",
): BankSetResult {
  if (!["a_minus_b", "b_minus_a", "symmetric"].includes(mode)) throw new Error("BANK_SET_POLICY_INVALID: unsupported difference mode.");
  const [a, b] = assertInputs(inputs);
  const aKeys = new Set(a.map((row) => row.technical_name as string));
  const bKeys = new Set(b.map((row) => row.technical_name as string));
  const aOnly = a.filter((row) => !bKeys.has(row.technical_name as string));
  const bOnly = b.filter((row) => !aKeys.has(row.technical_name as string));
  const selected = mode === "a_minus_b" ? [[aOnly, inputs[0]] as const]
    : mode === "b_minus_a" ? [[bOnly, inputs[1]] as const]
      : [[aOnly, inputs[0]] as const, [bOnly, inputs[1]] as const];
  const parameters = selected.flatMap(([rows]) => rows);
  const provenance: Record<string, BankSetProvenance> = {};
  for (const [rows, input] of selected) for (const row of rows) provenance[row.technical_name as string] = { sourceArtifactId: input.artifactId, sourceActionId: input.actionId };
  return { parameters, provenance, inputRefs: inputs.map((item) => item.artifactId), operation: "difference", settings: { key: "technical_name", mode } };
}
