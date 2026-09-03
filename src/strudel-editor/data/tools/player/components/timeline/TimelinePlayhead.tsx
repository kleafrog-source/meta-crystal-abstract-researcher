'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { getEngine } from '@/lib/strudel/engine';
import { usePlayerStore } from '@/lib/state/store';

interface Props {
  pxPerCycle: number;
  cycles: number;
  /** the horizontal scroll container, for follow mode */
  scrollRef: RefObject<HTMLDivElement | null>;
  follow: boolean;
}

/**
 * Sweeping playhead line. Runs its own RAF and mutates the element transform
 * directly (the MasterScope pattern) — zero React re-renders per frame.
 */
export default function TimelinePlayhead({ pxPerCycle, cycles, scrollRef, follow }: Props) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying || cycles <= 0) return;
    let raf = requestAnimationFrame(function tick() {
      const engine = getEngine();
      const el = ref.current;
      if (engine && el) {
        const x = (engine.songPosition() % cycles) * pxPerCycle;
        el.style.transform = `translateX(${x}px)`;
        if (follow) {
          const sc = scrollRef.current;
          if (sc && sc.scrollWidth > sc.clientWidth && (x < sc.scrollLeft + 16 || x > sc.scrollLeft + sc.clientWidth - 32)) {
            sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.4);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, pxPerCycle, cycles, follow, scrollRef]);

  if (!isPlaying) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-acid shadow-[0_0_8px_var(--glow)]"
    />
  );
}
