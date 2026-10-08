"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveX, Info, RotateCcw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RegistryParameter {
  technical_name: string;
  category: string;
  sub_category: string;
  retrieval_scope: string;
  excluded: boolean;
  exclusion: { excluded_at: string; excluded_by: string; reason: string; scope: string } | null;
}

interface RegistryPayload {
  registry: { updated_at: string; entries: unknown[] };
  registry_sha256: string;
  indexes_stale: boolean;
  parameters: RegistryParameter[];
  error?: string;
}

export function ParameterRegistryPanel() {
  const [payload, setPayload] = useState<RegistryPayload | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"active" | "excluded">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("not sound-relevant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const response = await fetch("/api/combinatorial-genesis/registry", { cache: "no-store" });
    const next = await response.json() as RegistryPayload;
    if (!response.ok) throw new Error(next.error ?? `HTTP ${response.status}`);
    setPayload(next);
  };

  useEffect(() => {
    let disposed = false;
    void fetch("/api/combinatorial-genesis/registry", { cache: "no-store" })
      .then(async (response) => {
        const next = await response.json() as RegistryPayload;
        if (!response.ok) throw new Error(next.error ?? `HTTP ${response.status}`);
        if (!disposed) setPayload(next);
      })
      .catch((caught) => {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => { disposed = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (payload?.parameters ?? [])
      .filter((parameter) => parameter.excluded === (view === "excluded"))
      .filter((parameter) => !needle || `${parameter.technical_name} ${parameter.category} ${parameter.sub_category}`.toLowerCase().includes(needle))
      .slice(0, 200);
  }, [payload, query, view]);

  const mutate = async (method: "POST" | "DELETE") => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/registry", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technical_names: [...selected], reason }),
      });
      const next = await response.json() as RegistryPayload;
      if (!response.ok) throw new Error(next.error ?? `HTTP ${response.status}`);
      setPayload(next);
      setSelected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const excludedCount = payload?.parameters.filter((parameter) => parameter.excluded).length ?? 0;
  return (
    <section className="space-y-3 rounded-lg border border-amber-400/20 bg-amber-950/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ArchiveX className="size-4 text-amber-300" />
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-white">Parameter registry</h2>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild><Info className="size-3.5 text-zinc-500" /></TooltipTrigger>
                <TooltipContent className="max-w-sm">Исключение не удаляет исходные данные. Параметр исчезнет из поиска после управляемой перестройки индексов.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Tombstone-реестр с сохранением автора, времени, причины и scope.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">active: {(payload?.parameters.length ?? 0) - excludedCount}</Badge>
          <Badge variant="outline">excluded: {excludedCount}</Badge>
          {payload?.indexes_stale ? <Badge className="border-amber-400/40 bg-amber-950 text-amber-200">indexes stale</Badge> : <Badge variant="outline">indexes built</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-72 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-zinc-500" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="technical_name, category..." className="pl-9" />
        </div>
        <Button variant={view === "active" ? "default" : "outline"} onClick={() => { setView("active"); setSelected(new Set()); }}>Активные</Button>
        <Button variant={view === "excluded" ? "default" : "outline"} onClick={() => { setView("excluded"); setSelected(new Set()); }}>Исключённые</Button>
      </div>

      <div className="max-h-72 overflow-auto rounded border border-white/10 bg-black/40">
        {filtered.map((parameter) => (
          <label key={parameter.technical_name} className="flex cursor-pointer items-start gap-3 border-b border-white/5 px-3 py-2 last:border-b-0 hover:bg-white/5">
            <Checkbox
              checked={selected.has(parameter.technical_name)}
              onCheckedChange={(checked) => setSelected((current) => {
                const next = new Set(current);
                if (checked) next.add(parameter.technical_name); else next.delete(parameter.technical_name);
                return next;
              })}
            />
            <span className="min-w-0 flex-1">
              <span className="block break-all font-mono text-xs text-zinc-200">{parameter.technical_name}</span>
              <span className="text-[10px] text-zinc-500">{parameter.category} / {parameter.sub_category} · {parameter.retrieval_scope}</span>
              {parameter.exclusion ? <span className="mt-1 block text-[10px] text-amber-300">{parameter.exclusion.reason} · {parameter.exclusion.excluded_by} · {new Date(parameter.exclusion.excluded_at).toLocaleString()}</span> : null}
            </span>
          </label>
        ))}
        {filtered.length === 0 ? <div className="p-6 text-center text-xs text-zinc-500">Параметры не найдены.</div> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view === "active" ? (
          <>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} className="min-w-64 flex-1" placeholder="Причина исключения" />
            <Button variant="destructive" disabled={busy || selected.size === 0} onClick={() => void mutate("POST")}>
              <ArchiveX className="size-4" />Исключить выбранные ({selected.size})
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={busy || selected.size === 0} onClick={() => void mutate("DELETE")}>
            <RotateCcw className="size-4" />Вернуть выбранные ({selected.size})
          </Button>
        )}
        <Button variant="ghost" onClick={() => void refresh()} disabled={busy}>Обновить</Button>
      </div>
      {error ? <div className="text-xs text-red-300">{error}</div> : null}
    </section>
  );
}
