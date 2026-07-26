import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODE = "generation";

/**
 * GET /api/profiles — list all saved generation profiles.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? DEFAULT_MODE;
    const profiles = await db.profile.findMany({
      orderBy: { updatedAt: "desc" },
    });
    const items = profiles
      .map((p) => parseProfileRow(p))
      .filter((item) => item.mode === mode || (mode === DEFAULT_MODE && item.mode === DEFAULT_MODE));

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/profiles — create or update a profile.
 * Body: { name, params, flags, metrics?, customPatterns?, disabled_patterns? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name || !body.params || !body.flags) {
      return NextResponse.json(
        { ok: false, error: "name, params, flags обязательны" },
        { status: 400 },
      );
    }
    const mode = typeof body.mode === "string" && body.mode.trim() ? body.mode.trim() : DEFAULT_MODE;
    const displayName = String(body.name).trim();
    const storedName = toStoredName(mode, displayName);
    const customPayload = {
      customPatterns: body.customPatterns ?? [],
      disabledPatterns: body.disabled_patterns ?? body.disabledPatterns ?? [],
      meta: {
        mode,
        displayName,
      },
    };
    const profile = await db.profile.upsert({
      where: { name: storedName },
      create: {
        name: storedName,
        paramsJson: JSON.stringify(body.params),
        flagsJson: JSON.stringify(body.flags),
        metricsJson: body.metrics ? JSON.stringify(body.metrics) : null,
        customPatternsJson: JSON.stringify(customPayload),
      },
      update: {
        paramsJson: JSON.stringify(body.params),
        flagsJson: JSON.stringify(body.flags),
        metricsJson: body.metrics ? JSON.stringify(body.metrics) : null,
        customPatternsJson: JSON.stringify(customPayload),
      },
    });
    return NextResponse.json({ ok: true, profile: { id: profile.id, name: displayName, mode } });
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
  const mode = typeof meta.mode === "string" ? meta.mode : parsed.mode ?? DEFAULT_MODE;
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

function toStoredName(mode: string, displayName: string) {
  return `${mode}::${displayName}`;
}

function splitStoredName(value: string) {
  const index = value.indexOf("::");
  if (index < 0) return { mode: null, displayName: value };
  return {
    mode: value.slice(0, index),
    displayName: value.slice(index + 2),
  };
}
