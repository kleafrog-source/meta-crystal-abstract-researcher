import { NextResponse } from "next/server";
import { GW_CRYSTAL_POOL_ACTIONS } from "@/lib/gw-collapser-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    actions: GW_CRYSTAL_POOL_ACTIONS,
  });
}
