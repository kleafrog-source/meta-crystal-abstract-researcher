import type { GenesisCandidate } from "./core";
import { resolveDonorReferences, type DonorPolicy } from "./donor-policy";
import type { RuntimeParameterRecord } from "./runtime-index";

export interface CandidateValueInference {
  status: "auto_resolved" | "needs_review";
  confidence: number;
  quantity_kind?: string;
  ui_element: string;
  unit: string;
  min_value?: number;
  max_value?: number;
  step?: number;
  default?: number | string | number[];
  options?: string[];
  donor_parameters: string[];
  donor_diagnostics: Array<{
    technical_name: string;
    reason: "similarity_fallback" | "similarity_zero_weight" | "similarity_invalid" | "quantity_kind_missing" | "quantity_kind_invalid";
    similarity?: number;
  }>;
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

function selectSignature(parameter: RuntimeParameterRecord): string {
  const options = Array.isArray(parameter.options) ? [...parameter.options].sort().join("\u0000") : "";
  return `${String(parameter.quantity_kind ?? "")} | ${parameter.ui_element}|${normalizeUnit(parameter.unit)}|${options}`;
}

function validQuantityKind(value: unknown): value is string {
  // The catalogue validates a snake_case format but defines no closed enum; preserve valid labels as opaque values.
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

function similarityInfo(name: string, similarities: ReadonlyMap<string, number>) {
  if (!similarities.has(name)) return { source: "fallback" as const, value: 0.5, weight: 0.5 ** 4 };
  const value = similarities.get(name)!;
  if (!Number.isFinite(value)) return { source: "invalid" as const, value, weight: 0 };
  return { source: "measured" as const, value, weight: Math.min(1, Math.max(0, value)) ** 4 };
}

function rangeConsistency(parameters: RuntimeParameterRecord[]): number {
  const signatures = parameters.map((parameter) =>
    [parameter.min_value, parameter.max_value, parameter.step, parameter.default].join("|"),
  );
  const counts = new Map<string, number>();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  return Math.max(...counts.values()) / signatures.length;
}

export function donorSimilarityWeight(similarity: number | undefined): number {
  if (similarity === undefined) return 0.5 ** 4;
  if (!Number.isFinite(similarity)) return 0;
  return Math.min(1, Math.max(0, similarity)) ** 4;
}

function isUsableRange(parameter: RuntimeParameterRecord): boolean {
  const { min_value: min, max_value: max, step, default: value } = parameter;
  return finite(min) && finite(max) && finite(step) && finite(value) &&
    min < max && step > 0 && step <= max - min && value >= min && value <= max;
}

function isUsableSelect(parameter: RuntimeParameterRecord): boolean {
  return Array.isArray(parameter.options) && parameter.options.length > 0 &&
    parameter.options.every((option) => typeof option === "string" && option.length > 0) &&
    typeof parameter.default === "string" && parameter.options.includes(parameter.default);
}

export function inferCandidateValues(
  candidate: GenesisCandidate,
  donorPolicy: DonorPolicy,
  donorSimilarities: ReadonlyMap<string, number> = new Map(),
): CandidateValueInference {
  const propertyEntry = [...candidate.token_provenance].reverse().find((entry) => entry.role === "property");
  const property = propertyEntry?.token ?? candidate.tokens.at(-1) ?? "amount";
  const donorNames = Array.from(new Set([
    ...(propertyEntry?.source_parameters ?? []),
    ...candidate.parent_parameters,
  ]));
  const resolvedDonors = resolveDonorReferences(donorNames, donorPolicy).donors;
  const sourceMatches = resolvedDonors
    .filter((parameter) => parameter.technical_name.toLowerCase().split("_").includes(property));
  const possible = sourceMatches.filter((parameter) =>
    parameter.ui_element === "Range" ? isUsableRange(parameter) :
      parameter.ui_element === "Select" ? isUsableSelect(parameter) : true,
  );

  if (possible.length === 0) {
    return {
      status: "needs_review",
      confidence: 0,
      ui_element: "Range",
      unit: "unresolved",
      donor_parameters: [],
      donor_diagnostics: [],
      explanation: [`No compatible donor contains terminal property atom "${property}".`],
    };
  }

  const donorDiagnostics: CandidateValueInference["donor_diagnostics"] = [];
  const withEvidence = possible.flatMap((parameter) => {
    const similarity = similarityInfo(parameter.technical_name, donorSimilarities);
    if (similarity.source === "fallback") donorDiagnostics.push({ technical_name: parameter.technical_name, reason: "similarity_fallback", similarity: similarity.value });
    if (similarity.source === "invalid") donorDiagnostics.push({ technical_name: parameter.technical_name, reason: "similarity_invalid" });
    if (similarity.source === "measured" && similarity.weight === 0) donorDiagnostics.push({ technical_name: parameter.technical_name, reason: "similarity_zero_weight", similarity: similarity.value });
    if (similarity.weight === 0) return [];
    if (!validQuantityKind(parameter.quantity_kind)) {
      donorDiagnostics.push({
        technical_name: parameter.technical_name,
        reason: parameter.quantity_kind == null || parameter.quantity_kind === "" ? "quantity_kind_missing" : "quantity_kind_invalid",
      });
      return [];
    }
    return [{ parameter, similarity }];
  });
  const eligible = withEvidence.filter(({ similarity }) => similarity.weight > 0);
  const allQuantityKinds = new Set(eligible.map(({ parameter }) => parameter.quantity_kind));
  const hasQuantityKindConflict = allQuantityKinds.size > 1;
  const groups = new Map<string, typeof eligible>();
  for (const item of eligible) {
    const parameter = item.parameter;
    const signature = selectSignature(parameter);
    groups.set(signature, [...(groups.get(signature) ?? []), item]);
  }
  const groupWeight = (group: typeof eligible) => group.reduce(
    (sum, item) => sum + item.similarity.weight,
    0,
  );
  const allGroups = Array.from(groups.values());
  if (!allGroups.length || eligible.length < 2 || hasQuantityKindConflict || donorDiagnostics.some((item) => item.reason.startsWith("quantity_kind_"))) {
    return {
      status: "needs_review",
      confidence: 0,
      ui_element: possible[0]?.ui_element ?? "Range",
      unit: possible[0] ? normalizeUnit(possible[0].unit) || "unitless" : "unresolved",
      donor_parameters: [],
      donor_diagnostics: donorDiagnostics,
      explanation: [
        !allGroups.length ? "No positive-weight donors with valid quantity_kind." :
          eligible.length < 2 ? "Fewer than two positive-weight donors are available." :
            hasQuantityKindConflict ? "Donors disagree on quantity_kind; manual review is required." :
              "A donor has missing or invalid quantity_kind; manual review is required.",
      ],
    };
  }
  const sortedGroups = allGroups.sort(
    (left, right) =>
      groupWeight(right) - groupWeight(left) ||
      right.length - left.length ||
      selectSignature(left[0].parameter).localeCompare(selectSignature(right[0].parameter)),
  );
  const compatibleGroup = sortedGroups[0];
  const compatible = compatibleGroup.sort((left, right) =>
    right.similarity.weight - left.similarity.weight ||
      left.parameter.technical_name.localeCompare(right.parameter.technical_name),
  ).slice(0, 8).map(({ parameter }) => parameter);
  const uiElement = compatible[0].ui_element;
  const unit = normalizeUnit(compatible[0].unit) || "unitless";
  const totalWeight = allGroups.reduce((sum, group) => sum + groupWeight(group), 0);
  const share = groupWeight(compatibleGroup) / totalWeight;
  const consistency = uiElement === "Range" ? rangeConsistency(compatible) : 1;
  const topSimilarity = Math.max(0, ...compatible.map((parameter) => {
    return similarityInfo(parameter.technical_name, donorSimilarities).value;
  }));
  const confidence = Math.min(
    0.99,
    0.15 + Math.min(0.3, compatible.length * 0.08) + share * 0.25 +
      consistency * 0.15 + topSimilarity * 0.15,
  );
  const resolved = compatible.length >= 2 && confidence >= 0.72;
  const result: CandidateValueInference = {
    status: resolved ? "auto_resolved" : "needs_review",
    confidence: Number(confidence.toFixed(4)),
    quantity_kind: compatible[0].quantity_kind!,
    ui_element: uiElement,
    unit,
    donor_parameters: compatible.map((parameter) => parameter.technical_name).sort(),
    donor_diagnostics: donorDiagnostics,
    explanation: [
      `Terminal property atom: ${property}.`,
      `${compatible.length}/${possible.length} donors agree on UI/unit/options.`,
      `Semantic donor-group weight share: ${share.toFixed(3)}; best donor similarity: ${topSimilarity.toFixed(3)}.`,
      `Range consistency: ${consistency.toFixed(3)}.`,
      resolved ? "Automatically resolved from multiple compatible donors." : "Kept for review because evidence is insufficient.",
    ],
  };

  if (uiElement === "Range") {
    const ranges = compatible.filter(isUsableRange);
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
    if (result.min_value >= result.max_value || result.step <= 0 ||
      result.step > result.max_value - result.min_value) {
      result.status = "needs_review";
      result.confidence = Math.min(result.confidence, 0.5);
      result.explanation.push("Aggregated numeric range is invalid.");
    } else {
      result.default = Math.min(result.max_value, Math.max(result.min_value, result.default as number));
    }
  } else if (uiElement === "Select") {
    result.options = compatible[0].options;
    result.default = compatible[0].default;
    if (!isUsableSelect(compatible[0])) {
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
