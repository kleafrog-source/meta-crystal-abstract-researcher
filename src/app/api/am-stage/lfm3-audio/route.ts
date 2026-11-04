import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { prepareGpuForExternalModel } from "@/lib/ollama-memory";
import { buildLfm3Prompt, cleanLfm3Output, normalizeLfm3Window, parseLfm3Runtime, type Lfm3PromptMode, type Lfm3Runtime } from "@/lib/lfm3-audio";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 360;

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const AUDIO_PREPARE_SCRIPT = path.join(ROOT, "python_engine", "stage6_audio_specialists.py");
const SLOT_OWNER = "am-stage-lfm3-audio";
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "lfm3-audio:latest";
const DEFAULT_HF_MODEL = "LiquidAI/LFM3-Audio-2B-GGUF:Q4_K_M";

class MissingRuntimeError extends Error {}
class AudioInputError extends Error {}

function ollamaBaseUrl(): string {
  const value = process.env.AM_STAGE_LFM3_OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("AM_STAGE_LFM3_OLLAMA_BASE_URL must be a local Ollama URL."); }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("LFM3 Ollama runtime must use a loopback HTTP address.");
  }
  return parsed.origin;
}

async function prepareAudio(sourcePath: string, outputPath: string, offset: number, duration: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync(PYTHON, ["-u", AUDIO_PREPARE_SCRIPT, "--audio", sourcePath, "--offset", String(offset), "--duration", String(duration), "--prepare-output", outputPath], {
      cwd: ROOT,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 256 * 1024,
      env: { ...process.env, CUDA_VISIBLE_DEVICES: "", OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1", PYTHONUTF8: "1" },
    });
    const result = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? "{}") as { duration_seconds?: number };
    return Number(result.duration_seconds) || duration;
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException & { stderr?: string };
    const detail = String(error.stderr || error.message || cause).trim();
    if (/^(This runtime can read|Select an audio window|The selected audio window)/iu.test(detail)) throw new AudioInputError(detail);
    throw new Error(detail.slice(-1_500));
  }
}

async function requireInstalledOllamaModel(baseUrl: string, model: string): Promise<string | null> {
  let tags: Response;
  try { tags = await fetch(`${baseUrl}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(5_000) }); }
  catch { throw new MissingRuntimeError(`Cannot reach Ollama at ${baseUrl}. Start the stock Ollama runtime or select llama.cpp.`); }
  if (!tags.ok) throw new MissingRuntimeError(`Ollama at ${baseUrl} returned HTTP ${tags.status} while checking LFM3.`);
  const tagPayload = await tags.json() as { models?: Array<{ name?: string; model?: string }> };
  if (!(tagPayload.models ?? []).some((item) => [item.name, item.model].some((name) => name === model))) {
    throw new MissingRuntimeError(`Ollama model ${model} is missing. Pull it with: ollama pull ${model}`);
  }
  const show = await fetch(`${baseUrl}/api/show`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model }), signal: AbortSignal.timeout(10_000),
  });
  if (!show.ok) throw new MissingRuntimeError(`Ollama could not inspect ${model} (HTTP ${show.status}).`);
  const details = await show.json() as { capabilities?: unknown[]; details?: { quantization_level?: unknown } };
  if (!Array.isArray(details.capabilities) || !details.capabilities.includes("audio")) {
    throw new MissingRuntimeError(`Ollama model ${model} does not advertise audio input.`);
  }
  return typeof details.details?.quantization_level === "string" ? details.details.quantization_level : null;
}

async function runOllama(baseUrl: string, model: string, audioPath: string, prompt: string): Promise<{ text: string; quantization: string | null }> {
  const quantization = await requireInstalledOllamaModel(baseUrl, model);
  const audio = await fs.readFile(audioPath);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt, images: [audio.toString("base64")] }],
      stream: false,
      keep_alive: 0,
      options: { temperature: 0, num_predict: 192 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Ollama LFM3 request failed (HTTP ${response.status}): ${(await response.text()).slice(0, 1_000)}`);
  const payload = await response.json() as { message?: { content?: unknown } };
  if (typeof payload.message?.content !== "string") throw new Error("Ollama LFM3 returned no text response.");
  return { text: payload.message.content, quantization };
}

async function runLlamaCpp(audioPath: string, prompt: string): Promise<string> {
  const configuredExecutable = process.env.AM_STAGE_LFM3_LLAMA_CLI?.trim();
  const model = process.env.AM_STAGE_LFM3_GGUF_MODEL?.trim() || DEFAULT_HF_MODEL;
  if (!/^[\w.-]+\/[\w.-]+(?::[\w.-]+)?$/u.test(model)) throw new Error("AM_STAGE_LFM3_GGUF_MODEL must be a Hugging Face model and quant tag.");
  const gpuLayersRaw = process.env.AM_STAGE_LFM3_GPU_LAYERS?.trim() || "0";
  if (!/^\d{1,3}$/u.test(gpuLayersRaw)) throw new Error("AM_STAGE_LFM3_GPU_LAYERS must be an integer from 0 to 999.");
  const inferenceArgs = ["-hf", model, "--audio", audioPath, "-sys", prompt, "-p", "<__media__>", "--temp", "0", "-n", "192", "--simple-io", "-ngl", gpuLayersRaw];
  const candidates = configuredExecutable
    ? [{ executable: configuredExecutable, prefix: /(?:^|[\\/])llama\.exe$/iu.test(configuredExecutable) ? ["cli"] : [] }]
    : [{ executable: "llama.exe", prefix: ["cli"] }, { executable: "llama-cli.exe", prefix: [] }];
  let lastMissing: string | null = null;
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate.executable, [...candidate.prefix, ...inferenceArgs], {
        cwd: ROOT,
        windowsHide: true,
        timeout: 300_000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: "1" },
      });
      return stdout;
    } catch (cause) {
      const error = cause as NodeJS.ErrnoException & { stderr?: string };
      if (error.code === "ENOENT") { lastMissing = candidate.executable; continue; }
      throw new Error(String(error.stderr || error.message || cause).slice(-1_500));
    }
  }
  throw new MissingRuntimeError(`llama.cpp CLI not found (${lastMissing ?? "llama.exe"}). Install a prebuilt Windows binary with "winget install llama.cpp" or set AM_STAGE_LFM3_LLAMA_CLI; see docs/am-stage-lfm3-audio.md.`);
}

