import { randomUUID } from "crypto";
import { copyFileSync, mkdirSync, existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join, basename, extname } from "path";
import { db } from "@/lib/db";
import { getActiveProvider } from "@/lib/llm/factory";
import { cosineSimilarity } from "@/lib/llm/types";
import { syncCrystalsFromIndex } from "@/lib/engine/sync";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = join(PROJECT_ROOT, "data");
const CRYSTALS_ROOT = join(DATA_ROOT, "meta_crystals", "crystals");
const MANIFESTED_ROOT = join(CRYSTALS_ROOT, "manifested");
const ISOMORPHISMS_FILE = join(DATA_ROOT, "meta_crystals", "isomorphisms.json");

mkdirSync(MANIFESTED_ROOT, { recursive: true });
mkdirSync(join(DATA_ROOT, "meta_crystals"), { recursive: true });

export interface ManifestCrystalRecord {
  dbId: string;
  code: string;
  filepath: string;
  json: Record<string, any>;
}

export interface MicroNotesRequestData {
  crystal_ids: string[];
  temperature?: number;
}

export interface ManifestRequestData {
  crystal_ids: string[];
  temperature?: number;
  include_isomorphs?: boolean;
}

export interface DiffuseRequestData {
  donor_ids: string[];
  temperature?: number;
  guidance?: number;
  superposition_size?: number;
  collapse_mode?: "best" | "diverse" | "manual";
  include_isomorphic_donors?: boolean;
}

export interface EmbeddingsIndexRequestData {
  crystal_ids?: string[] | null;
  force_reindex?: boolean;
}

export interface EmbeddingsSearchRequestData {
  query: string;
  limit?: number;
  filter?: {
    has_micro_note?: boolean;
    has_vector?: boolean;
  };
}

export interface IsomorphScanRequestData {
  threshold?: number;
  crystal_ids?: string[] | null;
}

const STEP1_SYSTEM = `Ты — наблюдатель абстрактных форм.
Для каждой формулы оставь одну микрозаметку на полях: 2-5 слов про ритм, форму или движение.
Не объясняй смысл формулы. Верни только JSON-массив объектов вида {"id":"...", "note":"..."} .`;

const STEP2_SYSTEM = `Учитывая микрозаметку и полный JSON кристалла, прояви его вероятности.
Верни строго JSON:
{
  "vector_direction": "одно короткое предложение",
  "mutation_probabilities": ["...", "..."]
}`;

const STEP3_SYSTEM = `Ты — алхимик формул.
Синтезируй новый кристалл из доноров. Верни строго JSON-объект со структурой:
{
  "meta": {"code":"","type":"diamond","category":"manifested"},
  "crystal": {
    "focus": {"type":"categorical","word":"...","category":"focus"},
    "pattern":"...",
    "elements":["..."],
    "operators":[{"key":"...","symbol":"...","type":"...","arity":2,"priority":2}],
    "combination":"...",
    "complexity": 0,
    "quality_score": 0,
    "metrics": {}
  },
  "classification": {"type":"diamond","reasons":["..."]},
  "llm_synthesis_reasoning": "..."
}`;

export async function resolveCrystal(idOrCode: string): Promise<ManifestCrystalRecord> {
  const crystal =
    (await db.crystal.findUnique({ where: { id: idOrCode } })) ??
    (await db.crystal.findUnique({ where: { code: idOrCode } }));

  if (!crystal) {
    throw new Error(`Crystal not found: ${idOrCode}`);
  }
  if (!existsSync(crystal.filepath)) {
    throw new Error(`Crystal file not found: ${crystal.filepath}`);
  }
  const json = JSON.parse(readFileSync(crystal.filepath, "utf-8")) as Record<string, any>;
  return {
    dbId: crystal.id,
    code: crystal.code,
    filepath: crystal.filepath,
    json,
  };
}

