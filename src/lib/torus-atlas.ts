import { db } from "@/lib/db";
import { callSidecar, type SidecarEvent } from "@/lib/engine/runner";
import { getActiveProvider } from "@/lib/llm/factory";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

type JsonRecord = Record<string, any>;
const FULL_REBUILD_SETTING_KEY = "torus_atlas_full_rebuild_job";
const ATLAS_NEUTRAL_QUERY = "__combination_only_atlas__";
const ATLAS_JOB_ROOT = join(process.cwd(), "data", "torus_atlas", "jobs");
const FULL_REBUILD_BATCH_SIZE = 50;
const WORKING_SETS_SETTING_KEY = "torus_atlas_working_sets";
const FULL_ATLAS_ANALYZE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const globalForTorusAtlas = globalThis as unknown as {
  __torusAtlasActiveJobs?: Set<string>;
};
const ACTIVE_FULL_REBUILD_JOBS =
  globalForTorusAtlas.__torusAtlasActiveJobs ?? new Set<string>();
if (!globalForTorusAtlas.__torusAtlasActiveJobs) {
  globalForTorusAtlas.__torusAtlasActiveJobs = ACTIVE_FULL_REBUILD_JOBS;
}

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
  status: "idle" | "preparing" | "analyzing" | "analysis_ready" | "persisting" | "paused" | "completed" | "failed";
  total: number;
  processed: number;
  analysisProcessed: number;
  analysisPercent: number;
  analysisStep: string;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  layoutKey: string;
  clusters: number;
  nextOffset: number;
  snapshotReady: boolean;
  paramsJson: string;
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
  uniqueTorusLabels: number;
  labelHistogram: Array<{
    label: number;
    count: number;
  }>;
  torusLabelHistogram: Array<{
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
    torusClusterLabel: number;
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
  await persistAtlasResults(
    analysis.results,
    Math.min(25, Math.max(1, Number(options.batch_size ?? 25))),
  );

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
  const fallback = parseFullJob(setting?.value ?? null);
  if (!fallback.id) return fallback;
  const fromFile = await readJobFile(fallback.id);
  if (fromFile) {
    const recovered = await recoverInactiveFullRebuildJob(fromFile);
    return recovered;
  }
  return resetMissingFullRebuildJob(fallback);
}

export async function startFullTorusAtlasRebuild(
  options: TorusAtlasRebuildOptions = {},
): Promise<TorusAtlasFullRebuildJob> {
  const current = await getFullTorusAtlasRebuildJob();
  if (["preparing", "analyzing", "analysis_ready", "persisting"].includes(current.status)) {
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
    analysisProcessed: 0,
    analysisPercent: 0,
    analysisStep: "Queued",
    batchSize: Math.max(1, Number(options.batch_size ?? FULL_REBUILD_BATCH_SIZE)),
    currentBatch: 0,
    totalBatches: 0,
    layoutKey: "",
    clusters: parameters.n_clusters,
    nextOffset: 0,
    snapshotReady: false,
    paramsJson: JSON.stringify(parameters),
    startedAt: now,
    updatedAt: now,
    completedAt: "",
    error: "",
    phaseMessage: "Collecting crystals for the shared atlas run.",
  };

  await saveFullJob(job);
  await appendJobProgress(job.id, "job created");
  trackActiveFullRebuild(job.id, runFullTorusAtlasRebuild(job.id, parameters));
  return job;
}

export async function pauseFullTorusAtlasRebuild() {
  const current = await getFullTorusAtlasRebuildJob();
  if (!current.id) throw new Error("No full atlas rebuild job exists.");
  if (!["preparing", "analyzing", "analysis_ready", "persisting"].includes(current.status)) {
    throw new Error("Current full atlas rebuild is not running.");
  }
  const nextStatus = current.snapshotReady ? "paused" : "failed";
  const nextMessage = current.snapshotReady
    ? "Paused. Resume will continue from the persisted checkpoint."
    : "Paused before snapshot was ready. Restart is required.";
  const updated = await updateFullJob(current.id, {
    status: nextStatus,
    phaseMessage: nextMessage,
  });
  await appendJobProgress(current.id, `job paused with status ${nextStatus}`);
  return updated;
}

