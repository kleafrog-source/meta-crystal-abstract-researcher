import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { ensureDatasetLoaded, rawToActiveParameter, rowToRaw } from "@/lib/rag-dataset";
import { embedText } from "@/lib/ollama-client";
import type { ActiveParameter } from "@/lib/rag-types";
import { cosineSimilarity } from "@/lib/vector-math";

interface CachedParameter {
  raw: ReturnType<typeof rowToRaw>;
  baseVector: number[];
}

interface SearchResult {
  query: string;
  totalVectorized: number;
  results: ActiveParameter[];
}

let cachedParameters: CachedParameter[] | null = null;
let cachedVectorizedCount = -1;

export function invalidateSearchCache(): void {
  cachedParameters = null;
  cachedVectorizedCount = -1;
}

async function loadVectorizedParameters(): Promise<CachedParameter[]> {
  if (cachedParameters) {
    return cachedParameters;
  }

  await ensureDatasetLoaded();

  const rows = await db.parameter.findMany({
    where: {
      isVectorized: true,
      valueVectors: {
        not: Prisma.AnyNull,
      },
    },
  });

  const parsedRows: CachedParameter[] = [];

  for (const row of rows) {
    if (!row.valueVectors || !Array.isArray(row.valueVectors)) {
      continue;
    }

    const middleVector = row.valueVectors[1];
    if (!Array.isArray(middleVector) || middleVector.length === 0) {
      continue;
    }

    parsedRows.push({
      raw: rowToRaw(row),
      baseVector: middleVector.filter(
        (value): value is number => typeof value === "number",
      ),
    });
  }

  cachedParameters = parsedRows;
  cachedVectorizedCount = parsedRows.length;

  return parsedRows;
}

export async function isSearchCacheStale(): Promise<boolean> {
  if (!cachedParameters) {
    return true;
  }

  const currentCount = await db.parameter.count({
    where: {
      isVectorized: true,
    },
  });

  return currentCount !== cachedVectorizedCount;
}

export async function semanticSearch(input: {
  query: string;
  topK: number;
}): Promise<SearchResult> {
  const query = input.query.trim();
  const topK = Math.max(1, Math.min(100, input.topK));

  if (!query) {
    return {
      query: "",
      totalVectorized: 0,
      results: [],
    };
  }

  const rows = await loadVectorizedParameters();
  if (rows.length === 0) {
    throw new Error("No vectorized parameters found. Run vectorization first.");
  }

  const queryEmbedding = await embedText(query);

  const ranked = rows
    .map((row) => ({
      raw: row.raw,
      similarity: cosineSimilarity(queryEmbedding, row.baseVector),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK)
    .map((row) => rawToActiveParameter(row.raw, row.similarity));

  return {
    query,
    totalVectorized: rows.length,
    results: ranked,
  };
}
