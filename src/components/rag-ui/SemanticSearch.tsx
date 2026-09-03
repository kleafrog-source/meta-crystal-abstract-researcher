"use client";

import { useEffect, useRef } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRagStore } from "@/store/rag-store";

const SUGGESTIONS: Array<{ label: string; query: string }> = [
  {
    label: "Acid bass",
    query: "acid bass with resonant movement and punchy low-end",
  },
  {
    label: "Wide stereo pad",
    query: "wide evolving stereo pad with soft modulation",
  },
  {
    label: "Dense percussion",
    query: "dense percussive groove with transient detail",
  },
  {
    label: "Indian meend",
    query: "indian meend glide with fluid ornamentation",
  },
];

export function SemanticSearch() {
  const query = useRagStore((state) => state.query);
  const setQuery = useRagStore((state) => state.setQuery);
  const proposeParameters = useRagStore((state) => state.proposeParameters);
  const isSearching = useRagStore((state) => state.isSearching);
  const searchError = useRagStore((state) => state.searchError);
  const totalVectorized = useRagStore((state) => state.totalVectorized);
  const activeCount = useRagStore((state) => state.activeParameters.length);
  const skipDebounceRef = useRef(false);

  useEffect(() => {
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      void proposeParameters(query);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [proposeParameters, query]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Semantic Search</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">vectorized: {totalVectorized}</Badge>
          <Badge variant="secondary">active: {activeCount}</Badge>
        </div>
      </div>

      <div className="relative">
        <Textarea
          value={query}
          rows={3}
          className="resize-y pr-10"
          placeholder="Describe the sound you want, for example: acid bass with sharp envelope and animated resonance"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              skipDebounceRef.current = true;
              void proposeParameters(query);
            }
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear query"
            className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => {
              skipDebounceRef.current = true;
              setQuery("");
              void proposeParameters("");
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {isSearching ? (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            searching...
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            skipDebounceRef.current = true;
            void proposeParameters(query);
          }}
          disabled={!query.trim() || isSearching}
        >
          {isSearching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Search top 30
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl/Cmd + Enter</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            onClick={() => {
              skipDebounceRef.current = true;
              setQuery(suggestion.query);
              void proposeParameters(suggestion.query);
            }}
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      {searchError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {searchError}
        </div>
      ) : null}
    </section>
  );
}
