'use client';

import { useEffect, useState } from 'react';
import { getEngine } from '@/lib/strudel/engine';
import { usePlayerStore } from '@/lib/state/store';

/**
 * Current playhead column (0-based) while playing, or null when stopped.
 *
 * Assumes the pattern starts on a cycle that is a multiple of `bars` — true
 * for the editable subset (flat patterns repeat every cycle; the starter's
 * multi-bar voices sit in sections whose lengths are bar multiples). Chains
 * with `.fast()`/`.slow()` will drift, which is fine for a visual hint.
 * Polls per animation frame but only re-renders the caller when the column
 * actually changes.
 */
export function usePlayhead(steps: number, bars = 1): number | null {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [col, setCol] = useState<number | null>(null);

  useEffect(() => {
    if (!isPlaying || steps <= 0) {
      setCol(null);
      return;
    }
    let raf = requestAnimationFrame(function tick() {
      const engine = getEngine();
      if (!engine) {
        setCol(null);
      } else {
        const pos = engine.songPosition();
        const phase = (((pos % bars) + bars) % bars) / bars;
        setCol(Math.min(steps - 1, Math.floor(phase * steps)));
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, steps, bars]);

  return col;
}
