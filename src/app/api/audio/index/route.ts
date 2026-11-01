import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { listTasks, runSidecar } from "@/lib/engine/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 7200;

export async function GET() {
  try {
    // Poll the compact manifest; index.json contains every 512-float embedding.
    const indexDir = path.join(process.cwd(), "data", "combinatorial-genesis", "audio-clap-index");
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(await fs.readFile(path.join(indexDir, "status.json"), "utf8")) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        // One-time migration for indexes created before status.json existed.
        const index = JSON.parse(await fs.readFile(path.join(indexDir, "index.json"), "utf8")) as Record<string, unknown>;
        payload = {
          ready: true,
          model: index.model,
          device: index.device,
          created_at: index.created_at,
          parameter_count: index.parameter_count,
          dimensions: index.dimensions,
          excluded_count: index.excluded_count,
          source_parameter_count: index.source_parameter_count,
        };
        await fs.writeFile(path.join(indexDir, "status.json"), JSON.stringify(payload), "utf8");
      } catch (indexError) {
        if ((indexError as NodeJS.ErrnoException).code !== "ENOENT") throw indexError;
        payload = { ready: false, model: process.env.CLAP_MODEL ?? "laion/clap-htsat-fused", parameter_count: 0 };
      }
    }
    const task = listTasks().filter((item) => item.taskType === "audio-clap" && item.title === "Build CLAP text index").at(-1);
    return NextResponse.json({ ...payload, job: task ? { taskId: task.taskId, status: task.status, startedAt: task.startedAt, events: task.events.slice(-100) } : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const running = listTasks().find((item) => item.taskType === "audio-clap" && item.title === "Build CLAP text index" && item.status === "running");
    if (running) return NextResponse.json({ started: false, reason: "already_running", taskId: running.taskId }, { status: 409 });
    const task = runSidecar({ command: "audio_index", timeoutMs: 2 * 60 * 60_000, taskType: "audio-clap", title: "Build CLAP text index" });
    void task.done.catch(() => {});
    return NextResponse.json({ started: true, taskId: task.taskId }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE() {
  const task = listTasks().filter((item) => item.taskType === "audio-clap" && item.title === "Build CLAP text index" && item.status === "running").at(-1);
  if (!task) return NextResponse.json({ stopped: false, reason: "not_running" }, { status: 409 });
  task.cancel();
  return NextResponse.json({ stopped: true, taskId: task.taskId });
}
