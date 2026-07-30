import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncCrystalsFromIndex } from "@/lib/engine/sync";
import { semanticSearchCrystals } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/crystals
 * Query params:
 *   - page (default 1)
 *   - pageSize (default 50, max 200)
 *   - type (filter by type)
 *   - minQuality (number)
 *   - maxComplexity (number)
 *   - search (substring search over combination/focus)
 *   - semantic (1 — perform semantic search instead of substring)
 *   - favourite (1 — only favourites)
 *   - refresh (1 — re-sync from index.json before returning)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10)),
    );
    const type = url.searchParams.get("type");
    const minQuality = url.searchParams.get("minQuality");
    const maxComplexity = url.searchParams.get("maxComplexity");
    const search = url.searchParams.get("search")?.trim();
    const semantic = url.searchParams.get("semantic") === "1";
    const favourite = url.searchParams.get("favourite") === "1";
    const refresh = url.searchParams.get("refresh") === "1";

    if (refresh) {
      await syncCrystalsFromIndex();
    }

    // Build where clause
    const where: any = {};
    if (type) {
      const variants = expandCrystalTypeFilter(type);
      where.type = variants.length === 1 ? variants[0] : { in: variants };
    }
    if (favourite) where.isFavourite = true;
    if (minQuality) where.qualityScore = { gte: parseFloat(minQuality) };
    if (maxComplexity) where.complexity = { lte: parseInt(maxComplexity, 10) };
    if (search && !semantic) {
      where.OR = [
        { combination: { contains: search } },
        { focus: { contains: search } },
        { code: { contains: search } },
        { searchText: { contains: search } },
      ];
    }

    const [total, aggregate] = await Promise.all([
      db.crystal.count({ where }),
      db.crystal.aggregate({ where, _max: { counter: true } }),
    ]);

    let items;
    if (semantic && search) {
      // Do semantic search and order by similarity
      const scored = await semanticSearchCrystals(search, pageSize);
      const ids = scored.map((s) => s.id);
      const rows = await db.crystal.findMany({ where: { id: { in: ids } } });
      // Preserve similarity order
      const byId = new Map(rows.map((r) => [r.id, r]));
      items = ids.map((id) => {
        const r = byId.get(id)!;
        const s = scored.find((x) => x.id === id)!;
        return { ...r, similarity: s.score };
      });
    } else {
      items = await db.crystal.findMany({
        where,
        orderBy: { counter: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
    }

    return NextResponse.json({
      ok: true,
      total,
      latestCounter: aggregate._max.counter ?? null,
      page,
      pageSize,
      items: items.map((c: any) => ({
        ...withGhostFields(c),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function withGhostFields(c: any) {
  const metadata = safeParse(c.metadataJson, {});
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    category: c.category,
    focus: c.focus,
    pattern: c.pattern,
    combination: c.combination,
    combinationShort: c.combination.slice(0, 200),
    qualityScore: c.qualityScore,
    complexity: c.complexity,
    counter: c.counter,
    step: c.step,
    isFavourite: c.isFavourite,
    ghostCoordinate:
      metadata && typeof metadata === "object" && "ghostCoordinate" in metadata
        ? (metadata as Record<string, unknown>).ghostCoordinate
        : null,
    createdAt: c.createdAt,
    similarity: c.similarity,
  };
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function expandCrystalTypeFilter(type: string) {
  const normalized = type.trim().toLowerCase();
  const variants = new Set<string>([type]);
  const map: Record<string, string[]> = {
    emerald: ["emerald", "EMERALD", "Изумруд", "ИЗУМРУД"],
    diamond: ["diamond", "DIAMOND", "Алмаз", "АЛМАЗ"],
    principle: ["principle", "PRINCIPLE", "Принцип", "ПРИНЦИП"],
    hybrid: ["hybrid", "HYBRID", "Гибрид", "ГИБРИД"],
    paradox: ["paradox", "PARADOX", "Парадокс", "ПАРАДОКС"],
    quantum: ["quantum", "QUANTUM", "Квантовый", "КВАНТОВЫЙ"],
    fractal: ["fractal", "FRACTAL", "Фрактальный", "ФРАКТАЛЬНЫЙ"],
    linguistic: ["linguistic", "LINGUISTIC", "Лингвистический", "ЛИНГВИСТИЧЕСКИЙ"],
    system: ["system", "SYSTEM", "Системный", "СИСТЕМНЫЙ"],
    cryptography: ["cryptography", "CRYPTOGRAPHY", "Криптография", "КРИПТОГРАФИЯ"],
  };
  for (const value of map[normalized] ?? []) {
    variants.add(value);
  }
  return [...variants];
}
