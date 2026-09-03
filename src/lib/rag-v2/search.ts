import { promises as fs } from "node:fs";

import { embedText } from "@/lib/ollama-client";
import { cosineSimilarity } from "@/lib/vector-math";

import { getEnrichedDataset, buildRetrievalText, toActiveParameter } from "./dataset";
import { RAG_V2_RETRIEVAL_INDEX_PATH } from "./paths";
import { runAnchoringBridge } from "./python-bridge";
import type { ActiveParameter, EnrichedParameter, ProposeParametersResponse } from "./types";

const STOPWORDS = new Set([
  "и",
  "в",
  "на",
  "с",
  "по",
  "для",
  "то",
  "это",
  "а",
  "но",
  "или",
  "как",
  "так",
  "что",
  "чтобы",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "and",
  "with",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter(
    (token) => token.length > 1 && !STOPWORDS.has(token),
  );
}

function lexicalScore(query: string, param: EnrichedParameter): number {
  const queryTokens = tokenize(query);
  const paramText = buildRetrievalText(param).toLowerCase();
  const paramTokens = new Set(tokenize(paramText));

  let score = 0;
  for (const token of queryTokens) {
    if (param.technical_name.toLowerCase().includes(token)) {
      score += 5;
    }
    if (paramTokens.has(token)) {
      score += 3;
    }
    if (paramText.includes(token)) {
      score += 1;
    }
  }

  if (param.quantity_kind && query.toLowerCase().includes(param.quantity_kind.toLowerCase())) {
    score += 2;
  }

  if (param.domain && query.toLowerCase().includes(param.domain.toLowerCase().replaceAll("_", " "))) {
    score += 2;
  }

  return score;
}

export function getRetrievalCacheSize(): number {
  return 0;
}

async function loadRetrievalIndex(): Promise<Map<string, number[]>> {
  const raw = await fs.readFile(RAG_V2_RETRIEVAL_INDEX_PATH, "utf8");
  const parsed = JSON.parse(raw) as {
    items?: Array<{ technical_name?: string; embedding?: number[] }>;
  };
  const index = new Map<string, number[]>();
  for (const item of parsed.items ?? []) {
    if (!item.technical_name || !Array.isArray(item.embedding) || item.embedding.length === 0) {
      continue;
    }
    index.set(
      item.technical_name,
      item.embedding.filter((value): value is number => typeof value === "number"),
    );
  }
  return index;
}

export async function searchAndAnchor(params: {
  query: string;
  topK: number;
  currentValues: Record<string, number | string>;
}): Promise<ProposeParametersResponse> {
  const query = params.query.trim();
  if (!query) {
    return {
      query: "",
      results: [],
      total_candidates: 0,
      total_scoped: 0,
      retrieval_cache_size: 0,
    };
  }

  const dataset = await getEnrichedDataset();
  const retrievalIndex = await loadRetrievalIndex();
  if (retrievalIndex.size === 0) {
    throw new Error("Retrieval index is missing or empty. Build the v2 retrieval index first.");
  }
  const topK = Math.max(1, Math.min(40, params.topK));
  const candidateLimit = 48;

  const lexicalCandidates = dataset
    .map((param) => ({
      param,
      lexical: lexicalScore(query, param),
    }))
    .sort((left, right) => right.lexical - left.lexical || left.param.technical_name.localeCompare(right.param.technical_name))
    .slice(0, candidateLimit);

  const queryVector = await embedText(query);
  const scored = await Promise.all(
    lexicalCandidates.map(async ({ param, lexical }) => {
      const embedding = retrievalIndex.get(param.technical_name);
      if (!embedding || embedding.length === 0) {
        return null;
      }
      return {
        param,
        similarity: cosineSimilarity(queryVector, embedding),
        lexical,
      };
    }),
  );

  const scoped = scored
    .filter(
      (
        entry,
      ): entry is {
        param: EnrichedParameter;
        similarity: number;
        lexical: number;
      } => entry !== null,
    )
    .sort((left, right) => right.similarity - left.similarity || right.lexical - left.lexical)
    .slice(0, topK);

  const anchored = await runAnchoringBridge({
    query,
    scoped_params: scoped.map((entry) => entry.param as unknown as Record<string, unknown>),
    current_values: params.currentValues,
  });

  const results: ActiveParameter[] = scoped.map((entry) =>
    toActiveParameter(entry.param, entry.similarity, anchored[entry.param.technical_name]),
  );

  return {
    query,
    results,
    total_candidates: dataset.length,
    total_scoped: scoped.length,
    retrieval_cache_size: 0,
  };
}
