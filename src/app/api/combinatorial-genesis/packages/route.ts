import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
const TECHNICAL_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

interface PackageCandidate {
  technical_name?: unknown;
  parent_parameters?: unknown;
  query_similarity?: unknown;
  selection_score?: unknown;
  value_inference?: unknown;
  metadata?: unknown;
}

interface PackageRequest {
  dataset_version?: unknown;
  embedding_model?: unknown;
  query?: unknown;
  macro?: unknown;
  seed?: unknown;
  candidates?: unknown;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateInference(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["value_inference must be an object"];
  const inference = value as Record<string, unknown>;
  const errors: string[] = [];
  if (inference.status !== "auto_resolved" && inference.status !== "needs_review") errors.push("invalid inference status");
  if (typeof inference.confidence !== "number" || !Number.isFinite(inference.confidence)) errors.push("invalid confidence");
  if (typeof inference.ui_element !== "string") errors.push("missing ui_element");
  if (typeof inference.unit !== "string") errors.push("missing unit");
  if (inference.status !== "auto_resolved") return errors;
  if (inference.ui_element === "Range") {
    const min = inference.min_value;
    const max = inference.max_value;
    const step = inference.step;
    const defaultValue = inference.default;
    if (![min, max, step, defaultValue].every((item) => typeof item === "number" && Number.isFinite(item))) {
      errors.push("Range requires finite min/max/step/default");
    } else if ((min as number) >= (max as number) || (step as number) <= 0 ||
      (defaultValue as number) < (min as number) || (defaultValue as number) > (max as number)) {
      errors.push("Range bounds/default/step are inconsistent");
    }
  } else if (inference.ui_element === "Select") {
    if (!Array.isArray(inference.options) || !inference.options.includes(inference.default)) {
      errors.push("Select requires options containing default");
    }
  }
  return errors;
}

function validateMetadata(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["metadata must be an object"];
  const metadata = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of ["name_ru", "description_en", "description_ru", "category", "sub_category"] as const) {
    if (typeof metadata[field] !== "string" || !metadata[field].trim()) errors.push(`metadata.${field} is required`);
  }
  if (String(metadata.name_ru ?? "").length > 120 || String(metadata.description_en ?? "").length > 360 || String(metadata.description_ru ?? "").length > 420) errors.push("metadata text exceeds the length limit");
  if (!Array.isArray(metadata.lyria_prompt_tags) || metadata.lyria_prompt_tags.length !== 3 || metadata.lyria_prompt_tags.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push("metadata.lyria_prompt_tags must contain exactly 3 strings");
  }
  if (!Array.isArray(metadata.semantic_keywords) || metadata.semantic_keywords.length !== 7 || metadata.semantic_keywords.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push("metadata.semantic_keywords must contain exactly 7 strings");
  } else if (metadata.semantic_keywords.slice(0, 3).some((item) => !/[А-Яа-яЁё]/.test(String(item))) || metadata.semantic_keywords.slice(3).some((item) => /[А-Яа-яЁё]/.test(String(item)))) {
    errors.push("metadata.semantic_keywords must contain 3 Russian strings followed by 4 English strings");
  }
  if (metadata.review_status !== "approved") errors.push("metadata requires manual approval");
  return errors;
}

export async function POST(request: Request) {
  let body: PackageRequest;
  try {
    body = await request.json() as PackageRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const candidates = Array.isArray(body.candidates) ? body.candidates as PackageCandidate[] : [];
  if (candidates.length === 0 || candidates.length > 50) {
    return NextResponse.json({ error: "Provide between 1 and 50 preview candidates." }, { status: 400 });
  }

  try {
    const latest = JSON.parse(
      await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8"),
    ) as { version_id: string };
    if (body.dataset_version !== latest.version_id) {
      return NextResponse.json({ error: "Preview dataset version is not the latest frozen version." }, { status: 409 });
    }
    const frozen = JSON.parse(
      await fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "parameters.json"), "utf8"),
    ) as Array<{ technical_name?: string }>;
    const library = await readGenesisLibrary();
    const knownNames = new Set([
      ...library.map((parameter) => parameter.technical_name),
      ...frozen.flatMap((parameter) => parameter.technical_name ? [parameter.technical_name] : []),
    ]);
    const seen = new Set<string>();
    const validated = candidates.map((candidate, index) => {
      const name = typeof candidate.technical_name === "string" ? candidate.technical_name : "";
      const errors: string[] = [];
      if (!TECHNICAL_NAME.test(name)) errors.push("invalid technical_name");
      if (seen.has(name)) errors.push("duplicate inside package");
      if (knownNames.has(name)) errors.push("already exists in the autonomous library or frozen dataset");
      seen.add(name);
      errors.push(...validateInference(candidate.value_inference));
      errors.push(...validateMetadata(candidate.metadata));
      const inference = candidate.value_inference as Record<string, unknown> | undefined;
      const publishable = errors.length === 0 && inference?.status === "auto_resolved";
      return { index, candidate, publishable, errors };
    });

    const immutableContent = {
      dataset_version: latest.version_id,
      embedding_model: body.embedding_model,
      query: body.query,
      macro: body.macro,
      seed: body.seed,
      candidates,
    };
    const contentSha256 = createHash("sha256").update(stableJson(immutableContent), "utf8").digest("hex");
    const packageId = `cg-draft-${contentSha256.slice(0, 12)}`;
    const packageRecord = {
      schema_version: 1,
      package_id: packageId,
      created_at: new Date().toISOString(),
      content_sha256: contentSha256,
      publish_status: "autonomous_library_publishable",
      writes_to_v2: false,
      source: {
        dataset_version: latest.version_id,
        embedding_model: body.embedding_model,
        query: body.query,
        macro: body.macro,
        seed: body.seed,
      },
      summary: {
        candidate_count: candidates.length,
        publishable_count: validated.filter((item) => item.publishable).length,
        needs_review_count: validated.filter((item) => !item.publishable).length,
        stop_list_conflict_count: validated.filter((item) => item.errors.some((error) => error.includes("already exists"))).length,
        schema_error_count: validated.filter((item) => item.errors.length > 0).length,
      },
      candidates: validated,
    };
    const draftsDir = path.join(DATA_ROOT, "drafts");
    const packagePath = path.join(draftsDir, `${packageId}.json`);
    await fs.mkdir(draftsDir, { recursive: true });
    let created = false;
    let responseRecord = packageRecord;
    try {
      await fs.writeFile(packagePath, `${JSON.stringify(packageRecord, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      created = true;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      responseRecord = JSON.parse(await fs.readFile(packagePath, "utf8")) as typeof packageRecord;
    }
    await fs.writeFile(
      path.join(draftsDir, "latest.json"),
      `${JSON.stringify({ package_id: packageId, path: packagePath, updated_at: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
    return NextResponse.json({ created, package_path: packagePath, ...responseRecord });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
