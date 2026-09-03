/**
 * Transport actions shared by the transport bar and the timeline strip.
 * Each one drives the engine and mirrors the resulting loop state back into
 * the store, so UI state never diverges from what's actually scheduled.
 */
import { getEngine } from '@/lib/strudel/engine';
import { usePlayerStore } from '@/lib/state/store';

/** Seek/play from a song cycle. Seeking outside an active loop clears it. */
export async function seekTo(cycle: number) {
  const engine = getEngine();
  if (!engine) return;
  await engine.playFrom(cycle);
  usePlayerStore.getState().setLoopRegion(engine.getLoopRegion());
}

/** Apply (or clear, with null) a loop region in song cycles. */
export async function applyLoopRegion(region: [number, number] | null) {
  const engine = getEngine();
  if (!engine) return;
  if (region) {
    await engine.setLoopRegion(region[0], region[1]);
  } else {
    await engine.clearLoopRegion();
  }
  usePlayerStore.getState().setLoopRegion(engine.getLoopRegion());
}

/** Seek to the previous/next section boundary (wraps at the ends). */
export async function skipSection(dir: -1 | 1) {
  const engine = getEngine();
  const { timeline } = usePlayerStore.getState();
  if (!engine || !timeline?.sections.length) return;
  const starts = timeline.sections.map((s) => s.start);
  const pos = engine.songPosition();
  let target: number | undefined;
  if (dir === 1) {
    target = starts.find((s) => s > pos + 1e-6) ?? starts[0];
  } else {
    // half-cycle grace so a quick double-tap goes back one section, not zero
    const before = starts.filter((s) => s < pos - 0.5);
    target = before.length ? before[before.length - 1] : starts[starts.length - 1];
  }
  await seekTo(target);
}
