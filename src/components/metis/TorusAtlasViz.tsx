"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasSize } from "@/components/metis/useCanvasSize";
import type { AtlasChart, CrystalNode } from "@/lib/metis/types";
import type { MetisVizMode } from "@/components/metis/MemoryMatrixHeatmap";

export type MetisPaletteMode = "signal" | "contrast" | "warm" | "mono";

interface TorusAtlasVizProps {
  charts: AtlasChart[];
  nodes: CrystalNode[];
  activeChart: string;
  palette?: MetisPaletteMode;
  enabled?: boolean;
  mode?: MetisVizMode;
  selectedNodeId?: string | null;
  onSelectNode?: (node: CrystalNode) => void;
}

interface ProjectedNode {
  node: CrystalNode;
  x: number;
  y: number;
  radius: number;
  fill: string;
}

interface HoveredNode {
  node: CrystalNode;
  x: number;
  y: number;
}

const CANVAS_NODE_THRESHOLD = 900;
const CHART_PALETTES: Record<MetisPaletteMode, string[]> = {
  signal: [
    "oklch(0.35 0.18 320 / 28%)",
    "oklch(0.35 0.16 195 / 28%)",
    "oklch(0.35 0.18 280 / 28%)",
    "oklch(0.35 0.18 150 / 28%)",
    "oklch(0.38 0.18 60 / 30%)",
    "oklch(0.38 0.18 30 / 30%)",
  ],
  contrast: [
    "oklch(0.34 0.22 20 / 30%)",
    "oklch(0.35 0.22 90 / 30%)",
    "oklch(0.35 0.22 150 / 30%)",
    "oklch(0.35 0.22 220 / 30%)",
    "oklch(0.35 0.22 280 / 30%)",
    "oklch(0.35 0.22 330 / 30%)",
  ],
  warm: [
    "oklch(0.36 0.18 20 / 30%)",
    "oklch(0.38 0.16 45 / 30%)",
    "oklch(0.39 0.15 70 / 30%)",
    "oklch(0.38 0.15 110 / 30%)",
    "oklch(0.36 0.14 150 / 30%)",
    "oklch(0.35 0.15 185 / 30%)",
  ],
  mono: [
    "oklch(0.28 0.02 260 / 26%)",
    "oklch(0.34 0.02 260 / 26%)",
    "oklch(0.4 0.02 260 / 26%)",
    "oklch(0.46 0.02 260 / 26%)",
    "oklch(0.52 0.02 260 / 26%)",
  ],
};

function getNodeFill(palette: MetisPaletteMode, importance: number) {
  if (palette === "mono") {
    return importance > 0.7 ? "oklch(0.82 0.01 260)" : importance > 0.4 ? "oklch(0.68 0.01 260)" : "oklch(0.54 0.01 260)";
  }
  if (palette === "warm") {
    return importance > 0.7 ? "oklch(0.82 0.19 35)" : importance > 0.4 ? "oklch(0.79 0.16 65)" : "oklch(0.73 0.13 110)";
  }
  if (palette === "contrast") {
    return importance > 0.7 ? "oklch(0.82 0.22 20)" : importance > 0.4 ? "oklch(0.82 0.2 215)" : "oklch(0.8 0.18 105)";
  }
  return importance > 0.7 ? "oklch(0.82 0.22 320)" : importance > 0.4 ? "oklch(0.8 0.18 195)" : "oklch(0.72 0.15 60)";
}

