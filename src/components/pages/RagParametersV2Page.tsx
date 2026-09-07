"use client";

import { Layers, Sliders, Zap } from "@/components/icons";
import { AnchoringDashboard } from "@/components/rag-v2/AnchoringDashboard";
import { MacroGenerator } from "@/components/rag-v2/MacroGenerator";
import { SemanticSearch } from "@/components/rag-v2/SemanticSearch";
import { VirtualizedParamList } from "@/components/rag-v2/VirtualizedParamList";
import { Badge } from "@/components/ui/badge";

export function RagParametersV2Page() {
  return (
    <div className="flowmusic-console flex h-full flex-col">
      <header className="border-b border-white/15 bg-black/70 px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight text-white sm:text-lg">
              <span className="rounded border border-fuchsia-400/70 bg-fuchsia-950/40 px-2 py-1 text-[10px] uppercase tracking-wide text-fuchsia-200">
                bge-m3 console
              </span>
              Omega-Protocol Parameter Synthesizer
            </h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="console-status-badge">
              <Layers className="mr-1 size-3" />
              scoped retrieval
            </Badge>
            <Badge variant="outline" className="console-status-badge">
              <Zap className="mr-1 size-3" />
              lexical + axis
            </Badge>
            <Badge variant="outline" className="console-status-badge">
              <Sliders className="mr-1 size-3" />
              live controls
            </Badge>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3">
          <details className="console-service-drawer rounded border border-white/20 bg-black/50">
            <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              Service bay: anchoring status, index and live anchors
            </summary>
            <div className="border-t border-white/15 p-2">
              <AnchoringDashboard />
            </div>
          </details>
          <SemanticSearch />

          <div className="console-workbench grid min-h-[680px] gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="console-bank flex min-h-0 flex-col">
              <div className="console-bank-header flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-white">
                  <Layers className="size-4 text-primary" />
                  Anchored control bank
                </h2>
                <span className="font-mono text-[10px] text-emerald-300">up to 50 channels</span>
              </div>
              <VirtualizedParamList className="min-h-0 flex-1" />
            </section>

            <aside className="min-h-0">
              <MacroGenerator />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
