import { describe, expect, it } from 'vitest';
import { parsePianoRoll } from '@/lib/notation/parse';
import { serializePianoRoll } from '@/lib/notation/serialize';
import { placeNote } from '@/lib/notation/place';

function roll(mini: string) {
  const parsed = parsePianoRoll(mini);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.model;
}

describe('placeNote overlap resolution', () => {
  it('trims a sustained note so the new note fits (post-spread-resize case)', () => {
    const model = roll('c3@4 e3@4 g3@4 b3@4');
    const next = placeNote(model, 'd3', 2, 1);
    expect(serializePianoRoll(next)).toBe('c3@2 d3 ~ e3@4 g3@4 b3@4');
  });

  it('joins a chord at an existing group start, adopting its duration', () => {
    const model = roll('c3@4 g3@4');
    const next = placeNote(model, 'e3', 0, 1);
    expect(serializePianoRoll(next)).toBe('[c3,e3]@4 g3@4');
  });

  it('caps the new note at the next group', () => {
    const model = roll('~ ~ ~ ~ e3@4');
    const next = placeNote(model, 'c3', 0, 8);
    expect(serializePianoRoll(next)).toBe('c3@4 e3@4');
  });

  it('caps the new note at the grid end on an empty roll', () => {
    const next = placeNote({ steps: 8, notes: [] }, 'c3', 6, 5);
    expect(next.notes).toEqual([{ pitch: 'c3', start: 6, duration: 2 }]);
    expect(serializePianoRoll(next)).toBe('~ ~ ~ ~ ~ ~ c3@2');
  });

  it('trims every note of a sustained chord consistently', () => {
    const model = roll('[c3,e3]@4 g3@4');
    const next = placeNote(model, 'd3', 2, 1);
    expect(serializePianoRoll(next)).toBe('[c3,e3]@2 d3 ~ g3@4');
  });

  it('always yields a serializable (tiling) layout', () => {
    const model = roll('c3@4 e3@4 g3@4 b3@4');
    for (let start = 0; start < model.steps; start++) {
      for (const duration of [1, 3, 16]) {
        expect(serializePianoRoll(placeNote(model, 'a3', start, duration))).not.toBeNull();
      }
    }
  });
});
