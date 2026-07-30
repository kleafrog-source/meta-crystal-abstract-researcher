import { existsSync, readFileSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { callSidecar } from "@/lib/engine/runner";
import { atomicWriteJson } from "@/lib/manifestation";
import { db } from "@/lib/db";
import type {
  GwCrystalDoc,
  GwPersistedTorusFile,
  GwTorusAnalysisResult,
  GwTorusDocPoint,
  GwTorusParameters,
} from "@/types/gw-collapser";

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
  document_mode?: "combination_only" | "full";
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

export function crystalToDocs(
  fullFile: JsonRecord,
  crystalRow?: { combination?: string | null; searchText?: string | null },
): GwCrystalDoc[] {
  const docs: GwCrystalDoc[] = [];
  const crystal = fullFile?.crystal && typeof fullFile.crystal === "object" ? fullFile.crystal : {};
  const meta = fullFile?.meta && typeof fullFile.meta === "object" ? fullFile.meta : {};
  const classification =
    fullFile?.classification && typeof fullFile.classification === "object" ? fullFile.classification : {};

  pushCrystalDoc(docs, {
    id: "search-text",
    title: "Search text",
    text: crystalRow?.searchText,
    kind: "searchText",
    sourcePath: "crystal.searchText",
  });
  pushCrystalDoc(docs, {
    id: "row-combination",
    title: "Combination",
    text: crystalRow?.combination,
    kind: "combination",
    sourcePath: "crystal.combination",
  });
  pushCrystalDoc(docs, {
    id: "crystal-combination",
    title: "Crystal combination",
    text: crystal.combination,
    kind: "combination",
    sourcePath: "fullFile.crystal.combination",
  });
  pushCrystalDoc(docs, {
    id: "focus",
    title: "Focus",
    text: buildFocusDoc(crystal.focus),
    kind: "focus",
    sourcePath: "fullFile.crystal.focus",
  });
  pushCrystalDoc(docs, {
    id: "pattern",
    title: "Pattern",
    text: crystal.pattern ? `Паттерн: ${String(crystal.pattern)}` : null,
    kind: "pattern",
    sourcePath: "fullFile.crystal.pattern",
  });
  pushCrystalDoc(docs, {
    id: "category",
    title: "Category",
    text: meta.category ? `Категория: ${String(meta.category)}` : null,
    kind: "category",
    sourcePath: "fullFile.meta.category",
  });
  pushCrystalDoc(docs, {
    id: "type",
    title: "Crystal type",
    text: meta.type ? `Тип кристалла: ${String(meta.type)}` : null,
    kind: "type",
    sourcePath: "fullFile.meta.type",
  });

  if (Array.isArray(crystal.elements)) {
    for (const [index, element] of crystal.elements.entries()) {
      pushCrystalDoc(docs, {
        id: `element-${index}`,
        title: `Element ${index + 1}`,
        text: `Элемент: ${String(element)}`,
        kind: "element",
        sourcePath: "fullFile.crystal.elements",
        sourceIndex: index,
      });
    }
  }

  if (Array.isArray(crystal.operators)) {
    for (const [index, operator] of crystal.operators.entries()) {
      if (!operator || typeof operator !== "object") continue;
      const parts = [
        operator.key ? `Оператор ${String(operator.key)}` : null,
        operator.symbol ? `символ ${String(operator.symbol)}` : null,
        operator.type ? `тип ${String(operator.type)}` : null,
        operator.formula ? `формула ${String(operator.formula)}` : null,
        operator.description ? `описание ${String(operator.description)}` : null,
      ].filter(Boolean);
      pushCrystalDoc(docs, {
        id: `operator-${index}`,
        title: `Operator ${index + 1}`,
        text: parts.join(", "),
        kind: "operator",
        sourcePath: "fullFile.crystal.operators",
        sourceIndex: index,
      });
    }
  }

  if (crystal.metrics && typeof crystal.metrics === "object") {
    const metricParts = Object.entries(crystal.metrics)
      .slice(0, 12)
      .map(([key, value]) => `${key}=${String(value)}`);
    pushCrystalDoc(docs, {
      id: "metrics",
      title: "Metrics",
      text: metricParts.length ? `Метрики: ${metricParts.join(", ")}` : null,
      kind: "metrics",
      sourcePath: "fullFile.crystal.metrics",
    });
  }

  if (Array.isArray(classification.reasons)) {
    for (const [index, reason] of classification.reasons.entries()) {
      pushCrystalDoc(docs, {
        id: `reason-${index}`,
        title: `Reason ${index + 1}`,
        text: `Основание классификации: ${String(reason)}`,
        kind: "reason",
        sourcePath: "fullFile.classification.reasons",
        sourceIndex: index,
      });
    }
  }

  return uniqueCrystalDocs(docs);
}

export function docsToLegacyTexts(docs: GwCrystalDoc[]) {
  return uniqueDocs(docs.map((doc) => doc.text));
}

export function buildCrystalDocs(
  fullFile: JsonRecord,
  crystalRow?: { combination?: string | null; searchText?: string | null },
) {
  return docsToLegacyTexts(crystalToDocs(fullFile, crystalRow));
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
  const docs =
    options.document_mode === "combination_only"
      ? docsToLegacyTexts(selectCombinationDocs(crystalToDocs(resolved.fullFile, resolved.crystal ?? undefined)))
      : buildCrystalDocs(resolved.fullFile, resolved.crystal ?? undefined);
  if (!docs.length) {
    throw new Error("Не удалось извлечь текстовые фрагменты из кристалла");
  }

  const query = buildCrystalQuery(resolved.fullFile, resolved.crystal ?? undefined, options.query ?? null);
  const effectiveClusters = Math.max(1, Math.min(options.n_clusters ?? 5, docs.length));
  const input = {
    docs,
    query,
    n_clusters: effectiveClusters,
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

export function buildGwTorusFilepath(crystalFilepath: string) {
  const ext = extname(crystalFilepath);
  const base = basename(crystalFilepath, ext || undefined);
  return join(dirname(crystalFilepath), `${base}.gw_torus.json`);
}

export function persistTorusAnalysisResult(
  crystalFilepath: string,
  analysis: GwTorusAnalysisResult,
) {
  const storedAt = analysis.stored_at ?? new Date().toISOString();
  const file: GwPersistedTorusFile = {
    version: 1,
    stored_at: storedAt,
    analysis: {
      ...analysis,
      stored_at: storedAt,
    },
  };
  atomicWriteJson(buildGwTorusFilepath(crystalFilepath), file);
  return file;
}

export function readPersistedTorusAnalysisResult(crystalFilepath: string) {
  const filepath = buildGwTorusFilepath(crystalFilepath);
  if (!existsSync(filepath)) return null;
  const parsed = JSON.parse(readFileSync(filepath, "utf-8")) as GwPersistedTorusFile;
  if (!parsed || parsed.version !== 1 || !parsed.analysis) return null;
  return parsed;
}

export async function runTorusAnalysisForCrystal(id: string, options: CrystalGwAnalysisOptions = {}) {
  const resolved = await resolveCrystalWithFile(id);
  const docs =
    options.document_mode === "combination_only"
      ? selectCombinationDocs(crystalToDocs(resolved.fullFile, resolved.crystal ?? undefined))
      : crystalToDocs(resolved.fullFile, resolved.crystal ?? undefined);
  const docTexts = docsToLegacyTexts(docs);
  if (!docTexts.length) {
    throw new Error("Не удалось извлечь текстовые фрагменты из кристалла");
  }

  const parameters: GwTorusParameters = {
    n_clusters: Math.max(1, Math.min(options.n_clusters ?? 5, docTexts.length)),
    dt: options.dt ?? 0.02,
    friction: options.friction ?? 0.01,
    epsilon: options.epsilon ?? 0.15,
    max_steps: options.max_steps ?? 1500,
    tol_speed: options.tol_speed ?? 1e-3,
    geometry_R: options.geometry_R ?? 1.2,
    geometry_r: options.geometry_r ?? 0.6,
    ...(options.embedding_model ? { embedding_model: options.embedding_model } : {}),
  };
  const query = buildCrystalQuery(resolved.fullFile, resolved.crystal ?? undefined, options.query ?? null);

  const { result } = await callSidecar<JsonRecord>("torus_analyze", {
    inputFile: {
      docs: docTexts,
      query,
      ...parameters,
    },
    taskType: "torus_analyze",
    title: `GW-Collapser: ${resolved.crystal?.code ?? id}`,
    timeoutMs: 10 * 60 * 1000,
  });

  const payload = result as JsonRecord;
  const payloadDocs = Array.isArray(payload.docs) ? payload.docs : [];
  const payloadDocCoords =
    Array.isArray(payload.doc_coords) && payload.doc_coords.length
      ? payload.doc_coords
      : Array.isArray(payloadDocs)
        ? payloadDocs.map((item) => (item && typeof item === "object" ? [(item as JsonRecord).x, (item as JsonRecord).y] : null))
        : [];
  const payloadLabels = Array.isArray(payload.labels) ? payload.labels : [];
  const payloadTorus = payload.torus ?? payload.torus_geometry ?? {};
  const payloadFlow = payload.flow ?? {};
  const storedAt = new Date().toISOString();

  const mappedDocs: GwTorusDocPoint[] = docs.map((doc, index) => {
    const coord = Array.isArray(payloadDocCoords[index]) ? payloadDocCoords[index] : [0, 0];
    const payloadDoc = payloadDocs[index];
    const payloadDocRecord = payloadDoc && typeof payloadDoc === "object" ? (payloadDoc as JsonRecord) : null;
    return {
      id: doc.id,
      title: typeof payloadDocRecord?.label === "string" ? String(payloadDocRecord.label) : doc.title,
      text:
        typeof payloadDoc === "string"
          ? payloadDoc
          : typeof payloadDocRecord?.text === "string"
            ? String(payloadDocRecord.text)
            : doc.text,
      cluster: Number(payloadLabels[index] ?? payloadDocRecord?.cluster ?? 0),
      torus: {
        x: Number(coord[0] ?? 0),
        y: Number(coord[1] ?? 0),
      },
      sourcePath: doc.sourcePath,
      sourceIndex: doc.sourceIndex,
    };
  });

  const analysis: GwTorusAnalysisResult = {
    crystal_id: resolved.crystal!.id,
    crystal_code: resolved.crystal!.code,
    query,
    source: {
      crystalId: resolved.crystal!.id,
      crystalCode: resolved.crystal!.code,
      crystalFilepath: resolved.crystal!.filepath,
    },
    docs: mappedDocs,
    torus: {
      R: Number(payloadTorus.R ?? parameters.geometry_R),
      r: Number(payloadTorus.r ?? parameters.geometry_r),
      epsilon: parameters.epsilon,
      clusters: parameters.n_clusters,
    },
    flow: {
      history: toPairList(payloadFlow.history ?? payloadFlow.path),
      final: toPair(payloadFlow.final),
      start: toPair(payloadFlow.start),
      speeds: toNumberList(payloadFlow.speeds),
    },
    mmss: {
      V: Number(payload.mmss?.V ?? 0),
      S: Number(payload.mmss?.S ?? 0),
      N: Number(payload.mmss?.N ?? 0),
      D_f: Number(payload.mmss?.D_f ?? 0),
      QEC: Number(payload.mmss?.QEC ?? 0),
      CHSH: Number(payload.mmss?.CHSH ?? 0),
      Q: Number(payload.mmss?.Q ?? 0),
    },
    top_docs: Array.isArray(payload.top_docs)
      ? payload.top_docs.map((item: JsonRecord) => {
          const docIndex = Number(item.index ?? -1);
          const linkedDoc = docIndex >= 0 ? mappedDocs[docIndex] : undefined;
          return {
            rank: Number(item.rank ?? 0),
            id: linkedDoc?.id ?? `top-doc-${docIndex}`,
            title: linkedDoc?.title ?? `Top doc ${docIndex}`,
            text: String(item.text ?? linkedDoc?.text ?? ""),
            distance: Number(item.distance ?? 0),
            cluster: Number(item.cluster ?? linkedDoc?.cluster ?? 0),
          };
        })
      : [],
    parameters,
    stored_at: storedAt,
  };

  persistTorusAnalysisResult(resolved.crystal!.filepath, analysis);
  await persistCrystalAtlasSnapshot(resolved.crystal!.id, resolved.crystal!.metadataJson, analysis);
  return analysis;
}

function pushDoc(target: string[], value: unknown) {
  const text = String(value ?? "").trim();
  if (text) target.push(text);
}

function uniqueDocs(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function pushCrystalDoc(target: GwCrystalDoc[], doc: Omit<GwCrystalDoc, "text"> & { text: unknown }) {
  const text = String(doc.text ?? "").trim();
  if (!text) return;
  target.push({
    ...doc,
    text,
  });
}

function uniqueCrystalDocs(values: GwCrystalDoc[]) {
  const seen = new Set<string>();
  const result: GwCrystalDoc[] = [];
  for (const doc of values) {
    const key = doc.text.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(doc);
  }
  return result;
}

function selectCombinationDocs(values: GwCrystalDoc[]) {
  const filtered = values.filter((doc) =>
    doc.id === "crystal-combination" || doc.id === "row-combination" || doc.kind === "combination",
  );
  return filtered.length ? uniqueCrystalDocs(filtered) : values.slice(0, 1);
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

function toPair(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [0, 0];
  return [Number(value[0] ?? 0), Number(value[1] ?? 0)];
}

async function persistCrystalAtlasSnapshot(
  crystalId: string,
  metadataJson: string | null,
  analysis: GwTorusAnalysisResult,
) {
  const metadata = safeParseRecord(metadataJson);
  const representative = buildAtlasRepresentative(analysis);
  metadata.torusAnalysis = {
    stored_at: analysis.stored_at,
    docs: analysis.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      cluster: doc.cluster,
      torus: doc.torus,
    })),
    flow: {
      final: analysis.flow.final,
      start: analysis.flow.start,
    },
  };
  metadata.torusAtlas = representative;
  metadata.torusX = representative.torusX;
  metadata.torusY = representative.torusY;
  metadata.torusZ = representative.torusZ;
  metadata.clusterLabel = representative.clusterLabel;

  await db.crystal.update({
    where: { id: crystalId },
    data: {
      metadataJson: JSON.stringify(metadata),
    },
  });
}

function buildAtlasRepresentative(analysis: GwTorusAnalysisResult) {
  const flowPoint = analysis.flow.final ?? [0, 0];
  const clusterLabel = dominantCluster(analysis.docs);
  const point3d = torusParam(
    Number(flowPoint[0] ?? 0),
    Number(flowPoint[1] ?? 0),
    analysis.torus.R,
    analysis.torus.r,
    0,
  );

  return {
    torusU: Number(flowPoint[0] ?? 0),
    torusV: Number(flowPoint[1] ?? 0),
    torusX: point3d.x,
    torusY: point3d.y,
    torusZ: point3d.z,
    clusterLabel,
  };
}

function dominantCluster(docs: GwTorusDocPoint[]) {
  const counts = new Map<number, number>();
  for (const doc of docs) {
    counts.set(doc.cluster, (counts.get(doc.cluster) ?? 0) + 1);
  }
  let bestCluster = 0;
  let bestCount = -1;
  for (const [cluster, count] of counts.entries()) {
    if (count > bestCount) {
      bestCluster = cluster;
      bestCount = count;
    }
  }
  return bestCluster;
}

function torusParam(u: number, v: number, R: number, r: number, twist: number) {
  const vt = v + twist * u;
  const cv = Math.cos(vt);
  const sv = Math.sin(vt);
  const cu = Math.cos(u);
  const su = Math.sin(u);
  return {
    x: (R + r * cv) * cu,
    y: (R + r * cv) * su,
    z: r * sv,
  };
}

function safeParseRecord(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function toPairList(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map((item) => [Number(item[0] ?? 0), Number(item[1] ?? 0)] as [number, number]);
}

function toNumberList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item ?? 0));
}
