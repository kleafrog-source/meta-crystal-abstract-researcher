import type { ActiveParameter, ParameterValue, ValueSelectionStatus } from "./types";

export interface ValueSelectionRecord {
  status: ValueSelectionStatus;
  value?: ParameterValue;
  source?: ActiveParameter["source"];
  detail: string;
  evidence?: Record<string, ParameterValue>;
  confidence?: number;
}

function sameJsonValue(left: ParameterValue, right: ParameterValue | undefined): boolean {
  if (right === undefined) return false;
  const canonical = (value: ParameterValue): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return canonical(left) === canonical(right);
}

export function applyValueSelection<T extends ActiveParameter>(
  parameter: T,
  inputValue: ParameterValue | undefined,
  selection: ValueSelectionRecord,
): T {
  const hasSelection = selection.status === "selected" || selection.status === "selected_matches_default";
  if (hasSelection && selection.value === undefined) {
    throw new Error(`Selection status ${selection.status} requires a selected value for ${parameter.technical_name}.`);
  }
  if (!hasSelection && selection.value !== undefined) {
    throw new Error(`Selection status ${selection.status} cannot carry a selected value for ${parameter.technical_name}.`);
  }
  const catalogueDefault = Object.prototype.hasOwnProperty.call(parameter, "catalogue_default")
    ? parameter.catalogue_default
    : parameter.default;
  const matchesDefault = hasSelection && sameJsonValue(selection.value!, catalogueDefault);
  const status: ValueSelectionStatus = hasSelection
    ? matchesDefault ? "selected_matches_default" : "selected"
    : selection.status;
  const selected = hasSelection ? selection.value : undefined;
  return {
    ...parameter,
    input_value: inputValue,
    before: inputValue,
    selected_value: selected,
    suggested_value: typeof selected === "number" || typeof selected === "string" ? selected : undefined,
    current_value: typeof selected === "number" || typeof selected === "string" ? selected : undefined,
    value_status: status,
    selection_detail: selection.detail,
    selection_evidence: selection.evidence,
    source: selected === undefined ? "unselected" : selection.source ?? "embedding_candidate",
    value_confidence: selection.confidence,
    detail: selection.detail,
  };
}
