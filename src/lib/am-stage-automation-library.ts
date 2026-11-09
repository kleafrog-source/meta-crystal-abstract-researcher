import type { AmStageMacroStep } from "@/lib/am-stage-macros";

export type AutomationStart = "audio_only" | "brief_only" | "audio_and_brief" | "empty";
export type AutomationGoal =
  | "multi_source_stage2"
  | "gemma_value_pass"
  | "two_cycle_stage2"
  | "whole_track_gemma"
  | "vocal_focused"
  | "instrument_focused"
  | "bounded_segments"
  | "priority_timeline_export";

export interface AmStageAutomationPreset {
  id: string;
  title: { en: string; ru: string };
  start: AutomationStart;
  goal: AutomationGoal;
  steps: AmStageMacroStep[];
  requires: string[];
  description: { en: string; ru: string };
  unavailableReason?: { en: string; ru: string };
  layerMask?: string[];
  maxSegments?: number;
  windowMode?: "beat";
}

export interface AmStageSavedAutomation {
  id: string;
  name: string;
  steps: AmStageMacroStep[];
  updatedAt: string;
}

export const AM_STAGE_AUTOMATION_STORAGE_KEY = "am-stage-automation-library-v1";

export const AM_STAGE_AUTOMATION_PRESETS: AmStageAutomationPreset[] = [
  {
    id: "multi-source-stage2",
    title: { en: "Multi-source → Server Stage-2", ru: "Несколько источников → Server Stage-2" },
    start: "audio_and_brief", goal: "multi_source_stage2",
    steps: ["text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved", "stage2.server"],
    requires: ["audio", "brief", "nodes", "qwen-index", "clap-index", "siglip-index", "settings"],
    description: { en: "Qwen text + available audio/spec banks, then server fusion.", ru: "Текст Qwen и доступные аудио/спектральные банки, затем серверное объединение." },
  },
  {
    id: "gemma-full-values",
    title: { en: "Gemma text + audio values", ru: "Значения Gemma: текст + аудио" },
    start: "audio_and_brief", goal: "gemma_value_pass",
    steps: ["text.gemma.awtd", "text.gemma.resolved", "audio.gemma.awtd", "audio.gemma.resolved"],
    requires: ["audio", "brief", "gemma-index", "settings"],
    description: { en: "Resolve the text and session-audio Gemma banks against the Brief.", ru: "Согласовать текстовый и аудиобанк Gemma с Brief." },
  },
  {
    id: "two-cycle-stage2",
    title: { en: "Two cycles → Stage-2", ru: "Два цикла → Stage-2" },
    start: "audio_and_brief", goal: "two_cycle_stage2", steps: [], requires: ["audio", "brief", "nodes", "indexes"],
    description: { en: "Two independent retrieval cycles followed by Stage-2.", ru: "Два независимых цикла поиска с последующим Stage-2." },
    unavailableReason: { en: "The runner cannot store separate cycle outputs and feed them independently yet.", ru: "Исполнитель пока не сохраняет результаты циклов раздельно для передачи в Stage-2." },
  },
  {
    id: "whole-track-gemma",
    title: { en: "Whole track → Gemma values", ru: "Весь трек → значения Gemma" },
    start: "audio_and_brief", goal: "whole_track_gemma",
    steps: ["audio.gemma.awtd", "audio.gemma.resolved"], requires: ["audio", "brief", "gemma-index", "settings"],
    description: { en: "Searches the session file in sequential WAV chunks capped at 20 seconds.", ru: "Ищет по файлу сессии последовательными WAV-фрагментами до 20 секунд." },
  },
  {
    id: "vocal-focused",
    title: { en: "Vocal-focused pass", ru: "Вокально-ориентированный проход" },
    start: "audio_and_brief", goal: "vocal_focused",
    steps: ["text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved", "stage2.server"],
    requires: ["audio", "brief", "nodes", "qwen-index", "clap-index", "siglip-index", "settings"],
    layerMask: ["VOCAL_MORPHOLOGY_LAYER"],
    description: { en: "Applies the Vocal Morphology layer mask before retrieval.", ru: "Перед поиском включает маску слоя «Вокальная морфология»." },
  },
  {
    id: "instrument-focused",
    title: { en: "Music / instrument pass", ru: "Музыкальный / инструментальный проход" },
    start: "audio_and_brief", goal: "instrument_focused",
    steps: ["text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved", "stage2.server"],
    requires: ["audio", "brief", "nodes", "qwen-index", "clap-index", "siglip-index", "settings"],
    layerMask: ["SYNTHESIS_PHYSICS_LAYER", "SPECTRAL_DSP_LAYER", "SPATIAL_BINAURAL_LAYER", "DYNAMICS_ENVELOPE_LAYER", "TEMPORAL_RHYTHM_LAYER", "GENERATIVE_CHAOS_LAYER", "COMPOSITIONAL_VECTOR_LAYER", "MODULATION_PERFORMANCE_LAYER"],
    description: { en: "Uses all acoustic layers except Vocal Morphology.", ru: "Использует акустические слои, кроме «Вокальной морфологии»." },
  },
  {
    id: "bounded-beat-segments",
    title: { en: "Bounded beat-aligned pass · ≤15", ru: "Ограниченный проход по долям · ≤15" },
    start: "audio_only", goal: "bounded_segments",
    steps: ["audio.clap.resolved", "spec.siglip.resolved"], requires: ["audio", "nodes≤15", "beat-events", "clap-index", "siglip-index", "settings"],
    maxSegments: 15, windowMode: "beat",
    description: { en: "Re-splits on beat events when available, with at most 15 analysis nodes.", ru: "Повторно строит окна по долям при наличии событий, максимум 15 узлов анализа." },
  },
  {
    id: "priority-timeline-export",
    title: { en: "Priority Timeline export", ru: "Экспорт Priority Timeline" },
    start: "empty", goal: "priority_timeline_export", steps: [], requires: ["bounded-nodes", "parameters", "stage2-filter"],
    description: { en: "Bounded node/parameter export with optional Stage-2 filtering.", ru: "Экспорт ограниченного числа узлов и параметров с фильтром Stage-2." },
    unavailableReason: { en: "Priority Timeline export is not exposed as an automation step yet. Load audio or enter a Brief to start a supported chain.", ru: "Экспорт Priority Timeline пока недоступен как шаг автоматизации. Загрузите аудио или введите Brief для запуска поддерживаемой цепочки." },
  },
];

export function makeSavedAutomation(name: string, steps: AmStageMacroStep[] = []): AmStageSavedAutomation {
  return { id: `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`, name, steps, updatedAt: new Date().toISOString() };
}
