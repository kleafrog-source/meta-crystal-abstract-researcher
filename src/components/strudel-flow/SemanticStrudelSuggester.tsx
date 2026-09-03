/**
 * Strudel RAG - Semantic Parameter Suggester
 * 
 * A React component that provides semantic search for Strudel parameters
 * using RAG (Retrieval-Augmented Generation) with BGE-m3 embeddings.
 * 
 * Features:
 * - Natural language query input (supports Russian and English)
 * - Semantic search via local Ollama/sentence-transformers backend
 * - Top-K parameter recommendations with confidence scores
 * - Integration with Zustand store for adding nodes to React Flow
 */

"use client";

import { useState } from "react";
import { Brain, Search, Loader2, PlusCircle, Sparkles } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-hint";
import { apiPost } from "@/hooks/use-fetch";
import type {
  StrudelRoleBlockPreviewItem,
  StrudelSearchResult,
  StrudelSectionAssemblyPlan,
  StrudelTransportPlan,
  StrudelTrackPlan,
  SemanticStrudelState,
} from "./types";
import { useStrudelFlowStore, createNodeFromSearchResult } from "@/lib/strudel/strudel-flow-store";

const SEARCH_PRESETS = [
  "dark industrial techno with heavy drums, evolving bass, sharp arpeggio and breakdown",
  "slow ambient pad with warm bass, roomy texture and long evolving harmony",
  "retro game soundtrack with fast arpeggio, punchy drums and chip lead",
  "cinematic sci-fi pulse with wide stereo motion, sub bass and metallic accents",
  "polyrhythmic tribal groove with percussion layers, hypnotic bass and airy texture",
  "acid electro groove with distorted lead, tight kick and animated filter motion",
  "dream pop shimmer with soft pad, melodic motif, room ambience and gentle bass",
  "glitchy IDM loop with broken drums, granular noise texture and unusual syncopation",
  "dub techno chord cloud with deep kick, delay space and warm filtered bass",
  "ritual dark ambient with drones, sparse percussion, low-pass haze and slow movement",
];

/**
 * Perform semantic search using the local RAG server
 */
async function searchStrudelParams(
  query: string
): Promise<{
  results: StrudelSearchResult[];
  assemblyStack?: StrudelSearchResult[];
  searchType?: string;
  roleBlockIndexRows?: number;
  embeddingModel?: string;
  backend?: string;
  trackPlan?: StrudelTrackPlan;
  blockPreview?: Record<string, StrudelRoleBlockPreviewItem[]>;
  sectionAssemblyPlan?: StrudelSectionAssemblyPlan;
  transportPlan?: StrudelTransportPlan;
}> {
  const response = await apiPost<{
    results: StrudelSearchResult[];
    assembly_stack?: StrudelSearchResult[];
    search_type?: string;
    role_block_index_rows?: number;
    embedding_model?: string;
    backend?: string;
    track_plan?: StrudelTrackPlan;
    block_preview?: Record<string, StrudelRoleBlockPreviewItem[]>;
    section_assembly_plan?: StrudelSectionAssemblyPlan;
    transport_plan?: StrudelTransportPlan;
  }>("/api/strudel/search", {
    query,
    top_k: 10,
  });
  return {
    results: response.results ?? [],
    assemblyStack: response.assembly_stack ?? [],
    searchType: response.search_type,
    roleBlockIndexRows: response.role_block_index_rows,
    embeddingModel: response.embedding_model,
    backend: response.backend,
    trackPlan: response.track_plan,
    blockPreview: response.block_preview,
    sectionAssemblyPlan: response.section_assembly_plan,
    transportPlan: response.transport_plan,
  };
}

interface SemanticStrudelSuggesterProps {
  onAddNode?: (param: StrudelSearchResult) => void;
  onSearchResolved?: (meta: { transportPlan?: StrudelTransportPlan; trackPlan?: StrudelTrackPlan }) => void;
  compact?: boolean;
}

