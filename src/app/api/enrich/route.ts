import { NextResponse } from "next/server";
import { runSidecar, runningTaskCount, MAX_CONCURRENT_RUNS } from "@/lib/engine/runner";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/enrich
 * Body: { source?: string } — starts an enrichment run in the background.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (runningTaskCount() >= MAX_CONCURRENT_RUNS) {
      return NextResponse.json(
        { ok: false, error: `Достигнут лимит одновременных задач (${MAX_CONCURRENT_RUNS})` },
        { status: 429 },
      );
    }
    const params = {
      source: body.source ?? "auto",
      categories_to_evolve: Array.isArray(body.categories_to_evolve) ? body.categories_to_evolve : [],
      iterations: Number(body.iterations ?? 2),
      hybrid_count: Number(body.hybrid_count ?? 10),
      iso_threshold: Number(body.iso_threshold ?? 0.3),
      apply_phase_transition: body.apply_phase_transition !== false,
      seed: Number(body.seed ?? 42),
      max_terms_per_category: Number(body.max_terms_per_category ?? 20),
      min_word_length: Number(body.min_word_length ?? 3),
      max_word_length: Number(body.max_word_length ?? 14),
      deduplicate_cross_category: body.deduplicate_cross_category !== false,
    };
    const handle = runSidecar({
      command: "enrich",
      inputFile: params,
      taskType: "enrichment",
      title: "Обогащение базы",
    });

    const log = await db.enrichmentLog.create({
      data: {
        paramsJson: JSON.stringify(params),
      },
    });

    handle.subscribe((e) => {
      if (e.event === "done") {
        db.enrichmentLog
          .update({
            where: { id: log.id },
            data: {
              finishedAt: new Date(),
              resultJson: JSON.stringify(e.result ?? {}),
            },
          })
          .catch(() => {});
      }
    });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      logId: log.id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
