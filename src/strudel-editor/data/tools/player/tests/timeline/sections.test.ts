import { describe, expect, it } from 'vitest';
import { computeSections } from '@/lib/timeline/sections';
import type { TimelineLane } from '@/lib/timeline/types';

/** lane active on [from, to) within `cycles` */
function makeLane(id: string, cycles: number, from: number, to: number): TimelineLane {
  return {
    source: { id, kind: 'statement', label: id, range: [0, 1], statementRange: [0, 1], refs: [] },
    color: null,
    activity: Array.from({ length: cycles }, (_, c) => ({
      onsets: c >= from && c < to ? 4 : 0,
      coverage: c >= from && c < to ? 1 : 0,
      rhythmKey: 'k',
      sounds: [],
    })),
    firstActiveCycle: from,
    lastActiveCycle: to - 1,
  };
}

describe('computeSections', () => {
  it('cuts sections where the active-lane set changes', () => {
    const lanes = [makeLane('a', 12, 0, 8), makeLane('b', 12, 4, 12)];
    const sections = computeSections(lanes, 12);
    expect(sections.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
    ]);
    expect(sections[0].activeLaneIds).toEqual(['a']);
    expect(sections[1].activeLaneIds).toEqual(['a', 'b']);
    expect(sections[2].activeLaneIds).toEqual(['b']);
  });

  it('reuses letters for repeated signatures', () => {
    const lanes = [makeLane('a', 12, 0, 4), makeLane('b', 12, 4, 8), makeLane('a2', 12, 8, 12)];
    // a alone, b alone, a2 alone — distinct signatures get distinct letters
    const first = computeSections(lanes, 12).map((s) => s.label);
    expect(first).toEqual(['A', 'B', 'C']);

    // a plays 0–4 and 8–12 with b in between: A B A
    const repeat = [
      {
        ...makeLane('a', 12, 0, 12),
        activity: Array.from({ length: 12 }, (_, c) => ({
          onsets: c < 4 || c >= 8 ? 4 : 0,
          coverage: c < 4 || c >= 8 ? 1 : 0,
          rhythmKey: 'k',
          sounds: [],
        })),
      },
      makeLane('b', 12, 4, 8),
    ];
    expect(computeSections(repeat, 12).map((s) => s.label)).toEqual(['A', 'B', 'A']);
  });

  it('returns one section for a uniform song', () => {
    const sections = computeSections([makeLane('a', 4, 0, 4)], 4);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ start: 0, end: 4, label: 'A' });
  });

  it('handles empty input', () => {
    expect(computeSections([], 8)).toEqual([]);
  });
});
