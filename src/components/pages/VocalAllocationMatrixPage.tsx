"use client";

import { useMemo, useState } from "react";
import { Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { V3InfoTip } from "@/components/rag-v3/V3Tooltip";
import { AMIcon } from "@/components/ui/am-icon";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { useUiText } from "@/lib/ui-i18n";

const EXAMPLE = "Три слоя: лид на классической латыни с VGUT и DRV1; высокий хор на древнегреческом с VCLR и RVB1; шепот на арамейском с VWSP и DLY1. I=8, S=7, E=5, A=9.";

export function VocalAllocationMatrixPage() {
  const t = useUiText();
  const [query, setQuery] = useState(EXAMPLE);
  const [results, setResults] = useState<ActiveParameter[]>([]);
  const [parsed, setParsed] = useState<{ languages: string[]; techniques: string[]; effects: string[]; digits: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const macro = useMemo(() => results.map((p) => `${p.technical_name}: ${p.current_value}`).join("\n"), [results]);
  const matrix = useMemo(() => {
    const get = (name: string) => String(results.find((p) => p.technical_name === name)?.current_value ?? "—");
    return [
      `lead_overlord: [${get("iso_language_primary_layer_1")}]-[${get("technique_primary_lead_layer")}]-[${get("fx_chain_primary_lead")}]`,
      `choir_high: [${get("iso_language_primary_layer_2")}]-[${get("technique_ritual_chant_layer")}]-[${get("fx_chain_ritual_chant")}]`,
      `whisper_layer: [${get("iso_language_primary_layer_3")}]-[${get("technique_ambient_whisper_layer")}]-[${get("fx_chain_ambient_whisper")}]`,
    ].join("\n");
  }, [results]);

  async function search() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/vocal-allocation/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, top_k: 40 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Поиск не выполнен");
      setResults(payload.results ?? []); setParsed(payload.parsed ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }

  function change(name: string, value: string) {
    setResults((items) => items.map((p) => p.technical_name === name ? { ...p, current_value: p.ui_element === "Range" ? Number(value) : value } : p));
  }

  return <div className="flex h-full flex-col bg-black text-zinc-100">
    <header className="border-b border-fuchsia-500/25 px-4 py-3">
      <h1 className="flex items-center gap-2 font-mono text-lg font-semibold text-fuchsia-200"><AMIcon name="vocal" size="md" bright />Vocal Allocation Matrix · V3<V3InfoTip content={t("Изолированный scoped-поиск языков, TECH4, FX4, слоёв и I/S/E/A поверх актуальной базы V3.")} /></h1>
    </header>
    <main className="flex-1 overflow-auto p-4"><div className="mx-auto max-w-[1600px] space-y-4">
      <section className="rounded-lg border border-white/15 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">{t("Описание вокальной матрицы")}<V3InfoTip content={t("Можно использовать русские или английские названия языков, ISO-коды, TECH4/FX4 и явные значения I=, S=, E=, A=. Каждый запуск независим.")} /></div>
        <Textarea value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-28 font-mono" />
        <div className="mt-3 flex flex-wrap items-center gap-2"><Button className="am-icon-button" onClick={search} disabled={loading || !query.trim()}><AMIcon name="search" size="sm" bright />{loading ? t("Поиск…") : t("Собрать матрицу")}</Button>
          {parsed && <span className="text-xs text-zinc-400">{t("Языки:")} {parsed.languages.join(", ") || "—"} · TECH4: {parsed.techniques.join(", ") || "—"} · FX4: {parsed.effects.join(", ") || "—"}</span>}</div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-white/15 bg-zinc-950 p-3">
          <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider">{t("Параметры матрицы")}<V3InfoTip content={t("Явные коды назначаются детерминированно; остальные параметры и значения поступают из V3 retrieval и anchors. Все значения можно изменить вручную.")} /></div>
          <div className="max-h-[68vh] space-y-2 overflow-auto">
            {results.length === 0 && <p className="p-6 text-center text-sm text-zinc-600">Выполните поиск.</p>}
            {results.map((p) => <div key={p.technical_name} className="grid gap-2 rounded border border-white/10 bg-black/40 p-2 md:grid-cols-[minmax(220px,1fr)_minmax(180px,320px)]">
              <div><div className="break-all font-mono text-xs text-cyan-300">{p.technical_name}</div><div className="mt-1 text-[10px] text-zinc-500">{p.source} · {p.detail}</div></div>
              {p.ui_element === "Select" && p.options ? <select value={String(p.current_value)} onChange={(e) => change(p.technical_name, e.target.value)} className="h-9 min-w-0 rounded border border-white/15 bg-zinc-950 px-2 text-xs">{p.options.map((o) => <option key={o}>{o}</option>)}</select> : <input value={String(p.current_value)} type={p.ui_element === "Range" ? "number" : "text"} min={p.min_value} max={p.max_value} step={p.step} onChange={(e) => change(p.technical_name, e.target.value)} className="h-9 min-w-0 rounded border border-white/15 bg-zinc-950 px-2 text-xs" />}
            </div>)}
          </div>
        </section>
        <aside className="rounded-lg border border-fuchsia-500/25 bg-zinc-950 p-3">
          <div className="mb-3 rounded border border-fuchsia-500/20 bg-black p-3"><div className="mb-2 flex items-center justify-between text-xs uppercase text-fuchsia-200"><span>Vocal allocation matrix</span><Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(matrix)}><Copy /></Button></div><pre className="whitespace-pre-wrap break-all text-[11px] text-fuchsia-200">{matrix}</pre></div>
          <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-wider"><span className="flex items-center gap-2"><AMIcon name="macro" size="sm" bright />Clean Macro</span><Button className="am-icon-button" size="sm" variant="outline" disabled={!macro} onClick={() => navigator.clipboard.writeText(macro)}><AMIcon name="copy" size="sm" />Копировать</Button></div>
          <pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap break-all rounded bg-black p-3 text-[11px] text-emerald-300">{macro || t("Результат появится здесь.")}</pre>
        </aside>
      </div>
    </div></main>
  </div>;
}
