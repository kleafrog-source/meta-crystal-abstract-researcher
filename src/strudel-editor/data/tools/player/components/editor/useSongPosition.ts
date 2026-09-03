'use client';

import { useEffect, useState } from 'react';
import { getEngine } from '@/lib/strudel/engine';
import { usePlayerStore } from '@/lib/state/store';

/**
 * Song position in cycles while playing, or null when stopped. Quantized to
 * `step` so callers only re-render when the displayed value changes; for
 * smooth per-frame motion (the timeline playhead) run a dedicated RAF that
 * mutates a ref instead.
 */
export function useSongPosition(step = 0.1): number | null {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [pos, setPos] = useState<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      setPos(null);
      return;
    }
    let raf = requestAnimationFrame(function tick() {
      const engine = getEngine();
      setPos(engine ? Math.floor(engine.songPosition() / step) * step : null);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, step]);

  return pos;
}
