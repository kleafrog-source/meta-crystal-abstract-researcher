"use client";

import { useState } from "react";
import { Check, RefreshCw, WandSparkles } from "lucide-react";
import { generateProceduralBatch, type GeneratedParameter } from "../../../flowmusic-demo/lexical-parameter-generator/generator";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";

type Props = {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  refresh: () => Promise<void>;
};

type CatalogueGeneratedParameter = GeneratedParameter & {
  domain: string;
  domain_layer?: string;
};

function catalogueName(name: string): string {
  if (name.length <= 120) return name;
  const shortened = name.slice(0, 117);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary > 80 ? boundary : 117).trimEnd()}…`;
}

export function AMCatalogueLexicalGenerator({ busy, setBusy, setNotice, refresh }: Props) {
  const [batchIndex, setBatchIndex] = useState(1);
  const [seed, setSeed] = useState(1337);
  const [parameters, setParameters] = useState<CatalogueGeneratedParameter[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const generate = () => {
    try {
      const batch = generateProceduralBatch(batchIndex, seed);
      const uniqueParameters = [...new Map(batch.parameters.map((parameter) => [parameter.technical_name, parameter])).values()];
      const enriched = uniqueParameters.map((parameter) => {
        const domainLayer = classifyDomainLayer(parameter.technical_name, parameter.category);
        return {
          ...parameter,
          name_ru: catalogueName(parameter.name_ru),
          domain: parameter.category === "Compositional Vector" || parameter.category === "Cross-Domain Controls" ? "structure" : "sound",
          ...(domainLayer ? { domain_layer: domainLayer } : {}),
        };
      });
      setParameters(enriched);
      setSelected(enriched.map((parameter) => parameter.technical_name));
      setNotice(`Сформирован пакет ${batch.batch_index}: ${enriched.length} параметров. Проверьте выбор перед добавлением в очередь.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сформировать пакет параметров.");
    }
  };

  const stageSelected = async () => {
    const chosen = parameters.filter((parameter) => selected.includes(parameter.technical_name));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      const file = new File([JSON.stringify({ parameters: chosen })], `lexical-parameter-generator-${batchIndex}.json`, { type: "application/json" });
      form.set("file", file);
      form.set("duplicate_mode", "skip");
      const response = await fetch("/api/am-parameters-catalogue/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setNotice(`Генератор: в очередь добавлено ${data.accepted}, пропущено как дубли ${data.conflicts}, отклонено ${data.rejected}.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось добавить параметры в очередь.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (name: string) => setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);

  return <section className="rounded-xl border border-white/10 bg-black/15 p-4">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium"><WandSparkles className="h-4 w-4 text-primary" />Лексический генератор параметров</h2>
        <p className="mt-1 text-xs text-muted-foreground">Детерминированные пакеты из подключённого lexical-parameter-generator. Выбранные записи проходят проверку каталога и попадают в очередь; опубликованная библиотека меняется только после Commit.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Пакет<input className="h-8 w-20 rounded border border-white/10 bg-black/30 px-2 text-foreground" type="number" min={1} value={batchIndex} onChange={(event) => setBatchIndex(Math.max(1, Number(event.target.value) || 1))} /></label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Seed<input className="h-8 w-24 rounded border border-white/10 bg-black/30 px-2 text-foreground" type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value) || 0)} /></label>
        <button className="inline-flex h-8 items-center gap-1 rounded border border-white/15 px-3 text-xs hover:border-primary/50" onClick={generate}><RefreshCw className="h-3.5 w-3.5" />Сгенерировать</button>
        <button className="inline-flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50" disabled={busy || selected.length === 0} onClick={() => void stageSelected()}><Check className="h-3.5 w-3.5" />В очередь · {selected.length}</button>
      </div>
    </header>
    {!parameters.length ? <p className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">Сформируйте пакет, чтобы просмотреть параметры перед добавлением.</p> : <>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Пакет {batchIndex} · {parameters.length} записей</span><div className="flex gap-2"><button className="hover:text-foreground" onClick={() => setSelected(parameters.map((parameter) => parameter.technical_name))}>Выбрать все</button><button className="hover:text-foreground" onClick={() => setSelected([])}>Снять выбор</button></div></div>
      <div className="grid max-h-[60vh] gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3">
        {parameters.map((parameter) => <label key={parameter.technical_name} className="flex cursor-pointer gap-2 rounded-lg border border-white/10 p-3 hover:border-primary/30">
          <input className="mt-1" type="checkbox" checked={selected.includes(parameter.technical_name)} onChange={() => toggle(parameter.technical_name)} />
          <span className="min-w-0"><span className="block break-all font-mono text-[11px] text-primary">{parameter.technical_name}</span><span className="mt-1 block text-xs">{parameter.name_ru}</span><span className="mt-1 block text-[10px] text-muted-foreground">{parameter.category} · {parameter.sub_category} · {parameter.ui_element}{parameter.domain_layer ? ` · ${parameter.domain_layer}` : ""}</span></span>
        </label>)}
      </div>
    </>}
  </section>;
}
