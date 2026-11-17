import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { cleanPublishedParameter } from "@/lib/combinatorial-genesis/parameter-schema";
import {
  classifyPublishName,
  createDonorPolicy,
  readDonorRestrictions,
  resolveDonorReferences,
} from "@/lib/combinatorial-genesis/donor-policy";
import { withCatalogueLock } from "@/lib/am-parameters-catalogue/catalogue";
import { replaceCatalogueFiles } from "@/lib/combinatorial-genesis/catalogue-persistence";
import { activeRuntimeCorpusMatchesLive } from "@/lib/combinatorial-genesis/runtime-index";
import {
  ensureGenesisLibrary,
  GENESIS_DATA_ROOT,
  GENESIS_LIBRARY_DIR,
  GENESIS_LIBRARY_MANIFEST_PATH,
  GENESIS_LIBRARY_PATH,
  readGenesisLibrary,
  sha256,
  type GenesisLibraryManifest,
} from "@/lib/combinatorial-genesis/library";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PACKAGE_ID = /^cg-draft-[a-f0-9]{12}$/;

interface PublishRequest {
  package_id?: unknown;
  dry_run?: unknown;
}

interface PackageRecord {
  package_id: string;
  content_sha256: string;
  source?: {
    dataset_version?: string;
    catalogue_revision?: string;
    live_catalogue_verified?: boolean;
  };
  candidates: Array<{ candidate: Record<string, unknown>; publishable: boolean; errors: string[] }>;
}

function exportedParameter(candidate: Record<string, unknown>) {
  const name = String(candidate.technical_name);
  const inference = candidate.value_inference as Record<string, unknown>;
  const metadata = candidate.metadata as Record<string, unknown>;
  const uiElement = String(inference.ui_element);
  const domainByCategory: Record<string, string> = { synthesis: "sound", spectral_processing: "sound", dynamics: "sound", spatial_audio: "sound", rhythm_and_structure: "structure", language_and_phonetics: "metadata", provenance: "provenance", administrative: "administrative" };
  return cleanPublishedParameter({
    technical_name: name,
    name_ru: metadata.name_ru,
    description_en: metadata.description_en,
    description_ru: metadata.description_ru,
    category: metadata.category,
    sub_category: metadata.sub_category,
    ui_element: uiElement,
    ...(uiElement === "Range" ? {
      min_value: inference.min_value,
      max_value: inference.max_value,
      step: inference.step,
    } : {}),
    default: inference.default,
    unit: inference.unit,
    ...(uiElement === "Select" ? { options: inference.options } : {}),
    lyria_prompt_tags: metadata.lyria_prompt_tags,
    semantic_keywords: metadata.semantic_keywords,
    domain: domainByCategory[String(metadata.category)] ?? "sound",
    quantity_kind: inference.quantity_kind,
  });
}

