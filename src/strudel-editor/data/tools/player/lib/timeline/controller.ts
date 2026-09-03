/**
 * Glue between the engine's afterEval and the analysis pipeline. One run in
 * flight at a time: a newer eval cancels the previous run, and results land
 * in the store only if still current. Eval failures never reach here (the
 * afterEval hook only fires on success), so the last good timeline survives
 * mid-edit breakage, flagged stale by the editor.
 */
import { detectLanes } from '@/lib/chunks/detect';
import { usePlayerStore } from '@/lib/state/store';
import { getEngine } from '@/lib/strudel/engine';
import { analyzeSong } from './analyze';

let currentSignal: { cancelled: boolean } | null = null;

export function runTimelineAnalysis(pattern: unknown, code: string): void {
  if (currentSignal) currentSignal.cancelled = true;
  const signal = { cancelled: false };
  currentSignal = signal;

  const scan = detectLanes(code);
  const cps = getEngine()?.mirror.repl.scheduler.cps ?? 0.5;
  void analyzeSong(pattern, scan?.lanes ?? [], code, {
    hintCycles: scan?.horizonHint ?? null,
    cps,
    signal,
  }).then((timeline) => {
    if (signal.cancelled || !timeline) return;
    const store = usePlayerStore.getState();
    store.setTimeline(timeline);
    store.setTimelineStale(false);
  });
}

export function cancelTimelineAnalysis(): void {
  if (currentSignal) currentSignal.cancelled = true;
  currentSignal = null;
}
