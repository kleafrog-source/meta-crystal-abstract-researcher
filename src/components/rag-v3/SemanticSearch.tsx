"use client";

import { useState, type ReactNode } from "react";
import { ArrowRightLeft, RefreshCw, RotateCcw, Save, Search, Sparkles, Split, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { SpeechInputButtons } from "@/components/SpeechInputButtons";
import { mergeQueryWithCrystal } from "@/lib/rag-v3/crystal-query";
import { useRagV3Store } from "@/store/rag-v3-store";
import { InstructionSettingsDialog } from "./InstructionSettingsDialog";
import { MetaCrystalPickerDialog } from "./MetaCrystalPickerDialog";
import { TransitionFlowReport } from "./TransitionFlowReport";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";

const SUGGESTIONS: Array<{ label: string; query: string }> = [
  { label: "Brighter timbre", query: "make the timbre noticeably brighter and a little sharper" },
  { label: "Slower attack", query: "сделай атаку сильно плавнее и мягче" },
  { label: "Faster tempo", query: "set tempo to 120 bpm and make the groove faster" },
  { label: "Stereo width", query: "wide evolving stereo pad with softer movement" },
];

const TRANSITION_PRESETS = [0, 25, 50, 75, 100] as const;
const SOURCE_HINTS = {
  library: "Параметры основной библиотеки V3.",
  frozen: "Параметры исходного корпуса Flowmusic.",
  atoms: "Комбинаторные атомы, доступные для структурного поиска.",
  generated: "Опубликованные параметры из Combinatorial Synthesis.",
} as const;
const SCOPE_HINTS = {
  sound: "Звуковые характеристики: тембр, динамика, спектр и пространство.",
  structure: "Музыкальная и генеративная структура: ритм, последовательности и формы.",
  metadata: "Описательные и классификационные поля.",
  provenance: "Поля происхождения и источников данных.",
  administrative: "Служебные и административные параметры.",
} as const;

export function SemanticSearch() {
  const query = useRagV3Store((state) => state.query);
  const queryB = useRagV3Store((state) => state.queryB);
  const topK = useRagV3Store((state) => state.topK);
  const sources = useRagV3Store((state) => state.sources);
  const scopes = useRagV3Store((state) => state.scopes);
  const toggleSource = useRagV3Store((state) => state.toggleSource);
  const toggleScope = useRagV3Store((state) => state.toggleScope);
  const [topKDraft, setTopKDraft] = useState(String(topK));
  const searchMode = useRagV3Store((state) => state.searchMode);
  const transitionRatio = useRagV3Store((state) => state.transitionRatio);
  const setQuery = useRagV3Store((state) => state.setQuery);
  const setQueryB = useRagV3Store((state) => state.setQueryB);
  const resetWorkspace = useRagV3Store((state) => state.resetWorkspace);
  const setTopK = useRagV3Store((state) => state.setTopK);
  const setSearchMode = useRagV3Store((state) => state.setSearchMode);
  const setTransitionRatio = useRagV3Store((state) => state.setTransitionRatio);
  const applyTransitionBlend = useRagV3Store((state) => state.applyTransitionBlend);
  const proposeParameters = useRagV3Store((state) => state.proposeParameters);
  const isSearching = useRagV3Store((state) => state.isSearching);
  const searchError = useRagV3Store((state) => state.searchError);
  const activeCount = useRagV3Store((state) => state.activeParameters.length);
  const primaryCount = useRagV3Store((state) => state.searchResults.length);
  const secondaryCount = useRagV3Store((state) => state.secondaryResults.length);
  const instructionCount = useRagV3Store(
    (state) => state.instructionSlots.filter((slot) => slot.enabled && slot.content.trim()).length,
  );
  const status = useRagV3Store((state) => state.status);
  const handleCrystalInsert = (target: "primary" | "secondary", crystalText: string) => {
    if (target === "primary") {
      setQuery(mergeQueryWithCrystal(query, crystalText));
      return;
    }
    setQueryB(mergeQueryWithCrystal(queryB, crystalText));
  };

  return (
    <section className="console-query-panel space-y-3 rounded-lg border border-white/75 bg-black/65 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-primary" />
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.12em] text-white">Semantic Search V3</h2>
            <V3InfoTip content="Выполняет независимый semantic retrieval и выбор значений для каждого отправленного запроса." />
          </div>
          <p className="font-mono text-[10px] text-zinc-500">Single target or dual-state interpolation. Search runs only on explicit submit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">dataset: {status?.total_parameters ?? 0}</Badge>
          <Badge variant="secondary">active: {activeCount}</Badge>
          <Badge variant="outline">Top-K: {topK}</Badge>
          <Badge variant="outline">instructions: {instructionCount}</Badge>
          <V3Tooltip content="Очищает запросы, результаты и ручные изменения текущей рабочей области V3.">
            <Button type="button" variant="outline" size="sm" onClick={resetWorkspace}><RotateCcw className="size-4" />Сбросить V3</Button>
          </V3Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <V3Tooltip content="Один независимый запрос заново формирует полный набор параметров и значений.">
          <Button type="button" size="sm" variant={searchMode === "single" ? "default" : "outline"} onClick={() => setSearchMode("single")}>
            <Search className="size-4" />Single query
          </Button>
        </V3Tooltip>
        <V3Tooltip content="Строит два независимых состояния A и B, затем интерполирует их значения.">
          <Button type="button" size="sm" variant={searchMode === "transition" ? "default" : "outline"} onClick={() => setSearchMode("transition")}>
            <ArrowRightLeft className="size-4" />Transition mode
          </Button>
        </V3Tooltip>
        <InstructionSettingsDialog />
        <div className="flex flex-wrap items-center gap-1">
          {([
            ["library", "Library"],
            ["frozen", "Flowmusic corpus"],
            ["atoms", "Atoms"],
            ["generated", "Published combinations"],
          ] as const).map(([source, label]) => (
            <V3Tooltip key={source} content={SOURCE_HINTS[source]}>
              <Button type="button" size="sm" variant={sources[source] ? "default" : "outline"} onClick={() => toggleSource(source)}>{label}</Button>
            </V3Tooltip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded border border-white/20 bg-white/[0.04] p-1">
          <span className="flex items-center gap-1 px-2 text-[11px] text-muted-foreground">Top-K<V3InfoTip content="Максимальное число параметров, возвращаемых одним semantic search." /></span>
          <V3Tooltip content="Введите Top-K от 1 до 200. Значение применяется только после нажатия Save.">
            <Input type="number" min={1} max={200} value={topKDraft} onChange={(event) => setTopKDraft(event.target.value)} className="h-7 w-20 bg-black/60 font-mono text-xs" />
          </V3Tooltip>
          <V3Tooltip content="Сохраняет введённое значение Top-K для последующих запросов.">
            <Button type="button" size="sm" className="h-7 px-2" onClick={() => setTopK(Number(topKDraft) || topK)}><Save className="size-3.5" />Save</Button>
          </V3Tooltip>
          <V3Tooltip content="Возвращает поле к последнему сохранённому Top-K.">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setTopKDraft(String(topK))}><RefreshCw className="size-3.5" /></Button>
          </V3Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded border border-white/15 bg-white/[0.025] p-2">
        <span className="mr-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Retrieval scope<V3InfoTip content="Ограничивает поиск выбранными смысловыми классами параметров." /></span>
        {([
          ["sound", "Sound"],
          ["structure", "Structure"],
          ["metadata", "Metadata"],
          ["provenance", "Provenance"],
          ["administrative", "Administrative"],
        ] as const).map(([scope, label]) => (
          <V3Tooltip key={scope} content={SCOPE_HINTS[scope]}>
            <Button type="button" size="sm" variant={scopes[scope] ? "default" : "outline"} onClick={() => toggleScope(scope)}>{label}</Button>
          </V3Tooltip>
        ))}
      </div>

      <div className={`grid gap-2 ${searchMode === "transition" ? "xl:grid-cols-2" : ""}`}>
        <QueryPanel
          title="Query A"
          value={query}
          placeholder="Describe the first target sound state..."
          resultCount={primaryCount}
          isSearching={isSearching}
          onChange={setQuery}
          onClear={() => setQuery("")}
          onSubmit={() => void proposeParameters(query, "primary")}
          actions={
            <MetaCrystalPickerDialog
              targetLabel="Query A"
              onSelect={(value) => handleCrystalInsert("primary", value)}
            />
          }
        />
        {searchMode === "transition" ? (
          <QueryPanel
            title="Query B"
            value={queryB}
            placeholder="Describe the second target sound state..."
            resultCount={secondaryCount}
            isSearching={isSearching}
            onChange={setQueryB}
            onClear={() => setQueryB("")}
            onSubmit={() => void proposeParameters(queryB, "secondary")}
            actions={
              <MetaCrystalPickerDialog
                targetLabel="Query B"
                onSelect={(value) => handleCrystalInsert("secondary", value)}
              />
            }
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <V3Tooltip key={suggestion.label} content="Подставляет демонстрационный запрос в Query A без запуска поиска.">
            <button type="button" className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground" onClick={() => setQuery(suggestion.query)}>{suggestion.label}</button>
          </V3Tooltip>
        ))}
      </div>

      {searchMode === "transition" ? (
        <div className="space-y-2">
          <div className="space-y-2 rounded border border-white/25 bg-black/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Split className="size-4 text-primary" />
                  Transition stage
                  <V3InfoTip content="Определяет положение между независимо рассчитанными состояниями Query A и Query B." />
                </div>
                <p className="text-xs text-muted-foreground">
                  Blend the anchored results between Query A and Query B.
                </p>
              </div>
              <Badge variant="outline">{transitionRatio}% toward Query B</Badge>
            </div>

            <V3Tooltip content="0% соответствует Query A, 100% — Query B; промежуточные значения интерполируют совместимые параметры.">
              <Slider value={[transitionRatio]} min={0} max={100} step={1} onValueChange={(values) => setTransitionRatio(values[0] ?? 50)} />
            </V3Tooltip>

            <div className="flex flex-wrap items-center gap-2">
              {TRANSITION_PRESETS.map((preset) => (
                <V3Tooltip key={preset} content={`Устанавливает положение перехода на ${preset}% к состоянию Query B.`}>
                  <Button type="button" size="sm" variant={transitionRatio === preset ? "default" : "outline"} onClick={() => setTransitionRatio(preset)}>{preset}%</Button>
                </V3Tooltip>
              ))}
              <V3Tooltip content="Применяет выбранную пропорцию к результатам A и B и обновляет Anchored control bank.">
                <Button type="button" size="sm" className="ml-auto" onClick={() => applyTransitionBlend()} disabled={primaryCount === 0 || secondaryCount === 0}>
                  <Sparkles className="size-4" />Build transition stage
                </Button>
              </V3Tooltip>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Query A</span>
              <span>Midpoint</span>
              <span>Query B</span>
            </div>
          </div>
          <details className="rounded border border-white/15 bg-black/35 p-2">
            <V3Tooltip content="Показывает, какие параметры растут, уменьшаются, переключаются или смешиваются между A и B.">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-zinc-400">Transition flow report</summary>
            </V3Tooltip>
            <div className="pt-2"><TransitionFlowReport /></div>
          </details>
        </div>
      ) : null}

      {searchError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {searchError}
        </div>
      ) : null}

    </section>
  );
}

