import { NextResponse } from "next/server";
import { getCrystalIndexTask } from "@/lib/llm/crystal-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
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

    if (handle.status !== "running") {
      return NextResponse.json({
        ok: true,
        status: handle.status,
        message: "Задача уже не активна.",
      });
    }

    handle.cancel();
    return NextResponse.json({ ok: true, status: "cancelled" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
