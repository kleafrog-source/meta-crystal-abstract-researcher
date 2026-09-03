import { describe, expect, it } from 'vitest';
import { parsePianoRoll, parseStepGrid } from '@/lib/notation/parse';
import { serializePianoRoll, serializeStepGrid } from '@/lib/notation/serialize';

describe('step grid round-trip', () => {
  const canonical = [
    'bd ~ sd ~ bd bd sd ~',
    'hh hh hh hh',
    'bd ~ [bd,hh] sd',
    'bd:3 ~ sd:1 ~',
    '~ ~ ~ ~',
    '[bd,sd,hh] ~ ~ ~',
  ];

  it.each(canonical)('serialize(parse("%s")) === input', (mini) => {
    const parsed = parseStepGrid(mini);
    expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
    if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe(mini);
  });

  it('normalizes irregular whitespace to canonical form', () => {
    const parsed = parseStepGrid('  bd   ~  sd ~ ');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe('bd ~ sd ~');
  });

  it('parse(serialize(model)) preserves the model', () => {
    const model = {
      steps: 4,
      lanes: [
        { sound: 'bd', cells: [true, false, true, false] },
        { sound: 'hh', cells: [true, true, true, true] },
      ],
    };
    const reparsed = parseStepGrid(serializeStepGrid(model));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      // lane order is first-appearance; both lanes start at step 0 → order kept
      expect(reparsed.model).toEqual(model);
    }
  });

  it.each(['bd*2 sd', 'bd <sd hh>', 'bd(3,8)', 'bd!2 sd', 'bd? sd', '{bd sd}', 'bd . sd', '[bd hh, sd]', '[[bd sd] hh]'])(
    'rejects unsupported syntax: %s',
    (mini) => {
      expect(parseStepGrid(mini).ok).toBe(false);
    },
  );

  it('rejects elongation in the drum grid', () => {
    expect(parseStepGrid('bd@2 sd').ok).toBe(false);
    expect(parseStepGrid('[bd@2 hh] sd').ok).toBe(false);
    expect(parseStepGrid('<bd@2 sd>').ok).toBe(false);
  });

  describe('`,`-stacks (top level)', () => {
    const canonical = ['bd ~ sd ~, hh hh hh hh', 'bd ~ [bd,sd] ~, ~ oh ~ oh', 'bd, sd, hh'];

    it.each(canonical)('serialize(parse("%s")) === input', (mini) => {
      const parsed = parseStepGrid(mini);
      expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
      if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe(mini);
    });

    it('keeps lanes attached to their parts', () => {
      const parsed = parseStepGrid('bd ~ sd ~, hh hh hh hh');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.lanes.map((l) => [l.sound, l.part])).toEqual([
          ['bd', 0],
          ['sd', 0],
          ['hh', 1],
        ]);
      }
    });

    it('stretches mixed-length parts onto the common grid (normalizing)', () => {
      const parsed = parseStepGrid('bd sd, hh hh hh hh');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.steps).toBe(4);
        expect(serializeStepGrid(parsed.model)).toBe('bd ~ sd ~, hh hh hh hh');
      }
    });

    it('rejects empty parts', () => {
      expect(parseStepGrid('bd, ').ok).toBe(false);
    });
  });

  describe('`<...>` alternation (one slot per bar)', () => {
    const canonical = ['<[bd ~ sd ~] [bd bd sd ~]>', '<bd sd>', '<[bd ~ [bd,sd] ~] ~>'];

    it.each(canonical)('serialize(parse("%s")) === input', (mini) => {
      const parsed = parseStepGrid(mini);
      expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
      if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe(mini);
    });

    it('exposes bars and a uniform column grid', () => {
      const parsed = parseStepGrid('<[bd ~ sd ~] [bd bd sd ~]>');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.bars).toBe(2);
        expect(parsed.model.steps).toBe(8);
      }
    });

    it('subdivides bars by the lcm across slots', () => {
      const parsed = parseStepGrid('<bd [sd sd]>');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.steps).toBe(4);
        expect(serializeStepGrid(parsed.model)).toBe('<[bd ~] [sd sd]>');
      }
    });

    it('rejects a stack inside an alternation', () => {
      expect(parseStepGrid('<bd sd, hh hh>').ok).toBe(false);
    });
  });

  describe('sub-sequence expansion', () => {
    it('expands [hh hh] onto a finer uniform grid', () => {
      const parsed = parseStepGrid('bd [hh hh] sd hh');
      expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
      if (parsed.ok) {
        expect(parsed.model.steps).toBe(8);
        expect(serializeStepGrid(parsed.model)).toBe('bd ~ hh hh sd ~ hh ~');
      }
    });

    it('expands by the LCM across mixed subdivisions', () => {
      const parsed = parseStepGrid('bd [hh hh hh] sd hh');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.steps).toBe(12);
        expect(serializeStepGrid(parsed.model)).toBe('bd ~ ~ hh hh hh sd ~ ~ hh ~ ~');
      }
    });

    it('keeps rests inside sub-sequences', () => {
      const parsed = parseStepGrid('[bd ~] hh');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe('bd ~ hh ~');
    });

    it('mixes stacks and sub-sequences', () => {
      const parsed = parseStepGrid('bd [hh,oh] [hh hh]');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe('bd ~ [hh,oh] ~ hh hh');
    });

    it('treats a single-token group as a bare atom', () => {
      const parsed = parseStepGrid('[bd] hh');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(serializeStepGrid(parsed.model)).toBe('bd hh');
    });

    it('rejects expansions past 64 steps', () => {
      expect(parseStepGrid('[bd bd bd bd bd bd bd] [bd bd bd bd bd]').ok).toBe(false);
    });
  });

  it('empty pattern → zero steps', () => {
    const parsed = parseStepGrid('');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.model.steps).toBe(0);
  });
});

