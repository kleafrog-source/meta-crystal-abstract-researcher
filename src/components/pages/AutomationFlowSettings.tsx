"use client";

import { Input } from "@/components/ui/input";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

type Operand = { type: "literal"; value: unknown } | { type: "binding"; binding: string; property?: string } | { type: "setting"; key: string };
type Condition = { left: Operand; op: string; right?: Operand };
type RouterRule = { id: string; route: string; title?: string; condition: Condition };
type FlowStage = AutomationStageDefinition & { actionId: "flow.if" | "flow.router" };

const OPERATORS = ["truthy", "falsy", "eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"];
const DEFAULT_CONDITION: Condition = { left: { type: "binding", binding: "input", property: "count" }, op: "gt", right: { type: "literal", value: 5 } };

function asOperand(value: unknown): Operand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { type: "literal", value: "" };
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "binding" && typeof candidate.binding === "string") return { type: "binding", binding: candidate.binding, ...(typeof candidate.property === "string" ? { property: candidate.property } : {}) };
  if (candidate.type === "setting" && typeof candidate.key === "string") return { type: "setting", key: candidate.key };
  if (candidate.type === "literal" && "value" in candidate) return { type: "literal", value: candidate.value };
  return { type: "literal", value: "" };
}

function asCondition(value: unknown): Condition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_CONDITION;
  const candidate = value as Record<string, unknown>;
  const left = asOperand(candidate.left);
  const op = typeof candidate.op === "string" && OPERATORS.includes(candidate.op) ? candidate.op : DEFAULT_CONDITION.op;
  const right = candidate.right === undefined ? DEFAULT_CONDITION.right : asOperand(candidate.right);
  return ["truthy", "falsy"].includes(op) ? { left, op } : { left, op, right };
}

function FlowOperandEditor({ label, operand, bindingNames, onChange }: { label: string; operand: Operand; bindingNames: string[]; onChange: (next: Operand) => void }) {
  const current = asOperand(operand);
  const literalType = typeof current.type === "string" && current.type === "literal"
    ? typeof current.value === "number" ? "number" : typeof current.value === "boolean" ? "boolean" : "string"
    : "string";
  return <fieldset className="grid gap-1 rounded border border-border/50 p-2 sm:grid-cols-2">
    <legend className="px-1 text-[10px] text-muted-foreground">{label}</legend>
    <select aria-label={`${label} type`} className="h-7 rounded border border-input bg-background px-2 text-[11px]" value={current.type} onChange={(event) => {
      const type = event.target.value;
      onChange(type === "binding" ? { type, binding: bindingNames[0] ?? "input", property: "count" } : type === "setting" ? { type, key: "topK" } : { type: "literal", value: "" });
    }}>
      <option value="binding">Input binding</option><option value="setting">Node setting</option><option value="literal">Literal value</option>
    </select>
    {current.type === "binding" && <>
      <select aria-label={`${label} binding`} className="h-7 rounded border border-input bg-background px-2 text-[11px]" value={current.binding} onChange={(event) => onChange({ ...current, binding: event.target.value })}>
        {[...new Set([current.binding, ...bindingNames])].map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <Input aria-label={`${label} property`} className="h-7 text-[11px]" value={current.property ?? ""} onChange={(event) => onChange({ ...current, property: event.target.value || undefined })} placeholder="count or data.path" />
    </>}
    {current.type === "setting" && <Input aria-label={`${label} setting key`} className="h-7 text-[11px]" value={current.key} onChange={(event) => onChange({ ...current, key: event.target.value })} placeholder="setting key" />}
    {current.type === "literal" && literalType === "boolean" && <select aria-label={`${label} literal`} className="h-7 rounded border border-input bg-background px-2 text-[11px]" value={String(current.value)} onChange={(event) => onChange({ ...current, value: event.target.value === "true" })}><option value="true">true</option><option value="false">false</option></select>}
    {current.type === "literal" && literalType !== "boolean" && <label className="flex gap-1">
      <select aria-label={`${label} literal type`} className="h-7 rounded border border-input bg-background px-1 text-[10px]" value={literalType} onChange={(event) => onChange({ ...current, value: event.target.value === "number" ? 0 : event.target.value === "boolean" ? false : "" })}><option value="string">text</option><option value="number">number</option><option value="boolean">boolean</option></select>
      <Input aria-label={`${label} literal`} className="h-7 text-[11px]" type={literalType === "number" ? "number" : "text"} value={String(current.value ?? "")} onChange={(event) => onChange({ ...current, value: literalType === "number" ? Number(event.target.value) : event.target.value })} placeholder={literalType === "number" ? "0" : "value or comma-separated list"} />
    </label>}
  </fieldset>;
}

function FlowConditionEditor({ value, bindingNames, onChange, label = "Condition" }: { value: unknown; bindingNames: string[]; onChange: (next: Condition) => void; label?: string }) {
  const condition = asCondition(value);
  const needsRight = !["truthy", "falsy"].includes(condition.op);
  return <div className="space-y-2 rounded border border-border/60 p-2">
    <div className="text-[10px] font-medium">{label}</div>
    <FlowOperandEditor label="Left operand" operand={condition.left} bindingNames={bindingNames} onChange={(left) => onChange({ ...condition, left })} />
    <label className="flex items-center gap-2 text-[10px]">Operator<select aria-label={`${label} operator`} className="h-7 rounded border border-input bg-background px-2" value={condition.op} onChange={(event) => {
      const op = event.target.value;
      onChange(op === "truthy" || op === "falsy" ? { left: condition.left, op } : { left: condition.left, op, right: condition.right ?? { type: "literal", value: 0 } });
    }}>{OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}</select></label>
    {needsRight && <FlowOperandEditor label="Right operand" operand={condition.right ?? { type: "literal", value: 0 }} bindingNames={bindingNames} onChange={(right) => onChange({ ...condition, right })} />}
  </div>;
}

function routerRulesOf(stage: FlowStage): RouterRule[] {
  const rules = stage.settings.requested.rules;
  if (!Array.isArray(rules)) return [];
  return rules.flatMap((rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return [];
    const item = rule as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.route !== "string") return [];
    return [{ id: item.id, route: item.route, ...(typeof item.title === "string" ? { title: item.title } : {}), condition: asCondition(item.condition) }];
  });
}

