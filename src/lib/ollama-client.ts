const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qllama/bge-m3:q8_0";
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;
const DEFAULT_EMBED_TIMEOUT_MS = 180_000;

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_OLLAMA_BASE_URL;
const OLLAMA_MODEL =
  process.env.OLLAMA_EMBED_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
const OLLAMA_PROBE_TIMEOUT_MS = parseTimeout(
  process.env.OLLAMA_PROBE_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
);
const OLLAMA_EMBED_TIMEOUT_MS = parseTimeout(
  process.env.OLLAMA_EMBED_TIMEOUT_MS,
  DEFAULT_EMBED_TIMEOUT_MS,
);
const OLLAMA_EMBEDDINGS_ENDPOINT = `${OLLAMA_BASE_URL}/api/embeddings`;
const OLLAMA_EMBED_ENDPOINT = `${OLLAMA_BASE_URL}/api/embed`;

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

function buildOllamaError(message: string): Error {
  return new Error(
    `${message}. Ensure Ollama is running at ${OLLAMA_BASE_URL}, model "${OLLAMA_MODEL}" is available, and the current timeout is long enough (probe=${OLLAMA_PROBE_TIMEOUT_MS}ms, embed=${OLLAMA_EMBED_TIMEOUT_MS}ms).`,
  );
}

async function requestEmbedding(
  input: string,
  timeoutMs: number,
): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetch(OLLAMA_EMBEDDINGS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: input,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      response = await fetch(OLLAMA_EMBED_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          input,
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      throw buildOllamaError(
        `Ollama responded with HTTP ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as OllamaEmbeddingsResponse;
    const vector = extractEmbedding(payload);
    if (!vector) {
      throw buildOllamaError("Ollama returned an empty embedding");
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

export function getLastOllamaReachability(): boolean {
  return lastReachable;
}

export function getLastOllamaError(): string | null {
  return lastError;
}

export function getOllamaModel(): string {
  return OLLAMA_MODEL;
}

export function getOllamaBaseUrl(): string {
  return OLLAMA_BASE_URL;
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
