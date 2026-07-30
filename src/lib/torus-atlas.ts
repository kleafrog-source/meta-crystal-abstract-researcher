import { db } from "@/lib/db";
import { callSidecar } from "@/lib/engine/runner";

type JsonRecord = Record<string, any>;
const FULL_REBUILD_SETTING_KEY = "torus_atlas_full_rebuild_job";
const ATLAS_NEUTRAL_QUERY = "__combination_only_atlas__";

export interface TorusAtlasRebuildOptions {
  crystalIds?: string[];
  n_clusters?: number;
  dt?: number;
  friction?: number;
  epsilon?: number;
  max_steps?: number;
  tol_speed?: number;
  geometry_R?: number;
  geometry_r?: number;
  embedding_model?: string;
  batch_size?: number;
}

export interface TorusAtlasRebuildResult {
  ok: true;
  scope: "all" | "selected";
  total: number;
  layoutKey: string;
  storedAt: string;
  clusters: number;
  torus: {
    R: number;
    r: number;
  };
  results: Array<{
    id: string;
    code: string;
    clusterLabel: number;
    torusU: number;
    torusV: number;
    torusX: number;
    torusY: number;
    torusZ: number;
  }>;
}

export interface TorusAtlasFullRebuildJob {
  id: string;
  status: "idle" | "preparing" | "analyzing" | "persisting" | "completed" | "failed";
  total: number;
  processed: number;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  layoutKey: string;
  clusters: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string;
  error: string;
  phaseMessage: string;
}

export interface TorusAtlasDiagnosticResult {
  ok: true;
  total: number;
  uniqueCombinations: number;
  duplicateCombinations: number;
  clustersRequested: number;
  uniqueLabels: number;
  labelHistogram: Array<{
    label: number;
    count: number;
  }>;
  docsWithCoords: number;
  docsWithoutCoords: number;
  layoutPreview: Array<{
    id: string;
    code: string;
    formula: string;
    clusterLabel: number;
    torusU: number;
    torusV: number;
  }>;
  rawShape: {
    hasDocs: boolean;
    hasDocCoords: boolean;
    hasLabels: boolean;
    docsLength: number;
    docCoordsLength: number;
    labelsLength: number;
  };
}

export async function rebuildGlobalTorusAtlas(
  options: TorusAtlasRebuildOptions = {},
): Promise<TorusAtlasRebuildResult> {
  const ids = normalizeIds(options.crystalIds);
  const rows = await loadAtlasRows(ids);
  if (!rows.length) throw new Error("No crystals found for atlas rebuild.");
  const parameters = buildAtlasParameters(rows.length, options);
  const scope = ids.length ? "selected" : "all";
  const analysis = await analyzeAtlasRows(rows, parameters, scope);
  await persistAtlasResults(analysis.results);

  return {
    ok: true,
    scope,
    total: rows.length,
    layoutKey: analysis.layoutKey,
    storedAt: analysis.storedAt,
    clusters: parameters.n_clusters,
    torus: {
      R: parameters.geometry_R,
      r: parameters.geometry_r,
    },
    results: analysis.results,
  };
}

export async function getFullTorusAtlasRebuildJob(): Promise<TorusAtlasFullRebuildJob> {
  const setting = await db.setting.findUnique({ where: { key: FULL_REBUILD_SETTING_KEY } });
  return parseFullJob(setting?.value ?? null);
}

export async function startFullTorusAtlasRebuild(
  options: TorusAtlasRebuildOptions = {},
): Promise<TorusAtlasFullRebuildJob> {
  const current = await getFullTorusAtlasRebuildJob();
  if (["preparing", "analyzing", "persisting"].includes(current.status)) {
    throw new Error("A full atlas rebuild is already running.");
  }

  const total = await db.crystal.count();
  if (!total) throw new Error("No crystals found for full atlas rebuild.");

  const parameters = buildAtlasParameters(total, options);
  const now = new Date().toISOString();
  const job: TorusAtlasFullRebuildJob = {
    id: `full-atlas-${Date.now()}`,
    status: "preparing",
    total,
    processed: 0,
    batchSize: Math.max(50, Math.min(500, Math.trunc(options.batch_size ?? 200))),
    currentBatch: 0,
    totalBatches: 0,
    layoutKey: "",
    clusters: parameters.n_clusters,
    startedAt: now,
    updatedAt: now,
    completedAt: "",
    error: "",
    phaseMessage: "Collecting crystals for the shared atlas run.",
  };

  await saveFullJob(job);
  void runFullTorusAtlasRebuild(job.id, parameters, job.batchSize);
  return job;
}

