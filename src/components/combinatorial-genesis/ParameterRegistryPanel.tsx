"use client";

import { useEffect, useState } from "react";
import { ArchiveX, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { V3InfoTip } from "@/components/rag-v3/V3Tooltip";

interface MigrationPayload {
  registry: { entries: Array<{ technical_name: string }> };
  migration: { live_count: number; orphan_count: number; live_names: string[]; orphan_names: string[] };
}

export function ParameterRegistryPanel() {
  const [payload, setPayload] = useState<MigrationPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const response = await fetch("/api/combinatorial-genesis/registry", { cache: "no-store" });
    const next = await response.json() as MigrationPayload;
    if (!response.ok) throw new Error("Could not read legacy exclusion status.");
    setPayload(next);
  };

  useEffect(() => { void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : String(caught))); }, []);

  const stageMigration = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/registry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stage_delete_migration" }) });
      const result = await response.json() as { error?: string; staged_count?: number; orphan_count?: number; next?: string };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setMessage(`${result.staged_count ?? 0} catalogue delete(s) staged. Review the catalogue queue and confirm its commit; that creates library and registry backups. ${result.orphan_count ?? 0} orphan registry entr${result.orphan_count === 1 ? "y" : "ies"} will be removed at commit.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const hasLegacy = (payload?.migration.live_count ?? 0) + (payload?.migration.orphan_count ?? 0) > 0;
  return (
    <section className="space-y-2 rounded-lg border border-amber-400/20 bg-amber-950/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><ArchiveX className="size-4 text-amber-300" />Legacy index exclusions <V3InfoTip content="Новые исключения отключены. Удаление выполняется через очередь каталога с подтверждением и резервными копиями." /></div>
        <div className="flex items-center gap-2"><Badge variant={hasLegacy ? "outline" : "secondary"}>{payload?.migration.live_count ?? "—"} live · {payload?.migration.orphan_count ?? "—"} orphan</Badge><Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw className="size-3.5" />Refresh</Button></div>
      </div>
      {hasLegacy ? <><div className="text-[11px] text-zinc-400">Stage legacy exclusions as catalogue deletes. The parameters remain untouched until you confirm the catalogue queue commit.</div><Button size="sm" variant="destructive" disabled={busy || !payload?.migration.live_count} onClick={() => void stageMigration()}>{busy ? "Staging…" : "Stage legacy exclusions for deletion"}</Button></> : <div className="text-[11px] text-zinc-500">No legacy exclusions remain.</div>}
      {message ? <div className="text-[11px] text-emerald-300">{message}</div> : null}{error ? <div className="text-[11px] text-red-300">{error}</div> : null}
    </section>
  );
}
