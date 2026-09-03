import { describe, expect, it } from 'vitest';
import { authorArrangement, generateVoice, validatePlan, type SectionSpec } from '@/lib/timeline/author';
import { recognizeArrangement } from '@/lib/timeline/recognize';
import { detectAllChunks } from '@/lib/chunks/detect';
import type { RangeEdit } from '@/lib/timeline/edits';

const STARTER = `// kick & snare
$: s("bd ~ sd ~ bd bd sd ~").bank("RolandTR909")

// hats
$: s("hh hh hh hh hh hh hh hh").bank("RolandTR909").gain(0.6)

// keys
$: note("c3 e3 g3 b3 c4 b3 g3 e3").piano().room(0.4)
`;

const PLAN: SectionSpec[] = [
  { name: 'intro', cycles: 4 },
  { name: 'verse', cycles: 8 },
  { name: 'chorus', cycles: 8 },
  { name: 'verse', cycles: 8 },
];

function apply(doc: string, edits: RangeEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.range[0] - a.range[0]);
  let out = doc;
  for (const e of sorted) out = out.slice(0, e.range[0]) + e.text + out.slice(e.range[1]);
  return out;
}

describe('generateVoice', () => {
  it('produces an object-form pickRestart recognized by Tier 2', () => {
    const code = generateVoice('s("bd*4").gain(0.8)', '$', PLAN);
    const arr = recognizeArrangement(code)!;
    expect(arr.voices).toHaveLength(1);
    expect(arr.voices[0].match.totalCycles).toBe(28);
    const match = arr.voices[0].match;
    // repeated section names collapse into one shared variant
    expect('variants' in match && match.variants.map((v) => v.key)).toEqual(['intro', 'verse', 'chorus']);
    expect(code).toContain('"<intro@4 verse@8 chorus@8 verse@8>"');
  });
});

describe('authorArrangement', () => {
  it('rewrites every included statement; comments survive; result round-trips', () => {
    const chunks = detectAllChunks(STARTER);
    expect(chunks).toHaveLength(3);
    const edits = authorArrangement(STARTER, chunks, PLAN)!;
    expect(edits).toHaveLength(3);
    const next = apply(STARTER, edits);

    expect(next).toContain('// kick & snare');
    expect(next).toContain('// keys');

    const arr = recognizeArrangement(next)!;
    expect(arr.voices).toHaveLength(3);
    expect(arr.shared).not.toBeNull();
    expect(arr.shared!.totalCycles).toBe(28);
    // all voices share the same plan, so the only boundaries are the plan's
    expect(arr.shared!.boundaries).toEqual([4, 12, 20]);
    // original expressions live inside the variants
    expect(next).toContain('intro: s("bd ~ sd ~ bd bd sd ~").bank("RolandTR909"),');
    expect(next).toContain('verse: note("c3 e3 g3 b3 c4 b3 g3 e3").piano().room(0.4),');
  });

  it('refuses stale chunks', () => {
    const chunks = detectAllChunks(STARTER);
    expect(authorArrangement('something else', chunks, PLAN)).toBeNull();
  });
});

describe('validatePlan', () => {
  it('accepts the default-style plans and rejects bad input', () => {
    expect(validatePlan(PLAN)).toBeNull();
    expect(validatePlan([])).not.toBeNull();
    expect(validatePlan([{ name: 'has space', cycles: 4 }])).not.toBeNull();
    expect(validatePlan([{ name: 'ok', cycles: 0 }])).not.toBeNull();
    expect(validatePlan([{ name: 'ok', cycles: 2.5 }])).not.toBeNull();
  });
});
