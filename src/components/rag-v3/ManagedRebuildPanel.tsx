"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Loader2, RefreshCw, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArtifactKind, ArtifactStatus, ManagedJob, RebuildKind } from "@/lib/rag-v3/managed-rebuild";
import { useUiText } from "@/lib/ui-i18n";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";

interface RebuildAudit {
  artifacts: ArtifactStatus[];
  banks: Array<{ mode_id: string; input: string; encoder: string; value_policy: string; status: string; dependencies: string[] }>;
  active_model: string;
  active_endpoint?: string;
  registry_sha256: string;
  active_parameters: number;
}

interface JobSnapshot {
  running: boolean;
  kind: RebuildKind | null;
  stage: ArtifactKind | null;
  started_at: number;
  finished_at: number;
  exit_code: number | null;
  stop_requested: boolean;
  last_error: string | null;
  log_tail: string[];
}

async function responseJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Service Bay returned HTTP ${response.status} without JSON${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json() as T & { error?: string; reason?: string };
  if (!response.ok) throw new Error(payload.error ?? payload.reason ?? `HTTP ${response.status}`);
  return payload;
}

const emptyJob: JobSnapshot = { running: false, kind: null, stage: null, started_at: 0, finished_at: 0, exit_code: null, stop_requested: false, last_error: null, log_tail: [] };

