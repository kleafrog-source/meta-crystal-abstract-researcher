import { NextResponse } from "next/server";
import { callSidecar } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/engine
 * Returns information about the Python engine (knowledge base stats, flags).
 */
export async function GET() {
  try {
    const { result, events } = await callSidecar("init");
    const dataEvt = events.find((e) => e.event === "data" && e.payload);
    const raw = (dataEvt?.payload ?? result) as Record<string, unknown>;
    // Normalize snake_case → camelCase for the frontend
    return NextResponse.json({
      ok: true,
      engineOk: raw.engine_ok ?? raw.engineOk ?? false,
      version: raw.version,
      flagsCount: raw.flags_count ?? raw.flagsCount ?? 0,
      flags: raw.flags ?? [],
      lexiconCount: raw.lexicon_count ?? raw.lexiconCount ?? 0,
      operatorsCount: raw.operators_count ?? raw.operatorsCount ?? 0,
      patternsCount: raw.patterns_count ?? raw.patternsCount ?? 0,
      patterns: raw.patterns ?? [],
      focusCount: raw.focus_count ?? raw.focusCount ?? 0,
      crystalTypes: raw.crystal_types ?? [],
      focusTypes: raw.focus_types ?? [],
      dataDir: raw.data_dir ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