export async function resumeFullTorusAtlasRebuild() {
  const current = await getFullTorusAtlasRebuildJob();
  if (!current.id) throw new Error("No full atlas rebuild job exists.");
  if (!["paused", "analysis_ready", "failed"].includes(current.status)) {
    throw new Error("Current full atlas rebuild cannot be resumed.");
  }
  if (!current.snapshotReady) {
    throw new Error("Checkpoint snapshot is not available. Restart the full rebuild.");
  }
  const snapshot = await readSnapshotFile(current.id);
  if (!snapshot) {
    throw new Error("Snapshot file is missing. Restart the full rebuild.");
  }
  const updated = await updateFullJob(current.id, {
    status: current.nextOffset > 0 ? "persisting" : "analysis_ready",
    phaseMessage: current.nextOffset > 0
      ? `Resuming persist phase from offset ${current.nextOffset}.`
      : "Snapshot is ready for persist phase.",
    error: "",
    completedAt: "",
  });
  await appendJobProgress(current.id, `job resumed from offset ${current.nextOffset}`);
  trackActiveFullRebuild(updated.id, resumePersistFromCheckpoint(updated, snapshot));
  return updated;
}

export async function restartFullTorusAtlasRebuild(
  options: TorusAtlasRebuildOptions = {},
) {
  const current = await getFullTorusAtlasRebuildJob();
  if (current.id) {
    await deleteJobArtifacts(current.id);
  }
  return startFullTorusAtlasRebuild(options);
}

export async function discardFullTorusAtlasCheckpoint() {
  const current = await getFullTorusAtlasRebuildJob();
  if (!current.id) return current;
  await deleteJobArtifacts(current.id);
  const idle = buildIdleJob();
  await db.setting.upsert({
    where: { key: FULL_REBUILD_SETTING_KEY },
    update: { value: JSON.stringify(idle) },
    create: { key: FULL_REBUILD_SETTING_KEY, value: JSON.stringify(idle) },
  });
  return idle;
}

