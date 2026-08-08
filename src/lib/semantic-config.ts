import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { cosineSimilarity } from "@/lib/llm/types";
import { getActiveProvider } from "@/lib/llm/factory";
import {
  DEFAULT_PROFILE,
  METRIC_KEYS,
  normalizeEditableProfile,
  type EditableProfile,
} from "@/lib/profile-presets";

export type LexiconEntityType =
  | "generation_parameter"
  | "domain"
  | "structural_pattern"
  | "metric"
  | "operator"
  | "formula"
  | "constant"
  | "lexical_category";

type LexiconEntry = {
  id: string;
  entity_type: LexiconEntityType;
  namespace: string;
  technical?: Record<string, unknown>;
  semantic?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  safety?: Record<string, unknown>;
};

type RetrievalEmbeddingCache = {
  model: string;
  builtAt: string;
  items: Record<
    string,
    {
      textHash: string;
      embedding: number[];
    }
  >;
};

export type SemanticMatchedEntry = {
  id: string;
  entityType: LexiconEntityType;
  displayName: string;
  technicalName: string;
  description: string | null;
  confidence: number;
  score: number;
  matchedPhrase: string | null;
  reason: string;
  selectedValue: string | number | boolean | null;
};

export type ProposedParameterValue = {
  value: string | number | boolean;
  source: "query_explicit" | "semantic_retrieval" | "default" | "current_profile";
  confidence: number | "default";
  reason: string;
};

export type ConfigDiffEntry = {
  scope: "params" | "flags" | "patterns";
  key: string;
  before: unknown;
  after: unknown;
  source: "query_explicit" | "semantic_retrieval";
  reason: string;
};

export type ValidationWarning = {
  level: "warning" | "error";
  code: string;
  message: string;
  field?: string;
};

export type SemanticConfigProposal = {
  query: string;
  retrievalMode: "dense";
  profile: EditableProfile;
  proposal: {
    generation: Record<string, ProposedParameterValue>;
    domains: SemanticMatchedEntry[];
    patterns: SemanticMatchedEntry[];
    operators: SemanticMatchedEntry[];
    formulas: SemanticMatchedEntry[];
    metrics: SemanticMatchedEntry[];
    lexicalCategories: SemanticMatchedEntry[];
    constants: SemanticMatchedEntry[];
  };
  matchedEntries: SemanticMatchedEntry[];
  defaultedParameters: string[];
  inferredParameters: string[];
  warnings: ValidationWarning[];
  hardErrors: ValidationWarning[];
  configurationDiff: ConfigDiffEntry[];
};

const PROJECT_ROOT = process.cwd();
const VALIDATED_DIR = path.join(PROJECT_ROOT, "data", "meta_lexicon", "validated");
const CACHE_DIR = path.join(PROJECT_ROOT, "data", "meta_lexicon", "cache");

const VALIDATED_FILES: Array<{ file: string; entityType: LexiconEntityType }> = [
  { file: "generation_parameters.json", entityType: "generation_parameter" },
  { file: "domains.json", entityType: "domain" },
  { file: "structural_patterns.json", entityType: "structural_pattern" },
  { file: "metrics.json", entityType: "metric" },
  { file: "operators.json", entityType: "operator" },
  { file: "formulas.json", entityType: "formula" },
  { file: "constants.json", entityType: "constant" },
  { file: "lexical_categorys.json", entityType: "lexical_category" },
];

const inMemoryEntryCache = new Map<string, LexiconEntry[]>();
const inMemoryEmbeddingCache = new Map<string, RetrievalEmbeddingCache>();

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "using",
  "into",
  "from",
  "that",
  "this",
  "generate",
  "create",
  "need",
  "want",
  "use",
  "без",
  "для",
  "или",
  "как",
  "что",
  "где",
  "это",
  "через",
  "надо",
  "нужно",
  "чтобы",
  "query",
  "mode",
  "complex",
]);

export async function proposeSemanticConfiguration(input: {
  query: string;
  profile?: Partial<EditableProfile> | Record<string, unknown> | null;
  entityTypes?: LexiconEntityType[];
  topK?: number;
}): Promise<SemanticConfigProposal> {
  const query = input.query.trim();
  if (!query) {
    throw new Error("query is required");
  }

  const profile = normalizeEditableProfile(input.profile ?? DEFAULT_PROFILE);
  const entries = loadValidatedLexiconEntries(input.entityTypes);
  const matches = await retrieveLexiconEntries(query, entries, input.topK ?? 48);
  const explicit = extractExplicitParameters(query);

  const proposal = compileProposal(profile, query, matches, explicit);
  return proposal;
}

