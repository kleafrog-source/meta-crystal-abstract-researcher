import { NextResponse } from "next/server";
import { getFullTorusAtlasRebuildJob, startFullTorusAtlasRebuild } from "@/lib/torus-atlas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getFullTorusAtlasRebuildJob());
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await startFullTorusAtlasRebuild({
      ...(body?.n_clusters !== undefined ? { n_clusters: Number(body.n_clusters) } : {}),
      ...(body?.dt !== undefined ? { dt: Number(body.dt) } : {}),
      ...(body?.friction !== undefined ? { friction: Number(body.friction) } : {}),
      ...(body?.epsilon !== undefined ? { epsilon: Number(body.epsilon) } : {}),
      ...(body?.max_steps !== undefined ? { max_steps: Number(body.max_steps) } : {}),
      ...(body?.tol_speed !== undefined ? { tol_speed: Number(body.tol_speed) } : {}),
      ...(body?.geometry_R !== undefined ? { geometry_R: Number(body.geometry_R) } : {}),
      ...(body?.geometry_r !== undefined ? { geometry_r: Number(body.geometry_r) } : {}),
      ...(body?.batch_size !== undefined ? { batch_size: Number(body.batch_size) } : {}),
      ...(typeof body?.embedding_model === "string" && body.embedding_model.trim()
        ? { embedding_model: body.embedding_model.trim() }
        : {}),
    });
    return NextResponse.json({ ok: true, job: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