export function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.${randomUUID()}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  writeFileSync(tmp, payload, "utf-8");
  try {
    renameSync(tmp, filepath);
    return;
  } catch {}
  try {
    copyFileSync(tmp, filepath);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

export async function createMicroNotes(input: MicroNotesRequestData) {
  const ids = [...new Set(input.crystal_ids)];
  const crystals = await Promise.all(ids.map(resolveCrystalSafe));
  const valid = crystals.filter((item): item is ManifestCrystalRecord => Boolean(item));
  if (valid.length === 0) {
    return { status: "ok", processed: 0, results: [] as Array<{ id: string; note: string }> };
  }

  const formulas = valid
    .map((item) => ({
      id: item.code,
      combination: String(item.json?.crystal?.combination ?? item.json?.combination ?? ""),
    }))
    .filter((item) => item.combination);

  const prompt = `Перед тобой ${formulas.length} формул.\nВерни JSON-массив.\nФормулы:\n${JSON.stringify(formulas, null, 2)}`;
  const parsed = await callJsonChat(prompt, STEP1_SYSTEM, input.temperature ?? 0.75);
  const results = Array.isArray(parsed) ? parsed : [];

  for (const result of results) {
    const item = valid.find((crystal) => crystal.code === result?.id);
    if (!item || typeof result?.note !== "string") continue;
    item.json.llm_micro_note = result.note.trim();
    atomicWriteJson(item.filepath, item.json);
  }

  return {
    status: "ok",
    processed: results.length,
    results: results
      .filter((item: any) => item?.id && item?.note)
      .map((item: any) => ({ id: String(item.id), note: String(item.note) })),
  };
}

export async function manifestCrystals(input: ManifestRequestData) {
  const ids = [...new Set(input.crystal_ids)];
  const results: Array<{ id: string; vector_direction: string; mutation_probabilities: string[] }> = [];

  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const micro = String(crystal.json.llm_micro_note ?? "").trim();
    if (!micro) {
      const error = new Error(`Crystal ${crystal.code} has no llm_micro_note`);
      (error as Error & { status?: number }).status = 422;
      throw error;
    }
    const isomorphs = input.include_isomorphs ? await getIsomorphismsForCode(crystal.code) : [];
    const isomorphText = isomorphs.length
      ? `\nСтруктурные изоморфизмы для подсказки: ${isomorphs.map((item) => `${item.target_id} (${item.strength.toFixed(2)})`).join(", ")}`
      : "";
    const prompt = `Микрозаметка: "${micro}"${isomorphText}\nКристалл:\n${JSON.stringify(crystal.json, null, 2)}`;
    const parsed = await callJsonChat(prompt, STEP2_SYSTEM, input.temperature ?? 0.45);
    const vectorDirection = String(parsed?.vector_direction ?? "").trim();
    const mutationProbabilities = Array.isArray(parsed?.mutation_probabilities)
      ? parsed.mutation_probabilities.map(String).slice(0, 2)
      : [];

    crystal.json.vector_direction = vectorDirection;
    crystal.json.mutation_probabilities = mutationProbabilities;
    atomicWriteJson(crystal.filepath, crystal.json);
    await indexManifestEmbeddings({ crystal_ids: [crystal.code], force_reindex: true });

    results.push({
      id: crystal.code,
      vector_direction: vectorDirection,
      mutation_probabilities: mutationProbabilities,
    });
  }

  return {
    status: "ok",
    results,
  };
}

