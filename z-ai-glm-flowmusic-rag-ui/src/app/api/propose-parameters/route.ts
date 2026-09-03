// POST /api/propose-parameters
//
// Replaces the FastAPI `POST /api/propose-parameters` endpoint.
//
// Flow:
//   1. Embed `query` with `bge-m3:q8_0` (real Ollama call, with a
//      deterministic fallback when Ollama is unreachable — see
//      `rag-ollama.ts`).
//   2. Cosine-rank every stored parameter embedding.
//   3. Return the TOP `top_k` (default 25) parameters, each pre-loaded
//      with its dataset `default` as `suggested_value` / `current_value`
//      (LLM is forbidden by the task spec — the user fine-tunes from
//      there via the slider / select / text controls).

import { NextResponse } from "next/server";
import { ensureDatasetLoaded } from "@/lib/rag-dataset";
import {
  invalidateSearchCache,
  semanticSearch,
  isCacheStale,
} from "@/lib/rag-search";
import type { ProposeParametersRequest, ProposeParametersResponse } from "@/lib/rag-types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: ProposeParametersRequest;
  try {
    body = (await req.json()) as ProposeParametersRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" ? body.query : "";
  if (!query.trim()) {
    const payload: ProposeParametersResponse = {
      query: "",
      used_fallback: false,
      total_vectorized: 0,
      results: [],
    };
    return NextResponse.json(payload);
  }

  const topK = typeof body.top_k === "number" ? body.top_k : 25;

  try {
    await ensureDatasetLoaded();

    // If the vectorization job has written new rows since we cached the
    // search matrix, refresh it so we never miss freshly-embedded params.
    if (await isCacheStale()) {
      invalidateSearchCache();
    }

    const result = await semanticSearch({ query, topK });

    const payload: ProposeParametersResponse = {
      query: result.query,
      used_fallback: result.usedFallback,
      total_vectorized: result.totalVectorized,
      results: result.results,
    };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
