"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, RefreshCw, Square, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArtifactKind, ArtifactStatus, ManagedJob, RebuildKind } from "@/lib/rag-v3/managed-rebuild";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";

interface RebuildStatus {
  artifacts: ArtifactStatus[];
  banks: Array<{ mode_id: string; input: string; encoder: string; value_policy: string; status: string; dependencies: string[] }>;
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
            <Database className="size-4 text-cyan-300" />Index coverage · V3
            <V3InfoTip content="Обновить статус — read-only аудит файлов и fingerprints; модель не загружается. Qwen3 и EmbeddingGemma 2 имеют отдельные хранилища и отдельные rebuild jobs. Длинные rebuild запускаются только вручную." />
          </div>
          <div className="mt-1 text-xs text-zinc-500">Активная модель: <code>{status?.active_model ?? "—"}</code> · параметров: {status?.active_parameters ?? "—"}</div>
        </div>
        <div className="flex gap-2">
          <V3Tooltip content="Последовательно обновляет только набор Qwen3. Артефакты EmbeddingGemma 2 не затрагиваются."><Button size="sm" onClick={() => void start("all_qwen")} disabled={loading || status?.job.running}>Rebuild all · Qwen3</Button></V3Tooltip>
          <V3Tooltip content="Останавливает активный управляемый процесс после завершения текущей операции."><Button size="sm" variant="destructive" onClick={() => void stop()} disabled={!status?.job.running}><Square className="size-3.5" />Остановить</Button></V3Tooltip>
          <V3Tooltip content="Read-only audit: пересчитывает ожидаемое покрытие и сравнивает fingerprints. Не загружает модель и не запускает rebuild."><Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className="size-3.5" />Refresh index status</Button></V3Tooltip>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full min-w-[900px] text-left text-[11px]">
          <thead className="bg-white/5 text-zinc-400"><tr><th className="p-2">Artifact</th><th className="p-2">Encoder</th><th className="p-2">Status</th><th className="p-2">Rows / expected</th><th className="p-2">Built</th><th className="p-2">Fingerprints</th><th className="p-2">Action</th></tr></thead>
          <tbody>{(status?.artifacts ?? []).map((artifact) => (
            <tr key={artifact.kind} className="border-t border-white/5 align-top">
              <td className="p-2"><div className="font-medium">{artifact.label}</div><div className="mt-0.5 max-w-64 text-[9px] text-zinc-500">{artifact.description}</div></td>
              <td className="p-2">{artifact.model ?? "—"}<div className="text-zinc-500">{artifact.dimensions ?? "—"}D</div></td>
              <td className="p-2"><Badge variant={artifact.status === "ready" || artifact.status === "built" ? "secondary" : "outline"}>{artifact.status}</Badge>{artifact.reason ? <div className="mt-1 max-w-56 text-[9px] text-amber-300">{artifact.reason}</div> : null}</td>
              <td className="p-2 font-mono">{artifact.row_count} / {artifact.expected_count}</td>
              <td className="p-2 whitespace-nowrap">{artifact.built_at ? new Date(artifact.built_at).toLocaleString() : "—"}</td>
              <td className="p-2 font-mono text-[9px] text-zinc-500">D {artifact.data_fingerprint?.slice(0, 12) ?? "—"}<br/>V {artifact.vector_fingerprint?.slice(0, 12) ?? "—"}</td>
              <td className="p-2">{artifact.kind === "siglip" ? <a className="text-cyan-300 underline" href="/am-core#service-bay">Open Morpho Service Bay</a> : <Button size="sm" variant="outline" disabled={loading || status?.job.running === true} onClick={() => void start(artifact.kind as RebuildKind)}>{status?.job.running && status.job.stage === artifact.kind ? <Loader2 className="size-3.5 animate-spin" /> : null}{buttonLabels[artifact.kind]}</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full min-w-[680px] text-left text-[10px]">
          <thead className="bg-white/5 text-zinc-400"><tr><th className="p-2">Mode / bank</th><th className="p-2">Input</th><th className="p-2">Encoder</th><th className="p-2">Value policy</th><th className="p-2">Readiness</th><th className="p-2">Dependencies</th></tr></thead>
          <tbody>{(status?.banks ?? []).map((bank) => <tr key={bank.mode_id} className="border-t border-white/5"><td className="p-2 font-mono">{bank.mode_id}</td><td className="p-2">{bank.input}</td><td className="p-2">{bank.encoder}</td><td className="p-2">{bank.value_policy}</td><td className="p-2"><Badge variant={bank.status === "ready" ? "secondary" : "outline"}>{bank.status}</Badge></td><td className="p-2 text-zinc-500">{bank.dependencies.join(" · ")}</td></tr>)}</tbody>
        </table>
      </div>

      {status?.job.running ? <div className="text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3.5 animate-spin" />Выполняется: {status.job.stage}</div> : null}
      {status?.job.log_tail.length ? <pre className="max-h-36 overflow-auto rounded border border-white/10 bg-black/50 p-2 text-[10px] text-zinc-400">{status.job.log_tail.join("\n")}</pre> : null}
      {error ? <div className="text-xs text-red-300">{error}</div> : null}
    </div>
  );
}

const buttonLabels: Record<ArtifactKind, string> = {
    composite: "Rebuild Qwen3 composite", embeddinggemma2_text: "Build EmbeddingGemma 2 text index", atoms: "Перестроить runtime atoms", anchors: "Перестроить live axes / anchors",
    range: "Перестроить Range anchors", select: "Перестроить Select options", relations: "Перестроить relation anchors", clap: "Обновить CLAP-индекс",
    gemma2_atoms: "Rebuild Gemma 2 runtime atoms", gemma2_anchors: "Rebuild Gemma 2 live axes / anchors", gemma2_range: "Rebuild Gemma 2 Range anchors",
    gemma2_select: "Rebuild Gemma 2 Select anchors", gemma2_relations: "Rebuild Gemma 2 relation anchors",
    siglip: "Open Morpho Service Bay",
};
