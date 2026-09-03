/**
 * End-to-end: evaluate the Corona acid-test fixture with the real strudel
 * transpiler + evalScope (core, mini, tonal — no webaudio needed; sounds
 * resolve at output time, not eval time), then run the full analysis and
 * assert the derived timeline.
 *
 * The song's `.cpm(128/4)` is `_fast(32/60)`, so its 54 musical cycles span
 * 54 · 60/32 = 101.25 scheduler cycles — the rational-period case.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { evalScope, evaluate } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';
import { analyzeSong } from '@/lib/timeline/analyze';
import { detectLanes } from '@/lib/chunks/detect';
import { CORONA } from '../fixtures/corona';

let pattern: unknown;

beforeAll(async () => {
  await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'));
  const result = (await evaluate(CORONA, transpiler)) as { pattern: unknown };
  pattern = result.pattern;
}, 30_000);

describe('corona end-to-end analysis', () => {
  it('detects the rational song period and lane structure', { timeout: 60_000 }, async () => {
    const scan = detectLanes(CORONA)!;
    const timeline = await analyzeSong(pattern, scan.lanes, CORONA, {
      hintCycles: scan.horizonHint,
      cps: 0.5,
      sliceBudgetMs: 1000, // node: no main thread to protect, keep slices big
    });
    expect(timeline).not.toBeNull();

    // 54 musical cycles × 60/32 = 101.25 = 405/4 scheduler cycles
    expect(timeline!.period).not.toBeNull();
    expect(timeline!.period!.cycles).toEqual({ n: 405, d: 4 });
    expect(timeline!.cycles).toBe(102);

    // 5 stack-argument voices, each musically active somewhere
    const stackLanes = timeline!.lanes.filter((l) => l.source.kind === 'stackArg');
    expect(stackLanes).toHaveLength(5);

    // per-voice .color() lands on the lanes
    const colors = timeline!.lanes.map((l) => l.color);
    for (const c of ['blue', 'green', 'red', 'yellow']) expect(colors).toContain(c);

    // the song has real structure: parts enter and leave
    expect(timeline!.sections.length).toBeGreaterThanOrEqual(4);

    // the lead voice rests during the breakdown (its timeline has ~@8)
    const lead = timeline!.lanes.find((l) => l.source.label === 'gm_lead_1_square');
    expect(lead).toBeDefined();
    const inactive = lead!.activity.filter((a) => a.onsets === 0 && a.coverage === 0);
    expect(inactive.length).toBeGreaterThan(0);
  });
});
