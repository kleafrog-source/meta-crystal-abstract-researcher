import type { ActiveParameter } from "@/lib/rag-v3/types";

import type { TransitionPreparedRow } from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
function snap(value: number, min: number, max: number, step: number) { const decimals = Math.min(8, Math.max(0, Math.ceil(-Math.log10(step || 1)))); return Number((min + Math.round((Math.max(min, Math.min(max, value)) - min) / step) * step).toFixed(decimals)); }

export function interpolateTransition(rows: TransitionPreparedRow[], ratio: number, topK: number, previous: Record<string, string> = {}, hysteresis = .08): { parameters: ActiveParameter[]; categorical: Record<string, string> } {
  const t = clamp01(ratio); const categorical: Record<string, string> = {};
  const ranked = rows.map((row) => ({ row, score: (1 - t) * row.score_a + t * row.score_b })).sort((a, b) => b.score - a.score || a.row.parameter.technical_name.localeCompare(b.row.parameter.technical_name)).slice(0, Math.max(1, Math.min(100, topK)));
  const parameters = ranked.map(({ row, score }) => {
    const parameter = row.parameter; const fallback = parameter.default; let value: number | string = fallback;
    if (parameter.ui_element === "Range") {
      const min = parameter.min_value ?? 0; const max = parameter.max_value ?? 100; const step = parameter.step && parameter.step > 0 ? parameter.step : .01; const a = Number(row.present_a ? row.value_a : fallback); const b = Number(row.present_b ? row.value_b : fallback); const safeA = Number.isFinite(a) ? a : Number(fallback) || min; const safeB = Number.isFinite(b) ? b : Number(fallback) || min; const positionA = clamp01((safeA - min) / Math.max(max - min, Number.EPSILON)); const positionB = clamp01((safeB - min) / Math.max(max - min, Number.EPSILON)); value = snap(min + ((1 - t) * positionA + t * positionB) * (max - min), min, max, step);
    } else if (parameter.ui_element === "Select" || parameter.ui_element === "Toggle") {
      const a = String(row.present_a ? row.value_a : fallback); const b = String(row.present_b ? row.value_b : fallback);
      if (a === b) value = a; else { const voteA = (1 - t) * row.score_a; const voteB = t * row.score_b; const prior = previous[parameter.technical_name]; value = prior && (prior === a || prior === b) && Math.abs(voteA - voteB) <= hysteresis ? prior : voteA === voteB ? String(fallback) : voteA > voteB ? a : b; }
      if (parameter.ui_element === "Toggle") value = Number(value); categorical[parameter.technical_name] = String(value);
    } else {
      const a = row.present_a ? row.value_a : fallback; const b = row.present_b ? row.value_b : fallback; value = t === 0 ? a : t === 1 ? b : JSON.stringify(a) === JSON.stringify(b) ? a : fallback;
    }
    return { ...parameter, suggested_value: value, current_value: value, source: "transition" as const, value_confidence: score, similarity: score, detail: `parameter-space transition t=${t.toFixed(3)}; A=${row.present_a ? "present" : "absent"}; B=${row.present_b ? "present" : "absent"}` };
  });
  return { parameters, categorical };
}
