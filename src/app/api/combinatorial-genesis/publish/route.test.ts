import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const versionId = "cg-v1-abcdef123456";
const ids = { a: "live_depth_a", b: "live_depth_b", frozen: "frozen_depth" };
const root = path.join(os.tmpdir(), `cg-publish-route-${process.pid}-${Date.now()}`);
const oldCwd = process.cwd();
let catalogueSourceRevision = "";
let post: (request: Request) => Promise<Response>;
let createPackage: (request: Request) => Promise<Response>;

function parameter(technical_name: string) {
  return {
    technical_name,
    ui_element: "Range",
    unit: "ms",
    min_value: 0,
    max_value: 10,
    step: 1,
    default: 5,
    quantity_kind: "duration",
  };
}

function makePackage(packageId: string, candidateName = "spectral_harmonic_depth") {
  const candidate = {
    technical_name: candidateName,
    parent_parameters: [ids.a, ids.b],
    query_similarity: 0.9,
    selection_score: 1,
    value_inference: {
      status: "auto_resolved",
      quantity_kind: "duration",
      ui_element: "Range",
      unit: "ms",
      min_value: 0,
      max_value: 10,
      step: 1,
      default: 5,
      donor_parameters: [ids.a, ids.b],
    },
    metadata: {
      name_ru: "Тестовая глубина",
      description_en: "Fixture parameter",
      description_ru: "Параметр fixture",
      category: "synthesis",
      sub_category: "fixture",
      lyria_prompt_tags: ["spectral", "harmonic", "depth"],
      semantic_keywords: ["spectral", "harmonic", "depth", "fixture", "test", "duration", "parameter"],
    },
  };
  return {
    package_id: packageId,
    content_sha256: "fixture-hash",
    source: {
      dataset_version: versionId,
      catalogue_revision: catalogueSourceRevision,
      live_catalogue_verified: true,
    },
    candidates: [{ candidate, publishable: true, errors: [] }],
  };
}

function previewCandidate(quantityKind: string | undefined) {
  const value_inference = {
    status: "auto_resolved",
    confidence: 0.9,
    ...(quantityKind ? { quantity_kind: quantityKind } : {}),
    ui_element: "Range",
    unit: "ms",
    min_value: 0,
    max_value: 10,
    step: 1,
    default: 5,
    donor_parameters: [ids.a, ids.b],
  };
  return {
    technical_name: "spectral_harmonic_depth",
    parent_parameters: [ids.a, ids.b],
    query_similarity: 0.8,
    selection_score: 0.9,
    value_inference,
    metadata: {
      name_ru: "Тестовая глубина",
      description_en: "Fixture parameter",
      description_ru: "Параметр fixture",
      category: "synthesis",
      sub_category: "fixture",
      lyria_prompt_tags: ["spectral", "harmonic", "depth"],
      semantic_keywords: ["спектральный", "гармонический", "глубина", "spectral", "harmonic", "depth", "fixture"],
      review_status: "approved",
    },
  };
}

async function postPreviewCandidate(candidate: ReturnType<typeof previewCandidate>) {
  return createPackage(new Request("http://fixture/api/combinatorial-genesis/packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      dataset_version: versionId,
      embedding_model: "fixture-model",
      query: "fixture query",
      macro: "fixture",
      seed: 1,
      candidates: [candidate],
    }),
  }));
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function seedCatalogue() {
  const libraryPath = "data/combinatorial-genesis/library/parameters.json";
  await writeJson(libraryPath, [parameter(ids.a), parameter(ids.b)]);
  const libraryBytes = await fs.readFile(libraryPath);
  const tombstonesBytes = Buffer.from("[]");
  const registrySha = createHash("sha256").update("[]").digest("hex");
  catalogueSourceRevision = createHash("sha256").update([
    createHash("sha256").update(libraryBytes).digest("hex"),
    createHash("sha256").update(tombstonesBytes).digest("hex"),
    registrySha,
  ].join("\0")).digest("hex");
  await writeJson("data/combinatorial-genesis/library/manifest.json", {
    schema_version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    base_sha256: "fixture",
    parameter_count: 2,
    published_package_ids: [],
    source: "autonomous_v2_snapshot",
  });
  await writeJson("data/combinatorial-genesis/datasets/latest.json", { version_id: versionId });
  await writeJson(`data/combinatorial-genesis/datasets/${versionId}/manifest.json`, {
    version_id: versionId,
    source_revision: catalogueSourceRevision,
    parameter_count: 2,
  });
  await writeJson(`data/combinatorial-genesis/datasets/${versionId}/parameters.json`, [parameter(ids.frozen)]);
}

async function publish(packageId: string) {
  return post(new Request("http://fixture/api/combinatorial-genesis/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ package_id: packageId, dry_run: false }),
  }));
}

