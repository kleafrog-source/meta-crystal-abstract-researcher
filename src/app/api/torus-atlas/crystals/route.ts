import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { TorusAtlasCrystal, TorusAtlasListResponse, TorusAtlasMetrics } from "@/types/torus-atlas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "24", 10)));
    const search = url.searchParams.get("search")?.trim() ?? "";
    const emeralds = url.searchParams.get("emeralds") === "1";

    const where: Record<string, unknown> = {};
    if (emeralds) {
      where.type = { in: ["EMERALD", "emerald", "Изумруд"] };
    }
    if (search) {
      where.OR = [
        { code: { contains: search } },
        { focus: { contains: search } },
        { combination: { contains: search } },
        { pattern: { contains: search } },
      ];
    }

    const [total, crystals] = await Promise.all([
      db.crystal.count({ where }),
      db.crystal.findMany({
        where,
        orderBy: { counter: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = crystals.map(mapCrystalToAtlas);
    const response: TorusAtlasListResponse = {
      ok: true,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

function mapCrystalToAtlas(crystal: any): TorusAtlasCrystal {
  const metrics = safeParse<TorusAtlasMetrics>(crystal.metricsJson, {});
  const metadata = safeParse<Record<string, unknown>>(crystal.metadataJson, {});
  const atlasSnapshot = readAtlasSnapshot(metadata);
  const torusDoc = pickFirstTorusDoc(metadata);
  const torusU = atlasSnapshot?.torusU ?? (typeof torusDoc?.x === "number" ? torusDoc.x : 0);
  const torusV = atlasSnapshot?.torusV ?? (typeof torusDoc?.y === "number" ? torusDoc.y : 0);
  const point3d = atlasSnapshot
    ? { x: atlasSnapshot.torusX, y: atlasSnapshot.torusY, z: atlasSnapshot.torusZ }
    : torusParam(torusU, torusV, 3, 1, 0.02);

  return {
    id: crystal.id,
    code: crystal.code,
    name: buildAtlasName(crystal),
    formula: crystal.combination,
    category: crystal.category ?? "",
    type: crystal.type,
    clusterLabel: atlasSnapshot?.clusterLabel ?? (typeof torusDoc?.cluster === "number" ? torusDoc.cluster : 0),
    formulaCluster: atlasSnapshot?.clusterLabel ?? (typeof torusDoc?.cluster === "number" ? torusDoc.cluster : 0),
    torusX: point3d.x,
    torusY: point3d.y,
    torusZ: point3d.z,
    torusU,
    torusV,
    layoutKey: atlasSnapshot?.layoutKey ?? "",
    layoutScope: atlasSnapshot?.scope === "all" || atlasSnapshot?.scope === "selected" ? atlasSnapshot.scope : "",
    layoutSize: atlasSnapshot?.layoutSize ?? 0,
    atlasStoredAt: atlasSnapshot?.storedAt ?? "",
    torusGeometryR: atlasSnapshot?.geometryR ?? 1.2,
    torusGeometryr: atlasSnapshot?.geometryr ?? 0.6,
    metrics,
    microNotes: readString(metadata.llmMicroNote),
    manifestDonors: readArray(metadata.manifestDonors),
    translation: readString(metadata.translation),
    autoAnnotation: readString(metadata.autoAnnotation),
    evolutionHistory: readArray(metadata.evolutionHistory),
    tags: readStringArray(metadata.tags),
    pattern: crystal.pattern ?? "",
    complexity: crystal.complexity ?? 0,
    qualityScore: crystal.qualityScore ?? 0,
    isEmerald: String(crystal.type ?? "").toLowerCase().includes("emerald") || String(crystal.type ?? "").includes("Изумруд"),
    createdAt: crystal.createdAt instanceof Date ? crystal.createdAt.toISOString() : String(crystal.createdAt),
  };
}

function readAtlasSnapshot(metadata: Record<string, unknown>) {
  const snapshot = metadata.torusAtlas;
  if (!snapshot || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, unknown>;
  return {
    layoutKey: typeof record.layoutKey === "string" ? record.layoutKey : "",
    scope: record.scope === "all" || record.scope === "selected" ? record.scope : "",
    layoutSize: Number(record.layoutSize ?? 0),
    storedAt: typeof record.storedAt === "string" ? record.storedAt : "",
    geometryR: Number(record.geometryR ?? 1.2),
    geometryr: Number(record.geometryr ?? 0.6),
    torusU: Number(record.torusU ?? 0),
    torusV: Number(record.torusV ?? 0),
    torusX: Number(record.torusX ?? 0),
    torusY: Number(record.torusY ?? 0),
    torusZ: Number(record.torusZ ?? 0),
    clusterLabel: Number(record.clusterLabel ?? 0),
  };
}

function buildAtlasName(crystal: any) {
  const focus = String(crystal.focus ?? "").trim();
  if (focus) {
    return focus.length > 80 ? `${focus.slice(0, 77)}...` : focus;
  }
  return crystal.code;
}

function pickFirstTorusDoc(metadata: Record<string, unknown>) {
  const analysis = metadata.torusAnalysis;
  if (!analysis || typeof analysis !== "object") return null;
  const docs = (analysis as Record<string, unknown>).docs;
  if (!Array.isArray(docs) || !docs.length) return null;
  const first = docs[0];
  if (!first || typeof first !== "object") return null;
  const torus = (first as Record<string, unknown>).torus;
  if (!torus || typeof torus !== "object") return null;
  const cluster = (first as Record<string, unknown>).cluster;
  return {
    x: Number((torus as Record<string, unknown>).x ?? 0),
    y: Number((torus as Record<string, unknown>).y ?? 0),
    cluster: typeof cluster === "number" ? cluster : Number(cluster ?? 0),
  };
}

function torusParam(u: number, v: number, R: number, r: number, twist: number) {
  const vt = v + twist * u;
  const cv = Math.cos(vt);
  const sv = Math.sin(vt);
  const cu = Math.cos(u);
  const su = Math.sin(u);
  return {
    x: (R + r * cv) * cu,
    y: (R + r * cv) * su,
    z: r * sv,
  };
}

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
