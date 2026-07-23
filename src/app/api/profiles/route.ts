import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/profiles — list all saved generation profiles.
 */
export async function GET() {
  try {
    const profiles = await db.profile.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      ok: true,
      items: profiles.map((p) => ({
        ...(function () {
          const custom = p.customPatternsJson ? JSON.parse(p.customPatternsJson) : null;
          return {
            id: p.id,
            name: p.name,
            params: JSON.parse(p.paramsJson),
            flags: JSON.parse(p.flagsJson),
            metrics: p.metricsJson ? JSON.parse(p.metricsJson) : null,
            customPatterns: custom?.customPatterns ?? [],
            disabledPatterns: custom?.disabledPatterns ?? [],
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          };
        })(),
      })),
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
    const profile = await db.profile.upsert({
      where: { name: body.name },
      create: {
        name: body.name,
        paramsJson: JSON.stringify(body.params),
        flagsJson: JSON.stringify(body.flags),
        metricsJson: body.metrics ? JSON.stringify(body.metrics) : null,
        customPatternsJson: JSON.stringify({
          customPatterns: body.customPatterns ?? [],
          disabledPatterns: body.disabled_patterns ?? body.disabledPatterns ?? [],
        }),
      },
      update: {
        paramsJson: JSON.stringify(body.params),
        flagsJson: JSON.stringify(body.flags),
        metricsJson: body.metrics ? JSON.stringify(body.metrics) : null,
        customPatternsJson: JSON.stringify({
          customPatterns: body.customPatterns ?? [],
          disabledPatterns: body.disabled_patterns ?? body.disabledPatterns ?? [],
        }),
      },
    });
    return NextResponse.json({ ok: true, profile: { id: profile.id, name: profile.name } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
