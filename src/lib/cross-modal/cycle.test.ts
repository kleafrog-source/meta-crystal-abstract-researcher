import { describe, expect, it } from "vitest";

import type { ConsensusParameter } from "./types";
import { cycleMetrics, cycleStatus } from "./cycle";

const item = (name: string, rank: number, value: number | string, scope = "sound"): ConsensusParameter => ({ technical_name: name, rank, retrieval_score: 0.8, normalized_score: 0.8, default_value: 0, selected_value: value, ui_element: typeof value === "number" ? "Range" : "Select", min_value: typeof value === "number" ? 0 : undefined, max_value: typeof value === "number" ? 1 : undefined, value_source: "fixture", retrieval_scope: scope });

describe("cycle verification metrics", () => {
  it("returns one for an exact cycle", () => { const source = [item("a", 1, 0.8), item("b", 2, "wide")]; expect(cycleMetrics(source, source)).toEqual({ weighted_overlap: 1, jaccard_at_k: 1, value_agreement: 1, scope_agreement: 1, verification_score: 1 }); expect(cycleStatus(1)).toBe("verified"); });
  it("scores a partial cycle between exact and disjoint", () => { const metrics = cycleMetrics([item("a", 1, 0.8), item("b", 2, 1)], [item("a", 1, 0.8), item("c", 2, 1)]); expect(metrics.weighted_overlap).toBeGreaterThan(0); expect(metrics.weighted_overlap).toBeLessThan(1); expect(metrics.jaccard_at_k).toBeCloseTo(1 / 3, 5); });
  it("returns zero overlap and jaccard for a disjoint cycle", () => { const metrics = cycleMetrics([item("a", 1, 1)], [item("b", 1, 1)]); expect(metrics.weighted_overlap).toBe(0); expect(metrics.jaccard_at_k).toBe(0); expect(metrics.value_agreement).toBe(0); });
  it("detects value conflicts for the same parameter", () => { const metrics = cycleMetrics([item("a", 1, "left")], [item("a", 1, "right")]); expect(metrics.weighted_overlap).toBe(1); expect(metrics.value_agreement).toBe(0); expect(metrics.verification_score).toBe(0.8); });
  it("uses the calibrated cycle-v2 thresholds", () => { expect(cycleStatus(.55)).toBe("verified"); expect(cycleStatus(.2)).toBe("review"); expect(cycleStatus(.199)).toBe("rejected"); });
});
