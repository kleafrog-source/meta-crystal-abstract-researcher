"use client";

import { useMemo } from "react";
import type { AtlasChart, CrystalNode } from "@/lib/engine/types";

interface Props {
  charts: AtlasChart[];
  nodes: CrystalNode[];
  activeChart: string;
  onSelectChart?: (chartId: string) => void;
  className?: string;
}

/**
 * Torus Atlas visualization.
 * Рисует 2D тор как квадрат [0,1]×[0,1], разбитый на atlas charts.
 * Crystal nodes отображаются как точки внутри своих chart'ов.
 * Periodic boundaries подразумеваются, но визуально тор "развёрнут" в квадрат.
 */
export function TorusAtlasViz({ charts, nodes, activeChart, onSelectChart, className = "" }: Props) {
  // Цвет chart'а по индексу
  const chartColors = useMemo(() => {
    const palette = [
      "oklch(0.35 0.18 320 / 35%)",
      "oklch(0.35 0.16 195 / 35%)",
      "oklch(0.35 0.18 280 / 35%)",
      "oklch(0.35 0.18 150 / 35%)",
      "oklch(0.4 0.2 60 / 40%)",
      "oklch(0.4 0.2 30 / 40%)",
      "oklch(0.4 0.2 0 / 40%)",
      "oklch(0.4 0.2 200 / 40%)",
    ];
    return palette;
  }, []);

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        style={{ background: "oklch(0.08 0.02 290 / 70%)", borderRadius: "8px" }}
      >
        <defs>
          <pattern id="torusGrid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="oklch(0.4 0.08 320 / 18%)" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#torusGrid)" />

        {/* Atlas charts */}
        {charts.map((chart, idx) => {
          const [u0, u1] = chart.u_range;
          const [v0, v1] = chart.v_range;
          const x = u0 * 100;
          const y = (1 - v1) * 100; // SVG y инвертирован
          const w = (u1 - u0) * 100;
          const h = (v1 - v0) * 100;
          const isActive = chart.chart_id === activeChart;
          const isOverflow = chart.created_due_to_overflow;
          const fill = chartColors[idx % chartColors.length];
          const stroke = isActive
            ? "oklch(0.85 0.25 320)"
            : isOverflow
            ? "oklch(0.85 0.25 60)"
            : "oklch(0.6 0.15 320 / 60%)";

          return (
            <g key={chart.chart_id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={fill}
                stroke={stroke}
                strokeWidth={isActive ? 0.8 : 0.4}
                strokeDasharray={isOverflow ? "2,1" : undefined}
                style={{ cursor: onSelectChart ? "pointer" : "default" }}
                onClick={() => onSelectChart?.(chart.chart_id)}
              />
              <text
                x={x + 2}
                y={y + 5}
                fill="oklch(0.95 0.05 290 / 90%)"
                fontSize="3.2"
                fontFamily="var(--font-geist-mono), monospace"
                fontWeight="600"
              >
                {chart.chart_id.replace("chart_", "")}
              </text>
              <text
                x={x + 2}
                y={y + 9}
                fill="oklch(0.75 0.08 290 / 75%)"
                fontSize="2.4"
                fontFamily="var(--font-geist-mono), monospace"
              >
                {chart.node_count} nodes
              </text>
            </g>
          );
        })}

        {/* Crystal nodes как точки */}
        {nodes.map((n, i) => {
          const x = n.coords.torus_u * 100;
          const y = (1 - n.coords.torus_v) * 100;
          const r = 0.8 + n.importance * 1.8;
          const color = n.importance > 0.7
            ? "oklch(0.85 0.28 320)"
            : n.importance > 0.4
            ? "oklch(0.85 0.22 195)"
            : "oklch(0.7 0.18 60)";
          return (
            <g key={n.node_id}>
              <circle cx={x} cy={y} r={r} fill={color} opacity={0.85}>
                <animate
                  attributeName="opacity"
                  values="0.85;0.4;0.85"
                  dur="2.4s"
                  begin={`${i * 0.08}s`}
                  repeatCount="indefinite"
                />
              </circle>
              <title>
                {n.node_id}: {n.content.slice(0, 60)}... (importance={n.importance.toFixed(3)})
              </title>
            </g>
          );
        })}

        {/* Periodic boundary indicators (4 edges) */}
        <text x="50" y="-1" fill="oklch(0.7 0.15 320 / 60%)" fontSize="2.5" textAnchor="middle" fontFamily="monospace">
          ⇅ periodic
        </text>
        <text x="50" y="103" fill="oklch(0.7 0.15 320 / 60%)" fontSize="2.5" textAnchor="middle" fontFamily="monospace">
          ⇅ periodic
        </text>
      </svg>
    </div>
  );
}
