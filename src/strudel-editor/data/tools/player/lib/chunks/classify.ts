import type { ChunkInfo } from './detect';

export type ChunkType = 'drums' | 'melody' | 'unknown';

/** Standard tidal-drum-machines sound names (bank-prefixed via .bank()). */
export const DRUM_SOUNDS = new Set([
  'bd', // bass drum
  'sd', // snare
  'hh', // closed hat
  'oh', // open hat
  'cp', // clap
  'rim',
  'cr', // crash
  'rd', // ride
  'ht',
  'mt',
  'lt', // toms
  'sh', // shaker
  'cb', // cowbell
  'tb', // tambourine
  'perc',
  'misc',
  'fx',
]);

const SOUND_HEADS = new Set(['s', 'sound']);
const NOTE_HEADS = new Set(['note']);

/** word tokens in a mini string, ignoring `:variant` suffixes and numbers */
export function miniAtoms(mini: string): string[] {
  return mini.match(/[a-zA-Z][a-zA-Z0-9_]*/g) ?? [];
}

export function classifyChunk(chunk: Pick<ChunkInfo, 'headFn' | 'miniString' | 'chain'>): ChunkType {
  if (!chunk.headFn) return 'unknown';
  if (SOUND_HEADS.has(chunk.headFn) && chunk.miniString !== null) {
    const atoms = miniAtoms(chunk.miniString);
    if (atoms.length > 0 && atoms.every((a) => DRUM_SOUNDS.has(a))) return 'drums';
    return 'unknown';
  }
  if (NOTE_HEADS.has(chunk.headFn) && chunk.miniString !== null) return 'melody';
  if (chunk.headFn === 'n' && chunk.chain.some((c) => c.name === 'scale')) return 'melody';
  return 'unknown';
}
