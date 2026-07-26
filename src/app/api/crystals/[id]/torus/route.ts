import { NextResponse } from "next/server";
import { runGwCollapserOnCrystal } from "@/lib/gw-collapser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const result = await runGwCollapserOnCrystal(id, {
      query: typeof body?.query === "string" ? body.query : null,
      ...(body?.n_clusters !== undefined ? { n_clusters: Number(body.n_clusters) } : {}),
      ...(body?.dt !== undefined ? { dt: Number(body.dt) } : {}),
      ...(body?.friction !== undefined ? { friction: Number(body.friction) } : {}),
      ...(body?.epsilon !== undefined ? { epsilon: Number(body.epsilon) } : {}),
      ...(body?.max_steps !== undefined ? { max_steps: Number(body.max_steps) } : {}),
      ...(body?.tol_speed !== undefined ? { tol_speed: Number(body.tol_speed) } : {}),
      ...(body?.geometry_R !== undefined ? { geometry_R: Number(body.geometry_R) } : {}),
      ...(body?.geometry_r !== undefined ? { geometry_r: Number(body.geometry_r) } : {}),
      ...(typeof body?.embedding_model === "string" && body.embedding_model.trim()
        ? { embedding_model: body.embedding_model.trim() }
        : {}),
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes("не найден") || message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
