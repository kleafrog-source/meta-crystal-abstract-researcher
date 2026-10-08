import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { callSidecar, listTasks } from "@/lib/engine/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 7200;

const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const SEARCH_TASK_TITLE = "CLAP audio parameter search";

export async function DELETE() {
  const running = listTasks().filter((task) => (
    task.status === "running"
    && task.taskType === "audio-clap"
    && task.title === SEARCH_TASK_TITLE
  ));
  for (const task of running) task.cancel();
  return NextResponse.json({ ok: true, stopped: running.length });
}

export async function POST(request: Request) {
  let tempDir: string | null = null;
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio file exceeds the 150 MB limit." }, { status: 413 });
    const offset = Math.max(0, Number(form.get("offset") ?? 0) || 0);
    const duration = Math.max(1, Math.min(800, Number(form.get("duration") ?? 8) || 8));
    const topK = Math.max(3, Math.min(100, Math.trunc(Number(form.get("top_k") ?? 20) || 20)));

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-crystal-audio-rag-"));
    const originalExtension = path.extname(audio.name).toLowerCase();
    const extension = /^\.[a-z0-9]{2,5}$/.test(originalExtension) ? originalExtension : ".audio";
    const audioPath = path.join(tempDir, `reference${extension}`);
    await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
    const { result } = await callSidecar("audio_search", {
      args: [audioPath],
      inputFile: { offset, duration, top_k: topK },
      timeoutMs: 2 * 60 * 60_000,
      taskType: "audio-clap",
      title: SEARCH_TASK_TITLE,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
