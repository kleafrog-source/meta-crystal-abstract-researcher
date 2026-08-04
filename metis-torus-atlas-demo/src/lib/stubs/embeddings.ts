/* =============================================================================
 * ⚠️  STUB: Embedding Generator
 * =============================================================================
 *
 * ЗАГЛУШКА. Замените на реальный embedding backend:
 *
 *   Вариант A — sentence-transformers (Python):
 *     from sentence_transformers import SentenceTransformer
 *     model = SentenceTransformer("BAAI/bge-small-en-v1.5")
 *     emb = model.encode(text)  # → np.ndarray of shape (384,)
 *
 *   Вариант B — Xenova/transformers.js (in-process):
 *     import { pipeline } from "@xenova/transformers"
 *     const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5")
 *     const emb = await extractor(text, { pooling: "mean", normalize: true })
 *
 *   Вариант C — Ollama embeddings:
 *     POST http://localhost:11434/api/embeddings
 *     { "model": "nomic-embed-text", "prompt": "..." }
 *
 * Спецификация требует: z_q = Encoder(q) ∈ R^384
 * ========================================================================== */

import { seededRandom, normalize as normalizeVec } from "../engine/math-core";

export const EMBEDDING_DIM = 384;

export interface EmbeddingResult {
  vector: number[];
  dim: number;
  model_id: string;
  inference_ms: number;
}

export const STUB_EMBED_MODEL_ID = "stub:bge-small-en-v1.5@local";

/**
 * STUB embedding generator.
 *
 * Текущая реализация: deterministic hash-based vector длиной 384.
 * Это даёт разные, но стабильные эмбеддинги для каждого текста —
 * достаточно, чтобы топология тора и importance_W работали осмысленно.
 *
 * Для production — замените на реальный encoder.
 */
export async function stubEmbed(text: string): Promise<EmbeddingResult> {
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 5 + Math.random() * 15));

  // Хэш-сид из текста
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i) * (i + 1)) >>> 0;
  }
  const rng = seededRandom(seed || 1);

  // Генерация 384-мерного псевдо-эмбеддинга
  const raw: number[] = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    raw[i] = (rng() - 0.5) * 2;
  }

  // Семантический сдвиг — добавим небольшое смещение по ключевым словам
  const lower = text.toLowerCase();
  const semanticBias: Record<string, number> = {
    music: 0.5, metalcore: 0.7, dehumanized: 0.6,
    metal: 0.6, progressive: 0.5, prog: 0.5,
    audio: 0.4, genre: 0.3,
    forget: -0.3, remember: 0.3, update: 0.1,
  };
  for (const [kw, bias] of Object.entries(semanticBias)) {
    if (lower.includes(kw)) {
      for (let i = 0; i < EMBEDDING_DIM; i++) {
        raw[i] += bias * Math.sin(i * 0.1 + kw.length);
      }
    }
  }

  // L2 normalization как в реальных эмбеддингах
  const vector = normalizeVec(raw);

  return {
    vector,
    dim: EMBEDDING_DIM,
    model_id: STUB_EMBED_MODEL_ID,
    inference_ms: Date.now() - t0,
  };
}
