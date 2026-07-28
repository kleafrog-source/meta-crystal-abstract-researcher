import { existsSync, readFileSync } from "fs";
import { db } from "@/lib/db";
import { buildGwTorusFilepath, readPersistedTorusAnalysisResult, runTorusAnalysisForCrystal } from "@/lib/gw-collapser";
import { createMicroNotes, resolveCrystal, searchManifestEmbeddings } from "@/lib/manifestation";
import { getActiveProvider } from "@/lib/llm/factory";
import type {
  GwCrystalPoolActionDefinition,
  GwCrystalPoolActionId,
  GwCrystalPoolActionResponse,
  GwCrystalPoolListItem,
  GwCrystalPoolVisualizationPoint,
} from "@/types/gw-collapser-pool";

type JsonRecord = Record<string, any>;

export const GW_CRYSTAL_POOL_ACTIONS: GwCrystalPoolActionDefinition[] = [
  { id: "torus_flow", name: "TorusFlow GWCollapser", description: "Recompute torus analysis for selected crystals.", category: "analysis", availability: "ready" },
  { id: "micro_notes", name: "Micro notes", description: "Generate LLM micro-notes for selected crystals.", category: "generation", availability: "ready" },
  { id: "manifest_donors", name: "Manifest donors", description: "Reveal major donor relationships for the selected crystals.", category: "analysis", availability: "scaffold" },
  { id: "diffuse_manual", name: "Diffuse manual", description: "Manual coordinate adjustments for selected crystals.", category: "manual", availability: "scaffold" },
  { id: "fill_missing", name: "Заполнение полей", description: "Fill missing descriptive fields with rules or LLM assistance.", category: "generation", availability: "ready" },
  { id: "detect_emeralds", name: "Выявление изумрудов", description: "Detect outliers and candidate emeralds in the selected set.", category: "analysis", availability: "scaffold" },
  { id: "refine_metrics", name: "Уточнение метрик", description: "Recompute MMSS metrics in the context of the selected pool.", category: "analysis", availability: "scaffold" },
  { id: "translation", name: "Расшифровка", description: "Generate or refine interpretation text for selected crystals.", category: "generation", availability: "ready" },
  { id: "mmss_real_data", name: "MMSS real-data gate", description: "Run real-data MMSS checks for selected crystals.", category: "analysis", availability: "scaffold" },
  { id: "evolve_trajectory", name: "Эволюция траектории", description: "Simulate trajectory evolution across multiple torus runs.", category: "visualization", availability: "scaffold" },
  { id: "cluster_formulas", name: "Кластер формул", description: "Cluster selected crystals by formula semantics.", category: "visualization", availability: "scaffold" },
  { id: "generate_report", name: "Отчёт по пулу", description: "Build a compact report for the selected crystal pool.", category: "generation", availability: "scaffold" },
  { id: "compare_mmss", name: "Сравнение MMSS", description: "Compare MMSS profiles for the selected crystals.", category: "visualization", availability: "scaffold" },
  { id: "semantic_twins", name: "Семантические двойники", description: "Find nearest semantic neighbors outside the current selection.", category: "analysis", availability: "ready" },
  { id: "auto_annotation", name: "Авто-аннотация", description: "Generate enriched annotations from torus neighborhood and metadata.", category: "generation", availability: "ready" },
];

const ACTIONS_BY_ID = new Map(GW_CRYSTAL_POOL_ACTIONS.map((action) => [action.id, action]));

