import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapCrystalToAtlas } from "@/lib/torus-atlas-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
    const page = Math.max(1, Number(body?.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(body?.pageSize ?? 24)));
    if (!ids.length) {
      return NextResponse.json({ ok: true, total: 0, page, pageSize, totalPages: 1, items: [] });
    }

    const total = ids.length;
    const pageIds = ids.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    const crystals = await db.crystal.findMany({
      where: { id: { in: pageIds } },
      orderBy: { counter: "desc" },
    });
    const byId = new Map(crystals.map((item) => [item.id, item]));
    const items = pageIds.map((id) => byId.get(id)).filter(Boolean).map(mapCrystalToAtlas);

    return NextResponse.json({
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
