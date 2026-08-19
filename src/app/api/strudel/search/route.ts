import { NextRequest, NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";
import strudelParamsDB from "@/lib/strudel/strudel_catalog.json";
import type { StrudelSearchResult } from "@/components/strudel-flow/types";

type StrudelParamRecord = (typeof strudelParamsDB)[number];
type EmbeddingCache = Map<string, number[]>;

const embeddingCacheByModel = new Map<string, EmbeddingCache>();

const STOPWORDS = new Set([
  "the", "and", "with", "for", "from", "that", "this", "into", "using",
  "звук", "звуком", "нужно", "хочу", "сделай", "музыка", "музыкальный", "похожий",
  "audio", "sound", "music", "make", "create", "need", "want",
]);

const PARAM_HINTS: Record<string, string[]> = {
  gain: ["volume", "loud", "amplitude", "громкость", "усиление", "тише", "громче"],
  lpf: ["warm", "muffled", "dark", "low pass", "теплый", "мягкий", "приглушенный", "фильтр"],
  hpf: ["thin", "bright", "high pass", "яркий", "тонкий", "воздушный"],
  crush: ["retro", "8bit", "lofi", "glitch", "bitcrush", "ретро", "лофи", "глитч", "цифровой шум"],
  distort: ["distortion", "aggressive", "dirty", "overdrive", "дисторшн", "агрессивный", "грязный", "перегруз"],
  delay: ["echo", "repeat", "space", "эхо", "повтор", "пространство"],
  reverb: ["ambient", "hall", "room", "spacious", "эмбиент", "зал", "пространственный", "реверб"],
  pan: ["stereo", "left", "right", "spatial", "стерео", "панорама", "лево", "право"],
  sine: ["bass", "pure", "smooth", "sub", "бас", "чистый", "гладкий", "синус"],
  sawtooth: ["synth", "bright", "lead", "rich", "синт", "яркий", "лид", "пила"],
  square: ["chiptune", "game", "hollow", "chip", "чиптюн", "игровой", "квадрат"],
  triangle: ["soft", "flute", "gentle", "мягкий", "нежный", "треугольник"],
  noise: ["texture", "wind", "percussion", "шум", "текстура", "перкуссия"],
  fm: ["metallic", "bell", "fm", "металлический", "колокольчик"],
  am: ["tremolo", "ring", "modulation", "тремоло", "кольцевая модуляция"],
  arp: ["arpeggio", "arp", "running notes", "арпеджио", "перебор"],
  seq: ["sequence", "pattern", "steps", "секвенсор", "последовательность"],
  slow: ["slow", "drag", "stretch time", "медленно", "замедлить"],
  fast: ["fast", "speed", "rush", "быстро", "ускорить"],
  stretch: ["stretch", "elongate", "растянуть", "длиннее"],
  loop: ["loop", "repeat cycle", "цикл", "луп", "повтор"],
  rand: ["random", "chaos", "unpredictable", "случайный", "хаос"],
  euclid: ["rhythm", "polyrhythm", "euclidean", "ритм", "полиритм", "евклид"],
  mute: ["silence", "drop", "pause", "заглушить", "тишина", "пауза"],
  density: ["dense", "busy", "filled", "плотный", "насыщенный"],
  chunk: ["group", "blocks", "polyrhythm", "чанк", "группы"],
  note: ["notes", "melody", "pitch", "ноты", "мелодия", "высота"],
  scale: ["scale", "mode", "tonality", "лад", "тональность", "гамма"],
  chord: ["chord", "harmony", "polyphony", "аккорд", "гармония"],
  transp: ["transpose", "shift pitch", "транспонировать", "сдвиг тона"],
};

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

function keywordSearch(
  query: string,
  topK: number = 5
): StrudelSearchResult[] {
  const queryLower = query.toLowerCase();
  const queryWords = tokenize(queryLower);
  const results: StrudelSearchResult[] = [];
  
  for (const param of strudelParamsDB) {
    const searchText = buildParamSearchText(param);
    const haystackTokens = tokenize(searchText);

    let score = 0;
    for (const token of queryWords) {
      if (haystackTokens.has(token)) {
        score += 1;
        continue;
      }
      if ([...haystackTokens].some((candidate) => candidate.includes(token) || token.includes(candidate))) {
        score += 0.55;
      }
    }

    if (searchText.includes(queryLower)) score += 1.6;
    if (PARAM_HINTS[param.id]?.some((hint) => queryLower.includes(hint.toLowerCase()))) {
      score += 1.2;
    }

    const normalizedScore = Math.min(1, score / Math.max(2, queryWords.size * 1.4));
    if (normalizedScore > 0.08) {
      results.push({
        id: param.id,
        name: param.name,
        description: param.description,
        category: param.category,
        score: normalizedScore,
        matched_phrase: [...queryWords].find((word) => haystackTokens.has(word)) ?? null,
      });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

function semanticSearch(
  queryEmbedding: number[],
  embeddings: EmbeddingCache,
  topK: number = 5,
  minScore: number = 0.1
): StrudelSearchResult[] {
  const results: StrudelSearchResult[] = [];
  
  for (const param of strudelParamsDB) {
    const vector = embeddings.get(param.id) ?? param.vector;
    if (!vector || vector.length === 0) continue;
    const score = cosineSimilarity(queryEmbedding, vector);
    
    if (score >= minScore) {
      results.push({
        id: param.id,
        name: param.name,
        description: param.description,
        category: param.category,
        score,
        matched_phrase: null
      });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

async function ensureRuntimeEmbeddings(model: string, candidateIds: string[]): Promise<EmbeddingCache> {
  const cached = embeddingCacheByModel.get(model) ?? new Map<string, number[]>();
  const wantedIds = [...new Set(candidateIds)];
  const missing = strudelParamsDB.filter((param) => wantedIds.includes(param.id) && !cached.has(param.id));
  if (missing.length === 0) {
    embeddingCacheByModel.set(model, cached);
    return cached;
  }

  const { provider } = await getActiveProvider();
  let cursor = 0;
  const concurrency = 3;

  const workers = new Array(concurrency).fill(null).map(async () => {
    while (cursor < missing.length) {
      const current = missing[cursor++];
      const embedding = await provider.embed(buildParamSearchText(current), model);
      cached.set(current.id, embedding);
    }
  });

  await Promise.all(workers);
  embeddingCacheByModel.set(model, cached);
  return cached;
}

function buildParamSearchText(param: StrudelParamRecord) {
  return [
    param.id,
    param.name,
    param.description,
    param.category,
    param.package,
    param.module,
    ...(param.synonyms ?? []),
    ...(param.examples ?? []),
    ...(param.tags ?? []),
    ...(PARAM_HINTS[param.id] ?? []),
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_]+/gu, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOPWORDS.has(token)),
  );
}

function mergeSearchResults(
  semanticResults: StrudelSearchResult[],
  keywordResults: StrudelSearchResult[],
  topK: number,
) {
  const merged = new Map<string, StrudelSearchResult>();

  for (const item of keywordResults) {
    merged.set(item.id, { ...item });
  }
  for (const item of semanticResults) {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, { ...item });
      continue;
    }
    merged.set(item.id, {
      ...item,
      score: Math.min(1, item.score * 0.78 + current.score * 0.35),
      matched_phrase: current.matched_phrase ?? item.matched_phrase ?? null,
    });
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 5, min_score = 0.1, embedding } = body;
    
    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { ok: false, error: "Query parameter is required" },
        { status: 400 }
      );
    }
    
    let results: StrudelSearchResult[];
    let searchType: "semantic_hybrid" | "semantic_precomputed" | "keyword" = "keyword";
    const hasPrecomputedVectors = strudelParamsDB.some((param) => Array.isArray(param.vector) && param.vector.length > 0);
    let queryEmbedding = Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
    let runtimeEmbeddings: EmbeddingCache | null = null;
    
    const keywordResults = keywordSearch(query, Math.max(top_k * 8, 24));
    const candidateIds = keywordResults.length > 0
      ? keywordResults.map((item) => item.id)
      : strudelParamsDB.slice(0, 80).map((item) => item.id);

    if (!queryEmbedding) {
      try {
        const { provider, settings } = await getActiveProvider();
        queryEmbedding = await provider.embed(query, settings.embedModel);
        runtimeEmbeddings = await ensureRuntimeEmbeddings(settings.embedModel, candidateIds);
      } catch {
        queryEmbedding = null;
        runtimeEmbeddings = null;
      }
    }

    if (queryEmbedding && (runtimeEmbeddings || hasPrecomputedVectors)) {
      const semanticResults = semanticSearch(
        queryEmbedding,
        runtimeEmbeddings ?? new Map(strudelParamsDB.map((param) => [param.id, param.vector])),
        top_k * 2,
        min_score,
      );
      results = mergeSearchResults(semanticResults, keywordResults, top_k);
      searchType = runtimeEmbeddings ? "semantic_hybrid" : "semantic_precomputed";
    } else {
      results = keywordResults.slice(0, top_k);
    }
    
    return NextResponse.json({
      ok: true,
      query,
      results,
      count: results.length,
      search_type: searchType,
      vectors_ready: runtimeEmbeddings?.size ?? strudelParamsDB.filter((item) => item.vector.length > 0).length,
    });
  } catch (error) {
    console.error("Error in strudel search API:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "Strudel RAG Search API",
    version: "1.0.0",
    description: "Semantic search for Strudel parameters",
    endpoints: {
      search: "POST /api/strudel/search",
      params: "GET /api/strudel/params"
    },
    total_params: strudelParamsDB.length,
    categories: Array.from(new Set(strudelParamsDB.map(p => p.category))),
    precomputed_vectors: strudelParamsDB.filter((item) => item.vector.length > 0).length,
  });
}
