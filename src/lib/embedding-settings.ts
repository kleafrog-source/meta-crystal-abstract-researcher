import { loadLLMSettings } from "@/lib/llm/factory";

export interface EmbeddingRuntimeSettings {
  baseUrl: string;
  model: string;
}

const FALLBACK_BASE_URL = "http://localhost:11434";
const FALLBACK_MODEL = "qwen3-embedding:4b";

export async function loadEmbeddingRuntimeSettings(): Promise<EmbeddingRuntimeSettings> {
  try {
    const settings = await loadLLMSettings();
    return {
      baseUrl: settings.ollamaUrl.trim().replace(/\/$/, "") || FALLBACK_BASE_URL,
      model: settings.embedModel.trim() || FALLBACK_MODEL,
    };
  } catch {
    return {
      baseUrl: process.env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "") || FALLBACK_BASE_URL,
      model: process.env.OLLAMA_EMBED_MODEL?.trim() || FALLBACK_MODEL,
    };
  }
}

export function embeddingProcessEnv(settings: EmbeddingRuntimeSettings): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OLLAMA_BASE_URL: settings.baseUrl,
    OLLAMA_EMBED_MODEL: settings.model,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
  };
}