function loadValidatedLexiconEntries(entityTypes?: LexiconEntityType[]): LexiconEntry[] {
  const cacheKey = (entityTypes ?? []).sort().join("|") || "all";
  const cached = inMemoryEntryCache.get(cacheKey);
  if (cached) return cached;

  const allowed = entityTypes ? new Set(entityTypes) : null;
  const entries: LexiconEntry[] = [];

  for (const file of VALIDATED_FILES) {
    if (allowed && !allowed.has(file.entityType)) continue;
    const filePath = path.join(VALIDATED_DIR, file.file);
    if (!existsSync(filePath)) continue;
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as LexiconEntry[];
    for (const entry of parsed) {
      entries.push(entry);
    }
  }

  inMemoryEntryCache.set(cacheKey, entries);
  return entries;
}

async function retrieveLexiconEntries(query: string, entries: LexiconEntry[], topK: number) {
  const { provider, settings } = await getActiveProvider();
  const model = settings.embedModel;
  const queryEmbedding = await provider.embed(query, model);
  const embeddingCache = await ensureLexiconEmbeddings(entries, model);

  const scored = entries
    .map((entry) => {
      const cached = embeddingCache.items[entry.id];
      if (!cached?.embedding?.length) return null;
      const score = cosineSimilarity(queryEmbedding, cached.embedding);
      return {
        entry,
        score,
        confidence: scoreToConfidence(score),
        matchedPhrase: buildMatchedPhrase(query, buildEntryText(entry)),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score);

  const selected: typeof scored = [];
  const perTypeCount = new Map<LexiconEntityType, number>();
  const perTypeLimit: Partial<Record<LexiconEntityType, number>> = {
    generation_parameter: 8,
    domain: 12,
    structural_pattern: 10,
    metric: 8,
    operator: 10,
    formula: 8,
    constant: 4,
    lexical_category: 8,
  };

  for (const item of scored) {
    const current = perTypeCount.get(item.entry.entity_type) ?? 0;
    const limit = perTypeLimit[item.entry.entity_type] ?? 6;
    if (current >= limit) continue;
    if (item.confidence < 0.33 && current > 0) continue;
    selected.push(item);
    perTypeCount.set(item.entry.entity_type, current + 1);
    if (selected.length >= topK) break;
  }

  return selected.map((item) => toMatchedEntry(item.entry, item.score, item.confidence, item.matchedPhrase));
}

async function ensureLexiconEmbeddings(entries: LexiconEntry[], model: string): Promise<RetrievalEmbeddingCache> {
  const inMemory = inMemoryEmbeddingCache.get(model);
  if (inMemory && entries.every((entry) => Boolean(inMemory.items[entry.id]))) {
    return inMemory;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `lexicon-embeddings-${sanitizeFileName(model)}.json`);
  let cache: RetrievalEmbeddingCache = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, "utf-8")) as RetrievalEmbeddingCache
    : { model, builtAt: new Date().toISOString(), items: {} };

  const missing = entries.filter((entry) => {
    const textHash = hashText(buildEntryText(entry));
    return cache.items[entry.id]?.textHash !== textHash;
  });

  if (missing.length > 0) {
    const { provider } = await getActiveProvider();
    const concurrency = 3;
    let index = 0;

    const workers = new Array(concurrency).fill(null).map(async () => {
      while (index < missing.length) {
        const current = missing[index++];
        const text = buildEntryText(current);
        const embedding = await provider.embed(text, model);
        cache.items[current.id] = {
          textHash: hashText(text),
          embedding,
        };
      }
    });

    await Promise.all(workers);
    cache = { ...cache, model, builtAt: new Date().toISOString() };
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
  }

  inMemoryEmbeddingCache.set(model, cache);
  return cache;
}

