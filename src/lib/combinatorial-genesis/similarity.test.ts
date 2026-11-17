import { describe, expect, it } from "vitest";
import { normalizedCosine } from "./similarity";

describe("Preview similarity validity", () => {
  it("rejects zero-norm, dimension-mismatched, NaN and infinite vectors", () => {
    expect(normalizedCosine([0, 0], [1, 0])).toBe(Number.NEGATIVE_INFINITY);
    expect(normalizedCosine([1], [1, 0])).toBe(Number.NEGATIVE_INFINITY);
    expect(normalizedCosine([Number.NaN], [1])).toBe(Number.NEGATIVE_INFINITY);
    expect(normalizedCosine([Number.POSITIVE_INFINITY], [1])).toBe(Number.NEGATIVE_INFINITY);
  });

  it("preserves ordinary cosine values including negative similarity", () => {
    expect(normalizedCosine([1, 0], [1, 0])).toBe(1);
    expect(normalizedCosine([1, 0], [-1, 0])).toBe(-1);
  });
});
