"use client";

import { Input } from "@/components/ui/input";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

type DataStage = AutomationStageDefinition & { actionId: "data.filter" | "data.count" | "data.select" | "data.split" };
type FilterRule = { field: string; op: string; value?: unknown };
type SplitChannel = { name: string; rule: Record<string, unknown> };

const FILTER_OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "not_in", "is_empty", "not_empty"];
const PARAMETER_FIELDS = ["technical_name", "name_ru", "category", "ui_element", "current_value", "suggested_value", "similarity", "domain_layer", "source"];

function objectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function LiteralEditor({ value, onChange }: { value: unknown; onChange: (next: unknown) => void }) {
  const type = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
  if (type === "boolean") return <select aria-label="Rule value" className="h-7 rounded border border-input bg-background px-2 text-[10px]" value={String(value)} onChange={(event) => onChange(event.target.value === "true")}><option value="true">true</option><option value="false">false</option></select>;
  return <label className="flex gap-1"><select aria-label="Rule value type" className="h-7 rounded border border-input bg-background px-1 text-[10px]" value={type} onChange={(event) => onChange(event.target.value === "number" ? 0 : event.target.value === "boolean" ? false : "")}><option value="string">text</option><option value="number">number</option><option value="boolean">boolean</option></select><Input aria-label="Rule value" className="h-7 text-[10px]" type={type === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)} /></label>;
}

