import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getActiveProvider } from "@/lib/llm/factory";
import type { SidecarEvent } from "@/lib/engine/runner";

export interface CrystalIndexTaskHandle {
  taskId: string;
  taskType?: string;
  title?: string;
  startedAt?: string;
  events: SidecarEvent[];
  status: "running" | "done" | "failed" | "cancelled";
  result?: unknown;
  cancel: () => void;
  subscribe: (cb: (e: SidecarEvent) => void) => () => void;
  done: Promise<unknown>;
}

interface CrystalIndexTaskOptions {
  force?: boolean;
}

const globalForCrystalIndex = globalThis as unknown as {
  __crystalIndexTasks?: Map<string, CrystalIndexTaskHandle>;
};

const TASKS = globalForCrystalIndex.__crystalIndexTasks ?? new Map<string, CrystalIndexTaskHandle>();
if (!globalForCrystalIndex.__crystalIndexTasks) {
  globalForCrystalIndex.__crystalIndexTasks = TASKS;
}

export function runningCrystalIndexTaskCount() {
  let total = 0;
  for (const task of TASKS.values()) {
    if (task.status === "running") total++;
  }
  return total;
}

export function getCrystalIndexTask(taskId: string) {
  return TASKS.get(taskId);
}

export function listCrystalIndexTasks() {
  return Array.from(TASKS.values());
}

export function startCrystalIndexingTask(opts: CrystalIndexTaskOptions = {}): CrystalIndexTaskHandle {
  const taskId = randomUUID();
  const events: SidecarEvent[] = [];
  const subscribers = new Set<(e: SidecarEvent) => void>();
  let cancelRequested = false;

  const emit = (event: SidecarEvent) => {
    events.push(event);
    if (events.length > 5000) events.splice(0, 1000);
    for (const subscriber of subscribers) subscriber(event);
  };

  const handle: CrystalIndexTaskHandle = {
    taskId,
    taskType: "crystal_index",
    title: opts.force ? "Индексация кристаллов (полная)" : "Индексация кристаллов",
    startedAt: new Date().toISOString(),
    events,
    status: "running",
    result: undefined,
    cancel: () => {
      cancelRequested = true;
    },
    subscribe: (cb) => {
      subscribers.add(cb);
      for (const event of events) cb(event);
      return () => subscribers.delete(cb);
    },
    done: Promise.resolve(null),
  };

  TASKS.set(taskId, handle);

  handle.done = (async () => {
    const startedAt = Date.now();
    try {
      emitLog(emit, "info", `Индексация кристаллов запущена${opts.force ? " (полная)" : " (только отсутствующие embedding)"}.`);

      const { provider, settings } = await getActiveProvider();
      const where = opts.force ? {} : { embedding: null };
      const crystals = await db.crystal.findMany({
        where,
        orderBy: { counter: "asc" },
        select: {
          id: true,
          code: true,
          searchText: true,
          combination: true,
          embedding: true,
        },
      });

      emitLog(emit, "info", `К обработке подготовлено ${crystals.length} кристаллов.`);

      let processed = 0;
      let embedded = 0;
      let skipped = 0;
      let failed = 0;

      for (const crystal of crystals) {
        if (cancelRequested) {
          handle.status = "cancelled";
          const result = {
            total: crystals.length,
            processed,
            embedded,
            skipped,
            failed,
            cancelled: true,
            elapsedMs: Date.now() - startedAt,
          };
          handle.result = result;
          emitLog(emit, "warn", "Индексация остановлена пользователем.");
          emitDone(emit, result);
          return result;
        }

        processed += 1;
        const sourceText = (crystal.searchText || crystal.combination || "").slice(0, 500);
        if (!sourceText) {
          skipped += 1;
          emitProgress(emit, processed, crystals.length, `Пропуск ${crystal.code}: пустой текст`);
          continue;
        }

        try {
          const vec = await provider.embed(sourceText, settings.embedModel);
          await db.crystal.update({
            where: { id: crystal.id },
            data: { embedding: JSON.stringify(vec) },
          });
          embedded += 1;
        } catch (error) {
          failed += 1;
          emitLog(emit, "warn", `${crystal.code}: ${(error as Error).message}`);
        }

        if (processed === 1 || processed % 10 === 0 || processed === crystals.length) {
          emitProgress(emit, processed, crystals.length, `Обработано ${processed}/${crystals.length}`);
        }
      }

      handle.status = "done";
      const result = {
        total: crystals.length,
        processed,
        embedded,
        skipped,
        failed,
        cancelled: false,
        elapsedMs: Date.now() - startedAt,
      };
      handle.result = result;
      emitLog(emit, "success", `Индексация завершена: ${embedded} обновлено, ${failed} ошибок.`);
      emitDone(emit, result);
      return result;
    } catch (error) {
      handle.status = "failed";
      emit({
        event: "error",
        msg: (error as Error).message,
        ts: new Date().toISOString(),
      });
      throw error;
    }
  })();

  return handle;
}

function emitLog(
  emit: (event: SidecarEvent) => void,
  level: NonNullable<SidecarEvent["level"]>,
  msg: string,
) {
  emit({ event: "log", level, msg, ts: new Date().toISOString() });
}

function emitProgress(
  emit: (event: SidecarEvent) => void,
  processed: number,
  total: number,
  step: string,
) {
  emit({
    event: "progress",
    value: total > 0 ? Math.round((processed / total) * 100) : 100,
    step,
    payload: { processed, total },
    ts: new Date().toISOString(),
  });
}

function emitDone(emit: (event: SidecarEvent) => void, result: unknown) {
  emit({ event: "done", result, ts: new Date().toISOString() });
}
