import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { db } from "@/lib/db";
import type { AtlasChart, CrystalNode } from "@/lib/metis/types";
import type { LibraryCrystal, LibrarySummary } from "@/lib/metis-research/types";

type JsonRecord = Record<string, unknown>;

function safeParseRecord(value: string | null | undefined): JsonRecord {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function safeParseArray(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => Number(item) || 0) : [];
  } catch {
    return [];
  }
}

function readCrystalFile(filepath: string): JsonRecord {
  if (!filepath || !existsSync(filepath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filepath, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashFloat(seed: string, salt: string) {
  const hash = createHash("sha1").update(`${salt}:${seed}`).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

function normalizeCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  const normalized = (value + 30) / 60;
  return Math.max(0, Math.min(1, normalized));
}

function pickChart(u: number, v: number) {
  if (u < 0.5 && v < 0.5) return "chart_A";
  if (u >= 0.5 && v < 0.5) return "chart_B";
  if (u < 0.5 && v >= 0.5) return "chart_C";
  return "chart_D";
}

function deriveDomain(type: string, category: string | null, focus: string | null) {
  const lowerType = String(type || "").toLowerCase();
  const lowerCategory = String(category || "").toLowerCase();
  const lowerFocus = String(focus || "").toLowerCase();
  if (lowerCategory) {
    return lowerCategory.split(/[>/\\|:]+/)[0].trim() || "general";
  }
  if (lowerType.includes("quant")) return "quantum";
  if (lowerType.includes("hybrid")) return "hybrid";
  if (lowerType.includes("diamond") || lowerType.includes("алмаз")) return "diamond";
  if (lowerType.includes("emerald") || lowerType.includes("изум")) return "emerald";
  if (lowerFocus.includes("rag") || lowerFocus.includes("retriev")) return "retrieval";
  return "general";
}

function buildContent(row: {
  code: string;
  type: string;
  focus: string | null;
  pattern: string | null;
  combination: string;
  searchText: string;
  filepath: string;
  metadataJson: string | null;
}) {
  const metadata = safeParseRecord(row.metadataJson);
  const fileData = readCrystalFile(row.filepath);
  const title = readString(fileData.title) ?? readString(metadata.title);
  const summary = readString(fileData.summary) ?? readString(metadata.summary);
  const llmMicroNote = readString(fileData.llm_micro_note) ?? readString(metadata.llmMicroNote);
  const interpretation =
    readString(fileData.interpretation) ??
    readString(fileData.llm_interpretation) ??
    readString(metadata.interpretation);
  return [
    row.code,
    row.type,
    title,
    summary,
    llmMicroNote,
    interpretation,
    row.focus,
    row.pattern,
    row.combination,
    row.searchText,
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildCoords(row: {
  code: string;
  metadataJson: string | null;
  umapX: number | null;
  umapY: number | null;
}) {
  const metadata = safeParseRecord(row.metadataJson);
  const torusAtlas =
    metadata.torusAtlas && typeof metadata.torusAtlas === "object"
      ? (metadata.torusAtlas as JsonRecord)
      : null;
  const torusU = Number(torusAtlas?.torusU);
  const torusV = Number(torusAtlas?.torusV);
  const u = Number.isFinite(torusU)
    ? Math.max(0, Math.min(1, torusU))
    : row.umapX !== null
      ? normalizeCoordinate(row.umapX)
      : hashFloat(row.code, "u");
  const v = Number.isFinite(torusV)
    ? Math.max(0, Math.min(1, torusV))
    : row.umapY !== null
      ? normalizeCoordinate(row.umapY)
      : hashFloat(row.code, "v");
  const atlasChart =
    typeof torusAtlas?.atlasChart === "string" && torusAtlas.atlasChart.trim()
      ? torusAtlas.atlasChart.trim()
      : pickChart(u, v);
  return { torus_u: u, torus_v: v, atlas_chart: atlasChart };
}

export async function loadResearchCorpus(): Promise<{
  crystals: LibraryCrystal[];
  summary: LibrarySummary;
  charts: AtlasChart[];
}> {
  const rows = await db.crystal.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      type: true,
      category: true,
      focus: true,
      pattern: true,
      combination: true,
      searchText: true,
      filepath: true,
      embedding: true,
      metadataJson: true,
      qualityScore: true,
      createdAt: true,
      umapX: true,
      umapY: true,
    },
  });

  const crystals: LibraryCrystal[] = rows.map((row, index) => {
    const coords = buildCoords(row);
    const embeddingPreview = safeParseArray(row.embedding).slice(0, 8);
    const importance = Math.max(
      0.08,
      Math.min(
        0.98,
        (row.qualityScore ?? 0.55) > 1 ? (row.qualityScore ?? 0.55) / 100 : (row.qualityScore ?? 0.55),
      ),
    );
    return {
      node_id: `crystal:${row.id}`,
      crystal_id: row.id,
      code: row.code,
      type: row.type || "unknown",
      focus: row.focus?.trim() || row.code,
      domain: deriveDomain(row.type, row.category, row.focus),
      combination: row.combination,
      content: buildContent(row),
      importance,
      coords,
      created_at: row.createdAt.getTime(),
      updated_at: row.createdAt.getTime(),
      svd_rank: 32,
      overflow_flag: false,
      embedding_preview: embeddingPreview.length ? embeddingPreview : [hashFloat(row.code, "e1"), hashFloat(row.code, "e2")],
      rawEmbeddingScore: 0,
    };
  });

  const byType: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const byFocus: Record<string, number> = {};
  let importanceSum = 0;

  for (const crystal of crystals) {
    byType[crystal.type] = (byType[crystal.type] ?? 0) + 1;
    byDomain[crystal.domain] = (byDomain[crystal.domain] ?? 0) + 1;
    byFocus[crystal.focus] = (byFocus[crystal.focus] ?? 0) + 1;
    importanceSum += crystal.importance;
  }

  const chartMap = new Map<string, AtlasChart>();
  for (const crystal of crystals) {
    const existing = chartMap.get(crystal.coords.atlas_chart);
    if (!existing) {
      chartMap.set(crystal.coords.atlas_chart, {
        chart_id: crystal.coords.atlas_chart,
        u_range: [crystal.coords.torus_u, crystal.coords.torus_u],
        v_range: [crystal.coords.torus_v, crystal.coords.torus_v],
        resolution: 256,
        node_count: 1,
        created_at: Date.now(),
        created_due_to_overflow: false,
      });
      continue;
    }
    existing.node_count += 1;
    existing.u_range = [Math.min(existing.u_range[0], crystal.coords.torus_u), Math.max(existing.u_range[1], crystal.coords.torus_u)];
    existing.v_range = [Math.min(existing.v_range[0], crystal.coords.torus_v), Math.max(existing.v_range[1], crystal.coords.torus_v)];
  }

  const charts = [...chartMap.values()].map((chart) => ({
    ...chart,
    u_range: [Math.max(0, chart.u_range[0] - 0.02), Math.min(1, chart.u_range[1] + 0.02)] as [number, number],
    v_range: [Math.max(0, chart.v_range[0] - 0.02), Math.min(1, chart.v_range[1] + 0.02)] as [number, number],
  }));

  return {
    crystals,
    summary: {
      totalCrystals: crystals.length,
      byType,
      byDomain,
      byFocus,
      avgImportance: crystals.length ? importanceSum / crystals.length : 0,
      generatedAt: Date.now(),
      corpusVersion: `sqlite:${crystals.length}`,
    },
    charts,
  };
}

export function buildCorpusEmbeddings(crystals: LibraryCrystal[], storedEmbeddings: Map<string, number[]>): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const crystal of crystals) {
    const vector = storedEmbeddings.get(crystal.node_id);
    if (vector?.length) {
      map.set(crystal.node_id, vector);
      continue;
    }
    const fallback = Array.from({ length: 384 }, (_, index) => hashFloat(crystal.code, `fallback:${index}`) - 0.5);
    const norm = Math.sqrt(fallback.reduce((sum, value) => sum + value * value, 0)) || 1;
    map.set(crystal.node_id, fallback.map((value) => value / norm));
  }
  return map;
}

export function buildStoredEmbeddingMap(crystals: LibraryCrystal[], sourceRows: Array<{ id: string; embedding: string | null }>) {
  const rowMap = new Map(sourceRows.map((row) => [`crystal:${row.id}`, safeParseArray(row.embedding)]));
  const embeddings = new Map<string, number[]>();
  for (const crystal of crystals) {
    const vector = rowMap.get(crystal.node_id);
    if (vector?.length) embeddings.set(crystal.node_id, vector);
  }
  return embeddings;
}

export async function loadStoredEmbeddings(): Promise<Map<string, number[]>> {
  const rows = await db.crystal.findMany({
    select: { id: true, embedding: true },
  });
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const vector = safeParseArray(row.embedding);
    if (vector.length) {
      map.set(`crystal:${row.id}`, vector);
    }
  }
  return map;
}
