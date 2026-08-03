import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAtlasWhere } from "@/lib/torus-atlas-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const search = typeof body?.search === "string" ? body.search.trim() : "";
    const emeralds = body?.emeralds === true;
    const limit = body?.limit === "all" ? null : Math.max(1, Math.min(5000, Number(body?.limit ?? 100)));
    const layoutKey = typeof body?.layoutKey === "string" ? body.layoutKey.trim() : "";
    const semanticClusterLabel = body?.semanticClusterLabel !== undefined ? Number(body.semanticClusterLabel) : null;
    const torusClusterLabel = body?.torusClusterLabel !== undefined ? Number(body.torusClusterLabel) : null;
    const duplicatesOnly = body?.duplicatesOnly === true;
    const where = buildAtlasWhere(search, emeralds);

    const rows = await db.crystal.findMany({
      where,
      orderBy: { counter: "desc" },
      select: { id: true, combination: true, metadataJson: true },
    });
    const filtered = rows.filter((row) => {
      const metadata = safeParseRecord(row.metadataJson);
      const atlas = metadata.torusAtlas && typeof metadata.torusAtlas === "object"
        ? metadata.torusAtlas as Record<string, unknown>
        : {};
      if (layoutKey && String(atlas.layoutKey ?? "") !== layoutKey) return false;
      if (semanticClusterLabel !== null && Number(atlas.semanticClusterLabel ?? atlas.clusterLabel ?? 0) !== semanticClusterLabel) return false;
      if (torusClusterLabel !== null && Number(atlas.torusClusterLabel ?? atlas.clusterLabel ?? 0) !== torusClusterLabel) return false;
      return true;
    });

    const duplicateCombos = duplicatesOnly
      ? new Set(
          [...filtered.reduce((acc, row) => acc.set(row.combination, (acc.get(row.combination) ?? 0) + 1), new Map<string, number>()).entries()]
            .filter(([, count]) => count > 1)
            .map(([combination]) => combination),
        )
      : null;
    const deduped = duplicateCombos ? filtered.filter((row) => duplicateCombos.has(row.combination)) : filtered;
    const selected = limit === null ? deduped : deduped.slice(0, limit);

    return NextResponse.json({
      ok: true,
      total: deduped.length,
      selectedCount: selected.length,
      ids: selected.map((row) => row.id),
      truncated: limit !== null && selected.length < deduped.length,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

function safeParseRecord(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}
