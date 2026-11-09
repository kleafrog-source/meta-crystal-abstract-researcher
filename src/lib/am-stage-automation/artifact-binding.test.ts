import { describe, expect, it } from "vitest";
import { chooseBoundArtifact, filterStageOutputArtifacts } from "./artifact-binding";

const candidates = [
  { id: "transition", pass: "transition", value: "combined", createdAt: "2026-01-01T00:00:00Z" },
  { id: "a", pass: "query-a", value: "first", createdAt: "2026-01-01T00:00:01Z" },
  { id: "b", pass: "query-b", value: "second", createdAt: "2026-01-01T00:00:02Z" },
  { id: "awtd", pass: "awtd", value: "identity", createdAt: "2026-01-01T00:00:00Z" },
];

describe("Automation data binding artifact selection", () => {
  it("excludes internal node checkpoints and binds the declared stage output kind", () => {
    const artifacts = [
      { id: "checkpoint", kind: "automation-node-checkpoint", pass: null, value: "internal", createdAt: "2026-01-01T00:00:00Z" },
      { id: "brief", kind: "brief", pass: null, value: "brief payload", createdAt: "2026-01-01T00:00:01Z" },
    ];
    const outputs = [{ port: "result", kind: "brief" }];
    const eligible = filterStageOutputArtifacts(artifacts, outputs, "result");
    expect(eligible.map((artifact) => artifact.id)).toEqual(["brief"]);
    expect(chooseBoundArtifact(eligible, "brief", "brief.combine_segment_texts", false)?.id).toBe("brief");
  });

  it("uses the requested Gemma AWTD state for each resolved state", () => {
    expect(chooseBoundArtifact(candidates, "identityBank", "text.gemma.awtd", true)?.id).toBe("a");
    expect(chooseBoundArtifact(candidates, "identityBankB", "text.gemma.awtd", true)?.id).toBe("b");
    expect(chooseBoundArtifact([candidates[3]], "identityBank", "text.gemma.awtd", false)?.id).toBe("awtd");
  });

  it("feeds merged transition retrievals to downstream consumers and prefers resolved single-pass outputs", () => {
    expect(chooseBoundArtifact(candidates, "stage1", "text.qwen.resolved", true)?.value).toBe("combined");
    const singlePass = [{ id: "first", pass: "awtd", value: "identity" }, { id: "resolved", pass: "resolved", value: "resolved values" }];
    expect(chooseBoundArtifact(singlePass, "source1", "text.qwen.resolved", false)?.value).toBe("resolved values");
    expect(chooseBoundArtifact(singlePass, "parameterBank1", "text.qwen.resolved", false)?.value).toBe("resolved values");
  });
});
