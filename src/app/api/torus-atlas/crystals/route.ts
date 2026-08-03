import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAtlasWhere, mapCrystalToAtlas } from "@/lib/torus-atlas-query";
import type { TorusAtlasListResponse } from "@/types/torus-atlas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fetchAll = url.searchParams.get("all") === "1";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const requestedPageSize = Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "24", 10));
    const pageSize = fetchAll ? Math.min(20000, requestedPageSize) : Math.min(100, requestedPageSize);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const emeralds = url.searchParams.get("emeralds") === "1";
    const layoutKey = url.searchParams.get("layoutKey")?.trim() ?? "";
    const ids = (url.searchParams.get("ids") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    const where = buildAtlasWhere(search, emeralds, ids, layoutKey);

    const [total, crystals] = await Promise.all([
      db.crystal.count({ where }),
      db.crystal.findMany({
        where,
        orderBy: { counter: "desc" },
        ...(fetchAll ? {} : { skip: (page - 1) * pageSize }),
        take: pageSize,
      }),
    ]);

    const items = crystals.map(mapCrystalToAtlas);
    const response: TorusAtlasListResponse = {
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
