import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { loadProviderForModelListing } from "@/lib/llm/factory";
import { cleanPublishedParameter, isPublishedField } from "@/lib/combinatorial-genesis/parameter-schema";
import { readCatalogueParameters, readQueue, stage, withCatalogueLock } from "@/lib/am-parameters-catalogue/catalogue";
import { commitCatalogueQueue, finishCatalogueQueue } from "@/lib/am-parameters-catalogue/commit";
import { assessCompleteness, patchImprovesCompleteness } from "@/lib/am-parameters-catalogue/completeness";
import { COMPLETENESS_TASK_VERSION, completenessFieldSignature, inspectRetryEntry, MAX_COMPLETENESS_ATTEMPTS, retryItemFieldSignature, type RetryHistoryEntry } from "@/lib/am-parameters-catalogue/retry-queue";
import { loadTaxonomyMap, canonicalCategoryValues } from "@/lib/am-parameters-catalogue/taxonomy";
import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { GENESIS_DATA_ROOT } from "@/lib/combinatorial-genesis/library";

export const runtime = "nodejs";
const RETRY_PATH = path.join(GENESIS_DATA_ROOT, "library", "completeness", "retry-queue.json");
type RetryItem = RetryHistoryEntry;
type RunningTask = { task_id: string; technical_name: string; field_signature: string; attempts: number; row: GenesisLibraryParameter };
type RetryFileItem = RetryItem & { task_id: string; task_version?: string; field_signature: string; attempt_history?: Array<{ attempt: number; status: string; error: string; at: string }> };