export function ManagedRebuildPanel() {
  const t = useUiText();
  const qwenEnabled = useCapabilityEnabled("text.qwen.resolved");
  const gemmaEnabled = useCapabilityEnabled("text.gemma.awtd");
  const [audit, setAudit] = useState<RebuildAudit | null>(null);
  const [job, setJob] = useState<JobSnapshot>(emptyJob);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wasRunning = useRef(false);

  const refreshAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "audit" }), cache: "no-store" });
      const payload = await responseJson<RebuildAudit & { job: JobSnapshot }>(response);
      setAudit(payload);
      setJob(payload.job);
      wasRunning.current = payload.job.running;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshJob = useCallback(async () => {
    const response = await fetch("/api/rag-v3/rebuild?view=job", { cache: "no-store" });
    const payload = await responseJson<{ job: Omit<JobSnapshot, "stop_requested" | "log_tail"> }>(response);
    if (wasRunning.current && !payload.job.running) {
      wasRunning.current = false;
      await refreshAudit();
      return;
    }
    wasRunning.current = payload.job.running;
  }, [refreshAudit]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch("/api/rag-v3/rebuild?view=job", { cache: "no-store" });
        const payload = await responseJson<{ job: Omit<JobSnapshot, "stop_requested" | "log_tail"> }>(response);
        if (!disposed) {
          wasRunning.current = payload.job.running;
          setJob((current) => ({ ...current, ...payload.job }));
        }
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!job.running) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshJob().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job.running, refreshJob]);

  const start = async (kind: RebuildKind) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      const payload = await responseJson<{ started?: boolean; reason?: string; job?: JobSnapshot }>(response);
      if (payload.job) setJob(payload.job);
      wasRunning.current = Boolean(payload.job?.running);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "DELETE" });
      const payload = await responseJson<{ job?: JobSnapshot; reason?: string }>(response);
      if (payload.job) setJob(payload.job);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-950/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-cyan-300" />{t("Index coverage")}
            <V3InfoTip content={t("Read-only audit of local index files and source fingerprints. It does not load an embedding model.")} />
          </div>
          <div className="mt-1 text-xs text-zinc-500">{audit ? <>{t("Ollama")}: <code>{audit.active_endpoint ?? "—"}</code> · {t("active model")}: <code>{audit.active_model}</code> · {t("published parameters")}: {audit.active_parameters}</> : t("Index status has not been checked")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <V3Tooltip content={t("Run the sequential Qwen3 rebuild only. Gemma indexes stay separate.")}><Button size="sm" onClick={() => void start("all_qwen")} disabled={loading || job.running || qwenEnabled !== true} title={qwenEnabled === false ? t("Disabled in Settings") : undefined}>{t("Rebuild all · Qwen3")}</Button></V3Tooltip>
          <V3Tooltip content={t("Stops the active managed rebuild process.")}><Button size="sm" variant="destructive" onClick={() => void stop()} disabled={!job.running || loading}><Square className="size-3.5" />{t("Stop")}</Button></V3Tooltip>
          <V3Tooltip content={t("Refreshes local manifests and fingerprints on demand. Does not start a rebuild or load a model.")}><Button size="sm" variant="outline" onClick={() => void refreshAudit()} disabled={loading}><RefreshCw className="size-3.5" />{t("Refresh index status")}</Button></V3Tooltip>
        </div>
      </div>

      {audit ? <>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="bg-white/5 text-zinc-400"><tr><th className="p-2">{t("Artifact")}</th><th className="p-2">{t("Encoder")}</th><th className="p-2">{t("Status")}</th><th className="p-2">{t("Rows / expected")}</th><th className="p-2">{t("Built")}</th><th className="p-2">{t("Fingerprints")}</th><th className="p-2">{t("Action")}</th></tr></thead>
            <tbody>{audit.artifacts.map((artifact) => (
              <tr key={artifact.kind} className="border-t border-white/5 align-top">
                <td className="p-2"><div className="font-medium">{artifact.label}</div><div className="mt-0.5 max-w-64 text-[9px] text-zinc-500">{artifact.description}</div></td>
                <td className="p-2">{artifact.model ?? "—"}<div className="text-zinc-500">{artifact.dimensions ?? "—"}D · {artifact.kind === "clap" || artifact.kind === "siglip" ? t("local / CPU") : t("Ollama")}</div></td>
                <td className="p-2"><Badge variant={artifact.status === "ready" || artifact.status === "built" ? "secondary" : "outline"}>{artifact.status}</Badge>{artifact.reason ? <div className="mt-1 max-w-56 text-[9px] text-amber-300">{artifact.reason}</div> : null}</td>
                <td className="p-2 font-mono">{artifact.row_count} / {artifact.expected_count}</td>
                <td className="whitespace-nowrap p-2">{artifact.built_at ? new Date(artifact.built_at).toLocaleString() : "—"}</td>
                <td className="p-2 font-mono text-[9px] text-zinc-500">D {artifact.data_fingerprint?.slice(0, 12) ?? "—"}<br/>V {artifact.vector_fingerprint?.slice(0, 12) ?? "—"}</td>
                <td className="p-2">{artifact.kind === "siglip" ? <a className="text-cyan-300 underline" href="/service-bay#siglip">{t("Open SigLIP controls")}</a> : <Button size="sm" variant="outline" disabled={loading || job.running || (artifact.kind === "clap" ? true : artifact.kind.startsWith("gemma2_") || artifact.kind === "embeddinggemma2_text" ? gemmaEnabled !== true : qwenEnabled !== true)} title={artifact.kind === "clap" ? t("Use the CLAP controls above") : (artifact.kind.startsWith("gemma2_") || artifact.kind === "embeddinggemma2_text") ? gemmaEnabled === false ? t("Disabled in Settings") : undefined : qwenEnabled === false ? t("Disabled in Settings") : undefined} onClick={() => void start(artifact.kind as RebuildKind)}>{job.running && job.stage === artifact.kind ? <Loader2 className="size-3.5 animate-spin" /> : null}{t(buttonLabels[artifact.kind])}</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[680px] text-left text-[10px]">
            <thead className="bg-white/5 text-zinc-400"><tr><th className="p-2">{t("Mode / bank")}</th><th className="p-2">{t("Input")}</th><th className="p-2">{t("Encoder")}</th><th className="p-2">{t("Value policy")}</th><th className="p-2">{t("Readiness")}</th><th className="p-2">{t("Dependencies")}</th></tr></thead>
            <tbody>{audit.banks.map((bank) => <tr key={bank.mode_id} className="border-t border-white/5"><td className="p-2 font-mono">{bank.mode_id}</td><td className="p-2">{bank.input}</td><td className="p-2">{bank.encoder}</td><td className="p-2">{bank.value_policy}</td><td className="p-2"><Badge variant={bank.status === "ready" ? "secondary" : "outline"}>{bank.status}</Badge></td><td className="p-2 text-zinc-500">{bank.dependencies.join(" · ")}</td></tr>)}</tbody>
          </table>
        </div>
      </> : <div className="rounded border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">{t("Use Refresh index status to inspect local artifact coverage.")}</div>}

      {job.running ? <div className="text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3.5 animate-spin" />{t("Running")}: {job.stage ?? job.kind}</div> : job.finished_at > 0 ? <div className="text-xs text-muted-foreground">{job.exit_code === 0 ? t("Last job completed") : t("Last job stopped or failed")}: {job.kind} · exit {job.exit_code ?? "—"}</div> : null}
      {job.log_tail.length ? <pre className="max-h-36 overflow-auto rounded border border-white/10 bg-black/50 p-2 text-[10px] text-zinc-400">{job.log_tail.join("\n")}</pre> : job.running ? <p className="text-[10px] text-zinc-500">{t("Progress log is held while the job runs. Refresh manually or when the job finishes.")}</p> : null}
      {error ? <div role="alert" className="text-xs text-red-300">{error}</div> : null}
    </div>
  );
}

const buttonLabels: Record<ArtifactKind, string> = {
  composite: "Rebuild Qwen3 composite", embeddinggemma2_text: "Build EmbeddingGemma 2 text index", atoms: "Rebuild runtime atoms", anchors: "Rebuild live axes / anchors",
  range: "Rebuild Range anchors", select: "Rebuild Select options", relations: "Rebuild relation anchors", clap: "Rebuild CLAP index",
  gemma2_atoms: "Rebuild Gemma 2 runtime atoms", gemma2_anchors: "Rebuild Gemma 2 live axes / anchors", gemma2_range: "Rebuild Gemma 2 Range anchors",
  gemma2_select: "Rebuild Gemma 2 Select anchors", gemma2_relations: "Rebuild Gemma 2 relation anchors",
  siglip: "Open SigLIP controls",
};
