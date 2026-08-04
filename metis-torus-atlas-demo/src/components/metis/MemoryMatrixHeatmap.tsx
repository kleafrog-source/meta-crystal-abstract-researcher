"use client";

import { useMemo } from "react";

interface Props {
  flat: number[];
  rank: number;
  dim: number;
  className?: string;
}

/**
 * Memory Matrix heatmap visualization.
 * M имеет размер rank×dim, flat хранится row-major.
 * Цвет отображает значение: отрицательные → magenta, положительные → cyan, ~0 → dark.
 */
export function MemoryMatrixHeatmap({ flat, rank, dim, className = "" }: Props) {
  const cells = useMemo(() => {
    if (!flat || flat.length === 0) return [];
    // normalize для визуализации
    const max = Math.max(...flat.map(Math.abs), 0.001);
    return flat.map((v) => ({
      value: v,
      norm: v / max, // -1 .. 1
    }));
  }, [flat]);

  // Цвет клетки: -1 → magenta, 0 → dark, +1 → cyan
  function cellColor(norm: number): string {
    const a = Math.min(1, Math.abs(norm));
    if (norm >= 0) {
      // cyan
      return `oklch(${55 + a * 25} ${0.15 + a * 0.12} ${195} / ${0.15 + a * 0.75})`;
    } else {
      // magenta
      return `oklch(${55 + a * 25} ${0.18 + a * 0.13} ${320} / ${0.15 + a * 0.75})`;
    }
  }

  return (
    <div
      className={`quantum-grid-bg rounded-md overflow-hidden ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${dim}, minmax(0, 1fr))`,
        gap: "1px",
        padding: "4px",
        background: "oklch(0.1 0.02 290 / 60%)",
      }}
      role="img"
      aria-label={`Memory matrix ${rank}×${dim} heatmap`}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          className="aspect-square transition-colors"
          style={{
            background: cellColor(c.norm),
            borderRadius: "1px",
          }}
          title={`M[${Math.floor(i / dim)},${i % dim}] = ${c.value.toFixed(4)}`}
        />
      ))}
    </div>
  );
}
