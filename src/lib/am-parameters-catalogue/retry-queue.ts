import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { assessCompleteness } from "./completeness";
import type { TaxonomyMap } from "./taxonomy";

export const MAX_COMPLETENESS_ATTEMPTS = 3;
export const COMPLETENESS_TASK_VERSION = "field-issues-v2";

export interface RetryHistoryEntry {
  technical_name: string;
  attempts: number;
  status: string;
  error: string;
  updated_at: string;
  task_id?: string;
  task_version?: string;
  field_signature?: string;
  attempt_history?: Array<{ attempt: number; status?: string; error: string; at: string }>;
}

export interface RetryQueueView extends RetryHistoryEntry {
  effective_status: "retry" | "running" | "failed_permanent" | "resolved" | "superseded" | "needs_review";
  eligible: boolean;
  eligibility_reason: string;
}

export function completenessFieldSignature(fields: readonly string[]): string {
  return [...new Set(fields)].sort().join("|");
}

export function retryItemFieldSignature(item: RetryHistoryEntry): string | undefined {
  if (item.field_signature) return item.field_signature;
  const legacyFields = /\bmissing=([^;]+)/i.exec(item.error)?.[1];
  return legacyFields ? completenessFieldSignature(legacyFields.split(",").map((field) => field.trim()).filter(Boolean)) : undefined;
}

export function inspectRetryEntry(
  item: RetryHistoryEntry,
  current: GenesisLibraryParameter | undefined,
  taxonomy: TaxonomyMap,
): RetryQueueView {
  if (!current) return { ...item, effective_status: "superseded", eligible: false, eligibility_reason: "Параметр больше не опубликован (удалён или tombstoned)." };

  const assessment = assessCompleteness(current, taxonomy);
  if (assessment.complete) return { ...item, effective_status: "resolved", eligible: false, eligibility_reason: "Текущая запись больше не имеет проблем полноты." };

  const currentSignature = completenessFieldSignature(assessment.missing_fields);
  const priorSignature = retryItemFieldSignature(item);
  if (priorSignature && priorSignature !== currentSignature) {
    return { ...item, effective_status: "superseded", eligible: false, eligibility_reason: "Набор проблем записи изменился после этой попытки." };
  }
  if (item.task_version !== COMPLETENESS_TASK_VERSION) {
    return { ...item, effective_status: "superseded", eligible: false, eligibility_reason: "Контракт исправления изменился; новая попытка должна получить отдельное задание." };
  }
  if (item.status === "needs_review") return { ...item, effective_status: "needs_review", eligible: false, eligibility_reason: "Требуется ручная проверка; автоматический повтор отключён." };
  if (item.status === "resolved" || item.status === "superseded") {
    return { ...item, effective_status: item.status, eligible: false, eligibility_reason: "Это закрытая запись истории; новое задание должно получить отдельный task id." };
  }
  if (item.status === "running") return { ...item, effective_status: "running", eligible: false, eligibility_reason: "Задание уже выполняется." };
  if (item.status === "failed_permanent" || item.attempts >= MAX_COMPLETENESS_ATTEMPTS) {
    return { ...item, effective_status: "failed_permanent", eligible: false, eligibility_reason: "Достигнут лимит попыток для задания этой записи." };
  }
  return { ...item, effective_status: "retry", eligible: item.status === "retry", eligibility_reason: item.status === "retry" ? "Текущие проблемы ещё требуют исправления." : "Попытка не стоит в очереди." };
}
