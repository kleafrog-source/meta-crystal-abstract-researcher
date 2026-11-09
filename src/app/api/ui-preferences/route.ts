import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "ui_preferences_v1";
type TitleOrder = "en-ru" | "ru-en";
type UiLanguage = "en" | "ru" | "de";
type UiPreferences = { parameterTitleOrder: TitleOrder; language: UiLanguage; disableCustomSidebarIcons: boolean; disableColorPresets: boolean };

async function readPreferenceState(): Promise<{ preferences: UiPreferences; hasSavedCustomSidebarIcons: boolean; hasSavedColorPresets: boolean }> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return { preferences: { parameterTitleOrder: "en-ru", language: "ru", disableCustomSidebarIcons: false, disableColorPresets: false }, hasSavedCustomSidebarIcons: false, hasSavedColorPresets: false };
  try {
    const value = JSON.parse(row.value) as Partial<UiPreferences>;
    return { preferences: {
        parameterTitleOrder: value.parameterTitleOrder === "ru-en" ? "ru-en" : "en-ru",
        language: value.language === "en" || value.language === "de" ? value.language : "ru",
        disableCustomSidebarIcons: value.disableCustomSidebarIcons === true,
        disableColorPresets: value.disableColorPresets === true,
      }, hasSavedCustomSidebarIcons: typeof value.disableCustomSidebarIcons === "boolean", hasSavedColorPresets: typeof value.disableColorPresets === "boolean" };
  } catch {
    return { preferences: { parameterTitleOrder: "en-ru", language: "ru", disableCustomSidebarIcons: false, disableColorPresets: false }, hasSavedCustomSidebarIcons: false, hasSavedColorPresets: false };
  }
}

async function readTitleOrder(): Promise<TitleOrder> {
  return (await readPreferenceState()).preferences.parameterTitleOrder;
}

export async function GET() {
  const state = await readPreferenceState();
  return NextResponse.json({ ok: true, ...state.preferences, hasSavedCustomSidebarIcons: state.hasSavedCustomSidebarIcons, hasSavedColorPresets: state.hasSavedColorPresets, hasSavedPreferences: state.hasSavedCustomSidebarIcons && state.hasSavedColorPresets });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Partial<UiPreferences>;
    const current = (await readPreferenceState()).preferences;
    const nextTitleOrder = body.parameterTitleOrder === undefined ? current.parameterTitleOrder : body.parameterTitleOrder;
    const nextLanguage = body.language === undefined ? current.language : body.language;
    const nextDisableCustomSidebarIcons = body.disableCustomSidebarIcons === undefined ? current.disableCustomSidebarIcons : body.disableCustomSidebarIcons;
    const nextDisableColorPresets = body.disableColorPresets === undefined ? current.disableColorPresets : body.disableColorPresets;
    if ((nextTitleOrder !== "en-ru" && nextTitleOrder !== "ru-en") || (nextLanguage !== "en" && nextLanguage !== "ru" && nextLanguage !== "de") || typeof nextDisableCustomSidebarIcons !== "boolean" || typeof nextDisableColorPresets !== "boolean") {
      return NextResponse.json({ ok: false, error: "Invalid UI preferences" }, { status: 400 });
    }
    const value = JSON.stringify({ parameterTitleOrder: nextTitleOrder, language: nextLanguage, disableCustomSidebarIcons: nextDisableCustomSidebarIcons, disableColorPresets: nextDisableColorPresets });
    await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    const response = NextResponse.json({ ok: true, parameterTitleOrder: nextTitleOrder, language: nextLanguage, disableCustomSidebarIcons: nextDisableCustomSidebarIcons, disableColorPresets: nextDisableColorPresets });
    response.cookies.set("am_locale", nextLanguage, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save UI preferences" }, { status: 500 });
  }
}
