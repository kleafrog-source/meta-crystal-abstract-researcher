import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { GENESIS_DATA_ROOT } from "@/lib/combinatorial-genesis/library";
import { cleanPublishedParameter, parameterOutOfBandFields } from "@/lib/combinatorial-genesis/parameter-schema";
import { commitCatalogueQueue } from "@/lib/am-parameters-catalogue/commit";
import { readQueue, readRawCatalogueParameters, writeQueue } from "@/lib/am-parameters-catalogue/catalogue";

export async function POST() {
  try {
    const [raw, queue] = await Promise.all([readRawCatalogueParameters(), readQueue()]);
    const pendingNames = new Set(queue.items.filter((item) => item.status === "pending" || item.status === "applying" || item.status === "failed").map((item) => item.technical_name));
    const sidecar: Record<string, unknown> = {};
    let changed = 0;
    const queueIds: string[] = [];
    for (const row of raw) {
      const source = row as unknown as Record<string, unknown>;
      const extra = parameterOutOfBandFields(source);
      if (Object.keys(extra).length) sidecar[row.technical_name] = extra;
      const cleaned = cleanPublishedParameter(source) as typeof row;
      if (!Object.keys(extra).length && Object.keys(source).every((key) => key in cleaned)) continue;
      if (pendingNames.has(row.technical_name)) throw new Error(`Strip остановлен: ${row.technical_name} уже находится в очереди.`);
      const item = { id: randomUUID(), operation: "update" as const, technical_name: row.technical_name, payload: cleaned, previous: row, reason: "strip-provenance", source: "schema-strip", created_at: new Date().toISOString(), status: "pending" as const };
      queue.items.push(item);
      queueIds.push(item.id);
      changed += 1;
    }
    const sidecarPath = path.join(GENESIS_DATA_ROOT, "library", "provenance", "provenance-index.json");
    await writeQueue(queue);
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
    if (queueIds.length) {
      const committed = await commitCatalogueQueue(queueIds);
      const latest = await readQueue();
      latest.items = latest.items.map((item) => queueIds.includes(item.id) && item.status === "applying" ? { ...item, status: "done", error: undefined } : item);
      await writeQueue(latest);
      return NextResponse.json({ ok: true, scanned: raw.length, changed, sidecar: sidecarPath, backup: committed.backup, rebuild: false, indexes_dirty: true });
    }
    return NextResponse.json({ ok: true, scanned: raw.length, changed: 0, sidecar: sidecarPath, rebuild: false });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}
