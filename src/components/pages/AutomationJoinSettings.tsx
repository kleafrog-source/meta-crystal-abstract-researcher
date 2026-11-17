"use client";

import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

type JoinPolicy = { binding: string; onSkipped: "omit" | "fail" | "default"; onFailed: "omit" | "fail" | "default"; onPartial: "accept" | "omit" | "fail"; defaultText?: string };
type JoinStage = AutomationStageDefinition & { actionId: "flow.join" };

function policiesOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function policyFor(sourceId: string, stored: Record<string, unknown>[]): JoinPolicy {
  const candidate = stored.find((policy) => policy.binding === sourceId);
  const onSkipped = candidate?.onSkipped;
  const onFailed = candidate?.onFailed;
  const onPartial = candidate?.onPartial;
  return {
    binding: sourceId,
    onSkipped: onSkipped === "fail" || onSkipped === "default" ? onSkipped : "omit",
    onFailed: onFailed === "fail" || onFailed === "default" ? onFailed : "omit",
    onPartial: onPartial === "omit" || onPartial === "fail" ? onPartial : "accept",
    ...(typeof candidate?.defaultText === "string" ? { defaultText: candidate.defaultText } : {}),
  };
}

export function AutomationJoinSettings({ stage, sourceTitles, onPolicies }: { stage: JoinStage; sourceTitles: Record<string, string>; onPolicies: (policies: Array<Record<string, unknown>>) => void }) {
  const bindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:")).map((binding) => binding.from.slice(6));
  const sourceIds = [...new Set(bindings)];
  const stored = policiesOf(stage.settings.requested.policies);
  const current = sourceIds.map((id) => policyFor(id, stored));
  const update = (sourceId: string, patch: Partial<JoinPolicy>) => onPolicies(current.map((policy) => policy.binding === sourceId ? { ...policy, ...patch } : policy));
  return <section className="space-y-2 rounded border border-border/60 p-2">
    <div><strong className="text-[10px]">Join policy · one policy per source node</strong><p className="text-[10px] text-muted-foreground">Inputs are combined in the order shown above. Skipped and failed branches follow their own policy.</p></div>
    {current.map((policy) => <article key={policy.binding} className="grid gap-2 rounded border border-border/50 p-2 sm:grid-cols-3">
      <strong className="text-[10px] sm:col-span-3">{sourceTitles[policy.binding] ?? policy.binding}</strong>
      <label className="text-[10px]">When skipped<select aria-label={`${sourceTitles[policy.binding] ?? policy.binding} when skipped`} className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={policy.onSkipped} onChange={(event) => update(policy.binding, { onSkipped: event.target.value as JoinPolicy["onSkipped"] })}><option value="omit">omit input</option><option value="fail">fail join</option><option value="default">use default text</option></select></label>
      <label className="text-[10px]">When failed<select aria-label={`${sourceTitles[policy.binding] ?? policy.binding} when failed`} className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={policy.onFailed} onChange={(event) => update(policy.binding, { onFailed: event.target.value as JoinPolicy["onFailed"] })}><option value="omit">omit input</option><option value="fail">fail join</option><option value="default">use default text</option></select></label>
      <label className="text-[10px]">When partial<select aria-label={`${sourceTitles[policy.binding] ?? policy.binding} when partial`} className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={policy.onPartial} onChange={(event) => update(policy.binding, { onPartial: event.target.value as JoinPolicy["onPartial"] })}><option value="accept">accept partial input</option><option value="omit">omit input</option><option value="fail">fail join</option></select></label>
      {(policy.onSkipped === "default" || policy.onFailed === "default") && <label className="text-[10px] sm:col-span-3">Default text<textarea aria-label={`${sourceTitles[policy.binding] ?? policy.binding} default text`} className="mt-1 min-h-16 w-full rounded border border-input bg-background p-2 text-[10px]" value={policy.defaultText ?? ""} onChange={(event) => update(policy.binding, { defaultText: event.target.value })} /></label>}
    </article>)}
    {current.length === 0 && <p role="status" className="text-[10px] text-amber-300">Add at least one compatible input before preview.</p>}
  </section>;
}
