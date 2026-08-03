import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { TorusAtlasWorkingSet } from "@/types/torus-atlas";

const KEY = "torus_atlas_working_sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const setting = await db.setting.findUnique({ where: { key: KEY } });
    return NextResponse.json({ ok: true, items: parseSets(setting?.value ?? null) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!name) {
      return NextResponse.json({ ok: false, error: "Working set name is required." }, { status: 400 });
    }
    const current = await readSets();
    const now = new Date().toISOString();
    const existing = current.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const next = existing
      ? current.map((item) => item.id === existing.id ? { ...item, ids: normalizeIds(ids), updatedAt: now } : item)
      : [{ id: `set-${Date.now()}`, name, ids: normalizeIds(ids), createdAt: now, updatedAt: now }, ...current];
    await writeSets(next);
    return NextResponse.json({ ok: true, items: next });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim() ?? "";
    const current = await readSets();
    const next = id ? current.filter((item) => item.id !== id) : [];
    await writeSets(next);
    return NextResponse.json({ ok: true, items: next });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

async function readSets() {
  const setting = await db.setting.findUnique({ where: { key: KEY } });
  return parseSets(setting?.value ?? null);
}

async function writeSets(items: TorusAtlasWorkingSet[]) {
  await db.setting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(items) },
    create: { key: KEY, value: JSON.stringify(items) },
  });
}

function parseSets(value: string | null) {
  if (!value) return [] as TorusAtlasWorkingSet[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: String((item as any)?.id ?? ""),
      name: String((item as any)?.name ?? ""),
      ids: Array.isArray((item as any)?.ids) ? (item as any).ids.map(String).filter(Boolean) : [],
      createdAt: String((item as any)?.createdAt ?? ""),
      updatedAt: String((item as any)?.updatedAt ?? ""),
    })).filter((item) => item.id && item.name);
  } catch {
    return [];
  }
}

function normalizeIds(ids: string[]) {
  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))];
}
