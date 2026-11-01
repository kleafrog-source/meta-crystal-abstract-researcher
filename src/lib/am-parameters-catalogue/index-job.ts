import { getManagedJob, startManagedRebuild } from "@/lib/rag-v3/managed-rebuild";
import { getPipelineJob } from "@/lib/combinatorial-genesis/pipeline-job";
import { readCatalogueState, readQueue, writeCatalogueState, writeQueue } from "./catalogue";

export async function startCatalogueIndexJob(queueIds: string[] = []) {
  const state = await readCatalogueState();
  if (state.job.running) return { started: false, reason: "already_running" };
  if (getPipelineJob().running) throw new Error("Дождитесь завершения inbox pipeline Combinatorial Genesis перед пересборкой каталога.");
  state.job = { running: true, started_at: new Date().toISOString(), finished_at: null, step: "Подготовка пересборки", current: 0, total: 3, error: null, logs: [] };
  await writeCatalogueState(state);
  const started = await startManagedRebuild("catalogue");
  if (!started.started) {
    const failed = await readCatalogueState(); failed.job.running = false; failed.job.finished_at = new Date().toISOString(); failed.job.step = "Не запущено"; failed.job.error = started.reason ?? "Другой rebuild уже запущен."; await writeCatalogueState(failed);
    const queue = await readQueue(); queue.items = queue.items.map((item) => queueIds.includes(item.id) && item.status === "applying" ? { ...item, status: "failed", error: failed.job.error ?? "Пересборка не запустилась." } : item); await writeQueue(queue);
    throw new Error(failed.job.error);
  }
  void (async () => {
    let previousLogs = 0;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const processState = getManagedJob(); const current = await readCatalogueState();
      current.job.running = processState.running; current.job.step = processState.stage ?? (processState.running ? "Пересборка" : "Готово");
      const lines = processState.log_tail.slice(previousLogs); previousLogs = processState.log_tail.length;
      current.job.logs = [...current.job.logs, ...lines].slice(-50);
      if (!processState.running) {
        current.job.finished_at = new Date(processState.finished_at || Date.now()).toISOString();
        current.job.current = processState.exit_code === 0 ? current.job.total : current.job.current;
        current.job.error = processState.exit_code === 0 ? null : processState.last_error ?? `rebuild завершился с кодом ${processState.exit_code}`;
        current.job.step = processState.exit_code === 0 ? "Готово" : "Ошибка";
        if (processState.exit_code === 0) { const now = current.job.finished_at; current.indexes_dirty = false; current.last_composite_at = now; current.last_anchors_at = now; }
        else current.indexes_dirty = true;
        await writeCatalogueState(current);
        const queue = await readQueue(); queue.items = queue.items.map((item) => queueIds.includes(item.id) && item.status === "applying" ? processState.exit_code === 0 ? { ...item, status: "done", error: undefined } : { ...item, status: "failed", error: current.job.error ?? "Пересборка завершилась ошибкой." } : item); await writeQueue(queue);
        break;
      }
      await writeCatalogueState(current);
    }
  })();
  return { started: true };
}
