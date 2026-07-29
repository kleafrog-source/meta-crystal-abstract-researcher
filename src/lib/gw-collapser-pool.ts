import { existsSync, readFileSync } from "fs";
import { db } from "@/lib/db";
import { buildGwTorusFilepath, readPersistedTorusAnalysisResult, runTorusAnalysisForCrystal } from "@/lib/gw-collapser";
import { getActiveProvider } from "@/lib/llm/factory";
import { cosineSimilarity } from "@/lib/llm/types";
import { atomicWriteJson, createMicroNotes, resolveCrystal, searchManifestEmbeddings } from "@/lib/manifestation";
import type {
  GwCrystalPoolActionDefinition,
  GwCrystalPoolActionId,
  GwCrystalPoolActionResponse,
  GwCrystalPoolListItem,
  GwCrystalPoolVisualizationPoint,
  GwMmssComparisonRow,
} from "@/types/gw-collapser-pool";

type JsonRecord = Record<string, any>;
type CrystalRecord = Awaited<ReturnType<typeof resolveCrystal>>;

export const GW_CRYSTAL_POOL_ACTIONS: GwCrystalPoolActionDefinition[] = [
  { id: "torus_flow", name: "TorusFlow GWCollapser", description: "Recompute torus analysis for selected crystals.", category: "analysis", availability: "ready" },
  { id: "micro_notes", name: "Micro notes", description: "Generate LLM micro-notes for selected crystals.", category: "generation", availability: "ready" },
  { id: "manifest_donors", name: "Manifest donors", description: "Reveal major donor relationships for the selected crystals.", category: "analysis", availability: "ready" },
  { id: "diffuse_manual", name: "Diffuse manual", description: "Manual coordinate adjustments for selected crystals.", category: "manual", availability: "ready" },
  { id: "fill_missing", name: "Заполнение полей", description: "Fill missing descriptive fields with rules or LLM assistance.", category: "generation", availability: "ready" },
  { id: "detect_emeralds", name: "Выявление изумрудов", description: "Detect outliers and candidate emeralds in the selected set.", category: "analysis", availability: "scaffold" },
  { id: "refine_metrics", name: "Уточнение метрик", description: "Recompute MMSS metrics in the context of the selected pool.", category: "analysis", availability: "ready" },
  { id: "translation", name: "Расшифровка", description: "Generate or refine interpretation text for selected crystals.", category: "generation", availability: "ready" },
  { id: "mmss_real_data", name: "MMSS real-data gate", description: "Run real-data MMSS checks for selected crystals.", category: "analysis", availability: "ready" },
  { id: "evolve_trajectory", name: "Эволюция траектории", description: "Simulate trajectory evolution across multiple torus runs.", category: "visualization", availability: "scaffold" },
  { id: "cluster_formulas", name: "Кластер формул", description: "Cluster selected crystals by formula semantics.", category: "visualization", availability: "scaffold" },
  { id: "generate_report", name: "Отчёт по пулу", description: "Build a compact report for the selected crystal pool.", category: "generation", availability: "scaffold" },
  { id: "compare_mmss", name: "Сравнение MMSS", description: "Compare MMSS profiles for the selected crystals.", category: "visualization", availability: "ready" },
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
  if (!action) throw new Error(`Unknown crystal pool action: ${actionId}`);

  const ids = [...new Set(crystalIds.map((item) => item.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Crystal pool action requires at least one crystal id");

  switch (actionId) {
    case "torus_flow":
      return runTorusFlowAction(ids, params);
    case "micro_notes":
      return runMicroNotesAction(ids, params);
    case "manifest_donors":
      return runManifestDonorsAction(ids, params);
    case "diffuse_manual":
      return runDiffuseManualAction(ids, params);
    case "fill_missing":
      return runFillMissingAction(ids, params);
    case "detect_emeralds":
      return runDetectEmeraldsAction(ids);
    case "refine_metrics":
      return runRefineMetricsAction(ids, params);
    case "translation":
      return runTranslationAction(ids, params);
    case "mmss_real_data":
      return runMmssRealDataAction(ids);
    case "evolve_trajectory":
      return runEvolveTrajectoryAction(ids);
    case "cluster_formulas":
      return runClusterFormulasAction(ids);
    case "generate_report":
      return runGenerateReportAction(ids);
    case "compare_mmss":
      return runCompareMmssAction(ids);
    case "semantic_twins":
      return runSemanticTwinsAction(ids, params);
    case "auto_annotation":
      return runAutoAnnotationAction(ids, params);
    default:
      throw new Error(`Action is not wired yet: ${actionId}`);
  }
}

export async function buildCrystalPoolVisualization(crystalIds: string[], limit = 100) {
  const ids = [...new Set(crystalIds.map((item) => item.trim()).filter(Boolean))];
  const points: GwCrystalPoolVisualizationPoint[] = [];
  let torus = { R: 1.2, r: 0.6 };
  const coordinateGroups = new Map<string, number[]>();

  for (const id of ids) {
    const crystal = await db.crystal.findUnique({ where: { id } });
    if (!crystal?.filepath) continue;
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    if (!persisted?.analysis) continue;

    torus = { R: persisted.analysis.torus.R, r: persisted.analysis.torus.r };
    const combinationDocs = persisted.analysis.docs.filter((doc) =>
      doc.id === "crystal-combination" || doc.id === "row-combination" || doc.sourcePath?.includes("combination"),
    );
    const docs = combinationDocs.length ? combinationDocs : persisted.analysis.docs.slice(0, 1);

    for (const doc of docs) {
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
      const pointIndex = points.length - 1;
      const key = `${doc.torus.x.toFixed(6)}:${doc.torus.y.toFixed(6)}`;
      const group = coordinateGroups.get(key) ?? [];
      group.push(pointIndex);
      coordinateGroups.set(key, group);
    }
    if (points.length >= limit) break;
  }

  spreadVisualizationPoints(points, coordinateGroups);

  return {
    ok: true,
    total: points.length,
    limit,
    torus,
    points,
  };
}

function spreadVisualizationPoints(
  points: GwCrystalPoolVisualizationPoint[],
  coordinateGroups: Map<string, number[]>,
) {
  for (const indexes of coordinateGroups.values()) {
    if (indexes.length <= 1) continue;
    const radiusX = 0.28;
    const radiusY = 0.18;
    const step = (Math.PI * 2) / indexes.length;

    indexes.forEach((pointIndex, order) => {
      const point = points[pointIndex];
      const angle = step * order + crystalHashPhase(point.crystalCode);
      point.x += Math.cos(angle) * radiusX;
      point.y += Math.sin(angle) * radiusY;
      point.cluster = order;
    });
  }
}

function crystalHashPhase(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 360) * (Math.PI / 180);
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
      ...(params.document_mode === "full" ? { document_mode: "full" as const } : { document_mode: "combination_only" as const }),
    });

    results.push({
      id: analysis.crystal_id,
      code: analysis.crystal_code,
      status: "updated",
      summary: `Updated torus snapshot with ${analysis.docs.length} docs and ${analysis.top_docs.length} top docs.`,
      data: {
        stored_at: analysis.stored_at,
        query: analysis.query,
        docs_count: analysis.docs.length,
        document_mode: params.document_mode === "full" ? "full" : "combination_only",
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
  const codeToDbId = new Map<string, string>();
  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    codeToDbId.set(crystal.code, crystal.dbId);
  }
  const temperature = params.temperature !== undefined ? Number(params.temperature) : undefined;
  const mergedResults: Array<{ id: string; note: string }> = [];

  for (let index = 0; index < ids.length; index += 10) {
    const response = await createMicroNotes({
      crystal_ids: ids.slice(index, index + 10),
      ...(temperature !== undefined ? { temperature } : {}),
    });
    mergedResults.push(...response.results);
  }

  return {
    ok: true,
    action: "micro_notes",
    actionName: "Micro notes",
    availability: "ready",
    affectedCount: mergedResults.length,
    results: mergedResults.map((item) => ({
      id: codeToDbId.get(item.id) ?? item.id,
      code: item.id,
      status: "updated",
      summary: item.note,
      data: { micro_note: item.note },
    })),
  };
}

async function runManifestDonorsAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const { provider, settings } = await getActiveProvider();
  const rows = await Promise.all(ids.map((id) => resolveCrystal(id)));
  const embeddings = new Map<string, number[]>();

  for (const row of rows) {
    const text = crystalCombination(row);
    embeddings.set(row.code, await provider.embed(text, settings.embedModel));
  }

  const donorCount = Math.min(5, Math.max(2, Number(params.limit ?? 3)));
  const results: GwCrystalPoolActionResponse["results"] = rows.map((row) => {
    const source = embeddings.get(row.code) ?? [];
    const donors = rows
      .filter((other) => other.code !== row.code)
      .map((other) => ({
        code: other.code,
        similarity: cosineSimilarity(source, embeddings.get(other.code) ?? []),
        combination: crystalCombination(other),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, donorCount);

    return {
      id: row.dbId,
      code: row.code,
      status: "computed",
      summary: donors.length ? `Top donor: ${donors[0].code}` : "No donor candidates found.",
      data: { donors },
    };
  });

  return {
    ok: true,
    action: "manifest_donors",
    actionName: "Manifest donors",
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
      `Fill only the missing fields for this crystal and return strict JSON with keys pattern, category, auto_tags.\nCrystal:\n${JSON.stringify(json, null, 2)}\nMissing:\n${JSON.stringify(missing, null, 2)}`,
      `Return only JSON:\n{"pattern":"string or empty","category":"string or empty","auto_tags":["tag1","tag2"]}`,
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

    atomicWriteJson(crystal.filepath, json);
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

async function runRefineMetricsAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];

  for (const id of ids) {
    try {
      const analysis = await runTorusAnalysisForCrystal(id, {
        ...(params.document_mode === "full" ? { document_mode: "full" as const } : { document_mode: "combination_only" as const }),
        ...(params.n_clusters !== undefined ? { n_clusters: Number(params.n_clusters) } : {}),
        ...(params.max_steps !== undefined ? { max_steps: Number(params.max_steps) } : {}),
        ...(params.dt !== undefined ? { dt: Number(params.dt) } : {}),
        ...(params.friction !== undefined ? { friction: Number(params.friction) } : {}),
        ...(params.epsilon !== undefined ? { epsilon: Number(params.epsilon) } : {}),
        ...(params.tol_speed !== undefined ? { tol_speed: Number(params.tol_speed) } : {}),
        ...(params.geometry_R !== undefined ? { geometry_R: Number(params.geometry_R) } : {}),
        ...(params.geometry_r !== undefined ? { geometry_r: Number(params.geometry_r) } : {}),
      });

      results.push({
        id: analysis.crystal_id,
        code: analysis.crystal_code,
        status: "updated",
        summary: `Recomputed MMSS profile. Q=${analysis.mmss.Q.toFixed(3)}`,
        data: {
          ...analysis.mmss,
          document_mode: params.document_mode === "full" ? "full" : "combination_only",
        },
      });
    } catch (error) {
      const crystal = await resolveCrystal(id);
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped",
        summary: `Failed to recompute MMSS: ${(error as Error).message}`,
        data: null,
      });
    }
  }

  return {
    ok: true,
    action: "refine_metrics",
    actionName: "Уточнение метрик",
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
    try {
      const json = crystal.json;
      const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
      const context = {
        code: crystal.code,
        combination: crystalCombination(crystal),
        focus: json?.crystal?.focus ?? null,
        pattern: json?.crystal?.pattern ?? null,
        top_docs: persisted?.analysis?.top_docs?.slice(0, 5) ?? [],
      };

      const payload = await callCrystalLlmJson(
        `Generate a short Russian interpretation for this crystal from its structure and nearby torus fragments.\nContext:\n${JSON.stringify(context, null, 2)}`,
        `Return only JSON:\n{"translation":"2-4 sentences, no markdown"}`,
        temperature,
      );

      json.translation = readStringField(payload, "translation");
      atomicWriteJson(crystal.filepath, json);
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "updated",
        summary: json.translation || "Translation updated.",
        data: { translation: json.translation },
      });
    } catch (error) {
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped",
        summary: `Translation failed: ${(error as Error).message}`,
        data: null,
      });
    }
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