export function AutomationFlowSettings({ stage, onPatch }: { stage: FlowStage; onPatch: (patch: Record<string, unknown>) => void }) {
  const bindingNames = [...new Set(stage.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name))];
  if (stage.actionId === "flow.if") return <FlowConditionEditor value={stage.settings.requested.condition} bindingNames={bindingNames} onChange={(condition) => onPatch({ condition })} label="If condition" />;

  const rules = routerRulesOf(stage);
  const fallbackRoute = String(stage.settings.requested.fallbackRoute ?? "fallback");
  const updateRule = (index: number, patch: Partial<RouterRule>) => onPatch({ rules: rules.map((rule, item) => item === index ? { ...rule, ...patch } : rule) });
  return <section className="space-y-2 rounded border border-border/60 p-2">
    <div className="flex items-center justify-between"><strong className="text-[10px]">Ordered router · first match wins</strong><button type="button" className="text-[10px] text-primary underline" onClick={() => {
      const id = `route-${crypto.randomUUID()}`;
      onPatch({ rules: [...rules, { id, route: id, title: `Rule ${rules.length + 1}`, condition: { left: { type: "binding", binding: bindingNames[0] ?? "input", property: "count" }, op: "gte", right: { type: "literal", value: 4 } } }] });
    }}>Add rule</button></div>
    {rules.map((rule, index) => <article key={rule.id} className="space-y-2 rounded border border-border/50 p-2">
      <div className="grid gap-1 sm:grid-cols-2"><label className="text-[10px]">Route output<Input aria-label={`Router rule ${index + 1} route`} className="mt-1 h-7 text-[11px]" value={rule.route} onChange={(event) => updateRule(index, { route: event.target.value })} /></label><label className="text-[10px]">Rule title<Input aria-label={`Router rule ${index + 1} title`} className="mt-1 h-7 text-[11px]" value={rule.title ?? ""} onChange={(event) => updateRule(index, { title: event.target.value })} /></label></div>
      <FlowConditionEditor value={rule.condition} bindingNames={bindingNames} onChange={(condition) => updateRule(index, { condition })} label={`Rule ${index + 1}`} />
      <button type="button" className="text-[10px] text-red-300 underline" onClick={() => onPatch({ rules: rules.filter((_, item) => item !== index) })}>Remove rule</button>
    </article>)}
    <label className="block text-[10px]">Fallback output<Input aria-label="Router fallback output" className="mt-1 h-7 text-[11px]" value={fallbackRoute} onChange={(event) => onPatch({ fallbackRoute: event.target.value })} /></label>
    <p className="text-[10px] text-muted-foreground">Rules are evaluated in order; the first matching route is emitted. Otherwise the fallback route is emitted.</p>
  </section>;
}