export function AutomationDataSettings({ stage, onPatch }: { stage: DataStage; onPatch: (patch: Record<string, unknown>) => void }) {
  if (stage.actionId === "data.filter") {
    const rules = objectList(stage.settings.requested.rules) as FilterRule[];
    const patchRules = (next: FilterRule[]) => onPatch({ rules: next });
    return <section className="space-y-2 rounded border border-border/60 p-2">
      <div className="flex items-center justify-between"><strong className="text-[10px]">Filter · all rules must match</strong><button type="button" className="text-[10px] text-primary underline" onClick={() => patchRules([...rules, { field: "technical_name", op: "contains", value: "" }])}>Add rule</button></div>
      {rules.map((rule, index) => <div key={`${index}-${rule.field}`} className="grid gap-1 rounded border border-border/50 p-2 sm:grid-cols-3">
        <label className="text-[10px]">Field<Input aria-label={`Filter rule ${index + 1} field`} className="mt-1 h-7 text-[10px]" list="automation-parameter-fields" value={String(rule.field ?? "")} onChange={(event) => patchRules(rules.map((item, i) => i === index ? { ...item, field: event.target.value } : item))} /></label>
        <label className="text-[10px]">Operator<select aria-label={`Filter rule ${index + 1} operator`} className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={String(rule.op ?? "eq")} onChange={(event) => patchRules(rules.map((item, i) => i === index ? { ...item, op: event.target.value } : item))}>{FILTER_OPERATORS.map((op) => <option key={op}>{op}</option>)}</select></label>
        {!(["is_empty", "not_empty"].includes(String(rule.op))) && <label className="text-[10px]">Value<div className="mt-1"><LiteralEditor value={rule.value ?? ""} onChange={(value) => patchRules(rules.map((item, i) => i === index ? { ...item, value } : item))} /></div></label>}
        <button type="button" className="justify-self-start text-[10px] text-red-300 underline sm:col-span-3" onClick={() => patchRules(rules.filter((_, i) => i !== index))}>Remove rule</button>
      </div>)}
      {rules.length === 0 && <p role="status" className="text-[10px] text-amber-300">Add at least one filter rule; preview will remain invalid until then.</p>}
      <datalist id="automation-parameter-fields">{PARAMETER_FIELDS.map((field) => <option key={field} value={field} />)}</datalist>
    </section>;
  }

  if (stage.actionId === "data.count") return <div className="grid gap-2 rounded border border-border/60 p-2 sm:grid-cols-2">
    <label className="text-[10px]">Count output<select aria-label="Count output" className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={String(stage.settings.requested.output ?? "scalar")} onChange={(event) => onPatch({ output: event.target.value })}><option value="scalar">scalar total</option><option value="structured">grouped records</option></select></label>
    <label className="text-[10px]">Group by<select aria-label="Count group by" className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={String(stage.settings.requested.groupBy ?? "none")} onChange={(event) => onPatch({ groupBy: event.target.value })}><option value="none">none</option><option value="kind">kind</option><option value="validity">validity</option><option value="category">category</option></select></label>
  </div>;

  if (stage.actionId === "data.select") {
    const mode = String(stage.settings.requested.mode ?? "summary");
    const fields = Array.isArray(stage.settings.requested.fields) ? stage.settings.requested.fields.map(String) : [];
    return <div className="space-y-2 rounded border border-border/60 p-2">
      <label className="block text-[10px]">Selection mode<select aria-label="Selection mode" className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={mode} onChange={(event) => onPatch({ mode: event.target.value, ...(event.target.value === "summary" ? {} : { fields: fields.length ? fields : [event.target.value === "parameters_by_name" ? "technical_name" : "technical_name"] }) })}><option value="summary">summary</option><option value="fields">project fields</option><option value="parameters_by_name">select parameter names</option></select></label>
      {mode !== "summary" && <label className="block text-[10px]">{mode === "parameters_by_name" ? "Technical names" : "Fields"}<Input aria-label={mode === "parameters_by_name" ? "Technical names" : "Fields"} className="mt-1 h-7 text-[10px]" value={fields.join(", ")} onChange={(event) => onPatch({ fields: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="name_a, name_b" /></label>}
      {mode === "summary" && <p className="text-[10px] text-muted-foreground">Produces a read-only record-set summary of the selected artifact.</p>}
    </div>;
  }

  const channels = objectList(stage.settings.requested.channels) as SplitChannel[];
  const patchChannels = (next: SplitChannel[]) => onPatch({ channels: next });
  return <section className="space-y-2 rounded border border-border/60 p-2">
    <div className="flex items-center justify-between"><strong className="text-[10px]">Overlapping split channels</strong><button type="button" className="text-[10px] text-primary underline" onClick={() => patchChannels([...channels, { name: `channel${channels.length + 1}`, rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } }])}>Add channel</button></div>
    {channels.map((channel, index) => {
      const rule = channel.rule && typeof channel.rule === "object" ? channel.rule : {};
      const type = String(rule.type ?? "by_index_modulo");
      const patchRule = (next: Record<string, unknown>) => patchChannels(channels.map((item, i) => i === index ? { ...item, rule: next } : item));
      return <div key={`${index}-${channel.name}`} className="grid gap-1 rounded border border-border/50 p-2 sm:grid-cols-2"><label className="text-[10px]">Channel name<Input aria-label={`Split channel ${index + 1} name`} className="mt-1 h-7 text-[10px]" value={String(channel.name ?? "")} onChange={(event) => patchChannels(channels.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label className="text-[10px]">Rule<select aria-label={`Split channel ${index + 1} rule`} className="mt-1 h-7 w-full rounded border border-input bg-background px-1 text-[10px]" value={type} onChange={(event) => patchRule(event.target.value === "by_field" ? { type: event.target.value, field: "category", equals: "" } : event.target.value === "index_range" ? { type: event.target.value, from: 0, to: 0 } : { type: event.target.value, modulus: 2, remainder: 0 })}><option value="by_index_modulo">row index modulo</option><option value="by_field">field equals</option><option value="index_range">inclusive index range</option></select></label>
        {type === "by_index_modulo" && <><label className="text-[10px]">Modulus<Input aria-label={`Split channel ${index + 1} modulus`} className="mt-1 h-7 text-[10px]" type="number" min={1} value={String(rule.modulus ?? 2)} onChange={(event) => patchRule({ ...rule, modulus: Number(event.target.value) })} /></label><label className="text-[10px]">Remainder<Input aria-label={`Split channel ${index + 1} remainder`} className="mt-1 h-7 text-[10px]" type="number" value={String(rule.remainder ?? 0)} onChange={(event) => patchRule({ ...rule, remainder: Number(event.target.value) })} /></label></>}
        {type === "by_field" && <><label className="text-[10px]">Field path<Input aria-label={`Split channel ${index + 1} field`} className="mt-1 h-7 text-[10px]" value={String(rule.field ?? "")} onChange={(event) => patchRule({ ...rule, field: event.target.value })} /></label><label className="text-[10px]">Equals<Input aria-label={`Split channel ${index + 1} equals`} className="mt-1 h-7 text-[10px]" value={String(rule.equals ?? "")} onChange={(event) => patchRule({ ...rule, equals: event.target.value })} /></label></>}
        {type === "index_range" && <><label className="text-[10px]">From index<Input aria-label={`Split channel ${index + 1} from`} className="mt-1 h-7 text-[10px]" type="number" min={0} value={String(rule.from ?? 0)} onChange={(event) => patchRule({ ...rule, from: Number(event.target.value) })} /></label><label className="text-[10px]">To index<Input aria-label={`Split channel ${index + 1} to`} className="mt-1 h-7 text-[10px]" type="number" min={0} value={String(rule.to ?? 0)} onChange={(event) => patchRule({ ...rule, to: Number(event.target.value) })} /></label></>}
        <button type="button" className="justify-self-start text-[10px] text-red-300 underline sm:col-span-2" onClick={() => patchChannels(channels.filter((_, i) => i !== index))}>Remove channel</button>
      </div>;
    })}
    {channels.length === 0 && <p role="status" className="text-[10px] text-amber-300">Add a channel; preview validates names and rules.</p>}
    <p className="text-[10px] text-muted-foreground">Rows may appear in multiple channels; rows matching none are returned on the unmatched port.</p>
  </section>;
}
