import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { callSidecar, listTasks } from "@/lib/engine/runner";
import { loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { prepareGpuForEmbeddingModel, ensureOllamaModelAvailable } from "@/lib/ollama-memory";
import { getConfiguredTextIndexModel, getTextIndexDirectory } from "@/lib/rag-v3/composite-index";
import { searchV3 } from "@/lib/rag-v3/search";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 7200;

const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 30;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SLOT_OWNER = "gemma-audio-search";

async function readGemmaTextManifest(modelId: string): Promise<{ status: string; dimensions: number; reason?: string } | null> {
  try {
    const raw = await fs.readFile(path.join(getTextIndexDirectory("embeddinggemma2"), "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as { model?: string; dimensions?: number };
    if (manifest.model !== modelId || manifest.dimensions !== 768) return { status: "stale_vectors", dimensions: Number(manifest.dimensions) || 0, reason: "Model or vector dimensions differ from the configured Gemma text bank." };
    return { status: "ready", dimensions: manifest.dimensions };
  } catch { return null; }
}

class MediaInputError extends Error {}

function inspectPcmWav(buffer: Buffer): { durationSeconds: number; sampleRate: number; channels: number; format: string } {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new MediaInputError("Audio conversion did not produce a valid WAV file.");
  let format: number | null = null, channels: number | null = null, sampleRate: number | null = null, bytesPerSecond: number | null = null, dataSize: number | null = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.toString("ascii", offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > buffer.length) throw new MediaInputError("The WAV file has an invalid chunk length.");
    if (chunk === "fmt " && size >= 16) { format = buffer.readUInt16LE(start); channels = buffer.readUInt16LE(start + 2); sampleRate = buffer.readUInt32LE(start + 4); bytesPerSecond = buffer.readUInt32LE(start + 8); }
    else if (chunk === "data") dataSize = size;
    offset = start + size + (size % 2);
  }
  if (format !== 1 || channels !== 1 || sampleRate !== 48_000 || !bytesPerSecond || !dataSize) throw new MediaInputError("Gemma chunks must be mono 48 kHz PCM WAV.");
  const durationSeconds = dataSize / bytesPerSecond;
  if (durationSeconds < 0.25 || durationSeconds > MAX_AUDIO_SECONDS + 0.001) throw new MediaInputError(`Each audio chunk must be between 0.25 and ${MAX_AUDIO_SECONDS} seconds.`);
  return { durationSeconds, sampleRate, channels, format: "PCM WAV" };
}

function inspectPng(buffer: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") throw new MediaInputError("Choose a PNG spectrogram image.");
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width > 2_048 || height > 2_048 || width * height > 4_194_304) throw new MediaInputError("PNG dimensions must be at most 2048 × 2048 pixels.");
}

function makeWindows(duration: number, chunkSeconds: number, overlapSeconds: number) {
  if (duration < 0.25) throw new MediaInputError("Audio must be at least 0.25 seconds long.");
  const chunk = Math.max(1, Math.min(MAX_AUDIO_SECONDS, chunkSeconds));
  const hop = Math.max(0.25, chunk - Math.max(0, Math.min(2, overlapSeconds)));
  const windows: Array<{ offset: number; duration: number }> = [];
  for (let offset = 0; offset < duration; offset += hop) {
    const remaining = duration - offset;
    if (remaining < 0.25) {
      windows.push({ offset: Math.max(0, duration - 0.25), duration: Math.min(0.25, duration) });
      break;
    }
    const length = Math.min(chunk, remaining);
    windows.push({ offset, duration: length });
    if (length >= remaining) break;
  }
  return windows;
}

interface EmbedResponse { model?: string; embeddings?: number[][] }

function getSelectedLayers(form: FormData): string[] | undefined {
  const value = form.get("domain_layers");
  if (typeof value !== "string") return undefined;
  try { const layers: unknown = JSON.parse(value); return Array.isArray(layers) && layers.every((layer) => typeof layer === "string") ? layers : undefined; } catch { return undefined; }
}

async function acquireSlotOrConflict() {
  return acquireEmbeddingModelSlot(SLOT_OWNER) ? null : NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 }); }
  const modality = form.get("modality");
  if (modality !== "audio" && modality !== "image" && modality !== "unload") return NextResponse.json({ error: "Choose audio or a spectrogram image query." }, { status: 400 });
  const settings = await loadLLMSettings();
  const capability = modality === "image" ? "spec.gemma.*" : "audio.gemma.awtd";
  if (modality !== "unload" && !capabilityIsEnabled(settings.capabilityRegistry, capability)) return NextResponse.json({ error: `${capability} is disabled in Settings.` }, { status: 409 });

  const conflict = await acquireSlotOrConflict();
  if (conflict) return conflict;
  if (modality === "audio") return streamAudioSearch(request, form);
  try {
    const model = await getConfiguredTextIndexModel("embeddinggemma2");
    const { baseUrl } = await loadEmbeddingRuntimeSettings();
    if (modality === "unload") {
      const unload = await fetch(`${baseUrl}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }), signal: AbortSignal.timeout(15_000) });
      if (!unload.ok) return NextResponse.json({ error: `Could not unload EmbeddingGemma 2 (HTTP ${unload.status}).` }, { status: 502 });
      return NextResponse.json({ ok: true, modality: "unload" });
    }
    const inputFile = form.get("image");
    if (!(inputFile instanceof File) || inputFile.size === 0) return NextResponse.json({ error: "Choose a spectrogram PNG." }, { status: 400 });
    if (inputFile.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Spectrogram image exceeds the 10 MiB limit." }, { status: 413 });
    const mediaBuffer = Buffer.from(await inputFile.arrayBuffer()); inspectPng(mediaBuffer);
    const artifact = await readGemmaTextManifest(model);
    if (!artifact || artifact.status !== "ready") return NextResponse.json({ error: `EmbeddingGemma 2 text index is unavailable${artifact?.reason ? `: ${artifact.reason}` : ". Build it from Service Bay first."}` }, { status: 409 });
    await ensureOllamaModelAvailable(model); await prepareGpuForEmbeddingModel(model, 5_000, SLOT_OWNER);
    const response = await fetch(`${baseUrl}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, input: { image: mediaBuffer.toString("base64") }, keep_alive: 0 }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) });
    if (!response.ok) throw new Error(`Ollama spectrogram embedding failed (HTTP ${response.status}): ${(await response.text()).slice(0, 1_000)}`);
    const payload = await response.json() as EmbedResponse, vector = payload.embeddings?.[0];
    if (!Array.isArray(vector) || vector.length !== artifact.dimensions) throw new Error(`Gemma image vector dimensions differ from the text index (${vector?.length ?? 0} vs ${artifact.dimensions ?? 0}).`);
    const offset = Math.max(0, Number(form.get("offset")) || 0);
    const search = await searchV3({ query: "Spectrogram image input", topK: Number(form.get("top_k")) || 30, currentValues: {}, instructionContext: [], sources: { library: true, atoms: false, generated: true }, selectedDomainLayers: getSelectedLayers(form), textIndex: "embeddinggemma2", queryEmbedding: vector, modelSlotOwner: SLOT_OWNER });
    return NextResponse.json({ modality, model, dimensions: vector.length, duration_seconds: null, offset_seconds: offset, results: search.results as ActiveParameter[], total_candidates: search.total_candidates, total_scoped: search.total_scoped, domain_retrieval: search.domain_retrieval });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: error instanceof MediaInputError ? 400 : 500 });
  } finally { releaseEmbeddingModelSlot(SLOT_OWNER); }
}

