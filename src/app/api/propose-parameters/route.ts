import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { ensureDatasetLoaded, rowToRaw } from "@/lib/rag-dataset";
import { embedText } from "@/lib/ollama-client";
import type {
  ActiveParameter,
  ProposeParametersRequest,
  ProposeParametersResponse,
} from "@/lib/rag-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: ProposeParametersRequest;

  try {
    body = (await request.json()) as ProposeParametersRequest;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    const payload: ProposeParametersResponse = {
      query: "",
      total_vectorized: 0,
      results: [],
    };

    return NextResponse.json(payload);
  }

  try {
    await ensureDatasetLoaded();
    const queryVector = await embedText(query);
    const rows = await db.parameter.findMany({
      where: {
        isVectorized: true,
        valueVectors: {
          not: Prisma.AnyNull,
        },
      },
      orderBy: {
        technicalName: "asc",
      },
    });

    const scoredRows = rows
      .map((row) => {
        const valueVectors = parseValueVectors(row.valueVectors);
        const baseVector = valueVectors[1] ?? valueVectors[0] ?? null;
        if (!baseVector) {
          return null;
        }

        return {
          row,
          valueVectors,
          baseSimilarity: cosineSimilarity(queryVector, baseVector),
        };
      })
      .filter(
        (
          item,
        ): item is {
          row: typeof rows[number];
          valueVectors: number[][];
          baseSimilarity: number;
        } => item !== null,
      )
      .sort((left, right) => right.baseSimilarity - left.baseSimilarity);

    const categoryBuckets = new Map<
      string,
      Array<{
        row: typeof rows[number];
        valueVectors: number[][];
        baseSimilarity: number;
      }>
    >();

    for (const item of scoredRows) {
      const bucket = categoryBuckets.get(item.row.category) ?? [];
      bucket.push(item);
      categoryBuckets.set(item.row.category, bucket);
    }

    const selectedCategories = Array.from(categoryBuckets.entries())
      .map(([category, items]) => ({
        category,
        items,
        bestSimilarity: items[0]?.baseSimilarity ?? Number.NEGATIVE_INFINITY,
      }))
      .sort((left, right) => right.bestSimilarity - left.bestSimilarity)
      .slice(0, 4);

    const results: ActiveParameter[] = selectedCategories.flatMap(({ items }) =>
      items.slice(0, 5).map((item) =>
        buildAnchoredParameter(item.row, item.valueVectors, item.baseSimilarity, queryVector),
      ),
    );

    const payload: ProposeParametersResponse = {
      query,
      total_vectorized: scoredRows.length,
      results: results.slice(0, typeof body.top_k === "number" ? body.top_k : 20),
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      continue;
    }

    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseValueVectors(value: Prisma.JsonValue | null): number[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Prisma.JsonArray => Array.isArray(item))
    .map((vector) =>
      vector.filter((entry): entry is number => typeof entry === "number"),
    )
    .filter((vector) => vector.length > 0);
}

function buildAnchoredParameter(
  row: {
    technicalName: string;
    category: string;
    subCategory: string;
    uiElement: string;
    minValue: number | null;
    maxValue: number | null;
    step: number | null;
    defaultValue: Prisma.JsonValue;
    unit: string | null;
    options: string | null;
    minLength: number | null;
    maxLength: number | null;
    lyriaPromptTags: Prisma.JsonValue;
    semanticKeywords: Prisma.JsonValue;
  },
  valueVectors: number[][],
  similarity: number,
  queryVector: number[],
): ActiveParameter {
  const raw = rowToRaw(row);
  const normalizedDefault = normalizeEditableValue(raw.default);
  const suggestedValue = selectSuggestedValue(raw, valueVectors, queryVector);

  return {
    technical_name: raw.technical_name,
    category: raw.category ?? row.category,
    sub_category: raw.sub_category ?? row.subCategory,
    ui_element: raw.ui_element,
    min_value: raw.min_value,
    max_value: raw.max_value,
    step: raw.step,
    default: normalizedDefault,
    suggested_value: suggestedValue,
    current_value: suggestedValue,
    unit: raw.unit,
    options: raw.options,
    min_length: raw.min_length,
    max_length: raw.max_length,
    lyria_prompt_tags: raw.lyria_prompt_tags,
    semantic_keywords: raw.semantic_keywords,
    similarity,
  };
}

function selectSuggestedValue(
  raw: ReturnType<typeof rowToRaw>,
  valueVectors: number[][],
  queryVector: number[],
): number | string {
  const normalizedDefault = normalizeEditableValue(raw.default);

  if (
    raw.ui_element !== "Range" ||
    typeof raw.min_value !== "number" ||
    typeof raw.max_value !== "number"
  ) {
    return normalizedDefault;
  }

  const anchorScores = [
    cosineSimilarity(queryVector, valueVectors[0] ?? []),
    cosineSimilarity(queryVector, valueVectors[1] ?? []),
    cosineSimilarity(queryVector, valueVectors[2] ?? []),
  ];

  let bestIndex = 1;
  let bestScore = anchorScores[1] ?? Number.NEGATIVE_INFINITY;

  for (let index = 0; index < anchorScores.length; index += 1) {
    const currentScore = anchorScores[index] ?? Number.NEGATIVE_INFINITY;
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestIndex = index;
    }
  }

  if (bestIndex === 0) {
    return raw.min_value;
  }

  if (bestIndex === 2) {
    return raw.max_value;
  }

  return normalizedDefault;
}

function normalizeEditableValue(value: number | string | number[]): number | string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value;
}
