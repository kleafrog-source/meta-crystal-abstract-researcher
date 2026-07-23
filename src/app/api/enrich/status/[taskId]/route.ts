import { NextResponse } from "next/server";
import { getTask } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/enrich/status/[taskId]
 * Returns the current status + buffered events of an enrichment run.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await ctx.params;
    const handle = getTask(taskId);
    if (!handle) {
      return NextResponse.json(
        { ok: false, error: "Задача не найдена" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      taskId,
      status: handle.status,
      events: handle.events.slice(-200),
      result: handle.result ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
