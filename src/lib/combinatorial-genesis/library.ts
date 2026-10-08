import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { RuntimeParameterRecord } from "./runtime-index";

export const GENESIS_DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
export const GENESIS_REFERENCE_PATH = path.join(
  GENESIS_DATA_ROOT,
  "reference",
  "base_parameters.json",
);
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

export async function ensureGenesisLibrary(): Promise<void> {
  await fs.mkdir(GENESIS_LIBRARY_DIR, { recursive: true });
  try {
    await fs.access(GENESIS_LIBRARY_PATH);
  } catch {
    const raw = await fs.readFile(GENESIS_REFERENCE_PATH, "utf8");
    const parameters = JSON.parse(raw) as unknown[];
    const now = new Date().toISOString();
    const manifest: GenesisLibraryManifest = {
      schema_version: 1,
      created_at: now,
      updated_at: now,
      base_sha256: sha256(raw),
      parameter_count: parameters.length,
      published_package_ids: [],
      source: "autonomous_v2_snapshot",
    };
    await Promise.all([
      fs.writeFile(GENESIS_LIBRARY_PATH, raw.endsWith("\n") ? raw : `${raw}\n`, "utf8"),
      fs.writeFile(GENESIS_LIBRARY_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    ]);
  }
}

export async function readGenesisLibrary(): Promise<GenesisLibraryParameter[]> {
  await ensureGenesisLibrary();
  return JSON.parse(await fs.readFile(GENESIS_LIBRARY_PATH, "utf8")) as GenesisLibraryParameter[];
}

export async function readGenesisLibraryManifest(): Promise<GenesisLibraryManifest> {
  await ensureGenesisLibrary();
  return JSON.parse(
    await fs.readFile(GENESIS_LIBRARY_MANIFEST_PATH, "utf8"),
  ) as GenesisLibraryManifest;
}
