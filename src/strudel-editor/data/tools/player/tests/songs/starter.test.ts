import { describe, expect, it } from 'vitest';
import { STARTER_CODE } from '@/lib/songs/starter';
import { recognizeArrangement } from '@/lib/timeline/recognize';
import { detectAllChunks, detectChunk } from '@/lib/chunks/detect';
import { parsePianoRoll, parseStepGrid } from '@/lib/notation/parse';

describe('STARTER_CODE', () => {
  it('is a fully recognized arrangement with a shared timeline', () => {
    const arr = recognizeArrangement(STARTER_CODE)!;
    expect(arr).not.toBeNull();
    expect(arr.voices).toHaveLength(5);
    expect(arr.voices.map((v) => v.label)).toEqual(['drums', 'hats', 'bass', 'keys', 'lead']);
    expect(arr.shared).not.toBeNull();
    expect(arr.shared!.totalCycles).toBe(40);
    // every voice cuts on the same intro/verse/chorus/verse/chorus/outro grid
    expect(arr.shared!.boundaries).toEqual([4, 12, 20, 28, 36]);
    expect(arr.shared!.sections).toHaveLength(6);
  });

  it('keeps every variant granular-editable in the sequencer / piano roll', () => {
    const arr = recognizeArrangement(STARTER_CODE)!;
    for (const voice of arr.voices) {
      expect('variants' in voice.match).toBe(true);
      if (!('variants' in voice.match)) continue;
      for (const variant of voice.match.variants) {
        const chunk = detectChunk(STARTER_CODE, variant.valueRange[0] + 1)!;
        expect(chunk?.nested, `${voice.label}.${variant.key} is a nested chunk`).toBeTruthy();
        expect(chunk.miniString, `${voice.label}.${variant.key} has a mini string`).not.toBeNull();
        if (chunk.type === 'drums') {
          const grid = parseStepGrid(chunk.miniString!);
          expect(grid.ok, `${voice.label}.${variant.key} step grid: ${!grid.ok ? grid.reason : ''}`).toBe(true);
        } else if (chunk.type === 'melody') {
          const roll = parsePianoRoll(chunk.miniString!);
          expect(roll.ok, `${voice.label}.${variant.key} piano roll: ${!roll.ok ? roll.reason : ''}`).toBe(true);
        } else {
          throw new Error(`${voice.label}.${variant.key} is not editable (type "${chunk.type}")`);
        }
      }
    }
  });

  it('keeps every voice editable as a chunk, with variants reachable by cursor', () => {
    expect(detectAllChunks(STARTER_CODE)).toHaveLength(5);
    const pos = STARTER_CODE.indexOf('"hh hh');
    const chunk = detectChunk(STARTER_CODE, pos)!;
    expect(chunk.nested).toEqual({ key: 'verse', container: 'pickRestart' });
    expect(chunk.label).toBe('hats');
  });
});