export async function diagnoseTorusAtlasSlice(
  options: TorusAtlasRebuildOptions = {},
): Promise<TorusAtlasDiagnosticResult> {
  const ids = normalizeIds(options.crystalIds);
  const rows = await loadAtlasRows(ids);
  if (!rows.length) {
    throw new Error("No crystals found for atlas diagnostics.");
  }

  const parameters = buildAtlasParameters(rows.length, options);
  const docs = rows.map((row) => row.combination);
  const uniqueCombinations = new Set(docs).size;
  const { result } = await callSidecar<JsonRecord>("torus_analyze", {
    inputFile: {
      docs,
      query: ATLAS_NEUTRAL_QUERY,
      ...parameters,
    },
    taskType: "torus_analyze",
    title: `Atlas diagnostic: ${rows.length} crystals`,
    timeoutMs: 15 * 60 * 1000,
  });

  const payload = result as JsonRecord;
  const payloadDocs = Array.isArray(payload.docs) ? payload.docs : [];
  const payloadDocCoords =
    Array.isArray(payload.doc_coords) && payload.doc_coords.length
      ? payload.doc_coords
      : Array.isArray(payloadDocs)
        ? payloadDocs.map((item) => (item && typeof item === "object" ? [(item as JsonRecord).x, (item as JsonRecord).y] : null))
        : [];
  const payloadLabels = Array.isArray(payload.labels) ? payload.labels : [];
  const histogramMap = new Map<number, number>();

  payloadLabels.forEach((label) => {
    const value = Number(label ?? 0);
    histogramMap.set(value, (histogramMap.get(value) ?? 0) + 1);
  });

  const labelHistogram = [...histogramMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label - b.label);

  const layoutPreview = rows.slice(0, 12).map((row, index) => {
    const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
    return {
      id: row.id,
      code: row.code,
      formula: row.combination,
      clusterLabel: Number(payloadLabels[index] ?? 0),
      torusU: Number(coord[0] ?? 0),
      torusV: Number(coord[1] ?? 0),
    };
  });

  return {
    ok: true,
    total: rows.length,
    uniqueCombinations,
    duplicateCombinations: rows.length - uniqueCombinations,
    clustersRequested: parameters.n_clusters,
    uniqueLabels: labelHistogram.length,
    labelHistogram,
    docsWithCoords: payloadDocCoords.filter((item) => Array.isArray(item) && item.length >= 2).length,
    docsWithoutCoords: rows.length - payloadDocCoords.filter((item) => Array.isArray(item) && item.length >= 2).length,
    layoutPreview,
    rawShape: {
      hasDocs: Array.isArray(payload.docs),
      hasDocCoords: Array.isArray(payload.doc_coords),
      hasLabels: Array.isArray(payload.labels),
      docsLength: payloadDocs.length,
      docCoordsLength: payloadDocCoords.length,
      labelsLength: payloadLabels.length,
    },
  };
}

async function runFullTorusAtlasRebuild(jobId: string, parameters: ReturnType<typeof buildAtlasParameters>, batchSize: number) {
  try {
    const rows = await loadAtlasRows([]);
    await updateFullJob(jobId, {
      status: "analyzing",
      total: rows.length,
      phaseMessage: `Running one shared torus analysis for ${rows.length} crystals.`,
    });

    const analysis = await analyzeAtlasRows(rows, parameters, "all");
    const totalBatches = Math.max(1, Math.ceil(analysis.results.length / batchSize));
    await updateFullJob(jobId, {
      status: "persisting",
      layoutKey: analysis.layoutKey,
      currentBatch: 0,
      totalBatches,
      phaseMessage: "Persisting atlas coordinates back into crystal metadata.",
    });

    await persistAtlasResults(analysis.results, batchSize, async (processed, currentBatch) => {
      await updateFullJob(jobId, {
        processed,
        currentBatch,
        totalBatches,
        layoutKey: analysis.layoutKey,
        phaseMessage: `Persisted ${processed} of ${analysis.results.length} crystals.`,
      });
    });

    await updateFullJob(jobId, {
      status: "completed",
      processed: analysis.results.length,
      currentBatch: totalBatches,
      totalBatches,
      layoutKey: analysis.layoutKey,
      completedAt: new Date().toISOString(),
      phaseMessage: "Full atlas rebuild completed.",
    });
  } catch (error) {
    await updateFullJob(jobId, {
      status: "failed",
      error: (error as Error).message,
      completedAt: new Date().toISOString(),
      phaseMessage: "Full atlas rebuild failed.",
    });
  }
}

