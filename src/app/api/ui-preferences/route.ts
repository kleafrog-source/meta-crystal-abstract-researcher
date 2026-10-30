import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "ui_preferences_v1";
type TitleOrder = "en-ru" | "ru-en";

async function readTitleOrder(): Promise<TitleOrder> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return "en-ru";
  try {
    const value = JSON.parse(row.value) as { parameterTitleOrder?: unknown };
    return value.parameterTitleOrder === "ru-en" ? "ru-en" : "en-ru";
  } catch {
    return "en-ru";
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, parameterTitleOrder: await readTitleOrder() });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { parameterTitleOrder?: unknown };
    if (body.parameterTitleOrder !== "en-ru" && body.parameterTitleOrder !== "ru-en") {
      return NextResponse.json({ ok: false, error: "parameterTitleOrder must be en-ru or ru-en" }, { status: 400 });
    }
    const value = JSON.stringify({ parameterTitleOrder: body.parameterTitleOrder });
    await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    return NextResponse.json({ ok: true, parameterTitleOrder: body.parameterTitleOrder });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save UI preferences" }, { status: 500 });
  }
}
