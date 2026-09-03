// Pure-TypeScript cosine similarity + top-k selection.
//
// This replaces the `numpy` based step from the FastAPI spec. With ~2.7k
// parameters × 1024 dims the full cosine sweep is < 5 ms even in JS, so no
// native extension / WASM is required.

import type { ActiveParameter, RawParameter } from "./rag-types";

/** Cosine similarity between two equal-length vectors.
 *  Undefined / NaN inputs are treated as zero to stay robust against
 *  half-populated rows. Returns 0 for empty/degenerate vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface ScoredParam {
  raw: RawParameter;
  embedding: number[];
  similarity: number;
}

/** Rank every `(rawParameter, embedding)` pair against `queryVector` and
 *  return the top `k` results as `ActiveParameter` objects.
 *
 *  The `suggested_value` is set to the parameter's `default` (per the task
 *  spec — LLM is forbidden, so we surface the dataset default and let the
 *  user fine-tune it through the slider / select / text controls). */
export function rankParameters(
  rows: Array<{ raw: RawParameter; embedding: number[] }>,
  queryVector: number[],
  k: number,
): Array<{ raw: RawParameter; similarity: number }> {
  const scored: ScoredParam[] = [];
  for (const row of rows) {
    const sim = cosineSimilarity(queryVector, row.embedding);
    scored.push({ raw: row.raw, embedding: row.embedding, similarity: sim });
  }
  // Partial top-k: avoid a full sort for large datasets.
  scored.sort((x, y) => y.similarity - x.similarity);
  const top = scored.slice(0, Math.max(0, k));
  return top.map((s) => ({ raw: s.raw, similarity: s.similarity }));
}

/** Convert a raw ranked parameter into the `ActiveParameter` shape the
 *  frontend edits. `current_value` starts equal to `suggested_value`. */
export function toActiveParameter(
  raw: RawParameter,
  similarity: number,
): ActiveParameter {
  const def = raw.default;
  return {
    technical_name: raw.technical_name,
    ui_element: raw.ui_element,
    min_value: raw.min_value,
    max_value: raw.max_value,
    step: raw.step,
    default: def,
    suggested_value: def,
    current_value: def,
    unit: raw.unit,
    options: raw.options,
    min_length: raw.min_length,
    max_length: raw.max_length,
    lyria_prompt_tags: raw.lyria_prompt_tags,
    semantic_keywords: raw.semantic_keywords,
    similarity,
  };
}
