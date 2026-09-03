// Semantic search over the vectorised parameters.
//
// Loads every vectorised row once into memory (the ~2.7k × 1024-float
// matrix fits comfortably in ~25 MB) and keeps it cached. The cache is
// invalidated whenever the vectorization job finishes, so the next search
// picks up freshly-embedded parameters automatically.

import { db } from "@/lib/db";
import { buildEmbeddingText, ensureDatasetLoaded, rowToRaw } from "./rag-dataset";
import { embed, getCurrentMode, getOllamaReachable } from "./rag-ollama";
import { rankParameters, toActiveParameter } from "./rag-similarity";
import type { ActiveParameter, RawParameter } from "./rag-types";

interface CachedRow {
  raw: RawParameter;
  embedding: number[];
}

let cache: CachedRow[] | null = null;
let cacheVectorizedCount = -1;

/** Drop the in-memory cache. Called by the vectorization job / status
 *  route when new embeddings have been written. */
export function invalidateSearchCache(): void {
  cache = null;
  cacheVectorizedCount = -1;
}

async function loadCache(): Promise<CachedRow[]> {
  if (cache) return cache;
  await ensureDatasetLoaded();
  const rows = await db.parameter.findMany({
    where: { isVectorized: true, NOT: { embedding: null } },
  });
  const out: CachedRow[] = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    let embedding: number[];
    try {
      embedding = JSON.parse(row.embedding) as number[];
    } catch {
      continue;
    }
    if (!Array.isArray(embedding) || embedding.length === 0) continue;
    out.push({ raw: rowToRaw(row), embedding });
  }
  cache = out;
  cacheVectorizedCount = rows.length;
  return out;
}

export interface SearchParams {
  query: string;
  topK: number;
}

export interface SearchResult {
  query: string;
  usedFallback: boolean;
  ollamaReachable: boolean;
  totalVectorized: number;
  results: ActiveParameter[];
}

/** Embed the user query and return the top-K most similar parameters,
 *  ready to be edited in the UI (each one pre-loaded with its dataset
 *  default as `suggested_value` / `current_value`). */
export async function semanticSearch(
  params: SearchParams,
): Promise<SearchResult> {
  const query = params.query.trim();
  const topK = Math.max(1, Math.min(100, params.topK));

  await ensureDatasetLoaded();
  const cached = await loadCache();

  // Embed the query with the same engine used for the parameters.
  const { vector, usedFallback } = await embed(
    query || buildEmbeddingText({
      technical_name: "empty query",
      ui_element: "String",
      default: "",
      lyria_prompt_tags: [],
      semantic_keywords: [],
    }),
  );

  const ranked = rankParameters(cached, vector, topK);
  const results = ranked.map((r) => toActiveParameter(r.raw, r.similarity));

  return {
    query,
    usedFallback,
    ollamaReachable: getOllamaReachable(),
    totalVectorized: cached.length,
    results,
  };
}

/** Diagnostic — how many vectorised params are currently cached. */
export function cachedVectorizedCount(): number {
  return cacheVectorizedCount;
}

export function currentEngineMode(): "ollama" | "fallback" | "unknown" {
  return getCurrentMode();
}

/** True when the cached snapshot is stale relative to the DB (e.g. the
 *  vectorization job has written new rows since we last loaded). */
export async function isCacheStale(): Promise<boolean> {
  if (!cache) return true;
  const current = await db.parameter.count({ where: { isVectorized: true } });
  return current !== cacheVectorizedCount;
}
