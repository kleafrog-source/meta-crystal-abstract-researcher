import { describe, expect, it } from 'vitest';
import { recognizeArrangement } from '@/lib/timeline/recognize';
import {
  addVariant,
  deleteCycles,
  deleteSection,
  dragBoundary,
  duplicateSection,
  renameVariant,
  setCell,
  setSlotToken,
  type RangeEdit,
} from '@/lib/timeline/edits';

const DOC = `$: "<intro@4 verse@8 chorus@4>".pickRestart({
  intro: s("bd*4"),
  verse: s("bd(3,8), hh*8"),
  chorus: s("bd*4, cp*2"),
}).room(0.3)

$: "<~@4 0@2 1@10>".pickRestart([note("c2*2"), note("c2 g1")]).s("sawtooth")
`;

function apply(doc: string, edits: RangeEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.range[0] - a.range[0]);
  let out = doc;
  for (const e of sorted) out = out.slice(0, e.range[0]) + e.text + out.slice(e.range[1]);
  return out;
}

const arr = () => recognizeArrangement(DOC)!;

describe('dragBoundary', () => {
  it('transfers weight in every voice with an edge there', () => {
    // boundary 12: voice 1 has verse|chorus there; voice 2 has 0@2|1@10 at 6 only — untouched
    const result = dragBoundary(DOC, arr(), 12, -2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@4 verse@6 chorus@6>');
    expect(next).toContain('<~@4 0@2 1@10>'); // spanning voice untouched
    // totals invariant
    expect(recognizeArrangement(next)!.shared!.totalCycles).toBe(16);
  });

  it('clamps so no weight drops below 1', () => {
    // boundary 4: voice 1 intro@4|verse@8, voice 2 ~@4|0@2 → max +1 (0@2 → 1)
    const result = dragBoundary(DOC, arr(), 4, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@5 verse@7 chorus@4>');
    expect(next).toContain('<~@5 0 1@10>');
  });

  it('rewrites arrange() numeric literals', () => {
    const doc = `arrange([4, s("bd*4")], [8, s("hh*8")])`;
    const a = recognizeArrangement(doc)!;
    const result = dragBoundary(doc, a, 4, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(apply(doc, result.edits)).toBe(`arrange([6, s("bd*4")], [6, s("hh*8")])`);
  });

  it('fails on stale docs and locked boundaries', () => {
    expect(dragBoundary('other code', arr(), 4, 1).ok).toBe(false);
    const locked = `$: "<a b>".pickRestart({a: s("bd"), b: s("hh")})`;
    expect(dragBoundary(locked, recognizeArrangement(locked)!, 1, 1).ok).toBe(false);
  });
});

describe('setSlotToken', () => {
  it('repoints a slot and keeps the rest canonical', () => {
    const result = setSlotToken(DOC, arr(), 0, 2, 'intro');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(apply(DOC, result.edits)).toContain('<intro@4 verse@8 intro@4>');
  });

  it('accepts rests and rejects unknown variants', () => {
    const ok = setSlotToken(DOC, arr(), 0, 1, '~');
    expect(ok.ok).toBe(true);
    expect(setSlotToken(DOC, arr(), 0, 1, 'bridge').ok).toBe(false);
  });
});

describe('setCell', () => {
  it('splits spanning slots, preserving outside subdivisions', () => {
    const result = setCell(DOC, arr(), 0, 6, 10, 'chorus');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(apply(DOC, result.edits)).toContain('<intro@4 verse@2 chorus@4 verse@2 chorus@4>');
  });

  it('replaces fully covered slots with one assignment', () => {
    const result = setCell(DOC, arr(), 1, 0, 16, '1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(apply(DOC, result.edits)).toContain('"<1@16>"');
  });
});

describe('section ops', () => {
  // both voices need edges at the section bounds: use 0..4 (intro / ~)
  it('duplicates an aligned section in every voice', () => {
    const result = duplicateSection(DOC, arr(), 0, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@4 intro@4 verse@8 chorus@4>');
    expect(next).toContain('<~@4 ~@4 0@2 1@10>');
    expect(recognizeArrangement(next)!.shared!.totalCycles).toBe(20);
  });

  it('refuses when a voice spans the boundary', () => {
    // boundary 12 exists in voice 1 but voice 2's 1@10 spans it
    const result = deleteSection(DOC, arr(), 12, 16);
    expect(result.ok).toBe(false);
  });

  it('deletes an aligned section', () => {
    const result = deleteSection(DOC, arr(), 0, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<verse@8 chorus@4>');
    expect(next).toContain('<0@2 1@10>');
  });
});

describe('deleteCycles', () => {
  it('shrinks spanning slots to take one cycle out of the middle', () => {
    const result = deleteCycles(DOC, arr(), 6, 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@4 verse@7 chorus@4>');
    expect(next).toContain('<~@4 0@2 1@9>');
    expect(recognizeArrangement(next)!.shared!.totalCycles).toBe(15);
  });

  it('drops slots that fall entirely inside the window', () => {
    const result = deleteCycles(DOC, arr(), 4, 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@4 verse@6 chorus@4>');
    expect(next).toContain('<~@4 1@10>');
  });

  it('needs no slot edges at the endpoints, unlike deleteSection', () => {
    // voice 2's 1@10 spans cycle 12 — deleteSection refuses, this shrinks
    const result = deleteCycles(DOC, arr(), 12, 16);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@4 verse@8>');
    expect(next).toContain('<~@4 0@2 1@6>');
  });

  it('refuses to delete the whole song', () => {
    expect(deleteCycles(DOC, arr(), 0, 16).ok).toBe(false);
  });

  it('refuses stale docs and arrange() voices', () => {
    expect(deleteCycles('changed', arr(), 0, 1).ok).toBe(false);
    const doc = `arrange([4, s("bd*4")], [8, s("hh*8")])`;
    expect(deleteCycles(doc, recognizeArrangement(doc)!, 0, 1).ok).toBe(false);
  });
});

describe('variant ops', () => {
  it('renames a key and all its timeline tokens', () => {
    const result = renameVariant(DOC, arr(), 0, 'verse', 'main');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('<intro@4 main@8 chorus@4>');
    expect(next).toContain('main: s("bd(3,8), hh*8")');
    expect(next).not.toContain('verse');
  });

  it('adds a variant copying an existing one', () => {
    const result = addVariant(DOC, arr(), 0, 'verse2', 'verse');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = apply(DOC, result.edits);
    expect(next).toContain('verse2: s("bd(3,8), hh*8")');
    const reRecognized = recognizeArrangement(next)!;
    const v0 = reRecognized.voices[0].match;
    expect('variants' in v0 && v0.variants.map((v) => v.key)).toContain('verse2');
  });

  it('rejects array-form voices and duplicate keys', () => {
    expect(addVariant(DOC, arr(), 1, 'x').ok).toBe(false);
    expect(addVariant(DOC, arr(), 0, 'verse').ok).toBe(false);
    expect(renameVariant(DOC, arr(), 0, 'verse', 'chorus').ok).toBe(false);
  });
});
