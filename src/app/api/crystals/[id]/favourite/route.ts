import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/crystals/[id]/favourite
 * Body: { favourite: boolean }
 * Toggles the crystal's favourite flag.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { favourite?: boolean };
    const crystal = await db.crystal.findUnique({ where: { id } });
    if (!crystal) {
      return NextResponse.json(
        { ok: false, error: "Кристалл не найден" },
        { status: 404 },
      );
    }
    const next = body.favourite ?? !crystal.isFavourite;
    await db.crystal.update({ where: { id }, data: { isFavourite: next } });
    return NextResponse.json({ ok: true, isFavourite: next });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