export async function appendNewCrystalsToCurrentAtlas(limit?: number) {
  const current = await getFullTorusAtlasRebuildJob();
  if (!current.id || !current.layoutKey || !current.snapshotReady) {
    throw new Error("No canonical atlas snapshot is available for incremental append. Finish one successful Full Atlas rebuild first.");
  }
  const snapshot = await readSnapshotFile(current.id);
  if (!snapshot) {
    throw new Error("Canonical atlas snapshot file is missing.");
  }

  const rows = await loadAtlasRows([]);
  const existingIds = new Set(snapshot.results.map((item) => item.id));
  const pending = rows.filter((row) => !existingIds.has(row.id)).slice(0, limit ? Math.max(1, limit) : undefined);
  if (!pending.length) {
    return {
      ok: true,
      baseLayoutKey: snapshot.layoutKey,
      appended: 0,
      totalLayoutSize: snapshot.results.length,
    };
  }

  const analysis = await analyzeAtlasRows(pending, snapshot.parameters, "all");
  const totalLayoutSize = snapshot.results.length + analysis.results.length;
  const remapped = analysis.results.map((item) => {
    const metadata = safeParseRecord(item.metadataJson);
    metadata.torusAtlas = {
      ...(metadata.torusAtlas && typeof metadata.torusAtlas === "object" ? metadata.torusAtlas as Record<string, unknown> : {}),
      layoutKey: snapshot.layoutKey,
      layoutSize: totalLayoutSize,
    };
    return {
      ...item,
      metadataJson: JSON.stringify(metadata),
    };
  });
  await persistAtlasResults(remapped);
  snapshot.results.push(...remapped);
  await writeSnapshotFile(current.id, { ...snapshot, results: snapshot.results });
  await appendJobProgress(current.id, `incremental append persisted ${remapped.length} crystals`);
  await updateFullJob(current.id, {
    total: snapshot.results.length,
    processed: snapshot.results.length,
    nextOffset: snapshot.results.length,
    phaseMessage: `Incremental atlas append added ${remapped.length} crystals.`,
  });

  return {
    ok: true,
    baseLayoutKey: snapshot.layoutKey,
    appended: remapped.length,
    totalLayoutSize: snapshot.results.length,
  };
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
  const topologyLabels = clusterTorusTopology(
    rows.map((_, index) => {
      const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
      return { u: Number(coord[0] ?? 0), v: Number(coord[1] ?? 0) };
    }),
    parameters.n_clusters,
  );
  const histogramMap = new Map<number, number>();
  const topologyHistogramMap = new Map<number, number>();

  payloadLabels.forEach((label) => {
    const value = Number(label ?? 0);
    histogramMap.set(value, (histogramMap.get(value) ?? 0) + 1);
  });
  topologyLabels.forEach((label) => {
    topologyHistogramMap.set(label, (topologyHistogramMap.get(label) ?? 0) + 1);
  });

  const labelHistogram = [...histogramMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label - b.label);
  const torusLabelHistogram = [...topologyHistogramMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label - b.label);

  const layoutPreview = rows.slice(0, 12).map((row, index) => {
    const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
    return {
      id: row.id,
      code: row.code,
      formula: row.combination,
      clusterLabel: Number(payloadLabels[index] ?? 0),
      torusClusterLabel: Number(topologyLabels[index] ?? 0),
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
    uniqueTorusLabels: torusLabelHistogram.length,
    labelHistogram,
    torusLabelHistogram,
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

async function runFullTorusAtlasRebuild(jobId: string, parameters: ReturnType<typeof buildAtlasParameters>) {
  try {
    const rows = await loadAtlasRows([]);
    const current = await updateFullJob(jobId, {
      status: "analyzing",
      total: rows.length,
      analysisProcessed: 0,
      analysisPercent: 0,
      analysisStep: "Preparing docs",
      phaseMessage: `Running one shared torus analysis for ${rows.length} crystals.`,
    });
    await appendJobProgress(jobId, `analysis started for ${rows.length} crystals`);
    if (current.status !== "analyzing") return;

    const analysis = await analyzeAtlasRows(
      rows,
      parameters,
      "all",
      async (event) => {
        if (event.event !== "progress") return;
        const percent = Math.max(0, Math.min(100, Number(event.value ?? 0)));
        const processed = Math.min(rows.length, Math.max(0, Math.round((rows.length * percent) / 100)));
        await updateFullJob(jobId, {
          analysisProcessed: processed,
          analysisPercent: percent,
          analysisStep: typeof event.step === "string" ? event.step : "",
          phaseMessage: typeof event.step === "string" && event.step
            ? `Running one shared torus analysis for ${rows.length} crystals. ${event.step}.`
            : `Running one shared torus analysis for ${rows.length} crystals.`,
        });
      },
    );
    const latestAfterAnalysis = await getFullTorusAtlasRebuildJob();
    const totalBatches = Math.max(1, Math.ceil(analysis.results.length / latestAfterAnalysis.batchSize));
    await writeSnapshotFile(jobId, {
      layoutKey: analysis.layoutKey,
      storedAt: analysis.storedAt,
      parameters,
      results: analysis.results,
    });
    const ready = await updateFullJob(jobId, {
      status: "analysis_ready",
      layoutKey: analysis.layoutKey,
      totalBatches,
      snapshotReady: true,
      nextOffset: 0,
      analysisProcessed: rows.length,
      analysisPercent: 100,
      analysisStep: "Snapshot ready",
      phaseMessage: "Analysis snapshot is ready. Persist phase can continue from checkpoint.",
    });
    await appendJobProgress(jobId, `snapshot ready with ${analysis.results.length} results`);
    if (ready.status === "paused") return;

    await resumePersistFromCheckpoint(ready, {
      layoutKey: analysis.layoutKey,
      storedAt: analysis.storedAt,
      parameters,
      results: analysis.results,
    });
  } catch (error) {
    await appendJobError(jobId, (error as Error).message);
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
      embedding: true,
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
  rows: Array<{ id: string; code: string; combination: string; embedding?: string | null; metadataJson: string | null }>,
  parameters: ReturnType<typeof buildAtlasParameters>,
  scope: "all" | "selected",
  onEvent?: (event: SidecarEvent) => Promise<void> | void,
) {
  const docs = rows.map((row) => row.combination);
  const storedAt = new Date().toISOString();
  const layoutKey = `atlas:${storedAt}:${rows.length}:${parameters.n_clusters}`;
  const embeddings = await ensureAtlasEmbeddings(rows, parameters, onEvent);
  const { result } = await callSidecar<JsonRecord>("torus_analyze", {
    inputFile: {
      docs,
      query: ATLAS_NEUTRAL_QUERY,
      doc_emb: embeddings.docEmbeddings,
      query_emb: embeddings.queryEmbedding,
      ...parameters,
    },
    taskType: "torus_analyze",
    title: `Global torus atlas: ${rows.length} crystals`,
    timeoutMs: FULL_ATLAS_ANALYZE_TIMEOUT_MS,
    onEvent,
  });
  return {
    layoutKey,
    storedAt,
    results: mapAnalysisToAtlasResults(rows, result as JsonRecord, parameters, scope, storedAt, layoutKey),
  };
}

function mapAnalysisToAtlasResults(
  rows: Array<{ id: string; code: string; combination: string; embedding?: string | null; metadataJson: string | null }>,
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
  const topologyLabels = clusterTorusTopology(
    rows.map((_, index) => {
      const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
      return { u: Number(coord[0] ?? 0), v: Number(coord[1] ?? 0) };
    }),
    parameters.n_clusters,
  );

  return rows.map((row, index) => {
    const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
    const torusU = Number(coord[0] ?? 0);
    const torusV = Number(coord[1] ?? 0);
    const semanticClusterLabel = Number(payloadLabels[index] ?? 0);
    const torusClusterLabel = Number(topologyLabels[index] ?? 0);
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
      clusterLabel: torusClusterLabel,
      semanticClusterLabel,
      torusClusterLabel,
      torusU,
      torusV,
      torusX: point3d.x,
      torusY: point3d.y,
      torusZ: point3d.z,
    };
    metadata.clusterLabel = torusClusterLabel;
    metadata.semanticClusterLabel = semanticClusterLabel;
    metadata.torusClusterLabel = torusClusterLabel;
    metadata.torusX = point3d.x;
    metadata.torusY = point3d.y;
    metadata.torusZ = point3d.z;
    return {
      id: row.id,
      code: row.code,
      clusterLabel: torusClusterLabel,
      semanticClusterLabel,
      torusClusterLabel,
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
  results: Array<TorusAtlasRebuildResult["results"][number] & {
    semanticClusterLabel?: number;
    torusClusterLabel?: number;
    metadataJson: string;
  }>,
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
    for (const item of batch) {
      await db.crystal.update({
        where: { id: item.id },
        data: { metadataJson: item.metadataJson },
      });
    }
    processed += batch.length;
    await onProgress?.(processed, currentBatch);
  }
}

function normalizeIds(ids?: string[]) {
  return [...new Set((ids ?? []).map((item) => item.trim()).filter(Boolean))];
}

function clusterTorusTopology(points: Array<{ u: number; v: number }>, requestedClusters: number) {
  if (!points.length) return [];
  const features = points.map(({ u, v }) => [Math.cos(u), Math.sin(u), Math.cos(v), Math.sin(v)]);
  const k = Math.max(1, Math.min(requestedClusters, features.length));
  const centroids = initializeCyclicCentroids(features, k);
  const labels = new Array(features.length).fill(0);

  for (let iteration = 0; iteration < 24; iteration += 1) {
    let changed = false;
    for (let index = 0; index < features.length; index += 1) {
      const next = nearestCentroid(features[index], centroids);
      if (labels[index] !== next) {
        labels[index] = next;
        changed = true;
      }
    }

    const sums = centroids.map(() => [0, 0, 0, 0]);
    const counts = centroids.map(() => 0);
    for (let index = 0; index < features.length; index += 1) {
      const label = labels[index];
      counts[label] += 1;
      for (let axis = 0; axis < 4; axis += 1) sums[label][axis] += features[index][axis];
    }

    for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
      if (!counts[centroidIndex]) continue;
      const mean = sums[centroidIndex].map((value) => value / counts[centroidIndex]);
      const thetaNorm = Math.hypot(mean[0], mean[1]) || 1;
      const phiNorm = Math.hypot(mean[2], mean[3]) || 1;
      centroids[centroidIndex] = [
        mean[0] / thetaNorm,
        mean[1] / thetaNorm,
        mean[2] / phiNorm,
        mean[3] / phiNorm,
      ];
    }

    if (!changed && iteration > 0) break;
  }

  return relabelByPopulation(labels);
}

function initializeCyclicCentroids(features: number[][], k: number) {
  const centroids = [features[0].slice()];
  while (centroids.length < k) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < features.length; index += 1) {
      const distance = nearestCentroidDistance(features[index], centroids);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    centroids.push(features[bestIndex].slice());
  }
  return centroids;
}

function nearestCentroid(feature: number[], centroids: number[][]) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centroids.length; index += 1) {
    const distance = squaredDistance(feature, centroids[index]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function nearestCentroidDistance(feature: number[], centroids: number[][]) {
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const centroid of centroids) {
    const distance = squaredDistance(feature, centroid);
    if (distance < bestDistance) bestDistance = distance;
  }
  return bestDistance;
}

function squaredDistance(a: number[], b: number[]) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    total += delta * delta;
  }
  return total;
}

function relabelByPopulation(labels: number[]) {
  const counts = new Map<number, number>();
  labels.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const mapping = new Map<number, number>();
  sorted.forEach(([label], index) => mapping.set(label, index));
  return labels.map((label) => mapping.get(label) ?? 0);
}

async function resumePersistFromCheckpoint(
  job: TorusAtlasFullRebuildJob,
  snapshot: {
    layoutKey: string;
    storedAt: string;
    parameters: ReturnType<typeof buildAtlasParameters>;
    results: Array<TorusAtlasRebuildResult["results"][number] & {
      semanticClusterLabel?: number;
      torusClusterLabel?: number;
      metadataJson: string;
    }>;
  },
) {
  let current = await updateFullJob(job.id, {
    status: "persisting",
    analysisProcessed: snapshot.results.length,
    analysisPercent: 100,
    analysisStep: "Persisting checkpoint batches",
    phaseMessage: `Persisting atlas coordinates from offset ${job.nextOffset}.`,
  });
  if (current.status !== "persisting") return;

  const totalBatches = Math.max(1, Math.ceil(snapshot.results.length / current.batchSize));
  let processed = current.nextOffset;
  let currentBatch = Math.floor(current.nextOffset / current.batchSize);

  for (let index = current.nextOffset; index < snapshot.results.length; index += current.batchSize) {
    const latest = await getFullTorusAtlasRebuildJob();
    if (latest.id !== current.id) return;
    if (latest.status === "paused") return;
    if (latest.status !== "persisting") return;

    currentBatch += 1;
    const batch = snapshot.results.slice(index, index + current.batchSize);
    await Promise.all(batch.map((item) => db.crystal.update({
      where: { id: item.id },
      data: { metadataJson: item.metadataJson },
    })));
    processed += batch.length;

    current = await updateFullJob(current.id, {
      processed,
      nextOffset: processed,
      currentBatch,
      totalBatches,
      layoutKey: snapshot.layoutKey,
      phaseMessage: `Persisted ${processed} of ${snapshot.results.length} crystals.`,
    });
    if (current.status === "paused") return;
  }

  await updateFullJob(current.id, {
    status: "completed",
    processed: snapshot.results.length,
    nextOffset: snapshot.results.length,
    currentBatch: totalBatches,
    totalBatches,
    layoutKey: snapshot.layoutKey,
    completedAt: new Date().toISOString(),
    phaseMessage: "Full atlas rebuild completed.",
  });
  await appendJobProgress(current.id, "job completed");
}

async function ensureJobDir(jobId: string) {
  const dir = join(ATLAS_JOB_ROOT, jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeJobFile(job: TorusAtlasFullRebuildJob) {
  const dir = await ensureJobDir(job.id);
  await writeFile(join(dir, "job.json"), JSON.stringify(job, null, 2), "utf8");
}

async function readJobFile(jobId: string) {
  try {
    const file = await readFile(join(ATLAS_JOB_ROOT, jobId, "job.json"), "utf8");
    return parseFullJob(file);
  } catch {
    return null;
  }
}

async function writeSnapshotFile(
  jobId: string,
  snapshot: {
    layoutKey: string;
    storedAt: string;
    parameters: ReturnType<typeof buildAtlasParameters>;
    results: Array<TorusAtlasRebuildResult["results"][number] & {
      semanticClusterLabel?: number;
      torusClusterLabel?: number;
      metadataJson: string;
    }>;
  },
) {
  const dir = await ensureJobDir(jobId);
  await writeFile(join(dir, "snapshot.json"), JSON.stringify(snapshot), "utf8");
}

async function readSnapshotFile(jobId: string) {
  try {
    const file = await readFile(join(ATLAS_JOB_ROOT, jobId, "snapshot.json"), "utf8");
    return JSON.parse(file) as {
      layoutKey: string;
      storedAt: string;
      parameters: ReturnType<typeof buildAtlasParameters>;
      results: Array<TorusAtlasRebuildResult["results"][number] & {
        semanticClusterLabel?: number;
        torusClusterLabel?: number;
        metadataJson: string;
      }>;
    };
  } catch {
    return null;
  }
}

async function deleteJobArtifacts(jobId: string) {
  try {
    const dir = join(ATLAS_JOB_ROOT, jobId);
    await stat(dir);
    await rm(dir, { recursive: true, force: true });
  } catch {
    return;
  }
}

async function appendJobProgress(jobId: string, message: string) {
  const dir = await ensureJobDir(jobId);
  await appendFile(join(dir, "progress.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
}

async function appendJobError(jobId: string, message: string) {
  const dir = await ensureJobDir(jobId);
  await appendFile(join(dir, "errors.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
}

async function saveFullJob(job: TorusAtlasFullRebuildJob) {
  if (job.id) {
    await writeJobFile(job);
  }
  await db.setting.upsert({
    where: { key: FULL_REBUILD_SETTING_KEY },
    update: { value: JSON.stringify(job) },
    create: { key: FULL_REBUILD_SETTING_KEY, value: JSON.stringify(job) },
  });
}

async function updateFullJob(jobId: string, patch: Partial<TorusAtlasFullRebuildJob>) {
  const current = await getFullTorusAtlasRebuildJob();
  if (current.id !== jobId) return current;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveFullJob(next);
  return next;
}

async function recoverJobFromSnapshotIfNeeded(job: TorusAtlasFullRebuildJob) {
  if (job.snapshotReady || !job.id) {
    return job;
  }
  if (!["preparing", "analyzing", "failed"].includes(job.status)) {
    return job;
  }
  const snapshot = await readSnapshotFile(job.id);
  if (!snapshot) {
    return job;
  }
  const totalBatches = Math.max(1, Math.ceil(snapshot.results.length / Math.max(1, job.batchSize)));
  const recovered = {
    ...job,
    status: "analysis_ready" as const,
    layoutKey: snapshot.layoutKey,
    snapshotReady: true,
    totalBatches,
    analysisProcessed: snapshot.results.length,
    analysisPercent: 100,
    analysisStep: "Snapshot recovered",
    phaseMessage: "Recovered from existing snapshot. Persist phase can continue from checkpoint.",
    updatedAt: new Date().toISOString(),
  };
  await saveFullJob(recovered);
  return recovered;
}

async function recoverInactiveFullRebuildJob(job: TorusAtlasFullRebuildJob) {
  if (!job.id) {
    return buildIdleJob();
  }
  if (ACTIVE_FULL_REBUILD_JOBS.has(job.id)) {
    return job;
  }
  if (!["preparing", "analyzing", "analysis_ready", "persisting"].includes(job.status)) {
    return recoverJobFromSnapshotIfNeeded(job);
  }

  const snapshot = await readSnapshotFile(job.id);
  if (snapshot) {
    const totalBatches = Math.max(1, Math.ceil(snapshot.results.length / Math.max(1, job.batchSize || 1)));
    const recovered: TorusAtlasFullRebuildJob = {
      ...job,
      status: job.status === "analysis_ready" ? "analysis_ready" : "paused",
      layoutKey: snapshot.layoutKey,
      snapshotReady: true,
      total: Math.max(job.total, snapshot.results.length),
      processed: Math.max(job.processed, job.nextOffset),
      analysisProcessed: snapshot.results.length,
      analysisPercent: 100,
      analysisStep: "Snapshot recovered after restart",
      totalBatches,
      phaseMessage:
        job.status === "analysis_ready"
          ? "Snapshot recovered. Persist phase is ready to continue."
          : "Previous process is no longer active. Snapshot recovered; use Resume or Restart.",
      updatedAt: new Date().toISOString(),
      error: job.status === "persisting" ? job.error : "",
    };
    await saveFullJob(recovered);
    return recovered;
  }

  const failed: TorusAtlasFullRebuildJob = {
    ...job,
    status: "failed",
    completedAt: job.completedAt || new Date().toISOString(),
    phaseMessage: "Previous rebuild process is no longer active. Restart the full rebuild.",
    error: job.error || "Background rebuild ended before a recoverable checkpoint was created.",
    updatedAt: new Date().toISOString(),
  };
  await saveFullJob(failed);
  return failed;
}

async function resetMissingFullRebuildJob(job: TorusAtlasFullRebuildJob) {
  if (!job.id) {
    const idle = buildIdleJob();
    await db.setting.upsert({
      where: { key: FULL_REBUILD_SETTING_KEY },
      update: { value: JSON.stringify(idle) },
      create: { key: FULL_REBUILD_SETTING_KEY, value: JSON.stringify(idle) },
    });
    return idle;
  }
  if (ACTIVE_FULL_REBUILD_JOBS.has(job.id)) {
    return job;
  }
  const failed: TorusAtlasFullRebuildJob = {
    ...job,
    status: "failed",
    completedAt: job.completedAt || new Date().toISOString(),
    phaseMessage: "Job metadata exists, but its checkpoint files are missing. Restart the full rebuild.",
    error: job.error || "Checkpoint files are missing.",
    updatedAt: new Date().toISOString(),
  };
  await saveFullJob(failed);
  return failed;
}

function parseFullJob(value: string | null): TorusAtlasFullRebuildJob {
  if (!value) {
    return buildIdleJob();
  }
  try {
    const parsed = JSON.parse(value) as Partial<TorusAtlasFullRebuildJob>;
    const job = {
      id: typeof parsed.id === "string" ? parsed.id : "",
      status: parsed.status ?? "idle",
      total: Number(parsed.total ?? 0),
      processed: Number(parsed.processed ?? 0),
      analysisProcessed: Number(parsed.analysisProcessed ?? 0),
      analysisPercent: Number(parsed.analysisPercent ?? 0),
      analysisStep: typeof parsed.analysisStep === "string" ? parsed.analysisStep : "",
      batchSize: Number(parsed.batchSize ?? 0),
      currentBatch: Number(parsed.currentBatch ?? 0),
      totalBatches: Number(parsed.totalBatches ?? 0),
      layoutKey: typeof parsed.layoutKey === "string" ? parsed.layoutKey : "",
      clusters: Number(parsed.clusters ?? 0),
      nextOffset: Number(parsed.nextOffset ?? 0),
      snapshotReady: Boolean(parsed.snapshotReady ?? false),
      paramsJson: typeof parsed.paramsJson === "string" ? parsed.paramsJson : "",
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : "",
      error: typeof parsed.error === "string" ? parsed.error : "",
      phaseMessage: typeof parsed.phaseMessage === "string" ? parsed.phaseMessage : "",
    };
    if (!job.id) {
      return buildIdleJob();
    }
    return job;
  } catch {
    return buildIdleJob();
  }
}

function trackActiveFullRebuild(jobId: string, promise: Promise<unknown>) {
  ACTIVE_FULL_REBUILD_JOBS.add(jobId);
  void promise.finally(() => {
    ACTIVE_FULL_REBUILD_JOBS.delete(jobId);
  });
}

function buildIdleJob(): TorusAtlasFullRebuildJob {
  return {
    id: "",
    status: "idle",
    total: 0,
    processed: 0,
    analysisProcessed: 0,
    analysisPercent: 0,
    analysisStep: "",
    batchSize: 0,
    currentBatch: 0,
    totalBatches: 0,
    layoutKey: "",
    clusters: 0,
    nextOffset: 0,
    snapshotReady: false,
    paramsJson: "",
    startedAt: "",
    updatedAt: "",
    completedAt: "",
    error: "",
    phaseMessage: "",
  };
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

function parseEmbedding(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const vector = parsed.map((item) => Number(item));
    return vector.every((item) => Number.isFinite(item)) ? vector : null;
  } catch {
    return null;
  }
}

async function ensureAtlasEmbeddings(
  rows: Array<{ id: string; code: string; combination: string; embedding?: string | null }>,
  parameters: ReturnType<typeof buildAtlasParameters>,
  onEvent?: (event: SidecarEvent) => Promise<void> | void,
) {
  const { provider, settings } = await getActiveProvider();
  const docEmbeddings: number[][] = new Array(rows.length);
  const missing: Array<{ index: number; id: string; text: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const vector = parseEmbedding(rows[index].embedding);
    if (vector) {
      docEmbeddings[index] = vector;
    } else {
      missing.push({
        index,
        id: rows[index].id,
        text: rows[index].combination,
      });
    }
  }

  if (onEvent) {
    await onEvent({
      event: "progress",
      value: 2,
      step: `Loaded ${rows.length - missing.length}/${rows.length} cached crystal embeddings`,
      ts: new Date().toISOString(),
    });
  }

  for (let index = 0; index < missing.length; index += 1) {
    const item = missing[index];
    const vector = await provider.embed(item.text, settings.embedModel);
    docEmbeddings[item.index] = vector;
    await db.crystal.update({
      where: { id: item.id },
      data: { embedding: JSON.stringify(vector) },
    });
    if (onEvent && (index === 0 || (index + 1) % 10 === 0 || index + 1 === missing.length)) {
      const totalResolved = rows.length - missing.length + index + 1;
      const value = Math.max(2, Math.min(60, Math.round((totalResolved / Math.max(rows.length, 1)) * 60)));
      await onEvent({
        event: "progress",
        value,
        step: `Prepared embeddings ${totalResolved}/${rows.length}`,
        ts: new Date().toISOString(),
      });
    }
  }

  const queryEmbedding = await provider.embed(ATLAS_NEUTRAL_QUERY, settings.embedModel);
  if (onEvent) {
    await onEvent({
      event: "progress",
      value: 65,
      step: `Prepared query embedding via ${parameters.embedding_model ?? settings.embedModel}`,
      ts: new Date().toISOString(),
    });
  }

  return {
    docEmbeddings,
    queryEmbedding,
  };
}
