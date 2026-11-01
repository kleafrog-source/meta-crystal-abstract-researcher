import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { callSidecar, listTasks } from "@/lib/engine/runner";
import { runMorphoAudioSearch, stopMorpho } from "@/lib/morpho/jobs";
import { prepareGpuForExternalModel } from "@/lib/ollama-memory";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { isVocalMatrixParameter } from "@/lib/vocal-allocation/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 7200;

const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const TASK_TYPE = "audio-to-parameter";

interface SearchResult {
  results?: ActiveParameter[];
  anchored_count?: number;
  index?: unknown;
  audio?: unknown;
}

export async function DELETE() {
  const running = listTasks().filter(
    (task) => task.status === "running" && task.taskType === TASK_TYPE,
  );
  for (const task of running) task.cancel();
  const morpho = await stopMorpho("search");
  return NextResponse.json({
    ok: true,
    stopped: running.length + (morpho.stopped ? 1 : 0),
  });
}

export async function POST(request: Request) {
  let tempDir: string | null = null;
  let slotOwner: string | null = null;
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 },
      );
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio file exceeds the 150 MB limit." },
        { status: 413 },
      );
    }

    const engine = form.get("engine") === "siglip" ? "siglip" : "clap";
    const offset = Math.max(0, Number(form.get("offset") ?? 0) || 0);
    const duration = Math.max(
      0.1,
      Math.min(600, Number(form.get("duration") ?? 10) || 10),
    );
    const topK = Math.max(
      3,
      Math.min(100, Math.trunc(Number(form.get("top_k") ?? 20) || 20)),
    );
    const vocalMatrix = form.get("vocal_matrix") === "true";
    const searchTopK = vocalMatrix ? Math.max(topK, 100) : topK;
    const requestedDetail = String(form.get("spectrogram_detail") ?? "medium");
    const detail =
      requestedDetail === "low" || requestedDetail === "high"
        ? requestedDetail
        : "medium";
    const requestedLayout = String(form.get("spectrogram_layout") ?? "rgb_delta");
    const layout = requestedLayout === "composite" || requestedLayout === "mel" ? requestedLayout : "rgb_delta";

    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "meta-crystal-audio-segment-"),
    );
    const originalExtension = path.extname(audio.name).toLowerCase();
    const extension = /^\.[a-z0-9]{2,5}$/.test(originalExtension)
      ? originalExtension
      : ".audio";
    const audioPath = path.join(tempDir, `source${extension}`);
    await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));

    if (engine === "siglip") {
      const result = (await runMorphoAudioSearch(
        audioPath,
        offset,
        duration,
        searchTopK,
        detail,
        layout,
      )) as SearchResult;
      return NextResponse.json({
        engine,
        parameters: (result.results ?? []).filter((item) => !vocalMatrix || isVocalMatrixParameter(item)).slice(0, topK),
        anchored_count: result.anchored_count ?? 0,
        index: result.index,
        spectrogram: result.audio,
      });
    }

    slotOwner = "clap-audio-search";
    if (!acquireEmbeddingModelSlot(slotOwner)) return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "unknown"}` }, { status: 409 });
    await prepareGpuForExternalModel(7_000, slotOwner);

    const { result: rawResult } = await callSidecar("audio_search", {
      args: [audioPath],
      inputFile: { offset, duration, top_k: searchTopK },
      timeoutMs: 10 * 60 * 1000,
      taskType: TASK_TYPE,
      title: "Audio-to-Parameter CLAP segment search",
    });
    const result = rawResult as SearchResult;
    return NextResponse.json({
      engine,
      parameters: (result.results ?? []).filter((item) => !vocalMatrix || isVocalMatrixParameter(item)).slice(0, topK),
      anchored_count: result.anchored_count ?? 0,
      index: result.index,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    if (slotOwner) releaseEmbeddingModelSlot(slotOwner);
    if (tempDir)
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
  }
}
