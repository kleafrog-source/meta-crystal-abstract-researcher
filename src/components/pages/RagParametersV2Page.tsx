"use client";

import { Layers, Sliders, Sparkles, Zap } from "@/components/icons";
import { AnchoringDashboard } from "@/components/rag-v2/AnchoringDashboard";
import { MacroGenerator } from "@/components/rag-v2/MacroGenerator";
import { SemanticSearch } from "@/components/rag-v2/SemanticSearch";
import { VirtualizedParamList } from "@/components/rag-v2/VirtualizedParamList";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function RagParametersV2Page() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">Flowmusic Genesis</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                Semantic Value Anchoring V2
              </Badge>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Isolated v2 integration with enriched JSON artifacts, scoped retrieval, and anchoring through the tested Python runtime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              <Layers className="mr-1 size-3" />
              scoped retrieval
            </Badge>
            <Badge variant="outline">
              <Zap className="mr-1 size-3" />
              lexical + axis
            </Badge>
            <Badge variant="outline">
              <Sliders className="mr-1 size-3" />
              live controls
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
                  This page is the isolated September 3, 2026 v2 integration path. It does not depend on the old Prisma parameter-vector flow.
                </p>
                <p className="text-muted-foreground">
                  Query the sound intent, let v2 scope likely parameters, then inspect whether each change came from numeric, lexical, or axis anchoring before copying the clean macro output.
                </p>
              </div>
            </CardContent>
          </Card>

          <AnchoringDashboard />
          <SemanticSearch />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Layers className="size-4 text-primary" />
                  Anchored parameters
                </h2>
                <span className="text-xs text-muted-foreground">virtualized results</span>
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
