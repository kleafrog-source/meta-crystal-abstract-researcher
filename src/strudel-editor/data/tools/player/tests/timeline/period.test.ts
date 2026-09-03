import { describe, expect, it } from 'vitest';
import { detectPeriod, type OnsetInput } from '@/lib/timeline/period';

/** kick every cycle + a bass note cycling through `bassPeriod` values */
function loopOnsets(cycles: number, bassPeriod: number): OnsetInput[] {
  const onsets: OnsetInput[] = [];
  for (let c = 0; c < cycles; c++) {
    onsets.push({ n: c, d: 1, key: 'drums¶bd' });
    onsets.push({ n: 2 * c + 1, d: 2, key: 'drums¶sd' });
    onsets.push({ n: c, d: 1, key: `bass¶${c % bassPeriod}` });
  }
  return onsets;
}

describe('detectPeriod', () => {
  it('finds an integer period', () => {
    const period = detectPeriod(loopOnsets(64, 4), 64);
    expect(period).not.toBeNull();
    expect(period!.cycles).toEqual({ n: 4, d: 1 });
    expect(period!.repeats).toBe(16);
    expect(period!.confidence).toBe('exact');
  });

  it('finds a rational period (cpm-style scaling)', () => {
    // scale the 4-cycle loop by 15/8 → period 60/8 = 15/2 cycles
    const scaled = loopOnsets(64, 4).map((o) => ({ ...o, n: o.n * 15, d: o.d * 8 }));
    const period = detectPeriod(scaled, 120);
    expect(period).not.toBeNull();
    expect(period!.cycles).toEqual({ n: 15, d: 2 });
    expect(period!.repeats).toBe(16);
  });

  it('reports null when the structure never repeats', () => {
    const onsets: OnsetInput[] = [];
    for (let c = 0; c < 64; c++) onsets.push({ n: c, d: 1, key: `melody¶${c}` });
    expect(detectPeriod(onsets, 64)).toBeNull();
  });

  it('requires two full repeats', () => {
    // 54-cycle structure observed over only 64 cycles
    const onsets = loopOnsets(64, 54);
    expect(detectPeriod(onsets, 64)).toBeNull();
    // …but 128 observed cycles is enough
    const period = detectPeriod(loopOnsets(128, 54), 128);
    expect(period).not.toBeNull();
    expect(period!.cycles).toEqual({ n: 54, d: 1 });
  });

  it('accepts a truncated final repeat', () => {
    const period = detectPeriod(loopOnsets(10, 4), 10);
    expect(period).not.toBeNull();
    expect(period!.cycles).toEqual({ n: 4, d: 1 });
    expect(period!.repeats).toBe(2);
  });

  it('finds sub-cycle periods for plain loops', () => {
    const onsets: OnsetInput[] = [];
    for (let c = 0; c < 8; c++)
      for (let q = 0; q < 4; q++) onsets.push({ n: 4 * c + q, d: 4, key: 'hh¶hh' });
    const period = detectPeriod(onsets, 8);
    expect(period).not.toBeNull();
    expect(period!.cycles).toEqual({ n: 1, d: 4 });
  });

  it('handles degenerate inputs', () => {
    expect(detectPeriod([], 64)).toBeNull();
    expect(detectPeriod([{ n: 0, d: 1, key: 'x' }], 64)).toBeNull();
  });

  it('treats simultaneous onsets as one group signature', () => {
    // chord = 3 simultaneous notes; the multiset must match across repeats
    const onsets: OnsetInput[] = [];
    for (let c = 0; c < 16; c++) {
      const chord = c % 2 === 0 ? ['c', 'e', 'g'] : ['f', 'a', 'c'];
      for (const note of chord) onsets.push({ n: c, d: 1, key: `keys¶${note}` });
    }
    const period = detectPeriod(onsets, 16);
    expect(period).not.toBeNull();
    expect(period!.cycles).toEqual({ n: 2, d: 1 });
  });
});
