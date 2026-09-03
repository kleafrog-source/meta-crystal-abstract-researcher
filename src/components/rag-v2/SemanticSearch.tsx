"use client";

import { useRef } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRagV2Store } from "@/store/rag-v2-store";

const SUGGESTIONS: Array<{ label: string; query: string }> = [
  { label: "Brighter timbre", query: "make the timbre noticeably brighter and a little sharper" },
  { label: "Slower attack", query: "сделай атаку сильно плавнее и мягче" },
  { label: "Faster tempo", query: "set tempo to 120 bpm and make the groove faster" },
  { label: "Stereo width", query: "wide evolving stereo pad with softer movement" },
];

export function SemanticSearch() {
  const query = useRagV2Store((state) => state.query);
  const setQuery = useRagV2Store((state) => state.setQuery);
  const proposeParameters = useRagV2Store((state) => state.proposeParameters);
  const isSearching = useRagV2Store((state) => state.isSearching);
  const searchError = useRagV2Store((state) => state.searchError);
  const activeCount = useRagV2Store((state) => state.activeParameters.length);
  const status = useRagV2Store((state) => state.status);
  const manualSubmitRef = useRef(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Semantic Search V2</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">dataset: {status?.total_parameters ?? 0}</Badge>
          <Badge variant="secondary">active: {activeCount}</Badge>
        </div>
      </div>

      <div className="relative">
        <Textarea
          value={query}
          rows={3}
          className="resize-y pr-10"
          placeholder="Describe the sound change you want. V2 will scope candidates, then apply lexical or axis anchoring."
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              manualSubmitRef.current = true;
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
              manualSubmitRef.current = false;
              setQuery("");
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {isSearching ? (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            anchoring...
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            manualSubmitRef.current = true;
            void proposeParameters(query);
          }}
          disabled={!query.trim() || isSearching}
        >
          {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Scope and anchor
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
              manualSubmitRef.current = true;
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

      <div className="text-xs text-muted-foreground">
        Search runs only on explicit submit: button click, suggestion click, or Ctrl/Cmd + Enter.
      </div>
    </section>
  );
}
