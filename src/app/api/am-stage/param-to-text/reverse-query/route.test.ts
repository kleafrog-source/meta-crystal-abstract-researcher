import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getActiveProvider: vi.fn(), chat: vi.fn() }));
vi.mock("@/lib/llm/factory", () => ({ getActiveProvider: mocks.getActiveProvider }));

import { POST } from "./route";

const validResponse = JSON.stringify({ query_en: "A dark evolving synth texture", query_ru: "Тёмная развивающаяся синтезаторная текстура", key_concepts: ["darkness", "evolution", "synth texture"], uncertainties: [] });
const request = () => new Request("http://localhost/api/am-stage/param-to-text/reverse-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: { schema: "param_to_text_snapshot_v1", parameters: [] }, brief: "fixture brief" }) });

describe("Reverse Query route output and diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveProvider.mockResolvedValue({
      provider: { id: "freellmapi", chat: mocks.chat },
      settings: { chatModel: "auto", temperature: 0.2, topP: 0.8, maxTokens: 1024 },
    });
    mocks.chat.mockResolvedValue({ text: validResponse, provider: "freellmapi", model: "provider-route/model-x", requestedModel: "auto" });
  });

  it("returns typed reverse query plus secret-free provider/message diagnostics", async () => {
    const response = await POST(request());
    const body = await response.json() as { reverse_query?: { query_en?: string }; request_diagnostics?: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(body.reverse_query?.query_en).toBe("A dark evolving synth texture");
    expect(body.request_diagnostics).toMatchObject({ provider: "freellmapi", requestedModel: "auto", actualModel: "provider-route/model-x", credentialsPersisted: false });
    expect(body.request_diagnostics?.messageSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(body)).not.toContain("apiKey");
  });

  it("returns malformed model text as a retryable format response with the raw answer", async () => {
    mocks.chat.mockResolvedValueOnce({ text: "```json\n{truncated", provider: "freellmapi", model: "provider-route/model-x" });
    const response = await POST(request());
    const body = await response.json() as { error_category?: string; raw_response?: string; request_diagnostics?: unknown };
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ error_category: "format", raw_response: "```json\n{truncated" });
    expect(body.request_diagnostics).toBeTruthy();
  });

  it("returns a useful partial model answer without inventing missing fields", async () => {
    const modelText = JSON.stringify({ sound_description: "A deep, resonant industrial hum with rhythmic auto-pan and glitch-like stutters." });
    mocks.chat.mockResolvedValueOnce({ text: modelText, provider: "freellmapi", model: "provider-route/model-x" });
    const response = await POST(request());
    const body = await response.json() as { reverse_query?: Record<string, unknown>; raw_response?: string; extracted_model_text?: string };
    expect(response.status).toBe(200);
    expect(body.reverse_query).toMatchObject({
      text: "A deep, resonant industrial hum with rhythmic auto-pan and glitch-like stutters.",
      textSourceField: "sound_description",
      missingFields: ["query_en", "query_ru", "key_concepts", "uncertainties"],
      normalizerVersion: "reverse-query-normalizer-v1",
    });
    expect(body.reverse_query).not.toHaveProperty("query_en");
    expect(body.reverse_query).not.toHaveProperty("key_concepts");
    expect(body.raw_response).toBe(modelText);
    expect(body.extracted_model_text).toBe(modelText);
  });

  it("reports exact unusable-content reasons instead of accepting provider errors", async () => {
    mocks.chat.mockResolvedValueOnce({ text: "<html><body>502 Bad Gateway</body></html>", provider: "freellmapi", model: "provider-route/model-x" });
    const response = await POST(request());
    const body = await response.json() as { error_category?: string; error?: string; raw_response?: string };
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error_category: "invalid", error: expect.stringContaining("Provider/transport error"), raw_response: expect.stringContaining("502 Bad Gateway") });
  });
});
