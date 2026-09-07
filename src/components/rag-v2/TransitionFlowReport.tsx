"use client";

import { ArrowUp, ArrowDown, Blend, GitCompareArrows, Orbit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buildTransitionFlowReport } from "@/lib/rag-v2/transition-flow";
import { useRagV2Store } from "@/store/rag-v2-store";

export function TransitionFlowReport() {
  const primary = useRagV2Store((state) => state.searchResults);
  const secondary = useRagV2Store((state) => state.secondaryResults);
  const active = useRagV2Store((state) => state.activeParameters);
  const transitionRatio = useRagV2Store((state) => state.transitionRatio);

  if (primary.length === 0 || secondary.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/30 p-4">
        <div className="text-sm font-medium">Transition flow</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Run both Query A and Query B to build a textual mapping of parameter drift, switches, and layer blending.
        </p>
      </div>
    );
  }

  const report = buildTransitionFlowReport({
    primary,
    secondary,
    active,
    ratio: transitionRatio,
  });

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/30 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-medium">Transition flow</div>
          <p className="text-xs text-muted-foreground">
            Text-only live report for how parameters move between Prompt A and Prompt B.
          </p>
        </div>
        <Badge variant="outline">{report.entries.length} mapped parameters</Badge>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 font-mono text-xs leading-6 text-foreground">
        {report.summary}
      </div>

      <div className="grid gap-2 lg:grid-cols-5">
        {report.snapshots.map((snapshot) => (
          <div key={snapshot.ratio} className="rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="mb-1 text-[11px] font-medium text-foreground">{snapshot.ratio}%</div>
            <div className="text-[10px] leading-5 text-muted-foreground">{snapshot.summary}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {report.entries.slice(0, 8).map((entry) => (
          <div
            key={entry.technicalName}
            className="grid gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs lg:grid-cols-[minmax(0,180px)_70px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{entry.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{entry.technicalName}</div>
            </div>
            <div className="flex items-center gap-1 text-foreground">
              <OperatorIcon operator={entry.operator} />
              <span className="font-mono">{entry.operator}</span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">A</div>
              <div className="font-mono text-foreground">{String(entry.fromValue)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stage {report.ratio}%</div>
              <div className="font-mono text-foreground">{String(entry.currentValue)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">B</div>
              <div className="font-mono text-foreground">{String(entry.toValue)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperatorIcon(props: { operator: "↑" | "↓" | "→" | "↔" | "⊗" | "⊕" }) {
  if (props.operator === "↑") {
    return <ArrowUp className="size-3.5" />;
  }
  if (props.operator === "↓") {
    return <ArrowDown className="size-3.5" />;
  }
  if (props.operator === "↔") {
    return <GitCompareArrows className="size-3.5" />;
  }
  if (props.operator === "⊗") {
    return <Blend className="size-3.5" />;
  }
  if (props.operator === "⊕") {
    return <Orbit className="size-3.5" />;
  }
  return <GitCompareArrows className="size-3.5" />;
}
