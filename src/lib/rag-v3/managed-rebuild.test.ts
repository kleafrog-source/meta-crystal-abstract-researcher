import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { activateCorpusCandidate, activeCorpusBlockReason, artifactDatasetVersionMatches, buildQwenCandidateArtifacts, candidateRuntimeIndexFinalizeArgs, createGemmaBundleInventory, dispatchCandidateRowArtifact, resolveFrozenCandidateVersion, rollbackCorpusCandidate, serviceBayPreflightDecision, snapshotArtifactIsCurrent, startManagedRebuild, writeGemmaActivePointer, type ManagedJob } from "./managed-rebuild";
import { resolveActiveQwenBundleRoot } from "./composite-index";

async function writeFixtureBundle(dataRoot: string, candidateName: string, versionId: string, source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"]) {
  const relative = `maintenance/${candidateName}/artifacts/qwen3`;
  const bundleRoot = path.join(dataRoot, relative);
  const payloads: Record<string, Buffer> = {
    "composite-index/manifest.json": Buffer.from(JSON.stringify({
      model: "fixture-qwen", dimensions: 1024, dataset_version: source.revision,
      source_revision: source.revision, source_snapshot_sha256: source.contentSha256,
      embedding_preprocessing_version: "fixture-retrieval-v1",
      value_selection_bundle_id: candidateName,
    })),
    "composite-index/rows.json": Buffer.from("[]"),
    "composite-index/embeddings.f32": Buffer.from([1, 2, 3]),
    "anchors/anchors_build.json": Buffer.from("{}"),
    "value-anchors/manifest.json": Buffer.from("{}"),
    "value-anchors/select-options.json": Buffer.from("{}"),
    "relations/manifest.json": Buffer.from("{}"),
    "relations/embeddings.f32": Buffer.from([4, 5, 6]),
    "runtime-atoms/atoms.json": Buffer.from("[]"),
    "runtime-atoms/atom_embeddings.f32": Buffer.from([0, 0, 0, 0]),
  };
  const rows = payloads["runtime-atoms/atoms.json"]!;
  const vectors = payloads["runtime-atoms/atom_embeddings.f32"]!;
  payloads["runtime-atoms/manifest.json"] = Buffer.from(JSON.stringify({
    version_id: versionId, effective_catalogue_revision: source.revision,
    rows_sha256: createHash("sha256").update(rows).digest("hex"),
    vectors_sha256: createHash("sha256").update(vectors).digest("hex"),
  }));
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const [relativePath, bytes] of Object.entries(payloads)) {
    const target = path.join(bundleRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    files.push({ path: relativePath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  await writeFile(path.join(bundleRoot, "bundle-manifest.json"), JSON.stringify({
    status: "complete", encoder: "qwen3", model: "fixture-qwen", dimensions: 1024,
    value_selection_contract_version: 2, candidate_text_version: 2, source_revision: source.revision,
    source_snapshot_sha256: source.contentSha256, excluded_sha256: source.registrySha256,
    source_parameter_count: source.parameters.length, dataset_version: versionId, files,
  }));
  return relative;
}

const fixtureJob = (): ManagedJob => ({
  running: true, kind: "corpus_candidate", stage: null, started_at: 1, finished_at: 0, exit_code: null,
  stop_requested: false, safe_to_stop: true, source_revision: null, source_snapshot_path: null,
  source_snapshot_sha256: null, excluded_sha256: null, excluded_count: 0, candidate_version: null,
  last_error: null, log_tail: [],
});

describe("Gemma bundle inventory", () => {
  it("records bundle-relative output paths and does not checksum its own manifest", async () => {
    const bundleRoot = await mkdtemp(path.join(os.tmpdir(), "gemma-bundle-inventory-"));
    try {
      await mkdir(path.join(bundleRoot, "anchors"), { recursive: true });
      await writeFile(path.join(bundleRoot, "anchors", "anchors_build.json"), "{}\n");
      await writeFile(path.join(bundleRoot, "bundle-manifest.json"), "previous manifest\n");

      const files = await createGemmaBundleInventory(bundleRoot);

      expect(files.map((file) => file.path)).toEqual(["anchors/anchors_build.json"]);
      expect(files[0]).toMatchObject({ bytes: 3, sha256: createHash("sha256").update("{}\n").digest("hex") });
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });
});

describe("Service Bay active corpus preflight", () => {
  it("compares text artifact dataset_version to source revision, not corpus version ID", () => {
    const manifest = { dataset_version: "source-revision", source_revision: "source-revision" };
    expect(artifactDatasetVersionMatches("composite", manifest, "cg-v1-current", "", "source-revision")).toBe(true);
    expect(artifactDatasetVersionMatches("embeddinggemma2_text", manifest, "cg-v1-current", "cg-v1-current", "source-revision")).toBe(true);
    expect(artifactDatasetVersionMatches("composite", manifest, "cg-v1-current", "", "different-source")).toBe(false);
    expect(artifactDatasetVersionMatches("atoms", { version_id: "cg-v1-current" }, "cg-v1-current", "", "source-revision")).toBe(true);
    expect(artifactDatasetVersionMatches("gemma2_atoms", { version_id: "cg-v1-current" }, "", "cg-v1-current", "source-revision")).toBe(true);
  });
  it("finalizes runtime atoms from the pinned candidate package rather than shared datasets", () => {
    const args = candidateRuntimeIndexFinalizeArgs({
      versionId: "cg-v1-current",
      versionDir: "candidate/frozen/cg-v1-current",
      model: "qwen3-embedding:0.6b",
      endpoint: "http://localhost:11434",
      outputDir: "candidate/artifacts/qwen3/runtime-atoms",
      snapshotPath: "candidate/effective-live-snapshot.json",
      sourceRevision: "current-revision",
      snapshotFileSha256: "serialized-snapshot-sha",
      excludedSha256: "current-exclusions-sha",
    });

    expect(args).toEqual(expect.arrayContaining([
      "--version-dir", "candidate/frozen/cg-v1-current",
      "--effective-snapshot", "candidate/effective-live-snapshot.json",
      "--source-revision", "current-revision",
      "--source-snapshot-sha256", "serialized-snapshot-sha",
      "--finalize-only",
    ]));
    expect(args).not.toContain("--vectorize-only");
  });

  it("dispatches a Gemma row to its Gemma builder only", async () => {
    const qwen = vi.fn(async () => undefined);
    const gemma = vi.fn(async () => undefined);
    await dispatchCandidateRowArtifact("gemma_component", "candidate", "gemma2_relations", fixtureJob(), { qwen, gemma });
    expect(gemma).toHaveBeenCalledOnce();
    expect(gemma).toHaveBeenCalledWith("candidate", "gemma2_relations", expect.any(Object));
    expect(qwen).not.toHaveBeenCalled();
  });

  it("writes only the separate Gemma pointer and preserves Qwen latest bytes", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "gemma-pointer-isolation-"));
    try {
      await mkdir(path.join(dataRoot, "datasets"), { recursive: true });
      await mkdir(path.join(dataRoot, "maintenance", "candidate", "artifacts", "embeddinggemma2"), { recursive: true });
      const qwenBytes = Buffer.from(JSON.stringify({ version_id: "qwen-active", qwen_bundle_path: "maintenance/qwen/artifacts/qwen3" }));
      await writeFile(path.join(dataRoot, "datasets", "latest.json"), qwenBytes);
      await writeGemmaActivePointer(dataRoot, {
        encoder: "embeddinggemma2", version_id: "gemma-v1", candidate_id: "candidate",
        gemma_bundle_path: "maintenance/candidate/artifacts/embeddinggemma2",
        runtime_atom_index_path: "maintenance/candidate/artifacts/embeddinggemma2/runtime-atoms",
      });
      expect(await readFile(path.join(dataRoot, "datasets", "latest.json"))).toEqual(qwenBytes);
      expect(JSON.parse(await readFile(path.join(dataRoot, "datasets", "embeddinggemma2-latest.json"), "utf8")).version_id).toBe("gemma-v1");
    } finally { await rm(dataRoot, { recursive: true, force: true }); }
  });

  it("orchestrates pinned Qwen candidate stages with a fixture runner and seals their outputs", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-orchestration-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }, { source: "library", technical_name: "two", ui_element: "Range" }], revision: "rev-1",
        librarySha256: "library-sha", tombstonesSha256: "tombstone-sha", registrySha256: "excluded-sha",
        contentSha256: "snapshot-sha", excludedCount: 2, libraryCount: 2, excludedLive: [], tombstonedLive: [],
      };
      const snapshotPath = path.join(temporary, "snapshot.json");
      await writeFile(snapshotPath, JSON.stringify(source.parameters));
      const candidateRoot = path.join(temporary, "maintenance", "candidate");
      await mkdir(candidateRoot, { recursive: true });
      const stages: string[] = [];
      const runStage = async (name: string, args: string[]) => {
        stages.push(name);
        const valueAfter = (flag: string) => args[args.indexOf(flag) + 1]!;
        const bundleIdIndex = args.indexOf("--value-selection-bundle-id");
        const common = {
          source_revision: source.revision, source_snapshot_sha256: source.contentSha256,
          excluded_sha256: source.registrySha256, source_parameter_count: source.parameters.length,
          ...(bundleIdIndex >= 0 ? { value_selection_bundle_id: valueAfter("--value-selection-bundle-id") } : {}),
          ...(name === "value-anchors" ? { selection_contract_version: 2, candidate_text_version: 2, embedding_preprocessing_version: "direct-text-v2" } : {}),
        };
        if (["composite", "value-anchors", "relations"].includes(name)) {
          expect(common.value_selection_bundle_id).toBe("candidate");
        }
        if (name === "composite") {
          const directory = valueAfter("--output-dir");
          await mkdir(directory, { recursive: true });
          await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...common, dataset_version: source.revision }));
          await writeFile(path.join(directory, "rows.json"), JSON.stringify(source.parameters));
          await writeFile(path.join(directory, "embeddings.f32"), Buffer.from([1, 2, 3]));
        } else if (name === "anchors") {
          const target = valueAfter("--out");
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, JSON.stringify({ a_home: { one: [], two: [] } }));
        } else if (name === "value-anchors") {
          const directory = valueAfter("--output");
          await mkdir(directory, { recursive: true });
          await writeFile(path.join(directory, "manifest.json"), JSON.stringify(common));
          await writeFile(path.join(directory, "select-options.json"), JSON.stringify(common));
        } else {
          const directory = valueAfter("--output");
          await mkdir(directory, { recursive: true });
          await writeFile(path.join(directory, "manifest.json"), JSON.stringify(common));
          await writeFile(path.join(directory, "embeddings.f32"), Buffer.from([4, 5, 6]));
        }
        return 0;
      };
      const bundlePath = await buildQwenCandidateArtifacts({
        candidateRoot, dataRoot: temporary, snapshotPath, source, versionId: "candidate-v1", model: "fixture-embedder",
        endpoint: "http://localhost:11434", env: { NODE_ENV: "test" }, job: fixtureJob(), runStage,
        captureCurrent: async () => source,
      });
      const bundleRoot = path.join(candidateRoot, "artifacts", "qwen3");
      const bundle = JSON.parse(await readFile(path.join(bundleRoot, "bundle-manifest.json"), "utf8")) as { status: string; files: Array<{ path: string; sha256: string; bytes: number }> };
      expect(stages).toEqual(["composite", "anchors", "value-anchors", "relations"]);
      expect(JSON.parse(await readFile(path.join(bundleRoot, "relations", "manifest.json"), "utf8")).value_selection_bundle_id).toBe("candidate");
      expect(bundlePath.replaceAll("\\", "/")).toMatch(/maintenance\/.*\/artifacts\/qwen3$/);
      expect(bundle.status).toBe("complete");
      expect(JSON.parse(await readFile(path.join(bundleRoot, "bundle-manifest.json"), "utf8")).dataset_version).toBe("candidate-v1");
      expect(bundle.files.map((file) => file.path)).toEqual(expect.arrayContaining([
        "composite-index/manifest.json", "anchors/anchors_build.json", "value-anchors/manifest.json", "value-anchors/select-options.json", "relations/manifest.json",
      ]));
      expect(bundle.files.every((file) => file.bytes > 0 && file.sha256.length === 64)).toBe(true);
      await rm(path.join(bundleRoot, "bundle-manifest.json"));
      await buildQwenCandidateArtifacts({
        candidateRoot, dataRoot: temporary, snapshotPath, source, versionId: "candidate-v1", model: "fixture-embedder",
        endpoint: "http://localhost:11434", env: { NODE_ENV: "test" }, job: fixtureJob(), finalizeOnly: true,
        runStage: async () => { throw new Error("finalization must not invoke a builder or embedding model"); },
      });
      expect(JSON.parse(await readFile(path.join(bundleRoot, "bundle-manifest.json"), "utf8")).status).toBe("complete");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("stops a candidate when the effective catalogue changes between stages", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-stale-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "captured",
        librarySha256: "library-sha", tombstonesSha256: "tombstone-sha", registrySha256: "excluded-sha",
        contentSha256: "snapshot-sha", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      const snapshotPath = path.join(temporary, "snapshot.json");
      const candidateRoot = path.join(temporary, "maintenance", "candidate");
      await mkdir(candidateRoot, { recursive: true });
      await writeFile(snapshotPath, JSON.stringify(source.parameters));
      await expect(buildQwenCandidateArtifacts({
        candidateRoot, dataRoot: temporary, snapshotPath, source, versionId: "candidate-v1", model: "fixture-embedder",
        endpoint: "http://localhost:11434", env: { NODE_ENV: "test" }, job: fixtureJob(),
        runStage: async () => 0,
        captureCurrent: async () => ({ ...source, revision: "changed-after-capture" }),
      })).rejects.toThrow(/Catalogue changed during candidate composite/);
      await expect(readFile(path.join(candidateRoot, "artifacts", "qwen3", "bundle-manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("builds only the selected Qwen candidate row and does not invoke the other builders", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-row-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "rev-row",
        librarySha256: "library-sha", tombstonesSha256: "tombstone-sha", registrySha256: "excluded-sha",
        contentSha256: "snapshot-sha", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      const snapshotPath = path.join(temporary, "snapshot.json");
      await writeFile(snapshotPath, JSON.stringify(source.parameters));
      const candidateRoot = path.join(temporary, "maintenance", "candidate");
      await mkdir(candidateRoot, { recursive: true });
      const stages: string[] = [];
      const runStage = async (name: string, args: string[]) => {
        stages.push(name);
        if (name === "composite") {
          const directory = args[args.indexOf("--output-dir") + 1]!;
          await mkdir(directory, { recursive: true });
          await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ source_revision: source.revision }));
          await writeFile(path.join(directory, "rows.json"), JSON.stringify(source.parameters));
          await writeFile(path.join(directory, "embeddings.f32"), Buffer.from([1, 2, 3]));
        }
        return 0;
      };
      await buildQwenCandidateArtifacts({
        candidateRoot, dataRoot: temporary, snapshotPath, source, versionId: "candidate-v1", model: "fixture-embedder",
        endpoint: "http://localhost:11434", env: { NODE_ENV: "test" }, job: fixtureJob(), onlyArtifact: "composite",
        runStage, captureCurrent: async () => source,
      });
      expect(stages).toEqual(["composite"]);
      expect(await readFile(path.join(candidateRoot, "artifacts", "qwen3", "composite-index", "rows.json"), "utf8")).toContain("one");
      await expect(readFile(path.join(candidateRoot, "artifacts", "qwen3", "anchors", "anchors_build.json"))).rejects.toThrow();
      await expect(readFile(path.join(candidateRoot, "artifacts", "qwen3", "bundle-manifest.json"))).rejects.toThrow();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("does not seal a bundle or continue after one candidate stage fails", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-failed-stage-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "rev-1",
        librarySha256: "library", tombstonesSha256: "tombstones", registrySha256: "excluded",
        contentSha256: "snapshot", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      const candidateRoot = path.join(temporary, "maintenance", "candidate");
      const snapshotPath = path.join(temporary, "snapshot.json");
      await mkdir(candidateRoot, { recursive: true });
      await writeFile(snapshotPath, JSON.stringify(source.parameters));
      const stages: string[] = [];
      await expect(buildQwenCandidateArtifacts({
        candidateRoot, snapshotPath, source, versionId: "v1", model: "fixture", endpoint: "http://localhost:11434",
        env: { NODE_ENV: "test" }, job: fixtureJob(), captureCurrent: async () => source,
        runStage: async (name) => { stages.push(name); return name === "anchors" ? 7 : 0; },
      })).rejects.toThrow(/anchors exited 7/);
      expect(stages).toEqual(["composite", "anchors"]);
      await expect(readFile(path.join(candidateRoot, "artifacts", "qwen3", "bundle-manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects successful stage exits when a required candidate output is missing", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-missing-output-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "rev-1",
        librarySha256: "library", tombstonesSha256: "tombstones", registrySha256: "excluded",
        contentSha256: "snapshot", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      const candidateRoot = path.join(temporary, "maintenance", "candidate");
      const snapshotPath = path.join(temporary, "snapshot.json");
      await mkdir(candidateRoot, { recursive: true });
      await writeFile(snapshotPath, JSON.stringify(source.parameters));
      await expect(buildQwenCandidateArtifacts({
        candidateRoot, snapshotPath, source, versionId: "v1", model: "fixture", endpoint: "http://localhost:11434",
        env: { NODE_ENV: "test" }, job: fixtureJob(), captureCurrent: async () => source, runStage: async () => 0,
      })).rejects.toThrow(/source snapshot or expected parameter coverage/);
      await expect(readFile(path.join(candidateRoot, "artifacts", "qwen3", "bundle-manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("blocks legacy datasets without a live-catalogue revision", () => {
    expect(activeCorpusBlockReason({ parameter_count: 3540 }, {
      revision: "live-revision",
      parameter_count: 6962,
    })).toMatch(/historical/);
  });

  it("blocks a dataset whose revision or count differs from the current catalogue", () => {
    expect(activeCorpusBlockReason({ source_revision: "old-revision", parameter_count: 6968 }, {
      revision: "live-revision",
      parameter_count: 6962,
    })).toMatch(/active 6968 .* current 6962/);
  });

  it("allows dependent rebuilds only for the exact current snapshot", () => {
    expect(activeCorpusBlockReason({ source_revision: "live-revision", parameter_count: 6962 }, {
      revision: "live-revision",
      parameter_count: 6962,
    })).toBeNull();
  });

  it("keeps stale text, anchors, and value artifacts out of runtime", () => {
    const current = { content_sha256: "live", excluded_sha256: "registry", dataset_version: "current-version" };
    expect(snapshotArtifactIsCurrent({
      source_snapshot_sha256: "old", excluded_sha256: "registry", dataset_version: "current-version",
    }, current, true)).toBe(false);
    expect(snapshotArtifactIsCurrent({
      source_snapshot_sha256: "live", excluded_sha256: "old-registry", dataset_version: "current-version",
    }, current, false)).toBe(false);
    expect(snapshotArtifactIsCurrent({
      source_snapshot_sha256: "live", excluded_sha256: "registry", dataset_version: "current-version",
    }, current, true)).toBe(true);
  });


  it("allows candidate and dependent artifacts to build without activating the historical corpus", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 6962, localEndpoint: true, modelInstalled: true, outputWritable: true,
      availableMemoryBytes: 8 * 1024 * 1024 * 1024,
      jobRunning: false, modelSlotBusy: false,
    });
    expect(decision.can_build_candidate).toBe(true);
    expect(decision.can_build_dependent_indexes).toBe(true);
    expect(decision.dependent_indexes_build_with_candidate).toBe(true);
    expect(decision.can_prepare_candidate).toBe(true);
    expect(decision.can_vectorize_candidate).toBe(false);
    expect(decision.can_finalize_candidate).toBe(false);
    expect(decision.can_activate).toBe(false);
    expect(decision.activation_reason).toMatch(/technically finalize/i);
  });

  it("permits explicit connection for a technically finalized current candidate without a baseline comparison", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 6962, localEndpoint: true, modelInstalled: true, outputWritable: true,
      availableMemoryBytes: 8 * 1024 ** 3, jobRunning: false, modelSlotBusy: false,
      candidateBundleCurrent: true,
    });
    expect(decision.can_activate).toBe(true);
    expect(decision.activation_reason).toMatch(/connection remains explicit/i);
  });

  it("enables validation-only Finalize only after every artifact row is ready", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 6962, localEndpoint: false, modelInstalled: false, outputWritable: true,
      availableMemoryBytes: 1024, jobRunning: false, modelSlotBusy: false, candidateRowsReady: true,
    });
    expect(decision.can_finalize_candidate).toBe(true);
    expect(decision.can_vectorize_candidate).toBe(false);
  });

  it("blocks connection and finalization while a model job is active", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 6962, localEndpoint: true, modelInstalled: true, outputWritable: true,
      availableMemoryBytes: 8 * 1024 ** 3, jobRunning: true, modelSlotBusy: false,
      candidateBundleCurrent: true,
    });
    expect(decision.can_finalize_candidate).toBe(false);
    expect(decision.can_activate).toBe(false);
  });

  it("does not allow connection when technical candidate validation has not passed", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 6962, localEndpoint: true, modelInstalled: true, outputWritable: true,
      availableMemoryBytes: 8 * 1024 ** 3, jobRunning: false, modelSlotBusy: false,
      candidateBundleCurrent: false,
    });
    expect(decision.can_activate).toBe(false);
    expect(decision.activation_reason).toMatch(/technically finalize/i);
  });

  it("invalidates candidate preflight when source or local model prerequisites fail", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 0, localEndpoint: false, modelInstalled: false, outputWritable: true,
      availableMemoryBytes: 8 * 1024 * 1024 * 1024,
      jobRunning: true, modelSlotBusy: false,
    });
    expect(decision.can_build_candidate).toBe(false);
    expect(decision.candidate_blockers).toEqual(expect.arrayContaining([
      "effective live catalogue is empty", "candidate embeddings require a local Ollama endpoint",
      "configured embedding model is unavailable locally", "another Service Bay job is running",
    ]));
  });

  it("includes missing builder inputs among candidate blockers", () => {
    const decision = serviceBayPreflightDecision({
      liveCount: 1, localEndpoint: true, modelInstalled: true, outputWritable: true,
      missingDependencies: ["axes.json"], availableMemoryBytes: 8 * 1024 ** 3,
      jobRunning: false, modelSlotBusy: false,
    });
    expect(decision.can_build_candidate).toBe(false);
    expect(decision.candidate_blockers).toContain("required builder input is missing: axes.json");
  });

  it("refuses direct Gemma rebuilds until an inactive bundle workflow exists", async () => {
    const result = await startManagedRebuild("gemma2_atoms");
    expect(result.started).toBe(false);
    expect(result.reason).toMatch(/direct Gemma writers are disabled.*inactive/i);
  });

  it("rejects the deprecated full-set model action before starting any work", async () => {
    const vectorize = await startManagedRebuild("vectorize_candidate", "fixture-candidate");
    const allQwen = await startManagedRebuild("all_qwen");
    expect(vectorize.started).toBe(false);
    expect(vectorize.reason).toMatch(/each Qwen artifact/i);
    expect(allQwen.started).toBe(false);
    expect(allQwen.reason).toMatch(/each Qwen artifact/i);
  });

  it("activates a validated fixture bundle, resolves it for runtime, then restores an eligible prior bundle", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-lifecycle-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "rev-1",
        librarySha256: "library", tombstonesSha256: "tombstones", registrySha256: "excluded",
        contentSha256: "snapshot", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      await mkdir(path.join(dataRoot, "datasets", "old-v1"), { recursive: true });
      await mkdir(path.join(dataRoot, "datasets", "new-v2"), { recursive: true });
      await mkdir(path.join(dataRoot, "maintenance", "new-candidate"), { recursive: true });
      await writeFile(path.join(dataRoot, "datasets", "old-v1", "manifest.json"), JSON.stringify({ source_revision: source.revision, parameter_count: source.parameters.length }));
      await writeFile(path.join(dataRoot, "datasets", "new-v2", "manifest.json"), JSON.stringify({ source_revision: source.revision, parameter_count: source.parameters.length }));
      const oldBundlePath = await writeFixtureBundle(dataRoot, "old-candidate", "old-v1", source);
      const newBundlePath = await writeFixtureBundle(dataRoot, "new-candidate", "new-v2", source);
      await writeFile(path.join(dataRoot, "datasets", "latest.json"), JSON.stringify({
        version_id: "old-v1", artifact_bundle_required: true, qwen_bundle_path: oldBundlePath,
        runtime_atom_index_path: `${oldBundlePath}/runtime-atoms`,
      }));
      await writeFile(path.join(dataRoot, "maintenance", "new-candidate", "candidate.json"), JSON.stringify({
        version_id: "new-v2", status: "ready_to_connect", qwen_bundle_status: "complete",
        qwen_bundle_path: newBundlePath, runtime_atom_index_path: `${newBundlePath}/runtime-atoms`,
        source_revision: source.revision, previous_active_version: "old-v1",
      }));

      const activated = await activateCorpusCandidate("new-v2", dataRoot, source);
      expect(activated.activated).toBe(true);
      expect(resolveActiveQwenBundleRoot(dataRoot)).toBe(path.join(dataRoot, newBundlePath));
      expect(await readFile(path.join(resolveActiveQwenBundleRoot(dataRoot)!, "composite-index", "rows.json"), "utf8")).toBe("[]");

      const rolledBack = await rollbackCorpusCandidate("new-v2", dataRoot, source);
      expect(rolledBack.runtime_eligible).toBe(true);
      expect(resolveActiveQwenBundleRoot(dataRoot)).toBe(path.join(dataRoot, oldBundlePath));

      await activateCorpusCandidate("new-v2", dataRoot, source);
      await writeFile(path.join(dataRoot, oldBundlePath, "composite-index", "rows.json"), "corrupted");
      const technicalRollback = await rollbackCorpusCandidate("new-v2", dataRoot, source);
      expect(technicalRollback.runtime_eligible).toBe(false);
      expect(() => resolveActiveQwenBundleRoot(dataRoot)).toThrow(/pointer is missing/);
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("activates the selected candidate ID when multiple candidates share one dataset version", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-id-collision-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "rev-1",
        librarySha256: "library", tombstonesSha256: "tombstones", registrySha256: "excluded",
        contentSha256: "snapshot", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      const versionId = "cg-v1-shared";
      await mkdir(path.join(dataRoot, "datasets", versionId), { recursive: true });
      await writeFile(path.join(dataRoot, "datasets", versionId, "manifest.json"), JSON.stringify({ source_revision: source.revision, parameter_count: source.parameters.length }));
      const oldBundlePath = await writeFixtureBundle(dataRoot, "old-candidate", versionId, source);
      const newBundlePath = await writeFixtureBundle(dataRoot, "new-candidate", versionId, source);
      await mkdir(path.join(dataRoot, "maintenance", "old-candidate"), { recursive: true });
      await mkdir(path.join(dataRoot, "maintenance", "new-candidate"), { recursive: true });
      const candidateRecord = (candidateId: string, bundlePath: string) => ({
        candidate_id: candidateId, version_id: versionId, status: "ready_to_connect", qwen_bundle_status: "complete",
        qwen_bundle_path: bundlePath, runtime_atom_index_path: `${bundlePath}/runtime-atoms`, source_revision: source.revision,
      });
      await writeFile(path.join(dataRoot, "maintenance", "old-candidate", "candidate.json"), JSON.stringify(candidateRecord("old-candidate", oldBundlePath)));
      await writeFile(path.join(dataRoot, "maintenance", "new-candidate", "candidate.json"), JSON.stringify(candidateRecord("new-candidate", newBundlePath)));
      await writeFile(path.join(dataRoot, "datasets", "latest.json"), JSON.stringify({
        version_id: versionId, artifact_bundle_required: true, qwen_bundle_path: oldBundlePath,
        runtime_atom_index_path: `${oldBundlePath}/runtime-atoms`,
      }));

      await activateCorpusCandidate("new-candidate", dataRoot, source);

      const latest = JSON.parse(await readFile(path.join(dataRoot, "datasets", "latest.json"), "utf8"));
      expect(latest.qwen_bundle_path).toBe(newBundlePath);
      expect(JSON.parse(await readFile(path.join(dataRoot, "maintenance", "old-candidate", "candidate.json"), "utf8")).status).toBe("ready_to_connect");
      expect(JSON.parse(await readFile(path.join(dataRoot, "maintenance", "new-candidate", "candidate.json"), "utf8")).status).toBe("active");
      await expect(activateCorpusCandidate(versionId, dataRoot, source)).rejects.toThrow(/ambiguous.*candidate_id/i);
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("refuses an incompatible bundle manifest without changing the active fixture pointer", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "qwen-candidate-incompatible-"));
    try {
      const source: Parameters<typeof buildQwenCandidateArtifacts>[0]["source"] = {
        parameters: [{ source: "library", technical_name: "one", ui_element: "Range" }], revision: "rev-1",
        librarySha256: "library", tombstonesSha256: "tombstones", registrySha256: "excluded",
        contentSha256: "snapshot", excludedCount: 0, libraryCount: 1, excludedLive: [], tombstonedLive: [],
      };
      const bundlePath = await writeFixtureBundle(dataRoot, "candidate", "new-v2", source);
      await mkdir(path.join(dataRoot, "datasets", "old-v1"), { recursive: true });
      await mkdir(path.join(dataRoot, "datasets", "new-v2"), { recursive: true });
      await mkdir(path.join(dataRoot, "maintenance", "candidate"), { recursive: true });
      await writeFile(path.join(dataRoot, "datasets", "old-v1", "manifest.json"), JSON.stringify({ source_revision: source.revision, parameter_count: source.parameters.length }));
      await writeFile(path.join(dataRoot, "datasets", "new-v2", "manifest.json"), JSON.stringify({ source_revision: source.revision, parameter_count: source.parameters.length }));
      await writeFile(path.join(dataRoot, "datasets", "latest.json"), JSON.stringify({ version_id: "old-v1" }));
      await writeFile(path.join(dataRoot, "maintenance", "candidate", "candidate.json"), JSON.stringify({
        version_id: "new-v2", status: "ready_to_connect", qwen_bundle_status: "complete",
        qwen_bundle_path: bundlePath, runtime_atom_index_path: `${bundlePath}/runtime-atoms`,
        source_revision: source.revision, previous_active_version: "old-v1",
      }));
      await writeFile(path.join(dataRoot, bundlePath, "bundle-manifest.json"), JSON.stringify({
        status: "complete", encoder: "qwen3", source_revision: "wrong-revision",
        source_snapshot_sha256: source.contentSha256, excluded_sha256: source.registrySha256,
        source_parameter_count: source.parameters.length, dataset_version: "new-v2", files: [],
      }));

      await expect(activateCorpusCandidate("new-v2", dataRoot, source)).rejects.toThrow(/missing, incomplete, or stale/);
      expect(JSON.parse(await readFile(path.join(dataRoot, "datasets", "latest.json"), "utf8")).version_id).toBe("old-v1");
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("resolves the immutable version created by --no-activate without expecting a latest pointer", async () => {
    const frozenRoot = await mkdtemp(path.join(os.tmpdir(), "frozen-candidate-no-latest-"));
    try {
      await mkdir(path.join(frozenRoot, "cg-v1-old"), { recursive: true });
      await mkdir(path.join(frozenRoot, "cg-v1-current"), { recursive: true });
      await writeFile(path.join(frozenRoot, "cg-v1-old", "manifest.json"), JSON.stringify({ source_revision: "old", parameter_count: 2 }));
      await writeFile(path.join(frozenRoot, "cg-v1-current", "manifest.json"), JSON.stringify({ source_revision: "current", parameter_count: 3 }));
      await expect(readFile(path.join(frozenRoot, "latest.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(resolveFrozenCandidateVersion(frozenRoot, "current", 3)).resolves.toBe("cg-v1-current");
      await expect(resolveFrozenCandidateVersion(frozenRoot, "missing", 3)).rejects.toThrow(/found 0/);
    } finally {
      await rm(frozenRoot, { recursive: true, force: true });
    }
  });
});
