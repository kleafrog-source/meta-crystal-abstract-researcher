import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { startV3AnchorsBuild, startV3IndexBuild } from "./build-jobs";

describe("legacy V3 build entrypoints", () => {
  it("fails closed without launching unpinned builders", async () => {
    await expect(startV3AnchorsBuild()).resolves.toEqual({
      started: false,
      reason: "legacy_build_disabled_use_service_bay_candidate_workflow",
    });
    await expect(startV3IndexBuild()).resolves.toEqual({
      started: false,
      reason: "legacy_build_disabled_use_service_bay_candidate_workflow",
    });
    expect(spawn).not.toHaveBeenCalled();
  });
});