async function runCompareMmssAction(ids: string[]): Promise<GwCrystalPoolActionResponse> {
  const comparison: GwMmssComparisonRow[] = [];
  const results: GwCrystalPoolActionResponse["results"] = [];

  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    if (!persisted?.analysis) {
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped",
        summary: "Skipped because no persisted torus analysis exists.",
        data: null,
      });
      continue;
    }

    const mmss = persisted.analysis.mmss;
    comparison.push({
      crystalId: persisted.analysis.crystal_id,
      crystalCode: persisted.analysis.crystal_code,
      ...mmss,
    });
    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: "computed",
      summary: `Q=${mmss.Q.toFixed(3)}, CHSH=${mmss.CHSH.toFixed(3)}`,
      data: { ...mmss },
    });
  }

  return {
    ok: true,
    action: "compare_mmss",
    actionName: "Сравнение MMSS",
    availability: "ready",
    affectedCount: results.length,
    results,
    extra: {
      comparison,
      maxQ: comparison.length ? Math.max(...comparison.map((row) => row.Q)) : 0,
    },
  };
}

async function runSemanticTwinsAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const selectedCodes = new Set<string>();
  const selected: CrystalRecord[] = [];

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
      crystalCombination(crystal);

    if (!query) {
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped",
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
      status: "computed",
      summary: twins.length
        ? `Found ${twins.length} semantic twins for ${crystal.code}.`
        : `No external semantic twins found for ${crystal.code}.`,
      data: { query, twins },
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
    try {
      const json = crystal.json;
      const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
      const context = {
        code: crystal.code,
        micro_note: json?.llm_micro_note ?? null,
        vector_direction: json?.vector_direction ?? null,
        translation: json?.translation ?? null,
        top_docs: persisted?.analysis?.top_docs?.slice(0, 3) ?? [],
        mmss: persisted?.analysis?.mmss ?? null,
      };

      const payload = await callCrystalLlmJson(
        `Generate a short technical annotation for this crystal from torus neighborhood and metadata.\nContext:\n${JSON.stringify(context, null, 2)}`,
        `Return only JSON:\n{"auto_annotation":"2-5 sentences"}`,
        temperature,
      );

      json.auto_annotation = readStringField(payload, "auto_annotation");
      atomicWriteJson(crystal.filepath, json);
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "updated",
        summary: json.auto_annotation || "Auto-annotation updated.",
        data: { auto_annotation: json.auto_annotation },
      });
    } catch (error) {
      results.push({
        id: crystal.dbId,
        code: crystal.code,
        status: "skipped",
        summary: `Auto-annotation failed: ${(error as Error).message}`,
        data: null,
      });
    }
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

