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
    const params = {
      crystal_limit:
        body?.crystal_limit === null || body?.crystal_limit === undefined || body?.crystal_limit === ""
          ? undefined
          : Number(body.crystal_limit),
    };

    const handle = runSidecar({
      command: "mmss_eval",
      inputFile: params,
      taskType: "mmss_eval",
      title: "MMSS eval",
      timeoutMs: 60 * 60 * 1000,
      extraEnv: buildMmssEnv(body ?? {}),
    });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      title: handle.title,
      params,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