async function streamAudioSearch(request: Request, form: FormData) {
  const inputFile = form.get("audio");
  if (!(inputFile instanceof File) || !inputFile.size) { releaseEmbeddingModelSlot(SLOT_OWNER); return NextResponse.json({ error: "Choose an audio file." }, { status: 400 }); }
  if (inputFile.size > MAX_AUDIO_BYTES) { releaseEmbeddingModelSlot(SLOT_OWNER); return NextResponse.json({ error: "Audio file exceeds the 150 MiB limit." }, { status: 413 }); }
  let tempDir: string | null = null;
  let warmedModel = false;
  let slotTransferredToStream = false;
  const jobTitle = `EmbeddingGemma audio ${randomUUID()}`;
  try {
    const originalExtension = path.extname(inputFile.name).toLowerCase();
    const extension = /^\.[a-z0-9]{2,8}$/.test(originalExtension) ? originalExtension : ".audio";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gemma-audio-search-"));
    const sourcePath = path.join(tempDir, `source${extension}`);
    await fs.writeFile(sourcePath, Buffer.from(await inputFile.arrayBuffer()));
    const { result: info } = await callSidecar<{ duration_seconds?: number }>("audio_info", { args: [sourcePath], timeoutMs: 15 * 60_000, taskType: "gemma-audio-convert", title: jobTitle });
    const durationSeconds = Number((info as { duration_seconds?: unknown } | null)?.duration_seconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0.25) throw new MediaInputError("Audio must be at least 0.25 seconds and decodable by the CLAP audio pipeline.");
    const model = await getConfiguredTextIndexModel("embeddinggemma2");
    const artifact = await readGemmaTextManifest(model);
    if (!artifact || artifact.status !== "ready") throw new Error(`EmbeddingGemma 2 text index is unavailable${artifact?.reason ? `: ${artifact.reason}` : ". Build it from Service Bay first."}`);
    await ensureOllamaModelAvailable(model);
    const { baseUrl } = await loadEmbeddingRuntimeSettings();
    await prepareGpuForEmbeddingModel(model, 5_000, SLOT_OWNER);
    warmedModel = true;
    const windows = makeWindows(durationSeconds, Number(form.get("chunk_seconds")) || 30, Number(form.get("overlap_seconds")) || 0);
    const topK = Math.max(1, Math.min(100, Math.trunc(Number(form.get("top_k")) || 30)));
    const selectedDomainLayers = getSelectedLayers(form);
    const output = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const cancelConversions = () => listTasks().filter((task) => task.status === "running" && task.title === jobTitle).forEach((task) => task.cancel());
        request.signal.addEventListener("abort", cancelConversions, { once: true });
        void (async () => {
          const best = new Map<string, ActiveParameter & { source_window: { offset_seconds: number; duration_seconds: number } }>();
          let dimensions = artifact.dimensions ?? 0;
          let totalCandidates = 0;
          let successfulChunks = 0;
          const failedChunks: Array<{ index: number; offset_seconds: number; duration_seconds: number; error: string }> = [];
          try {
            for (let index = 0; index < windows.length; index += 1) {
              if (request.signal.aborted) throw new DOMException("Audio search cancelled", "AbortError");
              const window = windows[index];
              emit({ type: "progress", current: index + 1, total: windows.length, offset_seconds: window.offset });
              const wavPath = path.join(tempDir!, `chunk-${String(index + 1).padStart(5, "0")}.wav`);
              let chunkInfo: ReturnType<typeof inspectPcmWav> | null = null;
              let chunkByteLength = 0;
              try {
                await callSidecar("audio_save_fragment", { args: [sourcePath], inputFile: { output_path: wavPath, offset: window.offset, duration: window.duration, sample_rate: 48_000, mono: true }, timeoutMs: 15 * 60_000, taskType: "gemma-audio-convert", title: jobTitle });
                if (request.signal.aborted) throw new DOMException("Audio search cancelled", "AbortError");
                const chunkBuffer = await fs.readFile(wavPath);
                chunkByteLength = chunkBuffer.byteLength;
                chunkInfo = inspectPcmWav(chunkBuffer);
                const embedResponse = await fetch(`${baseUrl}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, input: { audio: chunkBuffer.toString("base64") }, keep_alive: "5m" }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) });
                if (!embedResponse.ok) throw new Error(`Ollama audio embedding failed (HTTP ${embedResponse.status}): ${(await embedResponse.text()).slice(0, 1_000)}`);
                const embedded = await embedResponse.json() as EmbedResponse;
                const vector = embedded.embeddings?.[0];
                if (!Array.isArray(vector) || vector.length !== artifact.dimensions) throw new Error(`Gemma audio vector dimensions differ from the text index (${vector?.length ?? 0} vs ${artifact.dimensions ?? 0}).`);
                dimensions = vector.length;
                const search = await searchV3({ query: "Audio input", topK, currentValues: {}, instructionContext: [], sources: { library: true, atoms: false, generated: true }, selectedDomainLayers, textIndex: "embeddinggemma2", queryEmbedding: vector, modelSlotOwner: SLOT_OWNER });
                totalCandidates = Math.max(totalCandidates, search.total_candidates);
                for (const parameter of search.results as ActiveParameter[]) {
                  const previous = best.get(parameter.technical_name);
                  if (!previous || parameter.similarity > previous.similarity) best.set(parameter.technical_name, { ...parameter, source_window: { offset_seconds: window.offset, duration_seconds: chunkInfo.durationSeconds } });
                }
                successfulChunks += 1;
                const merged = [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, topK);
                emit({ type: "progress", current: index + 1, total: windows.length, offset_seconds: window.offset, duration_seconds: chunkInfo.durationSeconds, results: merged, total_candidates: totalCandidates, dimensions });
              } catch (error) {
                if (request.signal.aborted) throw error;
                const message = error instanceof Error ? error.message : String(error);
                const failure = { index: index + 1, offset_seconds: window.offset, duration_seconds: chunkInfo?.durationSeconds ?? window.duration, error: message };
                failedChunks.push(failure);
                console.error("[gemma-audio-search] audio chunk failed", {
                  chunk: index + 1,
                  offset_seconds: window.offset,
                  duration_seconds: failure.duration_seconds,
                  sample_rate: chunkInfo?.sampleRate ?? 48_000,
                  channels: chunkInfo?.channels ?? 1,
                  format: chunkInfo?.format ?? "expected mono 48 kHz PCM WAV; output not validated",
                  bytes: chunkByteLength,
                  source_name: inputFile.name,
                  source_path: sourcePath,
                  path: wavPath,
                  error: message,
                });
                emit({ type: "progress", current: index + 1, total: windows.length, offset_seconds: window.offset, duration_seconds: failure.duration_seconds, failed: true, error: message, failed_chunks: failedChunks.length });
              }
            }
            if (successfulChunks === 0) throw new Error(`All ${windows.length} audio chunks failed. First error: ${failedChunks[0]?.error ?? "no chunk produced a vector"}`);
            emit({ type: "complete", modality: "audio", model, dimensions, duration_seconds: durationSeconds, chunks: successfulChunks, total: windows.length, failed_chunks: failedChunks, total_candidates: totalCandidates, results: [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, topK) });
          } catch (error) {
            if (!request.signal.aborted) emit({ type: "error", error: error instanceof Error ? error.message : String(error) });
          } finally {
            request.signal.removeEventListener("abort", cancelConversions);
            if (warmedModel) await fetch(`${baseUrl}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }), signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
            releaseEmbeddingModelSlot(SLOT_OWNER);
            if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
            try { controller.close(); } catch { /* The client may already have cancelled the stream. */ }
          }
        })();
      },
      cancel() { listTasks().filter((task) => task.status === "running" && task.title === jobTitle).forEach((task) => task.cancel()); },
    });
    slotTransferredToStream = true;
    return new Response(output, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (warmedModel) {
      const { baseUrl } = await loadEmbeddingRuntimeSettings().catch(() => ({ baseUrl: "" }));
      if (baseUrl) await fetch(`${baseUrl}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: await getConfiguredTextIndexModel("embeddinggemma2"), prompt: "", stream: false, keep_alive: 0 }), signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: error instanceof MediaInputError ? 400 : 500 });
  } finally {
    if (!slotTransferredToStream) {
      releaseEmbeddingModelSlot(SLOT_OWNER);
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
