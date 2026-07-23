import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncCrystalsFromIndex } from "@/lib/engine/sync";
import { runningTaskCount } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 * Aggregated dashboard stats: total crystals, breakdown by type, recent
 * additions, active runs count.
 *
 * Optional query: ?refresh=1 — re-sync the index file before returning.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const refresh = url.searchParams.get("refresh") === "1";
    let syncInfo = null;
    if (refresh) {
      syncInfo = await syncCrystalsFromIndex();
    }

    const totalCrystals = await db.crystal.count();
    const totalEmeralds = await db.crystal.count({
      where: { type: { in: ["emerald", "EMERALD", "Изумруд", "ИЗУМРУД"] } },
    });
    const totalDiamonds = await db.crystal.count({
      where: { type: { in: ["diamond", "DIAMOND", "Алмаз", "АЛМАЗ"] } },
    });
    const totalFavourites = await db.crystal.count({ where: { isFavourite: true } });
    const totalPipelines = await db.pipeline.count();

    // Type breakdown
    const typeRows = await db.crystal.groupBy({
      by: ["type"],
      _count: true,
      orderBy: { _count: { type: "desc" } },
    });
    const typeBreakdown: Record<string, number> = {};
    for (const r of typeRows) typeBreakdown[r.type] = r._count;

    const recentCrystals = await db.crystal.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    const recentRuns = await db.pipelineRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { pipeline: true },
    });

    return NextResponse.json({
      ok: true,
      stats: {
        totalCrystals,
        totalEmeralds,
        totalDiamonds,
        totalFavourites,
        totalPipelines,
        activeRuns: runningTaskCount(),
      },
      typeBreakdown,
      recentCrystals: recentCrystals.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        focus: c.focus,
        combination: c.combination.slice(0, 200),
        qualityScore: c.qualityScore,
        complexity: c.complexity,
        counter: c.counter,
        createdAt: c.createdAt,
      })),
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        pipelineId: r.pipelineId,
        pipelineName: r.pipeline.name,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      })),
      sync: syncInfo,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
