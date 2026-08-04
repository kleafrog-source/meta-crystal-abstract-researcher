import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMetisStore } from "@/lib/metis/store";
import { semanticSearchCrystals } from "@/lib/rag";

type CrystalRow = {
  id: string;
  code: string;
  type: string;
  focus: string | null;
  combination: string;
  qualityScore: number | null;
  metadataJson: string | null;
};

function safeParseRecord(value: string | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeRows(rows: CrystalRow[], scores: Array<{ id: string; score: number }>) {
  const scoreById = new Map(scores.map((entry) => [entry.id, entry.score]));
  return rows
    .map((row) => {
      const metadata = safeParseRecord(row.metadataJson);
      const metis =
        metadata.metis && typeof metadata.metis === "object"
          ? (metadata.metis as Record<string, unknown>)
          : {};
      const quality = Math.max(0, Math.min(1, Number(row.qualityScore ?? 0.5)));
      const score = Number(scoreById.get(row.id) ?? 0);
      const finalScore =
        score * 0.72 +
        quality * 0.18 +
        (metis.imported ? 0.05 : 0) +
        (metis.enriched ? 0.05 : 0);
      return {
        ...row,
        score,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

function buildMemoryContent(row: Pick<CrystalRow, "code" | "type" | "focus" | "combination">) {
  return [row.code, row.type, row.focus, row.combination].filter(Boolean).join(" | ");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const candidateLimit = Math.max(1, Math.min(500, Number(body.candidateLimit ?? 100) || 100));
  const keepTop = Math.max(1, Math.min(candidateLimit, Number(body.keepTop ?? 8) || 8));
  const onlyWithEmbeddings = body.onlyWithEmbeddings !== false;
  const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : undefined;
  const importedOnly = body.importedOnly === true;
  const enrichedOnly = body.enrichedOnly === true;

  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  try {
    const scored = await semanticSearchCrystals(query, candidateLimit);
    if (!scored.length) {
      return NextResponse.json({ ok: true, query, imported: 0, skipped: 0, candidates: [], selected: [], forgottenNodeIds: [] });
    }

    const rows = await db.crystal.findMany({
      where: {
        id: { in: scored.map((entry) => entry.id) },
        ...(onlyWithEmbeddings ? { embedding: { not: null } } : {}),
        ...(type ? { type } : {}),
      },
      select: {
        id: true,
        code: true,
        type: true,
        focus: true,
        combination: true,
        qualityScore: true,
        metadataJson: true,
      },
    });

    const filtered = normalizeRows(rows, scored).filter((row) => {
      const metadata = safeParseRecord(row.metadataJson);
      const metis =
        metadata.metis && typeof metadata.metis === "object"
          ? (metadata.metis as Record<string, unknown>)
          : {};
      if (importedOnly && !metis.imported) return false;
      if (enrichedOnly && !metis.enriched) return false;
      return true;
    });

    const limited = filtered.slice(0, candidateLimit);
    const store = getMetisStore();
    const importResult = await store.importFromLibrary({
      ids: limited.map((row) => row.id),
      limit: limited.length || candidateLimit,
      onlyWithEmbeddings,
      type,
    });

    const selected = limited.slice(0, keepTop);
    const forgotten = limited.slice(keepTop);

    if (selected.length) {
      await store.applyMemoryBatch(
        "UPDATE",
        selected.map((row) => ({
          content: buildMemoryContent(row),
          importance: row.finalScore,
        })),
      );
    }

    if (forgotten.length) {
      await store.applyMemoryBatch(
        "FORGET",
        forgotten.map((row) => ({
          content: `lib_${row.code}`,
        })),
      );
    }

    const nodes = store.crystal.listAll();
    const selectedPayload = selected.map((row) => ({
      id: row.id,
      code: row.code,
      type: row.type,
      focus: row.focus,
      combination: row.combination,
      score: row.score,
      finalScore: row.finalScore,
      nodeId: nodes.find((node) => node.node_id === `lib_${row.code}`)?.node_id ?? null,
    }));

    return NextResponse.json({
      ok: true,
      query,
      imported: importResult.imported,
      skipped: importResult.skipped,
      candidateCount: limited.length,
      selectedCount: selectedPayload.length,
      forgottenCount: forgotten.length,
      selected: selectedPayload,
      forgottenNodeIds: forgotten.map((row) => `lib_${row.code}`),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Metis select failed" }, { status: 500 });
  }
}
