/**
 * Editor visual constants — port kind colors/labels, status presentation.
 *
 * Colors are semantic accents per data kind (typed ports, chaiNNer-style):
 * during a connection drag only compatible handles stay visibly active.
 * Statuses always combine color + icon/text (color is never the only signal).
 */

import type { PortKind, StageStatus } from "./adapter";
type AttemptStatus = "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
type RunStatus = "preparing" | "running" | "stopping" | "stopped" | "failed" | "interrupted" | "finished";

export const KIND_COLORS: Record<PortKind, string> = {
  brief: "#d97706", // amber-600
  "segment-plan": "#059669", // emerald-600
  "parameter-bank": "#dc2626", // red-600
  description: "#9333ea", // purple-600
  transcription: "#c026d3", // fuchsia-600
  "audio-analysis": "#ea580c", // orange-600
  "acoustic-analysis": "#d97706", // amber-600 (librosa features)
  "language-analysis": "#0891b2", // cyan-600
  "voice-analysis": "#be185d", // pink-700
  "helm-analysis": "#78716c", // stone-500 (disabled capability)
  "gap-descriptions": "#7c3aed", // violet-600
  "text-feature-snapshot": "#65a30d", // lime-600
  "ranking-variants": "#4d7c0f", // lime-700
  "natural-description": "#0d9488", // teal-600
  "reverse-query": "#db2777", // pink-600
  "run-bundle": "#57534e", // stone-600
  text: "#b45309", // amber-700 (plain text)
  "record-set": "#475569", // slate-600
  decision: "#0f766e", // teal-700 (flow decision)
  "vocal-allocation": "#c026d3", // fuchsia-600
  "flowmusic-timeline": "#0369a1", // sky-700
  "llm-advice": "#9333ea", // purple-600
};

export const KIND_LABELS_RU: Record<PortKind, string> = {
  brief: "Brief (текст задания)",
  "segment-plan": "План сегментов (узлы Рабочей оси)",
  "parameter-bank": "Банк параметров",
  description: "Описание (по узлам)",
  transcription: "Транскрипция (по узлам)",
  "audio-analysis": "Акустический анализ",
  "acoustic-analysis": "Акустические признаки (Librosa)",
  "language-analysis": "Определение языка",
  "voice-analysis": "Оценка тембра",
  "helm-analysis": "HELM-анализ (отключено)",
  "gap-descriptions": "Описания пробелов",
  "text-feature-snapshot": "Снимок текстовых признаков",
  "ranking-variants": "Варианты рейтинга",
  "natural-description": "Описание признаков (LLM)",
  "reverse-query": "Обратный запрос",
  "run-bundle": "Свёртка результатов прогона",
  text: "Текст",
  "record-set": "Набор записей",
  decision: "Решение маршрутизации",
  "vocal-allocation": "Vocal allocation (матрица)",
  "flowmusic-timeline": "FLOWMUSIC-таймлайн",
  "llm-advice": "Рекомендация LLM",
};

/** Palette grouping (families from the action catalog, RU labels). */
export const FAMILY_LABELS_RU: Record<string, string> = {
  brief: "Brief · источники текста",
  audio: "Аудио · анализ и узлы",
  text: "Текст · retrieval",
  spectrogram: "Спектрограмма · retrieval",
  stage2: "Stage-2 · консенсус",
  "text-features": "Признаки · статистика",
  bundle: "Результаты · сборка",
};

/** Stage status presentation: color + icon + RU label (never color-only). */
export const STAGE_STATUS_META: Record<StageStatus, { label: string; icon: string; className: string }> = {
  pending: { label: "ожидает", icon: "◌", className: "bg-muted text-muted-foreground border-border" },
  running: { label: "выполняется", icon: "▶", className: "bg-amber-500/15 text-amber-800 border-amber-500/50" },
  succeeded: { label: "успех", icon: "✓", className: "bg-emerald-500/15 text-emerald-800 border-emerald-500/50" },
  failed: { label: "ошибка", icon: "✕", className: "bg-red-500/15 text-red-800 border-red-500/50" },
  cancelled: { label: "отменено", icon: "⊘", className: "bg-stone-500/15 text-stone-700 border-stone-500/40" },
  interrupted: { label: "прервано", icon: "⏸", className: "bg-orange-500/15 text-orange-800 border-orange-500/50" },
  skipped: { label: "пропущено", icon: "⤼", className: "bg-muted/60 text-muted-foreground/80 border-dashed" },
};

export const RUN_STATUS_META: Record<RunStatus, { label: string; className: string }> = {
  preparing: { label: "подготовка", className: "bg-slate-500/15 text-slate-700 border-slate-500/40" },
  running: { label: "выполняется", className: "bg-amber-500/15 text-amber-800 border-amber-500/50" },
  stopping: { label: "останавливается", className: "bg-orange-500/15 text-orange-800 border-orange-500/50" },
  stopped: { label: "остановлено", className: "bg-stone-500/15 text-stone-700 border-stone-500/40" },
  failed: { label: "ошибка", className: "bg-red-500/15 text-red-800 border-red-500/50" },
  interrupted: { label: "прервано", className: "bg-orange-500/15 text-orange-800 border-orange-500/50" },
  finished: { label: "завершено", className: "bg-emerald-500/15 text-emerald-800 border-emerald-500/50" },
};

export const ATTEMPT_STATUS_RU: Record<AttemptStatus, string> = {
  running: "выполняется",
  succeeded: "успех",
  failed: "ошибка",
  cancelled: "отменено",
  interrupted: "прервано",
};

/** Data-kind edge stroke color. */
export function edgeColor(kind: string | undefined, isDependency: boolean): string {
  if (isDependency) return "#a8a29e"; // stone-400, dashed dependency
  if (kind && kind in KIND_COLORS) return KIND_COLORS[kind as PortKind];
  return "#78716c";
}

/** Human (RU) bank names for Stage destinations — the chip shows these;
 *  technical bankId/pass stay in tooltips/details. */
export const BANK_LABELS_RU: Record<string, string> = {
  "qwen-text": "Qwen · текст",
  "gemma-text": "Gemma · текст",
  clap: "CLAP · аудио",
  siglip: "SigLIP · спектрограмма",
  "gemma-audio": "Gemma · аудио",
  "client-stage2": "Stage-2 · консенсус",
  "server-stage2": "Stage-2 · второй проход",
};

/** Human (RU) pass names (retrieval pass of a bank). */
export const PASS_LABELS_RU: Record<string, string> = {
  resolved: "значения",
  awtd: "имена",
  "client-smooth": "сглаживание",
  stage2: "второй проход",
};
