/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 *
 * Pipeline:
 *   1. User query is embedded via the active LLM provider.
 *   2. We search the KnowledgeEntity table for the top-K most similar entries
 *      (cosine similarity over stored embeddings).
 *   3. We also search the Crystal table for similar crystals.
 *   4. The retrieved entities are formatted into a context block and passed
 *      to the LLM via the `ragContext` option.
 *
 * For the prototype we store embeddings as JSON arrays in SQLite. In
 * production this should be replaced by pgvector + HNSW index.
 */

import { db } from "@/lib/db";
import { getActiveProvider } from "../llm/factory";
import { cosineSimilarity } from "../llm/types";

export interface RAGSearchResult {
  kind: "lexicon" | "operator" | "pattern" | "focus" | "crystal";
  name: string;
  score: number;
  snippet: string;
  meta?: Record<string, unknown>;
}

export interface RAGContext {
  query: string;
  results: RAGSearchResult[];
  contextText: string;
  embedded: boolean;
}

const TOP_K = 8;

/**
 * Make sure all knowledge base entities have embeddings. Called lazily
 * the first time the chat is used, or explicitly from the settings page.
 */
export async function ensureKnowledgeEmbeddings(force = false): Promise<{
  total: number;
  embedded: number;
  skipped: number;
}> {
  const { provider, settings } = await getActiveProvider();
  const isMock = provider.id === "mock";

  // Pull all knowledge entities
  const entities = await db.knowledgeEntity.findMany();
  let embedded = 0;
  let skipped = 0;

  for (const ent of entities) {
    if (!force && ent.embedding) {
      skipped++;
      continue;
    }
    const text = `${ent.kind} ${ent.name} ${ent.category ?? ""} ${ent.metaJson ?? ""}`.slice(0, 500);
    let vec: number[];
    try {
      vec = await provider.embed(text, settings.embedModel);
    } catch (e) {
      // If the provider fails (e.g. Ollama unreachable), skip
      skipped++;
      continue;
    }
    await db.knowledgeEntity.update({
      where: { id: ent.id },
      data: { embedding: JSON.stringify(vec) },
    });
    embedded++;
    // Don't hammer the LLM
    if (!isMock) await new Promise((r) => setTimeout(r, 50));
  }
  return { total: entities.length, embedded, skipped };
}

/**
 * Build a RAG context for a user query: embed the query and retrieve the
 * top-K most similar knowledge entities + crystals.
 */
export async function buildRAGContext(query: string): Promise<RAGContext> {
  const { provider, settings } = await getActiveProvider();
  let queryVec: number[];
  let embedded = true;
  try {
    queryVec = await provider.embed(query, settings.embedModel);
  } catch {
    // Fallback: empty vector — RAG context will be empty
    queryVec = [];
    embedded = false;
  }

  const results: RAGSearchResult[] = [];

  if (embedded && queryVec.length > 0) {
    // Search knowledge entities
    const entities = await db.knowledgeEntity.findMany({
      where: { embedding: { not: null } },
      take: 2000,
    });
    for (const ent of entities) {
      try {
        const v = JSON.parse(ent.embedding!) as number[];
        const score = cosineSimilarity(queryVec, v);
        if (score > 0.2) {
          let meta: Record<string, unknown> = {};
          try {
            meta = JSON.parse(ent.metaJson ?? "{}");
          } catch {}
          results.push({
            kind: ent.kind as RAGSearchResult["kind"],
            name: ent.name,
            score,
            snippet: buildEntitySnippet(ent.kind, ent.name, ent.category, meta),
            meta,
          });
        }
      } catch {}
    }

    // Search crystals (limited to top 500 for prototype)
    const crystals = await db.crystal.findMany({
      where: { embedding: { not: null } },
      take: 500,
      orderBy: { counter: "desc" },
    });
    for (const c of crystals) {
      try {
        const v = JSON.parse(c.embedding!) as number[];
        const score = cosineSimilarity(queryVec, v);
        if (score > 0.2) {
          results.push({
            kind: "crystal",
            name: c.code,
            score,
            snippet: `${c.type} • ${c.focus ?? "?"} • ${c.combination.slice(0, 120)}`,
            meta: {
              type: c.type,
              focus: c.focus,
              qualityScore: c.qualityScore,
              complexity: c.complexity,
            },
          });
        }
      } catch {}
    }
  }

  // Sort and truncate
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, TOP_K);

  // Build a text block for the LLM
  const contextText =
    top.length === 0
      ? ""
      : top
          .map((r, i) => {
            return `[${i + 1}] (${r.kind}) ${r.name} — score ${r.score.toFixed(3)}\n    ${r.snippet}`;
          })
          .join("\n\n");

  return { query, results: top, contextText, embedded };
}

function buildEntitySnippet(
  kind: string,
  name: string,
  category: string | null,
  meta: Record<string, unknown>,
): string {
  const parts: string[] = [];
  if (category) parts.push(`category=${category}`);
  if (meta.definition) parts.push(`def: ${String(meta.definition).slice(0, 80)}`);
  if (meta.description) parts.push(`desc: ${String(meta.description).slice(0, 80)}`);
  if (meta.formula) parts.push(`formula: ${String(meta.formula).slice(0, 60)}`);
  if (meta.type) parts.push(`type=${String(meta.type)}`);
  return parts.length ? parts.join(" | ") : `${kind} ${name}`;
}

/**
 * Semantic search over crystals (used by the Crystals page).
 * Returns crystal ids ranked by similarity to the query.
 */
export async function semanticSearchCrystals(
  query: string,
  limit = 50,
): Promise<Array<{ id: string; score: number }>> {
  const { provider, settings } = await getActiveProvider();
  let queryVec: number[];
  try {
    queryVec = await provider.embed(query, settings.embedModel);
  } catch {
    return [];
  }
  const crystals = await db.crystal.findMany({
    where: { embedding: { not: null } },
    take: 1000,
  });
  const scored: Array<{ id: string; score: number }> = [];
  for (const c of crystals) {
    try {
      const v = JSON.parse(c.embedding!) as number[];
      const score = cosineSimilarity(queryVec, v);
      scored.push({ id: c.id, score });
    } catch {}
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
