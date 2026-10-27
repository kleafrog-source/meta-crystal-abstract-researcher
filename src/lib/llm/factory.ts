/**
 * LLM provider factory + settings persistence.
 *
 * Settings are stored in the Setting table (key/value). On startup we
 * load them once and re-build the provider whenever they change.
 */

import { db } from "@/lib/db";
import { OllamaProvider } from "./ollama";
import { FreeLLMAPIProvider } from "./freellmapi";
import { MockProvider } from "./mock";
import type { LLMProvider, LLMProviderId } from "./types";

export interface LLMSettings {
  provider: LLMProviderId;
  /** Ollama base URL, e.g. http://localhost:11434 */
  ollamaUrl: string;
  /** FreeLLMAPI OpenAI-compatible endpoint (normally http://localhost:3001/v1). */
  freeLLMApiUrl: string;
  /** FreeLLMAPI chat model, kept separate so toggling providers preserves the Ollama model. */
  freeLLMApiModel: string;
  /** Default chat model id */
  chatModel: string;
  /** Default embedding model id */
  embedModel: string;
  /** Sampling temperature */
  temperature: number;
  /** Nucleus sampling probability */
  topP: number;
  /** Max tokens for chat completion */
  maxTokens: number;
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  provider: "mock",
  ollamaUrl: "http://localhost:11434",
  freeLLMApiUrl: process.env.FREELLMAPI_BASE_URL?.trim() || "http://localhost:3001/v1",
  freeLLMApiModel: "auto",
  chatModel: "qwen2.5-3b",
  embedModel: "embeddinggemma:300m",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
};

const SETTING_KEY = "llm_settings_v1";

export async function loadLLMSettings(): Promise<LLMSettings> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return DEFAULT_LLM_SETTINGS;
  try {
    const stored = JSON.parse(row.value) as Partial<LLMSettings>;
    return {
      ...DEFAULT_LLM_SETTINGS,
      ...stored,
      // Keep older stored Ollama selections intact; never trust malformed enum values.
      provider: stored.provider === "freellmapi" || stored.provider === "mock" ? stored.provider : "ollama",
    };
  } catch {
    return DEFAULT_LLM_SETTINGS;
  }
}

export async function loadProviderForModelListing(providerId?: string, freeLLMApiUrl?: string): Promise<{ provider: LLMProvider; settings: LLMSettings }> {
  const settings = await loadLLMSettings();
  const provider = providerId === "freellmapi" ? "freellmapi" : providerId === "ollama" ? "ollama" : providerId === "mock" ? "mock" : settings.provider;
  const next = { ...settings, provider, ...(freeLLMApiUrl ? { freeLLMApiUrl } : {}), ...(provider === "freellmapi" ? { chatModel: settings.freeLLMApiModel } : {}) };
  return { provider: buildProvider(next), settings: next };
}

export async function saveLLMSettings(s: LLMSettings): Promise<void> {
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(s) },
    update: { value: JSON.stringify(s) },
  });
}

export function buildProvider(s: LLMSettings): LLMProvider {
  switch (s.provider) {
    case "ollama":
      return new OllamaProvider(s.ollamaUrl, s.chatModel, s.embedModel);
    case "freellmapi":
      return new FreeLLMAPIProvider(s.freeLLMApiUrl, s.freeLLMApiModel, process.env.FREELLMAPI_API_KEY ?? "", s.ollamaUrl, s.embedModel);
    case "mock":
    default:
      return new MockProvider();
  }
}

/**
 * Returns the currently active provider. Settings are loaded on each call
 * so changes via /api/settings take effect immediately.
 */
export async function getActiveProvider(): Promise<{
  provider: LLMProvider;
  settings: LLMSettings;
}> {
  const stored = await loadLLMSettings();
  const settings = stored.provider === "freellmapi" ? { ...stored, chatModel: stored.freeLLMApiModel } : stored;
  const provider = buildProvider(stored);
  return { provider, settings };
}