function validateExports(parameters: Array<Record<string, unknown>>): string[] {
  return parameters.flatMap((parameter) => {
    const errors: string[] = [];
    if (!parameter.technical_name || !parameter.name_ru || !parameter.description_en || !parameter.description_ru || !parameter.category || !parameter.sub_category || !parameter.ui_element || parameter.default === undefined || !parameter.unit) {
      errors.push(`${parameter.technical_name}: missing required field`);
    }
    if (typeof parameter.quantity_kind !== "string" || !/^[a-z][a-z0-9_]*$/.test(parameter.quantity_kind)) {
      errors.push(`${parameter.technical_name}: quantity_kind must be a donor-derived snake_case value`);
    }
    if (!Array.isArray(parameter.lyria_prompt_tags) || parameter.lyria_prompt_tags.length !== 3 || !Array.isArray(parameter.semantic_keywords) || parameter.semantic_keywords.length !== 7) {
      errors.push(`${parameter.technical_name}: missing lexical arrays`);
    }
    return errors;
  });
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export async function POST(request: Request) {
  let body: PublishRequest;
  try {
    body = await request.json() as PublishRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.dry_run !== "boolean") {
    return NextResponse.json({ error: "dry_run must be true or false." }, { status: 400 });
  }
  const packageId = typeof body.package_id === "string" ? body.package_id : "";
  if (!PACKAGE_ID.test(packageId)) {
    return NextResponse.json({ error: "Invalid package_id." }, { status: 400 });
  }

  let lock: fs.FileHandle | null = null;
  const lockPath = path.join(GENESIS_LIBRARY_DIR, ".publish.lock");
  try {
    if (!body.dry_run) {
      try {
        lock = await fs.open(lockPath, "wx");
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code === "EEXIST") {
          return NextResponse.json({ error: "Another library publish is already running." }, { status: 409 });
        }
        throw error;
      }
    }

    return await withCatalogueLock(async () => {
      await ensureGenesisLibrary();
      const packagePath = path.join(GENESIS_DATA_ROOT, "drafts", `${packageId}.json`);
      const packageRecord = JSON.parse(await fs.readFile(packagePath, "utf8")) as PackageRecord;
      if (packageRecord.package_id !== packageId) throw new Error("Package identity mismatch.");

      const [libraryRaw, library, manifestRaw, latestRaw, restrictions] = await Promise.all([
        fs.readFile(GENESIS_LIBRARY_PATH, "utf8"),
        readGenesisLibrary(),
        fs.readFile(GENESIS_LIBRARY_MANIFEST_PATH, "utf8"),
        fs.readFile(path.join(GENESIS_DATA_ROOT, "datasets", "latest.json"), "utf8"),
        readDonorRestrictions(),
      ]);
      const manifest = JSON.parse(manifestRaw) as GenesisLibraryManifest;
      const latest = JSON.parse(latestRaw) as { version_id: string };
      const activeManifest = JSON.parse(await fs.readFile(
        path.join(GENESIS_DATA_ROOT, "datasets", latest.version_id, "manifest.json"), "utf8",
      )) as { source_revision?: string };
      if (
        packageRecord.source?.dataset_version !== latest.version_id ||
        packageRecord.source.live_catalogue_verified !== true ||
        !activeManifest.source_revision ||
        packageRecord.source.catalogue_revision !== activeManifest.source_revision
      ) {
        return NextResponse.json({ error: "This draft does not come from the currently active live-catalogue corpus; recheck it after a current candidate is explicitly activated." }, { status: 409 });
      }
      const activeCorpusCurrent = await activeRuntimeCorpusMatchesLive();
      const alreadyPublished = manifest.published_package_ids.includes(packageId);
      const accepted = packageRecord.candidates.filter((item) => item.publishable && item.errors.length === 0);
      const exports = accepted.map((item) => ({
        parameter: exportedParameter({ ...item.candidate, package_id: packageId }),
        provenance: {
          package_id: packageId,
          parent_parameters: item.candidate.parent_parameters,
          query_similarity: item.candidate.query_similarity,
          selection_score: item.candidate.selection_score,
          value_inference: item.candidate.value_inference,
        },
      }));
      const liveNames = new Set(library.map((parameter) => String(parameter.technical_name)));
      const donorPolicy = createDonorPolicy(library, [], {
        ...restrictions,
      });
      const nameConflicts = alreadyPublished ? [] : exports.flatMap((item) => {
        const technicalName = String(item.parameter.technical_name);
        return classifyPublishName(technicalName, {
          liveNames,
          tombstoneNames: restrictions.tombstoneNames,
          excludedNames: restrictions.excludedNames,
        }).map((reason) => ({ technical_name: technicalName, reason }));
      });
      if (!alreadyPublished && !activeCorpusCurrent) {
        nameConflicts.push({ technical_name: "__catalogue__", reason: "source_catalogue_stale" });
      }
      if (!alreadyPublished) {
        for (const item of accepted) {
          const inference = item.candidate.value_inference as Record<string, unknown> | undefined;
          const donorNames = Array.isArray(inference?.donor_parameters)
            ? Array.from(new Set(inference.donor_parameters.filter((name): name is string => typeof name === "string")))
            : [];
          const sourceNames = Array.isArray(item.candidate.parent_parameters)
            ? Array.from(new Set(item.candidate.parent_parameters.filter((name): name is string => typeof name === "string")))
            : [];
          if (inference?.status === "auto_resolved" && donorNames.length < 2) {
            nameConflicts.push({ technical_name: String(item.candidate.technical_name ?? ""), reason: "donor_list_invalid" });
          }
          const resolution = resolveDonorReferences([...sourceNames, ...donorNames], donorPolicy);
          for (const diagnostic of resolution.diagnostics) {
            const prefix = sourceNames.includes(diagnostic.technical_name) ? "source" : "donor";
            nameConflicts.push({
              technical_name: diagnostic.technical_name,
              reason: `${prefix}_${diagnostic.reason}` as typeof nameConflicts[number]["reason"],
            });
          }
        }
      }
      const collisions = nameConflicts.filter((item) => item.reason === "live_duplicate").map((item) => item.technical_name);
      const exportNames = exports.map((item) => String(item.parameter.technical_name));
      const duplicateExports = exportNames.filter((name, index) => exportNames.indexOf(name) !== index);
      const schemaErrors = validateExports(exports.map((item) => item.parameter));
      const additions = alreadyPublished ? [] : exports.map((item) => item.parameter);
      const simulated = [...library, ...additions];
      const ready = alreadyPublished || (
        additions.length > 0 && nameConflicts.length === 0 && duplicateExports.length === 0 && schemaErrors.length === 0
      );
      const report = {
        schema_version: 2,
        package_id: packageId,
        generated_at: new Date().toISOString(),
        dry_run: body.dry_run,
        published: !body.dry_run && ready && !alreadyPublished,
        already_published: alreadyPublished,
        writes_to_library: !body.dry_run && ready && !alreadyPublished,
        library_path: GENESIS_LIBRARY_PATH,
        library_before_count: library.length,
        proposed_addition_count: additions.length,
        simulated_after_count: simulated.length,
        library_before_sha256: sha256(libraryRaw),
        simulated_after_sha256: sha256(JSON.stringify(simulated)),
        package_content_sha256: packageRecord.content_sha256,
        collisions,
        name_conflicts: nameConflicts,
        duplicate_exports: Array.from(new Set(duplicateExports)),
        schema_errors: schemaErrors,
        ready_for_library_publish: ready,
      };
      if (!body.dry_run && ready && !alreadyPublished) {
        const [currentLibraryRaw, currentManifestRaw, currentLatestRaw, currentRestrictions] = await Promise.all([
          fs.readFile(GENESIS_LIBRARY_PATH, "utf8"),
          fs.readFile(GENESIS_LIBRARY_MANIFEST_PATH, "utf8"),
          fs.readFile(path.join(GENESIS_DATA_ROOT, "datasets", "latest.json"), "utf8"),
          readDonorRestrictions(),
        ]);
        const currentLatest = JSON.parse(currentLatestRaw) as { version_id: string };
        if (
          sha256(currentLibraryRaw) !== sha256(libraryRaw) ||
          sha256(currentManifestRaw) !== sha256(manifestRaw) ||
          currentLatest.version_id !== latest.version_id ||
          !sameSet(currentRestrictions.tombstoneNames, restrictions.tombstoneNames) ||
          !sameSet(currentRestrictions.excludedNames, restrictions.excludedNames)
        ) {
          return NextResponse.json({ error: "Catalogue or donor policy changed during publish validation. Recheck this draft." }, { status: 409 });
        }
      }
      const exportDir = path.join(GENESIS_DATA_ROOT, "exports", packageId);
      if (body.dry_run || ready) {
        await fs.mkdir(exportDir, { recursive: true });
        await Promise.all([
          fs.writeFile(path.join(exportDir, "parameters.json"), `${JSON.stringify(additions, null, 2)}\n`, "utf8"),
          fs.writeFile(path.join(exportDir, "provenance.json"), `${JSON.stringify(exports.map((item) => item.provenance), null, 2)}\n`, "utf8"),
          fs.writeFile(path.join(exportDir, "publish_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
        ]);
      }

      if (!body.dry_run && ready && !alreadyPublished) {
        const historyDir = path.join(GENESIS_LIBRARY_DIR, "history");
        await fs.mkdir(historyDir, { recursive: true });
        const historyPrefix = `${Date.now()}-${packageId}`;
        await Promise.all([
          fs.copyFile(GENESIS_LIBRARY_PATH, path.join(historyDir, `${historyPrefix}-parameters.json`)),
          fs.copyFile(GENESIS_LIBRARY_MANIFEST_PATH, path.join(historyDir, `${historyPrefix}-manifest.json`)),
        ]);
        const updatedManifest: GenesisLibraryManifest = {
          ...manifest,
          updated_at: new Date().toISOString(),
          parameter_count: simulated.length,
          published_package_ids: [...manifest.published_package_ids, packageId],
        };
        await replaceCatalogueFiles({
          "library/parameters.json": `${JSON.stringify(simulated, null, 2)}\n`,
          "library/manifest.json": `${JSON.stringify(updatedManifest, null, 2)}\n`,
        });
      }

      return NextResponse.json({ ...report, export_dir: body.dry_run || ready ? exportDir : null });
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return NextResponse.json(
      { error: code === "ENOENT" ? "Candidate package was not found." : error instanceof Error ? error.message : String(error) },
      { status: code === "ENOENT" ? 404 : 500 },
    );
  } finally {
    if (lock) {
      await lock.close();
      await fs.rm(lockPath, { force: true });
    }
  }
}
