import { promises as fs } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { ActiveParameter, RawParameter, UiElement } from "@/lib/rag-types";

const LOCAL_DATASET_PATH = path.join(
  process.cwd(),
  "public",
  "parameters-dataset.json",
);

let inMemoryDataset: RawParameter[] | null = null;

function parseUiElement(value: string): UiElement {
  const supported: UiElement[] = [
    "Range",
    "Select",
    "Toggle",
    "Text",
    "Array",
    "String",
  ];

  if (supported.includes(value as UiElement)) {
    return value as UiElement;
  }

  return "String";
}

function toStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function deriveCategory(technicalName: string): {
  category: string;
  subCategory: string;
} {
  const tokens = technicalName
    .split("_")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return {
      category: technicalName,
      subCategory: technicalName,
    };
  }

  return {
    category: tokens.slice(0, Math.min(2, tokens.length)).join("_"),
    subCategory: tokens.slice(0, Math.min(4, tokens.length)).join("_"),
  };
}

export async function fetchRawDataset(): Promise<RawParameter[]> {
  if (inMemoryDataset) {
    return inMemoryDataset;
  }

  const rawFile = await fs.readFile(LOCAL_DATASET_PATH, "utf8");
  const parsed = JSON.parse(rawFile) as unknown;

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `Dataset at ${LOCAL_DATASET_PATH} is empty or malformed.`,
    );
  }

  inMemoryDataset = parsed as RawParameter[];
  return inMemoryDataset;
}

export async function ensureDatasetLoaded(): Promise<number> {
  const dataset = await fetchRawDataset();
  const chunkSize = 200;
  const existingCount = await db.parameter.count();

  if (existingCount === dataset.length) {
    return existingCount;
  }

  const toRowData = (parameter: RawParameter) => ({
    technicalName: parameter.technical_name,
    ...deriveCategory(parameter.technical_name),
    uiElement: parameter.ui_element,
    minValue: parameter.min_value ?? null,
    maxValue: parameter.max_value ?? null,
    step: parameter.step ?? null,
    defaultValue: parameter.default as Prisma.InputJsonValue,
    unit: parameter.unit ?? null,
    options: parameter.options ? JSON.stringify(parameter.options) : null,
    minLength: parameter.min_length ?? null,
    maxLength: parameter.max_length ?? null,
    lyriaPromptTags: parameter.lyria_prompt_tags as Prisma.InputJsonValue,
    semanticKeywords: parameter.semantic_keywords as Prisma.InputJsonValue,
  });

  if (existingCount === 0) {
    for (let index = 0; index < dataset.length; index += chunkSize) {
      const slice = dataset.slice(index, index + chunkSize);
      await db.parameter.createMany({
        data: slice.map((parameter) => ({
          ...toRowData(parameter),
          isVectorized: false,
          valueVectors: null,
        })),
      });
    }

    return dataset.length;
  }

  for (let index = 0; index < dataset.length; index += chunkSize) {
    const slice = dataset.slice(index, index + chunkSize);
    for (const parameter of slice) {
      await db.parameter.upsert({
        where: {
          technicalName: parameter.technical_name,
        },
        create: {
          ...toRowData(parameter),
          isVectorized: false,
          valueVectors: null,
        },
        update: toRowData(parameter),
      });
    }
  }

  return dataset.length;
}

export function rowToRaw(row: {
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
}): RawParameter {
  return {
    technical_name: row.technicalName,
    category: row.category,
    sub_category: row.subCategory,
    ui_element: parseUiElement(row.uiElement),
    min_value: row.minValue ?? undefined,
    max_value: row.maxValue ?? undefined,
    step: row.step ?? undefined,
    default: row.defaultValue as number | string | number[],
    unit: row.unit ?? undefined,
    options: row.options
      ? (JSON.parse(row.options) as string[])
      : undefined,
    min_length: row.minLength ?? undefined,
    max_length: row.maxLength ?? undefined,
    lyria_prompt_tags: toStringArray(row.lyriaPromptTags),
    semantic_keywords: toStringArray(row.semanticKeywords),
  };
}

function normalizeEditableValue(value: number | string | number[]): number | string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value;
}

export function rawToActiveParameter(
  raw: RawParameter,
  similarity: number,
): ActiveParameter {
  const normalizedDefault = normalizeEditableValue(raw.default);

  return {
    technical_name: raw.technical_name,
    category: raw.category ?? "uncategorized",
    sub_category: raw.sub_category ?? (raw.category ?? "uncategorized"),
    ui_element: raw.ui_element,
    min_value: raw.min_value,
    max_value: raw.max_value,
    step: raw.step,
    default: normalizedDefault,
    suggested_value: normalizedDefault,
    current_value: normalizedDefault,
    unit: raw.unit,
    options: raw.options,
    min_length: raw.min_length,
    max_length: raw.max_length,
    lyria_prompt_tags: raw.lyria_prompt_tags,
    semantic_keywords: raw.semantic_keywords,
    similarity,
  };
}

export function buildEmbeddingText(raw: RawParameter): string {
  return [raw.technical_name, ...raw.semantic_keywords].join(" | ");
}
