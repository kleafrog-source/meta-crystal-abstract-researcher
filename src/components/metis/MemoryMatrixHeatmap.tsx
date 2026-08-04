"use client";

import { useMemo } from "react";

interface MemoryMatrixHeatmapProps {
  flat: number[];
  rank: number;
  dim: number;
  className?: string;
}

export function MemoryMatrixHeatmap({ flat, rank, dim, className }: MemoryMatrixHeatmapProps) {
  const cells = useMemo(() => {
    const max = Math.max(...flat.map((value) => Math.abs(value)), 0.001);
    return flat.map((value) => ({ value, normalized: value / max }));
  }, [flat]);

  function color(normalized: number) {
    const alpha = Math.min(1, Math.abs(normalized));
    if (normalized >= 0) {
      return `oklch(${55 + alpha * 25} ${0.15 + alpha * 0.12} 195 / ${0.15 + alpha * 0.75})`;
    }
    return `oklch(${55 + alpha * 25} ${0.18 + alpha * 0.13} 320 / ${0.15 + alpha * 0.75})`;
  }

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${dim}, minmax(0, 1fr))`,
        gap: "1px",
        padding: "4px",
        borderRadius: "0.75rem",
        background: "oklch(0.1 0.02 290 / 0.6)",
      }}
      role="img"
      aria-label={`Metis memory matrix ${rank} by ${dim}`}
    >
      {cells.map((cell, index) => (
        <div
          key={index}
          className="aspect-square rounded-[1px]"
          style={{ background: color(cell.normalized) }}
          title={`M[${Math.floor(index / dim)},${index % dim}] = ${cell.value.toFixed(4)}`}
        />
      ))}
    </div>
  );
}