async function loadAtlasRows(ids: string[]) {
  return db.crystal.findMany({
    where: ids.length ? { id: { in: ids } } : {},
    orderBy: { counter: "desc" },
    select: {
      id: true,
      code: true,
      combination: true,
      metadataJson: true,
    },
  });
}

function buildAtlasParameters(total: number, options: TorusAtlasRebuildOptions) {
  return {
    n_clusters: options.n_clusters ?? inferClusterCount(total),
    dt: options.dt ?? 0.02,
    friction: options.friction ?? 0.01,
    epsilon: options.epsilon ?? 0.15,
    max_steps: options.max_steps ?? 100,
    tol_speed: options.tol_speed ?? 1e-3,
    geometry_R: options.geometry_R ?? 1.2,
    geometry_r: options.geometry_r ?? 0.6,
    ...(options.embedding_model ? { embedding_model: options.embedding_model } : {}),
  };
}

async function analyzeAtlasRows(
  rows: Array<{ id: string; code: string; combination: string; metadataJson: string | null }>,
  parameters: ReturnType<typeof buildAtlasParameters>,
  scope: "all" | "selected",
) {
  const docs = rows.map((row) => row.combination);
  const storedAt = new Date().toISOString();
  const layoutKey = `atlas:${storedAt}:${rows.length}:${parameters.n_clusters}`;
  const { result } = await callSidecar<JsonRecord>("torus_analyze", {
    inputFile: {
      docs,
      query: ATLAS_NEUTRAL_QUERY,
      ...parameters,
    },
    taskType: "torus_analyze",
    title: `Global torus atlas: ${rows.length} crystals`,
    timeoutMs: 30 * 60 * 1000,
  });
  return {
    layoutKey,
    storedAt,
    results: mapAnalysisToAtlasResults(rows, result as JsonRecord, parameters, scope, storedAt, layoutKey),
  };
}

function mapAnalysisToAtlasResults(
  rows: Array<{ id: string; code: string; combination: string; metadataJson: string | null }>,
  payload: JsonRecord,
  parameters: ReturnType<typeof buildAtlasParameters>,
  scope: "all" | "selected",
  storedAt: string,
  layoutKey: string,
) {
  const payloadDocs = Array.isArray(payload.docs) ? payload.docs : [];
  const payloadDocCoords =
    Array.isArray(payload.doc_coords) && payload.doc_coords.length
      ? payload.doc_coords
      : Array.isArray(payloadDocs)
        ? payloadDocs.map((item) => (item && typeof item === "object" ? [(item as JsonRecord).x, (item as JsonRecord).y] : null))
        : [];
  const payloadLabels = Array.isArray(payload.labels) ? payload.labels : [];

  return rows.map((row, index) => {
    const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
    const torusU = Number(coord[0] ?? 0);
    const torusV = Number(coord[1] ?? 0);
    const clusterLabel = Number(payloadLabels[index] ?? 0);
    const point3d = torusParam(torusU, torusV, parameters.geometry_R, parameters.geometry_r, 0);
    const metadata = safeParseRecord(row.metadataJson);
    metadata.torusAtlas = {
      layoutKey,
      scope,
      layoutSize: rows.length,
      documentMode: "combination_only",
      storedAt,
      geometryR: parameters.geometry_R,
      geometryr: parameters.geometry_r,
      clusterLabel,
      torusU,
      torusV,
      torusX: point3d.x,
      torusY: point3d.y,
      torusZ: point3d.z,
    };
    metadata.clusterLabel = clusterLabel;
    metadata.torusX = point3d.x;
    metadata.torusY = point3d.y;
    metadata.torusZ = point3d.z;
    return {
      id: row.id,
      code: row.code,
      clusterLabel,
      torusU,
      torusV,
      torusX: point3d.x,
      torusY: point3d.y,
      torusZ: point3d.z,
      metadataJson: JSON.stringify(metadata),
    };
  });
}

