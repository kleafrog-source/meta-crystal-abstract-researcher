import { promises as fs } from "node:fs";
import path from "node:path";

import { readGenesisLibrary, type GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { rankRuntimeAtoms } from "@/lib/combinatorial-genesis/runtime-index";
import { buildEffectiveQuery } from "@/lib/rag-v3/instruction-support";
import type { ActiveParameter, EnrichedParameter, InstructionContextEntry, ProposeParametersResponse, UiElement } from "@/lib/rag-v3/types";
import { embedText } from "@/lib/ollama-client";

import { rankCompositeNames } from "./composite-index";
import { runV3AnchoringBridge, type V3AnchorValue } from "./python-bridge";

export interface RagV3Sources {
  library?: boolean;
  frozen?: boolean;
  atoms?: boolean;
  generated?: boolean;
}

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
const STOPWORDS = new Set(["и", "в", "на", "с", "по", "для", "the", "a", "an", "of", "to", "in", "and", "with"]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function normalizeParameter(parameter: GenesisLibraryParameter, source: "library" | "frozen"): EnrichedParameter & { _v3_source: string } {
  const name = String(parameter.technical_name ?? "");
  const tokens = name.split("_");
  const ui = String(parameter.ui_element ?? "String") as UiElement;
  const rawDefault = parameter.default;
  return {
    technical_name: name,
    name_ru: typeof parameter.name_ru === "string" ? parameter.name_ru : undefined,
    description_en: typeof parameter.description_en === "string" ? parameter.description_en : undefined,
    description_ru: typeof parameter.description_ru === "string" ? parameter.description_ru : undefined,
    category: String(parameter.category ?? tokens.slice(0, 2).join("_")),
    sub_category: String(parameter.sub_category ?? tokens.slice(0, 4).join("_")),
    ui_element: ui,
    min_value: typeof parameter.min_value === "number" ? parameter.min_value : undefined,
    max_value: typeof parameter.max_value === "number" ? parameter.max_value : undefined,
    step: typeof parameter.step === "number" ? parameter.step : undefined,
    default: Array.isArray(rawDefault) ? rawDefault.map(String).join(", ") : (rawDefault ?? ""),
    unit: typeof parameter.unit === "string" ? parameter.unit : undefined,
    options: Array.isArray(parameter.options) ? parameter.options.map(String) : undefined,
    lyria_prompt_tags: Array.isArray(parameter.lyria_prompt_tags) ? parameter.lyria_prompt_tags.map(String) : [],
    semantic_keywords: Array.isArray(parameter.semantic_keywords) ? parameter.semantic_keywords.map(String) : [],
    domain: typeof parameter.domain === "string" ? parameter.domain : null,
    axes: Array.isArray(parameter.axes) ? parameter.axes.map(String) : [],
    quantity_kind: typeof parameter.quantity_kind === "string" ? parameter.quantity_kind : null,
    polarity_override: typeof parameter.polarity_override === "number" ? parameter.polarity_override : null,
    vibe_id: typeof parameter.vibe_id === "string" ? parameter.vibe_id : null,
    select_typing: parameter.select_typing === "nominal" || parameter.select_typing === "ordinal" ? parameter.select_typing : null,
    option_positions: Array.isArray(parameter.option_positions)
      ? parameter.option_positions.filter((item): item is { value: string; position: number } => Boolean(item) && typeof item === "object" && typeof (item as { value?: unknown }).value === "string" && typeof (item as { position?: unknown }).position === "number")
      : null,
    option_aliases: parameter.option_aliases && typeof parameter.option_aliases === "object"
      ? Object.fromEntries(Object.entries(parameter.option_aliases).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string")))
      : null,
    _v3_source: source,
  };
}

async function readFrozen(): Promise<GenesisLibraryParameter[]> {
  const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8")) as { version_id: string };
  return JSON.parse(
    await fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "parameters.json"), "utf8"),
  ) as GenesisLibraryParameter[];
}

function retrievalText(parameter: EnrichedParameter): string {
  return [
    parameter.technical_name,
    parameter.technical_name.replaceAll("_", " "),
    parameter.name_ru ?? "",
    parameter.description_en ?? "",
    parameter.description_ru ?? "",
    parameter.category,
    parameter.sub_category,
    parameter.domain ?? "",
    parameter.quantity_kind ?? "",
    parameter.unit ?? "",
    ...(parameter.options ?? []),
    ...parameter.semantic_keywords,
    ...parameter.lyria_prompt_tags,
  ].filter(Boolean).join(" | ");
}

function lexicalScore(query: string, parameter: EnrichedParameter): number {
  const text = retrievalText(parameter).toLowerCase();
  const parameterTokens = new Set(tokenize(text));
  return tokenize(query).reduce((score, token) => score + (parameter.technical_name.includes(token) ? 5 : 0) + (parameterTokens.has(token) ? 3 : 0) + (text.includes(token) ? 1 : 0), 0);
}

function toActive(parameter: EnrichedParameter & { _v3_source: string }, similarity: number, currentValues: Record<string, number | string>, anchored?: V3AnchorValue): ActiveParameter {
  const fallback = currentValues[parameter.technical_name] ?? (Array.isArray(parameter.default) ? parameter.default.join(", ") : parameter.default);
  const value = anchored?.value ?? fallback;
  return {
    ...parameter,
    default: Array.isArray(parameter.default) ? parameter.default.join(", ") : parameter.default,
    suggested_value: value,
    current_value: value,
    before: anchored?.before ?? fallback,
    source: anchored?.source ?? "default",
    detail: `V3 source ${parameter._v3_source} · ${anchored?.detail ?? "autonomous default anchoring"}`,
    similarity,
  };
}

export async function searchV3(params: {
  query: string;
  topK: number;
  currentValues: Record<string, number | string>;
  instructionContext: InstructionContextEntry[];
  sources: RagV3Sources;
}): Promise<ProposeParametersResponse> {
  const query = params.query.trim();
  if (!query) return { query: "", effective_query: "", results: [], total_candidates: 0, total_scoped: 0, retrieval_cache_size: 0 };
  const enabled = { library: true, frozen: true, atoms: true, generated: true, ...params.sources };
  const [library, frozen] = await Promise.all([
    enabled.library || enabled.generated ? readGenesisLibrary() : Promise.resolve([]),
    enabled.frozen ? readFrozen() : Promise.resolve([]),
  ]);
  const records = new Map<string, EnrichedParameter & { _v3_source: string }>();
  if (enabled.library || enabled.generated) {
    for (const item of library) {
      const generated = item.domain === "experimental_combinatorial_genesis";
      if ((generated && enabled.generated) || (!generated && enabled.library)) records.set(item.technical_name, normalizeParameter(item, "library"));
    }
  }
  for (const item of frozen) if (!records.has(item.technical_name)) records.set(item.technical_name, normalizeParameter(item, "frozen"));

  const baseQuery = buildEffectiveQuery(query, params.instructionContext);
  const atomQueryVector = await embedText(baseQuery);
  const atomRanking = enabled.atoms ? await rankRuntimeAtoms(atomQueryVector, 20) : null;
  const atomExpansion = atomRanking?.atoms.filter((atom) => atom.role !== "unit").slice(0, 12).map((atom) => atom.atom).join(" ") ?? "";
  const effectiveQuery = atomExpansion ? `${baseQuery}\nCombinatorial atoms: ${atomExpansion}` : baseQuery;
  const queryVector = atomExpansion ? await embedText(effectiveQuery) : atomQueryVector;
  const topK = Math.max(1, Math.min(200, Math.round(params.topK)));
  const candidates = Array.from(records.values())
    .map((parameter) => ({ parameter, lexical: lexicalScore(effectiveQuery, parameter) }))
    .sort((left, right) => right.lexical - left.lexical || left.parameter.technical_name.localeCompare(right.parameter.technical_name))
    .slice(0, Math.min(records.size, Math.max(256, topK * 4)));
  const candidateMap = new Map(candidates.map(({ parameter, lexical }) => [parameter.technical_name, { parameter, lexical }]));
  const semanticRanked = await rankCompositeNames(
    queryVector,
    [...candidateMap.keys()],
    candidateMap.size,
  );
  const ranked = semanticRanked
    .map((item) => ({
      ...item,
      combined:
        item.similarity
        + Math.min(20, candidateMap.get(item.name)?.lexical ?? 0) * 0.02
        + ((candidateMap.get(item.name)?.parameter.options ?? []).some((option) => {
          const normalizedOption = String(option).toLowerCase().replaceAll("_", " ").trim();
          return normalizedOption.length >= 3 && effectiveQuery.toLowerCase().includes(normalizedOption);
        }) ? 0.5 : 0),
    }))
    .sort((left, right) => right.combined - left.combined || right.similarity - left.similarity || left.name.localeCompare(right.name))
    .slice(0, topK);
  const anchored = await runV3AnchoringBridge({
    query: effectiveQuery,
    scoped_params: ranked.map(({ name }) => candidateMap.get(name)!.parameter as unknown as Record<string, unknown>),
    current_values: params.currentValues,
  });
  const results = ranked.map(({ name, similarity }) => toActive(candidateMap.get(name)!.parameter, similarity, params.currentValues, anchored[name]));
  return { query, effective_query: effectiveQuery, results, total_candidates: records.size, total_scoped: results.length, retrieval_cache_size: 5043 };
}

