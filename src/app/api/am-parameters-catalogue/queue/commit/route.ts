import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { commitCatalogueQueue } from "@/lib/am-parameters-catalogue/commit";
import { getManagedJob } from "@/lib/rag-v3/managed-rebuild";
import { getPipelineJob } from "@/lib/combinatorial-genesis/pipeline-job";
import { HISTORY_DIR, QUEUE_PATH, readQueue, writeQueue } from "@/lib/am-parameters-catalogue/catalogue";
import { finishCatalogueQueue } from "@/lib/am-parameters-catalogue/commit";

export async function POST(request: NextRequest) {
  let ids: string[] = [];
  try {
    const body = await request.json() as { ids?: string[]; confirmed?: boolean; rebuild?: boolean };
    if (!body.confirmed) return NextResponse.json({ error: "Требуется подтверждение commit." }, { status: 400 });
    if (getManagedJob().running) return NextResponse.json({ error: "Дождитесь завершения текущей пересборки индексов." }, { status: 409 });
    if (getPipelineJob().running) return NextResponse.json({ error: "Дождитесь завершения inbox pipeline Combinatorial Genesis." }, { status: 409 });
    ids = body.ids ?? (await readQueue()).items.filter((item) => item.status === "pending" || item.status === "applying" || item.status === "failed").map((item) => item.id);
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    const queueBackup = `catalogue-queue-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await fs.copyFile(QUEUE_PATH, path.join(HISTORY_DIR, queueBackup));
    const result = await commitCatalogueQueue(ids);
    await finishCatalogueQueue(result.queue_ids);
    const queue = await readQueue();
    const failed_count = queue.items.filter((item) => item.status === "failed").length;
    queue.items = queue.items.filter((item) => item.status !== "done");
    await writeQueue(queue);
    return NextResponse.json({ ok: true, ...result, backup_path: `data/combinatorial-genesis/library/history/${result.backup}`, queue_backup_path: `data/combinatorial-genesis/library/history/${queueBackup}`, failed_count, skipped_count: Math.max(0, ids.length - result.queue_ids.length), rebuild: false, indexes_dirty: true });
  } catch (error) { const message = error instanceof Error ? error.message : String(error); if (ids.length) await finishCatalogueQueue(ids, message).catch(() => undefined); return NextResponse.json({ error: message }, { status: 400 }); }
}
