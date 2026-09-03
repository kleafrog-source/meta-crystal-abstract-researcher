// GET /api/vectorization-status
//
// Replaces the FastAPI `GET /api/vectorization-status` endpoint. Returns
// the total/vectorised counts plus the live background-job progress so
// the frontend can render a real progress bar while Ollama is grinding
// through 2.7k embeddings.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDatasetLoaded } from "@/lib/rag-dataset";
import { getOllamaReachable, getOllamaError } from "@/lib/rag-ollama";
import { getJobState } from "@/lib/rag-vectorize";
import type { VectorizationStatus } from "@/lib/rag-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatasetLoaded();
    const total = await db.parameter.count();
    const vectorized = await db.parameter.count({
      where: { isVectorized: true },
    });
    const job = getJobState();

    // If a run just finished, make sure the status reflects the real
    // engine reachability from the run rather than a stale probe.
    const ollamaReachable = job.finishedAt
      ? job.ollamaReachable
      : getOllamaReachable();
    const lastError = job.lastError ?? getOllamaError();

    const payload: VectorizationStatus = {
      total_parameters: total,
      vectorized_parameters: vectorized,
      is_ready: vectorized > 0 && vectorized === total,
      is_vectorizing: job.running,
      processed_in_run: job.processedInRun,
      total_in_run: job.totalInRun,
      errors_in_run: job.errorsInRun,
      used_fallback: job.usedFallback || (!job.running && vectorized > 0 && !ollamaReachable),
      ollama_reachable: ollamaReachable,
      last_error: lastError,
    };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
