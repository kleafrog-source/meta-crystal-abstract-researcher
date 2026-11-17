import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";

export type CatalogueReader = (relativePath: string) => Promise<string>;
export interface CatalogueUpdate<T> { writes: Record<string, string>; result: T }
interface JournalEntry {
  target: string;
  temporary: string;
  backup: string;
  had_original: boolean;
  previous_sha256: string | null;
  next_sha256: string;
}
interface WriteJournal { schema_version: 1; id: string; state: "prepared" | "committed"; entries: JournalEntry[] }

const context = new AsyncLocalStorage<boolean>();
let localQueue: Promise<void> = Promise.resolve();
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const defaultRoot = () => path.join(process.cwd(), "data", "combinatorial-genesis");

function inside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Catalogue path escapes data root: ${relativePath}`);
  }
  return resolvedPath;
}

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

async function writeSynced(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "wx");
  try { await handle.writeFile(value, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

async function removeEntryFiles(root: string, entry: JournalEntry): Promise<void> {
  await Promise.all([
    fs.rm(inside(root, entry.temporary), { force: true }),
    fs.rm(inside(root, entry.backup), { force: true }),
  ]);
}

async function recoverJournal(root: string): Promise<void> {
  const journalPath = inside(root, "library/.catalogue-write-journal.json");
  if (!(await exists(journalPath))) return;
  const journal = JSON.parse(await fs.readFile(journalPath, "utf8")) as WriteJournal;
  if (journal.schema_version !== 1 || !Array.isArray(journal.entries)) throw new Error("Catalogue write journal is malformed; writes are blocked for recovery.");
  let allNextFilesMatch = true;
  for (const entry of journal.entries) {
    try { if (hash(await fs.readFile(inside(root, entry.target))) !== entry.next_sha256) allNextFilesMatch = false; }
    catch { allNextFilesMatch = false; }
  }
  if (journal.state === "committed" && allNextFilesMatch) {
    for (const entry of journal.entries) await removeEntryFiles(root, entry);
    await fs.rm(journalPath, { force: true });
    return;
  }
  for (const entry of journal.entries) {
    const target = inside(root, entry.target);
    if (!entry.had_original) {
      await fs.rm(target, { force: true, recursive: true });
    } else {
      const backup = inside(root, entry.backup);
      if (!(await exists(backup))) throw new Error(`Catalogue recovery backup is missing: ${entry.backup}`);
      const restorePath = `${target}.${journal.id}.restore`;
      await fs.copyFile(backup, restorePath);
      await fs.rename(restorePath, target);
      const restored = await fs.readFile(target);
      if (hash(restored) !== entry.previous_sha256) throw new Error(`Catalogue recovery hash mismatch: ${entry.target}`);
    }
    await removeEntryFiles(root, entry);
  }
  await fs.rm(journalPath, { force: true });
}

async function acquireFileLock(root: string): Promise<() => Promise<void>> {
  const lockPath = inside(root, "library/.catalogue-write.lock");
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), started_at: new Date().toISOString() }), "utf8");
      await handle.sync();
      return async () => { await handle.close(); await fs.rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let stale = false;
      try {
        const owner = JSON.parse(await fs.readFile(lockPath, "utf8")) as { pid?: number; host?: string };
        if (owner.host && owner.host !== hostname()) stale = false;
        else if (Number.isInteger(owner.pid) && (owner.pid ?? 0) > 0) {
          try { process.kill(owner.pid!, 0); }
          catch (processError) { stale = (processError as NodeJS.ErrnoException).code !== "EPERM"; }
        } else {
          const stat = await fs.stat(lockPath);
          stale = Date.now() - stat.mtimeMs > 30_000;
        }
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue;
        const stat = await fs.stat(lockPath).catch(() => null);
        stale = Boolean(stat && Date.now() - stat.mtimeMs > 30_000);
      }
      if (stale) { await fs.rm(lockPath, { force: true }); continue; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Catalogue is busy in another process; retry after the active write completes.");
}

async function writeFileSet(root: string, writes: Record<string, string>): Promise<void> {
  const id = randomUUID();
  const entries: JournalEntry[] = [];
  for (const [relativePath, content] of Object.entries(writes)) {
    const target = inside(root, relativePath);
    const temporary = `${relativePath}.${id}.tmp`;
    const backup = `${relativePath}.${id}.bak`;
    const hadOriginal = await exists(target);
    const previous = hadOriginal ? await fs.readFile(target) : null;
    if (previous) await fs.copyFile(target, inside(root, backup));
    await writeSynced(inside(root, temporary), content);
    entries.push({
      target: relativePath,
      temporary,
      backup,
      had_original: hadOriginal,
      previous_sha256: previous ? hash(previous) : null,
      next_sha256: hash(content),
    });
  }
  const journalPath = inside(root, "library/.catalogue-write-journal.json");
  const journal: WriteJournal = { schema_version: 1, id, state: "prepared", entries };
  const journalTemporary = `${journalPath}.${id}.tmp`;
  await writeSynced(journalTemporary, `${JSON.stringify(journal, null, 2)}\n`);
  await fs.rename(journalTemporary, journalPath);
  try {
    for (const entry of entries) await fs.rename(inside(root, entry.temporary), inside(root, entry.target));
    journal.state = "committed";
    const committedTemp = `${journalPath}.${id}.committed`;
    await writeSynced(committedTemp, `${JSON.stringify(journal, null, 2)}\n`);
    await fs.rename(committedTemp, journalPath);
    for (const entry of entries) await removeEntryFiles(root, entry);
    await fs.rm(journalPath, { force: true });
  } catch (error) {
    // Leave the prepared journal and backups in place; the next locked read/write recovers it.
    throw error;
  }
}

export async function withCatalogueFileLock<T>(task: () => Promise<T>, root = defaultRoot()): Promise<T> {
  if (context.getStore()) return task();
  let releaseQueue!: () => void;
  const previous = localQueue;
  localQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previous;
  let releaseFile: (() => Promise<void>) | null = null;
  try {
    releaseFile = await acquireFileLock(root);
    await recoverJournal(root);
    return await context.run(true, task);
  } finally {
    if (releaseFile) await releaseFile();
    releaseQueue();
  }
}

export async function updateCatalogueFiles<T>(
  updater: (read: CatalogueReader) => Promise<{ writes: Record<string, string>; result: T }>,
  root = defaultRoot(),
): Promise<T> {
  return withCatalogueFileLock(async () => {
    const read: CatalogueReader = async (relativePath) => fs.readFile(inside(root, relativePath), "utf8");
    const update = await updater(read);
    if (Object.keys(update.writes).length) await writeFileSet(root, update.writes);
    return update.result;
  }, root);
}

export async function replaceCatalogueFiles(writes: Record<string, string>, root = defaultRoot()): Promise<void> {
  await updateCatalogueFiles(async () => ({ writes, result: undefined }), root);
}
