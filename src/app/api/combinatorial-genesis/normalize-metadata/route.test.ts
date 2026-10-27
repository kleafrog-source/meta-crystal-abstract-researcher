import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveProvider } from "@/lib/llm/factory";
import { FreeLLMAPIError } from "@/lib/llm/freellmapi";
import type { LLMProvider } from "@/lib/llm/types";
import { POST } from "./route";

vi.mock("@/lib/llm/factory", () => ({ getActiveProvider: vi.fn() }));
vi.mock("@/lib/combinatorial-genesis/library", () => ({ readGenesisLibrary: vi.fn(async () => []) }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(async (filePath: string) => filePath.endsWith("latest.json") ? JSON.stringify({ version_id: "fixture" }) : "[]"),
    },
  };
});

const activeProvider = vi.mocked(getActiveProvider);
const validText = JSON.stringify({ candidates: [{ technical_name: "fixture_control", name_ru: "Контроль", description_en: "Controls the sound.", description_ru: "Управляет звуком.", recommended: true, selection_reason: "Поддержано источниками." }] });

function fixtureProvider(id: LLMProvider["id"], model: string, chat: ReturnType<typeof vi.fn>) {
  const provider = { id, displayName: id, chat } as unknown as LLMProvider;
  const settings = { chatModel: model } as Awaited<ReturnType<typeof getActiveProvider>>["settings"];
  activeProvider.mockResolvedValue({ provider, settings });
  return provider;
}

async function normalize(body: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/combinatorial-genesis/normalize-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates: [{ technical_name: "fixture_control", parent_parameters: [] }], ...body }),
  }));
}

describe("Combinatorial Genesis description normalization routing", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("uses the active Ollama provider and model, ignoring stale client model values", async () => {
    const chat = vi.fn(async (_messages: unknown, options: { model: string }) => ({ text: validText, model: options.model, provider: "ollama" as const }));
    fixtureProvider("ollama", "qwen3:8b", chat);
    const response = await normalize({ model: "hermes3-strict-json:latest" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(activeProvider).toHaveBeenCalledOnce();
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0][1].model).toBe("qwen3:8b");
    expect(body.provider).toBe("ollama");
    expect(body.model).toBe("qwen3:8b");
    expect(body.candidates[0].description_ru).toBe("Управляет звуком.");
  });

  it("passes FreeLLMAPI Auto and exposes actual routing metadata", async () => {
    const chat = vi.fn(async (_messages: unknown, options: { model: string }) => ({ text: validText, model: "llama-3.3-70b", provider: "freellmapi" as const, requestedModel: options.model, actualRoute: "groq/llama-3.3-70b", actualProvider: "groq", actualModel: "llama-3.3-70b" }));
    fixtureProvider("freellmapi", "auto", chat);
    const response = await normalize();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0][1].model).toBe("auto");
    expect(body.provider).toBe("freellmapi");
    expect(body.requestedModel).toBe("auto");
    expect(body.actualRoute).toBe("groq/llama-3.3-70b");
    expect(body.candidates).toHaveLength(1);
  });

  it("passes an explicitly selected FreeLLMAPI model", async () => {
    const chat = vi.fn(async (_messages: unknown, options: { model: string }) => ({ text: validText, model: options.model, provider: "freellmapi" as const, requestedModel: options.model }));
    fixtureProvider("freellmapi", "gemini-2.5-flash", chat);
    const response = await normalize();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0][1].model).toBe("gemini-2.5-flash");
    expect(body.model).toBe("gemini-2.5-flash");
  });

  it("returns one safe upstream quota error without retrying or falling back", async () => {
    const chat = vi.fn(async () => { throw new FreeLLMAPIError("chat completion", 429); });
    fixtureProvider("freellmapi", "auto", chat);
    const response = await normalize();
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(chat).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ provider: "freellmapi", upstreamStatus: 429, error: "FreeLLMAPI chat completion returned HTTP 429" });
    expect(JSON.stringify(body)).not.toMatch(/authorization|server-secret|localhost:3001/i);
  });
});
