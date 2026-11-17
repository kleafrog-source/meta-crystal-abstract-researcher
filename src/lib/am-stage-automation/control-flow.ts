export type FlowArtifact = { artifactId?: string; actionId?: string; kind: string; validity?: string; data: unknown };
export type FlowOperand = { type: "literal"; value: unknown } | { type: "binding"; binding: string; property?: string } | { type: "setting"; key: string };
export type FlowCondition = { left: FlowOperand; op: string; right?: FlowOperand };
export type FlowRule = { id: string; route: string; title?: string; condition: FlowCondition };
export type FlowBindingState = { key: string; status: "present" | "partial" | "skipped" | "failed" | "missing"; artifact?: FlowArtifact };
export type FlowJoinPolicy = { binding: string; port?: string; onSkipped: "omit" | "fail" | "default"; onFailed: "omit" | "fail" | "default"; onPartial: "accept" | "omit" | "fail"; defaultText?: string };

function rowsOf(artifact: FlowArtifact): Record<string, unknown>[] {
  const data = artifact.data;
  const rows = Array.isArray(data) ? data
    : data && typeof data === "object" && Array.isArray((data as { parameters?: unknown }).parameters) ? (data as { parameters: unknown[] }).parameters
      : data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records) ? (data as { records: unknown[] }).records
        : null;
  if (!rows) throw new Error(`FLOW_INPUT_INVALID: ${artifact.kind} input has no record array.`);
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`FLOW_INPUT_INVALID: row ${index + 1} is not an object.`);
    return row as Record<string, unknown>;
  });
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object" || !(key in (current as Record<string, unknown>))) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function operandValue(operand: FlowOperand, bindings: Record<string, FlowArtifact>, settings: Record<string, unknown>): unknown {
  if (operand.type === "literal") return operand.value;
  if (operand.type === "setting") return settings[operand.key];
  const artifact = bindings[operand.binding];
  if (!artifact) throw new Error(`FLOW_BINDING_MISSING: ${operand.binding}`);
  if (operand.property === "count") return rowsOf(artifact).length;
  if (operand.property === "kind") return artifact.kind;
  if (operand.property === "validity") return artifact.validity ?? "valid";
  return operand.property ? readPath(artifact.data, operand.property) : artifact.data;
}

export function validateFlowCondition(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "condition must be an object";
  const condition = value as Record<string, unknown>;
  const operandValid = (operand: unknown) => {
    if (!operand || typeof operand !== "object" || Array.isArray(operand)) return false;
    const item = operand as Record<string, unknown>;
    if (item.type === "literal") return "value" in item;
    if (item.type === "setting") return typeof item.key === "string" && Boolean(item.key.trim());
    return item.type === "binding" && typeof item.binding === "string" && Boolean(item.binding.trim())
      && (item.property === undefined || typeof item.property === "string");
  };
  if (!operandValid(condition.left)) return "left operand is invalid";
  if (!["truthy", "falsy"].includes(String(condition.op)) && (!operandValid(condition.right) || !["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"].includes(String(condition.op)))) return "operator or right operand is invalid";
  return null;
}

export function evaluateFlowCondition(condition: FlowCondition, bindings: Record<string, FlowArtifact>, settings: Record<string, unknown>): { result: boolean; left: unknown; right: unknown; op: string } {
  const left = operandValue(condition.left, bindings, settings);
  const right = condition.right ? operandValue(condition.right, bindings, settings) : undefined;
  const comparable = (a: unknown, b: unknown) => a === b || (a !== undefined && b !== undefined && String(a) === String(b));
  let result: boolean;
  switch (condition.op) {
    case "truthy": result = Boolean(left); break;
    case "falsy": result = !left; break;
    case "eq": result = comparable(left, right); break;
    case "ne": result = !comparable(left, right); break;
    case "gt": result = Number(left) > Number(right); break;
    case "gte": result = Number(left) >= Number(right); break;
    case "lt": result = Number(left) < Number(right); break;
    case "lte": result = Number(left) <= Number(right); break;
    case "contains": result = String(left ?? "").toLocaleLowerCase().includes(String(right ?? "").toLocaleLowerCase()); break;
    case "in": result = Array.isArray(right) ? right.some((item) => comparable(left, item)) : String(right ?? "").split(",").map((item) => item.trim()).includes(String(left)); break;
    default: throw new Error(`FLOW_CONDITION_INVALID: unsupported operator ${condition.op}`);
  }
  return { result, left, right, op: condition.op };
}

export function evaluateFirstMatchRouter(input: { rules: FlowRule[]; fallbackRoute: string; bindings: Record<string, FlowArtifact>; settings: Record<string, unknown> }) {
  const trace = input.rules.map((rule) => ({ id: rule.id, route: rule.route, title: rule.title ?? rule.route, ...evaluateFlowCondition(rule.condition, input.bindings, input.settings) }));
  const first = trace.find((item) => item.result);
  const routes = first ? [first.route] : input.fallbackRoute ? [input.fallbackRoute] : [];
  if (!routes.length) throw new Error("FLOW_ROUTER_NO_MATCH: no rule matched and fallbackRoute is empty.");
  return { routes, usedFallback: !first, trace };
}

