"use client";

/**
 * Custom React Flow nodes for the AM2 constructor.
 *
 * Node kinds (§4):
 * - ExternalNode — data sources (audio asset / brief text). NOT executable;
 *   the audio node carries run-level asset selection (dependency edges only);
 * - OperationNode — executable stage with typed input/output ports.
 *
 * Progressive disclosure (§3): the canvas shows port names, kind dots,
 * binding state and status; ALL details (params, provenance, full settings)
 * live in the Inspector. Destination chips (bank/pass) answer "where does
 * this land in Tri-modal Stage" without a separate node per destination.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { actionTitleRu, type EditorActionSpec, type PortKind, type StageStatus } from "./adapter";
import { KIND_COLORS, STAGE_STATUS_META } from "./kinds";

export interface RunArtifactChip {
  artifactId: string;
  kind: string;
  validity: string;
  bankId: string | null;
  attemptId: string | null;
  label: string;
}

export interface OperationNodeData extends Record<string, unknown> {
  stage: AutomationStageDefinition;
  spec: EditorActionSpec;
  ordinal: number;
  /** Derived from graph EDGES (not stage.inputBindings): port → source labels. */
  bindings: Record<string, Array<{ label: string; external: boolean }>>;
  portErrors: Record<string, string>;
  /** Port names of THIS node that are compatible with the ongoing drag. */
  highlightPorts: string[] | null;
  /** Dim when upstream/downstream focus is active and this node is outside. */
  dimmed: boolean;
  run: {
    status: StageStatus;
    attemptLabel: string | null;
    durationMs: number | null;
    reusedNodes: number;
    errorSummary: string | null;
    artifacts: RunArtifactChip[];
  } | null;
  editable: boolean;
  readOnlyReason?: string;
}

export interface ExternalNodeData extends Record<string, unknown> {
  externalKind: "audio" | "brief" | "unknown";
  outputPort: string;
  outputKind: string | null;
  label?: string;
  readOnlyReason?: string;
  assetLabel: string | null;
  briefLabel: string | null;
  dimmed: boolean;
  highlightPorts: string[] | null;
  /** True when nothing consumes this external input (no outgoing edges). */
  unused: boolean;
}

export type Am2FlowNode = Node<OperationNodeData | ExternalNodeData>;

function PortDot({ kind }: { kind: PortKind }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: KIND_COLORS[kind] }}
      aria-hidden
    />
  );
}

