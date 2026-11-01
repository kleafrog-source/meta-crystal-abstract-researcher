import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { cleanPublishedParameter, DOMAIN_LAYERS } from "@/lib/combinatorial-genesis/parameter-schema";
import { assessCompleteness } from "./completeness";
import { loadTaxonomyMap } from "./taxonomy";
import { GENESIS_DATA_ROOT, GENESIS_LIBRARY_DIR, GENESIS_LIBRARY_PATH, readGenesisLibrary, sha256 } from "@/lib/combinatorial-genesis/library";

export type QueueOperation = "add" | "update" | "delete";
export interface QueueItem { id: string; operation: QueueOperation; technical_name: string; payload?: GenesisLibraryParameter; previous?: GenesisLibraryParameter; reason?: string; source: string; created_at: string; status: "pending" | "applying" | "done" | "failed"; error?: string }
export interface QueueFile { items: QueueItem[]; updated_at: string }
export interface CatalogueState { revision: string; indexes_dirty: boolean; last_commit_at: string | null; last_commit_counts: Record<string, number> | null; last_composite_at: string | null; last_anchors_at: string | null; job: { running: boolean; started_at: string | null; finished_at: string | null; step: string | null; current: number; total: number; error: string | null; logs: string[] } }

export const QUEUE_PATH = path.join(GENESIS_LIBRARY_DIR, "catalogue-queue.json");
export const STATE_PATH = path.join(GENESIS_LIBRARY_DIR, "catalogue-state.json");
export const TOMBSTONES_PATH = path.join(GENESIS_LIBRARY_DIR, "catalogue-deleted.json");
export const HISTORY_DIR = path.join(GENESIS_LIBRARY_DIR, "history");
const COMPLETE_FIELDS = ["technical_name", "name_ru", "description_en", "description_ru", "category", "sub_category", "ui_element", "default", "unit", "quantity_kind", "lyria_prompt_tags", "semantic_keywords", "domain"] as const;
const CONDITIONAL_FIELDS: Record<string, string[]> = { Range: ["min_value", "max_value", "step"], Select: ["options"], Toggle: ["min_value", "max_value", "step"] };
const SPARSE_CATEGORY_LIMIT = 3;
const locks = new Map<string, Promise<void>>();

