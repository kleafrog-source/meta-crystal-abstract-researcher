import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  deleteJournalRecord,
  listJournalRecords,
  saveJournalRecord,
  saveJournalVerdict,
  type JournalAssetInput,
} from "@/lib/cross-modal/journal";
import type {
  CrossModalEngine,
  CrossModalModality,
  JournalCreateMetadata,
} from "@/lib/cross-modal/types";
import { callSidecar } from "@/lib/engine/runner";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;
const MAX_ASSET_BYTES = 150 * 1024 * 1024;
const MODALITIES = new Set<CrossModalModality>([
  "audio",
  "image",
  "text",
  "transition",
]);
const ENGINES = new Set<CrossModalEngine>([
  "clap",
  "siglip2",
  "semantic-v3",
  "consensus",
  "transition",
]);

function parseMetadata(raw: FormDataEntryValue | null): JournalCreateMetadata {
  if (typeof raw !== "string") throw new Error("Journal metadata is required");
  const value = JSON.parse(raw) as Partial<JournalCreateMetadata>;
  if (!MODALITIES.has(value.modality as CrossModalModality))
    throw new Error("Unsupported journal modality");
  if (!ENGINES.has(value.engine as CrossModalEngine))
    throw new Error("Unsupported journal engine");
  if (!Array.isArray(value.parameters) || !value.parameters.length)
    throw new Error("Journal parameters are required");
  if (
    !value.model ||
    typeof value.model.id !== "string" ||
    !value.model.id.trim()
  )
    throw new Error("Journal model id is required");
  return {
    modality: value.modality as CrossModalModality,
    engine: value.engine as CrossModalEngine,
    label: typeof value.label === "string" ? value.label : undefined,
    query: typeof value.query === "string" ? value.query : undefined,
    model: value.model,
    settings:
      value.settings && typeof value.settings === "object"
        ? value.settings
        : {},
    parameters: value.parameters as ActiveParameter[],
  };
}

async function prepareAsset(
  metadata: JournalCreateMetadata,
  file: File | null,
): Promise<{ asset?: JournalAssetInput; temporary?: string }> {
  if (metadata.modality === "text" || metadata.modality === "transition")
    return {};
  if (!file?.size)
    throw new Error(
      "A media asset is required for audio/image journal records",
    );
  if (file.size > MAX_ASSET_BYTES)
    throw new Error("Journal media asset exceeds 150 MB");
  if (metadata.modality === "image") {
    const extension = path.extname(file.name).toLowerCase();
    const inferred = (
      {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
      } as Record<string, string>
    )[extension];
    if (
      !file.type.startsWith("image/") &&
      !(file.type === "application/octet-stream" && inferred)
    )
      throw new Error("Journal image has an unsupported MIME type");
    return {
      asset: {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type.startsWith("image/") ? file.type : inferred,
        originalName: file.name,
        extension: extension || ".image",
      },
    };
  }
  if (
    !file.type.startsWith("audio/") &&
    file.type !== "application/octet-stream"
  )
    throw new Error("Journal audio has an unsupported MIME type");
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "meta-crystal-journal-audio-"),
  );
  const input = path.join(
    temporary,
    `source${path.extname(file.name) || ".audio"}`,
  );
  const output = path.join(temporary, "fragment.wav");
  await fs.writeFile(input, Buffer.from(await file.arrayBuffer()));
  const offset = Math.max(0, Number(metadata.settings?.offset) || 0);
  const duration = Math.max(
    1,
    Math.min(800, Number(metadata.settings?.duration) || 8),
  );
  await callSidecar("audio_save_fragment", {
    args: [input],
    inputFile: { output_path: output, offset, duration },
    timeoutMs: 30 * 60_000,
    taskType: "cross-modal",
    title: "Prepare Journal audio fragment",
  });
  return {
    temporary,
    asset: {
      bytes: await fs.readFile(output),
      mimeType: "audio/wav",
      originalName: `${path.parse(file.name).name}_${offset.toFixed(2)}-${(offset + duration).toFixed(2)}.wav`,
      extension: ".wav",
    },
  };
}

export async function GET() {
  try {
    const records = await listJournalRecords();
    return NextResponse.json({ records, count: records.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let temporary: string | undefined;
  try {
    const form = await request.formData();
    const metadata = parseMetadata(form.get("metadata"));
    const file = form.get("asset");
    const prepared = await prepareAsset(
      metadata,
      file instanceof File ? file : null,
    );
    temporary = prepared.temporary;
    const identity = await getV3SnapshotIdentity();
    const result = await saveJournalRecord(
      metadata,
      { version: identity.dataset_version, sha256: identity.content_sha256 },
      prepared.asset,
    );
    return NextResponse.json(result, { status: result.existed ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  } finally {
    if (temporary)
      await fs
        .rm(temporary, { recursive: true, force: true })
        .catch(() => undefined);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id)
      return NextResponse.json(
        { error: "Journal record id is required" },
        { status: 400 },
      );
    const result = await deleteJournalRecord(body.id);
    return NextResponse.json(result, { status: result.deleted ? 200 : 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      decision?: string;
      note?: string;
    };
    if (
      !body.id ||
      (body.decision !== "approved" && body.decision !== "rejected")
    )
      return NextResponse.json(
        { error: "Record id and approved/rejected decision are required" },
        { status: 400 },
      );
    return NextResponse.json({
      verdict: await saveJournalVerdict(body.id, body.decision, body.note),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