export const OperationNodeView = memo(function OperationNodeView({ data, selected }: NodeProps<Am2FlowNode>) {
  const nodeData = data as OperationNodeData;
  const stage = nodeData.stage;
  const spec = nodeData.spec;
  const status = nodeData.run ? STAGE_STATUS_META[nodeData.run.status] : null;
  const titleRu = actionTitleRu(stage.actionId);

  return (
    <div
      className={`w-64 rounded-lg border-2 bg-card shadow-sm transition-opacity ${
        selected ? "border-foreground" : "border-border"
      } ${nodeData.dimmed ? "opacity-35" : "opacity-100"}`}
      aria-label={`Узел-операция: ${titleRu}`}
    >
      {/* Header: human title (RU) + run status. Technical id (actionId + EN
          title) lives in the tooltip — details, not the main label. */}
      <div className="flex items-start gap-2 rounded-t-lg border-b border-border bg-muted/50 px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-tight" title={`${titleRu} — ${stage.actionId} (${spec?.title ?? stage.title})`}>
            {titleRu}
          </p>
          <p className="truncate font-mono text-[9px] text-muted-foreground" title={stage.stageId}>#{nodeData.ordinal}</p>
        </div>
        {status && (
          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${status.className}`} title={nodeData.run?.errorSummary ?? undefined}>
            {status.icon} {status.label}
          </span>
        )}
        {!nodeData.editable && <span className="shrink-0 rounded border border-amber-500/50 px-1.5 py-0.5 text-[9px] text-amber-700" title={nodeData.spec.readOnlyReason}>только просмотр</span>}
      </div>

      {/* Inputs */}
      <div className="space-y-1 px-2.5 py-2">
        <Handle id="order" type="target" position={Position.Left} className="!top-2 !h-2 !w-2 !border !border-background !bg-muted-foreground" aria-label="Вход зависимости по порядку" />
        {spec.inputs.length === 0 && <p className="text-[10px] text-muted-foreground">без входных портов</p>}
        {spec.inputs.map((port) => {
          const sources = nodeData.bindings[port.name] ?? [];
          const highlighted = nodeData.highlightPorts?.includes(port.name);
          const missing = port.required && sources.length === 0;
          const portError = nodeData.portErrors[port.name];
          return (
            <div key={port.name} className="relative flex items-center gap-1.5 text-[11px]">
              <Handle
                id={port.name}
                type="target"
                position={Position.Left}
                className="!h-3 !w-3 !border-2 !border-background !transition-shadow"
                style={{
                  backgroundColor: KIND_COLORS[port.kind],
                  ...(highlighted ? { boxShadow: `0 0 0 3px ${KIND_COLORS[port.kind]}66` } : {}),
                }}
                aria-label={`Вход ${port.name} (${port.kind})`}
              />
              <span className={`truncate ${portError || missing ? "text-red-400" : ""}`} title={portError ?? `${port.name}: ${port.kind}${port.multiple ? " (несколько входов)" : ""}`}>
                <PortDot kind={port.kind} /> {port.name}
                {port.multiple && <span className="text-muted-foreground"> ×N</span>}
                {!port.required && <span className="text-muted-foreground"> · опц.</span>}
              </span>
              <span className="ml-auto shrink-0 text-right">
                {sources.length > 0 ? (
                  <span className="font-mono text-[9px] text-muted-foreground" title={sources.map((source) => source.label).join(" · ")}>
                    ← {sources[0].external ? "внешний" : sources[0].label.slice(0, 14)}
                    {sources.length > 1 ? ` +${sources.length - 1}` : ""}
                  </span>
                ) : missing ? (
                  <span className="text-[9px] font-medium text-red-400">{portError ? "ошибка" : "не связан"}</span>
                ) : (
                  <span className="text-[9px] text-muted-foreground">—</span>
                )}
              </span>
            </div>
          );
        })}
        {spec.needsAudio && (
          <div className="relative flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Handle
              id="audio"
              type="target"
              position={Position.Left}
              className="!h-3 !w-3 !rounded-sm !border-2 !border-dashed !border-stone-400 !bg-background"
              aria-label="Зависимость от аудио-актива"
            />
            <span className="truncate">audio (зависимость)</span>
          </div>
        )}
      </div>

      {/* Outputs (expected results of THIS operation) */}
      <div className="space-y-1 border-t border-border px-2.5 py-2">
        {spec.outputs.map((output) => (
          <div key={output.port} className="relative flex items-center justify-end gap-1.5 text-[11px]">
            <span className="truncate" title={`${output.port}: ${output.kind}`}>
              {output.port} <PortDot kind={output.kind} />
            </span>
            <Handle
              id={output.port}
              type="source"
              position={Position.Right}
              className="!h-3 !w-3 !border-2 !border-background"
              style={{ backgroundColor: KIND_COLORS[output.kind] }}
              aria-label={`Выход ${output.port} (${output.kind})`}
            />
          </div>
        ))}
        <Handle id="order" type="source" position={Position.Right} className="!top-auto !bottom-1 !h-2 !w-2 !border !border-background !bg-muted-foreground" aria-label="Выход зависимости по порядку" />
      </div>

      {/* Run artifacts (received results — distinct from the expected output
          ports above; Run mode only, never placeholders) */}
      {nodeData.run && nodeData.run.artifacts.length > 0 && (
        <div className="space-y-1 border-t border-border bg-muted/30 px-2.5 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">получено (артефакты прогона)</p>
          {nodeData.run.artifacts.map((chip) => (
            <div key={chip.artifactId} className="flex items-center gap-1.5 text-[10px]">
              <span className={`rounded px-1 py-0.5 font-mono ${chip.validity === "valid" ? "bg-emerald-500/15 text-emerald-800" : "bg-amber-500/15 text-amber-800"}`}>
                {chip.kind}
              </span>
              <span className="truncate font-mono text-[9px] text-muted-foreground" title={chip.artifactId}>{chip.label}</span>
            </div>
          ))}
          {nodeData.run.durationMs !== null && (
            <p className="font-mono text-[9px] text-muted-foreground">
              {(nodeData.run.durationMs / 1000).toFixed(1)} c{nodeData.run.attemptLabel ? ` · попытка ${nodeData.run.attemptLabel}` : ""}
              {nodeData.run.reusedNodes > 0 ? ` · переиспользовано узлов: ${nodeData.run.reusedNodes}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export const ExternalNodeView = memo(function ExternalNodeView({ data, selected }: NodeProps<Am2FlowNode>) {
  const nodeData = data as ExternalNodeData;
  const isAudio = nodeData.externalKind === "audio";
  const isBrief = nodeData.externalKind === "brief";
  return (
    <div
      className={`w-56 rounded-lg border-2 border-dashed bg-card shadow-sm transition-opacity ${
        selected ? "border-foreground" : "border-stone-400"
      } ${nodeData.dimmed ? "opacity-35" : "opacity-100"}`}
      aria-label={isAudio ? "Внешний вход: аудио-актив" : isBrief ? "Внешний вход: текст Brief" : "Нераспознанный внешний вход"}
    >
      <div className="flex items-center gap-2 border-b border-dashed border-stone-300 bg-muted/40 px-2.5 py-1.5">
        <span className="text-xs font-semibold">{isAudio ? "Аудио-актив" : isBrief ? "Текст Brief" : nodeData.label ?? "Внешний вход"}</span>
        <span className="rounded bg-secondary px-1 font-mono text-[9px]">внешний вход</span>
        {nodeData.unused && (
          <span
            className="ml-auto rounded border border-amber-500/50 bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-800"
            title="Ни один узел не использует этот внешний вход: зависимостей/связей от него нет. Можно удалить без последствий."
          >
            не используется
          </span>
        )}
      </div>
      <div className="px-2.5 py-2 text-[11px]">
        {isAudio ? (
          <div className="space-y-1">
            <p className="truncate text-muted-foreground" title={nodeData.assetLabel ?? undefined}>
              {nodeData.assetLabel ? <span className="font-mono text-[10px]">{nodeData.assetLabel}</span> : "актив выбирается при запуске"}
            </p>
            <p className="text-[10px] text-muted-foreground">Пунктирные связи = зависимость, не данные</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="line-clamp-2 text-muted-foreground" title={nodeData.briefLabel ?? undefined}>
              {nodeData.briefLabel ? nodeData.briefLabel : "текст задаётся при запуске"}
            </p>
          </div>
        )}
        {nodeData.readOnlyReason && <p className="mt-1 text-[9px] text-red-400">{nodeData.readOnlyReason}</p>}
      </div>
      <div className="flex justify-end px-2.5 pb-2">
        {isBrief ? (
          <span className="text-[11px]">
            {nodeData.outputPort} <PortDot kind={nodeData.outputKind ?? "brief"} />
          </span>
        ) : isAudio ? (
          <span className="text-[11px] text-muted-foreground">audio (зависимость)</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">{nodeData.outputPort} · {nodeData.outputKind ?? "тип неизвестен"}</span>
        )}
        <Handle
          id={nodeData.outputPort}
          type="source"
          position={Position.Right}
          className={isAudio ? "!h-3 !w-3 !rounded-sm !border-2 !border-dashed !border-stone-400 !bg-background" : "!h-3 !w-3 !border-2 !border-background"}
          style={isAudio ? undefined : { backgroundColor: KIND_COLORS[nodeData.outputKind ?? "brief"] ?? "#78716c" }}
          aria-label={isAudio ? "Зависимость от аудио" : "Выход brief"}
        />
      </div>
    </div>
  );
});

export const EDITOR_NODE_TYPES = {
  operation: OperationNodeView,
  external: ExternalNodeView,
};
