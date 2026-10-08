import { loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3-embedding:0.6b";
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;
const DEFAULT_EMBED_TIMEOUT_MS = 180_000;

let activeBaseUrl = DEFAULT_OLLAMA_BASE_URL;
let activeModel = DEFAULT_OLLAMA_MODEL;
const OLLAMA_PROBE_TIMEOUT_MS = parseTimeout(
  process.env.OLLAMA_PROBE_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
);
const OLLAMA_EMBED_TIMEOUT_MS = parseTimeout(
  process.env.OLLAMA_EMBED_TIMEOUT_MS,
  DEFAULT_EMBED_TIMEOUT_MS,
);

let lastReachable = false;
let lastError: string | null = null;

interface OllamaEmbeddingsResponse {
  embedding?: number[];
  embeddings?: number[][];
}

export interface OllamaStatus {
  reachable: boolean;
  error: string | null;
}

function parseTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function buildOllamaError(message: string, baseUrl = activeBaseUrl, model = activeModel): Error {
  return new Error(
    `${message}. Ensure Ollama is running at ${baseUrl}, model "${model}" is available, and the current timeout is long enough (probe=${OLLAMA_PROBE_TIMEOUT_MS}ms, embed=${OLLAMA_EMBED_TIMEOUT_MS}ms).`,
  );
}

async function requestEmbedding(
  input: string,
  timeoutMs: number,
): Promise<number[]> {
  const settings = await loadEmbeddingRuntimeSettings();
  activeBaseUrl = settings.baseUrl;
  activeModel = settings.model;
  const embeddingsEndpoint = `${settings.baseUrl}/api/embeddings`;
  const embedEndpoint = `${settings.baseUrl}/api/embed`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetch(embeddingsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        prompt: input,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      response = await fetch(embedEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          input,
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      throw buildOllamaError(
        `Ollama responded with HTTP ${response.status} ${response.statusText}`,
        settings.baseUrl,
        settings.model,
      );
    }

    const payload = (await response.json()) as OllamaEmbeddingsResponse;
    const vector = extractEmbedding(payload);
    if (!vector) {
      throw buildOllamaError("Ollama returned an empty embedding", settings.baseUrl, settings.model);
    }

    lastReachable = true;
    lastError = null;
    return vector;
  } catch (error) {
    lastReachable = false;
    lastError =
      error instanceof Error
        ? error.message
        : "Unknown Ollama embedding error";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw buildOllamaError("Ollama embedding request timed out");
      }
      throw buildOllamaError(error.message);
    }

    throw buildOllamaError("Unknown Ollama embedding error");
  } finally {
    clearTimeout(timeout);
  }
}

function extractEmbedding(payload: OllamaEmbeddingsResponse): number[] | null {
  if (Array.isArray(payload.embedding) && payload.embedding.length > 0) {
    return payload.embedding;
  }

  if (
    Array.isArray(payload.embeddings) &&
    payload.embeddings.length > 0 &&
    Array.isArray(payload.embeddings[0]) &&
    payload.embeddings[0].length > 0
  ) {
    return payload.embeddings[0];
  }

  return null;
}

export async function probeOllama(): Promise<OllamaStatus> {
  try {
    await requestEmbedding("probe", OLLAMA_PROBE_TIMEOUT_MS);
    return { reachable: true, error: null };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function embedText(text: string): Promise<number[]> {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("Cannot embed an empty string.");
  }

  return requestEmbedding(normalized, OLLAMA_EMBED_TIMEOUT_MS);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const normalized = texts.map((text) => text.trim());
  if (normalized.length === 0 || normalized.some((text) => !text)) {
    throw new Error("Cannot embed an empty text batch.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_EMBED_TIMEOUT_MS);
  try {
    const settings = await loadEmbeddingRuntimeSettings();
    activeBaseUrl = settings.baseUrl;
    activeModel = settings.model;
    const response = await fetch(`${settings.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, input: normalized }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return Promise.all(normalized.map((text) => requestEmbedding(text, OLLAMA_EMBED_TIMEOUT_MS)));
    }
    const payload = (await response.json()) as OllamaEmbeddingsResponse;
    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== normalized.length) {
      throw buildOllamaError("Ollama returned an unexpected embedding batch");
    }
    lastReachable = true;
    lastError = null;
    return payload.embeddings;
  } finally {
    clearTimeout(timeout);
  }
}

export function getLastOllamaReachability(): boolean {
  return lastReachable;
}

export function getLastOllamaError(): string | null {
  return lastError;
}

export function getOllamaModel(): string {
  return activeModel;
}

export function getOllamaBaseUrl(): string {
  return activeBaseUrl;
}

export function getOllamaTimeouts(): {
  probeTimeoutMs: number;
  embedTimeoutMs: number;
} {
  return {
    probeTimeoutMs: OLLAMA_PROBE_TIMEOUT_MS,
    embedTimeoutMs: OLLAMA_EMBED_TIMEOUT_MS,
  };
}
