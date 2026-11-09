import { describe, expect, it } from "vitest";
import { selectTextLlmSegments } from "./segment-sampling";

const windows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `segment-${index + 1}`, startSeconds: index * 10, endSeconds: (index + 1) * 10 }));

describe("selectTextLlmSegments", () => {
  it("selects the documented approximately uniform five nodes", () => {
    expect(selectTextLlmSegments(windows(10), 5).selected.map((item) => item.id)).toEqual(["segment-1", "segment-3", "segment-5", "segment-7", "segment-10"]);
    expect(selectTextLlmSegments(windows(9), 5).selected.map((item) => item.id)).toEqual(["segment-1", "segment-3", "segment-5", "segment-7", "segment-9"]);
  });
  it("keeps all nodes below the limit and first/last above it", () => {
    expect(selectTextLlmSegments(windows(4), 5).selected).toEqual(windows(4));
    const result = selectTextLlmSegments(windows(20), 5);
    expect(result.selected[0].id).toBe("segment-1");
    expect(result.selected.at(-1)?.id).toBe("segment-20");
    expect(result.skipped).toHaveLength(15);
  });
  it("uses the first node when K=1 and clamps invalid limits", () => {
    expect(selectTextLlmSegments(windows(4), 1).selected.map((item) => item.id)).toEqual(["segment-1"]);
    expect(selectTextLlmSegments(windows(4), 0).limit).toBe(1);
  });
});
