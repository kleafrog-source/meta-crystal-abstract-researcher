"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Square, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

type MorphoStatus = { ready?: boolean; status?: string; stale_reasons?: string[]; manifest?: { parameter_count?: number; encoded?: number; reused?: number } | null; index_job?: { running?: boolean; progress?: { stage?: string | null; current?: number; total?: number }; last_error?: string | null; log_tail?: string[] } };
type ClapStatus = { ready?: boolean; error?: string; parameter_count?: number; job?: { status?: string; events?: Array<{ event?: string; msg?: string; step?: string; value?: number; level?: string }> } | null };

export function ServiceBayIndexControls() {
  const [morpho, setMorpho] = useState<MorphoStatus | null>(null);
  const [clap, setClap] = useState<ClapStatus | null>(null);
  const [busy, setBusy] = useState<"clap" | "siglip" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return false;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const [m, c] = await Promise.all([fetch("/api/morpho/status", { cache: "no-store" }), fetch("/api/audio/index", { cache: "no-store" })]);
      const nextMorpho = m.ok ? await m.json() as MorphoStatus : null;
      const nextClap = c.ok ? await c.json() as ClapStatus : null;
      if (nextMorpho) setMorpho(nextMorpho);
      if (nextClap) setClap(nextClap);
      return Boolean(nextMorpho?.index_job?.running || nextClap?.job?.status === "running");
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);
  const clapRunning = clap?.job?.status === "running";
  const siglipRunning = Boolean(morpho?.index_job?.running);
  const jobRunning = clapRunning || siglipRunning;
  useEffect(() => {
    if (!jobRunning) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [jobRunning, refresh]);
  const action = async (kind: "clap" | "siglip", method: "POST" | "DELETE") => {
    setBusy(kind);
    try { await fetch(kind === "clap" ? "/api/audio/index" : "/api/morpho/index", { method }); await refresh(); }
    finally { setBusy(null); }
  };
  const clapEvents = clap?.job?.events ?? [];
  const clapProgress = [...clapEvents].reverse().find((event) => event.event === "progress");
  const clapLogs = clapEvents.filter((event) => event.event === "log" || event.event === "error").slice(-25).map((event) => event.msg ?? JSON.stringify(event));
  return <section className="grid gap-3 xl:grid-cols-2" aria-label="CLAP and SigLIP2 index controls">
    <div className="xl:col-span-2 flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => void refresh().catch(() => undefined)} disabled={refreshing}><RefreshCw className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`} />Обновить статус</Button></div>
    <article className="rounded-lg border border-border bg-black/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider"><Database className="size-4 text-cyan-300" />CLAP text index</h3><p className="mt-1 text-xs text-muted-foreground">Статус: {clap?.error ? "error" : clapRunning ? "building" : clap?.ready ? "ready" : "missing"} · параметров: {clap?.parameter_count ?? "—"}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => void action("clap", "POST")} disabled={Boolean(busy) || clapRunning}><RefreshCw className={`size-4 ${clapRunning ? "animate-spin" : ""}`} />Построить</Button><Button size="sm" variant="destructive" onClick={() => void action("clap", "DELETE")} disabled={Boolean(busy) || !clapRunning}><Square className="size-4" />Остановить</Button></div></div>
      {clapRunning ? <p className="mt-2 text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3 animate-spin" />{clapProgress?.step ?? "Индексация"} · {clapProgress?.value ?? 0}%</p> : null}
      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[10px] text-muted-foreground">{clapLogs.join("\n") || clap?.error || "Журнал появится после запуска."}</pre>
    </article>
    <article className="rounded-lg border border-border bg-black/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider"><Database className="size-4 text-fuchsia-300" />SigLIP2 text index · CPU</h3><p className="mt-1 text-xs text-muted-foreground">Статус: {morpho?.status ?? "checking"} · параметров: {morpho?.manifest?.parameter_count ?? "—"}</p>{morpho?.stale_reasons?.length ? <p className="text-xs text-amber-300">Устарел: {morpho.stale_reasons.join("; ")}</p> : null}</div><div className="flex gap-2"><Button size="sm" onClick={() => void action("siglip", "POST")} disabled={Boolean(busy) || siglipRunning}><RefreshCw className={`size-4 ${siglipRunning ? "animate-spin" : ""}`} />Построить</Button><Button size="sm" variant="destructive" onClick={() => void action("siglip", "DELETE")} disabled={Boolean(busy) || !siglipRunning}><Square className="size-4" />Остановить</Button></div></div>
      {siglipRunning ? <p className="mt-2 text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3 animate-spin" />{morpho?.index_job?.progress?.stage ?? "Загрузка модели"} · {morpho?.index_job?.progress?.current ?? 0}/{morpho?.index_job?.progress?.total ?? 0}</p> : null}
      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[10px] text-muted-foreground">{morpho?.index_job?.log_tail?.join("\n") || morpho?.index_job?.last_error || "GPU и Ollama не используются. Журнал появится после запуска."}</pre>
    </article>
  </section>;
}