function TorusAtlasVizComponent({
  charts,
  nodes,
  activeChart,
  palette = "signal",
  enabled = true,
  mode = "auto",
  selectedNodeId = null,
  onSelectNode,
}: TorusAtlasVizProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<HoveredNode | null>(null);
  const size = useCanvasSize(containerRef.current);
  const chartColors = useMemo(() => CHART_PALETTES[palette] ?? CHART_PALETTES.signal, [palette]);
  const useCanvas = enabled && (mode === "density" || (mode === "auto" && nodes.length > CANVAS_NODE_THRESHOLD));

  const projectedNodes = useMemo<ProjectedNode[]>(
    () =>
      nodes.map((node) => ({
        node,
        x: node.coords.torus_u,
        y: 1 - node.coords.torus_v,
        radius: mode === "density" ? 1.2 : useCanvas ? 1.35 : 0.8 + node.importance * 1.35,
        fill: getNodeFill(palette, node.importance),
      })),
    [mode, nodes, palette, useCanvas],
  );

  useEffect(() => {
    if (!enabled || !useCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;

    let frame = window.requestAnimationFrame(() => {
      const dpr = size.dpr || 1;
      const cssWidth = size.width;
      const cssHeight = size.height;
      const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
      const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      for (const point of projectedNodes) {
        const x = point.x * cssWidth;
        const y = point.y * cssHeight;
        if (x < -8 || y < -8 || x > cssWidth + 8 || y > cssHeight + 8) continue;
        ctx.fillStyle = point.fill;
        ctx.beginPath();
        ctx.arc(x, y, point.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const highlightedNodeId = hovered?.node.node_id ?? selectedNodeId;
      if (highlightedNodeId) {
        const point = projectedNodes.find((item) => item.node.node_id === highlightedNodeId);
        if (point) {
          ctx.strokeStyle = "oklch(0.92 0.04 280)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(point.x * cssWidth, point.y * cssHeight, Math.max(3.5, point.radius + 2), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [enabled, hovered, projectedNodes, selectedNodeId, size, useCanvas]);

  function findNearestNode(clientX: number, clientY: number, rect: DOMRect) {
    let best: ProjectedNode | null = null;
    let bestDistance = 144;

    for (const point of projectedNodes) {
      const px = point.x * rect.width;
      const py = point.y * rect.height;
      const dx = px - clientX;
      const dy = py - clientY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }

    return best;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled || !useCanvas || !size.width || !size.height || !projectedNodes.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const best = findNearestNode(x, y, rect);

    if (!best) {
      setHovered(null);
      return;
    }
    setHovered({ node: best.node, x, y });
  }

  function handlePointerLeave() {
    setHovered(null);
  }

  function handleClick(event: React.PointerEvent<HTMLDivElement>) {
    if (!onSelectNode || !enabled || !projectedNodes.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const best = findNearestNode(x, y, rect);
    if (best) {
      onSelectNode(best.node);
    }
  }

  if (!enabled) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-border/60 bg-background/20 text-sm text-muted-foreground">
        Torus atlas hidden
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[420px] overflow-hidden rounded-xl border border-border/60 bg-background/40"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="metis-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="oklch(0.38 0.05 300)" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#metis-grid)" />

        {charts.map((chart, index) => {
          const [u0, u1] = chart.u_range;
          const [v0, v1] = chart.v_range;
          const x = u0 * 100;
          const y = (1 - v1) * 100;
          const width = (u1 - u0) * 100;
          const height = (v1 - v0) * 100;
          const stroke = chart.chart_id === activeChart ? "oklch(0.84 0.18 300)" : chart.created_due_to_overflow ? "oklch(0.82 0.18 60)" : "oklch(0.56 0.08 290)";
          return (
            <g key={chart.chart_id}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={chartColors[index % chartColors.length]}
                stroke={stroke}
                strokeWidth={chart.chart_id === activeChart ? 0.45 : 0.25}
                strokeDasharray={chart.created_due_to_overflow ? "1.5,1" : undefined}
              />
              <text x={x + 2} y={y + 5} fill="oklch(0.95 0.03 290)" fontSize="3.2" fontFamily="monospace" fontWeight="600">
                {chart.chart_id.replace("chart_", "")}
              </text>
              <text x={x + 2} y={y + 9} fill="oklch(0.76 0.04 290)" fontSize="2.3" fontFamily="monospace">
                {chart.node_count} nodes
              </text>
            </g>
          );
        })}

        {!useCanvas &&
          projectedNodes.map((point) => (
            <g key={point.node.node_id}>
              <circle cx={point.x * 100} cy={point.y * 100} r={point.radius * 0.22} fill={point.fill} />
              {selectedNodeId === point.node.node_id && (
                <circle
                  cx={point.x * 100}
                  cy={point.y * 100}
                  r={Math.max(1.4, point.radius * 0.3 + 0.55)}
                  fill="none"
                  stroke="oklch(0.92 0.04 280)"
                  strokeWidth="0.25"
                />
              )}
              <title>{`${point.node.node_id}: ${point.node.content.slice(0, 60)}...`}</title>
            </g>
          ))}
      </svg>

      {useCanvas && <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] rounded-md border border-border/60 bg-background/95 px-2 py-1 text-[11px] shadow-sm"
          style={{
            left: Math.min(hovered.x + 12, Math.max(8, size.width - 290)),
            top: Math.min(hovered.y + 12, Math.max(8, size.height - 84)),
          }}
        >
          <div className="font-mono text-foreground">{hovered.node.node_id}</div>
          <div className="text-muted-foreground">{hovered.node.content.slice(0, 140)}</div>
        </div>
      )}
    </div>
  );
}

export const TorusAtlasViz = memo(TorusAtlasVizComponent);
