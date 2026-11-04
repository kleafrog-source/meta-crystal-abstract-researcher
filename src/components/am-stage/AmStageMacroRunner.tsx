"use client";

import { useUiText } from "@/lib/ui-i18n";
import { AM_STAGE_MACRO_IDS, AM_STAGE_MACRO_STEPS, type AmStageCompleteness, type AmStageMacroId, type AmStageMacroStep } from "@/lib/am-stage-macros";
import { Button } from "@/components/ui/button";
import { ChevronDown, ListChecks, Play, Square } from "lucide-react";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";

const PROFILE_LABELS: Record<AmStageMacroId, string> = {
  full_core: "Full core",
  text_gemma: "Gemma text",
  audio_core: "Audio core · CLAP + SigLIP2",
  gemma_audio_then_resolve: "Gemma audio → resolve",
  custom: "Custom sequence",
};
const STEP_LABELS: Record<AmStageMacroStep, string> = {
  "text.qwen.resolved": "Qwen3 text · resolved",
  "text.gemma.awtd": "Gemma text · AWTD",
  "text.gemma.resolved": "Gemma text · resolved",
  "audio.clap.resolved": "CLAP audio · resolved",
  "spec.siglip.resolved": "SigLIP2 spectrogram · resolved",
  "audio.gemma.awtd": "Gemma audio · AWTD",
  "audio.gemma.resolved": "Gemma audio · resolved",
  "stage2.client": "Client Stage-2",
  "stage2.server": "Server Stage-2",
};

