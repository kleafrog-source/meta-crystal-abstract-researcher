import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGemmaRuntimeAtomIndexDirectory, resolveRuntimeAtomIndexDirectory } from "./runtime-index-path";

describe("runtime atom index pointer", () => {
  const dataRoot = path.resolve("fixture-data-root");

  it("keeps legacy snapshots on their versioned index path", () => {
    expect(resolveRuntimeAtomIndexDirectory(dataRoot, "v1")).toBe(path.join(dataRoot, "indexes", "v1"));
  });

  it("resolves an activated immutable candidate atom index", () => {
    expect(resolveRuntimeAtomIndexDirectory(dataRoot, "v2", "maintenance/candidate/runtime-atoms/v2"))
      .toBe(path.join(dataRoot, "maintenance", "candidate", "runtime-atoms", "v2"));
  });

  it("rejects pointers outside the maintenance tree instead of falling back", () => {
    expect(() => resolveRuntimeAtomIndexDirectory(dataRoot, "v2", "indexes/v2"))
      .toThrow(/escapes the immutable candidate area/);
  });

  it("resolves Gemma runtime atoms only through the connected Gemma bundle identity", () => {
    expect(resolveGemmaRuntimeAtomIndexDirectory(dataRoot, {
      encoder: "embeddinggemma2", version_id: "gemma-v1",
      gemma_bundle_path: "maintenance/candidate/artifacts/embeddinggemma2",
      runtime_atom_index_path: "maintenance/candidate/artifacts/embeddinggemma2/runtime-atoms",
    })).toEqual({
      versionId: "gemma-v1",
      directory: path.join(dataRoot, "maintenance", "candidate", "artifacts", "embeddinggemma2", "runtime-atoms"),
    });
  });

  it("rejects Gemma runtime paths that point into Qwen or another candidate", () => {
    expect(() => resolveGemmaRuntimeAtomIndexDirectory(dataRoot, {
      encoder: "embeddinggemma2", version_id: "gemma-v1",
      gemma_bundle_path: "maintenance/candidate/artifacts/embeddinggemma2",
      runtime_atom_index_path: "maintenance/candidate/artifacts/qwen3/runtime-atoms",
    })).toThrow(/connected candidate bundle/);
  });
});
