/**
 * Crystal sync utilities.
 *
 * We prefer the Python engine's meta/index.json when it exists, but we also
 * scan the full crystals directory recursively because legacy runs can leave
 * valid crystal JSON files on disk without updating the index.
 */

import { db } from "@/lib/db";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join, relative, sep } from "path";

const PROJECT_ROOT = process.cwd();
const CRYSTALS_DIR_ABS = join(PROJECT_ROOT, "data", "meta_crystals", "crystals");
const META_DIR_ABS = join(CRYSTALS_DIR_ABS, "meta");
const INDEX_FILE = join(META_DIR_ABS, "index.json");

interface RawIndexEntry {
  code: string;
  type: string;
  category?: string;
  focus?: string;
  pattern?: string;
  combination?: string;
  filepath: string;
  counter: number;
  step?: number;
  quality_score?: number;
  quality?: number;
  qualityScore?: number;
  complexity?: number;
  datetime?: string;
  metrics?: Record<string, number>;
  reasons?: string[];
  elements?: unknown[];
  operators?: unknown[];
  metadata?: Record<string, unknown>;
}

interface RawCrystalFile {
  code?: string;
  type?: string;
  category?: string;
  focus?: string | { type?: string; word?: string; category?: string };
  pattern?: string;
  combination?: string;
  formula?: string;
  text?: string;
  filepath?: string;
  counter?: number;
  step?: number;
  quality_score?: number;
  quality?: number;
  qualityScore?: number;
  complexity?: number;
  datetime?: string;
  metrics?: Record<string, number>;
  reasons?: string[];
  elements?: unknown[];
  operators?: unknown[];
  metadata?: Record<string, unknown>;
  crystal?: Record<string, unknown>;
  classification?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface SyncResult {
  added: number;
  updated: number;
  total: number;
  embedded: number;
}

export async function syncCrystalsFromIndex(): Promise<SyncResult> {
  const entries = loadCrystalEntries();
  if (entries.length === 0) {
    return { added: 0, updated: 0, total: 0, embedded: 0 };
  }

  let added = 0;
  let updated = 0;
  let embedded = 0;

  for (const entry of entries) {
    if (!entry.code || !entry.filepath) continue;

    const full = readFullCrystalFile(entry.filepath);
    const crystalBlock = ((full?.crystal ?? full ?? {}) as Record<string, any>);
    const focusBlock = crystalBlock.focus as
      | { type?: string; word?: string; category?: string }
      | undefined;

    const combination =
      entry.combination ??
      crystalBlock.combination ??
      crystalBlock.formula ??
      crystalBlock.text ??
      "";
    const focus = entry.focus ?? focusBlock?.word ?? focusBlock?.type ?? null;
    const pattern = entry.pattern ?? crystalBlock.pattern ?? null;
    const elements = entry.elements ?? crystalBlock.elements ?? crystalBlock.keywords ?? [];
    const operators = entry.operators ?? crystalBlock.operators ?? [];
    const metrics = entry.metrics ?? crystalBlock.metrics ?? null;
    const reasons =
      entry.reasons ??
      ((full?.classification as Record<string, any> | undefined)?.reasons ?? null) ??
      ((full as Record<string, any> | null)?.reasons ?? null);
    const complexity = entry.complexity ?? crystalBlock.complexity ?? null;
    const metadata = entry.metadata ?? (full ? { ...(full as Record<string, unknown>) } : null);

    const searchText = [
      combination,
      focus ?? "",
      pattern ?? "",
      Array.isArray(elements) ? elements.map(stringifyValue).join(" ") : "",
      entry.type,
    ]
      .join(" ")
      .trim();

    const data = {
      type: entry.type,
      category: entry.category ?? null,
      focus,
      pattern,
      combination,
      searchText,
      elementsJson: JSON.stringify(elements),
      operatorsJson: operators ? JSON.stringify(operators) : null,
      metricsJson: metrics ? JSON.stringify(metrics) : null,
      reasonsJson: reasons ? JSON.stringify(reasons) : null,
      qualityScore:
        entry.quality_score ??
        entry.quality ??
        entry.qualityScore ??
        crystalBlock.quality_score ??
        null,
      complexity,
      counter: entry.counter,
      step: entry.step ?? null,
      filepath: resolveCrystalPath(entry.filepath),
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    };

    const existing = await db.crystal.findUnique({ where: { code: entry.code } });
    if (existing) {
      await db.crystal.update({
        where: { code: entry.code },
        data: { ...data, embedding: existing.embedding },
      });
      updated++;
    } else {
      await db.crystal.create({
        data: { code: entry.code, ...data, embedding: null },
      });
      added++;
    }
  }

  return { added, updated, total: entries.length, embedded };
}

function loadCrystalEntries(): RawIndexEntry[] {
  const byCode = new Map<string, RawIndexEntry>();

  if (existsSync(INDEX_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(INDEX_FILE, "utf-8")) as {
        crystals?: RawIndexEntry[];
        records?: RawIndexEntry[];
      };
      const indexed = raw.crystals ?? raw.records ?? [];
      for (const entry of indexed) {
        if (entry?.code) {
          byCode.set(entry.code, entry);
        }
      }
    } catch {
      // Ignore broken index and rely on filesystem scan.
    }
  }

