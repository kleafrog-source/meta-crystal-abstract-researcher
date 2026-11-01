import { describe, expect, it } from "vitest";

import { applyLayerWeights, selectDomainFirstMmr, type DomainRankCandidate } from "./domain-mmr";

function candidate(name: string, layer: string, relevance: number, vector: number[]): DomainRankCandidate {
  return { name, layer, relevance, vector };
}

describe("domain-first MMR retrieval", () => {
  it("multiplies relevance by data-driven layer weights, defaulting missing weights to one", () => {
    const rows = [
      candidate("vocal", "VOCAL_MORPHOLOGY_LAYER", 0.8, [1, 0]),
      candidate("spatial", "SPATIAL_BINAURAL_LAYER", 0.6, [0, 1]),
    ];

    const weighted = applyLayerWeights(rows, { VOCAL_MORPHOLOGY_LAYER: 1.5 });
    expect(weighted.map((item) => item.weightedRelevance)).toEqual([1.2000000000000002, 0.6]);
  });

  it("allocates approximately seventy percent to selected layers and fills from outside", () => {
    const selected = Array.from({ length: 10 }, (_, index) => candidate("vocal_" + index, "VOCAL_MORPHOLOGY_LAYER", 1 - index * 0.01, [1, index / 100]));
    const outside = Array.from({ length: 10 }, (_, index) => candidate("spatial_" + index, "SPATIAL_BINAURAL_LAYER", 0.9 - index * 0.01, [index / 100, 1]));
    const result = selectDomainFirstMmr([...outside, ...selected], 10, ["VOCAL_MORPHOLOGY_LAYER"]);

    expect(result).toHaveLength(10);
    expect(result.filter((item) => item.layer === "VOCAL_MORPHOLOGY_LAYER")).toHaveLength(7);
    expect(result.filter((item) => item.layer === "SPATIAL_BINAURAL_LAYER")).toHaveLength(3);
  });

  it("uses available outside candidates when the selected layer cannot fill its quota", () => {
    const rows = [
      candidate("vocal_0", "VOCAL_MORPHOLOGY_LAYER", 1, [1, 0]),
      candidate("vocal_1", "VOCAL_MORPHOLOGY_LAYER", 0.8, [0.9, 0.1]),
      ...Array.from({ length: 8 }, (_, index) => candidate("spatial_" + index, "SPATIAL_BINAURAL_LAYER", 0.7 - index * 0.01, [0, 1])),
    ];
    const result = selectDomainFirstMmr(rows, 10, ["VOCAL_MORPHOLOGY_LAYER"]);

    expect(result).toHaveLength(10);
    expect(result.filter((item) => item.layer === "VOCAL_MORPHOLOGY_LAYER")).toHaveLength(2);
  });

  it("reduces near-duplicate clusters compared with pure relevance ranking", () => {
    const rows = [
      candidate("a0", "VOCAL_MORPHOLOGY_LAYER", 1, [1, 0, 0]),
      candidate("a1", "VOCAL_MORPHOLOGY_LAYER", 0.99, [0.995, 0.1, 0]),
      candidate("a2", "VOCAL_MORPHOLOGY_LAYER", 0.98, [0.99, 0.14, 0]),
      candidate("a3", "VOCAL_MORPHOLOGY_LAYER", 0.97, [0.98, 0.18, 0]),
      candidate("b0", "SPATIAL_BINAURAL_LAYER", 0.95, [0, 1, 0]),
      candidate("b1", "SPATIAL_BINAURAL_LAYER", 0.94, [0.1, 0.995, 0]),
      candidate("b2", "SPATIAL_BINAURAL_LAYER", 0.93, [0.14, 0.99, 0]),
      candidate("c0", "TEMPORAL_RHYTHM_LAYER", 0.91, [0, 0, 1]),
      candidate("c1", "TEMPORAL_RHYTHM_LAYER", 0.9, [0.1, 0, 0.995]),
    ];
    const plain = [...rows].sort((left, right) => right.relevance - left.relevance).slice(0, 6);
    const diversified = selectDomainFirstMmr(rows, 6);
    const clusterCount = (items: DomainRankCandidate[]) => new Set(items.map((item) => item.name[0])).size;

    expect(clusterCount(plain)).toBe(2);
    expect(clusterCount(diversified)).toBeGreaterThan(clusterCount(plain));
  });

  it("keeps empty and all-layer masks in the global retrieval path", () => {
    const rows = [
      candidate("outside", "SPATIAL_BINAURAL_LAYER", 0.9, [1, 0]),
      candidate("inside", "VOCAL_MORPHOLOGY_LAYER", 0.8, [0, 1]),
    ];
    expect(selectDomainFirstMmr(rows, 2, []).map((item) => item.name)).toEqual(["outside", "inside"]);
    expect(selectDomainFirstMmr(rows, 2, [
      "VOCAL_MORPHOLOGY_LAYER",
      "SYNTHESIS_PHYSICS_LAYER",
      "SPECTRAL_DSP_LAYER",
      "SPATIAL_BINAURAL_LAYER",
      "DYNAMICS_ENVELOPE_LAYER",
      "TEMPORAL_RHYTHM_LAYER",
      "GENERATIVE_CHAOS_LAYER",
      "COMPOSITIONAL_VECTOR_LAYER",
      "MODULATION_PERFORMANCE_LAYER",
    ]).map((item) => item.name)).toEqual(["outside", "inside"]);
  });
});
