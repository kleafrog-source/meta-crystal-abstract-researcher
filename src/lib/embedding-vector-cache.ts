import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "query-embedding-cache");
const CACHE_VERSION = "ollama-query-vector-v1";
const MAX_MEMORY_ENTRIES = 256;
const memory = new Map<string, number[]>();
const pending = new Map<string, Promise<number[]>>();

function cacheKey(namespace: string, input: string): string {
  return createHash("sha256").update(JSON.stringify([CACHE_VERSION, namespace, input])).digest("hex");
}

function remember(key: string, vector: number[]): void {
  memory.delete(key);
  memory.set(key, vector);
  if (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
}

async function readVector(key: string): Promise<number[] | null> {
  const inMemory = memory.get(key);
  if (inMemory) {
    remember(key, inMemory);
    return inMemory;
  }
  try {
    const payload = JSON.parse(await fs.readFile(path.join(CACHE_DIR, key + ".json"), "utf8")) as { version?: string; vector?: unknown };
    if (payload.version !== CACHE_VERSION || !Array.isArray(payload.vector) || payload.vector.length === 0 || !payload.vector.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    remember(key, payload.vector);
    return payload.vector;
  } catch {
    return null;
  }
}

async function writeVector(key: string, vector: number[]): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const destination = path.join(CACHE_DIR, key + ".json");
  const temporary = destination + "." + process.pid + "." + Math.random().toString(16).slice(2) + ".tmp";
  await fs.writeFile(temporary, JSON.stringify({ version: CACHE_VERSION, vector }), "utf8");
  await fs.rename(temporary, destination).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
    await fs.rm(destination, { force: true });
    await fs.rename(temporary, destination);
  });
}

/** Batches only cache misses; duplicate inputs share one inference and preserve output order. */
export async function cachedEmbeddingVectors(
  inputs: string[],
  namespace: string,
  compute: (missingInputs: string[]) => Promise<number[][]>,
): Promise<number[][]> {
  const keys = inputs.map((input) => cacheKey(namespace, input));
  const output: Array<number[] | undefined> = Array(inputs.length);
  const missing = new Map<string, { input: string; indexes: number[] }>();
  await Promise.all(keys.map(async (key, index) => {
    const vector = await readVector(key);
    if (vector) output[index] = vector;
    else {
      const entry = missing.get(key) ?? { input: inputs[index], indexes: [] };
      entry.indexes.push(index);
      missing.set(key, entry);
    }
  }));
  const freshKeys: string[] = [];
  const freshInputs: string[] = [];
  const waiting: Array<{ key: string; indexes: number[]; promise: Promise<number[]> }> = [];
  for (const [key, entry] of missing) {
    const existing = pending.get(key);
    if (existing) waiting.push({ key, indexes: entry.indexes, promise: existing });
    else { freshKeys.push(key); freshInputs.push(entry.input); }
  }
  if (freshInputs.length) {
    const promise = (async () => {
      const vectors = await compute(freshInputs);
      if (vectors.length !== freshKeys.length) throw new Error("Embedding batch size mismatch.");
      for (const vector of vectors) if (!vector.length || !vector.every(Number.isFinite)) throw new Error("Embedding response contains an invalid vector.");
      await Promise.all(freshKeys.map((key, index) => writeVector(key, vectors[index])));
      return vectors;
    })();
    freshKeys.forEach((key, index) => pending.set(key, promise.then((vectors) => vectors[index])));
    try {
      const vectors = await promise;
      for (const key of freshKeys) pending.delete(key);
      for (const [index, key] of keys.entries()) {
        const freshIndex = freshKeys.indexOf(key);
        if (freshIndex >= 0) output[index] = vectors[freshIndex];
      }
      vectors.forEach((vector, index) => remember(freshKeys[index], vector));
    } catch (error) {
      freshKeys.forEach((key) => pending.delete(key));
      throw error;
    }
  }
  await Promise.all(waiting.map(async ({ key, indexes, promise }) => {
    const vector = await promise;
    indexes.forEach((index) => { output[index] = vector; });
    remember(key, vector);
  }));
  return (output as number[][]).map((vector) => vector.slice());
}
