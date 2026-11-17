export type DataSplitRule =
  | { type: "by_index_modulo"; modulus: number; remainder: number }
  | { type: "by_field"; field: string; equals: string }
  | { type: "index_range"; from: number; to: number };

export type DataSplitChannel = { name: string; rule: DataSplitRule };
export type DataSplitArtifact = { artifactId?: string; kind: string; data: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (!isRecord(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

export function validateDataSplitChannels(value: unknown): string[] {
  const issues: string[] = [];
  if (!Array.isArray(value) || value.length === 0) return ["At least one split channel is required."];
  const names = new Set<string>();
  for (const channel of value) {
    if (!isRecord(channel)) { issues.push("Each split channel must be an object."); continue; }
    const name = channel.name;
    if (typeof name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/u.test(name) || name === "unmatched" || names.has(name)) {
      issues.push(`Split channel name '${String(name ?? "")}' is invalid, reserved, or duplicated.`);
    } else names.add(name);
    const rule = channel.rule;
    if (!isRecord(rule)) { issues.push(`Split channel '${String(name ?? "?")}' requires a rule.`); continue; }
    if (rule.type === "by_index_modulo") {
      if (!Number.isInteger(rule.modulus) || Number(rule.modulus) < 1 || !Number.isInteger(rule.remainder) || Math.abs(Number(rule.remainder)) >= Number(rule.modulus)) {
        issues.push(`Split channel '${String(name ?? "?")}' requires a positive integer modulus and a remainder within its range.`);
      }
    } else if (rule.type === "by_field") {
      if (typeof rule.field !== "string" || !rule.field.trim() || typeof rule.equals !== "string") issues.push(`Split channel '${String(name ?? "?")}' requires a field path and string match value.`);
    } else if (rule.type === "index_range") {
      if (!Number.isInteger(rule.from) || !Number.isInteger(rule.to) || Number(rule.from) < 0 || Number(rule.to) < Number(rule.from)) {
        issues.push(`Split channel '${String(name ?? "?")}' requires a non-negative inclusive index range.`);
      }
    } else issues.push(`Split channel '${String(name ?? "?")}' uses an unsupported rule type.`);
  }
  return [...new Set(issues)];
}

export function dataSplitOutputDefinitions(channels: unknown, kind: string) {
  const names = Array.isArray(channels)
    ? channels.flatMap((item) => isRecord(item) && typeof item.name === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/u.test(item.name) && item.name !== "unmatched" ? [item.name] : [])
    : [];
  return [...new Set([...names, "unmatched"])].map((port) => ({ port, kind, required: false }));
}

function matches(index: number, row: Record<string, unknown>, rule: DataSplitRule): boolean {
  if (rule.type === "by_index_modulo") return Math.abs(index % rule.modulus) === Math.abs(rule.remainder);
  if (rule.type === "by_field") return String(readPath(row, rule.field) ?? "") === rule.equals;
  return index >= rule.from && index <= rule.to;
}

function rowsOf(artifact: DataSplitArtifact): { key: "parameters" | "records" | null; rows: Record<string, unknown>[]; envelope: Record<string, unknown> | null } {
  if (Array.isArray(artifact.data)) {
    if (artifact.data.some((row) => !isRecord(row))) throw new Error("DATA_SPLIT_INPUT_INVALID: input contains a non-object row.");
    return { key: null, rows: artifact.data as Record<string, unknown>[], envelope: null };
  }
  if (!isRecord(artifact.data)) throw new Error("DATA_SPLIT_INPUT_INVALID: input data must contain a row array.");
  const key = artifact.kind === "parameter-bank" ? "parameters" : "records";
  const rows = artifact.data[key];
  if (!Array.isArray(rows) || rows.some((row) => !isRecord(row))) throw new Error(`DATA_SPLIT_INPUT_INVALID: ${artifact.kind} data must contain an object array '${key}'.`);
  return { key, rows: rows as Record<string, unknown>[], envelope: artifact.data };
}

/** Fan-out is intentionally overlapping: each row is copied to every matching channel. */
export function splitAutomationArtifact(input: DataSplitArtifact, channels: DataSplitChannel[]) {
  if (input.kind !== "parameter-bank" && input.kind !== "record-set") throw new Error("DATA_SPLIT_INPUT_INVALID: only parameter-bank and record-set artifacts can be split.");
  const problems = validateDataSplitChannels(channels);
  if (problems.length) throw new Error(`DATA_SPLIT_CHANNELS_INVALID: ${problems.join(" ")}`);
  const { key, rows, envelope } = rowsOf(input);
  const selected = new Map(channels.map((channel) => [channel.name, [] as Record<string, unknown>[]]));
  const unmatched: Record<string, unknown>[] = [];
  rows.forEach((row, index) => {
    let matched = false;
    for (const channel of channels) {
      if (matches(index, row, channel.rule)) { selected.get(channel.name)!.push(row); matched = true; }
    }
    if (!matched) unmatched.push(row);
  });
  const dataFor = (name: string, items: Record<string, unknown>[]) => {
    // Keep array-shaped inputs array-shaped; the executor stores inputRefs on
    // the artifact envelope, so attaching metadata here must not change data's
    // schema. Object payloads retain their original envelope fields.
    if (!key || !envelope) return items;
    const enriched = { ...envelope, [key]: items };
    const provenance = enriched.provenance;
    const keptKeys = new Set(items.map((row) => row.technical_name).filter((value): value is string => typeof value === "string"));
    return {
      ...enriched,
      ...(isRecord(provenance) ? { provenance: Object.fromEntries(Object.entries(provenance).filter(([technicalName]) => keptKeys.has(technicalName))) } : {}),
      channel: name,
      inputRefs: input.artifactId ? [input.artifactId] : [],
    };
  };
  return {
    channels: channels.map((channel) => ({ name: channel.name, rows: selected.get(channel.name)!, data: dataFor(channel.name, selected.get(channel.name)!) })),
    unmatched: { rows: unmatched, data: dataFor("unmatched", unmatched) },
    inputCount: rows.length,
    unmatchedCount: unmatched.length,
  };
}

