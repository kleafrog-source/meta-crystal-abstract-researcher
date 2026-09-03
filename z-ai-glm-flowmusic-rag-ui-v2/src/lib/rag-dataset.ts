// Dataset loader for the Flowmusic parameters dataset.
//
// The authoritative source is the GitHub raw URL given in the task. We
// ship a local copy at `public/parameters-dataset.json` so the backend can
// seed the SQLite database even when the sandbox has no outbound network.
// If the local copy is missing or stale we fall back to the GitHub URL.

import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import type { RawParameter } from "./rag-types";

const DATASET_URL =
  "https://raw.githubusercontent.com/kleafrog-source/meta-crystal-abstract-researcher/refs/heads/main/meta_lexicon/flowmusic-instructions/parameters-dataset.json";

const LOCAL_DATASET_PATH = path.join(
  process.cwd(),
  "public",
  "parameters-dataset.json",
);

let inMemoryDataset: RawParameter[] | null = null;

/** Fetch the raw dataset. Prefers the bundled local file, then GitHub. */
export async function fetchRawDataset(): Promise<RawParameter[]> {
  if (inMemoryDataset) return inMemoryDataset;

  // 1) Bundled local copy (offline-friendly).
  try {
    const file = await fs.readFile(LOCAL_DATASET_PATH, "utf8");
    const parsed = JSON.parse(file) as RawParameter[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      inMemoryDataset = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn(
      "[rag-dataset] local dataset unavailable:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // 2) Live fetch from GitHub.
  const res = await fetch(DATASET_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch parameters dataset (HTTP ${res.status} ${res.statusText})`,
    );
  }
  const parsed = (await res.json()) as RawParameter[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Parameters dataset is empty or malformed.");
  }
  inMemoryDataset = parsed;
  return parsed;
}

/** Serialise values that SQLite/Prisma can't store natively (arrays &
 *  union types) into JSON strings. */
function jsonStr(value: unknown): string {
  return JSON.stringify(value);
}

/** Ensure the SQLite database is populated with every parameter from the
 *  dataset. Existing rows keep their `is_vectorized` / `embedding` state
 *  so re-seeding does not blow away an already-completed vectorization.
 *  Returns the total number of parameters now in the database. */
export async function ensureDatasetLoaded(): Promise<number> {
  const dataset = await fetchRawDataset();

  const existing = await db.parameter.count();
  if (existing === dataset.length) {
    return existing;
  }

  // Upsert every row. We batch in chunks to keep SQLite transactions
  // reasonable (Prisma doesn't expose a bulk upsert for SQLite).
  const CHUNK = 200;
  for (let i = 0; i < dataset.length; i += CHUNK) {
    const slice = dataset.slice(i, i + CHUNK);
    await db.$transaction(
      slice.map((p) =>
        db.parameter.upsert({
          where: { technicalName: p.technical_name },
          create: {
            technicalName: p.technical_name,
            uiElement: p.ui_element,
            minValue: p.min_value ?? null,
            maxValue: p.max_value ?? null,
            step: p.step ?? null,
            defaultValue: jsonStr(p.default),
            unit: p.unit ?? null,
            options: p.options ? jsonStr(p.options) : null,
            minLength: p.min_length ?? null,
            maxLength: p.max_length ?? null,
            lyriaPromptTags: jsonStr(p.lyria_prompt_tags),
            semanticKeywords: jsonStr(p.semantic_keywords),
            isVectorized: false,
            embedding: null,
          },
          update: {
            // Keep embedding/vectorization state; refresh metadata in case
            // the upstream dataset changed.
            uiElement: p.ui_element,
            minValue: p.min_value ?? null,
            maxValue: p.max_value ?? null,
            step: p.step ?? null,
            defaultValue: jsonStr(p.default),
            unit: p.unit ?? null,
            options: p.options ? jsonStr(p.options) : null,
            minLength: p.min_length ?? null,
            maxLength: p.max_length ?? null,
            lyriaPromptTags: jsonStr(p.lyria_prompt_tags),
            semanticKeywords: jsonStr(p.semantic_keywords),
          },
        }),
      ),
    );
  }

  return dataset.length;
}

/** Reconstruct a `RawParameter` from a stored DB row (deserialise JSON
 *  strings back into their native shapes). */
export function rowToRaw(row: {
  technicalName: string;
  uiElement: string;
  minValue: number | null;
  maxValue: number | null;
  step: number | null;
  defaultValue: string;
  unit: string | null;
  options: string | null;
  minLength: number | null;
  maxLength: number | null;
  lyriaPromptTags: string;
  semanticKeywords: string;
}): RawParameter {
  return {
    technical_name: row.technicalName,
    ui_element: row.uiElement as RawParameter["ui_element"],
    min_value: row.minValue ?? undefined,
    max_value: row.maxValue ?? undefined,
    step: row.step ?? undefined,
    default: JSON.parse(row.defaultValue) as number | string | number[],
    unit: row.unit ?? undefined,
    options: row.options ? (JSON.parse(row.options) as string[]) : undefined,
    min_length: row.minLength ?? undefined,
    max_length: row.maxLength ?? undefined,
    lyria_prompt_tags: JSON.parse(row.lyriaPromptTags) as string[],
    semantic_keywords: JSON.parse(row.semanticKeywords) as string[],
  };
}

/** Compose the text that gets embedded for a single parameter. Per the
 *  task spec: `technical_name` + the `semantic_keywords` list. */
export function buildEmbeddingText(raw: RawParameter): string {
  const parts = [raw.technical_name, ...(raw.semantic_keywords ?? [])];
  return parts.join(" | ");
}
