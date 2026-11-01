"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { V3InfoTip, V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { useUiText } from "@/lib/ui-i18n";
import type { AudioSegmentResultPoint } from "@/lib/audio-segment-result";
import { buildParamToTextSnapshot, reviewedParamText, type ParamTextRankingMode, type ParamToTextSnapshot } from "@/lib/param-to-text";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import type { ParamTextWorkbenchSessionState } from "@/lib/am-stage-session";

interface ParamToTextWorkbenchProps {
  audioName: string | null;
  audioDuration: number;
  currentTime: number;
  segments: AudioSegmentResultPoint[];
  selectedLayers: string[];
  brief: string;
  topK: number;
  defaultClap: boolean;
  defaultSiglip: boolean;
  matchesLayer: (parameter: ActiveParameter) => boolean;
  initialState?: ParamTextWorkbenchSessionState | null;
  onStateChange?: (state: ParamTextWorkbenchSessionState) => void;
  onSearchReverse?: (query: string) => void;
}

function timecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

function markdownEscape(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function triggerDownload(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ParamToTextWorkbench({ audioName, audioDuration, currentTime, segments, selectedLayers, brief, topK, defaultClap, defaultSiglip, matchesLayer, initialState, onStateChange, onSearchReverse }: ParamToTextWorkbenchProps) {
  const t = useUiText();
  const [limit, setLimit] = useState(initialState?.limit ?? 12);
  const [useClap, setUseClap] = useState(initialState?.useClap ?? defaultClap);
  const [useSiglip, setUseSiglip] = useState(initialState?.useSiglip ?? defaultSiglip);
  const [excludedInput, setExcludedInput] = useState(initialState?.excludedInput ?? "");
  const [snapshot, setSnapshot] = useState<ParamToTextSnapshot | null>(initialState?.snapshot ?? null);
  const [reverseQuery, setReverseQuery] = useState<ParamTextWorkbenchSessionState["reverseQuery"]>(initialState?.reverseQuery ?? null);
  const [busy, setBusy] = useState<"rank" | "describe" | null>(null);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  const exclusions = useMemo(() => excludedInput.split(",").map((item) => item.trim()).filter(Boolean), [excludedInput]);
  const modalities = useMemo(() => [ ...(useClap ? ["clap" as const] : []), ...(useSiglip ? ["siglip" as const] : []) ], [useClap, useSiglip]);
  const buildOptions = { audioName: audioName ?? "audio", audioDurationSeconds: audioDuration, limit, modalities, excludedText: exclusions, domainLayers: selectedLayers, matchesLayer };
  const activeIndex = useMemo(() => {
    const inWindow = segments.findIndex((segment) => currentTime >= segment.offset && currentTime < segment.offset + segment.duration);
    if (inWindow >= 0) return inWindow;
    return segments.reduce((bestIndex, item, index) => Math.abs(item.time - currentTime) < Math.abs(segments[bestIndex]?.time - currentTime) ? index : bestIndex, 0);
  }, [currentTime, segments]);
  const segmentSnapshot = useMemo(() => {
    const segment = segments[activeIndex];
    if (!segment) return null;
    return buildParamToTextSnapshot([{ time: segment.time, offset: segment.offset, duration: segment.duration, clap: segment.clap, siglip: segment.siglip }], { ...buildOptions, analysisRangeStartSeconds: segment.offset, analysisRangeDurationSeconds: segment.duration, limit: Math.min(limit, 12) });
  // Filters are primitive UI state; keeping the point list in the key avoids recomputing unrelated renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, audioName, audioDuration, excludedInput, limit, modalities, segments, selectedLayers, matchesLayer]);
  const segmentTextFeatures = useMemo(() => segments.map((segment, index) => {
    const point = { time: segment.time, offset: segment.offset, duration: segment.duration, clap: modalities.includes("clap") ? segment.clap : [], siglip: modalities.includes("siglip") ? segment.siglip : [] };
    const result = buildParamToTextSnapshot([point], { ...buildOptions, analysisRangeStartSeconds: segment.offset, analysisRangeDurationSeconds: segment.duration, limit: Math.min(limit, 12) });
    return { segment_index: index, time_seconds: segment.time, window_start_seconds: segment.offset, window_end_seconds: segment.offset + segment.duration, text: result.tags_only.slice(0, 6).join(", ") || result.parameters.flatMap((entry) => entry.keywords).slice(0, 6).join(", ") || "Нет текстовых признаков.", tags: result.tags_only, parameters: result.parameters, clap_status: segment.clapStatus, siglip_status: segment.siglipStatus };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [audioName, audioDuration, excludedInput, limit, modalities, segments, selectedLayers, matchesLayer]);
  const priorSegmentSnapshot = useMemo(() => {
    const segment = segments[activeIndex - 1];
    if (!segment) return null;
    return buildParamToTextSnapshot([{ time: segment.time, offset: segment.offset, duration: segment.duration, clap: segment.clap, siglip: segment.siglip }], { ...buildOptions, analysisRangeStartSeconds: segment.offset, analysisRangeDurationSeconds: segment.duration, limit: Math.min(limit, 12) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, audioName, audioDuration, excludedInput, limit, modalities, segments, selectedLayers, matchesLayer]);
  const segmentText = segmentSnapshot
    ? (segmentSnapshot.tags_only.slice(0, 6).join(", ") || segmentSnapshot.parameters.flatMap((item) => item.keywords).slice(0, 6).join(", ") || "Нет текстовых признаков в найденных параметрах.")
    : "Выберите аудио и дождитесь результатов сегментного анализа.";
  const priorTags = new Set(priorSegmentSnapshot?.tags_only ?? []);
  const activeTags = new Set(segmentSnapshot?.tags_only ?? []);
  const appearedTags = [...activeTags].filter((tag) => !priorTags.has(tag));
  const disappearedTags = [...priorTags].filter((tag) => !activeTags.has(tag));
  const reviewed = snapshot ? reviewedParamText(snapshot) : null;

  useEffect(() => {
    onStateChange?.({ snapshot, reverseQuery, limit, useClap, useSiglip, excludedInput, segment_text_features: segmentTextFeatures });
  }, [excludedInput, limit, onStateChange, reverseQuery, segmentTextFeatures, snapshot, useClap, useSiglip]);

  const buildTrackSnapshot = () => {
    if (!audioName || !segments.length || modalities.length === 0) return;
    const created = buildParamToTextSnapshot(segments.map((segment) => ({ time: segment.time, offset: segment.offset, duration: segment.duration, clap: segment.clap, siglip: segment.siglip })), buildOptions);
    setSnapshot(created);
    setError("");
    setCopyNotice("");
  };

  const compareRankings = async () => {
    if (!snapshot || busy === "rank") return;
    setBusy("rank"); setError("");
    try {
      const response = await fetch("/api/am-stage/param-to-text/rank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, brief }) });
      const result = await response.json() as ParamToTextSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setSnapshot(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const setRankingMode = (mode: ParamTextRankingMode) => {
    if (!snapshot?.ranking_comparison?.[mode]) return;
    setSnapshot(reviewedParamText(snapshot, mode));
  };

  const updateFragment = (id: string, change: "pin" | "exclude") => {
    if (!snapshot) return;
    const toggle = (values: string[]) => values.includes(id) ? values.filter((item) => item !== id) : [...values, id];
    const next = { ...snapshot, ...(change === "pin" ? { pinned_fragment_ids: toggle(snapshot.pinned_fragment_ids) } : { excluded_fragment_ids: toggle(snapshot.excluded_fragment_ids) }) };
    setSnapshot(reviewedParamText(next));
  };

  const generateNaturalDescription = async () => {
    if (!reviewed || busy === "describe") return;
    setBusy("describe"); setError("");
    try {
      const response = await fetch("/api/am-stage/param-to-text/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: reviewed }) });
      const result = await response.json() as { description_natural_en?: string; description_natural_ru?: string; provider?: string; model?: string; generated_at?: string; error?: string };
      if (!response.ok || !result.description_natural_en || !result.description_natural_ru) throw new Error(result.error || `HTTP ${response.status}`);
      setSnapshot({ ...reviewed, natural_descriptions: { en: result.description_natural_en, ru: result.description_natural_ru, provider: result.provider ?? "configured provider", model: result.model ?? "configured model", generated_at: result.generated_at ?? new Date().toISOString() } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const generateReverseQuery = async () => {
    if (!reviewed || busy === "describe") return;
    setBusy("describe"); setError("");
    try {
      const response = await fetch("/api/am-stage/param-to-text/reverse-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: reviewed, brief }) });
      const result = await response.json() as { reverse_query?: Omit<NonNullable<ParamTextWorkbenchSessionState["reverseQuery"]>, "provider" | "model" | "generated_at">; provider?: string; model?: string; generated_at?: string; error?: string };
      if (!response.ok || !result.reverse_query?.query_en || !result.reverse_query.query_ru) throw new Error(result.error || `HTTP ${response.status}`);
      setReverseQuery({ ...result.reverse_query, provider: result.provider ?? "configured provider", model: result.model ?? "configured model", generated_at: result.generated_at ?? new Date().toISOString() });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const copyTags = async () => {
    if (!reviewed) return;
    try { await navigator.clipboard.writeText(reviewed.tags_only.join(", ")); setCopyNotice("Теги скопированы."); }
    catch { setCopyNotice("Браузер не предоставил доступ к буферу обмена."); }
  };

  const downloadSnapshot = () => { if (reviewed) triggerDownload(`${(audioName ?? "audio").replace(/\.[^.]+$/, "")}-param-to-text.json`, JSON.stringify(reviewed, null, 2), "application/json"); };

  const exportSegments = (format: "json" | "md") => {
    if (!audioName || !segments.length) return;
    const rows = segmentTextFeatures.map((row) => ({ ...row, duration_seconds: row.window_end_seconds - row.window_start_seconds }));
    const payload = { schema: "param_to_text_segment_timeline_v1", audio: { name: audioName, duration_seconds: audioDuration }, generated_at: new Date().toISOString(), filters: { modalities, domain_layers: selectedLayers, excluded_text: exclusions }, segments: rows };
    if (format === "json") {
      triggerDownload(`${audioName.replace(/\.[^.]+$/, "")}-segment-text.json`, JSON.stringify(payload, null, 2), "application/json");
      return;
    }
    const markdown = [`# Текстовые признаки по сегментам`, ``, `Аудио: ${audioName} · ${timecode(audioDuration)}`, ``, `| Время | CLAP | SigLIP2 | Текстовые признаки |`, `|---|---|---|---|`, ...rows.map((row) => `| ${timecode(row.window_start_seconds)}–${timecode(row.window_end_seconds)} | ${row.clap_status} | ${row.siglip_status} | ${markdownEscape(row.text)} |`), ``, `## Параметрические свидетельства`, ...rows.flatMap((row) => [``, `### ${timecode(row.window_start_seconds)}–${timecode(row.window_end_seconds)}`, ...row.parameters.slice(0, 8).map((entry) => `- **${entry.technical_name}** — ${entry.intensity ?? "значение не задано"}; доля ${Math.round(entry.prevalence * 100)}%; сходство ${entry.mean_similarity.toFixed(2)}.`)])].join("\n");
    triggerDownload(`${audioName.replace(/\.[^.]+$/, "")}-segment-text.md`, markdown, "text/markdown;charset=utf-8");
  };

  return <details open data-am-stage-zone="param-to-text" className="space-y-2 rounded-md border border-violet-400/25 bg-violet-950/10 p-2">
    <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"><span className="text-xs font-semibold text-violet-200">Текстовые признаки · трек и сегменты</span><V3Tooltip content={t("Сводный черновик и признаки по текущему сегменту")}><span className="inline-flex size-5 items-center justify-center rounded text-muted-foreground"><Info className="size-3.5" /></span></V3Tooltip></summary>
    <section className="space-y-2 rounded-md border border-violet-400/25 bg-violet-950/10 p-2" aria-label="Track parameter text draft">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h3 className="text-xs font-semibold text-violet-200">Текстовые признаки трека</h3><V3InfoTip content={t("Сводка по выбранным CLAP / SigLIP2 результатам и лексическим полям каталога.")} /><V3InfoTip content={t("Маска слоёв берётся из выбранного списка AM-Stage ({selectedLayers.length}). Продолжительность учитывает длительность окон анализа без двойного учёта перекрытий; неанализированные промежутки отражаются в покрытии.").replace("{selectedLayers.length}", String(selectedLayers.length))} /></div><Button size="sm" variant="outline" disabled={!audioName || !segments.length || modalities.length === 0} onClick={buildTrackSnapshot}>{snapshot ? "Пересобрать черновик" : "Собрать текст из параметров"}</Button></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={useClap} onChange={(event) => setUseClap(event.target.checked)} />CLAP</label>
        <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={useSiglip} onChange={(event) => setUseSiglip(event.target.checked)} />SigLIP2</label>
        <label className="flex items-center gap-2 text-[10px]">Параметров <input type="number" min={1} max={100} value={limit} onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="w-16 rounded border border-white/15 bg-black/40 px-1.5 py-1" /></label>
        <label className="flex items-center gap-2 text-[10px]">Исключить фразы/теги <input value={excludedInput} onChange={(event) => setExcludedInput(event.target.value)} placeholder="через запятую" className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-1.5 py-1" /></label>
      </div>
      {reviewed && snapshot ? <>
        <div className="flex flex-wrap items-center gap-1 border-y border-white/10 py-1.5 text-[10px]">
          <span className="mr-1 flex items-center gap-1 text-muted-foreground">Ранжирование:<V3InfoTip content={t("Частота × сходство учитывает долю времени и оценку сходства; профиль сравнивает embeddings признаков со взвешенным центроидом; Brief сравнивает их с текстом запроса «{brief}». Сравнение запускается по кнопке выше.").replace("{brief}", brief || t("не задан"))} /></span>
          {(["frequency", "centroid", "brief"] as ParamTextRankingMode[]).filter((mode) => Boolean(reviewed.ranking_comparison?.[mode])).map((mode) => <Button key={mode} size="sm" variant={reviewed.active_ranking_mode === mode ? "secondary" : "ghost"} onClick={() => setRankingMode(mode)}>{mode === "frequency" ? "Частота × сходство" : mode === "centroid" ? "Профиль (centroid)" : "Brief"}</Button>)}
          <Button size="sm" variant="outline" disabled={busy === "rank"} onClick={() => void compareRankings()}>{busy === "rank" ? "Считаю сравнение…" : "Сравнить способы ранжирования"}</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="rounded bg-black/40 p-2 text-xs text-cyan-100">{reviewed.tags_only.join(", ") || "В выбранных параметрах нет тегов."}</p><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => void copyTags()}>Копировать теги</Button><Button size="sm" variant="outline" onClick={downloadSnapshot}>Скачать JSON-снимок</Button></div></div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span>Параметров: {reviewed.parameters.length}</span><span>Точек: {reviewed.sampled_points}</span><span>Покрытие: {reviewed.analysis_coverage_seconds.toFixed(1)} с / {Math.round(reviewed.analysis_coverage_ratio * 100)}%</span><span>Схема: {reviewed.schema}</span></div>
        <details className="rounded border border-white/10 p-2"><summary className="cursor-pointer text-[10px]">Почему выбраны параметры? · средняя уверенность, диапазон значений и сегментные свидетельства</summary><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{reviewed.parameters.map((entry) => <div key={entry.technical_name} className="rounded bg-black/25 p-2 text-[10px]"><p className="font-mono text-cyan-200">{entry.technical_name} <span className="text-zinc-500">· вклад {entry.contribution_score.toFixed(3)} · {entry.occurrence_seconds.toFixed(1)}с ({Math.round(entry.prevalence * 100)}% трека) · {entry.sample_prevalence.toFixed(2)} точек</span></p><p>Сходство: среднее {entry.mean_similarity.toFixed(2)}, min {entry.similarity_min.toFixed(2)}, max {entry.similarity_max.toFixed(2)}. Значения: {String(entry.value_min ?? "—")}…{String(entry.value_max ?? "—")} · среднее {entry.value_mean?.toFixed(3) ?? "—"} · последнее {String(entry.value_last ?? "—")} {entry.unit ?? ""} · default {String(entry.default_value ?? "—")} · {entry.intensity ?? "без шкалы"}.</p>{entry.lower_value_behavior || entry.higher_value_behavior ? <p className="text-violet-200">Смысл направления из описания каталога: {entry.lower_value_behavior ? `низкое — ${entry.lower_value_behavior}` : ""}{entry.lower_value_behavior && entry.higher_value_behavior ? " · " : ""}{entry.higher_value_behavior ? `высокое — ${entry.higher_value_behavior}` : ""}</p> : null}<p className="text-zinc-500">{entry.evidence.map((item) => `${timecode(item.time_seconds)} ${item.modality} ${item.similarity.toFixed(2)}=${String(item.value)}`).join(" · ")}</p></div>)}</div></details>
        <div className="max-h-56 space-y-1 overflow-y-auto">{reviewed.ranked_fragments.slice(0, 24).map((fragment) => <div key={fragment.id} className="flex flex-wrap items-center justify-between gap-1 rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px]"><span className="min-w-0 flex-1"><span className="text-violet-200">{fragment.text}</span> <span className="text-zinc-500">· {fragment.kind} · {fragment.technical_name} · score {fragment.score.toFixed(2)} · доля {Math.round(fragment.prevalence * 100)}% · сходство {fragment.mean_similarity.toFixed(2)}</span></span><span className="flex gap-1"><Button size="sm" variant={snapshot.pinned_fragment_ids.includes(fragment.id) ? "secondary" : "ghost"} onClick={() => updateFragment(fragment.id, "pin")}>{snapshot.pinned_fragment_ids.includes(fragment.id) ? "Закреплён" : "Закрепить"}</Button><Button size="sm" variant="ghost" onClick={() => updateFragment(fragment.id, "exclude")}>{snapshot.excluded_fragment_ids.includes(fragment.id) ? "Вернуть" : "Убрать"}</Button></span></div>)}</div>
        <div className="space-y-1 rounded border border-white/10 p-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1 text-[10px] font-medium">Естественное описание · отдельный черновик<V3InfoTip content={t("Отправит только выбранный снимок на настроенный LLM-провайдер. Каталог не изменяется.")} /></span><Button size="sm" variant="outline" disabled={busy === "describe"} onClick={() => void generateNaturalDescription()}>{busy === "describe" ? "Генерирую…" : "Составить EN/RU по выбранному снимку"}</Button></div>{reviewed.natural_descriptions ? <div className="grid gap-2 text-xs md:grid-cols-2"><p><strong>EN:</strong> {reviewed.natural_descriptions.en}</p><p><strong>RU:</strong> {reviewed.natural_descriptions.ru}</p><p className="text-[10px] text-muted-foreground md:col-span-2">{reviewed.natural_descriptions.provider} · {reviewed.natural_descriptions.model}</p></div> : null}</div>
        <div className="space-y-1 rounded border border-cyan-400/20 p-2" data-am-stage-zone="reverse-query"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1 text-[10px] font-medium">Обратный запрос (Reverse Query)<V3InfoTip content={t("Общий генератор с циклом Cross-Modal Consensus. Результат хранится здесь отдельно; каталог и исходный Brief не меняются.")} /></span><Button size="sm" variant="outline" disabled={busy === "describe"} onClick={() => void generateReverseQuery()}>{busy === "describe" ? "Генерирую…" : "Создать по выбранным признакам"}</Button></div>{reverseQuery ? <div className="grid gap-2 text-xs md:grid-cols-2"><label>EN<textarea readOnly value={reverseQuery.query_en} className="mt-1 min-h-20 w-full rounded border border-white/15 bg-black/40 p-2" /></label><label>RU<textarea readOnly value={reverseQuery.query_ru} className="mt-1 min-h-20 w-full rounded border border-white/15 bg-black/40 p-2" /></label><p className="text-[10px] text-muted-foreground md:col-span-2">{reverseQuery.provider} · {reverseQuery.model} · ключевые понятия: {reverseQuery.key_concepts.join(", ")}</p><div className="flex flex-wrap gap-1 md:col-span-2"><Button size="sm" variant="outline" onClick={() => onSearchReverse?.(reverseQuery.query_en)} disabled={!onSearchReverse}>Искать EN в V3 · Top-K {topK}</Button><Button size="sm" variant="outline" onClick={() => onSearchReverse?.(reverseQuery.query_ru)} disabled={!onSearchReverse}>Искать RU в V3 · Top-K {topK}</Button></div></div> : null}</div>
      </> : null}
      {error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : null}{copyNotice ? <p role="status" className="text-[10px] text-emerald-300">{copyNotice}</p> : null}
    </section>

    <section className="space-y-2 rounded-md border border-cyan-400/20 bg-cyan-950/5 p-2" data-am-stage-zone="param-to-text-segments" aria-label="Text traits by audio segment">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h3 className="text-xs font-semibold text-cyan-200">Текстовые признаки по сегментам</h3><V3InfoTip content={t("Текст меняется вслед за текущей позицией воспроизведения и временным окном анализа.")} /></div><div className="flex gap-1"><Button size="sm" variant="outline" disabled={!segments.length || modalities.length === 0} onClick={() => exportSegments("json")}>Экспорт JSON</Button><Button size="sm" variant="outline" disabled={!segments.length || modalities.length === 0} onClick={() => exportSegments("md")}>Экспорт Markdown</Button></div></div>
      {segments[activeIndex] && segmentSnapshot ? <><div className="flex flex-wrap gap-3 font-mono text-[10px] text-zinc-400"><span>Сегмент {activeIndex + 1}/{segments.length}</span><span>{timecode(segments[activeIndex].offset)}–{timecode(segments[activeIndex].offset + segments[activeIndex].duration)}</span><span>CLAP: {segments[activeIndex].clapStatus}</span><span>SigLIP2: {segments[activeIndex].siglipStatus}</span></div><p className="rounded bg-black/40 p-2 text-xs text-cyan-100" aria-live="polite">{segmentText}</p><div className="grid gap-2 text-[10px] md:grid-cols-2"><p className="text-emerald-300">Появились: {appearedTags.join(", ") || "—"}</p><p className="text-amber-300">Исчезли: {disappearedTags.join(", ") || "—"}</p></div><p className="text-[10px] text-muted-foreground">{segmentSnapshot.parameters.slice(0, 8).map((entry) => `${entry.technical_name}: ${entry.intensity ?? "—"} (${entry.mean_similarity.toFixed(2)})`).join(" · ") || "В этом сегменте нет результатов для выбранных источников и слоёв."}</p></> : <p className="text-xs text-muted-foreground">Загрузите аудио и выполните хотя бы один сегментный анализ.</p>}
    </section>
  </details>;
}