function compileProposal(
  baseProfile: EditableProfile,
  query: string,
  matches: SemanticMatchedEntry[],
  explicit: ExplicitExtraction,
): SemanticConfigProposal {
  const profile = normalizeEditableProfile(baseProfile);
  const nextProfile = normalizeEditableProfile(baseProfile);
  const generation: Record<string, ProposedParameterValue> = {};
  const defaultedParameters: string[] = [];
  const inferredParameters: string[] = [];
  const warnings: ValidationWarning[] = [];
  const hardErrors: ValidationWarning[] = [];
  const configurationDiff: ConfigDiffEntry[] = [];

  const matchedByType = groupMatches(matches);
  const defaults = DEFAULT_PROFILE.params;
  const queryLower = query.toLowerCase();

  for (const key of Object.keys(defaults) as Array<keyof EditableProfile["params"]>) {
    const explicitValue = explicit.params[key];
    if (explicitValue !== undefined) {
      nextProfile.params[key] = explicitValue as never;
      generation[key] = {
        value: explicitValue,
        source: "query_explicit",
        confidence: 1,
        reason: "Explicitly provided in query",
      };
    } else {
      generation[key] = {
        value: nextProfile.params[key],
        source: nextProfile.params[key] === profile.params[key] ? "current_profile" : "default",
        confidence: "default",
        reason: nextProfile.params[key] === profile.params[key] ? "Preserved from current profile" : "Default value",
      };
      defaultedParameters.push(key);
    }
  }

  for (const toggleKey of ["use_irrational", "use_imaginary", "use_infinity"] as const) {
    const value = explicit.params[toggleKey];
    if (typeof value === "boolean") {
      nextProfile.params[toggleKey] = value;
      inferredParameters.push(`params.${toggleKey}`);
    }
  }
  for (const probabilityKey of ["invert_probability", "psychology_probability"] as const) {
    const value = explicit.params[probabilityKey];
    if (typeof value === "number") {
      nextProfile.params[probabilityKey] = value;
      inferredParameters.push(`params.${probabilityKey}`);
    }
  }

  for (const domain of matchedByType.domain) {
    const flagName = domain.technicalName;
    const isExcluded = explicit.excludedTerms.has(flagName) || explicit.excludedIds.has(domain.id);
    if (isExcluded) {
      if (nextProfile.flags[flagName] !== false) {
        nextProfile.flags[flagName] = false;
        inferredParameters.push(`flags.${flagName}`);
        configurationDiff.push({
          scope: "flags",
          key: flagName,
          before: profile.flags[flagName],
          after: false,
          source: "semantic_retrieval",
          reason: domain.reason,
        });
      }
      continue;
    }
    if (domain.confidence >= 0.45 && nextProfile.flags[flagName] !== true) {
      nextProfile.flags[flagName] = true;
      inferredParameters.push(`flags.${flagName}`);
      configurationDiff.push({
        scope: "flags",
        key: flagName,
        before: profile.flags[flagName],
        after: true,
        source: "semantic_retrieval",
        reason: domain.reason,
      });
    }
  }

  for (const pattern of matchedByType.structural_pattern) {
    const patternName = pattern.technicalName;
    const isExcluded =
      explicit.excludedTerms.has(patternName) ||
      explicit.excludedTerms.has(pattern.displayName.toLowerCase()) ||
      explicit.excludedIds.has(pattern.id);
    const disabled = new Set(nextProfile.disabled_patterns);

    if (isExcluded) {
      if (!disabled.has(patternName)) {
        disabled.add(patternName);
        nextProfile.disabled_patterns = [...disabled];
        inferredParameters.push(`disabled_patterns.${patternName}`);
        configurationDiff.push({
          scope: "patterns",
          key: patternName,
          before: profile.disabled_patterns.includes(patternName),
          after: true,
          source: "semantic_retrieval",
          reason: pattern.reason,
        });
      }
      continue;
    }

    if (disabled.has(patternName) && pattern.confidence >= 0.45) {
      disabled.delete(patternName);
      nextProfile.disabled_patterns = [...disabled];
      inferredParameters.push(`disabled_patterns.${patternName}`);
      configurationDiff.push({
        scope: "patterns",
        key: patternName,
        before: true,
        after: false,
        source: "semantic_retrieval",
        reason: pattern.reason,
      });
    }
  }

  const paramKeys = Object.keys(profile.params) as Array<keyof EditableProfile["params"]>;
  for (const key of paramKeys) {
    if (profile.params[key] !== nextProfile.params[key] && !configurationDiff.find((entry) => entry.scope === "params" && entry.key === key)) {
      configurationDiff.push({
        scope: "params",
        key,
        before: profile.params[key],
        after: nextProfile.params[key],
        source: explicit.params[key] !== undefined ? "query_explicit" : "semantic_retrieval",
        reason: explicit.params[key] !== undefined ? "Explicitly provided in query" : "Updated during proposal compilation",
      });
    }
  }

  if (matchedByType.domain.length === 0) {
    warnings.push({
      level: "warning",
      code: "no_domain_match",
      message: "No semantic domain matches were found. The proposal keeps current domain flags.",
    });
  }

  const validation = validateProposedProfile(nextProfile, queryLower);
  warnings.push(...validation.warnings);
  hardErrors.push(...validation.hardErrors);

  return {
    query,
    retrievalMode: "dense",
    profile: nextProfile,
    proposal: {
      generation,
      domains: matchedByType.domain,
      patterns: matchedByType.structural_pattern,
      operators: matchedByType.operator,
      formulas: matchedByType.formula,
      metrics: matchedByType.metric,
      lexicalCategories: matchedByType.lexical_category,
      constants: matchedByType.constant,
    },
    matchedEntries: matches,
    defaultedParameters,
    inferredParameters,
    warnings,
    hardErrors,
    configurationDiff,
  };
}