async function readRetry(): Promise<RetryFileItem[]> {
  try { return JSON.parse(await fs.readFile(RETRY_PATH, "utf8")) as RetryFileItem[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function writeRetry(items: RetryFileItem[]): Promise<void> {
  await fs.mkdir(path.dirname(RETRY_PATH), { recursive: true });
  const temp = `${RETRY_PATH}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await fs.rename(temp, RETRY_PATH);
}
function validPatchValue(field: string, value: unknown, row: Record<string, unknown>): boolean {
  if (!isPublishedField(field) || ["technical_name", "ui_element"].includes(field)) return false;
  if (["min_value", "max_value", "step"].includes(field)) return typeof value === "number" && Number.isFinite(value) && (field !== "step" || value > 0);
  if (field === "options") return Array.isArray(value) && value.length >= 2 && value.every((item) => typeof item === "string" && item.trim()) && new Set(value).size === value.length;
  if (field === "default") {
    if (row.ui_element === "Range") return typeof value === "number" && Number.isFinite(value);
    if (row.ui_element === "Toggle") return value === 0 || value === 1;
    if (row.ui_element === "Select") return typeof value === "string" && Array.isArray(row.options) && row.options.includes(value);
    if (row.ui_element === "Array") return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
    return typeof value === "string" && value.trim().length > 0;
  }
  if (field === "description_en") return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 360;
  if (field === "description_ru") return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 420;
  if (["name_ru", "category", "sub_category", "unit", "quantity_kind", "domain"].includes(field)) return typeof value === "string" && value.trim().length > 0;
  if (field === "lyria_prompt_tags") return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "string" && /[A-Za-z]/.test(item) && !/[А-Яа-яЁё]/.test(item));
  if (field === "semantic_keywords") return Array.isArray(value) && value.length === 7 && value.slice(0, 3).every((item) => typeof item === "string" && /[А-Яа-яЁё]/.test(item)) && value.slice(3).every((item) => typeof item === "string" && /[A-Za-z]/.test(item) && !/[А-Яа-яЁё]/.test(item));
  return true;
}

export async function GET() { return NextResponse.json({ status: "ready", maximum_attempts: MAX_COMPLETENESS_ATTEMPTS, attempt_scope: "one parameter completion task; retries persist across refreshes" }); }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { provider?: string; technical_names?: string[]; batch_size?: number; confidence_threshold?: number; retry?: boolean };
    const providerId = body.provider === "ollama" ? "ollama" : "freellmapi";
    const { provider, settings } = await loadProviderForModelListing(providerId);
    const map = await loadTaxonomyMap();
    const selected = Array.isArray(body.technical_names) ? new Set(body.technical_names) : null;
    const limit = Math.min(50, Math.max(1, Math.floor(body.batch_size ?? 10)));
    const confidenceThreshold = Math.max(0, Math.min(1, Number(body.confidence_threshold ?? 0.6)));

    // Reserve each parameter task under the catalogue file lock. A second click sees running and cannot call the provider twice.
    const reserved = await withCatalogueLock(async () => {
      const [rows, retry] = await Promise.all([readCatalogueParameters(), readRetry()]);
      const next = [...retry];
      const tasks: RunningTask[] = [];
      for (const row of rows) {
        if (selected && !selected.has(row.technical_name)) continue;
        const assessment = assessCompleteness(row, map);
        if (assessment.complete) continue;
        const signature = completenessFieldSignature(assessment.missing_fields);
        const matchingIndex = [...next.keys()].reverse().find((index) => {
          const item = next[index];
          return item.technical_name === row.technical_name && item.task_version === COMPLETENESS_TASK_VERSION && (retryItemFieldSignature(item) === signature || !retryItemFieldSignature(item));
        });
        let item = matchingIndex === undefined ? undefined : next[matchingIndex];
        if (body.retry) {
          if (!item || item.status !== "retry" || !inspectRetryEntry(item, row, map).eligible) continue;
        } else if (item) {
          const view = inspectRetryEntry(item, row, map);
          if (item.status === "running" || item.status === "resolved" || view.effective_status === "failed_permanent" || view.effective_status === "resolved") continue;
          if (view.effective_status === "superseded" && retryItemFieldSignature(item)) {
            next[matchingIndex!] = { ...item, status: "superseded", updated_at: new Date().toISOString() };
            item = undefined;
          }
        }
        if (item && item.attempts >= MAX_COMPLETENESS_ATTEMPTS) continue;
        const now = new Date().toISOString();
        if (!item && !body.retry) {
          for (const previous of next.filter((entry) => entry.technical_name === row.technical_name && entry.task_version !== COMPLETENESS_TASK_VERSION && ["retry", "running", "failed_permanent"].includes(entry.status))) {
            previous.status = "superseded";
            previous.error = `Контракт исправления сменился на ${COMPLETENESS_TASK_VERSION}; история попыток сохранена.`;
          }
        }
        const task: RetryFileItem = item
          ? { ...item, task_id: item.task_id ?? `legacy:${row.technical_name}:${signature}`, task_version: COMPLETENESS_TASK_VERSION, field_signature: signature, attempts: item.attempts + 1, status: "running", updated_at: now }
          : { task_id: randomUUID(), task_version: COMPLETENESS_TASK_VERSION, technical_name: row.technical_name, field_signature: signature, attempts: 1, status: "running", error: "Новое задание по обновлённому контракту. История старого задания сохранена.", updated_at: now };
        task.attempt_history = [...(task.attempt_history ?? []), { attempt: task.attempts, status: "started", error: "", at: now }];
        if (matchingIndex === undefined || item === undefined) next.push(task);
        else next[matchingIndex] = task;
        tasks.push({ task_id: task.task_id, technical_name: row.technical_name, field_signature: signature, attempts: task.attempts, row });
        if (tasks.length >= limit) break;
      }
      if (tasks.length) await writeRetry(next);
      return tasks;
    });

    if (!reserved.length) return NextResponse.json({ ok: true, provider: providerId, attempted: 0, succeeded: 0, skipped: "no_current_eligible_tasks", failed: [], queue_ids: [], remaining_before: 0, remaining_after_estimate: 0, rebuild: false, indexes_dirty: false });

    // Recheck after reservation and immediately before the external provider call.
    const active = await withCatalogueLock(async () => {
      const [rows, retry] = await Promise.all([readCatalogueParameters(), readRetry()]);
      const live = new Map(rows.map((row) => [row.technical_name, row]));
      const current: RunningTask[] = [];
      let changed = false;
      for (const task of reserved) {
        const row = live.get(task.technical_name);
        const item = retry.find((entry) => entry.task_id === task.task_id);
        if (!item) continue;
        if (!row) { item.status = "superseded"; item.error = "Запись удалена или tombstoned до вызова модели."; changed = true; continue; }
        const assessment = assessCompleteness(row, map);
        if (assessment.complete) { item.status = "resolved"; item.error = "Проблемы были устранены до вызова модели."; changed = true; continue; }
        const signature = completenessFieldSignature(assessment.missing_fields);
        if (signature !== task.field_signature) { item.status = "superseded"; item.error = "Набор проблем изменился до вызова модели."; changed = true; continue; }
        current.push({ ...task, row });
      }
      if (changed) await writeRetry(retry);
      return current;
    });
    if (!active.length) return NextResponse.json({ ok: true, provider: providerId, attempted: 0, succeeded: 0, skipped: "tasks_resolved_or_changed_before_provider", failed: [], queue_ids: [], remaining_before: 0, remaining_after_estimate: 0, rebuild: false, indexes_dirty: false });

    const candidates = active.map((task) => {
      const assessment = assessCompleteness(task.row, map);
      return { parameter: cleanPublishedParameter(task.row as unknown as Record<string, unknown>), field_issues: assessment.gaps.map(({ field, kind, reason }) => ({ field, kind, reason })) };
    });
    let modelItems: Array<{ technical_name?: string; confidence?: number; fields?: Record<string, unknown>; needs_review_reason?: string }>;
    try {
      const response = await provider.chat([
        { role: "system", content: `Return JSON only with shape {"items":[{"technical_name":"...","confidence":0.85,"fields":{...},"needs_review_reason":"..."}]}. Each parameter includes field_issues, the complete list of fields that need repair. Each issue has kind=missing (field absent/empty) or kind=invalid (present value violates the named rule). Return only fields listed in field_issues; replace an invalid existing value as well as filling a missing value. Preserve all other current values exactly. Include one item per input parameter, with confidence 0..1. Never emit provenance or identifiers. Never change technical_name or ui_element. quantity_kind must be semantically distinct from unit. Categories must be one of: ${canonicalCategoryValues(map).join(", ")}. Domain must be one of sound, structure, metadata, provenance, administrative. Keep descriptions concise: target at most 300 EN and 360 RU characters (hard limits 360 EN and 420 RU). Count characters before returning; shortening must preserve the existing meaning. Tags exactly 3 English phrases. Keywords exactly 7: 3 Russian then 4 English. If meaning is ambiguous, do not guess: return fields={} and put the specific unresolved question in needs_review_reason.` },
        { role: "user", content: JSON.stringify({ parameters: candidates }) },
      ], { model: settings.chatModel, temperature: 0.1, maxTokens: 12000, format: "json", signal: AbortSignal.timeout(180_000) });
      const json = JSON.parse(response.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { items?: Array<{ technical_name?: string; confidence?: number; fields?: Record<string, unknown>; needs_review_reason?: string }> };
      modelItems = json.items ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withCatalogueLock(async () => {
        const retry = await readRetry();
        for (const task of active) { const item = retry.find((entry) => entry.task_id === task.task_id); if (item) { item.status = item.attempts >= MAX_COMPLETENESS_ATTEMPTS ? "failed_permanent" : "retry"; item.error = message; item.updated_at = new Date().toISOString(); const last = item.attempt_history?.at(-1); if (last) { last.status = "failed"; last.error = message; } } }
        await writeRetry(retry);
      });
      return NextResponse.json({ ok: true, provider: providerId, attempted: active.length, succeeded: 0, failed: active.map((task) => ({ technical_name: task.technical_name, attempts: task.attempts, status: task.attempts >= MAX_COMPLETENESS_ATTEMPTS ? "failed_permanent" : "retry", error: message })), queue_ids: [], remaining_before: active.length, remaining_after_estimate: active.length, rebuild: false, indexes_dirty: false });
    }

    const queueIds: string[] = [];
    const failures: Array<{ technical_name: string; attempts: number; status: string; error: string }> = [];
    const succeededTasks: RunningTask[] = [];
    for (const task of active) {
      try {
        const item = modelItems.find((candidate) => candidate.technical_name === task.technical_name);
        if (!item?.fields) throw new Error(`LLM не вернула patch для ${task.technical_name}.`);
        if (!Object.keys(item.fields).length || item.needs_review_reason?.trim()) {
          const reason = item.needs_review_reason?.trim() || "Модель не предложила безопасное исправление; требуется ручная проверка.";
          await withCatalogueLock(async () => {
            const retry = await readRetry(); const record = retry.find((entry) => entry.task_id === task.task_id);
            if (record) { record.status = "needs_review"; record.error = reason; record.updated_at = new Date().toISOString(); const last = record.attempt_history?.at(-1); if (last) { last.status = "needs_review"; last.error = reason; } await writeRetry(retry); }
          });
          failures.push({ technical_name: task.technical_name, attempts: task.attempts, status: "needs_review", error: reason });
          continue;
        }
        if (typeof item.confidence !== "number" || item.confidence < confidenceThreshold) throw new Error(`Уверенность ${item.confidence ?? "не указана"} ниже порога ${confidenceThreshold} для ${task.technical_name}.`);
        const staged = await withCatalogueLock(async () => {
          const current = (await readCatalogueParameters()).find((row) => row.technical_name === task.technical_name);
          const retry = await readRetry();
          const taskRecord = retry.find((entry) => entry.task_id === task.task_id);
          if (!taskRecord) return null;
          if (!current) { taskRecord.status = "superseded"; taskRecord.error = "Запись удалена или tombstoned во время вызова модели."; await writeRetry(retry); return null; }
          const assessment = assessCompleteness(current, map);
          if (assessment.complete) { taskRecord.status = "resolved"; taskRecord.error = "Проблемы были устранены во время вызова модели."; await writeRetry(retry); return null; }
          const signature = completenessFieldSignature(assessment.missing_fields);
          if (signature !== task.field_signature) { taskRecord.status = "superseded"; taskRecord.error = "Набор проблем изменился во время вызова модели."; await writeRetry(retry); return null; }
          const before = cleanPublishedParameter(current as unknown as Record<string, unknown>);
          const after: Record<string, unknown> = { ...before };
          const invalidPatchFields = Object.entries(item.fields!).filter(([field, value]) => assessment.missing_fields.includes(field) && !validPatchValue(field, value, before)).map(([field]) => field);
          if (invalidPatchFields.length) throw new Error(`Patch содержит недопустимое значение для: ${invalidPatchFields.join(", ")}.`);
          for (const [field, value] of Object.entries(item.fields!)) if (assessment.missing_fields.includes(field)) after[field] = value;
          const cleanAfter = cleanPublishedParameter(after);
          if (!patchImprovesCompleteness(current, cleanAfter as typeof current, map)) throw new Error(`Patch не улучшил полноту для ${task.technical_name}; gaps=${assessment.missing_fields.join(",")}.`);
          return stage("update", task.technical_name, cleanAfter as typeof current, "completeness-fill", `completeness:${providerId}`);
        });
        if (staged) { queueIds.push(staged.id); succeededTasks.push(task); }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = task.attempts >= MAX_COMPLETENESS_ATTEMPTS ? "failed_permanent" : "retry";
        failures.push({ technical_name: task.technical_name, attempts: task.attempts, status, error: message });
        await withCatalogueLock(async () => {
          const retry = await readRetry(); const itemRecord = retry.find((entry) => entry.task_id === task.task_id);
          if (itemRecord) { itemRecord.status = status; itemRecord.error = message; itemRecord.updated_at = new Date().toISOString(); const last = itemRecord.attempt_history?.at(-1); if (last) { last.status = "failed"; last.error = message; } await writeRetry(retry); }
        });
      }
    }

    if (queueIds.length) {
      const committed = await commitCatalogueQueue(queueIds);
      await finishCatalogueQueue(committed.queue_ids);
    }
    await withCatalogueLock(async () => {
      const [retry, rows] = await Promise.all([readRetry(), readCatalogueParameters()]);
      const live = new Map(rows.map((row) => [row.technical_name, row]));
      for (const task of succeededTasks) {
        const record = retry.find((entry) => entry.task_id === task.task_id); const row = live.get(task.technical_name);
        if (!record) continue;
        if (!row) { record.status = "superseded"; record.error = "Запись удалена после заполнения."; }
        else {
          const assessment = assessCompleteness(row, map);
          if (assessment.complete) { record.status = "resolved"; record.error = record.error === "Задание зарезервировано." ? "Задача завершена." : record.error; }
          else if (completenessFieldSignature(assessment.missing_fields) !== task.field_signature) { record.status = "superseded"; record.error = "Исходная задача закрыта; остаточные проблемы имеют другой набор полей."; }
          else { record.status = task.attempts >= MAX_COMPLETENESS_ATTEMPTS ? "failed_permanent" : "retry"; record.error = "Ответ не закрыл все проблемы записи."; }
        }
        record.updated_at = new Date().toISOString();
        const last = record.attempt_history?.at(-1); if (last) { last.status = record.status === "resolved" ? "succeeded" : record.status; last.error = record.error; }
      }
      await writeRetry(retry);
    });
    const succeeded = succeededTasks.length;
    const attempted = active.length;
    return NextResponse.json({ ok: true, provider: providerId, attempted, succeeded, failed: failures, queue_ids: queueIds, remaining_before: attempted, remaining_after_estimate: Math.max(0, attempted - succeeded), rebuild: false, indexes_dirty: queueIds.length > 0 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
