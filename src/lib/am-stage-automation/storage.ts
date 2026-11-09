import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

const ROOT = path.join(process.cwd(), "data", "am-stage-automation");
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/u;

export function automationRoot() { return ROOT; }
export async function ensureAutomationDirectories() {
  await Promise.all(["assets", "runs", "trash", "scenarios"].map((dir) => fs.mkdir(path.join(ROOT, dir), { recursive: true })));
}

function storedPath(storageRef: string) {
  if (!storageRef || storageRef.includes("..") || path.isAbsolute(storageRef)) throw new Error("Invalid server storage reference.");
  const full = path.resolve(ROOT, storageRef);
  if (!full.startsWith(`${path.resolve(ROOT)}${path.sep}`)) throw new Error("Storage reference escapes the automation root.");
  return full;
}

async function writeAtomic(target: string, data: Uint8Array | string) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, data);
  await fs.rename(temporary, target);
}

export async function saveAudioAsset(input: { bytes: Uint8Array; filename: string; mimeType: string; durationSeconds?: number | null; ownerType?: string; ownerId?: string }) {
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length || bytes.length > 150 * 1024 * 1024) throw new Error("Audio must be between 1 byte and 150 MiB.");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const previous = await db.automationAsset.findUnique({ where: { contentHash } });
  let asset = previous;
  if (!asset) {
    const id = randomUUID();
    const storageRef = `assets/${id}/audio.bin`;
    await writeAtomic(storedPath(storageRef), bytes);
    try {
      asset = await db.automationAsset.create({ data: {
        id, kind: "audio", contentHash, storageRef,
        originalFilename: path.basename(input.filename).replace(/[\u0000-\u001f]/gu, "").slice(0, 240) || null,
        mimeType: input.mimeType.slice(0, 120) || null, sizeBytes: bytes.length,
        durationSeconds: Number.isFinite(input.durationSeconds) && input.durationSeconds! > 0 ? input.durationSeconds : null,
      } });
    } catch (error) {
      await fs.rm(path.dirname(storedPath(storageRef)), { recursive: true, force: true }).catch(() => undefined);
      const raced = await db.automationAsset.findUnique({ where: { contentHash } });
      if (!raced) throw error;
      asset = raced;
    }
  } else if (input.durationSeconds && !asset.durationSeconds) {
    asset = await db.automationAsset.update({ where: { id: asset.id }, data: { durationSeconds: input.durationSeconds } });
  }
  if (input.ownerType && input.ownerId) await addAssetReference(asset.id, input.ownerType, input.ownerId);
  return { id: asset.id, filename: asset.originalFilename, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, durationSeconds: asset.durationSeconds, contentHash: asset.contentHash, availability: asset.availabilityStatus };
}

export async function addAssetReference(assetId: string, ownerType: string, ownerId: string) {
  if (!SAFE_ID.test(assetId) || !ownerType || !ownerId) throw new Error("Invalid audio asset reference.");
  await db.automationAssetReference.upsert({ where: { assetId_ownerType_ownerId: { assetId, ownerType, ownerId } }, create: { id: randomUUID(), assetId, ownerType, ownerId }, update: {} });
}

export async function removeAssetReference(ownerType: string, ownerId: string, assetId?: string) {
  await db.automationAssetReference.deleteMany({ where: { ownerType, ownerId, ...(assetId ? { assetId } : {}) } });
}

export async function getAudioAsset(assetId: string) {
  if (!SAFE_ID.test(assetId)) throw new Error("Invalid audio asset id.");
  const asset = await db.automationAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.kind !== "audio") return null;
  const filePath = storedPath(asset.storageRef);
  try { await fs.access(filePath); } catch { await db.automationAsset.update({ where: { id: assetId }, data: { availabilityStatus: "missing" } }); return null; }
  return { asset, filePath };
}

export async function listAudioAssets() {
  const assets = await db.automationAsset.findMany({
    where: { kind: "audio" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, originalFilename: true, mimeType: true, sizeBytes: true,
      durationSeconds: true, contentHash: true, availabilityStatus: true,
      createdAt: true, storageRef: true, _count: { select: { references: true } },
    },
  });
  return Promise.all(assets.map(async (asset) => {
    if (asset.availabilityStatus === "missing") return asset;
    try { await fs.access(storedPath(asset.storageRef)); return asset; }
    catch { await db.automationAsset.update({ where: { id: asset.id }, data: { availabilityStatus: "missing" } }); return { ...asset, availabilityStatus: "missing" }; }
  }));
}

export async function readAudioAsset(assetId: string) {
  const resolved = await getAudioAsset(assetId);
  if (!resolved) throw new Error("The saved audio asset is unavailable.");
  return { ...resolved, bytes: await fs.readFile(resolved.filePath) };
}

export async function writeRunArtifact(runId: string, artifactId: string, payload: unknown) {
  if (!SAFE_ID.test(runId) || !SAFE_ID.test(artifactId)) throw new Error("Invalid run or artifact id.");
  const storageRef = `runs/${runId}/artifacts/${artifactId}.json`;
  const serialized = `${JSON.stringify(payload)}\n`;
  await writeAtomic(storedPath(storageRef), serialized);
  const checksum = createHash("sha256").update(serialized).digest("hex");
  return { storageRef, checksum };
}

export async function readRunArtifact(storageRef: string): Promise<unknown> {
  const content = await fs.readFile(storedPath(storageRef), "utf8");
  return JSON.parse(content) as unknown;
}

export async function moveRunToTrash(runId: string) {
  if (!SAFE_ID.test(runId)) throw new Error("Invalid run id.");
  const source = path.join(ROOT, "runs", runId);
  const target = path.join(ROOT, "trash", `${runId}-${Date.now()}-${randomUUID().slice(0, 8)}`);
  const retryable = new Set(["EPERM", "EBUSY", "EACCES"]);
  let lastRetryableError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { await fs.rename(source, target); return target; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      if (!retryable.has(code ?? "")) throw error;
      lastRetryableError = error;
      if (attempt === 7) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(100 * 2 ** attempt, 1_200)));
    }
  }

  // Windows may keep the run directory busy long enough that even bounded
  // rename retries cannot acquire it. Copy first so deletion is recoverable,
  // then remove the original with Node's bounded Windows retry support.
  try {
    await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(source, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    return target;
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Could not move run files after rename retries. ${error instanceof Error ? error.message : String(error)}`, { cause: lastRetryableError });
  }
}

export async function restoreRunDirectory(runId: string, trashPath: string) {
  if (!SAFE_ID.test(runId) || !path.resolve(trashPath).startsWith(`${path.resolve(ROOT, "trash")}${path.sep}`)) throw new Error("Invalid restore reference.");
  const target = path.join(ROOT, "runs", runId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(trashPath, target);
}

export async function purgeTrashedRun(trashPath: string) {
  const root = path.resolve(ROOT, "trash");
  const target = path.resolve(trashPath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid trash path.");
  await fs.rm(target, { recursive: true, force: true });
}
