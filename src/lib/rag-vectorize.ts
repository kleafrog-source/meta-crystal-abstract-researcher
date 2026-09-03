import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  buildEmbeddingText,
  ensureDatasetLoaded,
  rowToRaw,
} from "@/lib/rag-dataset";
import {
  embedText,
  getLastOllamaError,
  getLastOllamaReachability,
  probeOllama,
} from "@/lib/ollama-client";
import { invalidateSearchCache } from "@/lib/rag-search";
import type { RawParameter } from "@/lib/rag-types";

export interface VectorizationJobState {
  running: boolean;
  processedInRun: number;
  totalInRun: number;
  errorsInRun: number;
  ollamaReachable: boolean;
  startedAt: number;
  finishedAt: number;
  lastError: string | null;
  resetRequested: boolean;
}

let jobState: VectorizationJobState = {
  running: false,
  processedInRun: 0,
  totalInRun: 0,
  errorsInRun: 0,
  ollamaReachable: false,
  startedAt: 0,
  finishedAt: 0,
  lastError: null,
  resetRequested: false,
};

export function getVectorizationJobState(): VectorizationJobState {
  return { ...jobState };
}

export function startVectorizationJob(options: {
  reset: boolean;
}): { started: boolean; reason?: string } {
  if (jobState.running) {
    return { started: false, reason: "already_running" };
  }

  jobState = {
    running: true,
    processedInRun: 0,
    totalInRun: 0,
    errorsInRun: 0,
    ollamaReachable: false,
    startedAt: Date.now(),
    finishedAt: 0,
    lastError: null,
    resetRequested: options.reset,
  };

  void runVectorizationJob(options.reset).catch((error) => {
    jobState.running = false;
    jobState.finishedAt = Date.now();
    jobState.lastError =
      error instanceof Error ? error.message : String(error);
  });

  return { started: true };
}

async function runVectorizationJob(reset: boolean): Promise<void> {
  await ensureDatasetLoaded();

  const probe = await probeOllama();
  jobState.ollamaReachable = probe.reachable;

  if (!probe.reachable) {
    jobState.running = false;
    jobState.finishedAt = Date.now();
    jobState.lastError = probe.error;
    return;
  }

  if (reset) {
    await db.parameter.updateMany({
      data: {
        isVectorized: false,
        valueVectors: null,
      },
    });
  }

  const pendingRows = await db.parameter.findMany({
    where: {
      isVectorized: false,
    },
    select: {
      id: true,
      technicalName: true,
      uiElement: true,
      minValue: true,
      maxValue: true,
      step: true,
      defaultValue: true,
      unit: true,
      options: true,
      minLength: true,
      maxLength: true,
      lyriaPromptTags: true,
      semanticKeywords: true,
    },
  });

  jobState.totalInRun = pendingRows.length;

  if (pendingRows.length === 0) {
    jobState.running = false;
    jobState.finishedAt = Date.now();
    invalidateSearchCache();
    return;
  }

  const concurrency = 2;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= pendingRows.length) {
        return;
      }

      const row = pendingRows[currentIndex];

      try {
        const rawParameter = rowToRaw(row);
        const valueVectors = await buildValueVectors(rawParameter);

        await db.parameter.update({
          where: {
            id: row.id,
          },
          data: {
            valueVectors: valueVectors as Prisma.InputJsonValue,
            isVectorized: true,
          },
        });

        jobState.processedInRun += 1;
      } catch (error) {
        jobState.processedInRun += 1;
        jobState.errorsInRun += 1;

        if (!jobState.lastError) {
          jobState.lastError =
            error instanceof Error ? error.message : String(error);
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  jobState.running = false;
  jobState.finishedAt = Date.now();
  jobState.ollamaReachable = getLastOllamaReachability();
  jobState.lastError = jobState.lastError ?? getLastOllamaError();
  invalidateSearchCache();
}

async function buildValueVectors(rawParameter: RawParameter): Promise<number[][]> {
  if (rawParameter.ui_element === "Range") {
    const keywords = rawParameter.semantic_keywords.join(" ");
    const prefix = `${rawParameter.technical_name}. ${keywords}.`;
    const vectorMin = await embedText(
      `${prefix} Контекст значения: минимальный, слабый, тихий, тонкий, низкий, медленный, едва заметный.`,
    );
    const vectorDefault = await embedText(
      `${prefix} Контекст значения: стандартный, средний, обычный, сбалансированный, по умолчанию.`,
    );
    const vectorMax = await embedText(
      `${prefix} Контекст значения: максимальный, глубокий, мощный, агрессивный, огромный, быстрый, сильный.`,
    );

    return [vectorMin, vectorDefault, vectorMax];
  }

  const baseVector = await embedText(buildEmbeddingText(rawParameter));
  return [baseVector, baseVector, baseVector];
}
