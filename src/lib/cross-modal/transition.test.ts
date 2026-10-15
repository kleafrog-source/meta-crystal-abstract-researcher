import { describe, expect, it } from "vitest";

import type { ActiveParameter } from "@/lib/rag-v3/types";

import { interpolateTransition } from "./transition";
import type { TransitionPreparedRow } from "./types";

const base = (name: string, ui: "Range" | "Select", fallback: number | string): ActiveParameter => ({ technical_name: name, category: "test", sub_category: "test", ui_element: ui, min_value: ui === "Range" ? 0 : undefined, max_value: ui === "Range" ? 100 : undefined, step: ui === "Range" ? 1 : undefined, options: ui === "Select" ? ["a", "b"] : undefined, default: fallback, suggested_value: fallback, current_value: fallback, before: fallback, source: "transition", detail: "fixture", lyria_prompt_tags: [], semantic_keywords: [], similarity: 0, axes: [], retrieval_scope: "sound" });
const rows: TransitionPreparedRow[] = [
  { parameter: base("range", "Range", 50), score_a: .9, score_b: .8, value_a: 10, value_b: 90, present_a: true, present_b: true },
  { parameter: base("select", "Select", "a"), score_a: .8, score_b: .8, value_a: "a", value_b: "b", present_a: true, present_b: true },
];

describe("parameter-space transition", () => {
  it("reproduces endpoint A at t=0", () => { const result = interpolateTransition(rows, 0, 10); expect(result.parameters.find((item) => item.technical_name === "range")?.current_value).toBe(10); expect(result.parameters.find((item) => item.technical_name === "select")?.current_value).toBe("a"); });
  it("reproduces endpoint B at t=1", () => { const result = interpolateTransition(rows, 1, 10); expect(result.parameters.find((item) => item.technical_name === "range")?.current_value).toBe(90); expect(result.parameters.find((item) => item.technical_name === "select")?.current_value).toBe("b"); });
  it("interpolates Range monotonically", () => { const values = [0, .25, .5, .75, 1].map((t) => Number(interpolateTransition(rows, t, 10).parameters.find((item) => item.technical_name === "range")?.current_value)); expect(values).toEqual([10, 30, 50, 70, 90]); });
  it("uses categorical hysteresis near the switching boundary", () => { const center = interpolateTransition(rows, .5, 10, { select: "a" }, .08); expect(center.parameters.find((item) => item.technical_name === "select")?.current_value).toBe("a"); const moved = interpolateTransition(rows, .7, 10, center.categorical, .08); expect(moved.parameters.find((item) => item.technical_name === "select")?.current_value).toBe("b"); });
  it("uses zero score for an absent endpoint", () => { const absent = [{ ...rows[0], score_b: 0, present_b: false, value_b: 50 }]; expect(interpolateTransition(absent, 1, 10).parameters[0].similarity).toBe(0); });
});
