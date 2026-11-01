import { NextResponse } from "next/server";

import { loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { prepareGpuForEmbeddingModel, ensureOllamaModelAvailable } from "@/lib/ollama-memory";
import { TEXT_INDEX_MODELS } from "@/lib/rag-v3/composite-index";
import { getArtifactStatuses } from "@/lib/rag-v3/managed-rebuild";
import { searchV3 } from "@/lib/rag-v3/search";
import type { ActiveParameter } from "@/lib/rag-v3/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 30;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SLOT_OWNER = "gemma-audio-search";

class MediaInputError extends Error {}

function inspectPcmWav(buffer: Buffer): { durationSeconds: number } {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new MediaInputError("Choose a PCM WAV file.");
  }
  let format: number | null = null;
  let channels: number | null = null;
  let sampleRate: number | null = null;
  let bytesPerSecond: number | null = null;
  let dataSize: number | null = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new MediaInputError("The WAV file has an invalid chunk length.");
    if (chunk === "fmt " && size >= 16) {
      format = buffer.readUInt16LE(start);
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bytesPerSecond = buffer.readUInt32LE(start + 8);
    } else if (chunk === "data") {
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }
  if (format !== 1 || !channels || channels > 2 || !sampleRate || sampleRate < 8_000 || sampleRate > 48_000 || !bytesPerSecond || !dataSize) {
    throw new MediaInputError("Use uncompressed PCM WAV audio, 8–48 kHz, mono or stereo.");
  }
  const durationSeconds = dataSize / bytesPerSecond;
  if (durationSeconds < 0.25 || durationSeconds > MAX_AUDIO_SECONDS) {
    throw new MediaInputError(`Audio must be between 0.25 and ${MAX_AUDIO_SECONDS} seconds.`);
  }
  return { durationSeconds };
}

function inspectPng(buffer: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new MediaInputError("Choose a PNG spectrogram image.");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 2_048 || height > 2_048 || width * height > 4_194_304) {
    throw new MediaInputError("PNG dimensions must be at most 2048 × 2048 pixels.");
  }
}

interface EmbedResponse {
  model?: string;
  embeddings?: number[][];
}

export async function POST(request: Request) {
  if (!acquireEmbeddingModelSlot(SLOT_OWNER)) {
    return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });
  }
  try {
    const form = await request.formData();
    const modality = form.get("modality");
    if (modality !== "audio" && modality !== "image") return NextResponse.json({ error: "Choose audio or a spectrogram image query." }, { status: 400 });
    const inputFile = form.get(modality);
    if (!(inputFile instanceof File) || inputFile.size === 0) return NextResponse.json({ error: modality === "audio" ? "Choose a WAV audio file." : "Choose a spectrogram PNG." }, { status: 400 });
    const mediaBuffer = Buffer.from(await inputFile.arrayBuffer());
    let durationSeconds: number | null = null;
    if (modality === "audio") {
      if (inputFile.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "WAV file exceeds the 15 MiB limit." }, { status: 413 });
      durationSeconds = inspectPcmWav(mediaBuffer).durationSeconds;
    } else {
      if (inputFile.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Spectrogram image exceeds the 10 MiB limit." }, { status: 413 });
      inspectPng(mediaBuffer);
    }

    const artifact = (await getArtifactStatuses()).artifacts.find((item) => item.kind === "embeddinggemma2_text");
    if (!artifact || artifact.status !== "built") {
      return NextResponse.json({ error: `EmbeddingGemma 2 text index is unavailable${artifact?.reason ? `: ${artifact.reason}` : ". Build it from Service Bay first."}` }, { status: 409 });
    }
    const model = TEXT_INDEX_MODELS.embeddinggemma2;
    await ensureOllamaModelAvailable(model);
    const { baseUrl } = await loadEmbeddingRuntimeSettings();
    await prepareGpuForEmbeddingModel(model, 5_000, SLOT_OWNER);
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: { [modality]: mediaBuffer.toString("base64") }, keep_alive: 0 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1_000);
      throw new Error(`Ollama audio embedding failed (HTTP ${response.status}): ${detail}`);
    }
    const payload = await response.json() as EmbedResponse;
    const audioVector = payload.embeddings?.[0];
    if (!Array.isArray(audioVector) || audioVector.length !== artifact.dimensions) {
      throw new Error(`Gemma audio vector dimensions differ from the text index (${audioVector?.length ?? 0} vs ${artifact.dimensions ?? 0}).`);
    }
    const search = await searchV3({
      query: "Audio input",
      topK: Number(form.get("top_k")) || 30,
      currentValues: {},
      instructionContext: [],
      sources: { library: true, frozen: false, atoms: false, generated: true },
      selectedDomainLayers: (() => {
        const value = form.get("domain_layers");
        if (typeof value !== "string") return undefined;
        try { return JSON.parse(value) as string[]; } catch { return undefined; }
      })(),
      textIndex: "embeddinggemma2",
      queryEmbedding: audioVector,
      modelSlotOwner: SLOT_OWNER,
    });
    const offsetSeconds = Math.max(0, Number(form.get("offset")) || 0);
    return NextResponse.json({ modality, model, dimensions: audioVector.length, duration_seconds: durationSeconds, offset_seconds: modality === "image" ? offsetSeconds : null, results: search.results as ActiveParameter[], total_candidates: search.total_candidates, total_scoped: search.total_scoped, domain_retrieval: search.domain_retrieval });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: error instanceof MediaInputError ? 400 : 500 });
  } finally {
    releaseEmbeddingModelSlot(SLOT_OWNER);
  }
}
