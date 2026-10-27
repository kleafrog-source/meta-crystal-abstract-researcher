import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeLLMAPIProvider } from "./freellmapi";

describe("FreeLLMAPIProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes Auto and explicit text models and retains router metadata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "ok" } }] }), {
        headers: { "Content-Type": "application/json", "X-Routed-Via": "groq/llama-3.3-70b" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeLLMAPIProvider("http://localhost:3001/v1", "auto", "server-secret", "http://localhost:11434", "embed-v1");
    const automatic = await provider.chat([{ role: "user", content: "hello" }]);
    const explicit = await provider.chat([{ role: "user", content: "hello" }], { model: "gemini-2.5-flash" });
    expect(automatic.requestedModel).toBe("auto");
    expect(automatic.actualProvider).toBe("groq");
    expect(automatic.actualModel).toBe("llama-3.3-70b");
    expect(explicit.requestedModel).toBe("gemini-2.5-flash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).model).toBe("gemini-2.5-flash");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer server-secret");
  });

  it("stops on quota errors without retries or backend fallback", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeLLMAPIProvider("http://localhost:3001/v1", "auto", "server-secret", "http://localhost:11434", "embed-v1");
    await expect(provider.chat([{ role: "user", content: "hello" }])).rejects.toThrow("returned HTTP 429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps embeddings on Ollama", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ embedding: [0.1, 0.2] }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeLLMAPIProvider("http://localhost:3001/v1", "auto", "server-secret", "http://localhost:11434", "embed-v1");
    await expect(provider.embed("hello")).resolves.toEqual([0.1, 0.2]);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:11434/api/embeddings");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("embed-v1");
  });
});
