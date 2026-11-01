import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { GENESIS_LIBRARY_MANIFEST_PATH, GENESIS_LIBRARY_PATH, readGenesisLibrary, readGenesisLibraryManifest } from "@/lib/combinatorial-genesis/library";
import { cleanPublishedParameter } from "@/lib/combinatorial-genesis/parameter-schema";
import { HISTORY_DIR, TOMBSTONES_PATH, readCatalogueRevision, readCatalogueState, readQueue, withCatalogueLock, writeCatalogueState, writeQueue } from "./catalogue";

export async function commitCatalogueQueue(ids: string[]) {
  return withCatalogueLock(async () => {
    const queue = await readQueue(); const selectedIds = new Set(ids);
    const selected = queue.items.filter((item) => selectedIds.has(item.id) && (item.status === "pending" || item.status === "applying" || item.status === "failed"));
    if (!selected.length) throw new Error("Нет выбранных изменений для commit.");
    const state = await readCatalogueState(); if (state.job.running) throw new Error("Пересборка каталога уже выполняется.");
    for (const item of selected) item.status = "applying";
    await writeQueue(queue);
    const library = await readGenesisLibrary(); const byName = new Map(library.map((row) => [row.technical_name, row]));
    for (const item of selected) { if (item.operation === "delete") byName.delete(item.technical_name); else if (item.payload) byName.set(item.technical_name, cleanPublishedParameter(item.payload as unknown as Record<string, unknown>) as typeof item.payload); }
    const nextLibrary = [...byName.values()]; const serialized = `${JSON.stringify(nextLibrary, null, 2)}\n`;
    let tombstoneNames = new Set<string>();
    try {
      const stored = JSON.parse(await fs.readFile(TOMBSTONES_PATH, "utf8")) as unknown;
      if (Array.isArray(stored)) tombstoneNames = new Set(stored.filter((name): name is string => typeof name === "string"));
      else if (stored && typeof stored === "object" && Array.isArray((stored as { technical_names?: unknown }).technical_names)) tombstoneNames = new Set((stored as { technical_names: unknown[] }).technical_names.filter((name): name is string => typeof name === "string"));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const item of selected) { if (item.operation === "delete") tombstoneNames.add(item.technical_name); else tombstoneNames.delete(item.technical_name); }
    const manifest = await readGenesisLibraryManifest(); const now = new Date().toISOString();
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    const backupName = `parameters-${now.replace(/[:.]/g, "-")}.json`;
    await fs.copyFile(GENESIS_LIBRARY_PATH, `${HISTORY_DIR}/${backupName}`);
    const tempLibrary = `${GENESIS_LIBRARY_PATH}.${randomUUID()}.tmp`; const tempManifest = `${GENESIS_LIBRARY_MANIFEST_PATH}.${randomUUID()}.tmp`;
    await fs.writeFile(tempLibrary, serialized, "utf8");
    await fs.writeFile(tempManifest, `${JSON.stringify({ ...manifest, updated_at: now, parameter_count: nextLibrary.length }, null, 2)}\n`, "utf8");
    const tempTombstones = `${TOMBSTONES_PATH}.${randomUUID()}.tmp`;
    await fs.writeFile(tempTombstones, `${JSON.stringify([...tombstoneNames].sort(), null, 2)}\n`, "utf8");
    await fs.rename(tempLibrary, GENESIS_LIBRARY_PATH); await fs.rename(tempManifest, GENESIS_LIBRARY_MANIFEST_PATH); await fs.rename(tempTombstones, TOMBSTONES_PATH);
    const revision = await readCatalogueRevision();
    const fresh = await readCatalogueState(); fresh.revision = revision; fresh.indexes_dirty = true; fresh.last_commit_at = now;
    fresh.last_commit_counts = { added: selected.filter((item) => item.operation === "add").length, updated: selected.filter((item) => item.operation === "update").length, deleted: selected.filter((item) => item.operation === "delete").length };
    await writeCatalogueState(fresh);
    return { changed: selected.length, count: nextLibrary.length, queue_ids: selected.map((item) => item.id), backup: backupName };
  });
}

export async function finishCatalogueQueue(ids: string[], error?: string): Promise<void> {
  const selected = new Set(ids); const queue = await readQueue();
  queue.items = queue.items.map((item) => selected.has(item.id) && item.status === "applying" ? error ? { ...item, status: "failed", error } : { ...item, status: "done", error: undefined } : item);
  await writeQueue(queue);
}
