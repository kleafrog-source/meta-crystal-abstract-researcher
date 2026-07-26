import { NextResponse } from "next/server";
import { getTask } from "@/lib/engine/runner";
import { getCrystalIndexTask } from "@/lib/llm/crystal-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await ctx.params;
    const task = getTask(taskId) ?? getCrystalIndexTask(taskId);
    if (!task) {
      return NextResponse.json(
        { ok: false, error: "Задача не найдена" },
        { status: 404 },
      );
    }
    if (task.status !== "running") {
      return NextResponse.json({ ok: true, status: task.status, message: "Задача уже завершена" });
    }
    task.cancel();
    return NextResponse.json({ ok: true, status: "cancelled" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
