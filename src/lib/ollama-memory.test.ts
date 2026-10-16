import { describe, expect, it } from "vitest";

import { selectModelsToUnload } from "./ollama-memory-policy";

describe("selectModelsToUnload", () => {
  it("unloads every resident model for external GPU searches", () => {
    expect(
      selectModelsToUnload([
        "qwen3-embedding:0.6b",
        "hermes3-strict-json:latest",
      ]),
    ).toEqual(["qwen3-embedding:0.6b", "hermes3-strict-json:latest"]);
  });

  it("keeps the configured V3 embedding model and unloads chat models", () => {
    expect(
      selectModelsToUnload(
        ["qwen3-embedding:0.6b", "hermes3-strict-json:latest"],
        ["qwen3-embedding:0.6b"],
      ),
    ).toEqual(["hermes3-strict-json:latest"]);
  });

  it("ignores empty and duplicate process entries", () => {
    expect(
      selectModelsToUnload(["", "hermes3:3b", "hermes3:3b", "  "]),
    ).toEqual(["hermes3:3b"]);
  });
});
