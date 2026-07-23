import { NextResponse } from "next/server";
import {
  runningCrystalIndexTaskCount,
  startCrystalIndexingTask,
} from "@/lib/llm/crystal-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (runningCrystalIndexTaskCount() > 0) {
      return NextResponse.json(
        { ok: false, error: "Индексация кристаллов уже выполняется." },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const handle = startCrystalIndexingTask({
      force: body.force === true,
    });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      status: handle.status,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