export async function queryPalette(query: {
  q?: string | null;
  vector?: string | null;
  semantic_query?: string | null;
  has_micro_note?: boolean | null;
  has_vector?: boolean | null;
  limit?: number;
}) {
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const crystals = await listAllCrystalJsonFiles();
  const rows: Array<{ id: string; micro_note: string | null; vector_direction: string | null; similarity: number | null }> = [];

  for (const crystal of crystals) {
    const micro = typeof crystal.json.llm_micro_note === "string" ? crystal.json.llm_micro_note : null;
    const vectorDirection = typeof crystal.json.vector_direction === "string" ? crystal.json.vector_direction : null;
    if (query.has_micro_note != null && Boolean(micro) !== query.has_micro_note) continue;
    if (query.has_vector != null && Boolean(vectorDirection) !== query.has_vector) continue;
    if (query.q && !micro?.toLowerCase().includes(query.q.toLowerCase())) continue;
    if (query.vector && !vectorDirection?.toLowerCase().includes(query.vector.toLowerCase())) continue;
    rows.push({
      id: crystal.code,
      micro_note: micro,
      vector_direction: vectorDirection,
      similarity: null,
    });
  }

  if (query.semantic_query) {
    const semantic = await searchManifestEmbeddings({
      query: query.semantic_query,
      limit,
      filter: {
        has_micro_note: query.has_micro_note ?? undefined,
        has_vector: query.has_vector ?? undefined,
      },
    });
    return { status: "ok", found: semantic.results.length, crystals: semantic.results };
  }

  return { status: "ok", found: rows.length, crystals: rows.slice(0, limit) };
}

export async function diffuseCrystals(input: DiffuseRequestData) {
  const donorIds = await expandDonorIds(input.donor_ids, Boolean(input.include_isomorphic_donors));
  const donors = await Promise.all(donorIds.map(resolveCrystal));
  const candidates: Array<{
    crystal: Record<string, any>;
    guidance_used: number;
    quality_score: number;
  }> = [];
  const count = Math.min(20, Math.max(1, input.superposition_size ?? 1));

  for (let i = 0; i < count; i++) {
    const guidanceCandidate = clamp((input.guidance ?? 0.6) + (Math.random() * 0.3 - 0.15), 0, 1);
    const temperature = (input.temperature ?? 0.6) + Math.random() * 0.1;
    const prompt = `Степень наследования от доноров: ${Math.round(guidanceCandidate * 100)}%.\nДоноры:\n${JSON.stringify(donors.map((item) => item.json), null, 2)}`;
    const parsed = await callJsonChat(prompt, STEP3_SYSTEM, temperature);
    const candidate = normalizeSyntheticCrystal(parsed, donorIds);
    const qualityScore = estimateQualityScore(candidate, donors.map((item) => item.json));
    candidate.crystal.quality_score = qualityScore;
    candidates.push({
      crystal: candidate,
      guidance_used: guidanceCandidate,
      quality_score: qualityScore,
    });
  }

  const mode = input.collapse_mode ?? "best";
  if (mode === "manual") {
    return {
      status: "ok",
      new_crystal_id: "",
      saved_to: "",
      synthesis_reasoning: "",
      candidates_count: candidates.length,
      collapse_mode: mode,
      all_candidates: candidates,
    };
  }

  const selectedCandidates =
    mode === "diverse" ? pickDiverseCandidates(candidates, 3) : [pickBestCandidate(candidates)];
  const chosen = selectedCandidates[0];
  const saved = await saveSyntheticCrystal(chosen.crystal, donorIds);

  return {
    status: "ok",
    new_crystal_id: saved.code,
    saved_to: saved.filepath,
    synthesis_reasoning: String(chosen.crystal.llm_synthesis_reasoning ?? ""),
    candidates_count: candidates.length,
    collapse_mode: mode,
    all_candidates: mode === "diverse" ? selectedCandidates : undefined,
  };
}