async function runDetectEmeraldsAction(ids: string[]): Promise<GwCrystalPoolActionResponse> {
  const comparison: Array<{ crystalId: string; crystalCode: string; qScore: number; complexity: number; emeraldScore: number }> = [];
  const results: GwCrystalPoolActionResponse["results"] = [];

  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const qScore = Number(crystal.json?.crystal?.quality_score ?? crystal.json?.quality_score ?? 0);
    const complexity = Number(crystal.json?.complexity ?? crystal.json?.meta?.complexity ?? 0);
    const emeraldScore = qScore * 0.7 + complexity * 0.3;
    comparison.push({ crystalId: crystal.dbId, crystalCode: crystal.code, qScore, complexity, emeraldScore });
  }

  const ranked = [...comparison].sort((a, b) => b.emeraldScore - a.emeraldScore);
  for (const row of ranked) {
    results.push({
      id: row.crystalId,
      code: row.crystalCode,
      status: "computed",
      summary: `Emerald score ${row.emeraldScore.toFixed(3)}`,
      data: row,
    });
  }

  return {
    ok: true,
    action: "detect_emeralds",
    actionName: "Р’С‹СЏРІР»РµРЅРёРµ РёР·СѓРјСЂСѓРґРѕРІ",
    availability: "ready",
    affectedCount: results.length,
    results,
    extra: {
      topEmerald: ranked[0] ?? null,
    },
  };
}

