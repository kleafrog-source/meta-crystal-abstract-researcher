import { NextRequest, NextResponse } from "next/server";
import { getMetisResearchStore } from "@/lib/metis-research/store";
import type { ResearchMode, RunConfig } from "@/lib/metis-research/types";
import { DEFAULT_PIPELINE_VERSION } from "@/lib/metis-research/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const config: RunConfig = {
    candidatePoolSize: Math.max(1, Number(body.candidatePoolSize) || 32),
    topK: Math.max(1, Math.min(128, Number(body.topK) || 16)),
    mode: (body.mode as ResearchMode) || "single_run",
    seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : null,
    embeddingModel: null,
    pipelineVersion: DEFAULT_PIPELINE_VERSION,
  };

  try {
    const run = await getMetisResearchStore().runQuery(query, config);
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run failed" },
      { status: 500 },
    );
  }
}
