"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AutomationActionId, AutomationScenarioDefinition, AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { buildAutomationGraph, validateTypedAutomationGraph } from "@/lib/am-stage-automation/typed-graph";
import { ACTION_SUPPORTED } from "@/lib/am-stage-automation/catalog";
import { removeDraftStage, updateMergeSourceBinding, validateUserScenarioDefinition } from "@/lib/am-stage-automation/scenario-editor";
import { validateFlowCondition } from "@/lib/am-stage-automation/control-flow";
import { applyNodeflowParameter } from "./parameters";
import { FlowCanvas } from "./FlowCanvas";
import { actionSpec, canConnect, graphForCanvas, normalizeEditorLayout, PALETTE_ORDER, portsForEditorStage, removeEditorEdgeBinding, validateEditorConnections, type EditorSelection, type EditorSettingSpec } from "./adapter";

type Layout = Record<string, { x: number; y: number }>;
type EditorDraft = { title: string; stages: AutomationStageDefinition[]; positions: Layout; templateVariablesText: string };

interface AutomationNodeflowEditorProps {
  scenario: AutomationScenarioDefinition;
  editable: boolean;
  layout?: Layout;
  title: string;
  templateVariablesText: string;
  onCreateCopy: () => void;
  onChange: (draft: EditorDraft) => void;
  onSave: (draft: EditorDraft) => Promise<void>;
  onPreview: () => void;
  previewReady: boolean;
}

function createStage(actionId: AutomationActionId): AutomationStageDefinition {
  const spec = actionSpec(actionId);
  const operationDefaults = Object.fromEntries(spec.settings.map((setting) => [setting.key, setting.default ?? (setting.type === "json" ? [] : setting.type === "number" ? 1 : "")]));
  const stage: AutomationStageDefinition = {
    stageId: `user:${crypto.randomUUID()}`,
    actionId,
    title: spec.title,
    role: actionId.split(".")[0],
    inputBindings: [],
    outputDefinitions: spec.outputs.length ? spec.outputs.map((output) => ({ port: output.port, kind: output.kind, required: output.required })) : [{ port: "result", kind: "unknown", required: true }],
    settings: { requested: operationDefaults, effective: structuredClone(operationDefaults), origin: "manual" },
    requiredForGoal: true,
    failurePolicy: "fail_run",
    allowedFallbacks: [],
    available: true,
  };
  if (actionId === "flow.router") {
    stage.settings.requested = { ...stage.settings.requested, mode: "first-match", rules: [], fallbackRoute: "fallback" };
    stage.settings.effective = { ...stage.settings.effective, mode: "first-match", rules: [], fallbackRoute: "fallback" };
    return applyNodeflowParameter(stage, "fallbackRoute", "fallback");
  }
  if (actionId === "data.filter") {
    stage.settings.requested = { ...stage.settings.requested, rules: [{ field: "technical_name", op: "not_empty" }] };
    stage.settings.effective = { ...stage.settings.effective, rules: [{ field: "technical_name", op: "not_empty" }] };
  }
  return stage;
}

