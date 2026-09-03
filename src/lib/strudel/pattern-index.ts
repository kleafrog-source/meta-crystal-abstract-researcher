import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type StrudelPatternIndexManifest = {
  rows: number;
  dimension: number;
  backend: string;
  model: string;
  npy_status?: string;
  neighbors_status?: string;
  files?: Record<string, string>;
};

export type StrudelPatternIndexEntry = {
  id: string;
  source_file: string;
  target: string;
  role: string | null;
  granularity: string | null;
  line_start: number | null;
  line_end?: number | null;
  label?: string | null;
  expression?: string | null;
  template_expression?: string | null;
  template_slots?: string[];
  sample_patterns?: string[];
  note_patterns?: string[];
  struct_patterns?: string[];
  methods?: string[];
  transport_methods?: string[];
  tempo_markers?: string[];
  has_slots?: boolean;
  estimated_bars?: number | null;
  density_score?: number | null;
  intensity_score?: number | null;
  mood_tags?: string[];
  section_fit?: string[];
  tone_family?: string | null;
  instrument_family?: string | null;
  unresolved_identifiers?: string[];
  self_contained_score?: number | null;
  retrieval_text?: string;
  vector: number[];
};

type PatternIndexPayload = {
  manifest: StrudelPatternIndexManifest;
  entries: StrudelPatternIndexEntry[];
};

type CacheRecord = {
  key: string;
  payload: PatternIndexPayload | null;
};

let cachedPayload: CacheRecord | null = null;

function patternIndexDir() {
  return join(process.cwd(), "src", "strudel-editor", "data", "datasets", "strudel_pattern_index");
}

export function getStrudelPatternIndex(): PatternIndexPayload | null {
  const baseDir = patternIndexDir();
  const manifestPath = join(baseDir, "manifest.json");
  const metadataPath = join(baseDir, "metadata.json");
  if (!existsSync(manifestPath) || !existsSync(metadataPath)) {
    cachedPayload = { key: "missing", payload: null };
    return null;
  }

  try {
    const cacheKey = `${statSync(manifestPath).mtimeMs}:${statSync(metadataPath).mtimeMs}`;
    if (cachedPayload?.key === cacheKey) {
      return cachedPayload.payload;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as StrudelPatternIndexManifest;
    const entries = JSON.parse(readFileSync(metadataPath, "utf-8")) as StrudelPatternIndexEntry[];
    const payload = { manifest, entries };
    cachedPayload = { key: cacheKey, payload };
    return payload;
  } catch {
    cachedPayload = { key: "error", payload: null };
    return null;
  }
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let magLeft = 0;
  let magRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    dot += a * b;
    magLeft += a * a;
    magRight += b * b;
  }
  if (magLeft === 0 || magRight === 0) {
    return 0;
  }
  return dot / (Math.sqrt(magLeft) * Math.sqrt(magRight));
}

export function searchStrudelPatternIndex(queryEmbedding: number[], topK: number) {
  const payload = getStrudelPatternIndex();
  if (!payload) {
    return [];
  }

  return payload.entries
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.vector),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
