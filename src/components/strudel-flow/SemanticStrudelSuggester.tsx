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
import type { StrudelSearchResult, SemanticStrudelState } from "./types";
import { useStrudelFlowStore, createNodeFromSearchResult } from "@/lib/strudel/strudel-flow-store";

/**
 * Perform semantic search using the local RAG server
 */
async function searchStrudelParams(
  query: string
): Promise<StrudelSearchResult[]> {
  const response = await apiPost<{ results: StrudelSearchResult[] }>("/api/strudel/search", {
    query,
    top_k: 6,
    min_score: 0.1,
  });
  return response.results ?? [];
}

interface SemanticStrudelSuggesterProps {
  onAddNode?: (param: StrudelSearchResult) => void;
  compact?: boolean;
}

export function SemanticStrudelSuggester({ 
  onAddNode,
  compact = false 
}: SemanticStrudelSuggesterProps) {
  const [state, setState] = useState<SemanticStrudelState>({
    query: "",
    results: [],
    error: null,
    isLoading: false,
  });
  
  // Get Zustand store for adding nodes to React Flow
  const addNode = useStrudelFlowStore((state) => state.addNode);

  const handleSearch = async () => {
    if (!state.query.trim()) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const results = await searchStrudelParams(state.query);
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
              onClick={() => setState({ query: "", results: [], error: null, isLoading: false })}
            >
              Reset
            </Button>
            <Badge variant="outline">multilingual</Badge>
            <Badge variant="outline">semantic search</Badge>
          </div>
          
          {state.error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {state.error}
            </div>
          )}
          
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
