'use client';

import { useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  scale: 'lin' | 'log';
  /** dimmed "ghost" knob when the param isn't in the code yet */
  ghost?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
  onActivate?: () => void;
}

const DRAG_RANGE_PX = 140; // full vertical travel for min→max

function toNorm(value: number, min: number, max: number, scale: 'lin' | 'log'): number {
  if (scale === 'log') return Math.log(value / min) / Math.log(max / min);
  return (value - min) / (max - min);
}

function fromNorm(t: number, min: number, max: number, scale: 'lin' | 'log'): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (scale === 'log') return min * Math.pow(max / min, clamped);
  return min + (max - min) * clamped;
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return Number(v.toPrecision(3)).toString();
}

export default function Knob({ label, value, min, max, scale, ghost, disabled, onChange, onActivate }: KnobProps) {
  const dragState = useRef<{ startY: number; startNorm: number } | null>(null);

  const norm = toNorm(value, min, max, scale);
  const angle = -135 + norm * 270;

  return (
    <div className={`flex w-14 flex-col items-center gap-1 select-none ${ghost ? 'opacity-70 hover:opacity-100' : ''}`}>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault(); // stop the browser starting a text selection
          // a ghost knob activates AND starts dragging in the same gesture
          if (ghost) onActivate?.();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragState.current = { startY: e.clientY, startNorm: norm };
        }}
        onPointerMove={(e) => {
          const drag = dragState.current;
          if (!drag || disabled) return;
          const dy = drag.startY - e.clientY;
          onChange(fromNorm(drag.startNorm + dy / DRAG_RANGE_PX, min, max, scale));
        }}
        onPointerUp={() => {
          dragState.current = null;
        }}
        onKeyDown={(e) => {
          if (disabled || ghost) return;
          const step = e.shiftKey ? 0.1 : 0.02;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(fromNorm(norm + step, min, max, scale));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(fromNorm(norm - step, min, max, scale));
        }}
        className={`relative h-10 w-10 touch-none rounded-full border ${
          disabled
            ? 'cursor-not-allowed border-line'
            : ghost
              ? 'cursor-pointer border-line'
              : 'cursor-ns-resize border-line-bright'
        } bg-surface-2 outline-none focus-visible:border-acid-dim`}
      >
        {/* tick */}
        <div className="absolute inset-0 flex items-start justify-center" style={{ transform: `rotate(${angle}deg)` }}>
          <div className={`mt-[3px] h-3 w-[2px] rounded-full ${ghost || disabled ? 'bg-text-faint' : 'bg-acid'}`} />
        </div>
      </div>
      <span className="silkscreen">{label}</span>
      <span className={`text-[10px] tabular-nums ${ghost ? 'text-text-faint' : 'text-text-dim'}`}>
        {disabled ? 'code' : ghost ? '—' : formatValue(value)}
      </span>
    </div>
  );
}
