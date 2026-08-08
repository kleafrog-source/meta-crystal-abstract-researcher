import { NextRequest, NextResponse } from "next/server";
import { getMetisResearchStore } from "@/lib/metis-research/store";

function parsePoolSizes(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => Math.max(1, Number(item) || 0)).filter(Boolean))];
  }
  return [];
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const poolSizes = parsePoolSizes(body.poolSizes);
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }
  if (poolSizes.length < 2) {
    return NextResponse.json({ error: "Need at least 2 pool sizes" }, { status: 400 });
  }

  try {
    const runs = await getMetisResearchStore().runPoolComparison(
      query,
      poolSizes,
      Math.max(1, Math.min(128, Number(body.topK) || 16)),
      Number.isFinite(Number(body.seed)) ? Number(body.seed) : null,
    );
    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pool comparison failed" },
      { status: 500 },
    );
  }
}
