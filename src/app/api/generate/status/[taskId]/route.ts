import { NextResponse } from "next/server";
import { getTask } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/generate/status/[taskId]
 * Returns the current status of a generation task, including buffered events.
 *
 * Query: ?since=<iso> — only return events after this timestamp.
 */
export async function GET(
  req: Request,
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

    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    let events = handle.events;
    if (since) {
      const sinceTs = Date.parse(since);
      if (!Number.isNaN(sinceTs)) {
        events = events.filter((e) => {
          const t = e.ts ? Date.parse(e.ts) : 0;
          return t > sinceTs;
        });
      }
    }

    return NextResponse.json({
      ok: true,
      taskId,
      status: handle.status,
      events: events.slice(-500), // cap payload size
      result: handle.result ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
