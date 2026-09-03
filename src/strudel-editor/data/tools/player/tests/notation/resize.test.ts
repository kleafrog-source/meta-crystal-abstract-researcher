import { describe, expect, it } from 'vitest';
import { resizeGrid, resizeRoll } from '@/lib/notation/resize';
import { parseStepGrid } from '@/lib/notation/parse';
import { serializeStepGrid } from '@/lib/notation/serialize';

function grid(mini: string) {
  const parsed = parseStepGrid(mini);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.model;
}

describe('grid resize — spread (keep musical time)', () => {
  it('8→16 puts hits on every other 16th', () => {
    const next = resizeGrid(grid('bd ~ sd ~ bd bd sd ~'), 16, 'spread');
    expect(serializeStepGrid(next)).toBe('bd ~ ~ ~ sd ~ ~ ~ bd ~ bd ~ sd ~ ~ ~');
  });

  it('4→8 then 8→4 round-trips', () => {
    const up = resizeGrid(grid('bd ~ sd ~'), 8, 'spread');
    expect(serializeStepGrid(up)).toBe('bd ~ ~ ~ sd ~ ~ ~');
    const back = resizeGrid(up, 4, 'spread');
    expect(serializeStepGrid(back)).toBe('bd ~ sd ~');
  });

  it('16→8 quantizes off-grid hits instead of dropping them', () => {
    // hit on step 5 (an off-8th 16th) survives, quantized to new step 2
    const next = resizeGrid(grid('bd ~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~'), 8, 'spread');
    expect(serializeStepGrid(next)).toBe('bd ~ sd ~ ~ ~ ~ ~');
  });

  it('keeps stacks intact when spreading', () => {
    const next = resizeGrid(grid('[bd,hh] ~ sd ~'), 8, 'spread');
    expect(serializeStepGrid(next)).toBe('[bd,hh] ~ ~ ~ sd ~ ~ ~');
  });
});

describe('grid resize — pad (keep step indices)', () => {
  it('8→16 appends rests', () => {
    const next = resizeGrid(grid('bd ~ sd ~ bd bd sd ~'), 16, 'pad');
    expect(serializeStepGrid(next)).toBe('bd ~ sd ~ bd bd sd ~ ~ ~ ~ ~ ~ ~ ~ ~');
  });

  it('16→8 truncates', () => {
    const next = resizeGrid(grid('bd ~ sd ~ bd bd sd ~ hh hh hh hh hh hh hh hh'), 8, 'pad');
    expect(serializeStepGrid(next)).toBe('bd ~ sd ~ bd bd sd ~');
  });
});

describe('roll resize — spread', () => {
  it('8→16 doubles starts and durations', () => {
    const next = resizeRoll({ steps: 8, notes: [{ pitch: 'c3', start: 2, duration: 2 }] }, 16, 'spread');
    expect(next.notes).toEqual([{ pitch: 'c3', start: 4, duration: 4 }]);
  });

  it('16→8 halves and keeps at least duration 1', () => {
    const next = resizeRoll({ steps: 16, notes: [{ pitch: 'c3', start: 4, duration: 1 }] }, 8, 'spread');
    expect(next.notes).toEqual([{ pitch: 'c3', start: 2, duration: 1 }]);
  });

  it('dedupes same-pitch collisions when downsampling', () => {
    const next = resizeRoll(
      {
        steps: 16,
        notes: [
          { pitch: 'c3', start: 0, duration: 1 },
          { pitch: 'c3', start: 1, duration: 1 },
        ],
      },
      8,
      'spread',
    );
    expect(next.notes).toEqual([{ pitch: 'c3', start: 0, duration: 1 }]);
  });
});

describe('roll resize — pad', () => {
  it('truncates notes past the new end', () => {
    const next = resizeRoll(
      {
        steps: 16,
        notes: [
          { pitch: 'c3', start: 2, duration: 8 },
          { pitch: 'e3', start: 12, duration: 2 },
        ],
      },
      8,
      'pad',
    );
    expect(next.notes).toEqual([{ pitch: 'c3', start: 2, duration: 6 }]);
  });
});
