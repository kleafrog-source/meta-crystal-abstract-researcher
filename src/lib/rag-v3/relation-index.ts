import { promises as fs } from "node:fs";
import path from "node:path";

const RELATIONS_DIR = path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "relations");

interface RelationRow {
  id: string;
  text: string;
  triggers: string[];
  params_a: string[];
  params_b: string[];
  direction_a: number;
  direction_b: number;
  row_index: number;
}

interface RelationManifest {
  created_at: string;
  model: string;
  dimensions: number;
  count: number;
  alpha_base: number;
  alpha_max: number;
  activation_threshold: number;
  vectors_file: string;
  relations: RelationRow[];
}

interface LoadedRelations {
  manifest: RelationManifest;
  vectors: Float32Array[];
}

export interface ActiveRelation extends RelationRow {
  confidence: number;
  alpha: number;
  concept_index: number;
}

let cached: LoadedRelations | null = null;

function normalize(vector: number[]): Float32Array {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return Float32Array.from(vector, (value) => value / (norm || 1));
}

function dot(left: Float32Array, right: Float32Array): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

async function loadRelations(): Promise<LoadedRelations | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(RELATIONS_DIR, "manifest.json"), "utf8")) as RelationManifest;
    if (cached?.manifest.created_at === manifest.created_at) return cached;
    const binary = await fs.readFile(path.join(RELATIONS_DIR, manifest.vectors_file));
    if (binary.readUInt32LE(0) !== manifest.count || binary.readUInt32LE(4) !== manifest.dimensions) {
      throw new Error("V3 relation index header mismatch.");
    }
    const vectors: Float32Array[] = [];
    let offset = 8;
    for (let row = 0; row < manifest.count; row += 1) {
      const vector = new Float32Array(manifest.dimensions);
      for (let column = 0; column < manifest.dimensions; column += 1) {
        vector[column] = binary.readFloatLE(offset);
        offset += 4;
      }
      vectors.push(vector);
    }
    cached = { manifest, vectors };
    return cached;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function matchRelations(queryText: string, queryVectors: number[][]): Promise<ActiveRelation[]> {
  const index = await loadRelations();
  if (!index || !queryVectors.length) return [];
  const normalizedQuery = queryText.toLowerCase();
  const queries = queryVectors.map(normalize);
  return index.manifest.relations.flatMap((relation) => {
    if (!relation.triggers.some((trigger) => normalizedQuery.includes(trigger.toLowerCase()))) return [];
    let confidence = Number.NEGATIVE_INFINITY;
    let conceptIndex = 0;
    for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
      const score = dot(queries[queryIndex], index.vectors[relation.row_index]);
      if (score > confidence) {
        confidence = score;
        conceptIndex = queryIndex;
      }
    }
    if (confidence < index.manifest.activation_threshold) return [];
    return [{
      ...relation,
      confidence,
      alpha: Math.min(index.manifest.alpha_max, index.manifest.alpha_base * confidence),
      concept_index: conceptIndex,
    }];
  }).sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
}
