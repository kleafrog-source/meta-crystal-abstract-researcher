// Real Ollama embedding client for the `bge-m3:q8_0` model.
//
// The endpoint called is exactly:
//   POST http://localhost:11434/api/embeddings
//   { "model": "qllama/bge-m3:q8_0", "input": <text> }
// as specified in the task. The model name and base URL are configurable
// through env vars (OLLAMA_EMBED_BASE_URL, OLLAMA_EMBED_MODEL) so a local
// user can point at a different port / tag without touching code.
//
// IMPORTANT — no LLM is ever used. This module only produces vectors that
// are later compared with plain cosine similarity (see `rag-similarity.ts`).
//
// FALLBACK BEHAVIOUR
// ------------------
// Ollama runs on the *user's* machine. In environments where
// `localhost:11434` is unreachable (sandbox, CI, fresh clone without
// Ollama) the real call fails fast with ECONNREFUSED. To keep the UI fully
// demonstrable in that case we transparently fall back to a deterministic
// *signed hashing-trick* embedding (1024-dim, unit-normalised). It is a
// legitimate bag-of-words style semantic embedding — texts that share
// tokens land closer in cosine space — so the search flow still works
// end-to-end. The status payload exposes `used_fallback` / `ollama_reachable`
// so the UI always tells the user which engine produced the vectors.

const OLLAMA_BASE_URL =
  process.env.OLLAMA_EMBED_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:11434";
const OLLAMA_MODEL =
  (process.env.OLLAMA_EMBED_MODEL ?? "qllama/bge-m3:q8_0").trim();
const OLLAMA_EMBEDDING_ENDPOINT = `${OLLAMA_BASE_URL}/api/embeddings`;

// bge-m3 produces 1024-dimensional vectors. The fallback embedding uses
// the exact same dimensionality so the downstream similarity math is
// identical regardless of the engine.
export const EMBEDDING_DIM = 1024;

type EmbedMode = "ollama" | "fallback" | "unknown";

let mode: EmbedMode = "unknown";
let lastOllamaReachable = false;
let lastErrorMessage: string | null = null;

export interface EmbedResult {
  vector: number[];
  usedFallback: boolean;
}

export interface OllamaProbeResult {
  reachable: boolean;
  mode: EmbedMode;
  error: string | null;
}

/** Quick connectivity probe — sends a one-token embedding request with a
 *  short timeout. Caches the outcome so we don't pay the latency on every
 *  single vectorize call. Call `resetModeCache()` to force a re-probe. */
export async function probeOllama(): Promise<OllamaProbeResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(OLLAMA_EMBEDDING_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, input: "ping" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      mode = "fallback";
      lastOllamaReachable = false;
      lastErrorMessage = `Ollama responded HTTP ${res.status} ${res.statusText}`;
      return { reachable: false, mode, error: lastErrorMessage };
    }
    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      mode = "fallback";
      lastOllamaReachable = false;
      lastErrorMessage =
        "Ollama responded but returned an empty embedding — the model may not be pulled yet.";
      return { reachable: false, mode, error: lastErrorMessage };
    }
    mode = "ollama";
    lastOllamaReachable = true;
    lastErrorMessage = null;
    return { reachable: true, mode, error: null };
  } catch (err) {
    mode = "fallback";
    lastOllamaReachable = false;
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Ollama probe timed out (>3s)"
          : err.message
        : String(err);
    lastErrorMessage = msg;
    return { reachable: false, mode, error: msg };
  }
}

export function resetModeCache(): void {
  mode = "unknown";
  lastOllamaReachable = false;
  lastErrorMessage = null;
}

export function getOllamaReachable(): boolean {
  return lastOllamaReachable;
}

export function getOllamaError(): string | null {
  return lastErrorMessage;
}

export function getCurrentMode(): EmbedMode {
  return mode;
}

/** Compute a single embedding for `text`. Uses the real Ollama call when
 *  available, otherwise the deterministic signed-hashing fallback. */
export async function embed(text: string): Promise<EmbedResult> {
  const input = (text ?? "").trim();
  if (mode === "unknown") {
    await probeOllama();
  }
  if (mode === "ollama") {
    try {
      const controller = new AbortController();
      // Single-text embedding is fast; allow generous timeout for the
      // first request after a cold Ollama model load.
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(OLLAMA_EMBEDDING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_MODEL, input }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { embedding?: number[] };
      const vec = data.embedding;
      if (!Array.isArray(vec) || vec.length === 0) {
        throw new Error("Ollama returned an empty embedding");
      }
      return { vector: vec, usedFallback: false };
    } catch (err) {
      // Network blip mid-run — flip to fallback for the rest of the batch.
      mode = "fallback";
      lastOllamaReachable = false;
      lastErrorMessage =
        err instanceof Error ? err.message : String(err);
    }
  }
  return { vector: fallbackEmbed(input), usedFallback: true };
}

// --- Deterministic fallback embedding -------------------------------------

// 32-bit unsigned MurmurHash3 x86 finaliser — deterministic, well-mixed.
function murmurhash3_x86_32(key: string, seed = 0): number {
  const data = Buffer.from(key, "utf8");
  const len = data.length;
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let roundedEnd = (len / 4) | 0;
  for (let i = 0; i < roundedEnd; i++) {
    const k1 =
      (data[i * 4] & 0xff) |
      ((data[i * 4 + 1] & 0xff) << 8) |
      ((data[i * 4 + 2] & 0xff) << 16) |
      ((data[i * 4 + 3] & 0xff) << 24);
    let x = Math.imul(k1, c1);
    x = (x << 15) | (x >>> 17);
    x = Math.imul(x, c2);
    h1 ^= x;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }
  let k1 = 0;
  const tail = len - roundedEnd * 4;
  if (tail >= 3) k1 ^= data[roundedEnd * 4 + 2] << 16;
  if (tail >= 2) k1 ^= data[roundedEnd * 4 + 1] << 8;
  if (tail >= 1) {
    k1 ^= data[roundedEnd * 4];
    let x = Math.imul(k1, c1);
    x = (x << 15) | (x >>> 17);
    h1 ^= Math.imul(x, c2);
  }
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

// Light tokeniser — lowercase, split on non-alphanumeric (keeps unicode
// letters via the \p{L}\p{N} escapes). Mirrors how a bag-of-words model
// would treat the multilingual (RU + EN) keywords in the dataset.
function tokenize(text: string): string[] {
  if (!text) return [];
  const matched = text
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  return matched ?? [];
}

/**
 * Deterministic 1024-dim unit-normalised signed-hashing embedding.
 *
 * Each token is mapped to two dimensions via two independent hashes; one
 * dimension receives +tf, the paired dimension receives −tf (the classic
 * "signed feature hashing" trick that reduces collision bias). Texts that
 * share more tokens therefore end up closer in cosine space, so the search
 * ordering is semantically meaningful even without Ollama.
 */
export function fallbackEmbed(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h1 = murmurhash3_x86_32(tok, 0x9747b2c1);
    const h2 = murmurhash3_x86_32(tok, 0x5bd1e995);
    const idx1 = h1 % EMBEDDING_DIM;
    const idx2 = h2 % EMBEDDING_DIM;
    const sign = (h1 >>> 31) === 1 ? 1 : -1;
    vec[idx1] += sign;
    vec[idx2] -= sign;
  }
  // L2-normalise.
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;
  }
  return vec;
}
