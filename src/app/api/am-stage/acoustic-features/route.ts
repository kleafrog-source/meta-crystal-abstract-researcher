import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import type { SegmentAcousticFeatures } from "@/lib/segment-side-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const SCRIPT = path.join(ROOT, "python_engine", "stage7_acoustic_features.py");
const SLOT_OWNER = "am-stage-acoustic-features";
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;

class InvalidAudioError extends Error {}

async function extractFeatures(audioPath: string, offset: number, duration: number, helmHasVocals: string): Promise<Omit<SegmentAcousticFeatures, "extractor" | "ran_at">> {
  try {
    const { stdout } = await execFileAsync(PYTHON, [
      "-u", SCRIPT,
      "--audio", audioPath,
      "--offset", String(offset),
      "--duration", String(duration),
      "--helm-has-vocals", helmHasVocals,
    ], {
      cwd: ROOT,
      windowsHide: true,
      timeout: 240_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, CUDA_VISIBLE_DEVICES: "", OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "2", PYTHONUTF8: "1" },
    });
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}") as Omit<SegmentAcousticFeatures, "extractor" | "ran_at">;
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException & { stderr?: string };
    const detail = String(error.stderr || error.message || cause).trim();
    if (/^(This runtime can read|Select an audio segment|The selected audio window)/i.test(detail)) throw new InvalidAudioError(detail);
    throw new Error(detail.slice(-2_000));
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Expected multipart audio input." }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "Choose an audio file." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio exceeds the 150 MiB limit." }, { status: 413 });
  const offset = Number(form.get("offset"));
  const duration = Number(form.get("duration"));
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(duration) || duration < 0.25 || duration > 30) {
    return NextResponse.json({ error: "Select an audio segment from 0.25 to 30 seconds." }, { status: 400 });
  }
  const rawHelmGate = form.get("helm_has_vocals");
  const helmHasVocals = rawHelmGate === "true" || rawHelmGate === "false" ? rawHelmGate : "unknown";
  if (!acquireEmbeddingModelSlot(SLOT_OWNER)) {
    return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });
  }

  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "am-stage-acoustic-"));
    const audioPath = path.join(temporaryDirectory, `${randomUUID()}.audio`);
    await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
    const result = await extractFeatures(audioPath, offset, duration, helmHasVocals);
    const sideMeta: SegmentAcousticFeatures = { extractor: "librosa", ran_at: new Date().toISOString(), ...result };
    return NextResponse.json({ side_meta: { schema: "segment_side_meta_v1", acoustic_features: sideMeta } });
  } catch (error) {
    const invalidAudio = error instanceof InvalidAudioError;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: invalidAudio ? 400 : 500 });
  } finally {
    releaseEmbeddingModelSlot(SLOT_OWNER);
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