async function runMmssRealDataAction(ids: string[]): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];

  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    const mmss = persisted?.analysis?.mmss;
    const passed = Boolean(mmss && Number.isFinite(mmss.Q) && mmss.Q > 0);
    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: passed ? "computed" : "skipped",
      summary: passed ? `MMSS gate passed. Q=${mmss!.Q.toFixed(3)}` : "No persisted MMSS payload available.",
      data: mmss ? { ...mmss, gate_passed: passed } : null,
    });
  }

  return {
    ok: true,
    action: "mmss_real_data",
    actionName: "MMSS real-data gate",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runEvolveTrajectoryAction(ids: string[]): Promise<GwCrystalPoolActionResponse> {
  const results: GwCrystalPoolActionResponse["results"] = [];

  for (const id of ids) {
    const crystal = await resolveCrystal(id);
    const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
    const history = persisted?.analysis?.flow?.history ?? [];
    const start = history[0] ?? persisted?.analysis?.flow?.start ?? [0, 0];
    const final = history[history.length - 1] ?? persisted?.analysis?.flow?.final ?? [0, 0];
    const displacement = Math.hypot(Number(final[0] ?? 0) - Number(start[0] ?? 0), Number(final[1] ?? 0) - Number(start[1] ?? 0));

    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: history.length ? "computed" : "skipped",
      summary: history.length ? `Trajectory length ${history.length}, displacement ${displacement.toFixed(3)}` : "No persisted trajectory history available.",
      data: history.length ? { steps: history.length, start, final, displacement } : null,
    });
  }

  return {
    ok: true,
    action: "evolve_trajectory",
    actionName: "Р­РІРѕР»СЋС†РёСЏ С‚СЂР°РµРєС‚РѕСЂРёРё",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runClusterFormulasAction(ids: string[]): Promise<GwCrystalPoolActionResponse> {
  const rows = await Promise.all(ids.map((id) => resolveCrystal(id)));
  const results: GwCrystalPoolActionResponse["results"] = rows.map((row, index) => {
    const formula = crystalCombination(row);
    const cluster = Math.max(0, formula.length % 5);
    return {
      id: row.dbId,
      code: row.code,
      status: "computed",
      summary: `Assigned to formula cluster ${cluster}.`,
      data: {
        cluster,
        formula_length: formula.length,
        combination: formula,
      },
    };
  });

  return {
    ok: true,
    action: "cluster_formulas",
    actionName: "РљР»Р°СЃС‚РµСЂ С„РѕСЂРјСѓР»",
    availability: "ready",
    affectedCount: results.length,
    results,
  };
}

async function runGenerateReportAction(ids: string[]): Promise<GwCrystalPoolActionResponse> {
  const rows = await Promise.all(ids.map((id) => resolveCrystal(id)));
  const reportRows = rows.map((row) => {
    const persisted = readPersistedTorusAnalysisResult(row.filepath);
    return {
      code: row.code,
      pattern: row.json?.crystal?.pattern ?? null,
      has_micro_note: Boolean(row.json?.llm_micro_note),
      has_translation: Boolean(row.json?.translation),
      has_auto_annotation: Boolean(row.json?.auto_annotation),
      has_torus: Boolean(persisted?.analysis),
      q: persisted?.analysis?.mmss?.Q ?? null,
    };
  });

  return {
    ok: true,
    action: "generate_report",
    actionName: "РћС‚С‡С‘С‚ РїРѕ РїСѓР»Сѓ",
    availability: "ready",
    affectedCount: rows.length,
    results: rows.map((row) => ({
      id: row.dbId,
      code: row.code,
      status: "computed",
      summary: `Included in pool report for ${row.code}.`,
      data: null,
    })),
    extra: {
      crystals: reportRows,
      totals: {
        count: reportRows.length,
        with_torus: reportRows.filter((item) => item.has_torus).length,
        with_micro_notes: reportRows.filter((item) => item.has_micro_note).length,
      },
    },
  };
}

async function runDiffuseManualAction(ids: string[], params: Record<string, unknown>): Promise<GwCrystalPoolActionResponse> {
  const dx = Number(params.dx ?? 0.12);
  const dy = Number(params.dy ?? 0.08);
  const results: GwCrystalPoolActionResponse["results"] = [];

  for (let index = 0; index < ids.length; index += 1) {
    const crystal = await resolveCrystal(ids[index]);
    results.push({
      id: crystal.dbId,
      code: crystal.code,
      status: "computed",
      summary: `Prepared manual offset for ${crystal.code}.`,
      data: {
        offset_x: Number((index + 1) * dx).toFixed(3),
        offset_y: Number((index + 1) * dy).toFixed(3),
      },
    });
  }

  return {
    ok: true,
    action: "diffuse_manual",
    actionName: "Diffuse manual",
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

function crystalCombination(crystal: CrystalRecord) {
  return String(crystal.json?.crystal?.combination ?? crystal.json?.combination ?? "").trim();
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

function readStringField(payload: unknown, key: string) {
  if (payload && typeof payload === "object" && typeof (payload as JsonRecord)[key] === "string") {
    return String((payload as JsonRecord)[key]).trim();
  }
  if (typeof payload === "string") {
    return payload.trim();
  }
  if (Array.isArray(payload)) {
    const value = payload.find((item) => typeof item === "string");
    if (typeof value === "string") return value.trim();
  }
  throw new Error(`LLM payload has no string field "${key}"`);
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return extractJson(fenced[1]);
  }
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
