import { seededRandom, normalize } from "@/lib/metis/math-core";
import type { MetisProviderConfig, OllamaModelInfo } from "@/lib/metis/types";

export interface LlmGenerateRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmGenerateResponse {
  text: string;
  modelId: string;
  tokensGenerated: number;
  inferenceMs: number;
}

export interface EmbeddingResponse {
  vector: number[];
  modelId: string;
  dim: number;
  inferenceMs: number;
}

export const EMBEDDING_DIM = 384;

const DEFAULT_CONFIG: MetisProviderConfig = {
  llmProvider: (process.env.METIS_LLM_PROVIDER as "stub" | "vllm" | "ollama") || "stub",
  embeddingProvider: (process.env.METIS_EMBED_PROVIDER as "stub" | "vllm" | "ollama") || "stub",
  vllmBaseUrl: process.env.METIS_VLLM_BASE_URL || "http://127.0.0.1:8000/v1",
  vllmModel: process.env.METIS_VLLM_MODEL || "IAAR-Shanghai/Metis-4B",
  vllmEmbeddingModel: process.env.METIS_VLLM_EMBED_MODEL || "BAAI/bge-small-en-v1.5",
  ollamaBaseUrl: process.env.METIS_OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  ollamaModel: process.env.METIS_OLLAMA_MODEL || "mmss-qwen2.5-3b-cpu2:latest",
  ollamaEmbeddingModel: process.env.METIS_OLLAMA_EMBED_MODEL || "qllama/bge-m3:q8_0",
  temperature: Number(process.env.METIS_TEMPERATURE || 0.5),
  maxTokens: Number(process.env.METIS_MAX_TOKENS || 180),
  requestTimeoutMs: Number(process.env.METIS_REQUEST_TIMEOUT_MS || 60000),
};

declare global {
  var __metisProviderConfig: MetisProviderConfig | undefined;
}

export function getMetisProviderConfig(): MetisProviderConfig {
  if (!global.__metisProviderConfig) {
    global.__metisProviderConfig = { ...DEFAULT_CONFIG };
  }
  return global.__metisProviderConfig;
}

export function updateMetisProviderConfig(next: Partial<MetisProviderConfig>): MetisProviderConfig {
  const current = getMetisProviderConfig();
  global.__metisProviderConfig = {
    ...current,
    ...next,
    temperature: clampNumber(next.temperature ?? current.temperature, 0, 2),
    maxTokens: Math.max(16, Math.floor(next.maxTokens ?? current.maxTokens)),
    requestTimeoutMs: Math.max(1000, Math.floor(next.requestTimeoutMs ?? current.requestTimeoutMs)),
  };
  return global.__metisProviderConfig;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "http://127.0.0.1:8000/v1";
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function buildOllamaBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed || "http://127.0.0.1:11434";
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function createStubEmbedding(text: string): EmbeddingResponse {
  const startedAt = Date.now();
  let seed = 0;
  for (let index = 0; index < text.length; index += 1) {
    seed = (seed * 31 + text.charCodeAt(index) * (index + 1)) >>> 0;
  }
  const rng = seededRandom(seed || 1);
  const vector = normalize(Array.from({ length: EMBEDDING_DIM }, () => (rng() - 0.5) * 2));
  return {
    vector,
    modelId: "stub:bge-small-en-v1.5@local",
    dim: EMBEDDING_DIM,
    inferenceMs: Date.now() - startedAt,
  };
}

function createStubText(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("remember") || lower.includes("запомни")) return `Запомнил: ${prompt.replace(/^(remember|запомни)[:, ]*/i, "").trim() || "(пусто)"}`;
  if (lower.includes("forget") || lower.includes("забудь")) return `Удалил из активной памяти: ${prompt.replace(/^(forget|забудь)[:, ]*/i, "").trim() || "(пусто)"}`;
  if (lower.includes("reflect") || lower.includes("отрази")) return "Выполнил reflect: пересобрал приоритеты памяти и карту узлов.";
  if (lower.includes("update") || lower.includes("обнови")) return "Обновил сохраненный контекст и согласовал веса памяти.";
  return "STUB-ответ METIS: локальный движок принял запрос. Для реальной генерации переключите LLM provider на vLLM.";
}

