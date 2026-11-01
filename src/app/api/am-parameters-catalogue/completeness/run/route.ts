import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { loadProviderForModelListing } from "@/lib/llm/factory";
import { cleanPublishedParameter, isPublishedField } from "@/lib/combinatorial-genesis/parameter-schema";
import { readCatalogueParameters, readQueue, stage, writeQueue } from "@/lib/am-parameters-catalogue/catalogue";
import { commitCatalogueQueue, finishCatalogueQueue } from "@/lib/am-parameters-catalogue/commit";
import { assessCompleteness, patchImprovesCompleteness } from "@/lib/am-parameters-catalogue/completeness";
import { loadTaxonomyMap, canonicalCategoryValues } from "@/lib/am-parameters-catalogue/taxonomy";
import { GENESIS_DATA_ROOT } from "@/lib/combinatorial-genesis/library";

export const runtime = "nodejs";
const RUN_PATH = path.join(GENESIS_DATA_ROOT, "library", "completeness", "run-state.json");
const RETRY_PATH = path.join(GENESIS_DATA_ROOT, "library", "completeness", "retry-queue.json");
type RetryItem = { technical_name: string; attempts: number; status: "retry" | "failed_permanent"; error: string; updated_at: string };

async function readRetry(): Promise<RetryItem[]> { try { return JSON.parse(await fs.readFile(RETRY_PATH, "utf8")) as RetryItem[]; } catch { return []; } }
async function writeJson(file: string, value: unknown) { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.${randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, file); }
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
  if (["name_ru", "description_en", "description_ru", "category", "sub_category", "unit", "quantity_kind", "domain"].includes(field)) return typeof value === "string" && value.trim().length > 0;
  if (field === "lyria_prompt_tags") return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "string" && /[A-Za-z]/.test(item) && !/[А-Яа-яЁё]/.test(item));
  if (field === "semantic_keywords") return Array.isArray(value) && value.length === 7 && value.slice(0, 3).every((item) => typeof item === "string" && /[А-Яа-яЁё]/.test(item)) && value.slice(3).every((item) => typeof item === "string" && /[A-Za-z]/.test(item) && !/[А-Яа-яЁё]/.test(item));
  return true;
}

