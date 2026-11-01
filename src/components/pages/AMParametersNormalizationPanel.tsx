"use client";

import { LoaderCircle, Play, RefreshCw } from "lucide-react";

type Props = {
  data: Record<string, unknown>;
  queueCount: number;
  busy: boolean;
  confidenceThreshold: number;
  setConfidenceThreshold: (value: number) => void;
  batchSize: number;
  setBatchSize: (value: number) => void;
  autoApply: boolean;
  setAutoApply: (value: boolean) => void;
  forceDomain: boolean;
  setForceDomain: (value: boolean) => void;
  forceEnrichment: boolean;
  setForceEnrichment: (value: boolean) => void;
  run: (phase: string) => void;
  refresh: () => void;
  openQueue: () => void;
};

const phaseLabels: Record<string, string> = { rename: "A · Переименование категорий", stats: "B · Сводная статистика", domain: "C · Домены по правилам", category: "D · LLM-классификация", enrich: "E · LLM-обогащение" };

export function AMParametersNormalizationPanel(props: Props) {
  const job = props.data.current_job as { phase?: string; status?: string; step?: string; rows_scanned?: number; changed?: number; skipped?: number; failed?: number; error?: string; log_tail?: string[] } | null;
  const stats = props.data.stats as Record<string, unknown> | null;
  const runs = props.data.runs as Record<string, Record<string, unknown>> | undefined;
  const cards = [
    ["Параметров", stats?.total_parameters],
    ["Без категории", stats?.missing_category],
    ["Без домена", stats?.missing_domain],
    ["Domain вне закрытого enum", stats?.invalid_domain_count],
    ["Без описания EN · приоритетные", stats?.missing_priority_description_en],
  ];
  return <section className="space-y-4 rounded-xl border border-white/10 bg-black/15 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-medium">Нормализация каталога</h2><p className="mt-1 max-w-4xl text-sm text-muted-foreground">Детерминированные преобразования используют версионированную карту синонимов. LLM-фазы ограничены закрытым списком категорий; результаты автоматически проверяются и не требуют подтверждения отдельных строк.</p></div><button className="rounded border border-white/10 p-2" onClick={props.refresh} title="Обновить состояние"><RefreshCw className="h-4 w-4" /></button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/10 p-3"><div className="text-xs text-muted-foreground">{String(label)}</div><div className="mt-1 text-2xl font-semibold">{value === undefined || value === null ? "—" : Number(value).toLocaleString("ru-RU")}</div></div>)}</div>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 p-3"><span className="mr-2 text-sm font-medium">Настройки задания</span><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={props.autoApply} onChange={(event) => props.setAutoApply(event.target.checked)} />Автоприменение с резервной копией</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={props.forceDomain} onChange={(event) => props.setForceDomain(event.target.checked)} />Перезаписывать существующий domain</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={props.forceEnrichment} onChange={(event) => props.setForceEnrichment(event.target.checked)} />Перезаписывать descriptions/keywords</label><label className="flex items-center gap-2 text-xs">Порог LLM<input className="h-8 w-20 rounded border border-white/10 bg-black/30 px-2" type="number" min="0" max="1" step="0.05" value={props.confidenceThreshold} onChange={(event) => props.setConfidenceThreshold(Number(event.target.value))} /></label><label className="flex items-center gap-2 text-xs">Размер batch<input className="h-8 w-20 rounded border border-white/10 bg-black/30 px-2" type="number" min="5" max="50" step="5" value={props.batchSize} onChange={(event) => props.setBatchSize(Number(event.target.value))} /></label></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(phaseLabels).map(([phase, label]) => <button key={phase} disabled={props.busy || job?.status === "running"} onClick={() => props.run(phase)} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-3 text-left text-sm hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"><span>{label}</span><Play className="h-4 w-4 text-primary" /></button>)}<button disabled={props.busy || job?.status === "running"} onClick={() => props.run("all")} className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-left text-sm font-medium hover:bg-primary/15 disabled:opacity-50"><span>Запустить полную нормализацию A→E</span><Play className="h-4 w-4 text-primary" /></button></div>
    <div className="rounded-lg border border-white/10 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">Последнее задание: {job?.phase ? phaseLabels[job.phase] ?? job.phase : "ещё не запускалось"}</div><div className="flex items-center gap-3 text-xs text-muted-foreground"><span>Статус: {job?.status ?? "—"} · {job?.step ?? "—"}</span><button className="rounded border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10" onClick={props.openQueue}>Открыть очередь · {props.queueCount}</button></div></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>Просмотрено: {job?.rows_scanned ?? 0}</span><span>Изменено: {job?.changed ?? 0}</span><span>Пропущено: {job?.skipped ?? 0}</span><span>Ошибки: {job?.failed ?? 0}</span></div>{job?.status === "running" && <div className="mt-2 flex items-center gap-2 text-sm text-primary"><LoaderCircle className="h-4 w-4 animate-spin" />Выполняется; состояние обновляется автоматически.</div>}{job?.error && <p className="mt-2 text-sm text-red-300">{job.error}</p>}<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-[11px] text-muted-foreground">{(job?.log_tail ?? []).join("\n") || "Журнал появится после запуска."}</pre></div>
    <div className="rounded-lg border border-white/10 p-3"><h3 className="mb-2 text-sm font-medium">Последние результаты фаз</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries({ ...phaseLabels, all: "Полный pipeline A→E" }).map(([phase, label]) => { const run = runs?.[phase]; return <div key={phase} className="rounded border border-white/5 p-2 text-xs"><div className="font-medium">{label}</div><div className="mt-1 text-muted-foreground">{run?.finished_at ? new Date(String(run.finished_at)).toLocaleString("ru-RU") : "Нет запуска"} · {String(run?.status ?? "—")}</div><div className="mt-1 text-muted-foreground">Просмотрено {Number(run?.rows_scanned ?? 0)} · изменено {Number(run?.changed ?? 0)} · пропущено {Number(run?.skipped ?? 0)} · ошибок {Number(run?.failed ?? 0)}</div></div>; })}</div></div>
  </section>;
}
