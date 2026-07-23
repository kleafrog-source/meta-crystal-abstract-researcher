import { NextResponse } from "next/server";
import { getIsomorphismsForCode } from "@/lib/manifestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const isomorphs = await getIsomorphismsForCode(id);
    return NextResponse.json({
      ok: true,
      status: "ok",
      crystal_id: id,
      isomorphs,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