export async function GET() { return NextResponse.json({ items: await readRetry() }); }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { provider?: string; technical_names?: string[]; batch_size?: number; confidence_threshold?: number; retry?: boolean };
    const providerId = body.provider === "ollama" ? "ollama" : "freellmapi";
    const { provider, settings } = await loadProviderForModelListing(providerId);
    const map = await loadTaxonomyMap();
    const rows = await readCatalogueParameters();
    const retryRows = await readRetry();
    const selected = Array.isArray(body.technical_names) ? new Set(body.technical_names) : null;
    const rowsToFill = rows.filter((row) => (!selected || selected.has(row.technical_name)) && (!body.retry || retryRows.some((item) => item.technical_name === row.technical_name && item.status === "retry")) && assessCompleteness(row, map).missing_count > 0);
    const limit = Math.min(50, Math.max(1, Math.floor(body.batch_size ?? 10)));
    const confidenceThreshold = Math.max(0, Math.min(1, Number(body.confidence_threshold ?? 0.6)));
    const batch = rowsToFill.slice(0, limit);
    const retry = await readRetry();
    const succeeded: string[] = [];
    const failed: RetryItem[] = [];
    const queueIds: string[] = [];
    {
      const part = batch;
      const candidates = part.map((row) => {
        const clean = cleanPublishedParameter(row as unknown as Record<string, unknown>);
        const assessment = assessCompleteness(row, map);
        return { parameter: clean, missing_fields: assessment.missing_fields, gap_reasons: assessment.gaps };
      });
      let modelItems: Array<{ technical_name?: string; confidence?: number; fields?: Record<string, unknown> }> = [];
      try {
        const response = await provider.chat([
          { role: "system", content: `Return JSON only with shape {"items":[{"technical_name":"...","confidence":0.85,"fields":{...}}]}. For each row use gap_reasons to repair listed invalid fields and missing_fields to fill absent fields. Include your actual confidence as a decimal from 0 to 1; do not copy the example value blindly. Fill only missing or invalid fields listed for each row. Never emit provenance, source, batch, account, model, or package identifiers. Never change technical_name or ui_element. You may fill default and type-specific values only when the row lists them as missing. quantity_kind must be short lowercase snake_case and semantically distinct from unit. Categories must be one of: ${canonicalCategoryValues(map).join(", ")}. Domain must be one of sound, structure, metadata, provenance, administrative. Descriptions max 360 EN and 420 RU chars. Tags exactly 3 English phrases. Keywords exactly 7: 3 Russian then 4 English. Preserve all other values.` },
          { role: "user", content: JSON.stringify({ parameters: candidates }) },
        ], { model: settings.chatModel, temperature: 0.1, maxTokens: 12000, format: "json", signal: AbortSignal.timeout(180_000) });
        const json = JSON.parse(response.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { items?: Array<{ technical_name?: string; confidence?: number; fields?: Record<string, unknown> }> };
        modelItems = json.items ?? [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const row of part) {
          const prior = retry.find((item) => item.technical_name === row.technical_name);
          const attempts = (prior?.attempts ?? 0) + 1;
          failed.push({ technical_name: row.technical_name, attempts, status: attempts >= 3 ? "failed_permanent" : "retry", error: message, updated_at: new Date().toISOString() });
        }
      }
      for (const row of part) {
        if (failed.some((item) => item.technical_name === row.technical_name)) continue;
        try {
          const item = modelItems.find((candidate) => candidate.technical_name === row.technical_name);
          if (!item?.fields) throw new Error(`LLM не вернула patch для ${row.technical_name}.`);
          if (typeof item.confidence !== "number" || item.confidence < confidenceThreshold) throw new Error(`Уверенность ${item.confidence ?? "не указана"} ниже порога ${confidenceThreshold} для ${row.technical_name}.`);
          const before = cleanPublishedParameter(row as unknown as Record<string, unknown>);
          const after: Record<string, unknown> = { ...before };
          const allowed = new Set(assessCompleteness(row, map).missing_fields);
          if (row.ui_element === "Range") for (const field of ["min_value", "max_value", "step", "default"]) if (!allowed.has(field)) allowed.add(field);
          if (row.ui_element === "Select") for (const field of ["options", "default"]) if (!allowed.has(field)) allowed.add(field);
          if (row.ui_element === "Toggle") for (const field of ["min_value", "max_value", "step", "default"]) if (!allowed.has(field)) allowed.add(field);
          for (const [field, value] of Object.entries(item.fields)) {
            if (!allowed.has(field)) continue;
            if (validPatchValue(field, value, before)) after[field] = value;
          }
          const cleanAfter = cleanPublishedParameter(after);
          if (!patchImprovesCompleteness(before as typeof row, cleanAfter as typeof row, map)) throw new Error(`Patch не улучшил полноту для ${row.technical_name}; fields=${Object.keys(item.fields).join(",")}; missing=${assessCompleteness(row, map).missing_fields.join(",")}.`);
          const staged = await stage("update", row.technical_name, cleanAfter as typeof row, "completeness-fill", `completeness:${providerId}`);
          queueIds.push(staged.id); succeeded.push(row.technical_name);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const prior = retry.find((entry) => entry.technical_name === row.technical_name);
          const attempts = (prior?.attempts ?? 0) + 1;
          failed.push({ technical_name: row.technical_name, attempts, status: attempts >= 3 ? "failed_permanent" : "retry", error: message, updated_at: new Date().toISOString() });
        }
      }
    }
    if (queueIds.length) {
      const committed = await commitCatalogueQueue(queueIds);
      await finishCatalogueQueue(committed.queue_ids);
    }
    const mergedRetry = new Map(retry.map((item) => [item.technical_name, item]));
    for (const name of succeeded) mergedRetry.delete(name);
    for (const item of failed) mergedRetry.set(item.technical_name, item);
    await writeJson(RETRY_PATH, [...mergedRetry.values()]);
    const next = rowsToFill.length > batch.length ? rowsToFill.length - batch.length : 0;
    return NextResponse.json({ ok: true, provider: providerId, attempted: batch.length, succeeded: succeeded.length, failed, queue_ids: queueIds, remaining_before: rowsToFill.length, remaining_after_estimate: next, rebuild: false, indexes_dirty: queueIds.length > 0 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
