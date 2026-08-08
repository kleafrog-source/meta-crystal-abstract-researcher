import { NextRequest, NextResponse } from "next/server";
import { getMetisResearchStore } from "@/lib/metis-research/store";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }
  const activeRunId = getMetisResearchStore().setActiveRun(runId);
  return NextResponse.json({ ok: true, activeRunId });
}