export async function readCatalogueParameters(): Promise<GenesisLibraryParameter[]> {
  const library = await readGenesisLibrary();
  const merged = new Map<string, GenesisLibraryParameter>();
  for (const row of library) if (row?.technical_name) merged.set(row.technical_name, cleanPublishedParameter(row as unknown as Record<string, unknown>) as GenesisLibraryParameter);
  try {
    const stored = JSON.parse(await fs.readFile(TOMBSTONES_PATH, "utf8")) as unknown;
    const deleted = new Set(Array.isArray(stored) ? stored.filter((name): name is string => typeof name === "string") : stored && typeof stored === "object" && Array.isArray((stored as { technical_names?: unknown }).technical_names) ? (stored as { technical_names: unknown[] }).technical_names.filter((name): name is string => typeof name === "string") : []);
    for (const name of deleted) merged.delete(name);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return [...merged.values()];
}

/** Raw union is deliberately limited to migration/diagnostic jobs; never use it for retrieval. */
export async function readRawCatalogueParameters(): Promise<GenesisLibraryParameter[]> {
  const library = await readGenesisLibrary();
  const merged = new Map<string, GenesisLibraryParameter>();
  for (const row of library) if (row?.technical_name) merged.set(row.technical_name, row);
  try {
    const stored = JSON.parse(await fs.readFile(TOMBSTONES_PATH, "utf8")) as unknown;
    const names = Array.isArray(stored) ? stored : stored && typeof stored === "object" && Array.isArray((stored as { technical_names?: unknown }).technical_names) ? (stored as { technical_names: unknown[] }).technical_names : [];
    for (const name of names) if (typeof name === "string") merged.delete(name);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return [...merged.values()];
}

export async function readCatalogueRevision(): Promise<string> {
  return sha256(JSON.stringify(await readCatalogueParameters()));
}

export function validateParameter(value: unknown): { ok: true; parameter: GenesisLibraryParameter } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Параметр должен быть объектом JSON." };
  const parameter = value as Record<string, unknown>;
  if (typeof parameter.technical_name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(parameter.technical_name)) return { ok: false, error: "technical_name обязателен и должен содержать только буквы, цифры, точку, дефис или подчёркивание." };
  if (typeof parameter.ui_element !== "string" || !parameter.ui_element.trim()) return { ok: false, error: "ui_element обязателен согласно схеме RuntimeParameterRecord." };
  for (const field of ["name_ru", "description_en", "description_ru", "category", "sub_category", "unit", "quantity_kind", "domain_layer"] as const) {
    if (parameter[field] !== undefined && parameter[field] !== null && typeof parameter[field] !== "string") return { ok: false, error: `${field} должен быть строкой.` };
  }
  if (parameter.domain_layer !== undefined && parameter.domain_layer !== null && !(DOMAIN_LAYERS as readonly unknown[]).includes(parameter.domain_layer)) return { ok: false, error: "domain_layer не входит в список 9 слоёв." };
  for (const field of ["min_value", "max_value", "step"] as const) if (parameter[field] !== undefined && typeof parameter[field] !== "number") return { ok: false, error: `${field} должен быть числом.` };
  if (parameter.options !== undefined && (!Array.isArray(parameter.options) || !parameter.options.every((item) => typeof item === "string"))) return { ok: false, error: "options должен быть массивом строк." };
  for (const field of ["semantic_keywords", "lyria_prompt_tags"] as const) if (parameter[field] !== undefined && (!Array.isArray(parameter[field]) || !parameter[field].every((item) => typeof item === "string"))) return { ok: false, error: `${field} должен быть массивом строк.` };
  return { ok: true, parameter: cleanPublishedParameter(parameter) as GenesisLibraryParameter };
}

async function atomicWrite(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(temporary, serialized, "utf8");
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { await fs.rename(temporary, file); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if ((code !== "EPERM" && code !== "EACCES") || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EACCES") throw error;
    await fs.copyFile(temporary, file);
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function withCatalogueLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = locks.get("catalogue") ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  locks.set("catalogue", previous.then(() => next));
  await previous;
  try { return await task(); } finally { release(); }
}

export async function readQueue(): Promise<QueueFile> {
  try { return JSON.parse(await fs.readFile(QUEUE_PATH, "utf8")) as QueueFile; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return { items: [], updated_at: new Date().toISOString() }; }
}
export async function writeQueue(queue: QueueFile): Promise<void> { queue.updated_at = new Date().toISOString(); await atomicWrite(QUEUE_PATH, queue); }

export async function readCatalogueState(): Promise<CatalogueState> {
  let state!: CatalogueState;
  let initialize = false;
  try { state = JSON.parse(await fs.readFile(STATE_PATH, "utf8")) as CatalogueState; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    state = { revision: await readCatalogueRevision(), indexes_dirty: true, last_commit_at: null, last_commit_counts: null, last_composite_at: null, last_anchors_at: null, job: { running: false, started_at: null, finished_at: null, step: "Статус ещё не синхронизирован", current: 0, total: 0, error: null, logs: [] } };
    initialize = true;
  }
  const actualRevision = await readCatalogueRevision();
  const changed = actualRevision !== state.revision;
  if (changed) { state.revision = actualRevision; state.indexes_dirty = true; }
  if (initialize || changed) await atomicWrite(STATE_PATH, state);
  return state;
}
export async function writeCatalogueState(state: CatalogueState): Promise<void> { await atomicWrite(STATE_PATH, state); }

export function missingFields(parameter: GenesisLibraryParameter): string[] {
  // Catalogue completeness follows FLOWMUSIC_COLLECTION_PROMPT_V1, including type-specific constraints.
  // The synchronous compatibility helper is retained for existing catalogue filters.
  const baseMissing = COMPLETE_FIELDS.filter((field) => {
    const value = parameter[field];
    return Array.isArray(value) ? value.length === 0 : typeof value !== "string" || !value.trim();
  });
  const conditional = CONDITIONAL_FIELDS[parameter.ui_element] ?? [];
  const conditionalMissing = conditional.filter((field) => {
    const value = parameter[field];
    return Array.isArray(value) ? value.length === 0 : typeof value !== "string" || !value.trim();
  });
  return [...baseMissing, ...conditionalMissing];
}
export function enrich(parameter: GenesisLibraryParameter) {
  const missing_fields = missingFields(parameter);
  const expectedFields = COMPLETE_FIELDS.length + (CONDITIONAL_FIELDS[parameter.ui_element]?.length ?? 0);
  return { ...parameter, _catalogue: { source: "published", missing_fields, completeness: Math.round((1 - missing_fields.length / expectedFields) * 100) } };
}
export function searchText(parameter: GenesisLibraryParameter): string {
  return [parameter.technical_name, parameter.name_ru, parameter.description_en, parameter.description_ru, parameter.category, parameter.sub_category, parameter.domain, ...(parameter.semantic_keywords ?? []), ...(parameter.lyria_prompt_tags ?? [])].filter(Boolean).join(" ").toLocaleLowerCase();
}
export function getParameterSource(_parameter: GenesisLibraryParameter, _libraryNames?: ReadonlySet<string>, _frozenNames?: ReadonlySet<string>): "published" { return "published"; }

export async function stage(operation: QueueOperation, name: string, payload?: GenesisLibraryParameter, reason?: string, source = "catalogue") {
  return withCatalogueLock(async () => {
    const library = await readGenesisLibrary();
    const existing = (await readCatalogueParameters()).find((item) => item.technical_name === name);
    if (operation === "add" && existing) throw new Error(`Параметр ${name} уже опубликован.`);
    if (operation !== "add" && !existing) throw new Error(`Параметр ${name} не найден в опубликованной библиотеке.`);
    if (operation !== "delete" && (!payload || payload.technical_name !== name)) throw new Error("Имя staged-параметра должно совпадать с technical_name payload.");
    const queue = await readQueue();
    const prior = queue.items.find((item) => item.technical_name === name && item.status === "pending");
    const item: QueueItem = { id: prior?.id ?? randomUUID(), operation, technical_name: name, ...(payload ? { payload } : {}), ...(existing ? { previous: existing } : {}), ...(reason ? { reason } : {}), source, created_at: prior?.created_at ?? new Date().toISOString(), status: "pending" };
    queue.items = [...queue.items.filter((candidate) => candidate.technical_name !== name || candidate.status !== "pending"), item];
    await writeQueue(queue);
    return item;
  });
}

export async function stageUpdatesBatch(payloads: GenesisLibraryParameter[], reason: string, source: string) {
  return withCatalogueLock(async () => {
    const library = new Map((await readCatalogueParameters()).map((row) => [row.technical_name, row]));
    const queue = await readQueue();
    const staged: QueueItem[] = [];
    for (const payload of payloads) {
      const previous = library.get(payload.technical_name);
      if (!previous) continue;
      const existing = queue.items.find((item) => item.technical_name === payload.technical_name && item.status === "pending");
      const item: QueueItem = { id: existing?.id ?? randomUUID(), operation: "update", technical_name: payload.technical_name, payload: cleanPublishedParameter(payload as unknown as Record<string, unknown>) as GenesisLibraryParameter, previous: existing?.previous ?? previous, reason, source, created_at: existing?.created_at ?? new Date().toISOString(), status: "pending" };
      queue.items = [...queue.items.filter((candidate) => candidate.technical_name !== payload.technical_name || candidate.status !== "pending"), item];
      staged.push(item);
    }
    await writeQueue(queue);
    return staged;
  });
}

export async function makeGaps(parameters?: GenesisLibraryParameter[]) {
  const library = parameters ?? await readGenesisLibrary();
  const completionMap = await loadTaxonomyMap();
  const assess = (row: GenesisLibraryParameter) => assessCompleteness(row, completionMap);
  const completionEnrich = (row: GenesisLibraryParameter) => {
    const result = assess(row);
    return { ...row, _catalogue: { source: "library", missing_fields: result.missing_fields, completeness: result.completeness } };
  };
  const categoryCounts = new Map<string, number>();
  for (const parameter of library) { const key = parameter.category?.trim(); if (key) categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1); }
  const taxonomy = new Map<string, Set<string>>();
  const taxonomyFiles = [path.join(GENESIS_LIBRARY_DIR, "parameters.json"), path.join(GENESIS_DATA_ROOT, "reference", "base_parameters.json")];
  for (const file of taxonomyFiles) {
    try {
      const rows = JSON.parse(await fs.readFile(file, "utf8")) as GenesisLibraryParameter[];
      for (const row of rows) { const category = row.category?.trim(); if (!category) continue; const children = taxonomy.get(category) ?? new Set<string>(); if (row.sub_category?.trim()) children.add(row.sub_category.trim()); taxonomy.set(category, children); }
    } catch { /* optional taxonomy source */ }
  }
  const subCounts = new Map<string, number>();
  for (const row of library) if (row.category?.trim() && row.sub_category?.trim()) { const key = `${row.category}|||${row.sub_category}`; subCounts.set(key, (subCounts.get(key) ?? 0) + 1); }
  const sparse = [...taxonomy].flatMap(([category, children]) => {
    const nodes = [{ category, sub_category: null as string | null, count: categoryCounts.get(category) ?? 0 }];
    for (const child of children) nodes.push({ category, sub_category: child, count: subCounts.get(`${category}|||${child}`) ?? 0 });
    return nodes.filter((node) => node.count < SPARSE_CATEGORY_LIMIT).map((node) => ({ ...node, sparse_limit: SPARSE_CATEGORY_LIMIT }));
  });
  return { required_fields: [...COMPLETE_FIELDS], conditional_required_fields: CONDITIONAL_FIELDS, sparse_category_limit: SPARSE_CATEGORY_LIMIT, incomplete: library.filter((row) => assess(row).missing_count > 0).map(completionEnrich), uncategorized: library.filter((row) => !row.category?.trim() || !row.sub_category?.trim()).map(completionEnrich), sparse_categories: sparse };
}
