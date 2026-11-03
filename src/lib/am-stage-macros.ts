export const AM_STAGE_MACRO_IDS = ["full_core", "text_gemma", "audio_core", "gemma_audio_then_resolve", "custom"] as const;
export type AmStageMacroId = (typeof AM_STAGE_MACRO_IDS)[number];

export const AM_STAGE_MACRO_STEPS = [
  "text.qwen.resolved",
  "text.gemma.awtd",
  "text.gemma.resolved",
  "audio.clap.resolved",
  "spec.siglip.resolved",
  "audio.gemma.awtd",
  "audio.gemma.resolved",
  "stage2.client",
  "stage2.server",
] as const;
export type AmStageMacroStep = (typeof AM_STAGE_MACRO_STEPS)[number];

export interface AmStageCompletenessInput {
  audioPresent: boolean;
  textPresent: boolean;
  qwenTextCount: number;
  gemmaTextAwtdCount: number;
  gemmaTextResolvedCount: number;
  clapComplete: boolean;
  siglipComplete: boolean;
  gemmaAudioAwtdCount: number;
  gemmaAudioResolvedCount: number;
  clientStage2Complete: boolean;
  serverStage2Complete: boolean;
  requireGemmaResolution: boolean;
  includeStage2: boolean;
  customSteps: AmStageMacroStep[];
}

export interface AmStageCompleteness {
  percent: number;
  complete: number;
  total: number;
  missing: AmStageMacroStep[];
}

function requirements(profile: AmStageMacroId, input: AmStageCompletenessInput): AmStageMacroStep[] {
  if (profile === "text_gemma") return ["text.gemma.awtd", ...(input.requireGemmaResolution ? ["text.gemma.resolved" as const] : [])];
  if (profile === "audio_core") return ["audio.clap.resolved", "spec.siglip.resolved"];
  if (profile === "gemma_audio_then_resolve") return ["audio.gemma.awtd", "audio.gemma.resolved"];
  if (profile === "custom") return input.customSteps;
  return ["text.gemma.awtd", ...(input.requireGemmaResolution ? ["text.gemma.resolved" as const] : []), "audio.clap.resolved", "spec.siglip.resolved", ...(input.includeStage2 ? ["stage2.server" as const] : [])];
}

export function calculateAmStageCompleteness(profile: AmStageMacroId, input: AmStageCompletenessInput): AmStageCompleteness {
  const needed = requirements(profile, input);
  const ready: Record<AmStageMacroStep, boolean> = {
    "text.qwen.resolved": input.textPresent && input.qwenTextCount > 0,
    "text.gemma.awtd": input.textPresent && input.gemmaTextAwtdCount > 0,
    "text.gemma.resolved": input.textPresent && input.gemmaTextResolvedCount > 0,
    "audio.clap.resolved": input.audioPresent && input.clapComplete,
    "spec.siglip.resolved": input.audioPresent && input.siglipComplete,
    "audio.gemma.awtd": input.audioPresent && input.gemmaAudioAwtdCount > 0,
    "audio.gemma.resolved": input.audioPresent && input.gemmaAudioResolvedCount > 0,
    "stage2.client": input.clientStage2Complete,
    "stage2.server": input.serverStage2Complete,
  };
  const missing = needed.filter((step) => !ready[step]);
  const total = needed.length;
  const complete = total - missing.length;
  return { percent: total ? Math.round((complete / total) * 100) : 0, complete, total, missing };
}

export async function runAmStageMacroQueue(
  steps: Array<{ id: AmStageMacroStep; run: (signal: AbortSignal) => Promise<void> }>,
  signal: AbortSignal,
  onStep?: (step: AmStageMacroStep, index: number, total: number) => void,
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    if (signal.aborted) throw new DOMException("Macro cancelled", "AbortError");
    onStep?.(step.id, index + 1, steps.length);
    await step.run(signal);
  }
}
