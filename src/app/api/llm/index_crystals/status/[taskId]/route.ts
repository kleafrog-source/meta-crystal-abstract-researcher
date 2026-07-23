import { NextResponse } from "next/server";
import { getCrystalIndexTask } from "@/lib/llm/crystal-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await ctx.params;
    const handle = getCrystalIndexTask(taskId);
    if (!handle) {
      return NextResponse.json(
        { ok: false, error: "Задача индексации не найдена." },
        { status: 404 },
      );
    }

    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    let events = handle.events;
    if (since) {
      const sinceTs = Date.parse(since);
      if (!Number.isNaN(sinceTs)) {
        events = events.filter((event) => {
          const currentTs = event.ts ? Date.parse(event.ts) : 0;
          return currentTs > sinceTs;
        });
      }
    }

    return NextResponse.json({
      ok: true,
      taskId,
      status: handle.status,
      events: events.slice(-500),
      result: handle.result ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
