import { NextRequest, NextResponse } from "next/server";
import { startNormalizationJob, type Phase } from "@/lib/am-parameters-catalogue/normalization-jobs";

export const runtime = "nodejs";
const phases = new Set<Phase>(["rename", "stats", "domain", "category", "enrich", "all"]);
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phase?: string; options?: unknown };
    const phase = body.phase === "classify" ? "category" : body.phase;
    if (!phase || !phases.has(phase as Phase)) return NextResponse.json({ error: "phase должен быть rename, stats, domain, classify/category, enrich или all." }, { status: 400 });
    const result = await startNormalizationJob(phase as Phase, body.options);
    return NextResponse.json(result, { status: 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}
