"use client";

import * as React from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import debounce from "lodash/debounce";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRagStore } from "@/store/rag-store";

/** Semantic search box with a 500ms debounce, per the task spec.
 *
 *  On every debounced change it fires `POST /api/propose-parameters` and
 *  the result becomes the active editable parameter set in the store.
 *
 *  The debounce is built on `lodash.debounce` (stable across re-renders
 *  via `useMemo`) so the trailing call always fires with the latest text.
 */
const SUGGESTIONS: Array<{ label: string; query: string }> = [
  {
    label: "A1 · жёсткий фазовый переход",
    query:
      "жёсткий monotonic path порядок фазовых переходов крутизна градиента A1",
  },
  {
    label: "A2 · сохранение энергии",
    query:
      "zero flux redistribution энергии баланс баса и FX сохранение мощности",
  },
  {
    label: "A5 · сглаживание meend",
    query:
      "adaptive density smoothing filter сглаживание шума плотности meend",
  },
  {
    label: "Stereo autopan инверсия",
    query: "autopan interchannel phase inversion stereo анти-фаза LFO панорама",
  },
  {
    label: "Таймлайн энергии трека",
    query: "energy timeline anchor points структурные вехи дропы климакс",
  },
];

export function SemanticSearch() {
  const query = useRagStore((s) => s.query);
  const setQuery = useRagStore((s) => s.setQuery);
  const proposeParameters = useRagStore((s) => s.proposeParameters);
  const isSearching = useRagStore((s) => s.isSearching);
  const searchError = useRagStore((s) => s.searchError);
  const lastUsedFallback = useRagStore((s) => s.lastUsedFallback);
  const totalVectorized = useRagStore((s) => s.totalVectorized);
  const activeCount = useRagStore((s) => s.activeParameters.length);

  // Build a stable debounced dispatcher. We don't store the latest text in
  // the closure (we pass the value explicitly) so React 19's strict-mode
  // double-invocation stays harmless.
  const debouncedSearch = React.useMemo(
    () =>
      debounce((q: string) => {
        void proposeParameters(q);
      }, 500),
    [proposeParameters],
  );

  React.useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setQuery(next);
      debouncedSearch(next);
    },
    [debouncedSearch, setQuery],
  );

  const handleClear = React.useCallback(() => {
    setQuery("");
    debouncedSearch.cancel();
    void proposeParameters("");
  }, [debouncedSearch, proposeParameters, setQuery]);

  const handleRunNow = React.useCallback(() => {
    debouncedSearch.cancel();
    void proposeParameters(query);
  }, [debouncedSearch, proposeParameters, query]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunNow();
      }
    },
    [handleRunNow],
  );

  const topResult = useRagStore((s) =>
    s.activeParameters.length > 0 ? s.activeParameters[0] : null,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Семантический поиск параметров</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {totalVectorized > 0 && (
            <Badge variant="outline" className="text-[10px] font-normal">
              векторов: {totalVectorized}
            </Badge>
          )}
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              активно: {activeCount}
            </Badge>
          )}
          {lastUsedFallback && (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-300">
              fallback-эмбеддинги
            </Badge>
          )}
        </div>
      </div>

      <div className="relative">
        <Textarea
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Опишите желаемый звук, эффект или категорию — например: «глубокий бас с сохранением энергии и медленным фазовым переходом A1»…"
          rows={3}
          className="resize-y pr-10 text-sm leading-relaxed"
          aria-label="Семантический запрос"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Очистить запрос"
            className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        {isSearching && (
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
            <Loader2 className="size-3 animate-spin" />
            RAG-поиск…
          </div>
        )}
      </div>

      {searchError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {searchError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleRunNow}
          disabled={isSearching || !query.trim()}
          size="sm"
        >
          {isSearching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Найти релевантные параметры
        </Button>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          ⌘/Ctrl + Enter
        </span>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setQuery(s.query);
              debouncedSearch.cancel();
              void proposeParameters(s.query);
            }}
            className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          >
            {s.label}
          </button>
        ))}
      </div>

      {topResult && !isSearching && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Топ-1 совпадение: </span>
          <span className="font-mono text-foreground">
            {topResult.technical_name}
          </span>
          <span className="text-muted-foreground">
            {" "}
            (cos sim {Math.round(topResult.similarity * 100)}%)
          </span>
        </div>
      )}
    </section>
  );
}