export function SemanticStrudelSuggester({ 
  onAddNode,
  onSearchResolved,
  compact = false 
}: SemanticStrudelSuggesterProps) {
  const [state, setState] = useState<SemanticStrudelState>({
    query: "",
    results: [],
    error: null,
    isLoading: false,
  });
  const [searchMeta, setSearchMeta] = useState<{
    assemblyStack?: StrudelSearchResult[];
    searchType?: string;
    roleBlockIndexRows?: number;
    embeddingModel?: string;
    backend?: string;
    trackPlan?: StrudelTrackPlan;
    blockPreview?: Record<string, StrudelRoleBlockPreviewItem[]>;
    sectionAssemblyPlan?: StrudelSectionAssemblyPlan;
    transportPlan?: StrudelTransportPlan;
  }>({});
  
  // Get Zustand store for adding nodes to React Flow
  const addNode = useStrudelFlowStore((state) => state.addNode);
  const replaceNodes = useStrudelFlowStore((state) => state.replaceNodes);

  const handleSearch = async () => {
    if (!state.query.trim()) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await searchStrudelParams(state.query);
      const results = response.results;
      setSearchMeta({
        assemblyStack: response.assemblyStack,
        searchType: response.searchType,
        roleBlockIndexRows: response.roleBlockIndexRows,
        embeddingModel: response.embeddingModel,
        backend: response.backend,
        trackPlan: response.trackPlan,
        blockPreview: response.blockPreview,
        sectionAssemblyPlan: response.sectionAssemblyPlan,
        transportPlan: response.transportPlan,
      });
      onSearchResolved?.({
        transportPlan: response.transportPlan,
        trackPlan: response.trackPlan,
      });
      setState(prev => ({ ...prev, results, isLoading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        isLoading: false 
      }));
    }
  };

  const handleApply = (result: StrudelSearchResult) => {
    if (onAddNode) {
      onAddNode(result);
    } else {
      // Default: add node to React Flow via Zustand store
      const newNode = createNodeFromSearchResult(result);
      addNode(newNode);
    }
  };

  const handleApplyTop = (count: number) => {
    state.results.slice(0, count).forEach((result) => handleApply(result));
  };

  const handleApplyAssemblyStack = () => {
    (searchMeta.assemblyStack ?? []).forEach((result) => handleApply(result));
  };

  const handleReplaceWithAssemblyStack = () => {
    const stack = searchMeta.assemblyStack ?? [];
    if (stack.length === 0) return;
    replaceNodes(stack.map((result) => createNodeFromSearchResult(result)));
  };

  if (compact) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-300" />
            Strudel Semantic Search
          </CardTitle>
          <CardDescription className="text-xs">
            Find parameters by description
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              value={state.query}
              onChange={(e) => setState(prev => ({ ...prev, query: e.target.value }))}
              placeholder="ретро-звук с арпеджио..."
              className="min-h-[40px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
            />
            <Button 
              onClick={handleSearch} 
              disabled={state.isLoading || !state.query.trim()}
              size="sm"
            >
              {state.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          
          {state.error && (
            <div className="text-xs text-rose-400">{state.error}</div>
          )}
          
          {state.results.length > 0 && (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {state.results.map((result) => (
                  <div 
                    key={result.id}
                    className="p-2 border rounded-md hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleApply(result)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">
                          {result.name}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({result.category})
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {result.description}
                        </div>
                        {result.matched_phrase && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            matched: {result.matched_phrase}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-green-600 font-mono">
                          {(result.score * 100).toFixed(0)}%
                        </div>
                        <PlusCircle className="h-4 w-4 text-blue-600 mt-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-cyan-300" />
            <Sparkles className="h-4 w-4 text-yellow-300" />
            Semantic Strudel Parameter Suggester
          </CardTitle>
          <CardDescription>
            Natural language query → semantic retrieval → suggested Strudel parameters.
            Supports Russian and English queries thanks to BGE-m3 multilingual embeddings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel
              label="Search query"
              hint="Describe the sound or effect you want (e.g., 'retro game sound with fast arpeggio')"
            />
            <Textarea
              value={state.query}
              onChange={(e) => setState(prev => ({ ...prev, query: e.target.value }))}
              className="min-h-[100px]"
              placeholder="Например: ретро-звук с быстрым арпеджио и дисторшном..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {SEARCH_PRESETS.map((preset, index) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                className="max-w-full whitespace-normal text-left"
                onClick={() => setState((prev) => ({ ...prev, query: preset }))}
              >
                Preset {index + 1}
              </Button>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSearch} disabled={state.isLoading || !state.query.trim()}>
              {state.isLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-3.5 w-3.5" />
              )}
              Search Parameters
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setState({ query: "", results: [], error: null, isLoading: false });
                setSearchMeta({});
              }}
            >
              Reset
            </Button>
            <Button variant="outline" onClick={() => handleApplyTop(4)} disabled={state.results.length === 0}>
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Add top 4
            </Button>
            <Button variant="outline" onClick={() => handleApplyTop(8)} disabled={state.results.length === 0}>
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Add top 8
            </Button>
            <Button variant="outline" onClick={handleApplyAssemblyStack} disabled={!searchMeta.assemblyStack || searchMeta.assemblyStack.length === 0}>
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Add assembly stack
            </Button>
            <Button variant="outline" onClick={handleReplaceWithAssemblyStack} disabled={!searchMeta.assemblyStack || searchMeta.assemblyStack.length === 0}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Replace flow with assembly
            </Button>
            <Badge variant="outline">multilingual</Badge>
            <Badge variant="outline">role-block retrieval</Badge>
            {searchMeta.roleBlockIndexRows ? <Badge variant="outline">{searchMeta.roleBlockIndexRows} rows</Badge> : null}
            {searchMeta.backend ? <Badge variant="outline">{searchMeta.backend}</Badge> : null}
          </div>
          
          {state.error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {state.error}
            </div>
          )}

          {searchMeta.searchType ? (
            <div className="text-xs text-muted-foreground">
              Search mode: {searchMeta.searchType}
              {searchMeta.embeddingModel ? ` · query embedding: ${searchMeta.embeddingModel}` : ""}
            </div>
          ) : null}

          {searchMeta.transportPlan ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Transport plan</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">cpm: {searchMeta.transportPlan.cpm}</Badge>
                <Badge variant="outline">bpc: {searchMeta.transportPlan.bpc}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{searchMeta.transportPlan.reason}</div>
            </div>
          ) : null}

          {searchMeta.trackPlan ? (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">Track plan</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">style: {searchMeta.trackPlan.style}</Badge>
                <Badge variant="outline">bpm: {searchMeta.trackPlan.bpm}</Badge>
                <Badge variant="outline">scale: {searchMeta.trackPlan.scale}</Badge>
                <Badge variant="outline">density: {searchMeta.trackPlan.density}</Badge>
                <Badge variant="outline">intensity: {searchMeta.trackPlan.intensity}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sections</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {searchMeta.trackPlan.sections.map((section) => (
                      <Badge key={section} variant="secondary" className="text-[10px]">
                        {section}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required roles</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {searchMeta.trackPlan.requiredRoles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-[10px]">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Style tags</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {searchMeta.trackPlan.styleTags.length > 0 ? searchMeta.trackPlan.styleTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        {tag}
                      </Badge>
                    )) : <span className="text-xs text-muted-foreground">none</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {searchMeta.blockPreview && Object.keys(searchMeta.blockPreview).length > 0 ? (
            <div className="rounded-md border border-border/60 bg-card/20 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Retrieved role blocks
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {Object.entries(searchMeta.blockPreview).map(([role, items]) => (
                  <div key={role} className="rounded-md border border-border/60 bg-card/30 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium">{role}</div>
                      <Badge variant="outline">{items.length} hits</Badge>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="rounded border border-border/50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {item.block_type}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {(item.score * 100).toFixed(1)}%
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.source_file}</div>
                          {item.style_tags.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.style_tags.slice(0, 4).map((tag) => (
                                <Badge key={`${item.id}-${tag}`} variant="secondary" className="text-[10px]">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-2 rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-cyan-100">
                            {item.renderable_code.slice(0, 160)}
                            {item.renderable_code.length > 160 ? "..." : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {searchMeta.sectionAssemblyPlan && searchMeta.sectionAssemblyPlan.length > 0 ? (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-200">
                Section assembly plan
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {searchMeta.sectionAssemblyPlan.map((sectionPlan) => (
                  <div key={sectionPlan.section} className="rounded-md border border-border/60 bg-card/30 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium">{sectionPlan.section}</div>
                      <Badge variant="outline">{sectionPlan.focus}</Badge>
                    </div>
                    <div className="space-y-2">
                      {sectionPlan.items.map((item) => (
                        <div key={`${sectionPlan.section}-${item.id}-${item.priority ?? 0}`} className="rounded border border-border/50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{item.name}</span>
                            {item.role ? <Badge variant="secondary">{item.role}</Badge> : null}
                            {item.sourceBlockType ? <Badge variant="outline">{item.sourceBlockType}</Badge> : null}
                            {item.priority !== undefined && item.priority !== null ? <Badge variant="outline">p{item.priority}</Badge> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {searchMeta.assemblyStack && searchMeta.assemblyStack.length > 0 ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Assembly stack
                </div>
                <Badge variant="outline">{searchMeta.assemblyStack.length} nodes</Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {searchMeta.assemblyStack.map((item) => (
                  <button
                    key={`${item.id}-${item.priority ?? 0}`}
                    type="button"
                    className="rounded-md border border-border/60 bg-card/30 p-3 text-left transition-colors hover:bg-accent/40"
                    onClick={() => handleApply(item)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{item.name}</span>
                      {item.role ? <Badge variant="secondary">{item.role}</Badge> : null}
                      {item.priority !== undefined && item.priority !== null ? (
                        <Badge variant="outline">p{item.priority}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
                    {item.sourceBlockType ? (
                      <div className="mt-1 text-[11px] text-cyan-300">
                        source: {item.sourceBlockType}
                        {item.sourceBlockId ? ` · ${item.sourceBlockId}` : ""}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          
          {state.results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Results ({state.results.length})
                </div>
                <Badge variant="outline">top {state.results.length}</Badge>
              </div>
              
              <ScrollArea className="h-[400px] rounded-md border border-border/60 bg-card/20">
                <div className="space-y-3 p-4">
                  {state.results.map((result) => (
                    <div 
                      key={result.id}
                      className="rounded-md border border-border/60 bg-card/30 p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{result.name}</span>
                            <Badge variant="outline">{result.category}</Badge>
                            <Badge variant="outline" className="text-green-600">
                              {(result.score * 100).toFixed(1)}% match
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {result.description}
                          </div>
                          {result.matched_phrase && (
                            <div className="mt-1 text-xs text-cyan-300">
                              Matched: "{result.matched_phrase}"
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleApply(result)}
                        >
                          <PlusCircle className="h-3.5 w-3.5 mr-1" />
                          Add to Flow
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
