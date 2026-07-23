import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFileSync, existsSync, unlinkSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/crystals/[id]
 * Returns full crystal details (parses the original JSON file on disk if present).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const crystal = await db.crystal.findUnique({ where: { id } });
    if (!crystal) {
      return NextResponse.json(
        { ok: false, error: "Кристалл не найден" },
        { status: 404 },
      );
    }

    // Try to read the original JSON file for the full payload
    let fullFile: Record<string, unknown> | null = null;
    if (crystal.filepath && existsSync(crystal.filepath)) {
      try {
        fullFile = JSON.parse(readFileSync(crystal.filepath, "utf-8"));
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      crystal: {
        ...crystal,
        elements: safeParse(crystal.elementsJson, []),
        operators: safeParse(crystal.operatorsJson, []),
        metrics: safeParse(crystal.metricsJson, {}),
        reasons: safeParse(crystal.reasonsJson, []),
        metadata: safeParse(crystal.metadataJson, {}),
        llmMicroNote:
          typeof fullFile?.llm_micro_note === "string" ? fullFile.llm_micro_note : null,
        vectorDirection:
          typeof fullFile?.vector_direction === "string" ? fullFile.vector_direction : null,
        mutationProbabilities: Array.isArray(fullFile?.mutation_probabilities)
          ? fullFile.mutation_probabilities.map(String)
          : [],
        llmSynthesisReasoning:
          typeof fullFile?.llm_synthesis_reasoning === "string"
            ? fullFile.llm_synthesis_reasoning
            : null,
        fullFile,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/crystals/[id]
 * Removes the crystal record (does NOT delete the file on disk by default;
 * pass ?deleteFile=1 to also unlink it).
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const deleteFile = url.searchParams.get("deleteFile") === "1";

    const crystal = await db.crystal.findUnique({ where: { id } });
    if (!crystal) {
      return NextResponse.json(
        { ok: false, error: "Кристалл не найден" },
        { status: 404 },
      );
    }

    if (deleteFile && crystal.filepath && existsSync(crystal.filepath)) {
      try {
        unlinkSync(crystal.filepath);
      } catch {}
    }

    await db.crystal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
