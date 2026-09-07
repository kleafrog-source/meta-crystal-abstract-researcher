import type { ActiveParameter, UiElement } from "./types";

export type TransitionOperator = "↑" | "↓" | "→" | "↔" | "⊗" | "⊕";

export interface TransitionFlowEntry {
  technicalName: string;
  label: string;
  operator: TransitionOperator;
  uiElement: UiElement;
  fromValue: number | string;
  toValue: number | string;
  currentValue: number | string;
  delta: number | null;
  direction: "increase" | "decrease" | "switch" | "blend" | "stable";
  sourceA?: ActiveParameter;
  sourceB?: ActiveParameter;
}

export interface TransitionFlowSnapshot {
  ratio: number;
  summary: string;
}

export interface TransitionFlowReport {
  ratio: number;
  summary: string;
  entries: TransitionFlowEntry[];
  snapshots: TransitionFlowSnapshot[];
}

const SNAPSHOT_RATIOS = [0, 25, 50, 75, 100] as const;

export function buildTransitionFlowReport(input: {
  primary: ActiveParameter[];
  secondary: ActiveParameter[];
  active: ActiveParameter[];
  ratio: number;
}): TransitionFlowReport {
  const ratio = clampPercent(input.ratio);
  const primaryMap = new Map(input.primary.map((item) => [item.technical_name, item]));
  const secondaryMap = new Map(input.secondary.map((item) => [item.technical_name, item]));
  const activeMap = new Map(input.active.map((item) => [item.technical_name, item]));
  const names = Array.from(new Set([...primaryMap.keys(), ...secondaryMap.keys()]));

  const entries = names
    .map((name) => {
      const fromA = primaryMap.get(name);
      const fromB = secondaryMap.get(name);
      const current = activeMap.get(name);
      if (!fromA && !fromB) {
        return null;
      }

      const reference = current ?? fromA ?? fromB;
      if (!reference) {
        return null;
      }

      const fromValue = fromA?.suggested_value ?? fromA?.current_value ?? current?.current_value ?? fromB?.suggested_value ?? "";
      const toValue = fromB?.suggested_value ?? fromB?.current_value ?? current?.current_value ?? fromA?.suggested_value ?? "";
      const currentValue = current?.current_value ?? current?.suggested_value ?? interpolateFallback(fromValue, toValue, ratio, reference.ui_element);
      const operator = resolveOperator(fromValue, toValue, currentValue, reference.ui_element, ratio, Boolean(fromA), Boolean(fromB));
      const delta = resolveNumericDelta(fromValue, toValue);

      return {
        technicalName: name,
        label: prettifyName(name),
        operator,
        uiElement: reference.ui_element,
        fromValue,
        toValue,
        currentValue,
        delta,
        direction: resolveDirection(operator),
        sourceA: fromA,
        sourceB: fromB,
      } satisfies TransitionFlowEntry;
    })
    .filter((entry): entry is TransitionFlowEntry => entry !== null)
    .sort((left, right) => scoreEntry(right) - scoreEntry(left));

  const summary = buildSummary(entries, ratio);
  const snapshots = SNAPSHOT_RATIOS.map((snapshotRatio) => ({
    ratio: snapshotRatio,
    summary: buildSnapshotSummary(entries, snapshotRatio),
  }));

  return {
    ratio,
    summary,
    entries: entries.slice(0, 16),
    snapshots,
  };
}

function buildSummary(entries: TransitionFlowEntry[], ratio: number): string {
  if (entries.length === 0) {
    return ratio === 0 ? "[∂₀] Awaiting Query A / Query B" : `[Stage ${ratio}%] Awaiting blended parameters`;
  }

  if (ratio === 0) {
    return `[∂₀] ${entries.slice(0, 4).map((entry) => `${entry.label} ${formatValue(entry.fromValue)}`).join(" ⊕ ")}`;
  }

  if (ratio === 100) {
    return `[∞] ${entries.slice(0, 4).map((entry) => `${entry.label} ${formatValue(entry.toValue)}`).join(" ⊗ ")}`;
  }

  return `[Stage ${ratio}%] ${entries
    .slice(0, 4)
    .map((entry) => formatFlowSegment(entry, ratio))
    .join(" ⊗ ")}`;
}

function buildSnapshotSummary(entries: TransitionFlowEntry[], ratio: number): string {
  if (entries.length === 0) {
    return ratio === 0 ? "[∂₀] empty" : `[${ratio}%] empty`;
  }

  if (ratio === 0) {
    return `[∂₀] ${entries.slice(0, 3).map((entry) => `${entry.label} ${formatValue(entry.fromValue)}`).join(" ⊕ ")}`;
  }
  if (ratio === 100) {
    return `[∞] ${entries.slice(0, 3).map((entry) => `${entry.label} ${formatValue(entry.toValue)}`).join(" ⊗ ")}`;
  }

  return `[${ratio}%] ${entries.slice(0, 3).map((entry) => formatSnapshotSegment(entry, ratio)).join(" ⊗ ")}`;
}

