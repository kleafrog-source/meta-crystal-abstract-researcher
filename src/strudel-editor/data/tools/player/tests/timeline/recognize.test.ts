import { describe, expect, it } from 'vitest';
import { recognizeArrangement } from '@/lib/timeline/recognize';
import { detectChunk } from '@/lib/chunks/detect';
import { CORONA } from '../fixtures/corona';

const TWO_VOICES = `$: "<intro@4 verse@8 chorus@4>".pickRestart({
  intro: s("bd*4"),
  verse: s("bd(3,8), hh*8"),
  chorus: s("bd*4, cp*2"),
}).room(0.3)

$: "<~@4 0@2 1@10>".pickRestart([note("c2*2"), note("c2 g1")]).s("sawtooth")
`;

describe('recognizeArrangement', () => {
  it('recognizes object- and array-form pickRestart voices', () => {
    const arr = recognizeArrangement(TWO_VOICES)!;
    expect(arr.voices).toHaveLength(2);
    expect(arr.voices[0].match.kind).toBe('pickRestart');
    expect(arr.voices[0].laneId).toBe('stmt:0');
    expect(arr.voices[1].laneId).toBe('stmt:1');
    const v0 = arr.voices[0].match;
    expect('variants' in v0 && v0.variants.map((v) => v.key)).toEqual(['intro', 'verse', 'chorus']);
  });

  it('builds the shared timeline as the union of cut points', () => {
    const arr = recognizeArrangement(TWO_VOICES)!;
    expect(arr.shared).not.toBeNull();
    expect(arr.shared!.totalCycles).toBe(16);
    expect(arr.shared!.boundaries).toEqual([4, 6, 12]);
    expect(arr.shared!.sections).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 6 },
      { start: 6, end: 12 },
      { start: 12, end: 16 },
    ]);
  });

  it('recognizes the editable Corona voices and skips the rest', () => {
    const arr = recognizeArrangement(CORONA)!;
    // lead, bass, and sawtooth voices have plain int timelines; the strings
    // voice roots on an identifier and the drums timeline uses [2,3] chords
    expect(arr.voices).toHaveLength(3);
    expect(arr.voices.map((v) => v.laneId)).toEqual(['stack:3:0', 'stack:3:2', 'stack:3:3']);
    expect(arr.shared).not.toBeNull();
    expect(arr.shared!.totalCycles).toBe(54);
  });

  it('recognizes arrange() voices', () => {
    const doc = `arrange([4, s("bd*4")], [8, s("bd(3,8), hh*8")]).room(0.5)`;
    const arr = recognizeArrangement(doc)!;
    expect(arr.voices).toHaveLength(1);
    expect(arr.voices[0].match.kind).toBe('arrange');
    expect(arr.voices[0].match.totalCycles).toBe(12);
  });

  it('rejects out-of-range array tokens and unknown keys', () => {
    expect(recognizeArrangement('"<0 5>".pickRestart([s("bd")])')!.voices).toHaveLength(0);
    expect(recognizeArrangement('"<a b>".pickRestart({a: s("bd")})')!.voices).toHaveLength(0);
  });

  it('returns null while the doc does not parse', () => {
    expect(recognizeArrangement('"<a b>".pickRestart(')).toBeNull();
  });
});

describe('nested chunk detection', () => {
  it('returns the variant chunk when the cursor is inside it', () => {
    const pos = TWO_VOICES.indexOf('bd(3,8)');
    const chunk = detectChunk(TWO_VOICES, pos)!;
    expect(chunk.nested).toEqual({ key: 'verse', container: 'pickRestart' });
    expect(TWO_VOICES.slice(...chunk.statementRange)).toBe('s("bd(3,8), hh*8")');
    expect(chunk.type).toBe('drums');
    expect(chunk.miniString).toBe('bd(3,8), hh*8');
  });

  it('returns the whole statement when the cursor is on the timeline string', () => {
    const pos = TWO_VOICES.indexOf('intro@4');
    const chunk = detectChunk(TWO_VOICES, pos)!;
    expect(chunk.nested).toBeUndefined();
    expect(chunk.statementRange[0]).toBe(0);
  });

  it('works for array variants inside the Corona stack', () => {
    const pos = CORONA.indexOf('"2 ~@2 2 ~@2 2 ~@3');
    const chunk = detectChunk(CORONA, pos + 2)!;
    expect(chunk.nested?.container).toBe('pickRestart');
    expect(chunk.nested?.key).toBe('0');
  });

  it('returns arrange() slot patterns as nested chunks', () => {
    const doc = `arrange([4, s("bd*4")], [8, note("c3 e3")])`;
    const chunk = detectChunk(doc, doc.indexOf('bd*4'))!;
    expect(chunk.nested).toEqual({ key: '0', container: 'arrange' });
    expect(chunk.type).toBe('drums');
  });
});
