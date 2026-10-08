"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, RefreshCw, Square, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArtifactKind, ArtifactStatus, ManagedJob, RebuildKind } from "@/lib/rag-v3/managed-rebuild";
import { cn } from "@/lib/utils";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";

interface RebuildStatus {
  artifacts: ArtifactStatus[];
  active_model: string;
  registry_sha256: string;
  active_parameters: number;
  job: ManagedJob;
  error?: string;
}

export function ManagedRebuildPanel() {
  const [status, setStatus] = useState<RebuildStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/rag-v3/rebuild", { cache: "no-store" });
    const payload = await response.json() as RebuildStatus;
    if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
    setStatus(payload);
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch("/api/rag-v3/rebuild", { cache: "no-store" });
        const payload = await response.json() as RebuildStatus;
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        if (!disposed) setStatus(payload);
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void load();
    const timer = setInterval(() => { if (status?.job.running) void load(); }, 1500);
    return () => { disposed = true; clearInterval(timer); };
  }, [status?.job.running]);

  const start = async (kind: RebuildKind) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      const payload = await response.json() as { error?: string; reason?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.reason ?? `HTTP ${response.status}`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    const response = await fetch("/api/rag-v3/rebuild", { method: "DELETE" });
    const payload = await response.json() as { reason?: string };
    if (!response.ok) setError(payload.reason ?? `HTTP ${response.status}`);
    await refresh();
  };

  return (
    <div className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-950/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-cyan-300" />Управляемая перестройка V3
            <V3InfoTip content="Каждый индекс перестраивается отдельно. Общая кнопка выполняет шесть embedding-этапов последовательно и никогда не запускает CLAP." />
          </div>
          <div className="mt-1 text-xs text-zinc-500">Активная модель: <code>{status?.active_model ?? "—"}</code> · параметров: {status?.active_parameters ?? "—"}</div>
        </div>
        <div className="flex gap-2">
          <V3Tooltip content="Последовательно обновляет composite, atoms, live anchors, Range, Select и relation anchors активной моделью."><Button size="sm" onClick={() => void start("all_qwen")} disabled={loading || status?.job.running}>Перестроить всё (кроме CLAP)</Button></V3Tooltip>
          <V3Tooltip content="Останавливает активный управляемый процесс после завершения текущей операции."><Button size="sm" variant="destructive" onClick={() => void stop()} disabled={!status?.job.running}><Square className="size-3.5" />Остановить</Button></V3Tooltip>
          <V3Tooltip content="Обновляет состояния индексов и текущего фонового процесса."><Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className="size-3.5" />Обновить</Button></V3Tooltip>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(status?.artifacts ?? []).filter((artifact) => artifact.kind !== "clap").map((artifact) => (
          <ArtifactCard key={artifact.kind} artifact={artifact} running={status?.job.running === true && status.job.stage === artifact.kind} onStart={() => void start(artifact.kind)} disabled={loading || status?.job.running === true} />
        ))}
      </div>

      {status?.artifacts.find((artifact) => artifact.kind === "clap") ? (
        <div className="rounded border border-fuchsia-400/25 bg-fuchsia-950/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fuchsia-200"><Waves className="size-4" />Независимый CLAP-индекс<V3InfoTip content="CLAP использует отдельную аудио-текстовую модель и не входит в общую embedding-перестройку V3." /></div>
          <ArtifactCard artifact={status.artifacts.find((artifact) => artifact.kind === "clap")!} running={status.job.running && status.job.stage === "clap"} onStart={() => void start("clap")} disabled={loading || status.job.running} />
        </div>
      ) : null}

      {status?.job.running ? <div className="text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3.5 animate-spin" />Выполняется: {status.job.stage}</div> : null}
      {status?.job.log_tail.length ? <pre className="max-h-36 overflow-auto rounded border border-white/10 bg-black/50 p-2 text-[10px] text-zinc-400">{status.job.log_tail.join("\n")}</pre> : null}
      {error ? <div className="text-xs text-red-300">{error}</div> : null}
    </div>
  );
}

function ArtifactCard(props: { artifact: ArtifactStatus; running: boolean; disabled: boolean; onStart: () => void }) {
  const artifact = props.artifact;
  const buttonLabels: Record<ArtifactKind, string> = {
    composite: "Перестроить Qwen composite", atoms: "Перестроить runtime atoms", anchors: "Перестроить live axes / anchors",
    range: "Перестроить Range anchors", select: "Перестроить Select options", relations: "Перестроить relation anchors", clap: "Обновить CLAP-индекс",
  };
  return (
    <div className={cn("rounded border p-2", artifact.status === "stale" ? "border-amber-400/40 bg-amber-950/15" : "border-white/10 bg-black/30")}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{artifact.label}</span><Badge variant={artifact.status === "built" ? "secondary" : "outline"}>{artifact.status}</Badge></div>
      <div className="mt-1 text-[10px] text-zinc-500">{artifact.model ?? "—"} · {artifact.dimensions ?? "—"}D · {artifact.parameter_count} rows</div>
      <div className="text-[10px] text-zinc-500">built: {artifact.built_at ? new Date(artifact.built_at).toLocaleString() : "—"} · +{artifact.added_since_build} / excluded {artifact.excluded_since_build}</div>
      {artifact.reason ? <div className="mt-1 text-[10px] text-amber-300">{artifact.reason}</div> : null}
      <V3Tooltip content={`Перестраивает только артефакт «${artifact.label}». Текущий статус: ${artifact.status}.`}>
        <Button className="mt-2 w-full" size="sm" variant="outline" disabled={props.disabled} onClick={props.onStart}>{props.running ? <Loader2 className="size-3.5 animate-spin" /> : null}{buttonLabels[artifact.kind]}</Button>
      </V3Tooltip>
    </div>
  );
}
