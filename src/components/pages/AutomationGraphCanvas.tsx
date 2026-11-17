"use client";

import { useState } from "react";
import type { AutomationGraph } from "@/lib/am-stage-automation/typed-graph";

const NODE_WIDTH = 190;
const NODE_HEIGHT = 92;

interface AutomationGraphCanvasProps {
  graph: AutomationGraph;
  canConnect?: (sourceStageId: string, targetStageId: string) => boolean;
  onConnect?: (sourceStageId: string, targetStageId: string) => void;
  onDisconnect?: (edge: AutomationGraph["edges"][number]) => void;
}

export function AutomationGraphCanvas({ graph, canConnect, onConnect, onDisconnect }: AutomationGraphCanvasProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const selectedSource = graph.nodes.find((node) => node.id === selectedSourceId);
  return (
    <div className="overflow-x-auto rounded border border-border/70 bg-background/50 p-1" aria-label="Automation typed graph">
      <div className="relative" style={{ width: graph.width, height: graph.height }}>
        <svg className="pointer-events-none absolute inset-0" width={graph.width} height={graph.height} role="img" aria-label="Typed connections between Automation nodes">
          <defs>
            <marker id="automation-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const from = graph.nodes.find((node) => node.id === edge.from);
            const to = graph.nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_HEIGHT / 2;
            const curve = Math.max(28, (x2 - x1) * 0.45);
            return <path key={edge.id} d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={edge.edgeKind === "order" ? "4 3" : undefined} markerEnd="url(#automation-graph-arrow)"><title>{`${from.stage.title}.${edge.fromPort} → ${to.stage.title}.${edge.toPort} · ${edge.kind}`}</title></path>;
          })}
        </svg>
        {graph.nodes.map((node) => (
          <div key={node.id} className={`absolute flex h-[92px] w-[190px] flex-col justify-center gap-1 rounded border bg-card px-2 shadow-sm ${selectedSourceId === node.id ? "border-primary ring-1 ring-primary/40" : "border-primary/40"}`} style={{ left: node.x, top: node.y }} title={node.id}>
            <strong className="truncate text-[11px]">{node.stage.title}</strong>
            <code className="truncate text-[9px] text-muted-foreground">{node.actionId} · {node.stage.outputDefinitions.map((port) => `${port.port}:${port.kind}`).join(", ")}</code>
            {onConnect && canConnect && <div className="flex gap-1">
              <button type="button" className="rounded border border-border px-1 text-[9px]" aria-label={`Select source ${node.stage.title}`} aria-pressed={selectedSourceId === node.id} onClick={() => setSelectedSourceId((current) => current === node.id ? null : node.id)}>
                {selectedSourceId === node.id ? "Source selected" : "Select source"}
              </button>
              {selectedSource && selectedSource.id !== node.id && canConnect(selectedSource.id, node.id) && !graph.edges.some((edge) => edge.edgeKind === "data" && edge.from === selectedSource.id && edge.to === node.id) && (
                <button type="button" className="rounded border border-primary/50 px-1 text-[9px]" aria-label={`Connect ${selectedSource.stage.title} to ${node.stage.title}`} onClick={() => { onConnect(selectedSource.id, node.id); setSelectedSourceId(null); }}>
                  Connect from {selectedSource.stage.title}
                </button>
              )}
            </div>}
          </div>
        ))}
      </div>
      {selectedSource && <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px]" role="status">
        <span>Choose a compatible target for {selectedSource.stage.title}. Existing connections stay unchanged.</span>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setSelectedSourceId(null)}>Cancel connection</button>
      </div>}
      {onDisconnect && graph.edges.some((edge) => edge.edgeKind === "data") && <ul className="grid gap-1 border-t border-border/50 px-2 py-2 sm:grid-cols-2" aria-label="Editable typed connections">
        {graph.edges.filter((edge) => edge.edgeKind === "data").map((edge) => {
          const from = graph.nodes.find((node) => node.id === edge.from);
          const to = graph.nodes.find((node) => node.id === edge.to);
          if (!from || !to) return null;
          return <li key={edge.id} className="flex min-w-0 items-center gap-2 text-[10px]">
            <span className="min-w-0 flex-1 truncate" title={`${from.stage.title}.${edge.fromPort} → ${to.stage.title}.${edge.toPort}`}>
              {from.stage.title}.{edge.fromPort} → {to.stage.title}.{edge.toPort} · {edge.kind}
            </span>
            <button type="button" className="rounded border border-border px-1" aria-label={`Disconnect ${from.stage.title} to ${to.stage.title}`} onClick={() => onDisconnect(edge)}>Disconnect</button>
          </li>;
        })}
      </ul>}
    </div>
  );
}
