import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { cachedEmbeddingVectors } from "./embedding-vector-cache";

describe("cachedEmbeddingVectors", () => {
  it("embeds unique misses once and reuses values for repeat requests", async () => {
    const compute = vi.fn(async (inputs: string[]) => inputs.map((input) => [input.length, 1]));
    const namespace = "test-ollama-v1-" + randomUUID();

    const first = await cachedEmbeddingVectors(["alpha", "beta", "alpha"], namespace, compute);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledWith(["alpha", "beta"]);
    expect(first).toEqual([[5, 1], [4, 1], [5, 1]]);

    const second = await cachedEmbeddingVectors(["beta", "alpha"], namespace, compute);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(second).toEqual([[4, 1], [5, 1]]);

    await cachedEmbeddingVectors(["alpha"], namespace + "-other-model", compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});