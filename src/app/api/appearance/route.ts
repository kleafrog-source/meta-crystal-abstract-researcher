import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeAppearance } from "@/lib/appearance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const KEY = "appearance_settings_v1";
export async function GET() {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return NextResponse.json({ ok: true, appearance: normalizeAppearance(null) });
  try { return NextResponse.json({ ok: true, appearance: normalizeAppearance(JSON.parse(row.value)) }); }
  catch { return NextResponse.json({ ok: true, appearance: normalizeAppearance(null) }); }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json() as { appearance?: unknown };
    const appearance = normalizeAppearance(body.appearance);
    await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: JSON.stringify(appearance) }, update: { value: JSON.stringify(appearance) } });
    return NextResponse.json({ ok: true, appearance });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save appearance" }, { status: 500 }); }
}
