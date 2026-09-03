'use client';

import { memo } from 'react';
import type { TimelineLane } from '@/lib/timeline/types';

interface Props {
  lane: TimelineLane;
  pxPerCycle: number;
  /** may exceed the analyzed span — periodic activity tiles to fill it */
  displayCycles?: number;
}

/** One voice's activity cells. Memoized — only re-renders on zoom or re-analysis. */
const TimelineLaneRow = memo(function TimelineLaneRow({ lane, pxPerCycle, displayCycles }: Props) {
  const color = lane.color ?? 'var(--acid)';
  const total = Math.max(displayCycles ?? lane.activity.length, lane.activity.length);
  return (
    <div className="flex h-5 border-b border-line/40" title={lane.source.label ?? undefined}>
      {Array.from({ length: total }, (_, c) => {
        // beyond the analyzed span the song repeats by definition of period
        const cell = lane.activity[c % lane.activity.length];
        const level = cell ? Math.max(cell.coverage, Math.min(1, cell.onsets / 8)) : 0;
        return (
          <div key={c} className="h-full shrink-0 py-0.5" style={{ width: pxPerCycle }}>
            {level > 0 && (
              <div
                className="h-full w-full rounded-[1px]"
                style={{ backgroundColor: color, opacity: 0.18 + 0.62 * level }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default TimelineLaneRow;