export async function embedText(text: string, config = getMetisProviderConfig()): Promise<EmbeddingResponse> {
  if (config.embeddingProvider === "stub") {
    return createStubEmbedding(text);
  }

  if (config.embeddingProvider === "ollama") {
    const startedAt = Date.now();
    const baseUrl = buildOllamaBaseUrl(config.ollamaBaseUrl);
    const json = await fetchJsonWithTimeout<{ embeddings?: number[][]; embedding?: number[] }>(
      `${baseUrl}/api/embed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaEmbeddingModel || config.ollamaModel,
          input: text,
        }),
      },
      config.requestTimeoutMs,
    );
    const vector = json.embeddings?.[0] ?? json.embedding;
    if (!vector?.length) {
      throw new Error("Ollama embeddings returned empty vector");
    }
    return {
      vector,
      modelId: config.ollamaEmbeddingModel || config.ollamaModel,
      dim: vector.length,
      inferenceMs: Date.now() - startedAt,
    };
  }

  const baseUrl = buildBaseUrl(config.vllmBaseUrl);
  const startedAt = Date.now();
  const json = await fetchJsonWithTimeout<{ data?: Array<{ embedding: number[] }> }>(
    `${baseUrl}/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.vllmEmbeddingModel || config.vllmModel,
        input: text,
      }),
    },
    config.requestTimeoutMs,
  );
  const vector = json.data?.[0]?.embedding;
  if (!vector?.length) {
    throw new Error("vLLM embeddings returned empty vector");
  }
  return {
    vector,
    modelId: config.vllmEmbeddingModel || config.vllmModel,
    dim: vector.length,
    inferenceMs: Date.now() - startedAt,
  };
}

export async function generateText(request: LlmGenerateRequest, config = getMetisProviderConfig()): Promise<LlmGenerateResponse> {
  const startedAt = Date.now();
  if (config.llmProvider === "stub") {
    const text = createStubText(request.prompt);
    return {
      text,
      modelId: "stub:metis-4b@local",
      tokensGenerated: Math.ceil((request.prompt.length + text.length) / 4),
      inferenceMs: Date.now() - startedAt,
    };
  }

  if (config.llmProvider === "ollama") {
    const baseUrl = buildOllamaBaseUrl(config.ollamaBaseUrl);
    const json = await fetchJsonWithTimeout<{
      model?: string;
      message?: { content?: string };
      eval_count?: number;
      total_duration?: number;
    }>(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          stream: false,
          options: {
            temperature: request.temperature ?? config.temperature,
            num_predict: request.maxTokens ?? config.maxTokens,
          },
          messages: [
            ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
            { role: "user", content: request.prompt },
          ],
        }),
      },
      config.requestTimeoutMs,
    );
    const text = json.message?.content?.trim();
    if (!text) {
      throw new Error("Ollama chat returned empty completion");
    }
    return {
      text,
      modelId: json.model || config.ollamaModel,
      tokensGenerated: json.eval_count ?? Math.ceil(text.length / 4),
      inferenceMs: json.total_duration ? json.total_duration / 1_000_000 : Date.now() - startedAt,
    };
  }

  const baseUrl = buildBaseUrl(config.vllmBaseUrl);
  const json = await fetchJsonWithTimeout<{
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { completion_tokens?: number };
    model?: string;
  }>(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.vllmModel,
        stream: false,
        temperature: request.temperature ?? config.temperature,
        max_tokens: request.maxTokens ?? config.maxTokens,
        messages: [
          ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
          { role: "user", content: request.prompt },
        ],
      }),
    },
    config.requestTimeoutMs,
  );
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("vLLM chat returned empty completion");
  }
  return {
    text,
    modelId: json.model || config.vllmModel,
    tokensGenerated: json.usage?.completion_tokens ?? Math.ceil(text.length / 4),
    inferenceMs: Date.now() - startedAt,
  };
}

export async function listOllamaModels(baseUrl: string, timeoutMs: number): Promise<OllamaModelInfo[]> {
  const json = await fetchJsonWithTimeout<{ models?: OllamaModelInfo[] }>(
    `${buildOllamaBaseUrl(baseUrl)}/api/tags`,
    { method: "GET" },
    timeoutMs,
  );
  return (json.models ?? []).sort((a, b) => a.name.localeCompare(b.name));
}