type ExplicitExtraction = {
  params: Partial<EditableProfile["params"]>;
  excludedTerms: Set<string>;
  excludedIds: Set<string>;
};

function extractExplicitParameters(query: string): ExplicitExtraction {
  const params: Partial<EditableProfile["params"]> = {};
  const lower = query.toLowerCase();
  const patterns: Array<[keyof EditableProfile["params"], RegExp[]]> = [
    [
      "generations",
      [/\b(?:generations?|поколени[яйе])\s*[:=]?\s*(\d+)/i, /\b(\d+)\s*(?:generations?|поколени[яйе])/i],
    ],
    [
      "batch",
      [/\b(?:batch|батч)\s*[:=]?\s*(\d+)/i, /\b(\d+)\s*(?:batch|батч)\b/i],
    ],
    [
      "top",
      [/\btop\s*[:=]?\s*(\d+)/i, /\b(\d+)\s*top\b/i],
    ],
    [
      "max_depth",
      [/\b(?:max[_ -]?depth|depth|глубин[аы])\s*[:=]?\s*(\d+)/i, /\b(\d+)\s*(?:depth|глубин[аы])/i],
    ],
    [
      "max_elements",
      [/\b(?:max[_ -]?elements|max elements|elements|элементов?)\s*[:=]?\s*(\d+)/i, /\b(\d+)\s*(?:elements|элементов?)\b/i],
    ],
    [
      "invert_probability",
      [/\b(?:invert_probability|invert probability|вероятность инверсии)\s*[:=]?\s*(0(?:\.\d+)?|1(?:\.0+)?)\b/i],
    ],
    [
      "psychology_probability",
      [/\b(?:psychology_probability|psychology probability|вероятность психологии)\s*[:=]?\s*(0(?:\.\d+)?|1(?:\.0+)?)\b/i],
    ],
  ];

  for (const [key, expressions] of patterns) {
    for (const expression of expressions) {
      const match = query.match(expression);
      if (!match) continue;
      const raw = Number(match[1]);
      if (!Number.isNaN(raw)) {
        params[key] = raw as never;
        break;
      }
    }
  }

  const booleanKeywords: Array<{
    key: "use_irrational" | "use_imaginary" | "use_infinity";
    positive: RegExp[];
    negative: RegExp[];
  }> = [
    {
      key: "use_irrational",
      positive: [/\birrational\b/i, /иррацион/i],
      negative: [/\bwithout irrational\b/i, /без иррацион/i],
    },
    {
      key: "use_imaginary",
      positive: [/\bimaginary\b/i, /мним/i],
      negative: [/\bwithout imaginary\b/i, /без мним/i],
    },
    {
      key: "use_infinity",
      positive: [/\binfinity\b/i, /бесконеч/i],
      negative: [/\bwithout infinity\b/i, /без бесконеч/i],
    },
  ];

  for (const item of booleanKeywords) {
    if (item.negative.some((expression) => expression.test(lower))) {
      params[item.key] = false as never;
      continue;
    }
    if (item.positive.some((expression) => expression.test(lower))) {
      params[item.key] = true as never;
    }
  }

  const excludedTerms = new Set<string>();
  for (const match of query.matchAll(/\b(?:without|exclude|excluding|no|без|исключи|исключая)\s+([a-zA-Zа-яА-Я0-9_\-]+)/gi)) {
    excludedTerms.add(match[1].toLowerCase());
  }

  return { params, excludedTerms, excludedIds: new Set<string>() };
}

