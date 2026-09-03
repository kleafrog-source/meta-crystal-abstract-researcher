import { describe, expect, it } from 'vitest';
import { parseTimelineString, serializeTimelineSlots } from '@/lib/timeline/timelineString';

describe('parseTimelineString', () => {
  it('parses tokens, weights, and rests', () => {
    const parsed = parseTimelineString('<~ 0@10 1@24 0@19>');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.slots.map((s) => [s.token, s.weight])).toEqual([
      ['~', 1],
      ['0', 10],
      ['1', 24],
      ['0', 19],
    ]);
    expect(parsed.total).toBe(54);
  });

  it('reports exact source ranges', () => {
    const src = '<intro@4 verse@8>';
    const parsed = parseTimelineString(src);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [intro, verse] = parsed.slots;
    expect(src.slice(...intro.tokenRange)).toBe('intro');
    expect(src.slice(...intro.slotRange)).toBe('intro@4');
    expect(src.slice(...verse.slotRange)).toBe('verse@8');
  });

  it('round-trips canonical strings', () => {
    for (const src of ['<a@4 b@8>', '<~ 0@10 1@24 0@19>', '<intro verse@2 outro>']) {
      const parsed = parseTimelineString(src);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(serializeTimelineSlots(parsed.slots)).toBe(src);
    }
  });

  it('canonicalizes whitespace and weight-1 suffixes', () => {
    const parsed = parseTimelineString('<  a@4   b@1 >');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializeTimelineSlots(parsed.slots)).toBe('<a@4 b>');
  });

  it('rejects everything beyond the subset', () => {
    for (const src of ['a b c', '<a!3>', '<a [b c]>', '<a@0.5>', '<a@0>', '<>', '<a*2>', 'x <a b>']) {
      expect(parseTimelineString(src).ok, src).toBe(false);
    }
  });
});
