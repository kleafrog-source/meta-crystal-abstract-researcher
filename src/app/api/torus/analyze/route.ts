import { NextResponse } from "next/server";
import { callSidecar } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const docs = Array.isArray(body?.docs) ? body.docs.map(String).filter(Boolean) : [];
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!docs.length || !query) {
      return NextResponse.json(
        { ok: false, error: "docs[] и query обязательны" },
        { status: 400 },
      );
    }

    const input = {
      docs,
      query,
      ...(Array.isArray(body?.doc_emb) ? { doc_emb: body.doc_emb } : {}),
      ...(Array.isArray(body?.query_emb) ? { query_emb: body.query_emb } : {}),
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
    };

    const { result, events } = await callSidecar("torus_analyze", {
      inputFile: input,
      taskType: "torus_analyze",
      title: "GW-Collapser torus analyze",
      timeoutMs: 10 * 60 * 1000,
    });

    return NextResponse.json({
      ok: true,
      result,
      events,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
