import { NextResponse } from "next/server";
import { queryPalette } from "@/lib/manifestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const result = await queryPalette({
      q: url.searchParams.get("q"),
      vector: url.searchParams.get("vector"),
      semantic_query: url.searchParams.get("semantic_query"),
      has_micro_note: parseNullableBoolean(url.searchParams.get("has_micro_note")),
      has_vector: parseNullableBoolean(url.searchParams.get("has_vector")),
      limit: Number(url.searchParams.get("limit") ?? "50"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

function parseNullableBoolean(value: string | null) {
  if (value == null) return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}
