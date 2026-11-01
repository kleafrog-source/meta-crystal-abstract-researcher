import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { prepareGpuForExternalModel } from "@/lib/ollama-memory";
import { getSainaHelmBaseUrl } from "@/lib/saina-helm-runtime";
import { INDIC_LANGUAGE_TAGS, type HelmGateValue, type SegmentSideMeta } from "@/lib/segment-side-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const SCRIPT = path.join(ROOT, "python_engine", "stage6_audio_specialists.py");
const SLOT_OWNER = "am-stage-side-metadata";
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const HELM_MODEL = process.env.AM_STAGE_SAINA_HELM_MODEL || "run-saina/saina-helm-3-0.8b";
const GENDER_MODEL = "prithivMLmods/Common-Voice-Gender-Detection";
const LANGUAGE_MODEL = "onecxi/vakgyata-tiny";

type Specialist = "helm" | "gender" | "language";

class AudioInputError extends Error {}
class MissingModelError extends Error {}

function modelPath(kind: Exclude<Specialist, "helm">): string {
  const variable = kind === "gender" ? "AM_STAGE_GENDER_MODEL_PATH" : "AM_STAGE_VAKGYATA_MODEL_PATH";
  const defaultDir = kind === "gender" ? "gender-detection" : "vakgyata-tiny";
  return path.resolve(process.env[variable] || path.join(ROOT, "data", "models", "am-stage", defaultDir));
}

async function installedLocalModel(kind: Exclude<Specialist, "helm">): Promise<boolean> {
  const directory = modelPath(kind);
  try {
    const files = await fs.readdir(directory);
    return files.includes("config.json") && files.some((file) => file.endsWith(".safetensors"));
  } catch {
    return false;
  }
}

