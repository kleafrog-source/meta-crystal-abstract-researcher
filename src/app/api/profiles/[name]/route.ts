import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await ctx.params;
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "generation";
    const displayName = decodeURIComponent(name);
    const storedName = `${mode}::${displayName}`;
    const profile =
      (await db.profile.findUnique({ where: { name: storedName } })) ??
      (mode === "generation"
        ? await db.profile.findUnique({ where: { name: displayName } })
        : null);

    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ" },
        { status: 404 },
      );
    }

    const parsed = parseProfileRow(profile);
    return NextResponse.json({ ok: true, profile: parsed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await ctx.params;
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "generation";
    const displayName = decodeURIComponent(name);
    const storedName = `${mode}::${displayName}`;
    const profile =
      (await db.profile.findUnique({ where: { name: storedName } })) ??
      (mode === "generation"
        ? await db.profile.findUnique({ where: { name: displayName } })
        : null);
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Профиль не найден" },
        { status: 404 },
      );
    }
    await db.profile.delete({ where: { id: profile.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function parseProfileRow(p: {
  id: string;
  name: string;
  paramsJson: string;
  flagsJson: string;
  metricsJson: string | null;
  customPatternsJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const custom = p.customPatternsJson ? JSON.parse(p.customPatternsJson) : null;
  const meta = custom?.meta ?? {};
  const parsed = splitStoredName(p.name);
  const mode = typeof meta.mode === "string" ? meta.mode : parsed.mode ?? "generation";
  const displayName = typeof meta.displayName === "string" ? meta.displayName : parsed.displayName ?? p.name;

  return {
    id: p.id,
    name: displayName,
    mode,
    params: JSON.parse(p.paramsJson),
    flags: JSON.parse(p.flagsJson),
    metrics: p.metricsJson ? JSON.parse(p.metricsJson) : null,
    customPatterns: custom?.customPatterns ?? [],
    disabledPatterns: custom?.disabledPatterns ?? [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function splitStoredName(value: string) {
  const index = value.indexOf("::");
  if (index < 0) return { mode: null, displayName: value };
  return {
    mode: value.slice(0, index),
    displayName: value.slice(index + 2),
  };
}
