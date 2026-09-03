// Background vectorization job.
//
// `POST /api/vectorize` kicks this off and returns immediately. The
// frontend then polls `GET /api/vectorization-status` for live progress.
// This avoids HTTP timeouts when running against a real, slow Ollama
// instance that must embed 2.7k parameters one at a time.
//
// The job embeds `technical_name + semantic_keywords` for every parameter
// where `is_vectorized=false` (or for *all* parameters when `reset=true`).
// Real Ollama calls run with a bounded concurrency pool; the deterministic
// fallback is essentially instant.

import { db } from "@/lib/db";
import {
  buildEmbeddingText,
  ensureDatasetLoaded,
  rowToRaw,
} from "./rag-dataset";
import {
  embed,
  getCurrentMode,
  getOllamaError,
  getOllamaReachable,
  probeOllama,
  resetModeCache,
  type EmbedResult,
} from "./rag-ollama";

export interface JobState {
  running: boolean;
  processedInRun: number;
  totalInRun: number;
  errorsInRun: number;
  usedFallback: boolean;
  ollamaReachable: boolean;
  startedAt: number;
  finishedAt: number;
  lastError: string | null;
  resetRequested: boolean;
}

let job: JobState = {
  running: false,
  processedInRun: 0,
  totalInRun: 0,
  errorsInRun: 0,
  usedFallback: false,
  ollamaReachable: false,
  startedAt: 0,
  finishedAt: 0,
  lastError: null,
  resetRequested: false,
};

export function getJobState(): JobState {
  return { ...job };
}

export function isJobRunning(): boolean {
  return job.running;
}

/** Kick off vectorization in the background. Returns immediately. If a
 *  job is already running the call is rejected with a reason string. */
export function startVectorization(opts: { reset: boolean }): {
  started: boolean;
  reason?: string;
} {
  if (job.running) {
    return { started: false, reason: "already_running" };
  }
  job = {
    running: true,
    processedInRun: 0,
    totalInRun: 0,
    errorsInRun: 0,
    usedFallback: false,
    ollamaReachable: false,
    startedAt: Date.now(),
    finishedAt: 0,
    lastError: null,
    resetRequested: opts.reset,
  };
  // Fire and forget — never awaited by the API route.
  void runVectorization(opts.reset).catch((err) => {
    job.running = false;
    job.finishedAt = Date.now();
    job.lastError =
      err instanceof Error ? err.message : `Vectorization crashed: ${err}`;
    console.error("[rag-vectorize] job crashed:", err);
  });
  return { started: true };
}

async function runVectorization(reset: boolean): Promise<void> {
  // 1. Make sure the DB has the full dataset.
  await ensureDatasetLoaded();

  // 2. (Re)probe Ollama so `used_fallback` reflects the current run.
  resetModeCache();
  const probe = await probeOllama();
  job.ollamaReachable = probe.reachable;
  job.usedFallback = !probe.reachable;

  // 3. Reset flag if requested.
  if (reset) {
    await db.parameter.updateMany({
      data: { isVectorized: false, embedding: null },
    });
  }

  // 4. Gather the rows still needing vectorization.
  const pendingRows = await db.parameter.findMany({
    where: { isVectorized: false },
    select: { id: true, technicalName: true, semanticKeywords: true },
  });
  job.totalInRun = pendingRows.length;

  if (pendingRows.length === 0) {
    job.running = false;
    job.finishedAt = Date.now();
    return;
  }

  // 5. Embed with a bounded concurrency pool. The real Ollama call is the
  //    slow part (~50-200ms / param), so 6 concurrent requests keep the
  //    throughput reasonable without overwhelming the local server.
  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= pendingRows.length) return;
      const row = pendingRows[idx];
      try {
        // Reconstruct the raw parameter slice we need for the embed text.
        const raw = rowToRaw({
          technicalName: row.technicalName,
          uiElement: "", // not needed for the embed text
          minValue: null,
          maxValue: null,
          step: null,
          defaultValue: "0",
          unit: null,
          options: null,
          minLength: null,
          maxLength: null,
          lyriaPromptTags: "[]",
          semanticKeywords: row.semanticKeywords,
        });
        const text = buildEmbeddingText(raw);
        const result: EmbedResult = await embed(text);
        await db.parameter.update({
          where: { id: row.id },
          data: {
            embedding: JSON.stringify(result.vector),
            isVectorized: true,
          },
        });
        job.processedInRun += 1;
      } catch (err) {
        job.errorsInRun += 1;
        job.processedInRun += 1;
        if (!job.lastError) {
          job.lastError =
            err instanceof Error ? err.message : String(err);
        }
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(worker());
  await Promise.all(workers);

  job.running = false;
  job.finishedAt = Date.now();
  job.ollamaReachable = getOllamaReachable();
  job.usedFallback = getCurrentMode() === "fallback";
  if (job.usedFallback && !job.lastError) {
    job.lastError = getOllamaError();
  }
}
