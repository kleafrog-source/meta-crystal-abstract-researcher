import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pipelines — list all stored pipelines.
 */
export async function GET() {
  try {
    const pipelines = await db.pipeline.findMany({
      orderBy: { modifiedAt: "desc" },
      include: { _count: { select: { runs: true } } },
    });
    return NextResponse.json({
      ok: true,
      items: pipelines.map((p) => ({
        ...(parsePipelinePayload(p.stepsJson)),
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt,
        modifiedAt: p.modifiedAt,
        runsCount: p._count?.runs ?? 0,
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
 * POST /api/pipelines — create a new pipeline.
 * Body: { name, description?, steps: PipelineStep[], flags?, params? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name || !Array.isArray(body.steps)) {
      return NextResponse.json(
        { ok: false, error: "name и steps обязательны" },
        { status: 400 },
      );
    }
    const pipe = await db.pipeline.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        stepsJson: JSON.stringify({
          steps: body.steps,
          profile: body.profile ?? null,
        }),
      },
    });
    return NextResponse.json({
      ok: true,
      pipeline: { id: pipe.id, name: pipe.name, steps: body.steps },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function parsePipelinePayload(raw: string): { steps: unknown[]; profile: Record<string, unknown> | null } {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { steps: parsed, profile: null };
    }
    if (parsed && typeof parsed === "object") {
      return {
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
      };
    }
  } catch {}
  return { steps: [], profile: null };
}
