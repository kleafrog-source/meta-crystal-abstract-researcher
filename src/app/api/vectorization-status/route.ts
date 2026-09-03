import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { ensureDatasetLoaded } from "@/lib/rag-dataset";
import {
  getLastOllamaError,
  getLastOllamaReachability,
} from "@/lib/ollama-client";
import type { VectorizationStatus } from "@/lib/rag-types";
import { getVectorizationJobState } from "@/lib/rag-vectorize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatasetLoaded();

    const totalParameters = await db.parameter.count();
    const vectorizedParameters = await db.parameter.count({
      where: {
        isVectorized: true,
      },
    });
    const job = getVectorizationJobState();

    const payload: VectorizationStatus = {
      total_parameters: totalParameters,
      vectorized_parameters: vectorizedParameters,
      is_ready:
        totalParameters > 0 && vectorizedParameters === totalParameters,
      is_vectorizing: job.running,
      processed_in_run: job.processedInRun,
      total_in_run: job.totalInRun,
      errors_in_run: job.errorsInRun,
      ollama_reachable: job.finishedAt
        ? job.ollamaReachable
        : getLastOllamaReachability(),
      last_error: job.lastError ?? getLastOllamaError(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
