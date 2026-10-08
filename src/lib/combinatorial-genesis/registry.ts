import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { GENESIS_DATA_ROOT } from "./library";

export interface ExcludedParameterEntry {
  technical_name: string;
  excluded_at: string;
  excluded_by: "user" | string;
  reason: string;
  scope: string;
}

export interface ExcludedParameterRegistry {
  version: 1;
  updated_at: string;
  entries: ExcludedParameterEntry[];
}

export const GENESIS_REGISTRY_DIR = path.join(GENESIS_DATA_ROOT, "registry");
export const GENESIS_EXCLUDED_PATH = path.join(GENESIS_REGISTRY_DIR, "excluded.json");

function emptyRegistry(): ExcludedParameterRegistry {
  return { version: 1, updated_at: new Date().toISOString(), entries: [] };
}

export async function readExcludedRegistry(): Promise<ExcludedParameterRegistry> {
  await fs.mkdir(GENESIS_REGISTRY_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(GENESIS_EXCLUDED_PATH, "utf8")) as Partial<ExcludedParameterRegistry>;
    const unique = new Map<string, ExcludedParameterEntry>();
    for (const entry of parsed.entries ?? []) {
      if (entry?.technical_name) unique.set(entry.technical_name, entry);
    }
    return {
      version: 1,
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date(0).toISOString(),
      entries: [...unique.values()].sort((left, right) => left.technical_name.localeCompare(right.technical_name)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const registry = emptyRegistry();
    await writeExcludedRegistry(registry);
    return registry;
  }
}

export function excludedRegistrySha(registry: ExcludedParameterRegistry): string {
  return createHash("sha256")
    .update(JSON.stringify(registry.entries.map((entry) => entry.technical_name).sort()), "utf8")
    .digest("hex");
}

async function writeExcludedRegistry(registry: ExcludedParameterRegistry): Promise<void> {
  await fs.mkdir(GENESIS_REGISTRY_DIR, { recursive: true });
  const temporary = `${GENESIS_EXCLUDED_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await fs.rename(temporary, GENESIS_EXCLUDED_PATH);
}

export async function excludeParameters(entries: Array<Pick<ExcludedParameterEntry, "technical_name" | "reason" | "scope">>): Promise<ExcludedParameterRegistry> {
  const registry = await readExcludedRegistry();
  const byName = new Map(registry.entries.map((entry) => [entry.technical_name, entry]));
  const now = new Date().toISOString();
  for (const entry of entries) {
    const technicalName = entry.technical_name.trim();
    if (!technicalName || byName.has(technicalName)) continue;
    byName.set(technicalName, {
      technical_name: technicalName,
      excluded_at: now,
      excluded_by: "user",
      reason: entry.reason.trim() || "excluded by user",
      scope: entry.scope.trim() || "sound",
    });
  }
  const next: ExcludedParameterRegistry = {
    version: 1,
    updated_at: now,
    entries: [...byName.values()].sort((left, right) => left.technical_name.localeCompare(right.technical_name)),
  };
  await writeExcludedRegistry(next);
  return next;
}

export async function restoreParameters(technicalNames: string[]): Promise<ExcludedParameterRegistry> {
  const registry = await readExcludedRegistry();
  const restored = new Set(technicalNames);
  const next: ExcludedParameterRegistry = {
    version: 1,
    updated_at: new Date().toISOString(),
    entries: registry.entries.filter((entry) => !restored.has(entry.technical_name)),
  };
  await writeExcludedRegistry(next);
  return next;
}
