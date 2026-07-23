import { NextResponse } from "next/server";
import {
  loadLLMSettings,
  saveLLMSettings,
  type LLMSettings,
} from "@/lib/llm/factory";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings — returns the current LLM settings + app paths.
 */
export async function GET() {
  const llm = await loadLLMSettings();
  return NextResponse.json({ ok: true, llm });
}

/**
 * PUT /api/settings — updates LLM settings.
 * Body: partial LLMSettings object.
 */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<LLMSettings>;
    const current = await loadLLMSettings();
    const updated: LLMSettings = { ...current, ...body };
    await saveLLMSettings(updated);
    return NextResponse.json({ ok: true, llm: updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