export async function indexManifestEmbeddings(input: EmbeddingsIndexRequestData) {
  const targetIds = input.crystal_ids?.length ? input.crystal_ids : null;
  const rows = targetIds
    ? await Promise.all(targetIds.map(resolveCrystalSafe))
    : await listAllCrystalJsonFiles();
  const crystals = rows.filter((item): item is ManifestCrystalRecord => Boolean(item));
  const { provider, settings } = await getActiveProvider();
  let indexed = 0;
  let skipped = 0;

  for (const crystal of crystals) {
    const dbRow = await db.crystal.findUnique({ where: { code: crystal.code } });
    if (!dbRow) continue;
    if (!input.force_reindex && dbRow.embedding) {
      skipped++;
      continue;
    }
    const text = buildEmbeddingText(crystal.json);
    if (!text) {
      skipped++;
      continue;
    }
    const embedding = await provider.embed(text, settings.embedModel);
    await db.crystal.update({
      where: { code: crystal.code },
      data: {
        embedding: JSON.stringify(embedding),
        searchText: text.slice(0, 2000),
      },
    });
    indexed++;
  }

  return { status: "ok", total: crystals.length, indexed, skipped };
}

export async function searchManifestEmbeddings(input: EmbeddingsSearchRequestData) {
  const { provider, settings } = await getActiveProvider();
  const queryEmbedding = await provider.embed(input.query, settings.embedModel);
  const rows = await db.crystal.findMany({ where: { embedding: { not: null } }, take: 2000 });
  const results: Array<{
    id: string;
    micro_note: string | null;
    vector_direction: string | null;
    similarity: number;
  }> = [];

  for (const row of rows) {
    const record = await resolveCrystalSafe(row.code);
    if (!record) continue;
    const micro = typeof record.json.llm_micro_note === "string" ? record.json.llm_micro_note : null;
    const vectorDirection = typeof record.json.vector_direction === "string" ? record.json.vector_direction : null;
    if (input.filter?.has_micro_note != null && Boolean(micro) !== input.filter.has_micro_note) continue;
    if (input.filter?.has_vector != null && Boolean(vectorDirection) !== input.filter.has_vector) continue;
    const embedding = JSON.parse(row.embedding ?? "[]") as number[];
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    results.push({
      id: row.code,
      micro_note: micro,
      vector_direction: vectorDirection,
      similarity,
    });
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return {
    status: "ok",
    found: results.length,
    results: results.slice(0, Math.min(500, Math.max(1, input.limit ?? 50))),
  };
}

export async function scanIsomorphisms(input: IsomorphScanRequestData) {
  const threshold = input.threshold ?? 0.8;
  const ids = input.crystal_ids?.length ? input.crystal_ids : null;
  const crystals = ids
    ? (await Promise.all(ids.map(resolveCrystalSafe))).filter((item): item is ManifestCrystalRecord => Boolean(item))
    : await listAllCrystalJsonFiles();
  const graph: Record<string, Array<{ target_id: string; strength: number; evidence: string }>> = {};

  for (let i = 0; i < crystals.length; i++) {
    for (let j = i + 1; j < crystals.length; j++) {
      const a = crystals[i].json;
      const b = crystals[j].json;
      const [strength, evidence] = await computeSimilarity(a, b);
      if (strength < threshold) continue;
      const aCode = getCrystalCode(a);
      const bCode = getCrystalCode(b);
      graph[aCode] ??= [];
      graph[bCode] ??= [];
      graph[aCode].push({ target_id: bCode, strength, evidence });
      graph[bCode].push({ target_id: aCode, strength, evidence });
    }
  }

  atomicWriteJson(ISOMORPHISMS_FILE, graph);
  return {
    status: "ok",
    scanned: crystals.length,
    links: Object.values(graph).reduce((sum, list) => sum + list.length, 0),
  };
}

export async function getIsomorphismsForCode(codeOrId: string) {
  const code = await resolveCode(codeOrId);
  if (!existsSync(ISOMORPHISMS_FILE)) {
    return [];
  }
  const graph = JSON.parse(readFileSync(ISOMORPHISMS_FILE, "utf-8")) as Record<string, any[]>;
  const items = graph[code] ?? [];
  return items.map((item) => ({
    target_id: String(item.target_id),
    strength: Number(item.strength ?? 0),
    evidence: String(item.evidence ?? ""),
  }));
}

export async function computeSimilarity(crystalA: Record<string, any>, crystalB: Record<string, any>): Promise<[number, string]> {
  const textA = String(crystalA?.crystal?.combination ?? crystalA?.combination ?? "");
  const textB = String(crystalB?.crystal?.combination ?? crystalB?.combination ?? "");
  const { provider, settings } = await getActiveProvider();
  const [embA, embB] = await Promise.all([
    provider.embed(textA, settings.embedModel),
    provider.embed(textB, settings.embedModel),
  ]);
  const semanticSim = cosineSimilarity(embA, embB);
  const elemsA = new Set<string>((crystalA?.crystal?.elements ?? []).map(String));
  const elemsB = new Set<string>((crystalB?.crystal?.elements ?? []).map(String));
  const opsA = new Set<string>((crystalA?.crystal?.operators ?? []).map((op: any) => String(op?.symbol ?? op?.key ?? op)));
  const opsB = new Set<string>((crystalB?.crystal?.operators ?? []).map((op: any) => String(op?.symbol ?? op?.key ?? op)));
  const elemUnion = new Set([...elemsA, ...elemsB]);
  const opUnion = new Set([...opsA, ...opsB]);
  const elemOverlap = intersectCount(elemsA, elemsB) / Math.max(elemUnion.size, 1);
  const opOverlap = intersectCount(opsA, opsB) / Math.max(opUnion.size, 1);
  const strength = 0.5 * semanticSim + 0.3 * elemOverlap + 0.2 * opOverlap;
  const evidence = `shared_elements=${JSON.stringify([...elemsA].filter((item) => elemsB.has(item)).slice(0, 3))}, shared_operators=${JSON.stringify([...opsA].filter((item) => opsB.has(item)).slice(0, 3))}`;
  return [strength, evidence];
}

async function callJsonChat(prompt: string, system: string, temperature: number) {
  const { provider, settings } = await getActiveProvider();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await provider.chat(
        [{ role: "user", content: prompt }],
        {
          model: settings.chatModel,
          temperature,
          topP: settings.topP,
          maxTokens: Math.max(1024, settings.maxTokens),
          system,
        },
      );
      return extractJson(result.text);
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("LLM JSON parse failed");
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    return JSON.parse(text.slice(arrStart, arrEnd + 1));
  }
  throw new Error("Unexpected LLM JSON payload");
}

