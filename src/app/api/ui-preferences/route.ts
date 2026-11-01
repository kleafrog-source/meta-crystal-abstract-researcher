import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "ui_preferences_v1";
type TitleOrder = "en-ru" | "ru-en";
type UiLanguage = "en" | "ru" | "de";

async function readPreferences(): Promise<{ parameterTitleOrder: TitleOrder; language: UiLanguage }> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return { parameterTitleOrder: "en-ru", language: "ru" };
  try {
    const value = JSON.parse(row.value) as { parameterTitleOrder?: unknown; language?: unknown };
    return { parameterTitleOrder: value.parameterTitleOrder === "ru-en" ? "ru-en" : "en-ru", language: value.language === "en" || value.language === "de" ? value.language : "ru" };
  } catch {
    return { parameterTitleOrder: "en-ru", language: "ru" };
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, ...await readPreferences() });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { parameterTitleOrder?: unknown; language?: unknown };
    const current = await readPreferences();
    const nextTitleOrder = body.parameterTitleOrder === undefined ? current.parameterTitleOrder : body.parameterTitleOrder;
    const nextLanguage = body.language === undefined ? current.language : body.language;
    if ((nextTitleOrder !== "en-ru" && nextTitleOrder !== "ru-en") || (nextLanguage !== "en" && nextLanguage !== "ru" && nextLanguage !== "de")) {
      return NextResponse.json({ ok: false, error: "Invalid UI preferences" }, { status: 400 });
    }
    const value = JSON.stringify({ parameterTitleOrder: nextTitleOrder, language: nextLanguage });
    await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    const response = NextResponse.json({ ok: true, parameterTitleOrder: nextTitleOrder, language: nextLanguage });
    response.cookies.set("am_locale", nextLanguage, { httpOnly: false, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save UI preferences" }, { status: 500 });
  }
}
