import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ActiveParameter } from "@/lib/rag-v3/types";

import type {
  ConsensusParameter,
  JournalAsset,
  JournalCreateMetadata,
  JournalIndex,
  JournalManifest,
  JournalRecord,
  JournalVerdict,
  JournalVerification,
} from "./types";

export const JOURNAL_ROOT = path.join(
  process.cwd(),
  "data",
  "cross-modal-consensus",
  "journal",
);
const ID_PATTERN = /^[a-f0-9]{64}$/;

export interface JournalAssetInput {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
  extension: string;
}
export interface DatasetIdentity {
  version: string;
  sha256: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function safeId(value: string): string {
  if (!ID_PATTERN.test(value)) throw new Error("Invalid journal record id");
  return value;
}
function safeExtension(value: string): string {
  const normalized = value.toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(normalized) ? normalized : ".bin";
}
function scalar(value: unknown): number | string {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return String(value ?? "");
}

function normalizeParameters(
  parameters: ActiveParameter[],
): ConsensusParameter[] {
  const valid = parameters
    .filter(
      (item) =>
        item &&
        typeof item.technical_name === "string" &&
        item.technical_name.trim(),
    )
    .slice(0, 200);
  const scores = valid
    .map((item) => Number(item.similarity))
    .filter(Number.isFinite);
  const minimum = scores.length ? Math.min(...scores) : 0;
  const maximum = scores.length ? Math.max(...scores) : 0;
  return valid.map((item, index) => {
    const rawScore = Number(item.similarity);
    const rankFallback = Number(
      (1 - index / Math.max(1, valid.length)).toFixed(8),
    );
    return {
      technical_name: item.technical_name,
      rank: index + 1,
      retrieval_score: Number.isFinite(rawScore) ? rawScore : null,
      normalized_score:
        Number.isFinite(rawScore) && maximum > minimum
          ? Number(((rawScore - minimum) / (maximum - minimum)).toFixed(8))
          : rankFallback,
      default_value: scalar(item.default),
      selected_value: scalar(item.current_value),
      ui_element: String(item.ui_element || "String"),
      min_value:
        typeof item.min_value === "number" ? item.min_value : undefined,
      max_value:
        typeof item.max_value === "number" ? item.max_value : undefined,
      value_source: String(item.source || "default"),
      retrieval_scope: item.retrieval_scope,
    };
  });
}

async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

async function readRecords(root: string): Promise<JournalRecord[]> {
  const directory = path.join(root, "records");
  let names: string[] = [];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const records = await Promise.all(
    names
      .filter(
        (name) =>
          ID_PATTERN.test(path.parse(name).name) && name.endsWith(".json"),
      )
      .map(
        async (name) =>
          JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8"),
          ) as JournalRecord,
      ),
  );
  return records.sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
  );
}

async function rebuildIndex(
  root: string,
): Promise<{ index: JournalIndex; manifest: JournalManifest }> {
  const records = await readRecords(root);
  const ids = records.map((record) => record.id);
  const updated = new Date().toISOString();
  const index: JournalIndex = {
    schema_version: 1,
    updated_at: updated,
    count: ids.length,
    record_ids: ids,
  };
  const manifest: JournalManifest = {
    schema_version: 1,
    updated_at: updated,
    count: ids.length,
    journal_sha256: sha256(canonical(ids.slice().sort())),
  };
  await atomicJson(path.join(root, "index.json"), index);
  await atomicJson(path.join(root, "manifest.json"), manifest);
  return { index, manifest };
}

async function latestVerification(
  id: string,
  root: string,
): Promise<JournalVerification | null> {
  const directory = path.join(root, "verifications", safeId(id));
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return null;
  }
  const items = await Promise.all(
    names
      .filter(
        (name) =>
          name.endsWith(".json") && ID_PATTERN.test(path.parse(name).name),
      )
      .map(
        async (name) =>
          JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8"),
          ) as JournalVerification,
      ),
  );
  return (
    items.sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )[0] ?? null
  );
}

async function latestVerdict(
  id: string,
  root: string,
): Promise<JournalVerdict | null> {
  const directory = path.join(root, "verdicts", safeId(id));
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return null;
  }
  const items = await Promise.all(
    names
      .filter(
        (name) =>
          name.endsWith(".json") && ID_PATTERN.test(path.parse(name).name),
      )
      .map(
        async (name) =>
          JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8"),
          ) as JournalVerdict,
      ),
  );
  return (
    items.sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )[0] ?? null
  );
}

export async function listJournalRecords(
  root = JOURNAL_ROOT,
): Promise<JournalRecord[]> {
  return Promise.all(
    (await readRecords(root)).map(async (record) => ({
      ...record,
      latest_verification: await latestVerification(record.id, root),
      latest_user_verdict: await latestVerdict(record.id, root),
    })),
  );
}

