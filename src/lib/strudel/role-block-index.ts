import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cosineSimilarity } from "./pattern-index";

export type StrudelRoleBlockIndexManifest = {
  rows: number;
  dimension: number;
  backend: string;
  model: string;
  files?: Record<string, string>;
};

export type StrudelRoleBlockEntry = {
  id: string;
  source_id?: string;
  source_file?: string;
  role: "drums" | "bass" | "harmony" | "melody" | "texture";
  block_type?: string;
  granularity?: string | null;
  estimated_bars?: number | null;
  energy?: number | null;
  density?: number | null;
  section_fit?: string[];
  style_tags?: string[];
  mood_tags?: string[];
  instrument_family?: string | null;
  tone_family?: string | null;
  scale_hint?: string | null;
  sample_patterns?: string[];
  note_patterns?: string[];
  struct_patterns?: string[];
  methods?: string[];
  renderable_code?: string | null;
  retrieval_text: string;
  vector: number[];
};

type RoleBlockPayload = {
  manifest: StrudelRoleBlockIndexManifest;
  entries: StrudelRoleBlockEntry[];
};

type CacheRecord = {
  key: string;
  payload: RoleBlockPayload | null;
};

let cachedPayload: CacheRecord | null = null;

function roleBlockIndexDir() {
  return join(process.cwd(), "src", "strudel-editor", "data", "datasets", "strudel_role_block_index");
}

export function getStrudelRoleBlockIndex(): RoleBlockPayload | null {
  const baseDir = roleBlockIndexDir();
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
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as StrudelRoleBlockIndexManifest;
    const entries = JSON.parse(readFileSync(metadataPath, "utf-8")) as StrudelRoleBlockEntry[];
    const payload = { manifest, entries };
    cachedPayload = { key: cacheKey, payload };
    return payload;
  } catch {
    cachedPayload = { key: "error", payload: null };
    return null;
  }
}

export function searchRoleBlockIndex(queryEmbedding: number[], options?: { topK?: number; role?: string; styleTag?: string }) {
  const payload = getStrudelRoleBlockIndex();
  if (!payload) {
    return [];
  }
  const { topK = 24, role, styleTag } = options ?? {};
  return payload.entries
    .filter((entry) => (role ? entry.role === role : true))
    .filter((entry) => (styleTag ? (entry.style_tags ?? []).includes(styleTag) : true))
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.vector),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
