import { describe, expect, it } from 'vitest';
import { classifySound, prettyBank } from '@/lib/strudel/sounds';

describe('sound classification', () => {
  it('classifies bare drum codes', () => {
    const info = classifySound('bd', { type: 'sample', samples: ['a.wav', 'b.wav'] });
    expect(info).toMatchObject({ kind: 'drum', code: 'bd', bank: null, label: 'bass drum', variants: 2 });
  });

  it('classifies bank-prefixed drum hits with pretty labels', () => {
    const info = classifySound('RolandTR909_bd', { type: 'sample', samples: ['a.wav'] });
    expect(info).toMatchObject({ kind: 'drum', code: 'bd', bank: 'RolandTR909' });
    expect(info.label).toBe('Roland TR909 · bass drum');
  });

  it('classifies synths as melodic', () => {
    expect(classifySound('sawtooth', { type: 'synth' }).kind).toBe('melodic');
  });

  it('classifies note-mapped samplers (piano, vcsl) as melodic', () => {
    expect(classifySound('piano', { type: 'sample', samples: { c3: 'c3.wav', e3: 'e3.wav' } }).kind).toBe('melodic');
  });

  it('classifies one-shot sample packs as misc', () => {
    expect(classifySound('casio', { type: 'sample', samples: ['a.wav', 'b.wav', 'c.wav'] }).kind).toBe('misc');
  });

  it('does not mistake non-drum suffixes for drum hits', () => {
    expect(classifySound('ace_tone', { type: 'sample', samples: ['a.wav'] }).kind).toBe('misc');
  });

  it('prettifies bank names', () => {
    expect(prettyBank('RolandTR909')).toBe('Roland TR909');
    expect(prettyBank('akai_linn')).toBe('akai linn');
  });
});