export async function listCrystalPoolItems(page: number, pageSize: number, search?: string | null) {
  const where: Record<string, unknown> = {};
  const needle = search?.trim();
  if (needle) {
    where.OR = [
      { code: { contains: needle } },
      { type: { contains: needle } },
      { pattern: { contains: needle } },
      { combination: { contains: needle } },
      { searchText: { contains: needle } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.crystal.count({ where }),
    db.crystal.findMany({
      where,
      orderBy: { counter: "desc" },
      skip: Math.max(0, (page - 1) * pageSize),
      take: pageSize,
    }),
  ]);

  const items: GwCrystalPoolListItem[] = rows.map((row) => {
    const fullFile = safeReadCrystalFile(row.filepath);
    return {
      id: row.id,
      code: row.code,
      type: row.type,
      category: row.category,
      pattern: row.pattern,
      combination: row.combination,
      qualityScore: row.qualityScore,
      complexity: row.complexity,
      createdAt: row.createdAt.toISOString(),
      llmMicroNote: typeof fullFile?.llm_micro_note === "string" ? fullFile.llm_micro_note : null,
      vectorDirection: typeof fullFile?.vector_direction === "string" ? fullFile.vector_direction : null,
      hasTorusAnalysis: existsSync(buildGwTorusFilepath(row.filepath)),
    };
  });

  return {
    ok: true,
    page,
    pageSize,
    total,
    actions: GW_CRYSTAL_POOL_ACTIONS,
    items,
  };
}

export async function runCrystalPoolAction(
  actionId: GwCrystalPoolActionId,
  crystalIds: string[],
  params: Record<string, unknown> = {},
): Promise<GwCrystalPoolActionResponse> {
  const action = ACTIONS_BY_ID.get(actionId);
  if (!action) {
    throw new Error(`Unknown crystal pool action: ${actionId}`);
  }
  const ids = [...new Set(crystalIds.map((item) => item.trim()).filter(Boolean))];
  if (!ids.length) {
    throw new Error("Crystal pool action requires at least one crystal id");
  }

  if (action.availability === "scaffold") {
    return {
      ok: true,
      action: action.id,
      actionName: action.name,
      availability: action.availability,
      affectedCount: 0,
      results: [],
      extra: {
        message: "Scaffold only. Production implementation will be connected in a follow-up commit.",
      },
    };
  }

  switch (actionId) {
    case "torus_flow":
      return runTorusFlowAction(ids, params);
    case "micro_notes":
      return runMicroNotesAction(ids, params);
    case "fill_missing":
      return runFillMissingAction(ids, params);
    case "translation":
      return runTranslationAction(ids, params);
    case "semantic_twins":
      return runSemanticTwinsAction(ids, params);
    case "auto_annotation":
      return runAutoAnnotationAction(ids, params);
    default:
      throw new Error(`Action is not wired yet: ${actionId}`);
  }
}

export async function buildCrystalPoolVisualization(
  crystalIds: string[],
  limit = 100,
) {
  const ids = [...new Set(crystalIds.map((item) => item.trim()).filter(Boolean))];
  const points: GwCrystalPoolVisualizationPoint[] = [];
  let torus = { R: 1.2, r: 0.6 };

  for (const id of ids) {
    const crystal = await db.crystal.findUnique({ where: { id } });
    if (!crystal?.filepath) continue;
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    if (!persisted?.analysis) continue;
    torus = { R: persisted.analysis.torus.R, r: persisted.analysis.torus.r };
    for (const doc of persisted.analysis.docs) {
      if (points.length >= limit) break;
      points.push({
        crystalId: persisted.analysis.crystal_id,
        crystalCode: persisted.analysis.crystal_code,
        docId: doc.id,
        title: doc.title,
        text: doc.text,
        cluster: doc.cluster,
        x: doc.torus.x,
        y: doc.torus.y,
        sourcePath: doc.sourcePath,
        sourceIndex: doc.sourceIndex,
      });
    }
    if (points.length >= limit) break;
  }

  return {
    ok: true,
    total: points.length,
    limit,
    torus,
    points,
  };
}

async function runTorusFlowAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];
  for (const id of ids) {
    const analysis = await runTorusAnalysisForCrystal(id, {
      query: typeof params.query === "string" ? params.query : null,
      ...(params.n_clusters !== undefined ? { n_clusters: Number(params.n_clusters) } : {}),
      ...(params.dt !== undefined ? { dt: Number(params.dt) } : {}),
      ...(params.friction !== undefined ? { friction: Number(params.friction) } : {}),
      ...(params.epsilon !== undefined ? { epsilon: Number(params.epsilon) } : {}),
      ...(params.max_steps !== undefined ? { max_steps: Number(params.max_steps) } : {}),
      ...(params.tol_speed !== undefined ? { tol_speed: Number(params.tol_speed) } : {}),
      ...(params.geometry_R !== undefined ? { geometry_R: Number(params.geometry_R) } : {}),
      ...(params.geometry_r !== undefined ? { geometry_r: Number(params.geometry_r) } : {}),
      ...(typeof params.embedding_model === "string" && params.embedding_model.trim()
        ? { embedding_model: params.embedding_model.trim() }
        : {}),
    });
    results.push({
      id: analysis.crystal_id,
      code: analysis.crystal_code,
      status: "updated" as const,
      summary: `Updated torus snapshot with ${analysis.docs.length} docs and ${analysis.top_docs.length} top docs.`,
      data: {
        stored_at: analysis.stored_at,
        query: analysis.query,
        docs_count: analysis.docs.length,
      },
    });
  }

  return {
    ok: true,
    action: "torus_flow",
    actionName: "TorusFlow GWCollapser",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runMicroNotesAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const response = await createMicroNotes({
    crystal_ids: ids,
    ...(params.temperature !== undefined ? { temperature: Number(params.temperature) } : {}),
  });

  const codeToDbId = new Map<string, string>();
  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    codeToDbId.set(crystal.code, crystal.dbId);
  }

  const results = response.results.map((item) => ({
    id: codeToDbId.get(item.id) ?? item.id,
    code: item.id,
    status: "updated" as const,
    summary: item.note,
    data: { micro_note: item.note },
  }));

  return {
    ok: true,
    action: "micro_notes",
    actionName: "Micro notes",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runFillMissingAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];
  const temperature = Number(params.temperature ?? 0.35);
  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const json = crystal.json;
    const missing = {
      pattern: !String(json?.crystal?.pattern ?? "").trim(),
      category: !String(json?.meta?.category ?? "").trim(),
      auto_tags: !Array.isArray(json?.auto_tags) || json.auto_tags.length === 0,
    };
    if (!missing.pattern && !missing.category && !missing.auto_tags) {
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped",
        summary: "Skipped because target fields are already present.",
        data: null,
      });
      continue;
    }

    const payload = await callCrystalLlmJson(
      `Заполни только отсутствующие поля для кристалла. Верни строгий JSON с ключами pattern, category, auto_tags.
Пустые или уже существующие поля не перепридумывай агрессивно.
Кристалл:
${JSON.stringify(json, null, 2)}
Флаги отсутствия:
${JSON.stringify(missing, null, 2)}`,
      `Ты помогаешь обогащать мета-кристаллы.
Верни только JSON:
{
  "pattern": "string or empty",
  "category": "string or empty",
  "auto_tags": ["tag1", "tag2"]
}`,
      temperature,
    );

    if (missing.pattern && String(payload?.pattern ?? "").trim()) {
      json.crystal ??= {};
      json.crystal.pattern = String(payload.pattern).trim();
    }
    if (missing.category && String(payload?.category ?? "").trim()) {
      json.meta ??= {};
      json.meta.category = String(payload.category).trim();
    }
    if (missing.auto_tags && Array.isArray(payload?.auto_tags)) {
      json.auto_tags = payload.auto_tags.map(String).filter(Boolean).slice(0, 12);
    }

    writeCrystalJson(crystal.filepath, json);
    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: "updated",
      summary: "Filled missing fields from LLM suggestions.",
      data: {
        pattern: json?.crystal?.pattern ?? null,
        category: json?.meta?.category ?? null,
        auto_tags: json?.auto_tags ?? [],
      },
    });
  }

  return {
    ok: true,
    action: "fill_missing",
    actionName: "Заполнение полей",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runTranslationAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];
  const temperature = Number(params.temperature ?? 0.45);
  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const json = crystal.json;
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    const context = {
      code: crystal.code,
      combination: json?.crystal?.combination ?? json?.combination ?? "",
      focus: json?.crystal?.focus ?? null,
      pattern: json?.crystal?.pattern ?? null,
      top_docs: persisted?.analysis?.top_docs?.slice(0, 5) ?? [],
    };
    const payload = await callCrystalLlmJson(
      `Сделай краткую расшифровку кристалла на русском языке на основе структуры и ближайших torus-фрагментов.
Верни строгий JSON с одним ключом translation.
Контекст:
${JSON.stringify(context, null, 2)}`,
      `Ты интерпретируешь абстрактные кристаллы.
Верни только JSON:
{
  "translation": "2-4 предложения, без markdown"
}`,
      temperature,
    );

    json.translation = String(payload?.translation ?? "").trim();
    writeCrystalJson(crystal.filepath, json);
    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: "updated",
      summary: json.translation || "Translation updated.",
      data: { translation: json.translation },
    });
  }

  return {
    ok: true,
    action: "translation",
    actionName: "Расшифровка",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runSemanticTwinsAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const selectedCodes = new Set<string>();
  const selected: Array<Awaited<ReturnType<typeof resolveCrystal>>> = [];
  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    selected.push(crystal);
    selectedCodes.add(crystal.code);
  }

  const limit = Math.min(10, Math.max(3, Number(params.limit ?? 5)));
  const results: GwCrystalPoolActionResponse["results"] = [];
  for (const crystal of selected) {
    const query =
      String(crystal.json?.llm_micro_note ?? "").trim() ||
      String(crystal.json?.vector_direction ?? "").trim() ||
      String(crystal.json?.crystal?.combination ?? crystal.json?.combination ?? "").trim();

    if (!query) {
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped" as const,
        summary: "Skipped because the crystal has no usable semantic text.",
        data: null,
      });
      continue;
    }

    const twins = (await searchManifestEmbeddings({ query, limit: 25 })).results
      .filter((item) => !selectedCodes.has(item.id))
      .slice(0, limit);

    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: "computed" as const,
      summary: twins.length
        ? `Found ${twins.length} semantic twins for ${crystal.code}.`
        : `No external semantic twins found for ${crystal.code}.`,
      data: {
        query,
        twins,
      },
    });
  }

  return {
    ok: true,
    action: "semantic_twins",
    actionName: "Semantic twins",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runAutoAnnotationAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];
  const temperature = Number(params.temperature ?? 0.5);
  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const json = crystal.json;
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    const context = {
      code: crystal.code,
      micro_note: json?.llm_micro_note ?? null,
      vector_direction: json?.vector_direction ?? null,
      translation: json?.translation ?? null,
      torus: persisted?.analysis?.torus ?? null,
      top_docs: persisted?.analysis?.top_docs?.slice(0, 3) ?? [],
      mmss: persisted?.analysis?.mmss ?? null,
    };
    const payload = await callCrystalLlmJson(
      `Сгенерируй авто-аннотацию для кристалла на основе torus-окрестности и имеющихся метаданных.
Верни строгий JSON с ключом auto_annotation.
Контекст:
${JSON.stringify(context, null, 2)}`,
      `Ты пишешь краткие технические аннотации для GW-Collapser Crystal Pool.
Верни только JSON:
{
  "auto_annotation": "2-5 предложений, конкретно о поведении кристалла и его соседях"
}`,
      temperature,
    );

    json.auto_annotation = String(payload?.auto_annotation ?? "").trim();
    writeCrystalJson(crystal.filepath, json);
    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: "updated",
      summary: json.auto_annotation || "Auto-annotation updated.",
      data: { auto_annotation: json.auto_annotation },
    });
  }

  return {
    ok: true,
    action: "auto_annotation",
    actionName: "Авто-аннотация",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

function safeReadCrystalFile(filepath: string) {
  if (!filepath || !existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8")) as JsonRecord;
  } catch {
    return null;
  }
}

function writeCrystalJson(filepath: string, json: JsonRecord) {
  const { atomicWriteJson } = require("@/lib/manifestation") as typeof import("@/lib/manifestation");
  atomicWriteJson(filepath, json);
}

async function callCrystalLlmJson(prompt: string, system: string, temperature: number) {
  const { provider, settings } = await getActiveProvider();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await provider.chat(
        [{ role: "user", content: prompt }],
        {
          model: settings.chatModel,
          temperature,
          topP: settings.topP,
          maxTokens: Math.max(1200, settings.maxTokens),
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
  throw new Error("Unexpected LLM JSON payload");
}
