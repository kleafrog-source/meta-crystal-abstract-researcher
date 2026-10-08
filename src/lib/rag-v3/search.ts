import { promises as fs } from "node:fs";
import path from "node:path";

import { readGenesisLibrary, type GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { readExcludedRegistry } from "@/lib/combinatorial-genesis/registry";
import { rankRuntimeAtoms } from "@/lib/combinatorial-genesis/runtime-index";
import { buildEffectiveQuery } from "@/lib/rag-v3/instruction-support";
import type { ActiveParameter, EnrichedParameter, InstructionContextEntry, ProposeParametersResponse, RetrievalScope, UiElement } from "@/lib/rag-v3/types";
import { embedText, embedTexts } from "@/lib/ollama-client";

import { rankCompositeNamesMulti } from "./composite-index";
import { buildRelationAlignment, ensureConceptCoverage } from "./alignment";
import { RAG_V3_CONFIG } from "./config";
import { runV3AnchoringBridge, type V3AnchorValue } from "./python-bridge";
import { decomposeQuery } from "./query-concepts";
import { matchRelations } from "./relation-index";
import { rankSelectOptionNames } from "./value-index";

export interface RagV3Sources {
  library?: boolean;
  frozen?: boolean;
  atoms?: boolean;
  generated?: boolean;
}

export type RagV3Scopes = Record<RetrievalScope, boolean>;

const DEFAULT_SCOPES: RagV3Scopes = { sound: true, structure: true, metadata: false, provenance: false, administrative: false };

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
const STOPWORDS = new Set(["и", "в", "на", "с", "по", "для", "the", "a", "an", "of", "to", "in", "and", "with"]);

function classifyRetrievalScope(parameter: GenesisLibraryParameter): RetrievalScope {
  const existing = String((parameter as GenesisLibraryParameter & { retrieval_scope?: unknown }).retrieval_scope ?? "").toLowerCase();
  if (["sound", "structure", "metadata", "provenance", "administrative"].includes(existing)) return existing as RetrievalScope;
  const name = String(parameter.technical_name ?? "").toLowerCase();
  const text = [name.replaceAll("_", " "), parameter.category, parameter.sub_category, parameter.description_en].filter(Boolean).join(" ").toLowerCase();
  if (name.startsWith("provenance_") || name.includes("ownership_proof") || name.includes("_hash")) return "provenance";
  if (["smart_contract", "gas_limit", "licensing", "contract_address"].some((term) => name.includes(term))) return "administrative";
  if (["interoperable_asset_", "descriptive_metadata_", "classification_", "semantic_concept_"].some((term) => name.startsWith(term))) return "metadata";
  const structureTerms = ["arrangement", "timeline", "song section", "section transition", "composition structure", "sequencer", "sequence length", "step pattern", "pattern length", "arpeggiator", "tempo", "rhythmic pattern", "rhythm grid", "meter", "time signature"];
  return structureTerms.some((term) => text.includes(term)) ? "structure" : "sound";
}

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
    retrieval_scope: classifyRetrievalScope(parameter),
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
  const queryTokens = tokenize(query);
  let score = queryTokens.reduce((total, token) => total + (parameter.technical_name.includes(token) ? 5 : 0) + (parameterTokens.has(token) ? 3 : 0) + (text.includes(token) ? 1 : 0), 0);
  for (const size of [2, 3]) {
    for (let index = 0; index <= queryTokens.length - size; index += 1) {
      if (text.includes(queryTokens.slice(index, index + size).join(" "))) score += size * 4;
    }
  }
  return score;
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
  scopes?: Partial<RagV3Scopes>;
}): Promise<ProposeParametersResponse> {
  const query = params.query.trim();
  if (!query) return { query: "", effective_query: "", results: [], total_candidates: 0, total_scoped: 0, retrieval_cache_size: 0 };
  const enabled = { library: true, frozen: true, atoms: true, generated: true, ...params.sources };
  const scopes = { ...DEFAULT_SCOPES, ...params.scopes };
  const [library, frozen, excludedRegistry] = await Promise.all([
    enabled.library || enabled.generated ? readGenesisLibrary() : Promise.resolve([]),
    enabled.frozen ? readFrozen() : Promise.resolve([]),
    readExcludedRegistry(),
  ]);
  const excludedNames = new Set(excludedRegistry.entries.map((entry) => entry.technical_name));
  const records = new Map<string, EnrichedParameter & { _v3_source: string }>();
  if (enabled.library || enabled.generated) {
    for (const item of library) {
      const generated = item.domain === "experimental_combinatorial_genesis";
      if ((generated && enabled.generated) || (!generated && enabled.library)) records.set(item.technical_name, normalizeParameter(item, "library"));
    }
  }
  for (const item of frozen) if (!records.has(item.technical_name)) records.set(item.technical_name, normalizeParameter(item, "frozen"));
  for (const [name, parameter] of records) if (!scopes[parameter.retrieval_scope]) records.delete(name);

  const baseQuery = buildEffectiveQuery(query, params.instructionContext);
  const atomQueryVector = await embedText(baseQuery);
  const atomRanking = enabled.atoms ? await rankRuntimeAtoms(atomQueryVector, 20) : null;
  const atomExpansion = atomRanking?.atoms.filter((atom) => atom.role !== "unit").slice(0, 12).map((atom) => atom.atom).join(" ") ?? "";
  const effectiveQuery = baseQuery;
  const concepts = decomposeQuery(baseQuery, Array.from(records.values(), retrievalText));
  const extraConceptVectors = concepts.length > 1 ? await embedTexts(concepts.slice(1).map((concept) => concept.text)) : [];
  const conceptVectors = concepts.map((concept, index) => ({
    ...concept,
    vector: index === 0 ? atomQueryVector : extraConceptVectors[index - 1],
  }));
  const atomExpansionVector = atomExpansion ? await embedText(`Combinatorial atoms: ${atomExpansion}`) : null;
  const retrievalVectors = [
    ...conceptVectors.map((concept) => ({ vector: concept.vector, weight: concept.weight })),
    ...(atomExpansionVector ? [{ vector: atomExpansionVector, weight: 0.65 }] : []),
  ];
  const activeRelations = await matchRelations(baseQuery, conceptVectors.map((concept) => concept.vector));
  const relationAlignment = buildRelationAlignment(activeRelations, new Set(records.keys()));
  const queryVector = atomQueryVector;
  const topK = Math.max(1, Math.min(200, Math.round(params.topK)));
  const lexicalCandidates = Array.from(records.values())
    .map((parameter) => ({ parameter, lexical: lexicalScore(effectiveQuery, parameter) }))
    .sort((left, right) => right.lexical - left.lexical || left.parameter.technical_name.localeCompare(right.parameter.technical_name))
    .slice(0, Math.min(records.size, Math.max(256, topK * 4)));
  const optionMatchesQuery = (option: string | number | null) => {
    if (option === null) return false;
    const normalizedOption = String(option).toLowerCase().replaceAll("_", " ").trim();
    if (!normalizedOption) return false;
    const normalizedQuery = effectiveQuery.toLowerCase();
    if (normalizedOption.length >= 3) return normalizedQuery.includes(normalizedOption);
    return /\b(?:mode|option|режим|вариант)\b/u.test(normalizedQuery)
      && new RegExp(`(?<![\\p{L}\\p{N}_/.:])${normalizedOption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_/.:])`, "u").test(normalizedQuery);
  };
  const hasOptionCommand = /\b(?:mode|option|режим|вариант)\b/u.test(baseQuery.toLowerCase());
  const selectMatches = hasOptionCommand
    ? (await rankSelectOptionNames(queryVector, new Set(records.keys()), Math.max(32, topK * 2)))
      .filter((match) => optionMatchesQuery(match.option))
    : [];
  const selectByName = new Map(selectMatches.map((match) => [match.name, match]));
  const optionOnlyQuery = hasOptionCommand && tokenize(baseQuery).filter((token) => !new Set([
    "use", "set", "mode", "option", "sound", "this", "режим", "вариант", "звук", "используй", "установи",
  ]).has(token)).length <= 2;
  const candidateMap = new Map(lexicalCandidates.map(({ parameter, lexical }) => [parameter.technical_name, { parameter, lexical }]));
  for (const parameter of records.values()) {
    if (hasOptionCommand && parameter.ui_element === "Select" && (parameter.options ?? []).some(optionMatchesQuery)) {
      candidateMap.set(parameter.technical_name, { parameter, lexical: lexicalScore(effectiveQuery, parameter) });
    }
  }
  for (const match of selectMatches) {
    const parameter = records.get(match.name);
    if (parameter && !candidateMap.has(match.name)) candidateMap.set(match.name, { parameter, lexical: lexicalScore(effectiveQuery, parameter) });
  }
  for (const name of relationAlignment.names) {
    const parameter = records.get(name);
    if (parameter && !candidateMap.has(name)) candidateMap.set(name, { parameter, lexical: lexicalScore(effectiveQuery, parameter) });
  }
  const semanticRanked = await rankCompositeNamesMulti(
    retrievalVectors,
    [...candidateMap.keys()],
    candidateMap.size,
  );
  const rankedPool = semanticRanked
    .map((item) => {
      const parameter = candidateMap.get(item.name)?.parameter;
      const exactOption = hasOptionCommand
        && (parameter?.options ?? []).some(optionMatchesQuery);
      const exactTechnicalName = effectiveQuery.toLowerCase().includes(item.name.toLowerCase());
      return {
        ...item,
        exactOption,
        exactTechnicalName,
        combined:
          item.similarity
          + Math.min(60, candidateMap.get(item.name)?.lexical ?? 0) * 0.02
          + Math.max(0, selectByName.get(item.name)?.similarity ?? 0) * 0.25
          + (relationAlignment.biasByName.get(item.name) ?? 0)
          + (exactOption ? 0.75 : 0)
          + (exactTechnicalName ? 4 : 0),
      };
    })
    .sort((left, right) => {
      if (left.exactTechnicalName !== right.exactTechnicalName) return left.exactTechnicalName ? -1 : 1;
      if (optionOnlyQuery && left.exactOption !== right.exactOption) return left.exactOption ? -1 : 1;
      if (optionOnlyQuery && left.exactOption && right.exactOption) return left.name.localeCompare(right.name);
      return right.combined - left.combined || right.similarity - left.similarity || left.name.localeCompare(right.name);
    });
  const conceptIndexes = concepts.length > 1
    ? concepts.slice(1).map((_concept, index) => index + 1)
    : [0];
  const ranked = optionOnlyQuery
    ? rankedPool.slice(0, topK)
    : ensureConceptCoverage(rankedPool, topK, conceptIndexes, relationAlignment.coverageGroups);
  const anchorBudget = Math.max(1, Math.ceil(ranked.length * RAG_V3_CONFIG.anchorChangeFraction));
  const anchored = await runV3AnchoringBridge({
    query: effectiveQuery,
    concepts: conceptVectors.map((concept) => concept.text),
    query_embeddings: conceptVectors.map((concept) => concept.vector),
    relation_hints: relationAlignment.hints,
    scoped_params: ranked.map(({ name, similarity }, index) => ({
      ...(candidateMap.get(name)!.parameter as unknown as Record<string, unknown>),
      _retrieval_rank: index + 1,
      _retrieval_similarity: similarity,
      _anchor_eligible: index < anchorBudget,
    })),
    current_values: params.currentValues,
  });
  const results = ranked.map(({ name, similarity }) => ({
    ...toActive(candidateMap.get(name)!.parameter, similarity, params.currentValues, anchored[name]),
    excluded: excludedNames.has(name),
  }));
  return { query, effective_query: effectiveQuery, results, total_candidates: records.size, total_scoped: results.length, retrieval_cache_size: 5043 };
}