async function persistAtlasResults(
  results: Array<TorusAtlasRebuildResult["results"][number] & { metadataJson: string }>,
  batchSize = results.length,
  onProgress?: (processed: number, currentBatch: number) => Promise<void> | void,
) {
  if (!results.length) return;
  const size = Math.max(1, batchSize);
  let processed = 0;
  let currentBatch = 0;
  for (let index = 0; index < results.length; index += size) {
    currentBatch += 1;
    const batch = results.slice(index, index + size);
    await Promise.all(batch.map((item) => db.crystal.update({
      where: { id: item.id },
      data: { metadataJson: item.metadataJson },
    })));
    processed += batch.length;
    await onProgress?.(processed, currentBatch);
  }
}

function normalizeIds(ids?: string[]) {
  return [...new Set((ids ?? []).map((item) => item.trim()).filter(Boolean))];
}

async function saveFullJob(job: TorusAtlasFullRebuildJob) {
  await db.setting.upsert({
    where: { key: FULL_REBUILD_SETTING_KEY },
    update: { value: JSON.stringify(job) },
    create: { key: FULL_REBUILD_SETTING_KEY, value: JSON.stringify(job) },
  });
}

async function updateFullJob(jobId: string, patch: Partial<TorusAtlasFullRebuildJob>) {
  const current = await getFullTorusAtlasRebuildJob();
  if (current.id !== jobId) return;
  await saveFullJob({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function parseFullJob(value: string | null): TorusAtlasFullRebuildJob {
  if (!value) {
    return {
      id: "",
      status: "idle",
      total: 0,
      processed: 0,
      batchSize: 0,
      currentBatch: 0,
      totalBatches: 0,
      layoutKey: "",
      clusters: 0,
      startedAt: "",
      updatedAt: "",
      completedAt: "",
      error: "",
      phaseMessage: "",
    };
  }
  try {
    const parsed = JSON.parse(value) as Partial<TorusAtlasFullRebuildJob>;
    return {
      id: typeof parsed.id === "string" ? parsed.id : "",
      status: parsed.status ?? "idle",
      total: Number(parsed.total ?? 0),
      processed: Number(parsed.processed ?? 0),
      batchSize: Number(parsed.batchSize ?? 0),
      currentBatch: Number(parsed.currentBatch ?? 0),
      totalBatches: Number(parsed.totalBatches ?? 0),
      layoutKey: typeof parsed.layoutKey === "string" ? parsed.layoutKey : "",
      clusters: Number(parsed.clusters ?? 0),
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : "",
      error: typeof parsed.error === "string" ? parsed.error : "",
      phaseMessage: typeof parsed.phaseMessage === "string" ? parsed.phaseMessage : "",
    };
  } catch {
    return {
      id: "",
      status: "idle",
      total: 0,
      processed: 0,
      batchSize: 0,
      currentBatch: 0,
      totalBatches: 0,
      layoutKey: "",
      clusters: 0,
      startedAt: "",
      updatedAt: "",
      completedAt: "",
      error: "",
      phaseMessage: "",
    };
  }
}

function inferClusterCount(total: number) {
  if (total <= 50) return 8;
  if (total <= 150) return 12;
  if (total <= 300) return 16;
  if (total <= 600) return 24;
  if (total <= 1200) return 32;
  if (total <= 2400) return 48;
  return 64;
}

function torusParam(u: number, v: number, R: number, r: number, twist: number) {
  const vt = v + twist * u;
  const cv = Math.cos(vt);
  const sv = Math.sin(vt);
  const cu = Math.cos(u);
  const su = Math.sin(u);
  return {
    x: (R + r * cv) * cu,
    y: (R + r * cv) * su,
    z: r * sv,
  };
}

function safeParseRecord(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}
