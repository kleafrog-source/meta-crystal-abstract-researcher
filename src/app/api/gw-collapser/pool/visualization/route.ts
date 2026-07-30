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
    const modes = url.searchParams.getAll("modes")
      .map((item) => item.trim())
      .filter((item): item is "combination_only" | "full" => item === "combination_only" || item === "full");
    return NextResponse.json(await buildCrystalPoolVisualization(crystalIds, limit, modes));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
