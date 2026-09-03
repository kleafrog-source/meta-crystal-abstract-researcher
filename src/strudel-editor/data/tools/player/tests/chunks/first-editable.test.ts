import { describe, expect, it } from 'vitest';
import { detectChunk, firstEditablePos } from '@/lib/chunks/detect';
import { recognizeArrangement } from '@/lib/timeline/recognize';
import { STARTER_CODE } from '@/lib/songs/starter';

describe('firstEditablePos', () => {
  it('lands a plain editable statement on the statement itself', () => {
    expect(firstEditablePos('$: s("bd sd")')).toBe(0);
  });

  it('skips uneditable statements', () => {
    const doc = 'setcps(0.5)\n$: s("bd sd")';
    expect(firstEditablePos(doc)).toBe(doc.indexOf('$:'));
  });

  it('returns null when nothing is editable', () => {
    expect(firstEditablePos('setcps(0.5)')).toBeNull();
  });

  it('lands a pickRestart voice on its first editable variant', () => {
    const pos = firstEditablePos(STARTER_CODE)!;
    expect(pos).toBe(STARTER_CODE.indexOf('s("bd ~ sd ~'));
    const chunk = detectChunk(STARTER_CODE, pos)!;
    expect(chunk.label).toBe('drums');
    expect(chunk.nested?.key).toBe('verse');
    expect(chunk.type).toBe('drums');
  });

  it('restricts to a range — a lane click finds that voice\'s first variant', () => {
    const arr = recognizeArrangement(STARTER_CODE)!;
    const keys = arr.voices.find((v) => v.label === 'keys')!;
    const pos = firstEditablePos(STARTER_CODE, keys.statementRange)!;
    const chunk = detectChunk(STARTER_CODE, pos)!;
    expect(chunk.label).toBe('keys');
    expect(chunk.nested?.key).toBe('pads');
    expect(chunk.type).toBe('melody');
  });
});
