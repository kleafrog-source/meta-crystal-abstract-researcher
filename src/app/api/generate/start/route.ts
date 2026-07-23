import { NextResponse } from "next/server";
import { runSidecar, runningTaskCount, MAX_CONCURRENT_RUNS } from "@/lib/engine/runner";
import { syncCrystalsFromIndex } from "@/lib/engine/sync";
import type { Profile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/generate/start
 * Body: Profile
 * Starts a generation run in the background and returns the task id.
 */
export async function POST(req: Request) {
  try {
    const profile = (await req.json()) as Profile;
    if (!profile || !profile.params) {
      return NextResponse.json(
        { ok: false, error: "Профиль некорректен" },
        { status: 400 },
      );
    }

    if (runningTaskCount() >= MAX_CONCURRENT_RUNS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Достигнут лимит одновременных задач (${MAX_CONCURRENT_RUNS}). Подождите завершения одной из активных генераций.`,
        },
        { status: 429 },
      );
    }

    const handle = runSidecar({
      command: "generate",
      inputFile: profile,
    });

    // When done, sync the index into the database
    handle.done
      .then(async () => {
        try {
          await syncCrystalsFromIndex();
        } catch (e) {
          console.error("syncCrystalsFromIndex failed:", e);
        }
      })
      .catch(() => {
        // errors are surfaced via events
      });

    return NextResponse.json({
      ok: true,
      taskId: handle.taskId,
      status: handle.status,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
