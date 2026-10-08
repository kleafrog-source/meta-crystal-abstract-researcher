import type { GenesisCandidate } from "./core";
import type { RuntimeParameterRecord } from "./runtime-index";

export interface CandidateValueInference {
  status: "auto_resolved" | "needs_review";
  confidence: number;
  quantity_kind: string;
  ui_element: string;
  unit: string;
  min_value?: number;
  max_value?: number;
  step?: number;
  default?: number | string;
  options?: string[];
  donor_parameters: string[];
  explanation: string[];
}

const UNIT_ALIASES: Record<string, string> = {
  "%": "percent",
  db: "db",
  decibels: "db",
  degree: "degrees",
  deg: "degrees",
  hertz: "hz",
  millisecond: "ms",
  milliseconds: "ms",
  normalized_factor: "ratio",
  normalized_ratio: "ratio",
  percentage: "percent",
  q_factor: "q_factor",
  seconds: "s",
  semitone: "semitones",
};

function normalizeUnit(unit: unknown): string {
  const value = String(unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, "_")
    .replace(/^_|_$/g, "");
  return UNIT_ALIASES[value] ?? value;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rounded(value: number): number {
  return Number(value.toPrecision(10));
}

function inferQuantityKind(unit: string, property: string, uiElement: string): string {
  if (uiElement === "Select") return "enum";
  if (uiElement === "Toggle") return "toggle";
  if (["hz", "bpm", "rate", "decay_rate"].includes(unit) || property.includes("frequency") || property === "rate") return "rate";
  if (["ms", "s"].includes(unit) || ["attack", "decay", "delay", "duration", "release", "time"].includes(property)) return "duration";
  if (["db", "lufs", "phon"].includes(unit) || ["gain", "level", "loudness"].includes(property)) return "level";
  if (["cents", "semitones"].includes(unit)) return "detune";
  if (["meter", "meters", "centimeters", "millimeters", "microns"].includes(unit)) return "length";
  if (property === "density" || unit.includes("density")) return "density";
  if (["count", "order"].includes(property) || unit.includes("count")) return "count";
  return "amount";
}

function selectSignature(parameter: RuntimeParameterRecord): string {
  const options = Array.isArray(parameter.options) ? [...parameter.options].sort().join("\u0000") : "";
  return `${parameter.ui_element}|${normalizeUnit(parameter.unit)}|${options}`;
}

function rangeConsistency(parameters: RuntimeParameterRecord[]): number {
  const signatures = parameters.map((parameter) =>
    [parameter.min_value, parameter.max_value, parameter.step, parameter.default].join("|"),
  );
  const counts = new Map<string, number>();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  return Math.max(...counts.values()) / signatures.length;
}

export function inferCandidateValues(
  candidate: GenesisCandidate,
  parameterMap: ReadonlyMap<string, RuntimeParameterRecord>,
  donorSimilarities: ReadonlyMap<string, number> = new Map(),
): CandidateValueInference {
  const propertyEntry = [...candidate.token_provenance].reverse().find((entry) => entry.role === "property");
  const property = propertyEntry?.token ?? candidate.tokens.at(-1) ?? "amount";
  const donorNames = Array.from(new Set([
    ...(propertyEntry?.source_parameters ?? []),
    ...candidate.parent_parameters,
  ]));
  const possible = donorNames
    .map((name) => parameterMap.get(name))
    .filter((parameter): parameter is RuntimeParameterRecord => Boolean(parameter))
    .filter((parameter) => parameter.technical_name.toLowerCase().split("_").includes(property));

  if (possible.length === 0) {
    return {
      status: "needs_review",
      confidence: 0,
      quantity_kind: inferQuantityKind("", property, "Range"),
      ui_element: "Range",
      unit: "unresolved",
      donor_parameters: [],
      explanation: [`No compatible donor contains terminal property atom "${property}".`],
    };
  }

  const groups = new Map<string, RuntimeParameterRecord[]>();
  for (const parameter of possible) {
    const signature = selectSignature(parameter);
    groups.set(signature, [...(groups.get(signature) ?? []), parameter]);
  }
  const groupWeight = (group: RuntimeParameterRecord[]) => group.reduce(
    (sum, parameter) => sum + Math.max(0.01, donorSimilarities.get(parameter.technical_name) ?? 0.5) ** 4,
    0,
  );
  const allGroups = Array.from(groups.values());
  const compatible = allGroups.sort(
    (left, right) =>
      groupWeight(right) - groupWeight(left) ||
      right.length - left.length ||
      selectSignature(left[0]).localeCompare(selectSignature(right[0])),
  )[0].sort(
    (left, right) =>
      (donorSimilarities.get(right.technical_name) ?? 0) -
        (donorSimilarities.get(left.technical_name) ?? 0) ||
      left.technical_name.localeCompare(right.technical_name),
  ).slice(0, 8);
  const uiElement = compatible[0].ui_element;
  const unit = normalizeUnit(compatible[0].unit) || "unitless";
  const totalWeight = allGroups.reduce((sum, group) => sum + groupWeight(group), 0);
  const share = totalWeight ? groupWeight(compatible) / totalWeight : compatible.length / possible.length;
  const consistency = uiElement === "Range" ? rangeConsistency(compatible) : 1;
  const topSimilarity = Math.max(
    0,
    ...compatible.map((parameter) => donorSimilarities.get(parameter.technical_name) ?? 0.5),
  );
  const confidence = Math.min(
    0.99,
    0.15 + Math.min(0.3, compatible.length * 0.08) + share * 0.25 +
      consistency * 0.15 + topSimilarity * 0.15,
  );
  const resolved = compatible.length >= 2 && confidence >= 0.72;
  const quantityKinds = compatible.map((parameter) => parameter.quantity_kind).filter(Boolean) as string[];
  const quantityKind = quantityKinds.length && new Set(quantityKinds).size === 1
    ? quantityKinds[0]
    : inferQuantityKind(unit, property, uiElement);
  const result: CandidateValueInference = {
    status: resolved ? "auto_resolved" : "needs_review",
    confidence: Number(confidence.toFixed(4)),
    quantity_kind: quantityKind,
    ui_element: uiElement,
    unit,
    donor_parameters: compatible.map((parameter) => parameter.technical_name).sort(),
    explanation: [
      `Terminal property atom: ${property}.`,
      `${compatible.length}/${possible.length} donors agree on UI/unit/options.`,
      `Semantic donor-group weight share: ${share.toFixed(3)}; best donor similarity: ${topSimilarity.toFixed(3)}.`,
      `Range consistency: ${consistency.toFixed(3)}.`,
      resolved ? "Automatically resolved from multiple compatible donors." : "Kept for review because evidence is insufficient.",
    ],
  };

  if (uiElement === "Range") {
    const ranges = compatible.filter(
      (parameter) => finite(parameter.min_value) && finite(parameter.max_value) &&
        finite(parameter.step) && finite(parameter.default) && parameter.step > 0,
    );
    if (ranges.length < 2) {
      result.status = "needs_review";
      result.confidence = Math.min(result.confidence, 0.69);
      result.explanation.push("Fewer than two donors have complete numeric ranges.");
      return result;
    }
    result.min_value = rounded(median(ranges.map((parameter) => parameter.min_value as number)));
    result.max_value = rounded(median(ranges.map((parameter) => parameter.max_value as number)));
    result.step = rounded(median(ranges.map((parameter) => parameter.step as number)));
    result.default = rounded(median(ranges.map((parameter) => parameter.default as number)));
    if (result.min_value >= result.max_value || result.step <= 0) {
      result.status = "needs_review";
      result.confidence = Math.min(result.confidence, 0.5);
      result.explanation.push("Aggregated numeric range is invalid.");
    } else {
      result.default = Math.min(result.max_value, Math.max(result.min_value, result.default as number));
    }
  } else if (uiElement === "Select") {
    result.options = compatible[0].options;
    result.default = compatible[0].default;
    if (!result.options?.length || !result.options.includes(String(result.default))) {
      result.status = "needs_review";
      result.confidence = Math.min(result.confidence, 0.5);
      result.explanation.push("Select donors do not provide a valid shared option/default set.");
    }
  } else if (uiElement === "Toggle") {
    const defaults = compatible.map((parameter) => String(parameter.default));
    result.default = defaults.sort((left, right) =>
      defaults.filter((value) => value === right).length - defaults.filter((value) => value === left).length,
    )[0];
  } else {
    result.status = "needs_review";
    result.confidence = Math.min(result.confidence, 0.5);
    result.explanation.push(`Unsupported automatic UI type: ${uiElement}.`);
  }
  return result;
}
