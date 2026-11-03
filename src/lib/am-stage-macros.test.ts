import { describe, expect, it } from "vitest";

import { calculateAmStageCompleteness, runAmStageMacroQueue, type AmStageCompletenessInput } from "./am-stage-macros";

const empty: AmStageCompletenessInput = {
  audioPresent: false, textPresent: false, qwenTextCount: 0, gemmaTextAwtdCount: 0,
  gemmaTextResolvedCount: 0, clapComplete: false, siglipComplete: false,
  gemmaAudioAwtdCount: 0, gemmaAudioResolvedCount: 0, clientStage2Complete: false,
  includeStage2: false,
  serverStage2Complete: false, requireGemmaResolution: false, customSteps: [],
};

describe("AM-Stage macro contracts", () => {
  it("starts empty profiles at zero percent", () => {
    expect(calculateAmStageCompleteness("audio_core", empty).percent).toBe(0);
  });

  it("calculates completeness against the selected macro only", () => {
    expect(calculateAmStageCompleteness("text_gemma", { ...empty, textPresent: true, gemmaTextAwtdCount: 3 }).percent).toBe(100);
    expect(calculateAmStageCompleteness("text_gemma", { ...empty, textPresent: true, gemmaTextAwtdCount: 3, requireGemmaResolution: true }).percent).toBe(50);
  });

  it("runs sequentially and stops before the next step after cancellation", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    await expect(runAmStageMacroQueue([
      { id: "text.gemma.awtd", run: async () => { seen.push("first"); controller.abort(); } },
      { id: "text.gemma.resolved", run: async () => { seen.push("second"); } },
    ], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(seen).toEqual(["first"]);
  });
});
