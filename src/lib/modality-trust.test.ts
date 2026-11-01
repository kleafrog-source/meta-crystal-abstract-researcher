import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODALITY_TRUST_CONFIG,
  computeModalityTrust,
  computeTrustAdjustedWeights,
  parameterDivergence,
} from "./modality-trust";

describe("client-side modality trust", () => {
  it("assigns high trust to peaked scores and low trust to flat scores", () => {
    expect(computeModalityTrust([0.98, 0.12]).trust).toBeGreaterThan(0.8);
    expect(computeModalityTrust([0.7, 0.7, 0.7, 0.7]).trust).toBeCloseTo(0);
    expect(computeModalityTrust([Number.NaN, Number.POSITIVE_INFINITY]).trust).toBe(0);
  });

  it("reduces only low-trust influence while preserving a configurable floor", () => {
    const config = { ...DEFAULT_MODALITY_TRUST_CONFIG, lowTrustThreshold: 0.5, floorWeight: 0.2 };
    const reduced = computeTrustAdjustedWeights(0.5, 0, 1, config);
    expect(reduced.first).toBeCloseTo(1 / 6);
    expect(reduced.second).toBeCloseTo(5 / 6);
    const invalidConfigWeights = computeTrustAdjustedWeights(0.5, Number.NaN, 0.2, { lowTrustThreshold: Number.NaN, floorWeight: Number.NaN, divergenceThreshold: Number.NaN });
    expect(Object.values(invalidConfigWeights).every(Number.isFinite)).toBe(true);
    expect(Object.values(computeTrustAdjustedWeights(0.5, Number.NaN, Number.NaN, config)).every(Number.isFinite)).toBe(true);
  });

  it("measures numeric values on their shared range and discrete values by agreement", () => {
    expect(parameterDivergence({ value: 20, min: 0, max: 100 }, { value: 80, min: 0, max: 100 })).toBeCloseTo(0.6);
    expect(parameterDivergence({ value: "soft" }, { value: "hard" })).toBe(1);
    expect(parameterDivergence({ value: "soft" }, { value: "soft" })).toBe(0);
    expect(parameterDivergence({ value: 0, discrete: true }, { value: 1, discrete: true })).toBe(1);
  });
});
