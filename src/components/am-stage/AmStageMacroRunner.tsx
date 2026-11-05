"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUiText } from "@/lib/ui-i18n";
import { AM_STAGE_MACRO_STEPS, type AmStageMacroStep } from "@/lib/am-stage-macros";
import { AM_STAGE_AUTOMATION_PRESETS, AM_STAGE_AUTOMATION_STORAGE_KEY, makeSavedAutomation, type AmStageSavedAutomation } from "@/lib/am-stage-automation-library";
import { Button } from "@/components/ui/button";
import { ChevronDown, ListChecks, Play, Square } from "lucide-react";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";
import type { ActiveParameter } from "@/lib/rag-v3/types";

export interface AmStageAutomationOutput {
  step: AmStageMacroStep;
  generatedAt: string;
  parameters: ActiveParameter[];
}

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
const STEP_INDEX: Partial<Record<AmStageMacroStep, "composite" | "embeddinggemma2_text" | "clap" | "siglip">> = {
  "text.qwen.resolved": "composite", "text.gemma.awtd": "embeddinggemma2_text", "text.gemma.resolved": "embeddinggemma2_text",
  "audio.clap.resolved": "clap", "spec.siglip.resolved": "siglip", "audio.gemma.awtd": "embeddinggemma2_text", "audio.gemma.resolved": "embeddinggemma2_text", "stage2.server": "composite",
};
const STEP_NEEDS_AUDIO = (step: AmStageMacroStep) => step.startsWith("audio.") || step.startsWith("spec.");
const STEP_NEEDS_BRIEF = (step: AmStageMacroStep) => step.startsWith("text.") || step === "stage2.server";
const STEP_NEEDS_NODES = (step: AmStageMacroStep) => step === "audio.clap.resolved" || step === "spec.siglip.resolved";
type AuditPayload = { artifacts?: Array<{ kind: string; status: string; reason?: string | null }> };
type CheckRow = { label: string; status: "ok" | "missing" | "unknown" | "off" | "stale"; detail?: string; href?: string };

