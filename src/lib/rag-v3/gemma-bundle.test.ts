import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GEMMA_CANDIDATE_ARTIFACTS, gemmaCandidateRowsReadyForFinalize, type GemmaBuildIdentity } from "./gemma-bundle";
import { ensureGemmaCandidateArtifactDirectory, gemmaBuildIdentitySha256, gemmaCandidateArtifactDirectory, gemmaIdentityCompatible } from "./gemma-build-identity";

const identity = (): GemmaBuildIdentity => ({
  schema_version: 1, artifact_kind: "gemma2_relations", encoder: "embeddinggemma2",
  model: "embeddinggemma-2:740m", endpoint: "http://localhost:11434", dimensions: 768,
  source_revision: "revision-a", source_snapshot_content_sha256: "content-a", snapshot_file_sha256: "file-a",
  inputs: [{ path: "prepared/relations.json", sha256: "rows-a" }], settings: { batch_size: 64 },
});

describe("Gemma candidate bundle identity and paths", () => {
  it("offers Finalize for complete row outputs including a completed atom-vector checkpoint", () => {
    const builds = Object.fromEntries(GEMMA_CANDIDATE_ARTIFACTS.map((kind) => [kind, "complete"]));
    builds.gemma2_atoms = "vectorization_complete";
    expect(gemmaCandidateRowsReadyForFinalize(builds)).toBe(true);
    expect(gemmaCandidateRowsReadyForFinalize({ ...builds, gemma2_atoms: "partial" })).toBe(false);
    expect(gemmaCandidateRowsReadyForFinalize(undefined)).toBe(false);
  });

  it("keeps each Gemma output under its own encoder directory, separate from Qwen", () => {
    const candidate = path.resolve("fixture-maintenance", "candidate");
    for (const kind of GEMMA_CANDIDATE_ARTIFACTS) {
      expect(gemmaCandidateArtifactDirectory(candidate, kind)).toContain(path.join("artifacts", "embeddinggemma2"));
      expect(gemmaCandidateArtifactDirectory(candidate, kind)).not.toContain(path.join("artifacts", "qwen3"));
    }
  });

  it("creates a missing Gemma artifact directory before its builder writes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gemma-output-directory-"));
    try {
      const directory = await ensureGemmaCandidateArtifactDirectory(root, "gemma2_anchors");
      expect((await stat(directory)).isDirectory()).toBe(true);
      expect(directory).toContain(path.join("artifacts", "embeddinggemma2", "anchors"));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("accepts reuse only for an exact model, settings, source and input identity", () => {
    const expected = identity();
    expect(gemmaIdentityCompatible(expected, expected)).toBe(true);
    expect(gemmaIdentityCompatible({ ...expected, model: "qwen3-embedding:0.6b" }, expected)).toBe(false);
    expect(gemmaIdentityCompatible({ ...expected, source_snapshot_content_sha256: "other" }, expected)).toBe(false);
    expect(gemmaIdentityCompatible({ ...expected, inputs: [{ path: "prepared/relations.json", sha256: "other" }] }, expected)).toBe(false);
    expect(gemmaBuildIdentitySha256(expected)).toHaveLength(64);
  });
});
