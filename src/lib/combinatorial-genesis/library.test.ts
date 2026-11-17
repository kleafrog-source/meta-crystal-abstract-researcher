import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureGenesisLibrary, readGenesisLibrary } from "./library";

describe("live catalogue availability", () => {
  it("does not seed runtime catalogue data from archived reference files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cg-live-catalogue-"));
    try {
      await fs.mkdir(path.join(root, "reference"), { recursive: true });
      await fs.writeFile(path.join(root, "reference", "base_parameters.json"), "[{\"technical_name\":\"archived_name\"}]\n");

      await expect(readGenesisLibrary(root)).rejects.toThrow(/archived reference data is not used as a runtime fallback/);
      await expect(ensureGenesisLibrary(root)).rejects.toThrow(/archived reference data is not used as a runtime fallback/);
      await expect(fs.access(path.join(root, "library", "parameters.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
