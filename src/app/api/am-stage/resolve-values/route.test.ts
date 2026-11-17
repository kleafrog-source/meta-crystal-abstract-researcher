import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  search: vi.fn(async (_input?: unknown) => ({ results: [] as Array<Record<string, unknown>> })),
}));

vi.mock("@/lib/llm/factory", () => ({ loadLLMSettings: async () => ({ capabilityRegistry: {} }) }));
vi.mock("@/lib/capability-registry", () => ({ capabilityIsEnabled: () => true }));
vi.mock("@/lib/model-slot", () => ({ acquireEmbeddingModelSlot: () => true, getEmbeddingModelSlot: () => null, releaseEmbeddingModelSlot: () => undefined }));
vi.mock("@/lib/ollama-memory", () => ({ prepareGpuForV3Embedding: async () => undefined }));
vi.mock("@/lib/rag-v3/composite-index", () => ({ getConfiguredTextIndexModel: async () => "embeddinggemma2-test" }));
vi.mock("@/lib/rag-v3/search", () => ({ searchV3: (input: unknown) => state.search(input) }));

import { POST } from "./route";

const identity = {
  technical_name: "filter_cutoff", category: "dynamics", sub_category: "filter", detail: "Filter cutoff",
  ui_element: "Range", default: 0.2, current_value: 0.2, suggested_value: 0.2, similarity: 0.9,
  min_value: 0, max_value: 1, step: 0.01, source: "gemma-identity", axes: [],
};
const anchor = { ...identity, current_value: 0.73, suggested_value: 0.73, selected_value: 0.73, value_status: "selected", source: "embedding_candidate" };
const post = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/am-stage/resolve-values", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parameters: [identity], ...body }),
}));

describe("resolve-values Gemma embedding selection", () => {
  beforeEach(() => state.search.mockReset().mockResolvedValue({ results: [anchor] }));

  it("runs the Gemma embedding selector over the bound identity names", async () => {
    const response = await post({ query: "test" });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toMatchObject({ text_index: "embeddinggemma2", model: "embeddinggemma2-test", input_parameter_count: 1 });
    expect(result.results[0]).toMatchObject({ technical_name: "filter_cutoff", current_value: 0.73 });
    expect(state.search).toHaveBeenCalledTimes(1);
    expect(state.search.mock.calls[0]?.[0]).toMatchObject({
      query: "test",
      topK: 1,
      currentValues: {},
      textIndex: "embeddinggemma2",
      candidateNames: ["filter_cutoff"],
    });
  });

  it("rejects malformed identity inputs", async () => {
    const response = await POST(new Request("http://localhost/api/am-stage/resolve-values", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "test", parameters: [{ technical_name: "bad name" }] }),
    }));
    expect(response.status).toBe(400);
    expect(state.search).not.toHaveBeenCalled();
  });
});
