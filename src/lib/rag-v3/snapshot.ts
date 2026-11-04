import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  GENESIS_DATA_ROOT,
  readGenesisLibrary,
} from "@/lib/combinatorial-genesis/library";
import {
  excludedRegistrySha,
  readExcludedRegistry,
} from "@/lib/combinatorial-genesis/registry";

export interface V3SnapshotIdentity {
  dataset_version: string;
  parameter_count: number;
  excluded_count: number;
  excluded_sha256: string;
  content_sha256: string;
}

function lexical(
  [left]: [string, unknown],
  [right]: [string, unknown],
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function getV3SnapshotIdentity(): Promise<V3SnapshotIdentity> {
  const [latestRaw, library, registry, tombstonesRaw] = await Promise.all([
    fs.readFile(
      path.join(GENESIS_DATA_ROOT, "datasets", "latest.json"),
      "utf8",
    ),
    readGenesisLibrary(),
    readExcludedRegistry(),
    fs.readFile(path.join(GENESIS_DATA_ROOT, "library", "catalogue-deleted.json"), "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "[]" : Promise.reject(error)),
  ]);
  const latest = JSON.parse(latestRaw) as { version_id: string };
  const libraryPath = path.join(
    GENESIS_DATA_ROOT,
    "library",
    "parameters.json",
  );
  const libraryBuffer = await fs.readFile(libraryPath);
  const excluded = new Set(registry.entries.map((item) => item.technical_name));
  const tombstonePayload = JSON.parse(tombstonesRaw) as unknown;
  const tombstones = new Set(Array.isArray(tombstonePayload) ? tombstonePayload.filter((name): name is string => typeof name === "string") : tombstonePayload && typeof tombstonePayload === "object" && Array.isArray((tombstonePayload as { technical_names?: unknown }).technical_names) ? (tombstonePayload as { technical_names: unknown[] }).technical_names.filter((name): name is string => typeof name === "string") : []);
  const parameters = library
    .filter((item) => !excluded.has(String(item.technical_name)) && !tombstones.has(String(item.technical_name)))
    .sort((left, right) => String(left.technical_name).localeCompare(String(right.technical_name)))
    .map((item) => ({ ...item, source: "library" }));
  return {
    dataset_version: latest.version_id,
    parameter_count: parameters.length,
    excluded_count: registry.entries.length,
    excluded_sha256: excludedRegistrySha(registry),
    // Historical dataset_version remains metadata; only the published catalogue and tombstones define membership.
    content_sha256: createHash("sha256").update(Buffer.concat([libraryBuffer, Buffer.from([0]), Buffer.from(tombstonesRaw)])).digest("hex"),
  };
}