function validateProposedProfile(profile: EditableProfile, queryLower: string) {
  const warnings: ValidationWarning[] = [];
  const hardErrors: ValidationWarning[] = [];

  const numericThresholds: Array<{ key: keyof EditableProfile["params"]; warningAt: number }> = [
    { key: "batch", warningAt: 500 },
    { key: "generations", warningAt: 5 },
    { key: "top", warningAt: 20 },
    { key: "max_depth", warningAt: 15 },
    { key: "max_elements", warningAt: 20 },
  ];

  for (const { key, warningAt } of numericThresholds) {
    const value = Number(profile.params[key]);
    if (!Number.isFinite(value) || value < 0) {
      hardErrors.push({
        level: "error",
        code: "invalid_numeric_value",
        message: `Invalid value for ${key}`,
        field: `params.${key}`,
      });
      continue;
    }
    if (value > warningAt) {
      warnings.push({
        level: "warning",
        code: "high_numeric_value",
        message: `${key} is high (${value}) and may increase runtime or output size.`,
        field: `params.${key}`,
      });
    }
  }

  for (const metric of [...profile.metrics.influencing, ...profile.metrics.observational]) {
    if (!METRIC_KEYS.includes(metric as never)) {
      hardErrors.push({
        level: "error",
        code: "invalid_metric",
        message: `Unknown metric: ${metric}`,
        field: "metrics",
      });
    }
  }

  if (queryLower.includes("strict")) {
    warnings.push({
      level: "warning",
      code: "strictness_not_implemented",
      message: "Alignment strictness is not yet configurable in this first mode. Manual review remains required.",
    });
  }

  return { warnings, hardErrors };
}

function groupMatches(matches: SemanticMatchedEntry[]) {
  return {
    generation_parameter: matches.filter((entry) => entry.entityType === "generation_parameter"),
    domain: matches.filter((entry) => entry.entityType === "domain"),
    structural_pattern: matches.filter((entry) => entry.entityType === "structural_pattern"),
    metric: matches.filter((entry) => entry.entityType === "metric"),
    operator: matches.filter((entry) => entry.entityType === "operator"),
    formula: matches.filter((entry) => entry.entityType === "formula"),
    constant: matches.filter((entry) => entry.entityType === "constant"),
    lexical_category: matches.filter((entry) => entry.entityType === "lexical_category"),
  };
}

function toMatchedEntry(
  entry: LexiconEntry,
  score: number,
  confidence: number,
  matchedPhrase: string | null,
): SemanticMatchedEntry {
  const technicalName = String(entry.technical?.name ?? entry.id);
  const displayName = String(entry.semantic?.display_name ?? technicalName);
  const description = asNullableString(entry.semantic?.description)
    ?? asNullableString(entry.semantic?.short_description)
    ?? asNullableString(entry.technical?.description)
    ?? asNullableString(entry.technical?.template);

  return {
    id: entry.id,
    entityType: entry.entity_type,
    displayName,
    technicalName,
    description,
    confidence,
    score,
    matchedPhrase,
    reason: matchedPhrase ? `Semantic match using phrase: ${matchedPhrase}` : "Semantic embedding match",
    selectedValue: inferSelectedValue(entry),
  };
}

function inferSelectedValue(entry: LexiconEntry) {
  if (entry.entity_type === "domain") return entry.technical?.default_value ?? true;
  if (entry.entity_type === "generation_parameter") return entry.technical?.default_value ?? null;
  return entry.technical?.name ?? null;
}

function buildEntryText(entry: LexiconEntry): string {
  const semantic = entry.semantic ?? {};
  const technical = entry.technical ?? {};
  const parts = [
    entry.id,
    entry.entity_type,
    stringifyField(semantic.display_name),
    stringifyField(semantic.short_description),
    stringifyField(semantic.description),
    stringifyField(technical.name),
    stringifyField(technical.symbol),
    stringifyField(technical.type),
    stringifyField(technical.operator_type),
    stringifyField(technical.formula),
    stringifyField(technical.template),
    stringifyField(technical.comment),
    stringifyField(technical.default_value),
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildMatchedPhrase(query: string, haystack: string): string | null {
  const queryTokens = tokenize(query);
  const haystackTokens = new Set(tokenize(haystack));
  const matched = queryTokens.filter((token) => haystackTokens.has(token)).slice(0, 4);
  return matched.length > 0 ? matched.join(", ") : null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function scoreToConfidence(score: number): number {
  if (score <= 0) return 0;
  return Math.max(0, Math.min(1, (score - 0.15) / 0.55));
}

function hashText(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function stringifyField(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
