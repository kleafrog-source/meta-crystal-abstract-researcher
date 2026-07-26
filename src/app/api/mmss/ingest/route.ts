import { NextResponse } from "next/server";
import { MAX_CONCURRENT_RUNS, runSidecar, runningTaskCount } from "@/lib/engine/runner";
import { buildMmssEnv } from "@/lib/mmss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (runningTaskCount() >= MAX_CONCURRENT_RUNS) {
      return NextResponse.json(
        { ok: false, error: `Достигнут лимит одновременных задач (${MAX_CONCURRENT_RUNS})` },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "code" ? "code" : "all";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (mode === "code" && !code) {
      return NextResponse.json(
        { ok: false, error: "Для ingest по коду нужен crystal code" },
        { status: 400 },
      );
    }

    const handle = runSidecar({
      command: mode === "code" ? "mmss_ingest_code" : "mmss_ingest_all",
      args: mode === "code" ? [code] : [],
      taskType: "mmss_ingest",
      title: mode === "code" ? `MMSS ingest: ${code}` : "MMSS ingest all",
      timeoutMs: 30 * 60 * 1000,
      extraEnv: buildMmssEnv(body ?? {}),
    });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      mode,
      title: handle.title,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
