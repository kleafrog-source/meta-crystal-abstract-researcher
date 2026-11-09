"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/lib/ui-i18n";

type RunSummary = { id: string; title: string; status: string; scenarioId: string | null; createdAt: string; currentStageId: string | null; stageCount: number };
type RunArtifact = { id: string; attemptId: string; kind: string; bankId?: string; pass?: string };
type RunStage = { stageId: string; actionId: string; status: string; successfulAttemptId?: string | null; artifacts?: RunArtifact[] };
type Selection = { runId: string; stageId: string; attemptId: string; artifactId: string };
type RunDetail = { stages?: RunStage[] };

export function AutomationStageHandoff({ currentAudioId, rangeStart, rangeEnd, brief, textIndex, topK, sources, scopes, domainLayers, vocalMatrixMode, searchMode, queryB, transitionRatio, instructionContext, initialSelection }: { currentAudioId?: string | null; rangeStart: number; rangeEnd: number; brief: string; textIndex: "qwen3" | "embeddinggemma2"; topK: number; sources: Record<string, boolean>; scopes: Record<string, boolean>; domainLayers: string[]; vocalMatrixMode: boolean; searchMode: "single" | "transition"; queryB: string; transitionRatio: number; instructionContext: Array<{ id: string; title: string; content: string; influence: number }>; initialSelection: Selection }) {
  const t = useUiText();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState(initialSelection.runId);
  const [stages, setStages] = useState<RunStage[]>([]);
  const [stageId, setStageId] = useState(initialSelection.stageId);
  const [artifactId, setArtifactId] = useState(initialSelection.artifactId);
  const [attemptId, setAttemptId] = useState(initialSelection.attemptId);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setRunId(initialSelection.runId); setStageId(initialSelection.stageId); setAttemptId(initialSelection.attemptId); setArtifactId(initialSelection.artifactId);
  }, [initialSelection.runId, initialSelection.stageId, initialSelection.attemptId, initialSelection.artifactId]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/am-stage/automation/runs?limit=50", { cache: "no-store" });
      const body = await response.json() as { runs?: RunSummary[] };
      if (!response.ok) throw new Error("Run history could not be loaded.");
      setRuns(body.runs ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  useEffect(() => {
    if (!runId) { setStages([]); setStageId(""); setArtifactId(""); setAttemptId(""); return; }
    let current = true;
    const controller = new AbortController();
    void fetch(`/api/am-stage/automation/runs/${encodeURIComponent(runId)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Run detail unavailable.");
      const body = await response.json() as { run?: RunDetail };
      if (!current) return;
      const items = body.run?.stages ?? [];
      setStages(items);
      setStageId((selected) => items.some((item) => item.stageId === selected) ? selected : items.find((item) => item.status === "succeeded")?.stageId ?? items[0]?.stageId ?? "");
    }).catch(() => { if (current && !controller.signal.aborted) { setStages([]); setStageId(""); setArtifactId(""); setAttemptId(""); } });
    return () => { current = false; controller.abort(); };
  }, [runId]);
  const stage = stages.find((item) => item.stageId === stageId);
  const artifacts = stage?.artifacts ?? [];
  useEffect(() => {
    if (!stages.length) return;
    if (!stage) { setArtifactId(""); setAttemptId(""); return; }
    const selected = artifacts.find((item) => item.id === artifactId && item.attemptId === attemptId);
    if (!selected) {
      const successful = artifacts.find((item) => item.attemptId === stage.successfulAttemptId) ?? artifacts[0];
      setArtifactId(successful?.id ?? "");
      setAttemptId(successful?.attemptId ?? "");
    }
  }, [stages, stage, stageId, artifactId, attemptId, artifacts]);
  const selectedArtifact = artifacts.find((item) => item.id === artifactId && item.attemptId === attemptId);
  const openUrl = runId && stageId && selectedArtifact
    ? `/am-stage?automationRun=${encodeURIComponent(runId)}&stage=${encodeURIComponent(stageId)}&attempt=${encodeURIComponent(attemptId)}&artifact=${encodeURIComponent(artifactId)}&automationView=1#am-stage-project`
    : "/am-stage";
  const openWithInputs = () => { sessionStorage.setItem("am-automation-workbench-inputs", JSON.stringify({ assetId: currentAudioId ?? undefined, rangeStart, rangeEnd, brief, textIndex, topK, sources, scopes, domainLayers, vocalMatrixMode, searchMode, queryB, transitionRatio, instructionContext })); };
  return <section className="space-y-2 rounded-md border border-cyan-400/20 bg-cyan-950/10 p-2" data-automation-stage-handoff><div className="flex items-center justify-between gap-2"><strong className="text-xs">{t("Automation handoff")}</strong><Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={loading} onClick={() => void refresh()}>{t("Refresh")}</Button></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-[10px]">{t("Run")}<select className="mt-1 h-7 w-full rounded border border-border bg-background px-1 text-xs" value={runId} onChange={(event) => { setRunId(event.target.value); setStages([]); setStageId(""); setArtifactId(""); setAttemptId(""); }}><option value="">{t("Select a run")}</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.title} · {run.status}</option>)}</select></label><label className="text-[10px]">{t("Stage")}<select className="mt-1 h-7 w-full rounded border border-border bg-background px-1 text-xs" value={stageId} onChange={(event) => { setStageId(event.target.value); setArtifactId(""); setAttemptId(""); }} disabled={!stages.length}><option value="">{t("Select a stage")}</option>{stages.map((item) => <option key={item.stageId} value={item.stageId}>{item.actionId} · {item.status}</option>)}</select></label></div><label className="block text-[10px]">{t("Artifact")}<select className="mt-1 h-7 w-full rounded border border-border bg-background px-1 text-xs" value={artifactId && attemptId ? `${artifactId}:${attemptId}` : ""} onChange={(event) => { const selected = artifacts.find((item) => `${item.id}:${item.attemptId}` === event.target.value); setArtifactId(selected?.id ?? ""); setAttemptId(selected?.attemptId ?? ""); }} disabled={!artifacts.length}><option value="">{t("Select an artifact")}</option>{artifacts.map((item) => <option key={`${item.id}:${item.attemptId}`} value={`${item.id}:${item.attemptId}`}>{item.kind} · {item.bankId ?? "no bank"} · {item.pass ?? "no pass"} · attempt {item.attemptId.slice(0, 8)}</option>)}</select></label><div className="flex flex-wrap gap-2"><Link className="inline-flex h-7 items-center rounded border border-border px-2 text-xs hover:bg-accent" aria-disabled={!artifactId || !attemptId} href={openUrl}>{t("View selected result")}</Link><Link className="inline-flex h-7 items-center rounded border border-border px-2 text-xs hover:bg-accent" href={`/automation${runId ? `?run=${encodeURIComponent(runId)}` : ""}`}>{t("Open Automation")}</Link><Link className="inline-flex h-7 items-center rounded border border-border px-2 text-xs hover:bg-accent" href="/automation" onClick={openWithInputs}>{t("Open Automation with current inputs")}</Link></div></section>;
}