export async function getJournalRecord(
  id: string,
  root = JOURNAL_ROOT,
): Promise<JournalRecord | null> {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(root, "records", `${safeId(id)}.json`),
        "utf8",
      ),
    ) as JournalRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveJournalVerification(
  input: Omit<JournalVerification, "id" | "content_sha256" | "created_at">,
  root = JOURNAL_ROOT,
) {
  if (!(await getJournalRecord(input.source_record_id, root)))
    throw new Error("Journal source record was not found");
  const id = sha256(canonical(input));
  const record: JournalVerification = {
    ...input,
    id,
    content_sha256: id,
    created_at: new Date().toISOString(),
  };
  const target = path.join(
    root,
    "verifications",
    safeId(input.source_record_id),
    `${id}.json`,
  );
  try {
    await fs.access(target);
    return JSON.parse(await fs.readFile(target, "utf8")) as JournalVerification;
  } catch {
    await atomicJson(target, record);
    return record;
  }
}

export async function saveJournalVerdict(
  sourceRecordId: string,
  decision: "approved" | "rejected",
  note?: string,
  root = JOURNAL_ROOT,
) {
  const record = await getJournalRecord(sourceRecordId, root);
  if (!record) throw new Error("Journal source record was not found");
  const verification = await latestVerification(sourceRecordId, root);
  const content = {
    schema_version: 1 as const,
    source_record_id: sourceRecordId,
    verification_id: verification?.id ?? null,
    decision,
    note: note?.trim().slice(0, 500) || null,
  };
  const id = sha256(canonical(content));
  const target = path.join(
    root,
    "verdicts",
    safeId(sourceRecordId),
    `${id}.json`,
  );
  try {
    await fs.access(target);
    return JSON.parse(await fs.readFile(target, "utf8")) as JournalVerdict;
  } catch {
    const verdict: JournalVerdict = {
      ...content,
      id,
      created_at: new Date().toISOString(),
    };
    await atomicJson(target, verdict);
    return verdict;
  }
}

export async function saveJournalRecord(
  metadata: JournalCreateMetadata,
  identity: DatasetIdentity,
  assetInput?: JournalAssetInput,
  root = JOURNAL_ROOT,
) {
  const parameters = normalizeParameters(metadata.parameters);
  if (!parameters.length)
    throw new Error("Journal snapshot requires at least one parameter");
  let asset: JournalAsset | null = null;
  if (assetInput) {
    const assetHash = sha256(assetInput.bytes);
    const extension = safeExtension(assetInput.extension);
    const relativePath = path.posix.join("assets", `${assetHash}${extension}`);
    const destination = path.join(root, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.writeFile(destination, assetInput.bytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    asset = {
      sha256: assetHash,
      relative_path: relativePath,
      mime_type: assetInput.mimeType || "application/octet-stream",
      size: assetInput.bytes.byteLength,
      original_name: path.basename(assetInput.originalName).slice(0, 240),
    };
  }
  const content = {
    schema_version: 1 as const,
    label: String(
      metadata.label ||
        `${metadata.modality} · ${parameters.length} parameters`,
    )
      .trim()
      .slice(0, 200),
    query: metadata.query?.trim().slice(0, 4000) || null,
    snapshot: {
      modality: metadata.modality,
      engine: metadata.engine,
      top_k: parameters.length,
      parameters,
      dataset_version: identity.version,
      dataset_sha256: identity.sha256,
      model: metadata.model,
      settings: metadata.settings ?? {},
    },
    asset,
    reverse_query: null,
    verification: { status: "unverified" as const, score: null },
    user_verdict: null,
  };
  const id = sha256(canonical(content));
  const recordPath = path.join(root, "records", `${id}.json`);
  const existing = await getJournalRecord(id, root);
  if (existing)
    return { record: existing, existed: true, ...(await rebuildIndex(root)) };
  const record: JournalRecord = {
    ...content,
    id,
    content_sha256: id,
    created_at: new Date().toISOString(),
  };
  await atomicJson(recordPath, record);
  return { record, existed: false, ...(await rebuildIndex(root)) };
}

export async function deleteJournalRecord(id: string, root = JOURNAL_ROOT) {
  const record = await getJournalRecord(safeId(id), root);
  if (!record)
    return {
      deleted: false,
      asset_deleted: false,
      ...(await rebuildIndex(root)),
    };
  await fs.unlink(path.join(root, "records", `${id}.json`));
  let assetDeleted = false;
  await fs.rm(path.join(root, "verifications", id), {
    recursive: true,
    force: true,
  });
  await fs.rm(path.join(root, "verdicts", id), {
    recursive: true,
    force: true,
  });
  if (record.asset) {
    const remaining = await readRecords(root);
    const referenced = remaining.some(
      (item) => item.asset?.sha256 === record.asset?.sha256,
    );
    if (!referenced) {
      await fs
        .unlink(path.join(root, ...record.asset.relative_path.split("/")))
        .catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
      assetDeleted = true;
    }
  }
  return {
    deleted: true,
    asset_deleted: assetDeleted,
    ...(await rebuildIndex(root)),
  };
}

export async function readJournalAsset(id: string, root = JOURNAL_ROOT) {
  const record = await getJournalRecord(id, root);
  if (!record?.asset) return null;
  return {
    record,
    bytes: await fs.readFile(
      path.join(root, ...record.asset.relative_path.split("/")),
    ),
  };
}
