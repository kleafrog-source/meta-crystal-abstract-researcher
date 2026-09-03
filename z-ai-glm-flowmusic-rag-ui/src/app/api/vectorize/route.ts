// POST /api/vectorize
//
// Replaces the FastAPI `POST /api/vectorize` endpoint. Starts the
// background vectorization job (or refuses if one is already running).
// The body may carry `{ "reset": true }` to force a full re-vectorization.

import { NextResponse } from "next/server";
import { startVectorization } from "@/lib/rag-vectorize";
import { invalidateSearchCache } from "@/lib/rag-search";
import type { VectorizeRequest, VectorizeResponse } from "@/lib/rag-types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: VectorizeRequest = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as VectorizeRequest;
  } catch {
    body = {};
  }
  const reset = body.reset === true;

  const result = startVectorization({ reset });
  if (!result.started) {
    const payload: VectorizeResponse = {
      started: false,
      reason: result.reason,
      reset,
    };
    return NextResponse.json(payload, { status: 409 });
  }

  // Drop the search cache so the next query recomputes against fresh
  // embeddings once the job completes.
  invalidateSearchCache();

  const payload: VectorizeResponse = {
    started: true,
    reset,
  };
  return NextResponse.json(payload);
}
