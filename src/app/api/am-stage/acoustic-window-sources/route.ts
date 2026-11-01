import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const SCRIPT = path.join(ROOT, "python_engine", "stage8_acoustic_window_sources.py");
const SLOT_OWNER = "am-stage-acoustic-window-sources";
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const MAX_RANGE_SECONDS = 30 * 60;

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Expected multipart audio input." }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "Choose an audio file." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio exceeds the 150 MiB limit." }, { status: 413 });
  const offset = Number(form.get("offset"));
  const duration = Number(form.get("duration"));
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(duration) || duration < 0.25 || duration > MAX_RANGE_SECONDS) {
    return NextResponse.json({ error: "Select an audio range from 0.25 seconds to 30 minutes." }, { status: 400 });
  }
  if (!acquireEmbeddingModelSlot(SLOT_OWNER)) {
    return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });
  }

  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "am-stage-window-sources-"));
    const audioPath = path.join(temporaryDirectory, `${randomUUID()}.audio`);
    await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
    const { stdout } = await execFileAsync(PYTHON, [
      "-u", SCRIPT, "--audio", audioPath, "--offset", String(offset), "--duration", String(duration),
    ], {
      cwd: ROOT,
      windowsHide: true,
      timeout: 240_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CUDA_VISIBLE_DEVICES: "", OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "2", PYTHONUTF8: "1" },
    });
    return NextResponse.json(JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}"));
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException & { stderr?: string };
    const detail = String(error.stderr || error.message || cause).trim();
    const invalidAudio = /^(This runtime can read|Select an audio range|The selected audio (range|window))/i.test(detail);
    return NextResponse.json({ error: detail.slice(-2_000) }, { status: invalidAudio ? 400 : 500 });
  } finally {
    releaseEmbeddingModelSlot(SLOT_OWNER);
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
