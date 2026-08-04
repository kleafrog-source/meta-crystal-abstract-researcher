"use client";

import { useMemo } from "react";
import type { AtlasChart, CrystalNode } from "@/lib/metis/types";

export type MetisPaletteMode = "signal" | "contrast" | "warm" | "mono";

interface TorusAtlasVizProps {
  charts: AtlasChart[];
  nodes: CrystalNode[];
  activeChart: string;
  palette?: MetisPaletteMode;
}

const CHART_PALETTES: Record<MetisPaletteMode, string[]> = {
  signal: [
    "oklch(0.35 0.18 320 / 35%)",
    "oklch(0.35 0.16 195 / 35%)",
    "oklch(0.35 0.18 280 / 35%)",
    "oklch(0.35 0.18 150 / 35%)",
    "oklch(0.4 0.2 60 / 40%)",
    "oklch(0.4 0.2 30 / 40%)",
    "oklch(0.4 0.2 0 / 40%)",
    "oklch(0.4 0.2 200 / 40%)",
  ],
  contrast: [
    "oklch(0.34 0.22 20 / 38%)",
    "oklch(0.35 0.22 90 / 38%)",
    "oklch(0.35 0.22 150 / 38%)",
    "oklch(0.35 0.22 220 / 38%)",
    "oklch(0.35 0.22 280 / 38%)",
    "oklch(0.35 0.22 330 / 38%)",
  ],
  warm: [
    "oklch(0.36 0.18 20 / 38%)",
    "oklch(0.38 0.16 45 / 38%)",
    "oklch(0.39 0.15 70 / 38%)",
    "oklch(0.38 0.15 110 / 38%)",
    "oklch(0.36 0.14 150 / 38%)",
    "oklch(0.35 0.15 185 / 38%)",
  ],
  mono: [
    "oklch(0.28 0.02 260 / 32%)",
    "oklch(0.34 0.02 260 / 32%)",
    "oklch(0.40 0.02 260 / 32%)",
    "oklch(0.46 0.02 260 / 32%)",
    "oklch(0.52 0.02 260 / 32%)",
  ],
};

export function TorusAtlasViz({ charts, nodes, activeChart, palette = "signal" }: TorusAtlasVizProps) {
  const colors = useMemo(
    () => CHART_PALETTES[palette] ?? CHART_PALETTES.signal,
    [palette],
  );

  return (
    <div className="relative h-[420px] overflow-hidden rounded-xl border border-border/60 bg-background/40">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <pattern id="metis-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="oklch(0.4 0.08 320 / 18%)" strokeWidth="0.2" />
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
          const stroke = chart.chart_id === activeChart ? "oklch(0.85 0.25 320)" : chart.created_due_to_overflow ? "oklch(0.85 0.25 60)" : "oklch(0.6 0.15 320 / 60%)";
          return (
            <g key={chart.chart_id}>
              <rect x={x} y={y} width={width} height={height} fill={colors[index % colors.length]} stroke={stroke} strokeWidth={chart.chart_id === activeChart ? 0.8 : 0.4} strokeDasharray={chart.created_due_to_overflow ? "2,1" : undefined} />
              <text x={x + 2} y={y + 5} fill="oklch(0.95 0.05 290 / 90%)" fontSize="3.2" fontFamily="monospace" fontWeight="600">
                {chart.chart_id.replace("chart_", "")}
              </text>
              <text x={x + 2} y={y + 9} fill="oklch(0.75 0.08 290 / 75%)" fontSize="2.4" fontFamily="monospace">
                {chart.node_count} nodes
              </text>
            </g>
          );
        })}

        {nodes.map((node, index) => {
          const x = node.coords.torus_u * 100;
          const y = (1 - node.coords.torus_v) * 100;
          const r = 0.8 + node.importance * 1.8;
          const fill =
            palette === "mono"
              ? node.importance > 0.7
                ? "oklch(0.86 0.01 260)"
                : node.importance > 0.4
                  ? "oklch(0.72 0.01 260)"
                  : "oklch(0.58 0.01 260)"
              : palette === "warm"
                ? node.importance > 0.7
                  ? "oklch(0.84 0.22 35)"
                  : node.importance > 0.4
                    ? "oklch(0.82 0.18 65)"
                    : "oklch(0.76 0.14 110)"
                : palette === "contrast"
                  ? node.importance > 0.7
                    ? "oklch(0.84 0.24 20)"
                    : node.importance > 0.4
                      ? "oklch(0.86 0.22 215)"
                      : "oklch(0.82 0.2 105)"
                  : node.importance > 0.7
                    ? "oklch(0.85 0.28 320)"
                    : node.importance > 0.4
                      ? "oklch(0.85 0.22 195)"
                      : "oklch(0.7 0.18 60)";
          return (
            <g key={node.node_id}>
              <circle cx={x} cy={y} r={r} fill={fill} opacity={0.85}>
                <animate attributeName="opacity" values="0.85;0.4;0.85" dur="2.4s" begin={`${index * 0.08}s`} repeatCount="indefinite" />
              </circle>
              <title>{`${node.node_id}: ${node.content.slice(0, 60)}...`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
