import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";
import { embedText } from "@/lib/ollama-client";

import { listJournalRecords } from "./journal";
import type { BridgeIndexRow, BridgeManifest, BridgeMatch } from "./types";
import {
  bridgeText,
  eligibleBridgeRecords,
  filterBridgeCandidates,
} from "./bridge-policy";

export const BRIDGE_ROOT = path.join(
  process.cwd(),
  "data",
  "cross-modal-consensus",
  "text-index",
);
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const normalized = (vector: number[]) => {
  const norm =
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
};
const dot = (left: number[], right: number[]) =>
  left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

async function atomicWrite(file: string, value: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, value);
  await fs.rename(temporary, file);
}

function encode(vectors: number[][], dimensions: number): Buffer {
  const buffer = Buffer.allocUnsafe(8 + vectors.length * dimensions * 4);
  buffer.writeUInt32LE(vectors.length, 0);
  buffer.writeUInt32LE(dimensions, 4);
  let offset = 8;
  for (const vector of vectors)
    for (const value of vector) {
      buffer.writeFloatLE(value, offset);
      offset += 4;
    }
  return buffer;
}

function decode(buffer: Buffer, count: number, dimensions: number): number[][] {
  if (buffer.readUInt32LE(0) !== count || buffer.readUInt32LE(4) !== dimensions)
    throw new Error("Bridge text index header mismatch");
  let offset = 8;
  return Array.from({ length: count }, () =>
    Array.from({ length: dimensions }, () => {
      const value = buffer.readFloatLE(offset);
      offset += 4;
      return value;
    }),
  );
}

export async function bridgeStatus() {
  const settings = await loadEmbeddingRuntimeSettings();
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(BRIDGE_ROOT, "manifest.json"), "utf8"),
    ) as BridgeManifest;
    return {
      ready: true,
      stale: manifest.model !== settings.model,
      active_model: settings.model,
      manifest,
    };
  } catch {
    return {
      ready: false,
      stale: false,
      active_model: settings.model,
      manifest: null,
    };
  }
}

export async function buildBridgeIndex() {
  const [records, settings] = await Promise.all([
    listJournalRecords(),
    loadEmbeddingRuntimeSettings(),
  ]);
  const candidates = eligibleBridgeRecords(records, true);
  const rows: BridgeIndexRow[] = [];
  const vectors: number[][] = [];
  const reusable = new Map<string, number[]>();
  try {
    const oldManifest = JSON.parse(
      await fs.readFile(path.join(BRIDGE_ROOT, "manifest.json"), "utf8"),
    ) as BridgeManifest;
    if (oldManifest.model === settings.model) {
      const oldRows = JSON.parse(
        await fs.readFile(path.join(BRIDGE_ROOT, "rows.json"), "utf8"),
      ) as BridgeIndexRow[];
      const oldVectors = decode(
        await fs.readFile(path.join(BRIDGE_ROOT, "embeddings.f32")),
        oldRows.length,
        oldManifest.dimensions,
      );
      oldRows.forEach((row, index) =>
        reusable.set(
          `${row.verification_id}:${row.text_sha256}`,
          oldVectors[index],
        ),
      );
    }
  } catch {
    /* A missing or incompatible previous index is rebuilt fully. */
  }
  for (const record of candidates) {
    const verification = record.latest_verification!;
    const text = bridgeText(record)!;
    const textHash = sha256(text);
    const vector =
      reusable.get(`${verification.id}:${textHash}`) ??
      normalized(await embedText(text));
    if (vectors.length && vector.length !== vectors[0].length)
      throw new Error("Bridge embedding dimensions changed during build");
    rows.push({
      record_id: record.id,
      verification_id: verification.id,
      modality: record.snapshot.modality,
      asset_sha256: record.asset?.sha256 ?? null,
      text_sha256: textHash,
      verification_status:
        record.latest_user_verdict?.decision === "approved"
          ? "approved"
          : (verification.status as "verified" | "review"),
      verification_score: verification.metrics?.verification_score ?? 0,
      label: record.label,
    });
    vectors.push(vector);
  }
  const dimensions = vectors[0]?.length ?? 0;
  const journalSha = sha256(
    rows
      .map(
        (row) => `${row.record_id}:${row.verification_id}:${row.text_sha256}`,
      )
      .sort()
      .join("\n"),
  );
  const manifest: BridgeManifest = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    model: settings.model,
    dimensions,
    count: rows.length,
    journal_sha256: journalSha,
    files: { rows: "rows.json", embeddings: "embeddings.f32" },
  };
  await fs.mkdir(BRIDGE_ROOT, { recursive: true });
  await atomicWrite(
    path.join(BRIDGE_ROOT, "rows.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
  );
  await atomicWrite(
    path.join(BRIDGE_ROOT, "embeddings.f32"),
    encode(vectors, dimensions),
  );
  await atomicWrite(
    path.join(BRIDGE_ROOT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

export async function searchBridge(
  recordId: string,
  includeReview = false,
  topK = 10,
): Promise<BridgeMatch[]> {
  const status = await bridgeStatus();
  if (!status.ready || !status.manifest)
    throw new Error("Bridge text index is not built");
  if (status.stale)
    throw new Error(
      "Bridge text index is stale because the embedding model changed",
    );
  const [rows, buffer, records] = await Promise.all([
    fs
      .readFile(path.join(BRIDGE_ROOT, "rows.json"), "utf8")
      .then((value) => JSON.parse(value) as BridgeIndexRow[]),
    fs.readFile(path.join(BRIDGE_ROOT, "embeddings.f32")),
    listJournalRecords(),
  ]);
  const sourceIndex = rows.findIndex((row) => row.record_id === recordId);
  if (sourceIndex < 0)
    throw new Error("The selected record is not eligible for the Bridge index");
  const source = rows[sourceIndex];
  const candidates = filterBridgeCandidates(source, rows, includeReview);
  const vectors = decode(buffer, rows.length, status.manifest.dimensions);
  const byId = new Map(records.map((record) => [record.id, record]));
  const sourceNames = new Set(
    byId
      .get(source.record_id)
      ?.snapshot.parameters.map((item) => item.technical_name) ?? [],
  );
  return candidates
    .map((row) => {
      const index = rows.findIndex((item) => item.record_id === row.record_id);
      const record = byId.get(row.record_id);
      return {
        record_id: row.record_id,
        label: row.label,
        modality: row.modality,
        similarity: Number(
          dot(vectors[sourceIndex], vectors[index]).toFixed(6),
        ),
        verification_score: row.verification_score,
        common_parameters: (record?.snapshot.parameters ?? [])
          .map((item) => item.technical_name)
          .filter((name) => sourceNames.has(name)),
        asset_sha256: row.asset_sha256,
      };
    })
    .sort(
      (a, b) =>
        b.similarity - a.similarity || a.record_id.localeCompare(b.record_id),
    )
    .slice(0, Math.max(1, Math.min(50, topK)));
}
