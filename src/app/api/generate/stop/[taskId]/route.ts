import { NextResponse } from "next/server";
import { getTask } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/generate/stop/[taskId]
 * Cancels a running generation task (sends SIGTERM to the sidecar process).
 */
export async function POST(
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
    if (handle.status !== "running") {
      return NextResponse.json({
        ok: true,
        status: handle.status,
        message: "Задача уже не активна",
      });
    }
    handle.cancel();
    return NextResponse.json({ ok: true, status: "cancelled" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
