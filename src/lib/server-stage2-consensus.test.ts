import { describe, expect, it } from "vitest";

import { buildStage2Centroid, keepOnlyNewStage2Hits } from "./server-stage2-consensus";

describe("server Stage-2 query centroid", () => {
  it("builds a normalized centroid from the top Stage-1 index vectors weighted by similarity", () => {
    const result = buildStage2Centroid([
      { technical_name: "bright", similarity: 1, vector: [1, 0] },
      { technical_name: "wide", similarity: 0.25, vector: [0, 1] },
    ]);

    expect(result?.seedNames).toEqual(["bright", "wide"]);
    expect(result?.vector[0]).toBeCloseTo(0.9701, 3);
    expect(result?.vector[1]).toBeCloseTo(0.2425, 3);
  });

  it("ignores duplicate, malformed, and dimension-mismatched Stage-1 vectors", () => {
    const result = buildStage2Centroid([
      { technical_name: "first", similarity: 0.8, vector: [1, 0] },
      { technical_name: "first", similarity: 0.9, vector: [0, 1] },
      { technical_name: "wrong-size", similarity: 0.7, vector: [1] },
      { technical_name: "nan", similarity: 0.6, vector: [Number.NaN, 1] },
    ]);

    expect(result?.seedNames).toEqual(["first"]);
    expect(result?.vector).toEqual([1, 0]);
  });

  it("returns no centroid when no usable positive-weight vectors are available", () => {
    expect(buildStage2Centroid([
      { technical_name: "zero", similarity: 0, vector: [0, 0] },
      { technical_name: "negative", similarity: -1, vector: [1, 0] },
    ])).toBeNull();
  });

  it("keeps Stage-2 results distinct by rejecting every Stage-1 name and duplicate", () => {
    const hits = keepOnlyNewStage2Hits(["stage1_a", "stage1_b"], [
      { technical_name: "stage1_a" },
      { technical_name: "new_anchor" },
      { technical_name: "new_anchor" },
    ]);
    expect(hits.map((hit) => hit.technical_name)).toEqual(["new_anchor"]);
  });
});
