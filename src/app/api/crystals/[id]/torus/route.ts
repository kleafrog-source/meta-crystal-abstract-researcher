import { NextResponse } from "next/server";
import {
  readPersistedTorusAnalysisResult,
  resolveCrystalWithFile,
  runTorusAnalysisForCrystal,
} from "@/lib/gw-collapser";
import type { GwTorusAnalysisResult } from "@/types/gw-collapser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const resolved = await resolveCrystalWithFile(id);
    const persisted = readPersistedTorusAnalysisResult(resolved.crystal!.filepath);
    if (!persisted) {
      return NextResponse.json(
        { ok: false, error: "GW torus analysis not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      crystalId: persisted.analysis.crystal_id,
      crystalCode: persisted.analysis.crystal_code,
      docsCount: persisted.analysis.docs.length,
      query: persisted.analysis.query,
      storedAt: persisted.stored_at,
      analysis: persisted.analysis,
      result: toLegacyPayload(persisted.analysis),
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const analysis = await runTorusAnalysisForCrystal(id, {
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
      crystalId: analysis.crystal_id,
      crystalCode: analysis.crystal_code,
      docsCount: analysis.docs.length,
      query: analysis.query,
      storedAt: analysis.stored_at,
      analysis,
      result: toLegacyPayload(analysis),
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

function toLegacyPayload(analysis: GwTorusAnalysisResult) {
  return {
    torus: {
      R: analysis.torus.R,
      r: analysis.torus.r,
    },
    docs: analysis.docs.map((doc) => ({
      id: doc.id,
      x: doc.torus.x,
      y: doc.torus.y,
      cluster: doc.cluster,
      label: doc.title,
      text: doc.text,
    })),
    flow: {
      path: analysis.flow.history,
      final: analysis.flow.final,
      start: analysis.flow.start,
      speeds: analysis.flow.speeds,
    },
    mmss: analysis.mmss,
    top_docs: analysis.top_docs,
    query: analysis.query,
    parameters: analysis.parameters,
  };
}
