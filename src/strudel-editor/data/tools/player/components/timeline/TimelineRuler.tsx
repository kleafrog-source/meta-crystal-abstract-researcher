'use client';

import { memo } from 'react';
import type { SongSection } from '@/lib/timeline/types';

interface Props {
  cycles: number;
  pxPerCycle: number;
  sections: SongSection[];
  onSectionClick: (section: SongSection, altKey: boolean) => void;
}

/**
 * Cycle ruler with tick numbers and section chips. Click a chip to seek to
 * the section; alt-click to loop it. Background clicks/drags are handled by
 * the strip's canvas-level pointer logic (data-ruler marks the drag zone).
 */
const TimelineRuler = memo(function TimelineRuler({ cycles, pxPerCycle, sections, onSectionClick }: Props) {
  // keep number labels readable at any zoom: ~every 56px, snapped to 4 cycles
  const labelEvery = Math.max(4, Math.ceil(56 / pxPerCycle / 4) * 4);
  const ticks: number[] = [];
  for (let c = 0; c < cycles; c += labelEvery) ticks.push(c);

  return (
    <div data-ruler className="relative h-6 cursor-crosshair select-none border-b border-line bg-surface-2/60">
      {ticks.map((c) => (
        <span
          key={c}
          className="pointer-events-none absolute top-3 text-[9px] text-text-faint tabular-nums"
          style={{ left: c * pxPerCycle + 2 }}
        >
          {c}
        </span>
      ))}
      {sections.map((section, i) => (
        <button
          key={i}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => onSectionClick(section, e.altKey)}
          title={`section ${section.label} · cycle ${section.start}–${section.end} · click to play, alt-click to loop`}
          className="absolute top-0.5 h-[13px] rounded-[2px] border border-line-bright bg-surface px-1 text-[9px] leading-[11px] text-text-dim transition-colors hover:border-acid-dim hover:text-acid"
          style={{ left: section.start * pxPerCycle + 1, maxWidth: (section.end - section.start) * pxPerCycle - 2 }}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
});

export default TimelineRuler;