export async function POST(request: Request) {
  const settings = await loadLLMSettings();
  if (!capabilityIsEnabled(settings.capabilityRegistry, "side-meta.lfm3")) return NextResponse.json({ error: "side-meta.lfm3 is disabled in Settings." }, { status: 409 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Expected multipart audio input." }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "Choose an audio file first." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio exceeds the 150 MiB limit." }, { status: 413 });

  let runtime: Lfm3Runtime;
  let window: { offset: number; duration: number };
  try {
    runtime = parseLfm3Runtime(form.get("runtime"));
    window = normalizeLfm3Window(form.get("offset"), form.get("duration"));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
  const mode: Lfm3PromptMode = form.get("mode") === "asr" ? "asr" : "describe";
  const prompt = buildLfm3Prompt(mode);

  if (!acquireEmbeddingModelSlot(SLOT_OWNER)) {
    return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}. Wait for the current model task to finish.` }, { status: 409 });
  }

  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "am-stage-lfm3-"));
    const extension = path.extname(audio.name).replace(/[^.a-z0-9]/giu, "").slice(0, 12) || ".audio";
    const sourcePath = path.join(temporaryDirectory, `${randomUUID()}${extension}`);
    const segmentPath = path.join(temporaryDirectory, "segment.wav");
    await fs.writeFile(sourcePath, Buffer.from(await audio.arrayBuffer()));
    const clipDuration = await prepareAudio(sourcePath, segmentPath, window.offset, window.duration);

    await prepareGpuForExternalModel(5_000, SLOT_OWNER);
    let rawText: string;
    let model: string;
    let quantization: string | null;
    if (runtime === "ollama") {
      const baseUrl = ollamaBaseUrl();
      model = process.env.AM_STAGE_LFM3_OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
      const result = await runOllama(baseUrl, model, segmentPath, prompt);
      rawText = result.text;
      quantization = result.quantization;
    } else {
      const modelSpec = process.env.AM_STAGE_LFM3_GGUF_MODEL?.trim() || DEFAULT_HF_MODEL;
      rawText = await runLlamaCpp(segmentPath, prompt);
      model = modelSpec.split(":")[0];
      quantization = modelSpec.split(":")[1] ?? null;
    }
    const text = cleanLfm3Output(rawText);
    if (!text) throw new Error("LFM3 returned empty output. Check the llama.cpp CLI, audio projector, and prompt configuration.");
    return NextResponse.json({ text, model, runtime, quantization, mode, ran_at: new Date().toISOString(), offset_seconds: window.offset, duration_seconds: clipDuration });
  } catch (error) {
    const missing = error instanceof MissingRuntimeError;
    const invalidAudio = error instanceof AudioInputError;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ...(missing ? { install_hint: true } : {}) }, { status: missing ? 409 : invalidAudio ? 400 : 500 });
  } finally {
    releaseEmbeddingModelSlot(SLOT_OWNER);
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