async function installedHelm(baseUrl: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Saina runtime responded with HTTP ${response.status} while checking installed models.`);
  const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
  const expected = HELM_MODEL.toLowerCase();
  return (payload.models ?? []).some((item) => {
    const name = String(item.name ?? item.model ?? "").toLowerCase();
    return name === expected || name === `${expected}:latest`;
  });
}

async function runPython(args: string[], timeout: number) {
  try {
    const { stdout, stderr } = await execFileAsync(PYTHON, ["-u", SCRIPT, ...args], {
      cwd: ROOT,
      windowsHide: true,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, CUDA_VISIBLE_DEVICES: "", PYTHONUTF8: "1" },
    });
    const line = stdout.trim().split(/\r?\n/).at(-1) ?? "{}";
    return { result: JSON.parse(line) as Record<string, unknown>, stderr };
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const detail = String(error.stderr || error.message || cause).trim();
    if (/model files are missing/i.test(detail)) throw new MissingModelError(detail);
    if (/^(this runtime can read|select an audio window|the selected audio window)/i.test(detail)) throw new AudioInputError(detail);
    throw new Error(detail.slice(-2_000));
  }
}

function normalizeProbability(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function helmGate(answer: unknown): HelmGateValue {
  const record = answer && typeof answer === "object" ? answer as Record<string, unknown> : {};
  const probabilities = record.probabilities && typeof record.probabilities === "object" ? record.probabilities as Record<string, unknown> : {};
  const yes = normalizeProbability(probabilities.true ?? probabilities.yes ?? record.probability);
  const no = normalizeProbability(probabilities.false ?? probabilities.no);
  const rawValue = record.noul ?? record.value ?? record.choice;
  const value = typeof rawValue === "boolean" ? rawValue : typeof rawValue === "string" && /^(true|false|yes|no)$/i.test(rawValue) ? /^(true|yes)$/i.test(rawValue) : yes === null ? null : yes >= 0.5;
  return {
    value,
    probability: yes,
    probabilities: { true: yes, false: no },
    confidence: normalizeProbability(record.confidence),
  };
}

function specialistFromResult(kind: Specialist, result: Record<string, unknown>): Partial<SegmentSideMeta> {
  const ran_at = new Date().toISOString();
  if (kind === "helm") {
    const answers = result.answers && typeof result.answers === "object" ? result.answers as Record<string, unknown> : {};
    const gates = { has_vocals: helmGate(answers.has_vocals), has_speech: helmGate(answers.has_speech), aggressive_vocal: helmGate(answers.aggressive_vocal), is_ambient_noise: helmGate(answers.is_ambient_noise) };
    if (Object.values(gates).every((gate) => gate.value === null && gate.probability === null)) throw new Error("Saina Helm returned no parseable gate answers.");
    return { helm: { model: String(result.model ?? HELM_MODEL), ran_at, gates } };
  }
  if (kind === "gender") {
    const female = normalizeProbability(result.probabilities && typeof result.probabilities === "object" ? (result.probabilities as Record<string, unknown>).female : null) ?? 0;
    const male = normalizeProbability(result.probabilities && typeof result.probabilities === "object" ? (result.probabilities as Record<string, unknown>).male : null) ?? 0;
    const label = result.label === "male" || result.label === "female" ? result.label : "unknown";
    return { gender: { model: String(result.model ?? GENDER_MODEL), ran_at, label, score: normalizeProbability(result.score) ?? 0, probabilities: { male, female }, semantics: "acoustic_voice_presentation" } };
  }
  const tags = Array.isArray(result.tags) ? result.tags.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const code = String(item.code ?? "");
    if (!(INDIC_LANGUAGE_TAGS as readonly string[]).includes(code)) return [];
    const confidence = normalizeProbability(item.confidence);
    if (confidence === null) return [];
    return [{ code: code as (typeof INDIC_LANGUAGE_TAGS)[number], label: String(item.label ?? code), confidence }];
  }) : [];
  return { language: { model: String(result.model ?? LANGUAGE_MODEL), ran_at, tags, top_confidence: normalizeProbability(result.top_confidence) ?? tags[0]?.confidence ?? 0 } };
}

const HELM_QUESTIONS = {
  has_vocals: { type: "noul", instructions: "Is human singing or vocal performance clearly audible in this audio segment?", criteria: { true: "Clearly audible human singing or vocal performance is present.", false: "No human singing or vocal performance is clearly audible." } },
  has_speech: { type: "noul", instructions: "Is intelligible or speech-like human speech audible in this audio segment?", criteria: { true: "Human speech or speech-like vocalization is audible.", false: "No human speech or speech-like vocalization is audible." } },
  aggressive_vocal: { type: "noul", instructions: "Does the vocal delivery sound aggressive, harsh, shouted, growled, or screamed?", criteria: { true: "The vocal delivery is audibly aggressive, harsh, shouted, growled, or screamed.", false: "The vocal delivery is not audibly aggressive or harsh." } },
  is_ambient_noise: { type: "noul", instructions: "Is this segment primarily ambient environmental noise rather than intentional musical sound?", criteria: { true: "The segment is primarily ambient environmental noise.", false: "The segment is primarily intentional musical or other non-ambient-noise sound." } },
} as const;

export async function POST(request: Request) {
  const form = await request.formData();
  const kind = form.get("specialist");
  if (kind !== "helm" && kind !== "gender" && kind !== "language") return NextResponse.json({ error: "Choose Helm, gender, or vakgyata-tiny." }, { status: 400 });
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "Choose an audio file." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio exceeds the 150 MiB limit." }, { status: 413 });
  const offset = Math.max(0, Number(form.get("offset")) || 0);
  const duration = Number(form.get("duration"));
  const maxDuration = kind === "helm" ? 10 : 30;
  if (!Number.isFinite(duration) || duration < 0.25 || duration > maxDuration) return NextResponse.json({ error: `Select a ${kind === "helm" ? "0.25–10" : "0.25–30"}-second segment.` }, { status: 400 });

  let helmBaseUrl: string | null = null;
  if (kind === "helm") {
    try {
      helmBaseUrl = getSainaHelmBaseUrl();
      if (!(await installedHelm(helmBaseUrl))) {
        return NextResponse.json({ error: `Saina Helm model ${HELM_MODEL} is missing from ${helmBaseUrl}. Start the isolated Saina runtime and pull the model; see docs/am-stage-side-metadata.md.`, install_hint: true }, { status: 409 });
      }
    } catch (error) {
      return NextResponse.json({ error: `Cannot reach the configured Saina runtime (AM_STAGE_SAINA_BASE_URL, default http://127.0.0.1:11435): ${error instanceof Error ? error.message : String(error)}. Start scripts/start-saina-serve.ps1; stock Ollama on 11434 is not used for Helm.` }, { status: 503 });
    }
  } else if (!(await installedLocalModel(kind))) {
    const installCommand = kind === "gender"
      ? "hf download prithivMLmods/Common-Voice-Gender-Detection config.json preprocessor_config.json model.safetensors --local-dir data/models/am-stage/gender-detection"
      : "hf download onecxi/vakgyata-tiny config.json preprocessor_config.json model.safetensors --local-dir data/models/am-stage/vakgyata-tiny";
    return NextResponse.json({ error: `Optional ${kind === "gender" ? "voice-presentation" : "vakgyata-tiny"} weights are missing. Install with: ${installCommand}`, install_hint: true }, { status: 409 });
  }
  const slotOwner = SLOT_OWNER;
  if (!acquireEmbeddingModelSlot(slotOwner)) return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });

  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "am-stage-side-meta-"));
    const sourcePath = path.join(temporaryDirectory, `${randomUUID()}.audio`);
    const segmentPath = path.join(temporaryDirectory, "segment.wav");
    await fs.writeFile(sourcePath, Buffer.from(await audio.arrayBuffer()));
    const { result: prepared } = await runPython(["--audio", sourcePath, "--offset", String(offset), "--duration", String(duration), "--prepare-output", segmentPath], 60_000);
    await prepareGpuForExternalModel(5_000, slotOwner);
    let rawResult: Record<string, unknown>;
    if (kind === "helm") {
      const runtimeUrl = helmBaseUrl;
      if (!runtimeUrl) throw new Error("Saina Helm runtime URL was not initialized.");
      const response = await fetch(`${runtimeUrl}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: HELM_MODEL, state: "Classify this audio segment using the typed gates.", images: [Buffer.from(await fs.readFile(segmentPath)).toString("base64")], questions: HELM_QUESTIONS, keep_alive: 0 }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 800);
        if (response.status === 404 || response.status === 405) throw new MissingModelError("The configured runtime has no compatible /v1/systemone endpoint. Install and configure the Saina Ollama build; see docs/am-stage-side-metadata.md.");
        throw new Error(`Saina Helm request failed (HTTP ${response.status}): ${detail}`);
      }
      rawResult = await response.json() as Record<string, unknown>;
    } else {
      const { result } = await runPython([
        "--kind", kind,
        "--audio", segmentPath,
        "--duration", String(prepared.duration_seconds),
        "--offset", "0",
        "--model-path", modelPath(kind),
      ], 240_000);
      rawResult = result;
    }
    const sideMeta = { schema: "segment_side_meta_v1", ...specialistFromResult(kind, rawResult) } satisfies Partial<SegmentSideMeta>;
    return NextResponse.json({ side_meta: sideMeta, duration_seconds: prepared.duration_seconds });
  } catch (error) {
    const missing = error instanceof MissingModelError;
    const invalidAudio = error instanceof AudioInputError;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), ...(missing ? { install_hint: true } : {}) }, { status: missing ? 409 : invalidAudio ? 400 : 500 });
  } finally {
    releaseEmbeddingModelSlot(slotOwner);
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