async function resolveCrystalSafe(idOrCode: string) {
  try {
    return await resolveCrystal(idOrCode);
  } catch {
    return null;
  }
}

async function resolveCode(idOrCode: string) {
  const row =
    (await db.crystal.findUnique({ where: { id: idOrCode } })) ??
    (await db.crystal.findUnique({ where: { code: idOrCode } }));
  return row?.code ?? idOrCode;
}

async function listAllCrystalJsonFiles(): Promise<ManifestCrystalRecord[]> {
  const files = collectJsonFiles(CRYSTALS_ROOT);
  const rows: ManifestCrystalRecord[] = [];
  for (const filepath of files) {
    try {
      const json = JSON.parse(readFileSync(filepath, "utf-8")) as Record<string, any>;
      const code = getCrystalCode(json);
      const dbRow = await db.crystal.findUnique({ where: { code } });
      rows.push({
        dbId: dbRow?.id ?? code,
        code,
        filepath,
        json,
      });
    } catch {}
  }
  return rows;
}

function collectJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const items: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      items.push(...collectJsonFiles(abs));
      continue;
    }
    if (stat.isFile() && extname(abs).toLowerCase() === ".json" && basename(abs).toLowerCase() !== "index.json") {
      items.push(abs);
    }
  }
  return items;
}

