import { existsSync, readFileSync } from "fs";
import { callSidecar } from "@/lib/engine/runner";
import { atomicWriteJson } from "@/lib/manifestation";
import { db } from "@/lib/db";

type JsonRecord = Record<string, any>;

export interface CrystalGwAnalysisOptions {
  query?: string | null;
  n_clusters?: number;
  dt?: number;
  friction?: number;
  epsilon?: number;
  max_steps?: number;
  tol_speed?: number;
  geometry_R?: number;
  geometry_r?: number;
  embedding_model?: string;
}

export interface CrystalGwResolved {
  crystal: Awaited<ReturnType<typeof db.crystal.findUnique>>;
  fullFile: JsonRecord;
}

export async function resolveCrystalWithFile(id: string): Promise<CrystalGwResolved> {
  const crystal = await db.crystal.findUnique({ where: { id } });
  if (!crystal) {
    throw new Error("Кристалл не найден");
  }
  if (!crystal.filepath || !existsSync(crystal.filepath)) {
    throw new Error(`Crystal file not found: ${crystal.filepath}`);
  }
  const fullFile = JSON.parse(readFileSync(crystal.filepath, "utf-8")) as JsonRecord;
  return { crystal, fullFile };
}

export function buildCrystalDocs(fullFile: JsonRecord, crystalRow?: { combination?: string | null; searchText?: string | null }) {
  const docs: string[] = [];
  const crystal = fullFile?.crystal && typeof fullFile.crystal === "object" ? fullFile.crystal : {};
  const meta = fullFile?.meta && typeof fullFile.meta === "object" ? fullFile.meta : {};
  const classification =
    fullFile?.classification && typeof fullFile.classification === "object" ? fullFile.classification : {};

  pushDoc(docs, crystalRow?.searchText);
  pushDoc(docs, crystalRow?.combination);
  pushDoc(docs, crystal.combination);
  pushDoc(docs, buildFocusDoc(crystal.focus));
  pushDoc(docs, crystal.pattern ? `Паттерн: ${String(crystal.pattern)}` : null);
  pushDoc(docs, meta.category ? `Категория: ${String(meta.category)}` : null);
  pushDoc(docs, meta.type ? `Тип кристалла: ${String(meta.type)}` : null);

  if (Array.isArray(crystal.elements)) {
    for (const element of crystal.elements) {
      pushDoc(docs, `Элемент: ${String(element)}`);
    }
  }

  if (Array.isArray(crystal.operators)) {
    for (const operator of crystal.operators) {
      if (!operator || typeof operator !== "object") continue;
      const parts = [
        operator.key ? `Оператор ${String(operator.key)}` : null,
        operator.symbol ? `символ ${String(operator.symbol)}` : null,
        operator.type ? `тип ${String(operator.type)}` : null,
        operator.formula ? `формула ${String(operator.formula)}` : null,
        operator.description ? `описание ${String(operator.description)}` : null,
      ].filter(Boolean);
      pushDoc(docs, parts.join(", "));
    }
  }

  if (crystal.metrics && typeof crystal.metrics === "object") {
    const metricParts = Object.entries(crystal.metrics)
      .slice(0, 12)
      .map(([key, value]) => `${key}=${String(value)}`);
    pushDoc(docs, metricParts.length ? `Метрики: ${metricParts.join(", ")}` : null);
  }

  if (Array.isArray(classification.reasons)) {
    for (const reason of classification.reasons) {
      pushDoc(docs, `Основание классификации: ${String(reason)}`);
    }
  }

  return uniqueDocs(docs);
}

export function buildCrystalQuery(
  fullFile: JsonRecord,
  crystalRow?: { combination?: string | null; searchText?: string | null },
  query?: string | null,
) {
  const trimmed = query?.trim();
  if (trimmed) return trimmed;

  const focus = fullFile?.crystal?.focus;
  const focusText = typeof focus?.word === "string" ? focus.word : typeof focus?.type === "string" ? focus.type : "";
  const combination = String(fullFile?.crystal?.combination ?? crystalRow?.combination ?? "").trim();
  const searchText = String(crystalRow?.searchText ?? "").trim();

  if (focusText && combination) {
    return `Как интерпретировать ${focusText} через структуру ${combination}?`;
  }
  return combination || searchText || "Смысловая интерпретация кристалла";
}

export async function runGwCollapserOnCrystal(id: string, options: CrystalGwAnalysisOptions = {}) {
  const resolved = await resolveCrystalWithFile(id);
  const docs = buildCrystalDocs(resolved.fullFile, resolved.crystal ?? undefined);
  if (!docs.length) {
    throw new Error("Не удалось извлечь текстовые фрагменты из кристалла");
  }

  const query = buildCrystalQuery(resolved.fullFile, resolved.crystal ?? undefined, options.query ?? null);
  const input = {
    docs,
    query,
    n_clusters: options.n_clusters ?? 5,
    dt: options.dt ?? 0.02,
    friction: options.friction ?? 0.01,
    epsilon: options.epsilon ?? 0.15,
    max_steps: options.max_steps ?? 1500,
    tol_speed: options.tol_speed ?? 1e-3,
    geometry_R: options.geometry_R ?? 1.2,
    geometry_r: options.geometry_r ?? 0.6,
    ...(options.embedding_model ? { embedding_model: options.embedding_model } : {}),
  };

  const { result } = await callSidecar("torus_analyze", {
    inputFile: input,
    taskType: "torus_analyze",
    title: `GW-Collapser: ${resolved.crystal?.code ?? id}`,
    timeoutMs: 10 * 60 * 1000,
  });

  const payload = result as JsonRecord;
  const gwLayer = {
    last_run_at: new Date().toISOString(),
    query,
    docs_count: docs.length,
    result: payload,
  };

  resolved.fullFile.gw_collapser = gwLayer;
  atomicWriteJson(resolved.crystal!.filepath, resolved.fullFile);

  return {
    crystalId: resolved.crystal!.id,
    crystalCode: resolved.crystal!.code,
    docsCount: docs.length,
    query,
    storedAt: gwLayer.last_run_at,
    result: payload,
  };
}

function pushDoc(target: string[], value: unknown) {
  const text = String(value ?? "").trim();
  if (text) target.push(text);
}

function uniqueDocs(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function buildFocusDoc(focus: unknown) {
  if (!focus || typeof focus !== "object") return null;
  const record = focus as Record<string, unknown>;
  const parts = [
    record.word ? `Фокус ${String(record.word)}` : null,
    record.type ? `тип ${String(record.type)}` : null,
    record.category ? `категория ${String(record.category)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