describe("publish route rechecks current donor and candidate policy", () => {
  beforeAll(async () => {
    await fs.mkdir(root, { recursive: true });
    process.chdir(root);
    await seedCatalogue();
    const route = await import("./route");
    post = route.POST;
    const packageRoute = await import("../packages/route");
    createPackage = packageRoute.POST;
  });

  afterAll(async () => {
    process.chdir(oldCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("publishes a valid package fixture", async () => {
    const packageId = "cg-draft-000000000001";
    await writeJson(`data/combinatorial-genesis/drafts/${packageId}.json`, makePackage(packageId));
    const response = await publish(packageId);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.published).toBe(true);
    expect(body.name_conflicts).toEqual([]);
    expect(JSON.parse(await fs.readFile("data/combinatorial-genesis/library/parameters.json", "utf8")))
      .toHaveLength(3);
  });

  it("accepts eligible package candidates and rejects auto-resolved candidates without quantity_kind", async () => {
    await seedCatalogue();
    const acceptedResponse = await postPreviewCandidate(previewCandidate("duration"));
    const accepted = await acceptedResponse.json();
    expect(acceptedResponse.status).toBe(200);
    expect(accepted.summary.publishable_count).toBe(1);

    const missingQkResponse = await postPreviewCandidate(previewCandidate(undefined));
    const missingQk = await missingQkResponse.json();
    expect(missingQk.summary.publishable_count).toBe(0);
    expect(missingQk.candidates[0].errors).toContain(
      "auto-resolved inference requires a snake_case quantity_kind carried from its donors",
    );
  });

  it.each([
    ["tombstone", "source_tombstoned", async () => writeJson("data/combinatorial-genesis/library/catalogue-deleted.json", [ids.a])],
    ["exclusion", "source_excluded", async () => writeJson("data/combinatorial-genesis/registry/excluded.json", { entries: [{ technical_name: ids.a }] })],
    ["live-duplicate", "live_duplicate", async () => {
      const current = JSON.parse(await fs.readFile("data/combinatorial-genesis/library/parameters.json", "utf8"));
      await writeJson("data/combinatorial-genesis/library/parameters.json", [...current, parameter("spectral_harmonic_depth")]);
    }],
  ])("rejects a %s introduced after draft without partial catalogue writes", async (suffix, reason, change) => {
    await seedCatalogue();
    await fs.rm("data/combinatorial-genesis/library/catalogue-deleted.json", { force: true });
    await fs.rm("data/combinatorial-genesis/registry/excluded.json", { force: true });
    const packageId = `cg-draft-${suffix === "tombstone" ? "000000000002" : suffix === "exclusion" ? "000000000003" : "000000000004"}`;
    await writeJson(`data/combinatorial-genesis/drafts/${packageId}.json`, makePackage(packageId));
    await change();
    const beforeLibrary = await fs.readFile("data/combinatorial-genesis/library/parameters.json", "utf8");
    const beforeManifest = await fs.readFile("data/combinatorial-genesis/library/manifest.json", "utf8");

    const response = await publish(packageId);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.published).toBe(false);
    expect(body.name_conflicts).toContainEqual(expect.objectContaining({ reason }));
    expect(body.name_conflicts).toContainEqual({ technical_name: "__catalogue__", reason: "source_catalogue_stale" });
    expect(await fs.readFile("data/combinatorial-genesis/library/parameters.json", "utf8")).toBe(beforeLibrary);
    expect(await fs.readFile("data/combinatorial-genesis/library/manifest.json", "utf8")).toBe(beforeManifest);
    await expect(fs.access(`data/combinatorial-genesis/exports/${packageId}`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects frozen-only sources without reserving the candidate name", async () => {
    await seedCatalogue();
    const packageId = "cg-draft-000000000005";
    const packageRecord = makePackage(packageId);
    packageRecord.candidates[0].candidate.parent_parameters = [ids.frozen, ids.a];
    packageRecord.candidates[0].candidate.value_inference.donor_parameters = [ids.frozen, ids.a];
    await writeJson(`data/combinatorial-genesis/drafts/${packageId}.json`, packageRecord);
    const response = await publish(packageId);
    const body = await response.json();
    expect(body.published).toBe(false);
    expect(body.name_conflicts).toContainEqual({ technical_name: ids.frozen, reason: "source_unresolved" });
    expect(body.name_conflicts.some((item: { reason: string }) => item.reason === "frozen_only")).toBe(false);
  });

  it("returns unresolved parent diagnostics instead of treating them as a valid source", async () => {
    await seedCatalogue();
    const packageId = "cg-draft-000000000006";
    const packageRecord = makePackage(packageId);
    packageRecord.candidates[0].candidate.parent_parameters = ["missing_depth", ids.a];
    await writeJson(`data/combinatorial-genesis/drafts/${packageId}.json`, packageRecord);
    const response = await publish(packageId);
    const body = await response.json();
    expect(body.published).toBe(false);
    expect(body.name_conflicts).toContainEqual({ technical_name: "missing_depth", reason: "source_unresolved" });
  });

  it("rejects package and publish requests while latest points to a historical corpus", async () => {
    await seedCatalogue();
    await writeJson(`data/combinatorial-genesis/datasets/${versionId}/manifest.json`, {
      version_id: versionId,
      parameter_count: 3540,
    });
    const packageResponse = await postPreviewCandidate(previewCandidate("duration"));
    expect(packageResponse.status).toBe(409);
    expect((await packageResponse.json()).error).toMatch(/historical or stale/);

    const packageId = "cg-draft-000000000007";
    await writeJson(`data/combinatorial-genesis/drafts/${packageId}.json`, makePackage(packageId));
    const publishResponse = await publish(packageId);
    expect(publishResponse.status).toBe(409);
    expect((await publishResponse.json()).error).toMatch(/currently active live-catalogue corpus/);
  });
});
