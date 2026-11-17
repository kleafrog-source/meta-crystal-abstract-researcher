import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveActiveQwenBundleRoot } from "./composite-index";

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("active Qwen artifact bundle pointer", () => {
  it("resolves the immutable bundle selected by latest.json", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "qwen-bundle-pointer-"));
    await mkdir(path.join(root, "datasets"), { recursive: true });
    await mkdir(path.join(root, "maintenance", "candidate", "artifacts", "qwen3"), { recursive: true });
    await writeFile(path.join(root, "datasets", "latest.json"), JSON.stringify({ qwen_bundle_path: "maintenance/candidate/artifacts/qwen3" }));

    expect(resolveActiveQwenBundleRoot(root)).toBe(path.join(root, "maintenance", "candidate", "artifacts", "qwen3"));
  });

  it("fails closed when a bundle pointer escapes the maintenance candidate tree", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "qwen-bundle-pointer-"));
    await mkdir(path.join(root, "datasets"), { recursive: true });
    await writeFile(path.join(root, "datasets", "latest.json"), JSON.stringify({ qwen_bundle_path: "../../outside" }));

    expect(() => resolveActiveQwenBundleRoot(root)).toThrow(/escapes the immutable candidate area/);
  });

  it("fails closed for a technical rollback to a historical pointer without a policy-eligible bundle", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "qwen-bundle-pointer-"));
    await mkdir(path.join(root, "datasets"), { recursive: true });
    await writeFile(path.join(root, "datasets", "latest.json"), JSON.stringify({ artifact_bundle_required: true, qwen_bundle_path: null }));

    expect(() => resolveActiveQwenBundleRoot(root)).toThrow(/pointer is missing/);
  });
});