function validateJsonParameter(stage: AutomationStageDefinition, key: string, value: unknown): string | null {
  if (stage.actionId === "flow.if" && key === "condition") return validateFlowCondition(value);
  if (stage.actionId === "data.filter" && key === "rules") {
    if (!Array.isArray(value) || value.some((rule) => !rule || typeof rule !== "object" || Array.isArray(rule) || typeof (rule as Record<string, unknown>).field !== "string" || !String((rule as Record<string, unknown>).field).trim() || !["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "not_in", "is_empty", "not_empty"].includes(String((rule as Record<string, unknown>).op)))) return "Ожидается массив правил фильтра {field, op, value} с поддерживаемым оператором.";
  }
  if (stage.actionId === "flow.router" && key === "rules") {
    if (!Array.isArray(value) || value.some((rule) => !rule || typeof rule !== "object" || Array.isArray(rule) || !/^[a-zA-Z][\w-]{0,39}$/u.test(String((rule as Record<string, unknown>).route ?? "")) || !String((rule as Record<string, unknown>).id ?? "").trim() || Boolean(validateFlowCondition((rule as Record<string, unknown>).condition)))) return "Ожидается массив маршрутов с уникальными id, route и валидным типизированным condition.";
  }
  if (stage.actionId === "flow.join" && key === "policies") {
    const bindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:")).map((binding) => binding.from.slice(6));
    const valid = Array.isArray(value) && value.every((policy) => {
      if (!policy || typeof policy !== "object" || Array.isArray(policy)) return false;
      const item = policy as Record<string, unknown>;
      return typeof item.binding === "string" && ["omit", "fail", "default"].includes(String(item.onSkipped)) && ["omit", "fail", "default"].includes(String(item.onFailed)) && ["accept", "omit", "fail"].includes(String(item.onPartial)) && ((item.onSkipped !== "default" && item.onFailed !== "default") || typeof item.defaultText === "string");
    });
    if (!valid || (value as Array<Record<string, unknown>>).length !== new Set(bindings).size || new Set((value as Array<Record<string, unknown>>).map((item) => item.binding)).size !== new Set(bindings).size || bindings.some((binding) => !(value as Array<Record<string, unknown>>).some((item) => item.binding === binding))) return "Для каждого входа Join должна быть одна валидная политика.";
  }
  return null;
}

function settingValue(stage: AutomationStageDefinition, setting: EditorSettingSpec): unknown {
  return Object.hasOwn(stage.settings.requested, setting.key)
    ? stage.settings.requested[setting.key]
    : Object.hasOwn(stage.settings.effective, setting.key)
      ? stage.settings.effective[setting.key]
      : setting.default ?? "";
}

function moveMergeInput(stage: AutomationStageDefinition, index: number, delta: -1 | 1) {
  const fixed = stage.inputBindings.filter((binding) => binding.port === "order");
  const inputs = stage.inputBindings.filter((binding) => binding.port !== "order");
  const target = index + delta;
  if (target < 0 || target >= inputs.length) return stage;
  [inputs[index], inputs[target]] = [inputs[target], inputs[index]];
  return { ...stage, inputBindings: [...fixed, ...inputs] };
}

export function AutomationNodeflowEditor({ scenario, editable, layout, title: initialTitle, templateVariablesText: initialVariables, onCreateCopy, onChange, onSave, onPreview, previewReady }: AutomationNodeflowEditorProps) {
  const [stages, setStages] = useState(() => scenario.stages.map((stage) => structuredClone(stage)));
  const [positions, setPositions] = useState<Layout>(() => normalizeEditorLayout(scenario.stages, layout, graphForCanvas(buildAutomationGraph(scenario.stages), scenario.stages)));
  const [title, setTitle] = useState(initialTitle);
  const [templateVariablesText, setTemplateVariablesText] = useState(initialVariables);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [parameterError, setParameterError] = useState("");
  const [jsonDraftValues, setJsonDraftValues] = useState<Record<string, string>>({});
  const undoRef = useRef<EditorDraft[]>([]);
  const redoRef = useRef<EditorDraft[]>([]);
  const currentRef = useRef<EditorDraft>({ title, stages, positions, templateVariablesText });

  const graph = useMemo(() => buildAutomationGraph(stages), [stages]);
  const canvasGraph = useMemo(() => graphForCanvas(graph, stages), [graph, stages]);
  const canvasPositions = useMemo(() => normalizeEditorLayout(stages, positions, canvasGraph), [stages, positions, canvasGraph]);
  const typedIssues = useMemo(() => validateTypedAutomationGraph(stages), [stages]);
  const connectionIssues = useMemo(() => validateEditorConnections(stages, graph), [stages, graph]);
  const selectedStage = selection?.type === "node" ? stages.find((stage) => stage.stageId === selection.id) : undefined;
  const selectedSpec = selectedStage ? actionSpec(selectedStage.actionId, selectedStage, stages) : null;
  const selectedPorts = selectedStage ? portsForEditorStage(selectedStage, stages) : null;
  const problems = useMemo(() => {
    const messages = new Set(typedIssues);
    if (parameterError) messages.add(parameterError);
    for (const issue of connectionIssues) messages.add(issue.message);
    for (const issue of validateUserScenarioDefinition({ ...scenario, stages })) messages.add(issue);
    for (const stage of stages) {
      if (!ACTION_SUPPORTED.has(stage.actionId)) messages.add(`${stage.title}: основной Automation runtime не содержит handler для ${stage.actionId}.`);
      if (!stage.available) messages.add(`${stage.title}: узел отключён${stage.unavailableReason ? ` — ${stage.unavailableReason}` : ""}.`);
      for (const input of portsForEditorStage(stage, stages).inputs) {
        const count = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name === input.name).length;
        if (input.required && count < 1) messages.add(`${stage.title}: обязательный порт «${input.name}» не подключён.`);
        if (!input.multiple && count > 1) messages.add(`${stage.title}: порт «${input.name}» принимает только одно соединение.`);
      }
    }
    return [...messages];
  }, [scenario, stages, typedIssues, connectionIssues, parameterError]);

  useEffect(() => {
    const draft = { title, stages, positions: canvasPositions, templateVariablesText };
    currentRef.current = draft;
    onChange(draft);
  }, [title, stages, canvasPositions, templateVariablesText, onChange]);

  const snapshot = (): EditorDraft => structuredClone({ ...currentRef.current, positions: canvasPositions });
  const recordChange = () => { undoRef.current.push(snapshot()); redoRef.current = []; };
  const setDraftStages = (update: (current: AutomationStageDefinition[]) => AutomationStageDefinition[]) => {
    recordChange();
    setDirty(true);
    setStages((current) => update(current));
  };

  const connect = (from: string, fromPort: string, to: string, toPort: string) => {
    const checked = canConnect(graphForCanvas(buildAutomationGraph(stages)), from, fromPort, to, toPort);
    if (!checked.ok) return checked;
    const source = stages.find((stage) => stage.stageId === from);
    const target = stages.find((stage) => stage.stageId === to);
    if (!source || !target) return { ok: false as const, code: "UNKNOWN_NODE", reason: "Один из узлов не найден." };
    const input = portsForEditorStage(target, stages).inputs.find((candidate) => candidate.name === toPort);
    const output = portsForEditorStage(source, stages).outputs.find((candidate) => candidate.port === fromPort);
    const accepted = input?.accepts ?? (input ? [input.kind] : []);
    if (!output || !input || !accepted.includes(output.kind)) return { ok: false as const, code: "KIND_MISMATCH", reason: `Тип выхода ${output?.kind ?? "?"} несовместим с входом ${input?.name ?? toPort}.` };
    setDraftStages((current) => current.map((stage) => {
      if (stage.stageId !== to) return stage;
      if (stage.actionId === "data.merge") {
        const changed = updateMergeSourceBinding(stage, source, current, true);
        if (changed === stage) return stage;
        if (input.name === "qwenBank" || input.name === "gemmaBank") return changed;
        const bindings = changed.inputBindings.map((binding) => binding.from === `stage:${source.stageId}` && binding.port !== "order" ? { ...binding, name: input.name, port: fromPort } : binding);
        return { ...changed, inputBindings: bindings };
      }
      const data = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name !== input.name);
      const order = stage.inputBindings.filter((binding) => binding.port === "order");
      return { ...stage, inputBindings: [...order, ...data, { name: input.name, from: `stage:${source.stageId}`, port: fromPort }] };
    }));
    return { ok: true as const };
  };

  const addNode = (actionId: AutomationActionId, position?: { x: number; y: number }) => {
    if (!editable) return;
    const stage = createStage(actionId);
    setDraftStages((current) => [...current, stage]);
    setPositions((current) => ({ ...current, [stage.stageId]: position ?? { x: 100 + stages.length * 36, y: 100 + stages.length * 28 } }));
    setSelection({ type: "node", id: stage.stageId });
  };

  const addConnectedNode = (actionId: AutomationActionId, position: { x: number; y: number }, connectFrom: { nodeId: string; port: string; direction: "out" | "in" } | null) => {
    if (!editable) return;
    const added = createStage(actionId);
    let next = [...stages, added];
    if (connectFrom) {
      if (connectFrom.direction === "out") {
        const source = stages.find((stage) => stage.stageId === connectFrom.nodeId);
        const output = source && portsForEditorStage(source, stages).outputs.find((port) => port.port === connectFrom.port);
        const targetInput = output && portsForEditorStage(added, next).inputs.find((port) => (port.accepts ?? [port.kind]).includes(output.kind));
        if (source && targetInput) {
          if (added.actionId === "data.merge") next[next.length - 1] = updateMergeSourceBinding(added, source, next, true);
          else next[next.length - 1] = { ...added, inputBindings: [{ name: targetInput.name, from: `stage:${source.stageId}`, port: connectFrom.port }] };
        }
      } else {
        const target = stages.find((stage) => stage.stageId === connectFrom.nodeId);
        const addedOutput = portsForEditorStage(added, next).outputs[0];
        const targetInput = target && addedOutput && portsForEditorStage(target, stages).inputs.find((port) => (port.accepts ?? [port.kind]).includes(addedOutput.kind));
        if (target && targetInput) {
          next[next.length - 1] = { ...added, inputBindings: [] };
          next = next.map((stage) => {
            if (stage.stageId !== target.stageId) return stage;
            if (stage.actionId === "data.merge") return updateMergeSourceBinding(stage, added, next, true);
            const order = stage.inputBindings.filter((binding) => binding.port === "order");
            const data = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name !== targetInput.name);
            return { ...stage, inputBindings: [...order, ...data, { name: targetInput.name, from: `stage:${added.stageId}`, port: addedOutput.port }] };
          });
        }
      }
    }
    setDraftStages(() => next);
    setPositions((current) => ({ ...current, [added.stageId]: position }));
    setSelection({ type: "node", id: added.stageId });
  };

  const removeNode = (nodeId: string) => {
    if (!editable) return;
    setDraftStages((current) => removeDraftStage(current, nodeId));
    setPositions((current) => { const next = { ...current }; delete next[nodeId]; return next; });
    setSelection(null);
  };

  const removeEdge = (edgeId: string) => {
    if (!editable) return;
    const edge = canvasGraph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return;
    if (edge.kind === "audio-dependency" || edge.kind === "data" || edge.kind === "order") setDraftStages((current) => removeEditorEdgeBinding(current, edge));
    setSelection(null);
  };

  const save = async () => {
    if (!editable) return;
    if (!title.trim()) { setError("Введите название пользовательского сценария."); return; }
    if (problems.length) { setError("Исправьте ошибки графа перед сохранением и preview."); return; }
    setSaving(true); setError("");
    try { await onSave({ title: title.trim(), stages, positions: canvasPositions, templateVariablesText }); setDirty(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };

  const undo = () => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(snapshot());
    setTitle(previous.title); setStages(previous.stages); setPositions(previous.positions); setTemplateVariablesText(previous.templateVariablesText);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(snapshot());
    setTitle(next.title); setStages(next.stages); setPositions(next.positions); setTemplateVariablesText(next.templateVariablesText);
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Визуальный конструктор Automation">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-sm font-semibold">Визуальный конструктор</h2><p className="text-[11px] text-muted-foreground">Узлы и соединения сохраняются в сценарии основного Automation runtime.</p></div>
        <div className="flex flex-wrap gap-2">
          {!editable ? <Button size="sm" onClick={onCreateCopy}>Создать пользовательскую копию</Button> : <>
            <Button size="sm" variant="outline" disabled={saving || problems.length > 0} onClick={() => void save()}>{saving ? "Сохранение…" : "Сохранить сценарий"}</Button>
            <Button size="sm" variant="outline" disabled={!previewReady || dirty || problems.length > 0} onClick={onPreview}>Preview основного planner</Button>
          </>}
        </div>
      </header>
      {editable && <label className="block text-xs">Название пользовательского сценария<Input className="mt-1 h-9" value={title} onChange={(event) => { setDirty(true); setTitle(event.target.value); }} /></label>}
      <div className="flex flex-wrap gap-2" aria-label="Добавить поддержанный узел">
        {editable && PALETTE_ORDER.map((actionId) => <Button key={actionId} size="sm" variant="outline" onClick={() => addNode(actionId)}>＋ {actionSpec(actionId).title}</Button>)}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[560px] min-h-[440px] overflow-hidden rounded-md border border-border bg-background">
          <FlowCanvas
            graph={canvasGraph}
            positions={canvasPositions}
            selection={selection}
            editable={editable}
            runView={null}
            assetLabel={null}
            briefLabel={null}
            focusRequest={null}
            fitNonce={0}
            validationErrors={connectionIssues}
            onSelect={setSelection}
            onMoveNode={(nodeId, position) => { setDirty(true); setPositions((current) => ({ ...current, [nodeId]: position })); }}
            onBeginMove={recordChange}
            onSettleMove={() => undefined}
            onConnectChecked={connect}
            onRemoveNode={removeNode}
            onRemoveEdge={removeEdge}
            onQuickAdd={addConnectedNode}
            onDropItem={(item, position) => { if (item.type === "action" && PALETTE_ORDER.includes(item.actionId)) addNode(item.actionId, position); }}
            onUndo={undo}
            onRedo={redo}
          />
        </div>
        <aside className="space-y-3 rounded-md border border-border/70 p-3" aria-label="Инспектор узла">
          {selectedStage ? <>
            <div><h3 className="text-xs font-semibold">Параметры узла</h3><p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{selectedStage.actionId} · {selectedStage.stageId}</p></div>
            {editable && selectedSpec?.editable && <label className="block text-[11px]">Название узла<Input className="mt-1 h-8" value={selectedStage.title} onChange={(event) => setDraftStages((current) => current.map((stage) => stage.stageId === selectedStage.stageId ? { ...stage, title: event.target.value } : stage))} /></label>}
            {selectedSpec?.readOnlyReason && <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[10px] text-amber-700">Узел только для просмотра: {selectedSpec.readOnlyReason}</p>}
            {selectedSpec?.settings.map((setting) => {
              const value = settingValue(selectedStage, setting);
              const enabled = editable && selectedSpec.editable && setting.editable;
              const jsonDraftKey = `${selectedStage.stageId}:${setting.key}`;
              const stringList = Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : null;
              const actionOptions = setting.options ?? [];
              const unknownActions = stringList?.map((action, index) => ({ action, index })).filter(({ action }) => !actionOptions.includes(action)) ?? [];
              const update = (nextValue: unknown) => {
                if (setting.type === "json") {
                  const issue = validateJsonParameter(selectedStage, setting.key, nextValue);
                  setParameterError(issue ? `${selectedStage.title}: ${setting.label}: ${issue}` : "");
                  if (issue) return;
                }
                if ((setting.type === "action-list" || setting.type === "string-list") && (!Array.isArray(nextValue) || nextValue.some((item) => typeof item !== "string"))) return;
                setDraftStages((current) => current.map((stage) => stage.stageId === selectedStage.stageId ? applyNodeflowParameter(stage, setting.key, nextValue) : stage));
              };
              return <div key={setting.key} className="block text-[11px]" title={setting.description}>
                <span className="block">{setting.label}</span>
                {setting.type === "select" ? <select className="mt-1 h-8 w-full rounded border border-input bg-background px-2" value={String(value ?? "")} disabled={!enabled} onChange={(event) => update(event.target.value)}>{(setting.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : setting.type === "boolean" ? <input className="ml-2 align-middle" type="checkbox" checked={value === true} disabled={!enabled} onChange={(event) => update(event.target.checked)} />
                    : setting.type === "number" ? <Input className="mt-1 h-8" type="number" min={setting.min} max={setting.max} value={String(value ?? "")} disabled={!enabled} onChange={(event) => update(Number(event.target.value))} />
                      : setting.type === "action-list" ? stringList ? <fieldset className="mt-1 max-h-44 space-y-1 overflow-auto rounded border border-border/70 p-2" disabled={!enabled}><legend className="px-1 text-[9px] text-muted-foreground">Только действия с handler в основном runtime</legend>{actionOptions.map((actionId) => <label key={actionId} className="flex items-center gap-2 font-mono text-[9px]"><input type="checkbox" checked={stringList.includes(actionId)} onChange={(event) => { const next = [...stringList]; if (event.target.checked && !next.includes(actionId)) next.push(actionId); else if (!event.target.checked) { const index = next.indexOf(actionId); if (index >= 0) next.splice(index, 1); } update(next); }} />{actionId}</label>)}</fieldset> : <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[9px]">{JSON.stringify(value)}</pre>
                        : setting.type === "string-list" ? stringList ? <Textarea className="mt-1 min-h-20 font-mono text-[10px]" value={stringList.join("\n")} readOnly={!enabled} onChange={(event) => update(event.target.value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))} placeholder="Один field / technical_name на строку" /> : <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[9px]">{JSON.stringify(value)}</pre>
                      : setting.type === "json" ? <Textarea className="mt-1 min-h-24 font-mono text-[10px]" value={jsonDraftValues[jsonDraftKey] ?? JSON.stringify(value ?? null, null, 2)} readOnly={!enabled} onChange={(event) => { setJsonDraftValues((current) => ({ ...current, [jsonDraftKey]: event.target.value })); try { update(JSON.parse(event.target.value) as unknown); } catch { setParameterError(`${selectedStage.title}: ${setting.label}: некорректный JSON; сохранение заблокировано.`); } }} />
                        : <Textarea className="mt-1 min-h-16" value={String(value ?? "")} readOnly={!enabled} onChange={(event) => update(event.target.value)} />}
                {setting.type === "action-list" && unknownActions.length > 0 && <div className="mt-2 rounded border border-amber-500/40 p-2 text-[9px]"><p>Неизвестные сохранённые actionId оставлены без изменений; planner заблокирует такой сценарий, пока они не удалены.</p>{unknownActions.map(({ action, index }) => <div key={`${action}:${index}`} className="mt-1 flex items-center gap-2 font-mono"><span className="min-w-0 flex-1 break-all">{action}</span><Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[9px]" disabled={!enabled} onClick={() => { const next = [...(stringList ?? [])]; next.splice(index, 1); update(next); }}>Удалить</Button></div>)}</div>}
                {!setting.editable && <span className="mt-1 block text-[9px] text-amber-700">Только просмотр: {setting.readOnlyReason ?? "нет безопасного редактора параметра"}</span>}
              </div>;
            })}
            {selectedStage.inputBindings.filter((binding) => binding.port !== "order").length > 1 && <div><h4 className="text-[11px] font-medium">Порядок входов</h4><ol className="mt-1 space-y-1">{selectedStage.inputBindings.filter((binding) => binding.port !== "order").map((binding, index, bindings) => <li key={`${binding.name}:${binding.from}`} className="flex items-center gap-1 text-[10px]"><span className="min-w-0 flex-1 truncate">{index + 1}. {binding.name} ← {stages.find((stage) => `stage:${stage.stageId}` === binding.from)?.title ?? binding.from}</span><button type="button" aria-label={`Поднять вход ${binding.name}`} disabled={!editable || !selectedSpec?.editable || index === 0} onClick={() => setDraftStages((current) => current.map((stage) => stage.stageId === selectedStage.stageId ? moveMergeInput(stage, index, -1) : stage))}>↑</button><button type="button" aria-label={`Опустить вход ${binding.name}`} disabled={!editable || !selectedSpec?.editable || index === bindings.length - 1} onClick={() => setDraftStages((current) => current.map((stage) => stage.stageId === selectedStage.stageId ? moveMergeInput(stage, index, 1) : stage))}>↓</button></li>)}</ol><p className="mt-1 text-[9px] text-muted-foreground">Порядок хранится в inputBindings и передаётся основному planner.</p></div>}
            {selectedStage.actionId === "brief.from_template" && <label className="block text-[11px]">Подстановки для planner (key=value)<Textarea className="mt-1 min-h-20" value={templateVariablesText} readOnly={!editable} onChange={(event) => { setDirty(true); setTemplateVariablesText(event.target.value); }} placeholder={'mood=calm\nspace=wide'} /></label>}
            {selectedStage.inputBindings.some((binding) => binding.port === "order") && <div><h4 className="text-[11px] font-medium">Порядок выполнения</h4><ol className="mt-1 space-y-1 text-[10px]">{selectedStage.inputBindings.filter((binding) => binding.port === "order").map((binding, index) => <li key={`${binding.name}:${binding.from}`}>{index + 1}. {binding.name} ← {stages.find((stage) => `stage:${stage.stageId}` === binding.from)?.title ?? binding.from}</li>)}</ol><p className="mt-1 text-[9px] text-muted-foreground">Связи порядка показаны пунктиром на графе.</p></div>}
            <div><h4 className="text-[11px] font-medium">Порты</h4><div className="mt-1 space-y-1 text-[10px]">{(selectedPorts?.inputs ?? []).map((port) => <p key={`in:${port.name}`} className={port.required && !selectedStage.inputBindings.some((binding) => binding.port !== "order" && binding.name === port.name) ? "text-red-400" : "text-muted-foreground"}>← {port.name} · {port.kind}{port.required ? " · required" : " · optional"}</p>)}{(selectedPorts?.outputs ?? []).map((port) => <p key={`out:${port.port}`} className="text-muted-foreground">{port.port} → {port.kind}</p>)}</div></div>
            {Object.keys(selectedStage.settings.requested).some((key) => !selectedSpec?.settings.some((setting) => setting.key === key)) || Object.keys(selectedStage.settings.effective).some((key) => !selectedSpec?.settings.some((setting) => setting.key === key)) ? <details><summary className="cursor-pointer text-[10px]">Другие сохранённые параметры · read-only</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[9px]">{JSON.stringify({ requested: Object.fromEntries(Object.entries(selectedStage.settings.requested).filter(([key]) => !selectedSpec?.settings.some((setting) => setting.key === key))), effective: Object.fromEntries(Object.entries(selectedStage.settings.effective).filter(([key]) => !selectedSpec?.settings.some((setting) => setting.key === key))) }, null, 2)}</pre></details> : null}
            {editable && selectedSpec?.editable && <Button size="sm" variant="destructive" onClick={() => removeNode(selectedStage.stageId)}>Удалить узел и его связи</Button>}
          </> : selection?.type === "edge" ? <><h3 className="text-xs font-semibold">Связь</h3><p className="text-[11px] text-muted-foreground">Выбранное соединение между портами.</p>{editable && <Button size="sm" variant="destructive" onClick={() => removeEdge(selection.id)}>Удалить связь</Button>}</> : <><h3 className="text-xs font-semibold">Инспектор</h3><p className="text-[11px] text-muted-foreground">Выберите узел на полотне, чтобы увидеть параметры и порты.</p></>}
          <div className={`rounded border p-2 text-[11px] ${problems.length ? "border-red-500/50 text-red-300" : "border-emerald-500/40 text-emerald-300"}`} role={problems.length ? "alert" : "status"}>
            {problems.length ? <><strong>Граф не готов к запуску</strong><ul className="mt-1 list-disc space-y-1 pl-4">{problems.slice(0, 8).map((problem) => <li key={problem}>{problem}</li>)}</ul></> : "Связи и обязательные входы соответствуют контракту основного Automation."}
          </div>
          {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}
        </aside>
      </div>
    </section>
  );
}
