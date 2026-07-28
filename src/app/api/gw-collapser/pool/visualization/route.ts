import { NextResponse } from "next/server";
import { buildCrystalPoolVisualization } from "@/lib/gw-collapser-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const crystalIds = (url.searchParams.get("crystalIds") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10)));
    return NextResponse.json(await buildCrystalPoolVisualization(crystalIds, limit));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
