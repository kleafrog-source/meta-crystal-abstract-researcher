import { promises as fs } from "node:fs";

import {
  getLastOllamaError,
  getOllamaBaseUrl,
  getOllamaModel,
  getOllamaTimeouts,
  probeOllama,
} from "@/lib/ollama-client";
import { getAnchorsMeta, getEnrichedDataset, getRetrievalIndexMeta } from "@/lib/rag-v2/dataset";
import { getAnchorsJobState, getRetrievalIndexJobState } from "@/lib/rag-v2/build-jobs";
import {
  RAG_V2_ANCHORS_PATH,
  RAG_V2_AXES_PATH,
  RAG_V2_DATASET_PATH,
  RAG_V2_LEXICAL_DIR,
  RAG_V2_POLARITY_PATH,
  RAG_V2_RETRIEVAL_INDEX_PATH,
} from "@/lib/rag-v2/paths";
import { getRetrievalCacheSize } from "@/lib/rag-v2/search";
import type { StatusResponse } from "@/lib/rag-v2/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const requiredFiles = await Promise.all(
      [
        ["dataset", RAG_V2_DATASET_PATH],
        ["axes", RAG_V2_AXES_PATH],
        ["polarity", RAG_V2_POLARITY_PATH],
        ["anchors", RAG_V2_ANCHORS_PATH],
        ["retrieval_index", RAG_V2_RETRIEVAL_INDEX_PATH],
        ["lexical", RAG_V2_LEXICAL_DIR],
      ].map(async ([name, target]) => {
        try {
          await fs.access(target);
          return { name, exists: true };
        } catch {
          return { name, exists: false };
        }
      }),
    );

    const dataset = await getEnrichedDataset();
    const anchors = await getAnchorsMeta();
    const retrievalIndex = await getRetrievalIndexMeta();
    const ollama = await probeOllama();
    const timeouts = getOllamaTimeouts();
    const retrievalJob = getRetrievalIndexJobState();
    const anchorsJob = getAnchorsJobState();

    const payload: StatusResponse = {
      artifacts_ready: requiredFiles.every((entry) => entry.exists),
      total_parameters: dataset.length,
      anchors_stub: anchors.stub,
      axes_enabled: !anchors.stub,
      ollama_reachable: ollama.reachable,
      ollama_model: getOllamaModel(),
      ollama_base_url: getOllamaBaseUrl(),
      probe_timeout_ms: timeouts.probeTimeoutMs,
      embed_timeout_ms: timeouts.embedTimeoutMs,
      anchors_generated_at: anchors.generatedAt,
      retrieval_index_ready: retrievalIndex.ready,
      retrieval_index_count: retrievalIndex.count,
      retrieval_index_generated_at: retrievalIndex.generatedAt,
      retrieval_index_model: retrievalIndex.model,
      retrieval_cache_size: getRetrievalCacheSize(),
      retrieval_job: {
        running: retrievalJob.running,
        started_at: retrievalJob.startedAt,
        finished_at: retrievalJob.finishedAt,
        exit_code: retrievalJob.exitCode,
        last_error: retrievalJob.lastError,
        log_tail: retrievalJob.logTail,
        progress: retrievalJob.progress,
      },
      anchors_job: {
        running: anchorsJob.running,
        started_at: anchorsJob.startedAt,
        finished_at: anchorsJob.finishedAt,
        exit_code: anchorsJob.exitCode,
        last_error: anchorsJob.lastError,
        log_tail: anchorsJob.logTail,
        progress: anchorsJob.progress,
      },
      required_files: requiredFiles,
      last_error: ollama.error ?? getLastOllamaError(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
