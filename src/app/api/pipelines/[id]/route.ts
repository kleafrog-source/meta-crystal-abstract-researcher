import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const pipe = await db.pipeline.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });
    if (!pipe) {
      return NextResponse.json(
        { ok: false, error: "Пайплайн не найден" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      pipeline: {
        ...(parsePipelinePayload(pipe.stepsJson)),
        id: pipe.id,
        name: pipe.name,
        description: pipe.description,
        createdAt: pipe.createdAt,
        modifiedAt: pipe.modifiedAt,
        runs: pipe.runs,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const pipe = await db.pipeline.findUnique({ where: { id } });
    if (!pipe) {
      return NextResponse.json(
        { ok: false, error: "Пайплайн не найден" },
        { status: 404 },
      );
    }
    const updated = await db.pipeline.update({
      where: { id },
      data: {
        name: body.name ?? pipe.name,
        description: body.description ?? pipe.description,
        stepsJson: body.steps
          ? JSON.stringify({
              steps: body.steps,
              profile: body.profile ?? parsePipelinePayload(pipe.stepsJson).profile,
            })
          : pipe.stepsJson,
      },
    });
    return NextResponse.json({ ok: true, pipeline: { id: updated.id, name: updated.name } });
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    await db.pipeline.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
