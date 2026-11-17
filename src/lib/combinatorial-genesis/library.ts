import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { updateCatalogueFiles } from "./catalogue-persistence";
import type { CatalogueUpdate } from "./catalogue-persistence";

import type { RuntimeParameterRecord } from "./runtime-index";

export const GENESIS_DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
export const GENESIS_LIBRARY_DIR = path.join(GENESIS_DATA_ROOT, "library");
export const GENESIS_LIBRARY_PATH = path.join(GENESIS_LIBRARY_DIR, "parameters.json");
export const GENESIS_LIBRARY_MANIFEST_PATH = path.join(GENESIS_LIBRARY_DIR, "manifest.json");

export interface GenesisLibraryManifest {
  schema_version: number;
  created_at: string;
  updated_at: string;
  base_sha256: string;
  parameter_count: number;
  published_package_ids: string[];
  source: "autonomous_v2_snapshot";
}

export interface GenesisLibraryParameter extends RuntimeParameterRecord {
  [key: string]: unknown;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function ensureGenesisLibrary(dataRoot = GENESIS_DATA_ROOT): Promise<void> {
  try {
    await fs.access(path.join(dataRoot, "library", "parameters.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Published live catalogue is unavailable; archived reference data is not used as a runtime fallback.");
    }
    throw error;
  }
}

export async function readGenesisLibrary(dataRoot = GENESIS_DATA_ROOT): Promise<GenesisLibraryParameter[]> {
  try {
    return await updateCatalogueFiles<GenesisLibraryParameter[]>(async (read): Promise<CatalogueUpdate<GenesisLibraryParameter[]>> => ({
      writes: {},
      result: JSON.parse(await read("library/parameters.json")) as GenesisLibraryParameter[],
    }), dataRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Published live catalogue is unavailable; archived reference data is not used as a runtime fallback.");
    }
    throw error;
  }
}

export async function readGenesisLibraryManifest(): Promise<GenesisLibraryManifest> {
  await ensureGenesisLibrary();
  return updateCatalogueFiles(async (read) => ({
    writes: {},
    result: JSON.parse(await read("library/manifest.json")) as GenesisLibraryManifest,
  }));
}
