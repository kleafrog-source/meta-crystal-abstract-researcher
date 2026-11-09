import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isPathInside, listAllowedAudioImports, readAllowedAudioImport } from "./audio-import";

const roots: string[] = [];
async function tempRoot() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "am-audio-import-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("allowed audio import", () => {
  it("lists and reads Unicode audio files from the configured directory", async () => {
    const root = await tempRoot();
    await fs.writeFile(path.join(root, "Ω_கருங்கல்.m4a"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(root, "notes.txt"), "not audio");
    const listed = await listAllowedAudioImports(root);
    expect(listed.map((item) => item.name)).toEqual(["Ω_கருங்கல்.m4a"]);
    expect((await readAllowedAudioImport("Ω_கருங்கல்.m4a", root)).bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects traversal names and paths outside the allowed root", async () => {
    const root = await tempRoot();
    await expect(readAllowedAudioImport("..\\escape.wav", root)).rejects.toThrow("listed import folder");
    expect(isPathInside(root, path.resolve(root, "song.wav"))).toBe(true);
    expect(isPathInside(root, path.resolve(root, "..", "escape.wav"))).toBe(false);
  });

  it("rejects unsupported extensions", async () => {
    const root = await tempRoot();
    await fs.writeFile(path.join(root, "document.txt"), "x");
    await expect(readAllowedAudioImport("document.txt", root)).rejects.toThrow("not supported");
  });
});
