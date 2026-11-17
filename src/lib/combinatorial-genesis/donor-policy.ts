import { promises as fs } from "node:fs";
import path from "node:path";

import { GENESIS_DATA_ROOT, readGenesisLibrary } from "./library";
import type { RuntimeParameterRecord } from "./runtime-index";
import { withCatalogueFileLock } from "./catalogue-persistence";

export type DonorRejectionReason =
  | "tombstoned"
  | "excluded"
  | "archived_source_disabled"
  | "unresolved";

export interface DonorPolicy {
  liveParameters: ReadonlyMap<string, RuntimeParameterRecord>;
  archivedParameters: ReadonlyMap<string, RuntimeParameterRecord>;
  tombstoneNames: ReadonlySet<string>;
  excludedNames: ReadonlySet<string>;
}

export interface DonorResolution {
  acceptedNames: string[];
  donors: RuntimeParameterRecord[];
  diagnostics: Array<{ technical_name: string; reason: DonorRejectionReason }>;
}

export interface DonorRestrictions {
  tombstoneNames: Set<string>;
  excludedNames: Set<string>;
}

export async function readEffectiveLiveCatalogue(dataRoot = GENESIS_DATA_ROOT) {
  return withCatalogueFileLock(async () => {
    const [parameters, restrictions] = await Promise.all([
      readGenesisLibrary(dataRoot),
      readDonorRestrictions(dataRoot),
    ]);
    return {
      parameters: parameters.filter((parameter) =>
        !restrictions.tombstoneNames.has(parameter.technical_name)
        && !restrictions.excludedNames.has(parameter.technical_name),
      ),
      ...restrictions,
    };
  }, dataRoot);
}

export type PublishNameConflict =
  | "live_duplicate"
  | "tombstoned"
  | "excluded"
  | "donor_tombstoned"
  | "donor_excluded"
  | "donor_archived_source_disabled"
  | "donor_unresolved"
  | "donor_list_invalid"
  | "source_tombstoned"
  | "source_excluded"
  | "source_archived_source_disabled"
  | "source_catalogue_stale"
  | "source_unresolved";

export function classifyPublishName(
  technicalName: string,
  state: {
    liveNames: ReadonlySet<string>;
    tombstoneNames: ReadonlySet<string>;
    excludedNames: ReadonlySet<string>;
  },
): PublishNameConflict[] {
  const conflicts: PublishNameConflict[] = [];
  if (state.liveNames.has(technicalName)) conflicts.push("live_duplicate");
  if (state.tombstoneNames.has(technicalName)) conflicts.push("tombstoned");
  if (state.excludedNames.has(technicalName)) conflicts.push("excluded");
  return conflicts;
}

export function createDonorPolicy(
  liveParameters: Iterable<RuntimeParameterRecord>,
  archivedParameters: Iterable<RuntimeParameterRecord>,
  restrictions: {
    tombstoneNames: ReadonlySet<string>;
    excludedNames: ReadonlySet<string>;
    /** Legacy callers may still pass this field; archived parameters are never eligible donors. */
    allowFrozenFallback?: boolean;
  },
): DonorPolicy {
  return {
    liveParameters: new Map(Array.from(liveParameters, (parameter) => [parameter.technical_name, parameter])),
    archivedParameters: new Map(Array.from(archivedParameters, (parameter) => [parameter.technical_name, parameter])),
    tombstoneNames: restrictions.tombstoneNames,
    excludedNames: restrictions.excludedNames,
  };
}

export function resolveDonorReferences(
  names: Iterable<string>,
  policy: DonorPolicy,
): DonorResolution {
  const acceptedNames: string[] = [];
  const donors: RuntimeParameterRecord[] = [];
  const diagnostics: DonorResolution["diagnostics"] = [];
  const seen = new Set<string>();

  for (const technicalName of names) {
    if (!technicalName || seen.has(technicalName)) continue;
    seen.add(technicalName);

    const rejection = donorReferenceRejection(technicalName, policy);
    if (rejection) {
      diagnostics.push({ technical_name: technicalName, reason: rejection });
      continue;
    }

    const live = policy.liveParameters.get(technicalName);
    if (live) {
      acceptedNames.push(technicalName);
      donors.push(live);
      continue;
    }

  }

  return { acceptedNames, donors, diagnostics };
}

export function donorReferenceRejection(
  technicalName: string,
  policy: DonorPolicy,
): DonorRejectionReason | null {
  if (policy.tombstoneNames.has(technicalName)) return "tombstoned";
  if (policy.excludedNames.has(technicalName)) return "excluded";
  if (policy.liveParameters.has(technicalName)) return null;
  if (policy.archivedParameters.has(technicalName)) return "archived_source_disabled";
  return "unresolved";
}

export function buildEligibleDonorMap(policy: DonorPolicy): Map<string, RuntimeParameterRecord> {
  const allNames = new Set([...policy.liveParameters.keys(), ...policy.archivedParameters.keys()]);
  const resolved = resolveDonorReferences(allNames, policy);
  return new Map(resolved.donors.map((parameter) => [parameter.technical_name, parameter]));
}

function namesFromTombstones(value: unknown): Set<string> {
  if (value === null) return new Set();
  const names = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { technical_names?: unknown }).technical_names)
      ? (value as { technical_names: unknown[] }).technical_names
      : null;
  if (!names) throw new Error("Malformed catalogue tombstone registry.");
  if (names.some((name) => typeof name !== "string" || !name)) {
    throw new Error("Malformed entry in catalogue tombstone registry.");
  }
  return new Set(names as string[]);
}

function namesFromExclusions(value: unknown): Set<string> {
  if (value === null) return new Set();
  const entries = value && typeof value === "object" && Array.isArray((value as { entries?: unknown }).entries)
    ? (value as { entries: unknown[] }).entries
    : null;
  if (!entries) throw new Error("Malformed parameter exclusion registry.");
  if (entries.some((entry) =>
    !entry || typeof entry !== "object" || typeof (entry as { technical_name?: unknown }).technical_name !== "string" ||
    !(entry as { technical_name: string }).technical_name,
  )) throw new Error("Malformed entry in parameter exclusion registry.");
  return new Set(entries.flatMap((entry) =>
    entry && typeof entry === "object" && typeof (entry as { technical_name?: unknown }).technical_name === "string"
      ? [(entry as { technical_name: string }).technical_name]
      : [],
  ));
}

async function readJsonIfPresent(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Reads current restrictions without creating or modifying any data files. */
export async function readDonorRestrictions(dataRoot = GENESIS_DATA_ROOT): Promise<DonorRestrictions> {
  const [tombstones, exclusions] = await Promise.all([
    readJsonIfPresent(path.join(dataRoot, "library", "catalogue-deleted.json")),
    readJsonIfPresent(path.join(dataRoot, "registry", "excluded.json")),
  ]);
  return {
    tombstoneNames: namesFromTombstones(tombstones),
    excludedNames: namesFromExclusions(exclusions),
  };
}
