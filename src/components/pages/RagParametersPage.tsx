"use client";

import { Layers, Sliders, Sparkles, Zap } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MacroGenerator } from "@/components/rag-ui/MacroGenerator";
import { SemanticSearch } from "@/components/rag-ui/SemanticSearch";
import { VectorizationDashboard } from "@/components/rag-ui/VectorizationDashboard";
import { VirtualizedParamList } from "@/components/rag-ui/VirtualizedParamList";

export function RagParametersPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">Flowmusic Genesis</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                RAG Parameters UI
              </Badge>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Embeddings-only search over 2700+ Flowmusic parameters using local Ollama and live editable controls.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              <Layers className="mr-1 size-3" />
              virtualized list
            </Badge>
            <Badge variant="outline">
              <Zap className="mr-1 size-3" />
              cosine similarity
            </Badge>
            <Badge variant="outline">
              <Sliders className="mr-1 size-3" />
              top 30 controls
            </Badge>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <Card className="border-border/60 bg-card/60">
            <CardContent className="flex items-start gap-3 p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium text-foreground">
                  This module now runs inside the main application and uses the real local Ollama embedding endpoint only.
                </p>
                <p className="text-muted-foreground">
                  First vectorize the dataset, then search with prompts like
                  {" "}
                  <code>acid bass</code>
                  {" "}
                  or
                  {" "}
                  <code>кислотный бас</code>
                  {" "}
                  and fine-tune the returned parameters before copying the generated Flowmusic macro.
                </p>
              </div>
            </CardContent>
          </Card>

          <VectorizationDashboard />
          <SemanticSearch />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Layers className="size-4 text-primary" />
                  Active parameters
                </h2>
                <span className="text-xs text-muted-foreground">
                  virtualized results
                </span>
              </div>
              <VirtualizedParamList />
            </section>

            <aside className="space-y-6">
              <MacroGenerator />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
