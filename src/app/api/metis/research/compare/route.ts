import { NextRequest, NextResponse } from "next/server";
import { getMetisResearchStore } from "@/lib/metis-research/store";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const runIds = Array.isArray(body.runIds) ? body.runIds.map((value) => String(value)) : [];
  try {
    const result = getMetisResearchStore().compareRuns(runIds);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Compare failed" },
      { status: 400 },
    );
  }
}
