import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AmStageSessionSnapshot } from "@/lib/am-stage-session";

const ROOT = path.join(process.cwd(), "data", "am-stage-snapshots");
const safeId = (id: string) => { if (!/^[a-zA-Z0-9-]{1,80}$/u.test(id)) throw new Error("Invalid session id."); return id; };
export function sessionFile(id: string) { return path.join(ROOT, safeId(id), "snapshot.json"); }
export async function readStageSnapshot(id: string): Promise<AmStageSessionSnapshot | null> {
  try { return JSON.parse(await fs.readFile(sessionFile(id), "utf8")) as AmStageSessionSnapshot; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function writeStageSnapshot(snapshot: AmStageSessionSnapshot) {
  const target = sessionFile(snapshot.meta.id); await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); await fs.rename(temp, target); }
  catch (error) { await fs.rm(temp, { force: true }).catch(() => undefined); throw error; }
}

export async function withStageSessionLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const lock = path.join(ROOT, ".locks", `${safeId(id)}.lock`); await fs.mkdir(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + 15_000;
  while (true) {
    try {
      const handle = await fs.open(lock, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      try { return await action(); }
      finally { await handle.close(); await fs.rm(lock, { force: true }); }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const record = JSON.parse(await fs.readFile(lock, "utf8")) as { pid?: number; createdAt?: number };
        if (Date.now() - Number(record.createdAt ?? Date.now()) > 60_000) {
          let alive = true; try { process.kill(Number(record.pid), 0); } catch { alive = false; }
          if (!alive) { await fs.rm(lock, { force: true }); continue; }
        }
      } catch (readError) { if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue; }
      if (Date.now() >= deadline) throw new Error("SESSION_LOCK_TIMEOUT");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

export function nextSessionRevision(previous?: string) {
  const prior = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), Number.isFinite(prior) ? prior + 1 : 0)).toISOString();
}
