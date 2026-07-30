import { NextResponse } from "next/server";
import { runCrystalPoolAction } from "@/lib/gw-collapser-pool";
import type { GwCrystalPoolActionId } from "@/types/gw-collapser-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const crystalIds = Array.isArray(body?.crystalIds) ? body.crystalIds.map(String) : [];
    const params = body?.params && typeof body.params === "object" ? body.params : {};
    const response = await runCrystalPoolAction(action as GwCrystalPoolActionId, crystalIds, params);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
