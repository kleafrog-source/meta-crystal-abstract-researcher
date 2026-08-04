import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetricsMap = Record<string, number>;
type MetadataMap = Record<string, unknown>;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projection = (url.searchParams.get("projection") ?? "umap").trim().toLowerCase();
    const cluster = url.searchParams.get("cluster")?.trim();
    const type = url.searchParams.get("type")?.trim();
    const search = url.searchParams.get("search")?.trim().toLowerCase();
    const qMin = parseOptionalNumber(url.searchParams.get("q_min"));
    const qMax = parseOptionalNumber(url.searchParams.get("q_max"));

    if (projection !== "umap") {
      return NextResponse.json({ ok: false, error: "Only UMAP projection is implemented." }, { status: 400 });
    }

    const rows = await db.crystal.findMany({
      where: {
        umapX: { not: null },
        umapY: { not: null },
        ...(type ? { type } : {}),
      },
      orderBy: { counter: "desc" },
      select: {
        id: true,
        code: true,
        type: true,
        focus: true,
        combination: true,
        qualityScore: true,
        metricsJson: true,
        metadataJson: true,
        createdAt: true,
        umapX: true,
        umapY: true,
      },
    });

    const items = rows
      .map((row) => {
        const metrics = safeParse<MetricsMap>(row.metricsJson, {});
        const metadata = safeParse<MetadataMap>(row.metadataJson, {});
        const semanticClusterLabel = readNumber(metadata.semanticClusterLabel);
        const torusClusterLabel = readNumber(metadata.torusClusterLabel);
        const qValue = readMetric(metrics, "Q");
        return {
          id: row.id,
          x: Number(row.umapX ?? 0),
          y: Number(row.umapY ?? 0),
          code: row.code,
          title: row.focus || row.code,
          formula: row.combination,
          type: row.type,
          qualityScore: row.qualityScore,
          metrics: {
            Q: qValue,
            QEC: readMetric(metrics, "QEC"),
            D_f: readMetric(metrics, "D_f"),
            G_S: readMetric(metrics, "G_S"),
          },
          cluster: semanticClusterLabel,
          semanticClusterLabel,
          torusClusterLabel,
          torusPosition: {
            u: readNumber(metadata.torusU),
            v: readNumber(metadata.torusV),
          },
          createdAt: row.createdAt.toISOString(),
        };
      })
      .filter((item) => {
        if (cluster && String(item.semanticClusterLabel ?? "") !== cluster) {
          return false;
        }
        if (qMin !== null && (item.metrics.Q ?? Number.NEGATIVE_INFINITY) < qMin) {
          return false;
        }
        if (qMax !== null && (item.metrics.Q ?? Number.POSITIVE_INFINITY) > qMax) {
          return false;
        }
        if (search) {
          const haystack = `${item.code} ${item.title} ${item.formula}`.toLowerCase();
          return haystack.includes(search);
        }
        return true;
      });

    const availableClusters = [...new Set(items.map((item) => item.semanticClusterLabel).filter((value) => value !== null))].sort((a, b) => (a ?? 0) - (b ?? 0));

    return NextResponse.json({
      ok: true,
      projection: "umap",
      total: items.length,
      availableClusters,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

function parseOptionalNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeParse<T>(source: string | null, fallback: T): T {
  if (!source) return fallback;
  try {
    return JSON.parse(source) as T;
  } catch {
    return fallback;
  }
}

function readMetric(metrics: MetricsMap, key: string) {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