  for (const absPath of listCrystalJsonFiles(CRYSTALS_DIR_ABS)) {
    const parsed = readCrystalEntryFromFile(absPath);
    if (!parsed?.code) continue;
    const indexed = byCode.get(parsed.code);
    byCode.set(parsed.code, indexed ? { ...parsed, ...indexed } : parsed);
  }

  return Array.from(byCode.values()).sort((a, b) => (a.counter ?? 0) - (b.counter ?? 0));
}

function listCrystalJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const result: string[] = [];

  for (const entry of readdirSync(dir)) {
    const absPath = join(dir, entry);
    let stats;
    try {
      stats = statSync(absPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (absPath === META_DIR_ABS) continue;
      result.push(...listCrystalJsonFiles(absPath));
      continue;
    }

    if (!stats.isFile()) continue;
    if (!entry.toLowerCase().endsWith(".json")) continue;

    const fileName = basename(absPath).toLowerCase();
    if (fileName === "index.json" || fileName === "counter.json") continue;

    result.push(absPath);
  }

  return result;
}

function readCrystalEntryFromFile(absPath: string): RawIndexEntry | null {
  let raw: RawCrystalFile;
  try {
    raw = JSON.parse(readFileSync(absPath, "utf-8")) as RawCrystalFile;
  } catch {
    return null;
  }

  const crystalBlock = (raw.crystal ?? raw) as Record<string, any>;
  const classification = (raw.classification ?? {}) as Record<string, any>;
  const meta = (raw.meta ?? {}) as Record<string, any>;
  const focusValue = raw.focus ?? crystalBlock.focus;
  const focus =
    typeof focusValue === "string"
      ? focusValue
      : focusValue?.word ?? focusValue?.type ?? focusValue?.category;

  const combination =
    raw.combination ??
    crystalBlock.combination ??
    raw.formula ??
    crystalBlock.formula ??
    raw.text ??
    crystalBlock.text ??
    "";
  const type =
    raw.type ??
    classification.type ??
    crystalBlock.type ??
    meta.type ??
    "UNKNOWN";
  const code = raw.code ?? crystalBlock.code ?? meta.code ?? basename(absPath, ".json");

  if (!code || !combination || !type) return null;

  const relativePath = relative(CRYSTALS_DIR_ABS, absPath).split(sep).join("/");

  return {
    code,
    type,
    category: raw.category ?? classification.category ?? meta.category ?? undefined,
    focus: focus ?? undefined,
    pattern: raw.pattern ?? crystalBlock.pattern ?? classification.pattern ?? undefined,
    combination,
    filepath: relativePath,
    counter:
      raw.counter ??
      crystalBlock.counter ??
      meta.counter ??
      extractCounterFromCode(code) ??
      0,
    step: raw.step ?? crystalBlock.step ?? meta.step ?? undefined,
    quality_score:
      raw.quality_score ??
      raw.quality ??
      raw.qualityScore ??
      crystalBlock.quality_score ??
      classification.quality_score ??
      undefined,
    complexity: raw.complexity ?? crystalBlock.complexity ?? classification.complexity ?? undefined,
    datetime: raw.datetime ?? meta.datetime ?? undefined,
    metrics: raw.metrics ?? crystalBlock.metrics ?? classification.metrics ?? undefined,
    reasons: raw.reasons ?? classification.reasons ?? undefined,
    elements: (raw.elements ?? crystalBlock.elements ?? crystalBlock.keywords ?? []) as unknown[],
    operators: (raw.operators ?? crystalBlock.operators ?? []) as unknown[],
    metadata: raw.metadata ?? (raw as Record<string, unknown>),
  };
}

