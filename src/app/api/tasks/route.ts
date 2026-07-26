import { NextResponse } from "next/server";
import { listTasks } from "@/lib/engine/runner";
import { listCrystalIndexTasks } from "@/lib/llm/crystal-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = [
      ...listTasks().map((task) => ({
        taskId: task.taskId,
        taskType: task.taskType ?? "sidecar",
        title: task.title ?? task.taskId,
        status: task.status,
        startedAt: task.startedAt ?? null,
        progress: getTaskProgress(task.events),
        lastMessage: getLastMessage(task.events),
        result: task.result ?? null,
        canStop: task.status === "running",
      })),
      ...listCrystalIndexTasks().map((task) => ({
        taskId: task.taskId,
        taskType: task.taskType ?? "crystal_index",
        title: task.title ?? task.taskId,
        status: task.status,
        startedAt: task.startedAt ?? null,
        progress: getTaskProgress(task.events),
        lastMessage: getLastMessage(task.events),
        result: task.result ?? null,
        canStop: task.status === "running",
      })),
    ].sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));

    return NextResponse.json({
      ok: true,
      running: items.filter((item) => item.status === "running").length,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

function getTaskProgress(events: Array<{ event: string; value?: number }>) {
  const progress = [...events].reverse().find((event) => event.event === "progress" && typeof event.value === "number");
  return typeof progress?.value === "number" ? progress.value : null;
}

function getLastMessage(events: Array<{ event: string; msg?: string; step?: string }>) {
  const last = [...events].reverse().find((event) => event.event === "log" || event.event === "error" || event.event === "progress");
  if (!last) return null;
  return last.msg ?? last.step ?? null;
}
