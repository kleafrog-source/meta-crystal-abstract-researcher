import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertRuntimeCorpusCurrent, loadRuntimeAtomIndexFromDirectory } from "./runtime-index";

describe("runtime atom corpus provenance", () => {
  it("allows only a current live snapshot built without archived fallback", () => {
    expect(() => assertRuntimeCorpusCurrent({
      currentRevision: "live-revision",
      datasetSourceRevision: "live-revision",
      runtimeSourceRevision: "live-revision",
      archivedFallbackEnabled: false,
    })).not.toThrow();
  });

  it("blocks the active historical frozen corpus before it can supply runtime atoms", () => {
    expect(() => assertRuntimeCorpusCurrent({
      currentRevision: "new-live-revision",
      datasetSourceRevision: undefined,
      runtimeSourceRevision: "old-live-revision",
      archivedFallbackEnabled: true,
    })).toThrow(/archived-source fallback/);
  });

  it("blocks rows whose source revision no longer matches live", () => {
    expect(() => assertRuntimeCorpusCurrent({
      currentRevision: "new-live-revision",
      datasetSourceRevision: "new-live-revision",
      runtimeSourceRevision: "old-live-revision",
      archivedFallbackEnabled: false,
    })).toThrow(/Runtime atom rows are stale/);
  });

  it("loads and validates a finalized candidate index by its rows, vector shape and checksums", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "candidate-runtime-load-"));
    try {
      const indexDir = path.join(temporary, "runtime-atoms");
      await mkdir(indexDir, { recursive: true });
      const rows = Buffer.from(JSON.stringify([{ atom: "depth", role: "property", parameter_frequency: 1, occurrence_weight: 1, source_parameters: [], embedding_text: "depth" }]));
      const vectors = Buffer.alloc(8 + 2 * 4);
      vectors.writeUInt32LE(1, 0);
      vectors.writeUInt32LE(2, 4);
      vectors.writeFloatLE(0.6, 8);
      vectors.writeFloatLE(0.8, 12);
      await writeFile(path.join(indexDir, "atoms.json"), rows);
      await writeFile(path.join(indexDir, "atom_embeddings.f32"), vectors);
      await writeFile(path.join(indexDir, "manifest.json"), JSON.stringify({
        version_id: "candidate-v1", model: "qwen3-embedding:0.6b", dimensions: 2, atom_count: 1,
        cache_sha256: "cache", files: { rows: "atoms.json", embeddings: "atom_embeddings.f32" },
        rows_sha256: createHash("sha256").update(rows).digest("hex"),
        vectors_sha256: createHash("sha256").update(vectors).digest("hex"),
      }));

      const loaded = await loadRuntimeAtomIndexFromDirectory(indexDir, "candidate-v1");
      expect(loaded.rows[0]?.atom).toBe("depth");
      expect(loaded.vectors[0]).toHaveLength(2);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects a finalized candidate whose vector count does not align with its rows", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "candidate-runtime-bad-load-"));
    try {
      const indexDir = path.join(temporary, "runtime-atoms");
      await mkdir(indexDir, { recursive: true });
      const rows = Buffer.from(JSON.stringify([{ atom: "depth", embedding_text: "depth" }]));
      const vectors = Buffer.alloc(8);
      vectors.writeUInt32LE(0, 0);
      vectors.writeUInt32LE(2, 4);
      await writeFile(path.join(indexDir, "atoms.json"), rows);
      await writeFile(path.join(indexDir, "atom_embeddings.f32"), vectors);
      await writeFile(path.join(indexDir, "manifest.json"), JSON.stringify({
        version_id: "candidate-v1", dimensions: 2, atom_count: 1, files: { rows: "atoms.json", embeddings: "atom_embeddings.f32" },
        rows_sha256: createHash("sha256").update(rows).digest("hex"), vectors_sha256: createHash("sha256").update(vectors).digest("hex"),
      }));
      await expect(loadRuntimeAtomIndexFromDirectory(indexDir, "candidate-v1")).rejects.toThrow(/header mismatch/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
