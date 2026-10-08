import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  ensureGenesisLibrary,
  GENESIS_DATA_ROOT,
  GENESIS_LIBRARY_DIR,
  GENESIS_LIBRARY_MANIFEST_PATH,
  GENESIS_LIBRARY_PATH,
  readGenesisLibrary,
  readGenesisLibraryManifest,
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
  candidates: Array<{ candidate: Record<string, unknown>; publishable: boolean; errors: string[] }>;
}

function exportedParameter(candidate: Record<string, unknown>) {
  const name = String(candidate.technical_name);
  const inference = candidate.value_inference as Record<string, unknown>;
  const metadata = candidate.metadata as Record<string, unknown>;
  const uiElement = String(inference.ui_element);
  return {
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
    domain: "experimental_combinatorial_genesis",
    axes: [],
    quantity_kind: inference.quantity_kind,
    polarity_override: null,
    vibe_id: null,
    select_typing: uiElement === "Select" ? "nominal" : null,
    option_positions: null,
    option_aliases: null,
    genesis: {
      package_id: candidate.package_id,
      parent_parameters: candidate.parent_parameters,
      selection_score: candidate.selection_score,
    },
  };
}

function validateExports(parameters: Array<Record<string, unknown>>): string[] {
  return parameters.flatMap((parameter) => {
    const errors: string[] = [];
    if (!parameter.technical_name || !parameter.name_ru || !parameter.description_en || !parameter.description_ru || !parameter.category || !parameter.sub_category || !parameter.ui_element || parameter.default === undefined || !parameter.unit) {
      errors.push(`${parameter.technical_name}: missing required field`);
    }
    if (!Array.isArray(parameter.lyria_prompt_tags) || parameter.lyria_prompt_tags.length !== 3 || !Array.isArray(parameter.semantic_keywords) || parameter.semantic_keywords.length !== 7) {
      errors.push(`${parameter.technical_name}: missing lexical arrays`);
    }
    return errors;
  });
}

async function atomicWrite(filePath: string, value: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, value, "utf8");
  await fs.rename(temporaryPath, filePath);
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
    await ensureGenesisLibrary();
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

    const packagePath = path.join(GENESIS_DATA_ROOT, "drafts", `${packageId}.json`);
    const packageRecord = JSON.parse(await fs.readFile(packagePath, "utf8")) as PackageRecord;
    if (packageRecord.package_id !== packageId) throw new Error("Package identity mismatch.");

    const [libraryRaw, library, manifest] = await Promise.all([
      fs.readFile(GENESIS_LIBRARY_PATH, "utf8"),
      readGenesisLibrary(),
      readGenesisLibraryManifest(),
    ]);
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
    const existingNames = new Set(library.map((parameter) => String(parameter.technical_name)));
    const collisions = alreadyPublished ? [] : exports
      .map((item) => String(item.parameter.technical_name))
      .filter((name) => existingNames.has(name));
    const exportNames = exports.map((item) => String(item.parameter.technical_name));
    const duplicateExports = exportNames.filter((name, index) => exportNames.indexOf(name) !== index);
    const schemaErrors = validateExports(exports.map((item) => item.parameter));
    const additions = alreadyPublished ? [] : exports.map((item) => item.parameter);
    const simulated = [...library, ...additions];
    const ready = alreadyPublished || (
      additions.length > 0 && collisions.length === 0 && duplicateExports.length === 0 && schemaErrors.length === 0
    );
    const report = {
      schema_version: 2,
      package_id: packageId,
      generated_at: new Date().toISOString(),
      dry_run: body.dry_run,
      published: !body.dry_run && ready && !alreadyPublished,
      already_published: alreadyPublished,
      writes_to_library: !body.dry_run && ready && !alreadyPublished,
      writes_to_v2: false,
      library_path: GENESIS_LIBRARY_PATH,
      library_before_count: library.length,
      proposed_addition_count: additions.length,
      simulated_after_count: simulated.length,
      library_before_sha256: sha256(libraryRaw),
      simulated_after_sha256: sha256(JSON.stringify(simulated)),
      package_content_sha256: packageRecord.content_sha256,
      collisions,
      duplicate_exports: Array.from(new Set(duplicateExports)),
      schema_errors: schemaErrors,
      ready_for_library_publish: ready,
    };
    const exportDir = path.join(GENESIS_DATA_ROOT, "exports", packageId);
    await fs.mkdir(exportDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(exportDir, "parameters.json"), `${JSON.stringify(additions, null, 2)}\n`, "utf8"),
      fs.writeFile(path.join(exportDir, "provenance.json"), `${JSON.stringify(exports.map((item) => item.provenance), null, 2)}\n`, "utf8"),
      fs.writeFile(path.join(exportDir, "publish_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    ]);

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
      await atomicWrite(GENESIS_LIBRARY_PATH, `${JSON.stringify(simulated, null, 2)}\n`);
      await atomicWrite(GENESIS_LIBRARY_MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`);
    }

    return NextResponse.json({ ...report, export_dir: exportDir });
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
