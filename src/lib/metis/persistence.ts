import { existsSync, readFileSync } from "node:fs";
import { db } from "@/lib/db";
import type { CrystalNode } from "@/lib/metis/types";

export interface ImportLibraryParams {
  limit: number;
  ids?: string[];
  codes?: string[];
  onlyWithEmbeddings?: boolean;
  type?: string;
}

type JsonRecord = Record<string, unknown>;

type CrystalImportRow = {
  id: string;
  code: string;
  focus: string | null;
  combination: string;
  searchText: string;
  pattern: string | null;
  type: string;
  title?: string | null;
  summary?: string | null;
  llmMicroNote?: string | null;
  interpretation?: string | null;
  filepath: string;
  embedding: string | null;
  metadataJson: string | null;
  qualityScore: number | null;
  createdAt: Date;
  umapX: number | null;
  umapY: number | null;
};

function safeParseArray(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => Number(item) || 0) : [];
  } catch {
    return [];
  }
}

function safeParseRecord(value: string | null | undefined): JsonRecord {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
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

function buildContent(crystal: CrystalImportRow): string {
  const parts = [
    crystal.code,
    crystal.type,
    crystal.title,
    crystal.summary,
    crystal.llmMicroNote,
    crystal.interpretation,
    crystal.focus,
    crystal.pattern,
    crystal.combination,
    crystal.searchText,
  ].filter(Boolean);
  return parts.join(" | ");
}

function extractCrystalText(row: {
  id: string;
  code: string;
  focus: string | null;
  combination: string;
  searchText: string;
  pattern: string | null;
  type: string;
  filepath: string;
  embedding: string | null;
  metadataJson: string | null;
  qualityScore: number | null;
  createdAt: Date;
  umapX: number | null;
  umapY: number | null;
}): CrystalImportRow {
  const metadata = safeParseRecord(row.metadataJson);
  const fullFile = readCrystalFile(row.filepath);
  return {
    ...row,
    title: readString(fullFile.title) ?? readString(metadata.title),
    summary: readString(fullFile.summary) ?? readString(metadata.summary),
    llmMicroNote: readString(fullFile.llm_micro_note) ?? readString(metadata.llmMicroNote),
    interpretation:
      readString(fullFile.interpretation) ??
      readString(fullFile.llm_interpretation) ??
      readString(metadata.interpretation),
  };
}

function pickAtlasChartFromMetadata(metadata: JsonRecord, fallbackChart: string) {
  const torusAtlas =
    metadata.torusAtlas && typeof metadata.torusAtlas === "object"
      ? (metadata.torusAtlas as JsonRecord)
      : null;
  const clusterLabel = Number(
    torusAtlas?.torusClusterLabel ??
      torusAtlas?.clusterLabel ??
      metadata.torusClusterLabel ??
      metadata.clusterLabel ??
      NaN,
  );
  if (Number.isFinite(clusterLabel) && clusterLabel >= 0) {
    return `chart_${String.fromCharCode(65 + (Math.trunc(clusterLabel) % 26))}`;
  }
  return fallbackChart;
}

function readNormalizedCoordinate(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function resolveCoords(crystal: CrystalImportRow) {
  const metadata = safeParseRecord(crystal.metadataJson);
  const torusAtlas =
    metadata.torusAtlas && typeof metadata.torusAtlas === "object"
      ? (metadata.torusAtlas as JsonRecord)
      : null;
  const torusU =
    readNormalizedCoordinate(torusAtlas?.torusU) ??
    (crystal.umapX !== null && crystal.umapX !== undefined ? normalizeCoordinate(crystal.umapX) : hashCoordinate(crystal.code, 31));
  const torusV =
    readNormalizedCoordinate(torusAtlas?.torusV) ??
    (crystal.umapY !== null && crystal.umapY !== undefined ? normalizeCoordinate(crystal.umapY) : hashCoordinate(crystal.code, 37));
  const atlasChart = pickAtlasChartFromMetadata(metadata, pickAtlasChart(torusU, torusV));
  return { torusU, torusV, atlasChart, metadata };
}

function buildMetisMetadata(
  crystal: CrystalImportRow,
  nodeId: string,
  importedAt: string,
  previousMetadata: JsonRecord,
) {
  return {
    ...previousMetadata,
    metis: {
      ...(previousMetadata.metis && typeof previousMetadata.metis === "object"
        ? (previousMetadata.metis as JsonRecord)
        : {}),
      imported: true,
      enriched: true,
      importedAt,
      source: "metis_lab",
      nodeId,
      crystalCode: crystal.code,
    },
  };
}

export function toPersistedNode(node: CrystalNode) {
  return {
    nodeId: node.node_id,
    crystalId: node.crystal_id,
    sourceCrystalId: null,
    sourceCrystalCode: null,
    content: node.content,
    importance: node.importance,
    torusU: node.coords.torus_u,
    torusV: node.coords.torus_v,
    atlasChart: node.coords.atlas_chart,
    svdRank: node.svd_rank,
    overflowFlag: node.overflow_flag,
    embeddingPreviewJson: JSON.stringify(node.embedding_preview),
    metadataJson: null,
  };
}

export async function upsertMetisNode(node: CrystalNode) {
  await db.metisNode.upsert({
    where: { nodeId: node.node_id },
    create: toPersistedNode(node),
    update: {
      crystalId: node.crystal_id,
      content: node.content,
      importance: node.importance,
      torusU: node.coords.torus_u,
      torusV: node.coords.torus_v,
      atlasChart: node.coords.atlas_chart,
      svdRank: node.svd_rank,
      overflowFlag: node.overflow_flag,
      embeddingPreviewJson: JSON.stringify(node.embedding_preview),
    },
  });
}

export async function deleteMetisNode(nodeId: string) {
  await db.metisNode.deleteMany({ where: { nodeId } });
}

export async function deleteMetisNodesBySubstring(contentSubstring: string) {
  await db.metisNode.deleteMany({
    where: {
      content: {
        contains: contentSubstring,
      },
    },
  });
}

export async function clearMetisNodes() {
  await db.metisNode.deleteMany();
}

export async function loadPersistedMetisNodes(): Promise<CrystalNode[]> {
  const rows = await db.metisNode.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => ({
    node_id: row.nodeId,
    crystal_id: row.crystalId,
    content: row.content,
    importance: row.importance,
    coords: {
      torus_u: row.torusU,
      torus_v: row.torusV,
      atlas_chart: row.atlasChart,
    },
    created_at: row.createdAt.getTime(),
    updated_at: row.updatedAt.getTime(),
    svd_rank: row.svdRank,
    overflow_flag: row.overflowFlag,
    embedding_preview: safeParseArray(row.embeddingPreviewJson),
  }));
}

export async function importCrystalsToMetis(params: ImportLibraryParams): Promise<{ imported: number; skipped: number; nodes: CrystalNode[] }> {
  const ids = [...new Set((params.ids ?? []).map((value) => value.trim()).filter(Boolean))];
  const codes = [...new Set((params.codes ?? []).map((value) => value.trim()).filter(Boolean))];
  const crystals = await db.crystal.findMany({
    where: {
      ...(ids.length ? { id: { in: ids } } : {}),
      ...(codes.length ? { code: { in: codes } } : {}),
      ...(params.onlyWithEmbeddings ? { embedding: { not: null } } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { counter: "desc" },
    take: Math.max(1, Math.min(params.limit, 2000)),
  });

  let imported = 0;
  let skipped = 0;
  const nodes: CrystalNode[] = [];

  for (const crystal of crystals) {
    const enrichedCrystal = extractCrystalText(crystal);
    const existing = await db.metisNode.findFirst({
      where: {
        sourceCrystalId: crystal.id,
      },
      select: { id: true, nodeId: true },
    });
    if (existing) {
      const metadata = safeParseRecord(crystal.metadataJson);
      const nextMetadata = buildMetisMetadata(enrichedCrystal, existing.nodeId, new Date().toISOString(), metadata);
      await db.crystal.update({
        where: { id: crystal.id },
        data: { metadataJson: JSON.stringify(nextMetadata) },
      });
      skipped += 1;
      continue;
    }

    const embedding = safeParseArray(crystal.embedding);
    const preview = embedding.slice(0, 8);
    const nodeId = `lib_${crystal.code}`;
    const importedAt = new Date().toISOString();
    const { torusU, torusV, atlasChart, metadata } = resolveCoords(enrichedCrystal);
    const node: CrystalNode = {
      node_id: nodeId,
      crystal_id: crystal.code,
      content: buildContent(enrichedCrystal),
      importance: crystal.qualityScore ?? 0.5,
      coords: {
        torus_u: torusU,
        torus_v: torusV,
        atlas_chart: atlasChart,
      },
      created_at: crystal.createdAt.getTime(),
      updated_at: Date.now(),
      svd_rank: 32,
      overflow_flag: false,
      embedding_preview: preview.length ? preview : Array.from({ length: 8 }, (_, index) => hashCoordinate(crystal.code, index + 11) * 2 - 1),
    };
    const nextMetadata = buildMetisMetadata(enrichedCrystal, nodeId, importedAt, metadata);
    await db.metisNode.create({
      data: {
        nodeId,
        crystalId: crystal.code,
        sourceCrystalId: crystal.id,
        sourceCrystalCode: crystal.code,
        content: node.content,
        importance: node.importance,
        torusU,
        torusV,
        atlasChart,
        svdRank: node.svd_rank,
        overflowFlag: false,
        embeddingPreviewJson: JSON.stringify(node.embedding_preview),
        metadataJson: JSON.stringify(nextMetadata),
      },
    });
    await db.crystal.update({
      where: { id: crystal.id },
      data: {
        metadataJson: JSON.stringify(nextMetadata),
      },
    });
    nodes.push(node);
    imported += 1;
  }

  return { imported, skipped, nodes };
}

function normalizeCoordinate(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0.5;
  const shifted = (value + 20) / 40;
  return Math.max(0, Math.min(1, shifted));
}

function hashCoordinate(seedValue: string, multiplier: number) {
  let hash = 0;
  for (let index = 0; index < seedValue.length; index += 1) {
    hash = (hash * multiplier + seedValue.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function pickAtlasChart(u: number, v: number) {
  if (u < 0.5 && v < 0.5) return "chart_A";
  if (u >= 0.5 && v < 0.5) return "chart_B";
  if (u < 0.5 && v >= 0.5) return "chart_C";
  return "chart_D";
}
