import { describe, expect, it } from 'vitest';
import { angleWeightSum, detectLanes } from '@/lib/chunks/detect';
import { CORONA } from '../fixtures/corona';

const STARTER = `// kick & snare
$: s("bd ~ sd ~ bd bd sd ~").bank("RolandTR909")

// hats
$: s("hh hh hh hh hh hh hh hh").bank("RolandTR909").gain(0.6)

// keys
$: note("c3 e3 g3 b3 c4 b3 g3 e3").piano().room(0.4)
`;

describe('detectLanes', () => {
  it('one lane per top-level statement for simple songs', () => {
    const scan = detectLanes(STARTER)!;
    const rows = scan.lanes.filter((l) => l.kind === 'statement');
    expect(rows).toHaveLength(3);
    expect(rows[0].label).toContain('bd');
    expect(rows[2].label).toContain('c3');
  });

  it('explodes a statement-head stack into one lane per argument', () => {
    const scan = detectLanes(CORONA)!;
    const stackLanes = scan.lanes.filter((l) => l.kind === 'stackArg');
    expect(stackLanes).toHaveLength(5);
    // the stack call sits under a trailing .cpm(128/4) chain and starts with
    // `stack` on its own line — both must not confuse the walk
    const labels = stackLanes.map((l) => l.label);
    expect(labels).toContain('gm_lead_1_square');
    expect(labels).toContain('gm_synth_strings_1');
  });

  it('collects const definitions and reference graphs', () => {
    const scan = detectLanes(CORONA)!;
    const defs = scan.lanes.filter((l) => l.kind === 'definition');
    expect(defs.map((d) => d.label)).toEqual(['as', 'crdpart']);
    // the bass voice references crdpart (chord + rootNotes)
    const bass = scan.lanes.find((l) => l.label === 'gm_synth_bass_1');
    expect(bass?.refs).toContain('crdpart');
  });

  it('derives the 54-cycle horizon hint from the shared timelines', () => {
    const scan = detectLanes(CORONA)!;
    expect(scan.horizonHint).toBe(54);
  });

  it('returns null for unparseable docs', () => {
    expect(detectLanes('s("bd"')).toBeNull();
  });

  it('keeps setup statements as lanes (hidden later by zero activity)', () => {
    const scan = detectLanes(CORONA)!;
    const setup = scan.lanes.find((l) => l.label === 'setDefaultVoicings');
    expect(setup?.kind).toBe('statement');
  });
});

describe('angleWeightSum', () => {
  it('sums weights, repeats, and bare tokens', () => {
    expect(angleWeightSum('<~ 0@10 1@24 0@19>')).toBe(54);
    expect(angleWeightSum('<a b c>')).toBe(3);
    expect(angleWeightSum('<a@2 b!3>')).toBe(5);
    expect(angleWeightSum('<[2,3] ~@10 0@6>')).toBe(17);
  });

  it('rejects non-alternation strings', () => {
    expect(angleWeightSum('a b c')).toBeNull();
    expect(angleWeightSum('[a b]')).toBeNull();
    expect(angleWeightSum('bd ~ sd ~')).toBeNull();
  });

  it('handles nested groups as single tokens', () => {
    expect(angleWeightSum('<a [b c]@2>')).toBe(3);
    expect(angleWeightSum('<[a <b c>]@4 d>')).toBe(5);
  });
});
