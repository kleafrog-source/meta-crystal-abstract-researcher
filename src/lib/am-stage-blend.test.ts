import { describe, expect, it } from "vitest";
import type { ActiveParameter } from "./rag-v3/types";
import { applyConsensusSmooth, interpolateStageFrames } from "./am-stage-blend";

const parameter = (technical_name: string, current_value: number, similarity = 0.9): ActiveParameter => ({
  technical_name,
  category: "test",
  sub_category: "test",
  ui_element: "Range",
  min_value: 0,
  max_value: 100,
  step: 1,
  default: 50,
  suggested_value: current_value,
  current_value,
  before: 50,
  source: "audio_similarity",
  detail: "fixture",
  lyria_prompt_tags: [],
  semantic_keywords: [],
  similarity,
  axes: [],
  retrieval_scope: "sound",
});

describe("AM-Stage frame blend", () => {
  it("moves matching numeric results toward the cross-modal centroid", () => {
    const [left, right] = applyConsensusSmooth([[parameter("shared", 10)], [parameter("shared", 30)]], [], 64, 50);
    expect(left[0].current_value).toBe(15);
    expect(right[0].current_value).toBe(25);
  });

  it("limits the centroid pool to each source top-k", () => {
    const [left, right] = applyConsensusSmooth([[parameter("shared", 10, 0.9), parameter("left_only", 20, 0.1)], [parameter("shared", 30, 0.9)]], [], 1, 100);
    expect(left[0].current_value).toBe(20);
    expect(left[1].current_value).toBe(20);
  });

  it("interpolates shared values, holds discrete values at the nearest endpoint and omits non-overlaps", () => {
    const start = parameter("shared", 0);
    const end = parameter("shared", 100);
    expect(interpolateStageFrames([start], [end], 25, "linear")[0].current_value).toBe(25);
    expect(interpolateStageFrames([start], [parameter("other", 100)], 50, "linear")).toEqual([]);
    const discreteStart = { ...start, technical_name: "mode", ui_element: "Select" as const, current_value: "soft", options: ["soft", "hard"] };
    const discreteEnd = { ...discreteStart, current_value: "hard" };
    expect(interpolateStageFrames([discreteStart], [discreteEnd], 25, "linear")[0].current_value).toBe("soft");
    expect(interpolateStageFrames([discreteStart], [discreteEnd], 75, "linear")[0].current_value).toBe("hard");
  });

  it("keeps all curve endpoints bounded and moves monotonically between sources", () => {
    const start = parameter("shared", 0);
    const end = parameter("shared", 100);
    for (const curve of ["linear", "cosine", "cubic", "exponential"] as const) {
      const quarter = Number(interpolateStageFrames([start], [end], 25, curve)[0].current_value);
      expect(quarter).toBeGreaterThanOrEqual(0);
      expect(quarter).toBeLessThan(50);
      expect(interpolateStageFrames([start], [end], 0, curve)[0].current_value).toBe(0);
      expect(interpolateStageFrames([start], [end], 100, curve)[0].current_value).toBe(100);
    }
  });
});