function formatFlowSegment(entry: TransitionFlowEntry, ratio: number): string {
  if (entry.operator === "↔") {
    const activeSide = ratio < 50 ? entry.fromValue : entry.toValue;
    const nextSide = ratio < 50 ? entry.toValue : entry.fromValue;
    return `${entry.label} (${formatValue(activeSide)} ↔ ${formatValue(nextSide)})`;
  }

  if (entry.operator === "⊕" || entry.operator === "⊗") {
    return `${entry.label} (${formatValue(entry.fromValue)} ${entry.operator} ${formatValue(entry.toValue)})`;
  }

  if (entry.operator === "↑" || entry.operator === "↓" || entry.operator === "→") {
    return `${entry.label} (${formatValue(entry.fromValue)} ${entry.operator} ${formatValue(entry.currentValue)})`;
  }

  return `${entry.label} ${formatValue(entry.currentValue)}`;
}

function formatSnapshotSegment(entry: TransitionFlowEntry, ratio: number): string {
  if (entry.operator === "↔") {
    return `${entry.label} ↔ ${ratio < 50 ? formatValue(entry.fromValue) : formatValue(entry.toValue)}`;
  }

  const current = interpolateFallback(entry.fromValue, entry.toValue, ratio, entry.uiElement);
  const operator = resolveOperator(entry.fromValue, entry.toValue, current, entry.uiElement, ratio, Boolean(entry.sourceA), Boolean(entry.sourceB));
  return `${entry.label} (${formatValue(entry.fromValue)} ${operator} ${formatValue(current)})`;
}

function resolveOperator(
  fromValue: number | string,
  toValue: number | string,
  currentValue: number | string,
  uiElement: UiElement,
  ratio: number,
  hasA: boolean,
  hasB: boolean,
): TransitionOperator {
  if (!hasA || !hasB) {
    return ratio < 50 ? "⊕" : "⊗";
  }

  const fromNumeric = toNumber(fromValue);
  const toNumeric = toNumber(toValue);
  const currentNumeric = toNumber(currentValue);

  if (fromNumeric !== null && toNumeric !== null && currentNumeric !== null) {
    if (Math.abs(toNumeric - fromNumeric) < 1e-9) {
      return "→";
    }
    if (toNumeric > fromNumeric) {
      return "↑";
    }
    if (toNumeric < fromNumeric) {
      return "↓";
    }
    return "→";
  }

  if (uiElement === "Select" || uiElement === "Toggle" || fromValue !== toValue) {
    return "↔";
  }

  return "→";
}

function resolveDirection(operator: TransitionOperator): TransitionFlowEntry["direction"] {
  if (operator === "↑") {
    return "increase";
  }
  if (operator === "↓") {
    return "decrease";
  }
  if (operator === "↔") {
    return "switch";
  }
  if (operator === "⊗" || operator === "⊕") {
    return "blend";
  }
  return "stable";
}

function resolveNumericDelta(fromValue: number | string, toValue: number | string): number | null {
  const from = toNumber(fromValue);
  const to = toNumber(toValue);
  if (from === null || to === null) {
    return null;
  }
  return to - from;
}

function interpolateFallback(
  fromValue: number | string,
  toValue: number | string,
  ratio: number,
  uiElement: UiElement,
): number | string {
  const from = toNumber(fromValue);
  const to = toNumber(toValue);
  if (from !== null && to !== null) {
    const value = from + ((to - from) * clampPercent(ratio)) / 100;
    return Number(value.toFixed(3));
  }

  if (uiElement === "Toggle" || uiElement === "Select") {
    return ratio < 50 ? fromValue : toValue;
  }

  return ratio < 50 ? fromValue : toValue;
}

function scoreEntry(entry: TransitionFlowEntry): number {
  const deltaScore = entry.delta === null ? 0.5 : Math.abs(entry.delta);
  const switchScore = entry.operator === "↔" ? 2 : 0;
  const blendScore = entry.operator === "⊗" || entry.operator === "⊕" ? 1 : 0;
  return deltaScore + switchScore + blendScore + (entry.sourceA?.similarity ?? 0) + (entry.sourceB?.similarity ?? 0);
}

function formatValue(value: number | string): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(Math.abs(value) < 10 ? 3 : 2).replace(/\.?0+$/, "");
  }
  return String(value);
}

function prettifyName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toNumber(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
