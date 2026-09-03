import { describe, expect, it } from 'vitest';
import { isBlackKey, midiToPitch, pitchToMidi } from '@/lib/notation/pitch';

describe('pitch helpers', () => {
  it('round-trips canonical tokens', () => {
    for (const token of ['c3', 'cs3', 'd4', 'fs2', 'b5', 'a0']) {
      expect(midiToPitch(pitchToMidi(token)!)).toBe(token);
    }
  });

  it('normalizes accidental spellings', () => {
    expect(pitchToMidi('c#3')).toBe(pitchToMidi('cs3'));
    expect(pitchToMidi('eb3')).toBe(pitchToMidi('ds3'));
    expect(pitchToMidi('C3')).toBe(pitchToMidi('c3'));
  });

  it('rejects junk', () => {
    expect(pitchToMidi('bd')).toBeNull();
    expect(pitchToMidi('h3')).toBeNull();
    expect(pitchToMidi('c')).toBeNull();
  });

  it('knows black keys', () => {
    expect(isBlackKey(pitchToMidi('cs3')!)).toBe(true);
    expect(isBlackKey(pitchToMidi('c3')!)).toBe(false);
  });
});