function resolveCrystalPath(filepath: string): string {
  if (filepath.startsWith("/") || filepath.match(/^[A-Za-z]:\\/)) {
    return filepath;
  }
  return join(CRYSTALS_DIR_ABS, filepath);
}

function readFullCrystalFile(filepath: string): RawCrystalFile | null {
  const absPath = resolveCrystalPath(filepath);
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf-8")) as RawCrystalFile;
  } catch {
    return null;
  }
}

function extractCounterFromCode(code: string): number | null {
  const match = code.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return String(obj.name ?? obj.word ?? obj.type ?? obj.key ?? JSON.stringify(value));
  }
  return "";
}

export async function syncKnowledgeBase(): Promise<{
  total: number;
  byKind: Record<string, number>;
}> {
  const { callSidecar } = await import("@/lib/engine/runner");
  const { result, events } = await callSidecar("knowledge_export");
  const dataEvt = events.find((e) => e.event === "data" && e.payload);
  const payload = (dataEvt?.payload ?? result) as {
    lexicon: any[];
    operators: any[];
    patterns: any[];
    focus: any[];
  };

  const byKind: Record<string, number> = {
    lexicon: 0,
    operator: 0,
    pattern: 0,
    focus: 0,
  };

  for (const ent of payload.lexicon ?? []) {
    await db.knowledgeEntity.upsert({
      where: { kind_name: { kind: "lexicon", name: ent.name } },
      create: {
        kind: "lexicon",
        name: ent.name,
        category: ent.category ?? null,
        metaJson: JSON.stringify(ent),
        embedding: null,
      },
      update: {
        category: ent.category ?? null,
        metaJson: JSON.stringify(ent),
      },
    });
    byKind.lexicon++;
  }

  for (const ent of payload.operators ?? []) {
    await db.knowledgeEntity.upsert({
      where: { kind_name: { kind: "operator", name: ent.name } },
      create: {
        kind: "operator",
        name: ent.name,
        category: ent.type ?? ent.category ?? null,
        metaJson: JSON.stringify(ent),
        embedding: null,
      },
      update: {
        category: ent.type ?? ent.category ?? null,
        metaJson: JSON.stringify(ent),
      },
    });
    byKind.operator++;
  }

  for (const ent of payload.patterns ?? []) {
    await db.knowledgeEntity.upsert({
      where: { kind_name: { kind: "pattern", name: ent.name } },
      create: {
        kind: "pattern",
        name: ent.name,
        category: null,
        metaJson: JSON.stringify(ent),
        embedding: null,
      },
      update: {},
    });
    byKind.pattern++;
  }

  for (const ent of payload.focus ?? []) {
    await db.knowledgeEntity.upsert({
      where: { kind_name: { kind: "focus", name: ent.name } },
      create: {
        kind: "focus",
        name: ent.name,
        category: ent.category ?? null,
        metaJson: JSON.stringify(ent),
        embedding: null,
      },
      update: {},
    });
    byKind.focus++;
  }

  return {
    total: byKind.lexicon + byKind.operator + byKind.pattern + byKind.focus,
    byKind,
  };
}