export function AmStageMacroRunner({
  isRunning, currentStep, segmentCount, topK, onRun, onCancel, error, siglipStatus,
  outputs, onClearOutputs, audioPresent, briefPresent, nodesReady, onLayerMaskChange, onPreparePreset,
}: {
  isRunning: boolean;
  currentStep: string;
  segmentCount: number;
  topK: number;
  onRun: (steps: AmStageMacroStep[], presetId: string) => void;
  onCancel: () => void;
  error: string;
  siglipStatus: { status?: string; ready?: boolean; stale_reasons?: string[] } | null;
  outputs: AmStageAutomationOutput[];
  onClearOutputs: () => void;
  audioPresent: boolean;
  briefPresent: boolean;
  nodesReady: boolean;
  onLayerMaskChange: (layers: string[]) => void;
  onPreparePreset: (presetId: string) => Promise<void>;
}) {
  const t = useUiText();
  const translatePair = (value: { en: string; ru: string }) => t(value.en);
  const [custom, setCustom] = useState<AmStageSavedAutomation[]>([]);
  const [selectedId, setSelectedId] = useState("multi-source-stage2");
  const [storageReady, setStorageReady] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState("");
  const qwenEnabled = useCapabilityEnabled("text.qwen.resolved");
  const gemmaTextEnabled = useCapabilityEnabled("text.gemma.awtd");
  const gemmaTextResolvedEnabled = useCapabilityEnabled("text.gemma.resolved");
  const clapEnabled = useCapabilityEnabled("audio.clap.resolved");
  const siglipEnabled = useCapabilityEnabled("spec.siglip.resolved");
  const gemmaAudioEnabled = useCapabilityEnabled("audio.gemma.awtd");
  const gemmaAudioResolvedEnabled = useCapabilityEnabled("audio.gemma.resolved");
  const enabledByStep: Record<AmStageMacroStep, boolean | null> = {
    "text.qwen.resolved": qwenEnabled, "text.gemma.awtd": gemmaTextEnabled, "text.gemma.resolved": gemmaTextResolvedEnabled,
    "audio.clap.resolved": clapEnabled, "spec.siglip.resolved": siglipEnabled, "audio.gemma.awtd": gemmaAudioEnabled,
    "audio.gemma.resolved": gemmaAudioResolvedEnabled, "stage2.client": true, "stage2.server": qwenEnabled,
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AM_STAGE_AUTOMATION_STORAGE_KEY);
      if (raw) {
        const value = JSON.parse(raw) as { custom?: AmStageSavedAutomation[]; selectedId?: string };
        if (Array.isArray(value.custom)) setCustom(value.custom.filter((item) => item && typeof item.id === "string" && Array.isArray(item.steps)));
        if (typeof value.selectedId === "string") setSelectedId(value.selectedId);
      }
    } catch { /* Keep this browser's library usable if storage has invalid JSON. */ }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (storageReady) {
      try { window.localStorage.setItem(AM_STAGE_AUTOMATION_STORAGE_KEY, JSON.stringify({ custom, selectedId })); }
      catch { /* Storage can be disabled; the current session's editor still works. */ }
    }
  }, [custom, selectedId, storageReady]);

  const preset = AM_STAGE_AUTOMATION_PRESETS.find((item) => item.id === selectedId) ?? null;
  const selectedCustom = custom.find((item) => item.id === selectedId) ?? null;
  const selectedSteps = preset?.steps ?? selectedCustom?.steps ?? [];
  const isCustom = Boolean(selectedCustom);
  const artifacts = new Map((audit?.artifacts ?? []).map((item) => [item.kind, item]));

  const runChecks = useMemo((): CheckRow[] => {
    const rows: CheckRow[] = [];
    const unique = [...new Set(selectedSteps)];
    if (unique.some(STEP_NEEDS_AUDIO)) rows.push({ label: t("Session audio"), status: audioPresent ? "ok" : "missing", detail: audioPresent ? t("Loaded") : t("Load audio before running audio steps.") });
    if (unique.some(STEP_NEEDS_BRIEF)) rows.push({ label: t("Brief"), status: briefPresent ? "ok" : "missing", detail: briefPresent ? t("Ready") : t("Enter a Brief before text retrieval.") });
    if (unique.some(STEP_NEEDS_NODES)) rows.push({ label: t("Analysis nodes"), status: nodesReady ? "ok" : "missing", detail: nodesReady ? `${segmentCount}` : t("Auto-split is required for CLAP and SigLIP2.") });
    if (preset?.maxSegments) rows.push({ label: t("Segment limit"), status: segmentCount <= preset.maxSegments ? "ok" : "missing", detail: `${segmentCount} / ${preset.maxSegments}` });
    for (const step of unique) {
      const index = STEP_INDEX[step];
      if (!index || rows.some((row) => row.label === index)) continue;
      if (index === "siglip") {
        rows.push({ label: index, status: siglipStatus?.ready ? "ok" : "stale", detail: siglipStatus?.ready ? t("Ready") : t("Rebuild from Service Bay."), href: "/am-core#service-bay" });
        continue;
      }
      const artifact = artifacts.get(index);
      const ready = artifact?.status === "ready" || artifact?.status === "built";
      rows.push({ label: index, status: !audit ? "unknown" : ready ? "ok" : "stale", detail: !audit ? t("Check index status first.") : ready ? t("Ready") : artifact?.reason || t("Rebuild from Service Bay."), href: "/am-core#service-bay" });
    }
    const disabledSteps = unique.filter((step) => enabledByStep[step] === false);
    if (disabledSteps.length) rows.push({ label: t("Banks in Settings"), status: "off", detail: `${t("Disabled")}: ${disabledSteps.map((step) => t(STEP_LABELS[step])).join(" · ")}`, href: "/?page=settings" });
    const unknownSteps = unique.filter((step) => enabledByStep[step] === null);
    if (unknownSteps.length && !disabledSteps.length) rows.push({ label: t("Banks in Settings"), status: "unknown", detail: t("Loading capability settings…"), href: "/?page=settings" });
    return rows;
  }, [audioPresent, briefPresent, nodesReady, segmentCount, selectedSteps, preset, siglipStatus, audit, qwenEnabled, gemmaTextEnabled, gemmaTextResolvedEnabled, clapEnabled, siglipEnabled, gemmaAudioEnabled, gemmaAudioResolvedEnabled, t]);
  const blocked = Boolean(preset?.unavailableReason) || !selectedSteps.length || runChecks.some((row) => row.status !== "ok");
  const canRun = !blocked && !isRunning && !auditBusy && !runChecks.some((row) => row.status === "unknown");

  const refreshAudit = async () => {
    setAuditBusy(true);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "audit" }), cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setAudit(await response.json() as AuditPayload); setAuditError("");
    } catch (cause) {
      setAudit(null);
      setAuditError(cause instanceof Error ? cause.message : String(cause));
    } finally { setAuditBusy(false); }
  };
  const saveCustom = (next: AmStageSavedAutomation[]) => setCustom(next.map((item) => ({ ...item, updatedAt: new Date().toISOString() })));
  const selectedIndex = custom.findIndex((item) => item.id === selectedId);
  const updateCustomSteps = (steps: AmStageMacroStep[]) => saveCustom(custom.map((item) => item.id === selectedId ? { ...item, steps } : item));
  const createCustom = () => {
    const item = makeSavedAutomation(t("New automation"));
    saveCustom([...custom, item]); setSelectedId(item.id); setNameDraft(item.name);
  };
  const renameCustom = () => { if (!selectedCustom || !nameDraft.trim()) return; saveCustom(custom.map((item) => item.id === selectedId ? { ...item, name: nameDraft.trim() } : item)); };
  const duplicateCustom = () => { if (!selectedCustom) return; const item = makeSavedAutomation(`${selectedCustom.name} · ${t("copy")}`, [...selectedCustom.steps]); saveCustom([...custom, item]); setSelectedId(item.id); setNameDraft(item.name); };
  const deleteCustom = () => { const next = custom.filter((item) => item.id !== selectedId); saveCustom(next); setSelectedId("multi-source-stage2"); setNameDraft(""); };
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedSteps.length) return;
    const next = [...selectedSteps]; [next[index], next[target]] = [next[target], next[index]]; updateCustomSteps(next);
  };
  const selectAutomation = (id: string) => {
    setSelectedId(id);
    const nextPreset = AM_STAGE_AUTOMATION_PRESETS.find((item) => item.id === id);
    if (nextPreset) onLayerMaskChange(nextPreset.layerMask ?? []);
    else onLayerMaskChange([]);
    setNameDraft(custom.find((item) => item.id === id)?.name ?? "");
    setAudit(null);
  };
  const exportOutput = (output: AmStageAutomationOutput, format: "txt" | "json") => {
    const body = format === "txt"
      ? [`# ${t(STEP_LABELS[output.step])} · ${output.generatedAt}`, ...output.parameters.map((parameter) => `${parameter.technical_name}: ${String(parameter.current_value ?? parameter.suggested_value ?? "")}`)].join("\n")
      : JSON.stringify({ schema: "am_stage_automation_step_v1", step_id: output.step, step_label: t(STEP_LABELS[output.step]), generated_at: output.generatedAt, parameters: output.parameters }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: format === "json" ? "application/json" : "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `am-stage-${output.step}-${format}.${format}`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <details data-am-stage-disclosure="macros" className="rounded-lg border border-cyan-400/20 bg-black/25 p-2">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-cyan-200 [&::-webkit-details-marker]:hidden"><ListChecks className="size-3.5" />{t("Automation")}<span className="ml-auto text-[10px] text-muted-foreground">{selectedSteps.length} {t("steps")}</span><ChevronDown className="am-stage-disclosure-chevron size-3.5" /></summary>
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="am-stage-automation-select">{t("Automation sequence")}</label>
        <select id="am-stage-automation-select" aria-label={t("Automation sequence")} value={selectedId} disabled={isRunning} onChange={(event) => selectAutomation(event.target.value)} className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-2 text-[10px] text-foreground">
          <optgroup label={t("Built-in presets")}>{AM_STAGE_AUTOMATION_PRESETS.map((item) => <option key={item.id} value={item.id}>{translatePair(item.title)}{item.unavailableReason ? ` · ${t("unavailable")}` : ""}</option>)}</optgroup>
          {custom.length ? <optgroup label={t("Saved automations")}>{custom.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup> : null}
        </select>
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={isRunning} onClick={createCustom}>{t("New")}</Button>
        <Button size="sm" className="h-7 px-2" disabled={!canRun} title={blocked ? t("Resolve the preconditions below before running.") : undefined} onClick={() => onRun(selectedSteps, selectedId)}>{isRunning ? <><Square className="size-3" />{t("Running")}</> : <><Play className="size-3" />{t("Run automation")}</>}</Button>
        {isRunning ? <Button size="sm" variant="destructive" className="h-7 px-2" onClick={onCancel}><Square className="size-3" />{t("Cancel queue")}</Button> : null}
      </div>
      {preset ? <div className="rounded border border-white/10 px-2 py-1 text-[10px] text-muted-foreground"><span className="text-cyan-200">{t("Start")}: {t(preset.start.replaceAll("_", " "))}</span> · <span>{t("Goal")}: {t(preset.goal.replaceAll("_", " "))}</span> · {translatePair(preset.description)}{preset.layerMask ? <div className="mt-1 text-violet-200">{t("Layer mask")}: {preset.layerMask.map((layer) => t(layer)).join(" · ")}</div> : null}</div> : null}
      {preset?.windowMode ? <Button size="sm" variant="outline" className="h-7 px-2" disabled={!audioPresent || isRunning} onClick={() => void onPreparePreset(preset.id)}>{t("Prepare ≤15 beat-aligned nodes")}</Button> : null}
      {!audioPresent && !briefPresent ? <p className="text-[10px] text-amber-200">{t("Load audio or enter a Brief to start a supported automation.")}</p> : null}
      {isCustom ? <div className="space-y-1 rounded border border-white/10 p-1.5">
        <div className="flex gap-1"><input aria-label={t("Automation name")} value={nameDraft || selectedCustom?.name || ""} onChange={(event) => setNameDraft(event.target.value)} className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-2 text-[10px] text-foreground" /><Button size="sm" variant="outline" className="h-7 px-2" onClick={renameCustom}>{t("Rename")}</Button><Button size="sm" variant="outline" className="h-7 px-2" onClick={duplicateCustom}>{t("Duplicate")}</Button><Button size="sm" variant="destructive" className="h-7 px-2" onClick={deleteCustom}>{t("Delete")}</Button></div>
        <div className="flex gap-1"><select aria-label={t("Add automation step")} id="am-stage-custom-step" className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-2 text-[10px] text-foreground">{AM_STAGE_MACRO_STEPS.map((step) => <option key={step} value={step}>{t(STEP_LABELS[step])}</option>)}</select><Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { const select = document.getElementById("am-stage-custom-step") as HTMLSelectElement | null; if (select) updateCustomSteps([...selectedSteps, select.value as AmStageMacroStep]); }}>{t("Add")}</Button></div>
        {selectedSteps.map((step, index) => <div key={`${step}-${index}`} className="flex items-center gap-1 text-[10px]"><span className="w-5 text-muted-foreground">{index + 1}.</span><span className="min-w-0 flex-1 truncate">{t(STEP_LABELS[step])}</span><Button size="sm" variant="ghost" className="h-6 px-1" disabled={isRunning || index === 0} onClick={() => moveStep(index, -1)}>↑</Button><Button size="sm" variant="ghost" className="h-6 px-1" disabled={isRunning || index === selectedSteps.length - 1} onClick={() => moveStep(index, 1)}>↓</Button><Button size="sm" variant="ghost" className="h-6 px-1" disabled={isRunning} onClick={() => updateCustomSteps(selectedSteps.filter((_, i) => i !== index))}>×</Button></div>)}
        {selectedIndex >= 0 ? <p className="text-[9px] text-muted-foreground">{t("Saved in this browser and shared across app modes.")} · {custom.length}</p> : null}
      </div> : null}
      <section className="rounded border border-white/10 p-1.5" aria-label={t("Automation preconditions")}>
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px]"><strong>{t("Preconditions")}</strong><Button size="sm" variant="outline" className="h-6 px-1.5" disabled={auditBusy || isRunning} onClick={() => void refreshAudit()}>{auditBusy ? t("Checking…") : t("Check indexes")}</Button></div>
        {preset?.unavailableReason ? <p className="mb-1 text-[10px] text-amber-200">{translatePair(preset.unavailableReason)}</p> : null}
        {auditError ? <p role="alert" className="mb-1 text-[10px] text-red-300">{auditError}</p> : null}
        {runChecks.length ? <div className="grid gap-1 text-[9px] sm:grid-cols-2">{runChecks.map((row) => <div key={row.label} className="flex min-w-0 items-start gap-1 rounded bg-black/20 px-1.5 py-1"><span className={row.status === "ok" ? "text-emerald-300" : row.status === "unknown" ? "text-amber-200" : "text-red-300"}>{row.status === "ok" ? "✓" : row.status === "unknown" ? "…" : "!"}</span><span className="min-w-0 flex-1"><strong>{t(row.label)}</strong> · {row.href ? <Link className="text-cyan-200 underline" href={row.href}>{row.detail}</Link> : row.detail}</span></div>)}</div> : <p className="text-[9px] text-muted-foreground">{t("No steps in this sequence.")}</p>}
      </section>
      {isRunning ? <p role="status" aria-live="polite" className="text-[10px] text-cyan-200">{currentStep}</p> : null}
      {segmentCount * topK * 2 > 5_000 ? <p className="text-[9px] text-amber-200">{t("Large run estimate")}: {segmentCount} × {topK} × 2 ≈ {(segmentCount * topK * 2).toLocaleString()} {t("candidate slots")}.</p> : null}
      {error ? <p role="alert" className="break-words text-[10px] text-red-300">{error}</p> : null}
      {outputs.length ? <section className="space-y-1 rounded border border-cyan-400/20 p-1.5" aria-label={t("Automation step exports")}><div className="flex items-center justify-between gap-2 text-[10px]"><span className="font-medium text-cyan-200">{t("Step outputs")} · {outputs.length}</span><Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={onClearOutputs}>{t("Clear")}</Button></div><div className="max-h-40 space-y-1 overflow-y-auto">{outputs.map((output, index) => <div key={`${output.step}-${index}`} className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-1 text-[9px]"><span className="min-w-0 flex-1 truncate">{t(STEP_LABELS[output.step])} · {output.parameters.length}</span><Button size="sm" variant="outline" className="h-6 px-1.5" onClick={() => exportOutput(output, "txt")}>TXT</Button><Button size="sm" variant="outline" className="h-6 px-1.5" onClick={() => exportOutput(output, "json")}>JSON</Button></div>)}</div></section> : null}
    </div>
  </details>;
}
