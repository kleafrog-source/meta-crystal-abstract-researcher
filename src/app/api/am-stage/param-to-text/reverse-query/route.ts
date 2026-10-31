import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";
import { generateReverseQuery } from "@/lib/cross-modal/reverse-query";
import type { ParamToTextSnapshot } from "@/lib/param-to-text";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 512_000) return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
    const body = await request.json() as { snapshot?: ParamToTextSnapshot; brief?: string };
    const snapshot = body.snapshot;
    if (!snapshot || snapshot.schema !== "param_to_text_snapshot_v1" || !Array.isArray(snapshot.parameters)) {
      return NextResponse.json({ error: "Expected param_to_text_snapshot_v1." }, { status: 400 });
    }
    if (snapshot.parameters.length > 100) return NextResponse.json({ error: "Snapshot may contain at most 100 parameters." }, { status: 400 });
    const evidence = snapshot.parameters.slice(0, 40).map((entry) => ({
      tags: entry.tags.slice(0, 8),
      keywords: entry.keywords.slice(0, 8),
      descriptions: entry.description_fragments.slice(0, 3),
      intensity: entry.intensity,
      normalized_position: entry.normalized_position,
      prevalence: entry.prevalence,
      similarity: entry.mean_similarity,
      value_mean: entry.value_mean,
    }));
    const providerContext = await getActiveProvider();
    const result = await generateReverseQuery(providerContext, {
      source_modality: "audio",
      primary_original_request: typeof body.brief === "string" ? body.brief.slice(0, 1200) : null,
      ranked_acoustic_evidence: evidence,
    }, request.signal);
    return NextResponse.json({ ...result, generated_at: new Date().toISOString() });
  } catch (error) {
    const status = request.signal.aborted ? 499 : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
