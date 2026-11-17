"use client";

import { Input } from "@/components/ui/input";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

type AdvisorStage = AutomationStageDefinition & { actionId: "llm.advisor" };

export function AutomationAdvisorSettings({ stage, onPatch }: { stage: AdvisorStage; onPatch: (patch: Record<string, unknown>) => void }) {
  const requested = stage.settings.requested;
  const allowedActions = Array.isArray(requested.allowedActions) ? requested.allowedActions.join(", ") : "";
  return <section className="space-y-2 rounded border border-border/60 p-2" aria-label="LLM advisor settings">
    <p className="text-[10px] text-muted-foreground">Local Ollama advisor. Its proposal is advisory and is never executed automatically.</p>
    <label className="block text-[10px]">Question<Input aria-label="Advisor question" className="mt-1 h-7 text-[11px]" value={String(requested.question ?? "")} onChange={(event) => onPatch({ question: event.target.value })} /></label>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[10px]">Summary budget (characters)<Input aria-label="Advisor summary budget" className="mt-1 h-7 text-[11px]" type="number" min={200} max={32000} step={100} value={String(requested.budgetChars ?? 3000)} onChange={(event) => onPatch({ budgetChars: Number(event.target.value) })} /></label>
      <label className="text-[10px]">Response limit (tokens)<Input aria-label="Advisor token limit" className="mt-1 h-7 text-[11px]" type="number" min={100} max={1200} step={20} value={String(requested.maxTokens ?? 600)} onChange={(event) => onPatch({ maxTokens: Number(event.target.value) })} /></label>
    </div>
    <label className="inline-flex items-center gap-2 text-[10px]"><input aria-label="Expect advisor proposal" type="checkbox" checked={requested.expectProposal === true} onChange={(event) => onPatch({ expectProposal: event.target.checked })} />Expect a structured next-action proposal</label>
    <label className="block text-[10px]">Allowed action IDs (comma-separated; empty allows any registered action)<Input aria-label="Advisor allowed actions" className="mt-1 h-7 text-[11px]" value={allowedActions} onChange={(event) => onPatch({ allowedActions: event.target.value.split(",").map((action) => action.trim()).filter(Boolean) })} placeholder="audio.segment, data.intersection" /></label>
  </section>;
}