function QueryPanel(props: {
  title: string;
  value: string;
  placeholder: string;
  resultCount: number;
  isSearching: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded border border-white/20 bg-black/40 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 font-mono text-xs font-medium uppercase tracking-wide">{props.title}<V3InfoTip content="Опишите целевое звучание. Каждый запуск выполняется независимо от предыдущих запросов." /></div>
          <div className="font-mono text-[10px] text-muted-foreground">
            scoped results: {props.resultCount}
          </div>
        </div>
        <V3Tooltip content="Запускает semantic retrieval и anchoring только для содержимого этого поля.">
          <Button type="button" size="sm" className="h-8 rounded border border-fuchsia-400/50 bg-fuchsia-700/80 font-mono text-[10px] uppercase tracking-wide" onClick={props.onSubmit} disabled={!props.value.trim() || props.isSearching}>
            <Sparkles className="size-4" />{props.isSearching ? "Searching..." : "Search"}
          </Button>
        </V3Tooltip>
      </div>

      {props.actions ? <div className="flex flex-wrap gap-1">{props.actions}</div> : null}

      <div className="flex items-stretch gap-1.5">
        <div className="relative min-w-0 flex-1">
          <V3Tooltip content="Введите независимое описание цели. Ctrl+Enter запускает поиск.">
            <Textarea value={props.value} rows={2} className="min-h-[62px] resize-none border-white/15 bg-black/70 py-2 pr-10 font-mono text-xs" placeholder={props.placeholder} onChange={(event) => props.onChange(event.target.value)} onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); props.onSubmit(); }
            }} />
          </V3Tooltip>
          {props.value ? (
            <V3Tooltip content="Очищает только это поле запроса.">
              <button type="button" aria-label={`Clear ${props.title}`} className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground" onClick={props.onClear}><X className="size-4" /></button>
            </V3Tooltip>
          ) : null}
        </div>
        <SpeechInputButtons value={props.value} onChange={props.onChange} label={props.title} />
      </div>
    </div>
  );
}