export function AmStageMacroRunner({
  profile, onProfileChange, requireGemmaResolution, onRequireGemmaResolutionChange,
  includeStage2, onIncludeStage2Change,
  customSteps, onCustomStepsChange, completeness, isRunning, currentStep,
  segmentCount, topK, onRun, onCancel, error, siglipStatus,
}: {
  profile: AmStageMacroId;
  onProfileChange: (profile: AmStageMacroId) => void;
  requireGemmaResolution: boolean;
  onRequireGemmaResolutionChange: (value: boolean) => void;
  includeStage2: boolean;
  onIncludeStage2Change: (value: boolean) => void;
  customSteps: AmStageMacroStep[];
  onCustomStepsChange: (steps: AmStageMacroStep[]) => void;
  completeness: AmStageCompleteness;
  isRunning: boolean;
  currentStep: string;
  segmentCount: number;
  topK: number;
  onRun: () => void;
  onCancel: () => void;
  error: string;
  siglipStatus: { status?: string; ready?: boolean; stale_reasons?: string[] } | null;
}) {
  const t = useUiText();
  const qwenEnabled = useCapabilityEnabled("text.qwen.resolved");
  const gemmaTextEnabled = useCapabilityEnabled("text.gemma.awtd");
  const gemmaTextResolvedEnabled = useCapabilityEnabled("text.gemma.resolved");
  const clapEnabled = useCapabilityEnabled("audio.clap.resolved");
  const siglipEnabled = useCapabilityEnabled("spec.siglip.resolved");
  const gemmaAudioEnabled = useCapabilityEnabled("audio.gemma.awtd");
  const gemmaAudioResolvedEnabled = useCapabilityEnabled("audio.gemma.resolved");
  const requiredCapabilities = profile === "full_core"
    ? [qwenEnabled, ...(requireGemmaResolution ? [gemmaTextEnabled, gemmaTextResolvedEnabled] : [])]
    : profile === "text_gemma"
      ? [gemmaTextEnabled, ...(requireGemmaResolution ? [gemmaTextResolvedEnabled] : [])]
      : profile === "audio_core"
        ? [clapEnabled, siglipEnabled]
        : profile === "gemma_audio_then_resolve"
          ? [gemmaAudioEnabled, ...(requireGemmaResolution ? [gemmaAudioResolvedEnabled] : [])]
          : customSteps.map((step) => step === "text.qwen.resolved" ? qwenEnabled : step === "text.gemma.awtd" ? gemmaTextEnabled : step === "text.gemma.resolved" ? gemmaTextResolvedEnabled : step === "audio.clap.resolved" ? clapEnabled : step === "spec.siglip.resolved" ? siglipEnabled : step === "audio.gemma.awtd" ? gemmaAudioEnabled : step === "audio.gemma.resolved" ? gemmaAudioResolvedEnabled : true);
  const disabledBySettings = requiredCapabilities.some((enabled) => enabled === false);
  const estimatedLoad = segmentCount * topK * 2;
  const addCustomStep = (step: AmStageMacroStep) => onCustomStepsChange([...customSteps, step]);
  const moveCustomStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= customSteps.length) return;
    const next = [...customSteps];
    [next[index], next[target]] = [next[target], next[index]];
    onCustomStepsChange(next);
  };

  return <details data-am-stage-disclosure="macros" className="rounded-lg border border-cyan-400/20 bg-black/25 p-2">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-cyan-200 [&::-webkit-details-marker]:hidden"><ListChecks className="size-3.5" />{t("Macros")}<span className="ml-auto text-[10px] text-muted-foreground">{completeness.percent}% · {completeness.complete}/{completeness.total}</span><ChevronDown className="am-stage-disclosure-chevron size-3.5" /></summary>
    <div className="mt-2 space-y-2">
      {siglipStatus && !siglipStatus.ready ? <p role="status" className="text-[10px] text-amber-200">{t("SigLIP index")}: {t(siglipStatus.status ?? "unavailable")} · {siglipStatus.stale_reasons?.join("; ")}. {t("Rebuild it from Service Bay before running this macro.")}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="am-stage-macro-profile">{t("Macro profile")}</label>
        <select id="am-stage-macro-profile" aria-label={t("Macro profile")} value={profile} disabled={isRunning} onChange={(event) => onProfileChange(event.target.value as AmStageMacroId)} className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-2 text-[10px] text-foreground">
          {AM_STAGE_MACRO_IDS.map((id) => <option key={id} value={id}>{t(PROFILE_LABELS[id])}</option>)}
        </select>
        <Button size="sm" className="h-7 px-2" disabled={isRunning || disabledBySettings || (profile === "custom" && !customSteps.length)} title={disabledBySettings ? t("Disabled in Settings") : undefined} onClick={onRun}>{isRunning ? <><Square className="size-3" />{t("Running")}</> : <><Play className="size-3" />{t("Run macro")}</>}</Button>
        {isRunning ? <Button size="sm" variant="destructive" className="h-7 px-2" onClick={onCancel}><Square className="size-3" />{t("Cancel queue")}</Button> : null}
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><input type="checkbox" checked={requireGemmaResolution} disabled={isRunning} onChange={(event) => onRequireGemmaResolutionChange(event.target.checked)} />{t("Include Gemma value resolution")}</label>
      {profile === "full_core" ? <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><input type="checkbox" checked={includeStage2} disabled={isRunning} onChange={(event) => onIncludeStage2Change(event.target.checked)} />{t("Include optional server Stage-2")}</label> : null}
      {profile === "custom" ? <div className="space-y-1 rounded border border-white/10 p-1.5">
        <div className="flex gap-1"><select aria-label={t("Add macro step")} id="am-stage-custom-step" className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-2 text-[10px] text-foreground">{AM_STAGE_MACRO_STEPS.map((step) => <option key={step} value={step}>{t(STEP_LABELS[step])}</option>)}</select><Button size="sm" variant="outline" className="h-7 px-2" disabled={isRunning} onClick={() => { const select = document.getElementById("am-stage-custom-step") as HTMLSelectElement | null; if (select) addCustomStep(select.value as AmStageMacroStep); }}>{t("Add")}</Button></div>
        {customSteps.map((step, index) => <div key={`${step}-${index}`} className="flex items-center gap-1 text-[10px]"><span className="w-5 text-muted-foreground">{index + 1}.</span><span className="min-w-0 flex-1 truncate">{t(STEP_LABELS[step])}</span><Button size="sm" variant="ghost" className="h-6 px-1" disabled={isRunning || index === 0} onClick={() => moveCustomStep(index, -1)}>↑</Button><Button size="sm" variant="ghost" className="h-6 px-1" disabled={isRunning || index === customSteps.length - 1} onClick={() => moveCustomStep(index, 1)}>↓</Button><Button size="sm" variant="ghost" className="h-6 px-1" disabled={isRunning} onClick={() => onCustomStepsChange(customSteps.filter((_, i) => i !== index))}>×</Button></div>)}
      </div> : null}
      <div role="progressbar" aria-label={t("Session completeness")} aria-valuenow={completeness.percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${completeness.percent}%` }} /></div>
      <p className="text-[9px] text-muted-foreground">{completeness.missing.length ? `${t("Missing")}: ${completeness.missing.map((step) => t(STEP_LABELS[step])).join(" · ")}` : t("Selected macro checklist complete.")}</p>
      {isRunning ? <p role="status" aria-live="polite" className="text-[10px] text-cyan-200">{currentStep}</p> : null}
      {estimatedLoad > 5_000 ? <p className="text-[9px] text-amber-200">{t("Large run estimate")}: {segmentCount} × {topK} × 2 ≈ {estimatedLoad.toLocaleString()} candidate slots. {t("Consider fewer segments or lower Top-K before export.")}</p> : null}
      {error ? <p role="alert" className="break-words text-[10px] text-red-300">{error}</p> : null}
    </div>
  </details>;
}
