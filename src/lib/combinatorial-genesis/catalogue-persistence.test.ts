import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { updateCatalogueFiles } from "./catalogue-persistence";
import { readExcludedRegistry } from "./registry";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const writeJson = async (root: string, relative: string, value: unknown) => {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
};

describe("recoverable catalogue file-set writes", () => {
  it("keeps an audit read of a missing exclusion registry non-persistent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalogue-read-only-audit-"));
    try {
      const registry = await readExcludedRegistry(root);
      expect(registry.entries).toEqual([]);
      await expect(fs.access(path.join(root, "registry", "excluded.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("serializes concurrent read-modify-write updates across a shared file lock", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalogue-write-concurrent-"));
    try {
      await writeJson(root, "library/parameters.json", []);
      await writeJson(root, "library/manifest.json", { parameter_count: 0, revision: 0 });
      await Promise.all(["first", "second"].map((name) => updateCatalogueFiles(async (read) => {
        const parameters = JSON.parse(await read("library/parameters.json")) as string[];
        const manifest = JSON.parse(await read("library/manifest.json")) as { parameter_count: number; revision: number };
        await new Promise((resolve) => setTimeout(resolve, 10));
        parameters.push(name);
        const nextManifest = { parameter_count: parameters.length, revision: manifest.revision + 1 };
        return { writes: {
          "library/parameters.json": `${JSON.stringify(parameters)}\n`,
          "library/manifest.json": `${JSON.stringify(nextManifest)}\n`,
        }, result: undefined };
      }, root)));
      expect(JSON.parse(await fs.readFile(path.join(root, "library/parameters.json"), "utf8"))).toEqual(["first", "second"]);
      expect(JSON.parse(await fs.readFile(path.join(root, "library/manifest.json"), "utf8"))).toEqual({ parameter_count: 2, revision: 2 });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("restores the previous file set after an interrupted sequential replacement", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalogue-write-recovery-"));
    try {
      const oldLibrary = '["before"]\n';
      const oldManifest = '{"parameter_count":1}\n';
      const nextLibrary = '["after"]\n';
      const nextManifest = '{"parameter_count":2}\n';
      await fs.mkdir(path.join(root, "library"), { recursive: true });
      await fs.writeFile(path.join(root, "library/parameters.json"), nextLibrary, "utf8");
      await fs.writeFile(path.join(root, "library/manifest.json"), oldManifest, "utf8");
      await fs.writeFile(path.join(root, "library/parameters.json.interrupted.bak"), oldLibrary, "utf8");
      await fs.writeFile(path.join(root, "library/manifest.json.interrupted.bak"), oldManifest, "utf8");
      await fs.writeFile(path.join(root, "library/parameters.json.interrupted.tmp"), nextLibrary, "utf8");
      await fs.writeFile(path.join(root, "library/manifest.json.interrupted.tmp"), nextManifest, "utf8");
      const journal = {
        schema_version: 1,
        id: "interrupted",
        state: "prepared",
        entries: [
          { target: "library/parameters.json", temporary: "library/parameters.json.interrupted.tmp", backup: "library/parameters.json.interrupted.bak", had_original: true, previous_sha256: sha(oldLibrary), next_sha256: sha(nextLibrary) },
          { target: "library/manifest.json", temporary: "library/manifest.json.interrupted.tmp", backup: "library/manifest.json.interrupted.bak", had_original: true, previous_sha256: sha(oldManifest), next_sha256: sha(nextManifest) },
        ],
      };
      await fs.writeFile(path.join(root, "library/.catalogue-write-journal.json"), `${JSON.stringify(journal)}\n`, "utf8");

      await updateCatalogueFiles(async () => ({ writes: {}, result: undefined }), root);
      expect(await fs.readFile(path.join(root, "library/parameters.json"), "utf8")).toBe(oldLibrary);
      expect(await fs.readFile(path.join(root, "library/manifest.json"), "utf8")).toBe(oldManifest);
      await expect(fs.access(path.join(root, "library/.catalogue-write-journal.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
