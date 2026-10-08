import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { callSidecar } from "@/lib/engine/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  let tempDir: string | null = null;
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio file exceeds the 25 MB limit." }, { status: 413 });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-crystal-stt-"));
    const extension = audio.type.includes("ogg") ? ".ogg" : audio.type.includes("wav") ? ".wav" : ".webm";
    const audioPath = path.join(tempDir, `speech${extension}`);
    await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));

    const { result } = await callSidecar<{ text?: string; language?: string; language_probability?: number }>("stt", {
      args: [audioPath],
      timeoutMs: 5 * 60 * 1000,
      taskType: "stt",
      title: "Flowmusic voice transcription",
    });
    const payload = result as { text?: string; language?: string; language_probability?: number };
    const text = payload?.text?.trim();
    if (!text) return NextResponse.json({ error: "Speech was not recognized." }, { status: 422 });
    return NextResponse.json({ text, language: payload.language, language_probability: payload.language_probability });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
