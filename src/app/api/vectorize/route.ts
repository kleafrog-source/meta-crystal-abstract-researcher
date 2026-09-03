import { NextResponse } from "next/server";

import type { VectorizeRequest, VectorizeResponse } from "@/lib/rag-types";
import { startVectorizationJob } from "@/lib/rag-vectorize";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: VectorizeRequest = {};

  try {
    const raw = await request.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as VectorizeRequest;
    }
  } catch {
    body = {};
  }

  const reset = body.reset === true;
  const result = startVectorizationJob({ reset });

  if (!result.started) {
    const payload: VectorizeResponse = {
      started: false,
      reason: result.reason,
      reset,
    };

    return NextResponse.json(payload, { status: 409 });
  }

  const payload: VectorizeResponse = {
    started: true,
    reset,
  };

  return NextResponse.json(payload);
}
