"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Square, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/lib/ui-i18n";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";

type MorphoStatus = { ready?: boolean; status?: string; stale_reasons?: string[]; source_snapshot_sha256?: string; manifest?: { parameter_count?: number; encoded?: number; reused?: number; source_snapshot_sha256?: string } | null; index_job?: { running?: boolean; progress?: { stage?: string | null; current?: number; total?: number }; last_error?: string | null; log_tail?: string[] } };
type ClapStatus = { ready?: boolean; error?: string; parameter_count?: number; job?: { status?: string; events?: Array<{ event?: string; msg?: string; step?: string; value?: number; level?: string }> } | null };

async function json(response: Response) {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`Service Bay returned HTTP ${response.status} without JSON.`);
  const value = await response.json() as { error?: string; reason?: string };
  if (!response.ok) throw new Error(value.error ?? value.reason ?? `HTTP ${response.status}`);
  return value;
}

export function ServiceBayIndexControls() {
  const t = useUiText();
  const clapEnabled = useCapabilityEnabled("audio.clap.resolved");
  const siglipEnabled = useCapabilityEnabled("spec.siglip.resolved");
  const [morpho, setMorpho] = useState<MorphoStatus | null>(null);
  const [clap, setClap] = useState<ClapStatus | null>(null);
  const [busy, setBusy] = useState<"clap" | "siglip" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeJobs, setActiveJobs] = useState({ clap: false, siglip: false });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [m, c] = await Promise.all([fetch("/api/morpho/status", { cache: "no-store" }), fetch("/api/audio/index", { cache: "no-store" })]);
      const nextMorpho = await json(m) as MorphoStatus;
      const nextClap = await json(c) as ClapStatus;
      setMorpho(nextMorpho);
      setClap(nextClap);
      setActiveJobs({ clap: nextClap.job?.status === "running", siglip: Boolean(nextMorpho.index_job?.running) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!activeJobs.clap && !activeJobs.siglip) return;
    let disposed = false;
    const checkCompletion = async () => {
      try {
        const [mResponse, cResponse] = await Promise.all([fetch("/api/morpho/status?view=job", { cache: "no-store" }), fetch("/api/audio/index?view=job", { cache: "no-store" })]);
        const [m, c] = await Promise.all([json(mResponse), json(cResponse)]) as [{ job?: { running?: boolean } }, { job?: { status?: string } }];
        const nextActive = { clap: c.job?.status === "running", siglip: Boolean(m.job?.running) };
        const completed = (activeJobs.clap && !nextActive.clap) || (activeJobs.siglip && !nextActive.siglip);
        if (!disposed) setActiveJobs((current) => current.clap === nextActive.clap && current.siglip === nextActive.siglip ? current : nextActive);
        if (completed && !disposed) void refresh();
      } catch {
        // Keep the last visible log snapshot until an explicit refresh or completion check succeeds.
      }
    };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void checkCompletion(); }, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [activeJobs.clap, activeJobs.siglip, refresh]);

  const action = async (kind: "clap" | "siglip", method: "POST" | "DELETE") => {
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(kind === "clap" ? "/api/audio/index" : "/api/morpho/index", { method });
      await json(response);
      if (method === "POST") setActiveJobs((current) => ({ ...current, [kind]: true }));
      else await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };
  const clapRunning = activeJobs.clap || clap?.job?.status === "running";
  const siglipRunning = activeJobs.siglip || Boolean(morpho?.index_job?.running);
  const clapEvents = clap?.job?.events ?? [];
  const clapProgress = [...clapEvents].reverse().find((event) => event.event === "progress");
  const clapLogs = clapEvents.filter((event) => event.event === "log" || event.event === "error").slice(-25).map((event) => event.msg ?? JSON.stringify(event));

  return <section className="grid gap-3 xl:grid-cols-2" aria-label={t("CLAP and SigLIP2 index controls")}>
    <div className="xl:col-span-2 flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`} />{t("Refresh index status")}</Button></div>
    <article id="clap" className="rounded-lg border border-border bg-black/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider"><Database className="size-4 text-cyan-300" />CLAP · {t("local")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Status")}: {clap ? clap.error ? t("error") : clapRunning ? t("building") : clap.ready ? t("ready") : t("missing") : t("not checked")} · {t("parameters")}: {clap?.parameter_count ?? "—"}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => void action("clap", "POST")} disabled={Boolean(busy) || clapRunning || clapEnabled !== true} title={clapEnabled === false ? t("Disabled in Settings") : undefined}><RefreshCw className={`size-4 ${clapRunning ? "animate-spin" : ""}`} />{t("Build")}</Button><Button size="sm" variant="destructive" onClick={() => void action("clap", "DELETE")} disabled={Boolean(busy) || !clapRunning}><Square className="size-4" />{t("Stop")}</Button></div></div>
      {clapRunning ? <p className="mt-2 text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3 animate-spin" />{clapProgress?.step ?? t("Indexing")} · {clapProgress?.value ?? 0}%</p> : null}
      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[10px] text-muted-foreground">{clapLogs.join("\n") || clap?.error || t("Progress log appears after a manual refresh or when the job finishes.")}</pre>
    </article>
    <article id="siglip" className="rounded-lg border border-border bg-black/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider"><Database className="size-4 text-fuchsia-300" />SigLIP2 · {t("local / CPU")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Status")}: {morpho?.status ?? t("not checked")} · {t("parameters")}: {morpho?.manifest?.parameter_count ?? "—"}</p>{morpho?.stale_reasons?.length ? <p role="status" className="text-xs text-amber-300">{t("Stale")}: {morpho.stale_reasons.join("; ")}. {t("Rebuild manually from Service Bay.")}</p> : null}{morpho?.source_snapshot_sha256 ? <p className="font-mono text-[9px] text-zinc-500" title={`Current catalogue fingerprint: ${morpho.source_snapshot_sha256} · index fingerprint: ${morpho.manifest?.source_snapshot_sha256 ?? "missing"}`}>source fp {morpho.source_snapshot_sha256.slice(0, 12)} · index fp {morpho.manifest?.source_snapshot_sha256?.slice(0, 12) ?? "—"}</p> : null}</div><div className="flex gap-2"><Button size="sm" onClick={() => void action("siglip", "POST")} disabled={Boolean(busy) || siglipRunning || siglipEnabled !== true} title={siglipEnabled === false ? t("Disabled in Settings") : undefined}><RefreshCw className={`size-4 ${siglipRunning ? "animate-spin" : ""}`} />{t("Build")}</Button><Button size="sm" variant="destructive" onClick={() => void action("siglip", "DELETE")} disabled={Boolean(busy) || !siglipRunning}><Square className="size-4" />{t("Stop")}</Button></div></div>
      {siglipRunning ? <p className="mt-2 text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3 animate-spin" />{morpho?.index_job?.progress?.stage ?? t("Loading model")} · {morpho?.index_job?.progress?.current ?? 0}/{morpho?.index_job?.progress?.total ?? 0}</p> : null}
      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[10px] text-muted-foreground">{morpho?.index_job?.log_tail?.join("\n") || morpho?.index_job?.last_error || t("GPU and Ollama are not used. Progress log appears after a manual refresh or when the job finishes.")}</pre>
    </article>
    {error ? <div role="alert" className="xl:col-span-2 text-xs text-red-300">{error}</div> : null}
  </section>;
}
