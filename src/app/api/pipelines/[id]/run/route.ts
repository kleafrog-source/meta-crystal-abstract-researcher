import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runLocalTask, runSidecar, runningTaskCount, MAX_CONCURRENT_RUNS, type SidecarEvent } from "@/lib/engine/runner";
import { syncCrystalsFromIndex } from "@/lib/engine/sync";
import {
  createMicroNotes,
  diffuseCrystals,
  indexManifestEmbeddings,
  manifestCrystals,
  queryPalette,
  scanIsomorphisms,
} from "@/lib/manifestation";
import { runGwCollapserOnCrystal } from "@/lib/gw-collapser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pipelines/[id]/run
 * Starts a pipeline run in the background and returns the task id.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const pipe = await db.pipeline.findUnique({ where: { id } });
    if (!pipe) {
      return NextResponse.json(
        { ok: false, error: "Пайплайн не найден" },
        { status: 404 },
      );
    }

    if (runningTaskCount() >= MAX_CONCURRENT_RUNS) {
      return NextResponse.json(
        { ok: false, error: `Достигнут лимит одновременных задач (${MAX_CONCURRENT_RUNS})` },
        { status: 429 },
      );
    }

    const run = await db.pipelineRun.create({
      data: {
        pipelineId: id,
        status: "running",
      },
    });

    const stored = parsePipelinePayload(pipe.stepsJson);
    const pipelinePayload = {
      name: pipe.name,
      description: pipe.description,
      steps: stored.steps,
      profile: stored.profile ?? {},
      flags: stored.profile?.flags ?? {},
      params: stored.profile?.params ?? { generations: 1, batch: 50, top: 2 },
      metrics: stored.profile?.metrics ?? undefined,
      disabled_patterns: stored.profile?.disabled_patterns ?? [],
    };

    const handle = hasLocalSteps(stored.steps)
      ? runLocalTask({
          timeoutMs: 30 * 60 * 1000,
          taskType: "pipeline",
          title: `Пайплайн: ${pipe.name}`,
          onRun: ({ emit, isCancelled }) =>
            executeLocalPipeline(stored.steps, emit, isCancelled),
        })
      : runSidecar({
          command: "run_pipeline",
          inputFile: pipelinePayload,
          taskType: "pipeline",
          title: `Пайплайн: ${pipe.name}`,
        });

    // Subscribe to events to update the DB run record
    handle.subscribe((e) => {
      if (e.event === "log" || e.event === "data") {
        // accumulate log lazily — could update DB, but for prototype
        // we keep events in memory only
      }
      if (e.event === "done") {
        db.pipelineRun
          .update({
            where: { id: run.id },
            data: {
              status: "completed",
              finishedAt: new Date(),
              resultJson: JSON.stringify(e.result ?? {}),
            },
          })
          .then(() => syncCrystalsFromIndex())
          .catch(() => {});
      } else if (e.event === "error") {
        db.pipelineRun
          .update({
            where: { id: run.id },
            data: {
              status: "failed",
              finishedAt: new Date(),
              resultJson: JSON.stringify({ error: e.msg }),
            },
          })
          .catch(() => {});
      }
    });

    handle.done.catch(() => {
      db.pipelineRun
        .update({
          where: { id: run.id },
          data: {
            status: handle.status === "cancelled" ? "cancelled" : "failed",
            finishedAt: new Date(),
          },
        })
        .catch(() => {});
    });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      runId: run.id,
      status: handle.status,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function hasLocalSteps(steps: unknown[]) {
  return steps.some((step) => {
    const action =
      step && typeof step === "object" && "action" in step ? String((step as { action?: unknown }).action ?? "") : "";
    return action.startsWith("manifest_") || action === "run_torus_analysis" || action === "batch_torus_compare";
  });
}

async function executeLocalPipeline(
  steps: unknown[],
  emit: (event: SidecarEvent) => void,
  isCancelled: () => boolean,
) {
  const total = Math.max(steps.length, 1);
  const results: Array<{ step: string; action: string; result: unknown }> = [];

  for (let index = 0; index < steps.length; index++) {
    if (isCancelled()) {
      throw new Error("cancelled");
    }
    const raw = steps[index];
    const step = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const action = String(step.action ?? "");
    const name = typeof step.name === "string" && step.name.trim() ? step.name.trim() : action;
    const params = step.params && typeof step.params === "object" ? (step.params as Record<string, unknown>) : {};

    emit({
      event: "progress",
      value: Math.round((index / total) * 100),
      step: name,
      ts: new Date().toISOString(),
    });
    emit({
      event: "log",
      level: "info",
      msg: `step ${index + 1}/${total}: ${name} (${action})`,
      ts: new Date().toISOString(),
    });

    const result = await executeLocalStep(action, params);
    results.push({ step: name, action, result });

    emit({
      event: "data",
      payload: { step: name, action, result },
      ts: new Date().toISOString(),
    });
  }

  emit({
    event: "progress",
    value: 100,
    step: "done",
    ts: new Date().toISOString(),
  });
  await syncCrystalsFromIndex();
  return { ok: true, results };
}