export function filterFlowRows(artifact: FlowArtifact, rules: Array<{ field: string; op: string; value?: unknown }>): Record<string, unknown>[] {
  if (!rules.length) throw new Error("FLOW_FILTER_RULES_REQUIRED: add at least one rule.");
  const rows = rowsOf(artifact);
  return rows.filter((row) => rules.every((rule) => {
    const value = readPath(row, rule.field);
    const target = rule.value;
    switch (rule.op) {
      case "eq": return value === target || String(value) === String(target);
      case "ne": return !(value === target || String(value) === String(target));
      case "gt": return Number.isFinite(Number(value)) && Number.isFinite(Number(target)) && Number(value) > Number(target);
      case "gte": return Number.isFinite(Number(value)) && Number.isFinite(Number(target)) && Number(value) >= Number(target);
      case "lt": return Number.isFinite(Number(value)) && Number.isFinite(Number(target)) && Number(value) < Number(target);
      case "lte": return Number.isFinite(Number(value)) && Number.isFinite(Number(target)) && Number(value) <= Number(target);
      case "contains": return String(value ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
      case "in": return (Array.isArray(target) ? target.map(String) : String(target ?? "").split(",").map((item) => item.trim())).includes(String(value));
      case "not_in": return !(Array.isArray(target) ? target.map(String) : String(target ?? "").split(",").map((item) => item.trim())).includes(String(value));
      case "is_empty": return value === undefined || value === null || value === "";
      case "not_empty": return value !== undefined && value !== null && value !== "";
      default: throw new Error(`FLOW_FILTER_RULE_INVALID: unsupported operator ${rule.op}`);
    }
  }));
}

export function countFlowRows(artifact: FlowArtifact) {
  const rows = rowsOf(artifact);
  return { total: rows.length, rows };
}

export function summarizeFlowArtifact(artifact: FlowArtifact) {
  const { total, rows } = countFlowRows(artifact);
  const parameters = Array.isArray(artifact.data)
    ? artifact.data as Record<string, unknown>[]
    : artifact.data && typeof artifact.data === "object" && Array.isArray((artifact.data as { parameters?: unknown }).parameters)
      ? (artifact.data as { parameters: Record<string, unknown>[] }).parameters
      : [];
  const records: Array<Record<string, string | number | boolean | null>> = [
    { field: "artifactId", value: artifact.artifactId ?? "" },
    { field: "kind", value: artifact.kind },
    { field: "count", value: total },
    { field: "validity", value: artifact.validity ?? "valid" },
    ...parameters.slice(0, 20).map((parameter) => ({ field: String(parameter.technical_name ?? ""), value: String(parameter.current_value ?? parameter.default ?? "") })),
  ];
  const fields = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return {
    schema: "am2_record_set_v1" as const,
    fields,
    records,
    sourceKind: artifact.kind,
  };
}

export function applyFlowJoinPolicies(states: FlowBindingState[], policies: FlowJoinPolicy[]) {
  const policyFor = (state: FlowBindingState) => policies.find((policy) => policy.binding === state.key)
    ?? policies.find((policy) => state.key.startsWith(`${policy.binding}#`));
  const accepted: FlowBindingState[] = [];
  const report: Array<{ binding: string; status: string; action: string }> = [];
  const failures: string[] = [];
  for (const state of states) {
    const policy = policyFor(state);
    if (state.status === "present") { accepted.push(state); report.push({ binding: state.key, status: state.status, action: "accepted" }); continue; }
    if (state.status === "partial") {
      const action = policy?.onPartial ?? "accept";
      if (action === "accept" && state.artifact) accepted.push(state);
      else if (action === "fail") failures.push(state.key);
      report.push({ binding: state.key, status: state.status, action: action === "accept" ? "accepted" : action === "fail" ? "failed" : "omitted" });
      continue;
    }
    const failed = state.status === "failed";
    const action = failed ? policy?.onFailed ?? "omit" : policy?.onSkipped ?? "omit";
    if (action === "fail") failures.push(state.key);
    else if (action === "default" && policy?.defaultText !== undefined) {
      accepted.push({ key: state.key, status: "present", artifact: { artifactId: undefined, kind: "text", validity: "valid", data: { schema: "am2_text_v1", text: policy.defaultText } } });
    }
    report.push({ binding: state.key, status: state.status, action: action === "fail" ? "failed" : action === "default" ? "defaulted" : "omitted" });
  }
  return { accepted, report, failures, noAcceptedInputs: accepted.length === 0 };
}

export function joinParameterBankRows(inputs: Array<{ artifactId: string; actionId: string; rows: Record<string, unknown>[] }>) {
  const rows = new Map<string, { row: Record<string, unknown>; sourceArtifactId: string; sourceActionId: string }>();
  for (const input of inputs) {
    if (!input.artifactId || !input.actionId) throw new Error("FLOW_JOIN_PROVENANCE_REQUIRED: each input needs an artifact and action ID.");
    for (const row of input.rows) {
      const key = row.technical_name;
      if (typeof key !== "string" || !key.trim()) throw new Error("FLOW_JOIN_BANK_KEY_INVALID: each row requires technical_name.");
      if (!rows.has(key)) rows.set(key, { row, sourceArtifactId: input.artifactId, sourceActionId: input.actionId });
    }
  }
  const entries = [...rows.entries()];
  return { parameters: entries.map(([, value]) => value.row), provenance: Object.fromEntries(entries.map(([key, value]) => [key, { sourceArtifactId: value.sourceArtifactId, sourceActionId: value.sourceActionId }])) };
}