function buildEmbeddingText(json: Record<string, any>) {
  return [
    json.llm_micro_note ?? "",
    json.vector_direction ?? "",
    json?.crystal?.combination ?? "",
  ]
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeSyntheticCrystal(raw: any, parents: string[]) {
  const now = new Date().toISOString();
  const code = `SYNTH-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const crystal = raw?.crystal && typeof raw.crystal === "object" ? raw.crystal : {};
  const classification = raw?.classification && typeof raw.classification === "object" ? raw.classification : {};
  return {
    meta: {
      code,
      type: "diamond",
      category: "manifested",
      counter: 0,
      step: 0,
      datetime: now,
      generation: "synthetic",
      parents,
    },
    crystal: {
      focus: crystal.focus && typeof crystal.focus === "object"
        ? crystal.focus
        : { type: "categorical", word: "manifested_focus", category: "focus" },
      pattern: String(crystal.pattern ?? "рефлексивный"),
      elements: Array.isArray(crystal.elements) ? crystal.elements.map(String) : [],
      operators: Array.isArray(crystal.operators) ? crystal.operators : [],
      combination: String(crystal.combination ?? ""),
      complexity: Number(crystal.complexity ?? 0),
      quality_score: Number(crystal.quality_score ?? 0),
      metrics: crystal.metrics && typeof crystal.metrics === "object" ? crystal.metrics : {},
    },
    classification: {
      type: "diamond",
      reasons: Array.isArray(classification.reasons) ? classification.reasons.map(String) : ["Manifestation synthesis"],
    },
    llm_synthesis_reasoning: String(raw?.llm_synthesis_reasoning ?? ""),
  };
}

function estimateQualityScore(candidate: Record<string, any>, donors: Record<string, any>[]) {
  const donorScores = donors
    .map((item) => Number(item?.crystal?.quality_score ?? item?.crystal?.qualityScore ?? 0))
    .filter((item) => Number.isFinite(item));
  const base = donorScores.length ? donorScores.reduce((sum, item) => sum + item, 0) / donorScores.length : 0.65;
  const complexity = Number(candidate?.crystal?.complexity ?? 0);
  const bonus = Math.min(0.15, complexity / 200);
  return Number(Math.max(0, Math.min(1, base + bonus)).toFixed(4));
}

function pickBestCandidate(candidates: Array<{ crystal: Record<string, any>; guidance_used: number; quality_score: number }>) {
  return [...candidates].sort((a, b) => b.quality_score - a.quality_score)[0];
}

function pickDiverseCandidates(candidates: Array<{ crystal: Record<string, any>; guidance_used: number; quality_score: number }>, limit: number) {
  return [...candidates]
    .sort((a, b) => b.quality_score - a.quality_score)
    .slice(0, Math.max(limit, 1));
}

async function saveSyntheticCrystal(json: Record<string, any>, parents: string[]) {
  const maxCounter = await db.crystal.aggregate({ _max: { counter: true } });
  const nextCounter = (maxCounter._max.counter ?? 0) + 1;
  json.meta.counter = nextCounter;
  json.meta.parents = parents;
  json.meta.type = "diamond";
  json.classification.type = "diamond";
  const filepath = join(MANIFESTED_ROOT, `${json.meta.code}.json`);
  atomicWriteJson(filepath, json);
  await syncCrystalsFromIndex();
  await indexManifestEmbeddings({ crystal_ids: [json.meta.code], force_reindex: true });
  return { code: String(json.meta.code), filepath };
}

async function expandDonorIds(baseIds: string[], includeIsomorphic: boolean) {
  const out = [...new Set(baseIds)];
  if (!includeIsomorphic) return out.slice(0, 5);
  for (const id of [...out]) {
    const links = await getIsomorphismsForCode(id);
    for (const link of links) {
      if (out.length >= 5) break;
      out.push(link.target_id);
    }
    if (out.length >= 5) break;
  }
  return [...new Set(out)].slice(0, 5);
}

function intersectCount<T>(a: Set<T>, b: Set<T>) {
  let count = 0;
  for (const item of a) if (b.has(item)) count++;
  return count;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCrystalCode(json: Record<string, any>) {
  return String(json?.meta?.code ?? json?.code ?? `unknown-${randomUUID().slice(0, 8)}`);
}