async function executeLocalStep(action: string, params: Record<string, unknown>) {
  switch (action) {
    case "manifest_micro_notes":
      return createMicroNotes({
        crystal_ids: toStringArray(params.crystal_ids),
        ...(params.temperature != null ? { temperature: Number(params.temperature) } : {}),
      });
    case "manifest_manifest":
      return manifestCrystals({
        crystal_ids: toStringArray(params.crystal_ids),
        ...(params.temperature != null ? { temperature: Number(params.temperature) } : {}),
        ...(params.include_isomorphs != null ? { include_isomorphs: Boolean(params.include_isomorphs) } : {}),
      });
    case "manifest_palette_query":
      return queryPalette({
        q: toNullableString(params.q),
        vector: toNullableString(params.vector),
        semantic_query: toNullableString(params.semantic_query),
        ...(params.has_micro_note != null ? { has_micro_note: Boolean(params.has_micro_note) } : {}),
        ...(params.has_vector != null ? { has_vector: Boolean(params.has_vector) } : {}),
        ...(params.limit != null ? { limit: Number(params.limit) } : {}),
      });
    case "manifest_diffuse":
      return diffuseCrystals({
        donor_ids: toStringArray(params.donor_ids),
        ...(params.temperature != null ? { temperature: Number(params.temperature) } : {}),
        ...(params.guidance != null ? { guidance: Number(params.guidance) } : {}),
        ...(params.superposition_size != null ? { superposition_size: Number(params.superposition_size) } : {}),
        ...(typeof params.collapse_mode === "string" ? { collapse_mode: params.collapse_mode as "best" | "diverse" | "manual" } : {}),
        ...(params.include_isomorphic_donors != null
          ? { include_isomorphic_donors: Boolean(params.include_isomorphic_donors) }
          : {}),
      });
    case "manifest_embeddings_index":
      return indexManifestEmbeddings({
        ...(Array.isArray(params.crystal_ids) ? { crystal_ids: toStringArray(params.crystal_ids) } : {}),
        ...(params.force_reindex != null ? { force_reindex: Boolean(params.force_reindex) } : {}),
      });
    case "manifest_isomorphisms_scan":
      return scanIsomorphisms({
        ...(Array.isArray(params.crystal_ids) ? { crystal_ids: toStringArray(params.crystal_ids) } : {}),
        ...(params.threshold != null ? { threshold: Number(params.threshold) } : {}),
      });
    case "run_torus_analysis":
      return runTorusAnalysisStep(params);
    case "batch_torus_compare":
      return batchTorusCompareStep(params);
    default:
      throw new Error(`Unsupported local pipeline action: ${action}`);
  }
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function runTorusAnalysisStep(params: Record<string, unknown>) {
  const crystalIds = toStringArray(params.crystal_ids);
  const singleId = toNullableString(params.crystal_id);
  const targetIds = crystalIds.length ? crystalIds : singleId ? [singleId] : [];
  if (!targetIds.length) {
    throw new Error("run_torus_analysis requires crystal_ids[] or crystal_id");
  }

  const options = torusOptionsFromParams(params);
  const results: Array<Awaited<ReturnType<typeof runGwCollapserOnCrystal>>> = [];
  for (const id of targetIds) {
    results.push(await runGwCollapserOnCrystal(id, options));
  }

  return {
    status: "ok",
    processed: results.length,
    results,
  };
}

async function batchTorusCompareStep(params: Record<string, unknown>) {
  const crystalIds = toStringArray(params.crystal_ids);
  if (crystalIds.length < 2) {
    throw new Error("batch_torus_compare requires at least two crystal_ids");
  }

  const options = torusOptionsFromParams(params);
  const rows: Array<{
    crystalId: string;
    crystalCode: string;
    query: string;
    Q: number;
    QEC: number;
    V: number;
    S: number;
    N: number;
    D_f: number;
    CHSH: number;
  }> = [];
  for (const id of crystalIds) {
    const run = await runGwCollapserOnCrystal(id, options);
    const mmss = (run.result as Record<string, any>)?.mmss ?? {};
    rows.push({
      crystalId: run.crystalId,
      crystalCode: run.crystalCode,
      query: run.query,
      Q: Number(mmss.Q ?? 0),
      QEC: Number(mmss.QEC ?? 0),
      V: Number(mmss.V ?? 0),
      S: Number(mmss.S ?? 0),
      N: Number(mmss.N ?? 0),
      D_f: Number(mmss.D_f ?? 0),
      CHSH: Number(mmss.CHSH ?? 0),
    });
  }

  rows.sort((a, b) => b.Q - a.Q);
  return {
    status: "ok",
    compared: rows.length,
    winner: rows[0] ?? null,
    rows,
  };
}

function torusOptionsFromParams(params: Record<string, unknown>) {
  return {
    query: toNullableString(params.query),
    ...(params.n_clusters != null ? { n_clusters: Number(params.n_clusters) } : {}),
    ...(params.dt != null ? { dt: Number(params.dt) } : {}),
    ...(params.friction != null ? { friction: Number(params.friction) } : {}),
    ...(params.epsilon != null ? { epsilon: Number(params.epsilon) } : {}),
    ...(params.max_steps != null ? { max_steps: Number(params.max_steps) } : {}),
    ...(params.tol_speed != null ? { tol_speed: Number(params.tol_speed) } : {}),
    ...(params.geometry_R != null ? { geometry_R: Number(params.geometry_R) } : {}),
    ...(params.geometry_r != null ? { geometry_r: Number(params.geometry_r) } : {}),
    ...(typeof params.embedding_model === "string" && params.embedding_model.trim()
      ? { embedding_model: params.embedding_model.trim() }
      : {}),
  };
}

function parsePipelinePayload(raw: string): { steps: unknown[]; profile: Record<string, any> | null } {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { steps: parsed, profile: null };
    }
    if (parsed && typeof parsed === "object") {
      return {
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
      };
    }
  } catch {}
  return { steps: [], profile: null };
}
