"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasSize } from "@/components/metis/useCanvasSize";

export type MetisVizMode = "auto" | "quality" | "density";

interface MemoryMatrixHeatmapProps {
  flat: number[];
  rank: number;
  dim: number;
  className?: string;
  enabled?: boolean;
  mode?: MetisVizMode;
}

interface HoverCell {
  row: number;
  col: number;
  value: number;
  x: number;
  y: number;
}

function MemoryMatrixHeatmapComponent({
  flat,
  rank,
  dim,
  className,
  enabled = true,
  mode = "auto",
}: MemoryMatrixHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<HoverCell | null>(null);
  const size = useCanvasSize(containerRef.current);

  const stats = useMemo(() => {
    let maxAbs = 0.001;
    for (let index = 0; index < flat.length; index += 1) {
      const abs = Math.abs(flat[index] ?? 0);
      if (abs > maxAbs) maxAbs = abs;
    }
    return { maxAbs };
  }, [flat]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height || !dim || !flat.length) return;

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

      const cellWidth = cssWidth / dim;
      const cellHeight = cssHeight / rank;
      const dense = mode === "density" || (mode === "auto" && flat.length > 768);

      for (let row = 0; row < rank; row += 1) {
        for (let col = 0; col < dim; col += 1) {
          const value = flat[row * dim + col] ?? 0;
          const normalized = value / stats.maxAbs;
          const intensity = Math.min(1, Math.abs(normalized));
          const lightness = dense ? 36 + intensity * 28 : 42 + intensity * 24;
          const chroma = dense ? 0.11 + intensity * 0.12 : 0.15 + intensity * 0.12;
          const hue = normalized >= 0 ? 195 : 320;
          ctx.fillStyle = `oklch(${lightness}% ${chroma} ${hue})`;
          ctx.fillRect(col * cellWidth, row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
        }
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [dim, enabled, flat, mode, rank, size, stats.maxAbs]);

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!enabled || !size.width || !size.height || !dim || !rank) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.max(0, Math.min(dim - 1, Math.floor((x / rect.width) * dim)));
    const row = Math.max(0, Math.min(rank - 1, Math.floor((y / rect.height) * rank)));
    const value = flat[row * dim + col] ?? 0;
    setHover({ row, col, value, x, y });
  }

  function handlePointerLeave() {
    setHover(null);
  }

  if (!enabled) {
    return (
      <div className={className}>
        <div className="flex h-[320px] items-center justify-center rounded-xl border border-border/60 bg-background/20 text-sm text-muted-foreground">
          Memory matrix hidden
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", minHeight: 320, borderRadius: "0.75rem", overflow: "hidden", background: "oklch(0.16 0.02 290)" }}
      role="img"
      aria-label={`Metis memory matrix ${rank} by ${dim}`}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border/60 bg-background/95 px-2 py-1 font-mono text-[11px] shadow-sm"
          style={{
            left: Math.min(hover.x + 10, Math.max(8, size.width - 140)),
            top: Math.min(hover.y + 10, Math.max(8, size.height - 44)),
          }}
        >
          {`M[${hover.row},${hover.col}] = ${hover.value.toFixed(4)}`}
        </div>
      )}
    </div>
  );
}

export const MemoryMatrixHeatmap = memo(MemoryMatrixHeatmapComponent);