describe('piano roll round-trip', () => {
  const canonical = [
    'c3 e3 g3 b3',
    'c3 ~ e3 ~',
    'c3@2 e3 g3',
    '[c3,e3,g3] ~ [d3,f3] ~',
    '[c3,e3]@2 g3 ~',
    '~ ~ ~ ~',
    'cs3 eb3 g3 ~',
  ];

  it.each(canonical)('serialize(parse("%s")) === input', (mini) => {
    const parsed = parsePianoRoll(mini);
    expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
    if (parsed.ok) expect(serializePianoRoll(parsed.model)).toBe(mini);
  });

  it('parses elongation into duration', () => {
    const parsed = parsePianoRoll('c3@3 e3');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.model.steps).toBe(4);
      expect(parsed.model.notes).toEqual([
        { pitch: 'c3', start: 0, duration: 3 },
        { pitch: 'e3', start: 3, duration: 1 },
      ]);
    }
  });

  it('rejects non-note atoms', () => {
    expect(parsePianoRoll('bd sd').ok).toBe(false);
  });

  it('expands sub-sequences, scaling whole-step notes up', () => {
    const parsed = parsePianoRoll('c3 [d3 e3]');
    expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
    if (parsed.ok) {
      expect(parsed.model.steps).toBe(4);
      expect(parsed.model.notes).toEqual([
        { pitch: 'c3', start: 0, duration: 2 },
        { pitch: 'd3', start: 2, duration: 1 },
        { pitch: 'e3', start: 3, duration: 1 },
      ]);
      expect(serializePianoRoll(parsed.model)).toBe('c3@2 d3 e3');
    }
  });

  it('expands sub-sequences under elongation', () => {
    const parsed = parsePianoRoll('[c3 e3]@2 g3');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.model.steps).toBe(6);
      expect(parsed.model.notes).toEqual([
        { pitch: 'c3', start: 0, duration: 2 },
        { pitch: 'e3', start: 2, duration: 2 },
        { pitch: 'g3', start: 4, duration: 2 },
      ]);
    }
  });

  it('serialize returns null for overlapping notes', () => {
    expect(
      serializePianoRoll({
        steps: 4,
        notes: [
          { pitch: 'c3', start: 0, duration: 3 },
          { pitch: 'e3', start: 1, duration: 1 },
        ],
      }),
    ).toBeNull();
  });

  it('serialize returns null for chord notes with mismatched durations', () => {
    expect(
      serializePianoRoll({
        steps: 4,
        notes: [
          { pitch: 'c3', start: 0, duration: 2 },
          { pitch: 'e3', start: 0, duration: 1 },
        ],
      }),
    ).toBeNull();
  });

  it('fills trailing gaps with rests', () => {
    expect(serializePianoRoll({ steps: 4, notes: [{ pitch: 'c3', start: 1, duration: 1 }] })).toBe('~ c3 ~ ~');
  });

  describe('`<...>` alternation (one slot per bar)', () => {
    const canonical = [
      '<[a3,c4,e4] [a3,c4,f4] [g3,c4,e4] [g3,b3,d4]>',
      '<[e5 ~ d5 c5] [c5 ~ a4 ~]>',
      '<c3@2 e3>',
      '<[c3@2 e3 g3] [d3 ~ ~ ~]>',
      '<[a3,c4,e4]@2 [g3,b3,d4]>',
      '<c3 ~ e3>',
    ];

    it.each(canonical)('serialize(parse("%s")) === input', (mini) => {
      const parsed = parsePianoRoll(mini);
      expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
      if (parsed.ok) expect(serializePianoRoll(parsed.model)).toBe(mini);
    });

    it('one chord per bar: bars count, whole-bar durations', () => {
      const parsed = parsePianoRoll('<[a3,c4,e4] [a3,c4,f4]>');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.bars).toBe(2);
        expect(parsed.model.steps).toBe(2);
        expect(parsed.model.notes).toEqual([
          { pitch: 'a3', start: 0, duration: 1 },
          { pitch: 'c4', start: 0, duration: 1 },
          { pitch: 'e4', start: 0, duration: 1 },
          { pitch: 'a3', start: 1, duration: 1 },
          { pitch: 'c4', start: 1, duration: 1 },
          { pitch: 'f4', start: 1, duration: 1 },
        ]);
      }
    });

    it('a slot `@n` holds it for n bars', () => {
      const parsed = parsePianoRoll('<c3@2 e3>');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.bars).toBe(3);
        expect(parsed.model.notes).toEqual([
          { pitch: 'c3', start: 0, duration: 2 },
          { pitch: 'e3', start: 2, duration: 1 },
        ]);
      }
    });

    it('bars subdivide by the lcm across slots', () => {
      const parsed = parsePianoRoll('<c3 [e3 g3]>');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.model.steps).toBe(4);
        expect(parsed.model.bars).toBe(2);
        expect(serializePianoRoll(parsed.model)).toBe('<c3 [e3 g3]>');
      }
    });

    it('serialize returns null for a note crossing a bar line partially', () => {
      expect(
        serializePianoRoll({
          steps: 8,
          bars: 2,
          notes: [{ pitch: 'c3', start: 2, duration: 4 }],
        }),
      ).toBeNull();
    });

    it('group-part elongation in flat mode normalizes to `@`-columns', () => {
      const parsed = parsePianoRoll('[c3@2 e3] g3');
      expect(parsed.ok, !parsed.ok ? parsed.reason : '').toBe(true);
      if (parsed.ok) {
        expect(parsed.model.steps).toBe(6);
        expect(serializePianoRoll(parsed.model)).toBe('c3@2 e3 g3@3');
      }
    });
  });
});
