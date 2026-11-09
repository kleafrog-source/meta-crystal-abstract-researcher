export type Lfm3Runtime = "llama.cpp" | "ollama";
export type Lfm3PromptMode = "describe" | "asr";

export function parseLfm3Runtime(value: unknown): Lfm3Runtime {
  if (value === undefined || value === null || value === "") return "ollama";
  if (value === "llama.cpp") return value;
  if (value === "ollama") return value;
  throw new Error("Unsupported LFM3 runtime. Choose llama.cpp or Ollama.");
}

export function normalizeLfm3Window(offsetValue: unknown, durationValue: unknown): { offset: number; duration: number } {
  const offset = Number(offsetValue);
  const duration = Number(durationValue);
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(duration) || duration < 0.25 || duration > 30) {
    throw new Error("Select an audio window from 0.25 to 30 seconds.");
  }
  return { offset, duration };
}

export function buildLfm3Prompt(mode: Lfm3PromptMode, context?: { left: string; right: string }): string {
  const base = mode === "asr"
    ? "Perform ASR in English."
    : "Describe the audible sounds, instrumentation, vocals, rhythm, and spatial character in one concise English paragraph. Mention only properties directly supported by this audio, mark uncertainty, and do not infer parameter values. Keep the result under 800 characters.";
  if (!context) return base;
  return `${base}\n\nNeighboring descriptions are context only and are not evidence about the audio you received. Describe only this audio sample; do not copy either neighboring description as a result. Use them only to clarify possible change or continuity, and state uncertainty when this short sample does not establish a claim.\nLeft anchor (earlier node): ${context.left}\nRight anchor (later node): ${context.right}`;
}

export function cleanLfm3Output(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/<\|im_start\|>assistant\s*/gu, "")
    .replace(/<\|im_end\|>|<\|end_of_task\|>/gu, "")
    .trim()
    .slice(0, 1_200);
}
