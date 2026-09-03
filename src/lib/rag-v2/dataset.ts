import { promises as fs } from "node:fs";

import {
  RAG_V2_ANCHORS_PATH,
  RAG_V2_DATASET_PATH,
  RAG_V2_RETRIEVAL_INDEX_PATH,
} from "./paths";
import type { ActiveParameter, EnrichedParameter, UiElement } from "./types";

let datasetCache: EnrichedParameter[] | null = null;
let anchorsCache: { stub?: boolean; generated_at?: string } | null = null;
let retrievalIndexMetaCache: {
  model?: string;
  generated_at?: string;
  count?: number;
} | null = null;

function parseUiElement(value: string): UiElement {
  const supported: UiElement[] = [
    "Range",
    "Select",
    "Toggle",
    "Text",
    "Array",
    "String",
  ];
  return supported.includes(value as UiElement) ? (value as UiElement) : "String";
}

function deriveCategory(technicalName: string): {
  category: string;
  subCategory: string;
} {
  const tokens = technicalName.split("_").filter(Boolean);
  return {
    category: tokens.slice(0, 2).join("_") || technicalName,
    subCategory: tokens.slice(0, 4).join("_") || technicalName,
  };
}

function normalizeEditableValue(value: number | string | number[]): number | string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value;
}

export async function getAnchorsMeta(): Promise<{
  stub: boolean;
  generatedAt: string | null;
}> {
  if (!anchorsCache) {
    const raw = await fs.readFile(RAG_V2_ANCHORS_PATH, "utf8");
    anchorsCache = JSON.parse(raw) as { stub?: boolean; generated_at?: string };
  }

  return {
    stub: Boolean(anchorsCache.stub),
    generatedAt: anchorsCache.generated_at ?? null,
  };
}

export async function getRetrievalIndexMeta(): Promise<{
  ready: boolean;
  count: number;
  generatedAt: string | null;
  model: string | null;
}> {
  if (!retrievalIndexMetaCache) {
    try {
      const raw = await fs.readFile(RAG_V2_RETRIEVAL_INDEX_PATH, "utf8");
      retrievalIndexMetaCache = JSON.parse(raw) as {
        model?: string;
        generated_at?: string;
        count?: number;
      };
    } catch {
      return {
        ready: false,
        count: 0,
        generatedAt: null,
        model: null,
      };
    }
  }

  return {
    ready: true,
    count: Number(retrievalIndexMetaCache.count ?? 0),
    generatedAt: retrievalIndexMetaCache.generated_at ?? null,
    model: retrievalIndexMetaCache.model ?? null,
  };
}

export async function getEnrichedDataset(): Promise<EnrichedParameter[]> {
  if (datasetCache) {
    return datasetCache;
  }

  const raw = await fs.readFile(RAG_V2_DATASET_PATH, "utf8");
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  datasetCache = parsed.map((item) => {
    const derived = deriveCategory(String(item.technical_name ?? ""));
    return {
      technical_name: String(item.technical_name ?? ""),
      category: String(item.category ?? derived.category),
      sub_category: String(item.sub_category ?? derived.subCategory),
      ui_element: parseUiElement(String(item.ui_element ?? "String")),
      min_value: typeof item.min_value === "number" ? item.min_value : undefined,
      max_value: typeof item.max_value === "number" ? item.max_value : undefined,
      step: typeof item.step === "number" ? item.step : undefined,
      default: item.default as number | string | number[],
      unit: typeof item.unit === "string" ? item.unit : undefined,
      options: Array.isArray(item.options)
        ? item.options.filter((entry): entry is string => typeof entry === "string")
        : undefined,
      min_length: typeof item.min_length === "number" ? item.min_length : undefined,
      max_length: typeof item.max_length === "number" ? item.max_length : undefined,
      lyria_prompt_tags: Array.isArray(item.lyria_prompt_tags)
        ? item.lyria_prompt_tags.filter((entry): entry is string => typeof entry === "string")
        : [],
      semantic_keywords: Array.isArray(item.semantic_keywords)
        ? item.semantic_keywords.filter((entry): entry is string => typeof entry === "string")
        : [],
      domain: typeof item.domain === "string" ? item.domain : null,
      axes: Array.isArray(item.axes)
        ? item.axes.filter((entry): entry is string => typeof entry === "string")
        : [],
      quantity_kind:
        typeof item.quantity_kind === "string" ? item.quantity_kind : null,
      polarity_override:
        typeof item.polarity_override === "number" ? item.polarity_override : null,
      vibe_id: typeof item.vibe_id === "string" ? item.vibe_id : null,
      select_typing:
        item.select_typing === "nominal" || item.select_typing === "ordinal"
          ? item.select_typing
          : null,
      option_positions: Array.isArray(item.option_positions)
        ? item.option_positions
            .map((entry) => {
              if (
                entry &&
                typeof entry === "object" &&
                typeof entry.value === "string" &&
                typeof entry.position === "number"
              ) {
                return { value: entry.value, position: entry.position };
              }
              return null;
            })
            .filter(
              (entry): entry is { value: string; position: number } => entry !== null,
            )
        : null,
      option_aliases:
        item.option_aliases && typeof item.option_aliases === "object"
          ? Object.fromEntries(
              Object.entries(item.option_aliases).map(([key, value]) => [
                key,
                Array.isArray(value)
                  ? value.filter((entry): entry is string => typeof entry === "string")
                  : [],
              ]),
            )
          : null,
    };
  });

  return datasetCache;
}

export function toActiveParameter(
  param: EnrichedParameter,
  similarity: number,
  anchored?: {
    value: number | string;
    before: number | string;
    source: "numeric" | "lexical" | "axis" | "default" | "neutral";
    detail: string;
  },
): ActiveParameter {
  const normalizedDefault = normalizeEditableValue(param.default);
  const suggested = anchored ? anchored.value : normalizedDefault;
  const before = anchored ? anchored.before : normalizedDefault;

  return {
    technical_name: param.technical_name,
    category: param.category,
    sub_category: param.sub_category,
    ui_element: param.ui_element,
    min_value: param.min_value,
    max_value: param.max_value,
    step: param.step,
    default: normalizedDefault,
    suggested_value: suggested,
    current_value: suggested,
    before,
    source: anchored?.source ?? "default",
    detail: anchored?.detail ?? "retrieval only",
    unit: param.unit,
    options: param.options,
    min_length: param.min_length,
    max_length: param.max_length,
    lyria_prompt_tags: param.lyria_prompt_tags,
    semantic_keywords: param.semantic_keywords,
    similarity,
    domain: param.domain,
    quantity_kind: param.quantity_kind,
    axes: param.axes,
  };
}

export function buildRetrievalText(param: EnrichedParameter): string {
  return [
    param.technical_name,
    param.category,
    param.sub_category,
    param.domain ?? "",
    param.quantity_kind ?? "",
    ...param.semantic_keywords,
    ...param.lyria_prompt_tags,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function invalidateAnchorsMeta(): void {
  anchorsCache = null;
}

export function invalidateRetrievalIndexMeta(): void {
  retrievalIndexMetaCache = null;
}
