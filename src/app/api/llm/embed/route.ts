import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/llm/embed
 * Body: { text: string, model?: string }
 * Returns: { ok, embedding: number[], dim, model }
 */
export async function POST(req: Request) {
  try {
    const { text, model } = (await req.json()) as { text: string; model?: string };
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "text обязателен" },
        { status: 400 },
      );
    }
    const { provider, settings } = await getActiveProvider();
    const vec = await provider.embed(text, model ?? settings.embedModel);
    return NextResponse.json({
      ok: true,
      embedding: vec,
      dim: vec.length,
      model: model ?? settings.embedModel,
      provider: provider.id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
