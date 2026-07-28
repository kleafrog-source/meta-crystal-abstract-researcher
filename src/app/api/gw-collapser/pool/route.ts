import { NextResponse } from "next/server";
import { listCrystalPoolItems } from "@/lib/gw-collapser-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const search = url.searchParams.get("search");
    return NextResponse.json(await listCrystalPoolItems(page, pageSize, search));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
