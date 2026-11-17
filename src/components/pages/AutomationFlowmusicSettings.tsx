"use client";

import { Input } from "@/components/ui/input";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

type FlowmusicStage = AutomationStageDefinition & { actionId: "flowmusic.export" };

export function AutomationFlowmusicSettings({ stage, onPatch }: { stage: FlowmusicStage; onPatch: (patch: Record<string, unknown>) => void }) {
  const settings = stage.settings.requested;
  return <section className="mt-2 grid gap-2 rounded border border-border/60 p-2 sm:grid-cols-2" aria-label="FlowMusic export settings">
    <label className="inline-flex items-center gap-2 text-[11px]"><input aria-label="Blend CLAP and SigLIP" type="checkbox" checked={settings.blend === true} onChange={(event) => onPatch({ blend: event.target.checked })} />Blend CLAP and SigLIP</label>
    <label className="inline-flex items-center gap-2 text-[11px]"><input aria-label="Include vocal matrix" type="checkbox" checked={settings.vocalMatrix === true} onChange={(event) => onPatch({ vocalMatrix: event.target.checked })} />Include vocal matrix</label>
    <label className="text-[11px]">CLAP weight<Input aria-label="CLAP weight" className="mt-1 h-7" type="number" min={0} max={1} step={0.05} value={String(settings.clapWeight ?? 0.5)} onChange={(event) => onPatch({ clapWeight: Number(event.target.value) })} /></label>
    <p className="self-end text-[10px] text-muted-foreground">Weight is between 0 and 1. Inputs stay ordered: CLAP first, SigLIP second.</p>
  </section>;
}
