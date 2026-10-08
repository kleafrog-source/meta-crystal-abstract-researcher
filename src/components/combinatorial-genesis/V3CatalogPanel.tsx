"use client";

import { useEffect, useState } from "react";
import { BookOpen, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CatalogManifest {
  generated_at: string | null;
  parameter_count: number;
  part_size: number;
  part_count: number;
  files: Array<{ name: string; count: number; raw_url: string }>;
  error?: string;
}

export function V3CatalogPanel() {
  const [manifest, setManifest] = useState<CatalogManifest | null>(null);
  const [partSize, setPartSize] = useState("500");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/combinatorial-genesis/catalog").then((response) => response.json()).then((value: CatalogManifest) => {
      setManifest(value);
      if (value.part_size) setPartSize(String(value.part_size));
    }).catch(() => undefined);
  }, []);

  const generate = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/combinatorial-genesis/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part_size: Math.max(100, Math.min(1000, Math.trunc(Number(partSize) || 500))) }),
      });
      const value = await response.json() as CatalogManifest;
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
      setManifest(value);
      setMessage(`Создано ${value.part_count} частей · ${value.parameter_count} technical_name.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const copyLinks = async () => {
    const links = manifest?.files.map((file) => file.raw_url).join("\n") ?? "";
    if (!links) return;
    await navigator.clipboard.writeText(links);
    setMessage("Raw-ссылки скопированы.");
  };

  return (
    <section className="space-y-3 rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4 text-violet-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><BookOpen className="size-4" /><h2 className="font-mono text-sm font-semibold uppercase tracking-wide">V3 technical-name catalog</h2></div>
          <p className="mt-1 max-w-4xl text-xs text-violet-200/70">Перезаписывает отсортированные Markdown-части для GitHub. В списках находятся только technical_name, сгруппированные по category / sub_category.</p>
        </div>
        <div className="text-right text-xs text-violet-200/70">{manifest?.generated_at ? new Date(manifest.generated_at).toLocaleString("ru-RU") : "ещё не создан"}<br />{manifest?.parameter_count ?? 0} имён · {manifest?.part_count ?? 0} частей</div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs"><span>Имен в одной части</span><Input className="w-32" type="number" min={100} max={1000} value={partSize} onChange={(event) => setPartSize(event.target.value)} /></label>
        <Tooltip><TooltipTrigger asChild><Button type="button" onClick={() => void generate()} disabled={busy}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Обновление..." : "Обновить каталог"}</Button></TooltipTrigger><TooltipContent>Собирает текущие параметры V3 из frozen dataset и автономной библиотеки, затем атомарно перезаписывает Markdown-части.</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" onClick={() => void copyLinks()} disabled={!manifest?.files.length}><Copy className="size-4" />Копировать raw-ссылки</Button></TooltipTrigger><TooltipContent>Копирует прямые GitHub raw-ссылки на все части, по одной ссылке на строку.</TooltipContent></Tooltip>
      </div>
      {message ? <div className="text-xs text-violet-100">{message}</div> : null}
      {manifest?.files.length ? <details className="text-xs text-violet-200/70"><summary className="cursor-pointer">Показать части каталога</summary><div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{manifest.files.map((file) => <a className="truncate underline decoration-dotted hover:text-white" href={file.raw_url} target="_blank" rel="noreferrer" key={file.name}>{file.name} · {file.count}</a>)}</div></details> : null}
    </section>
  );
}

