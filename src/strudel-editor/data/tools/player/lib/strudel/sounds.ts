/** Classify and label entries from superdough's soundMap for the browser. */
import { DRUM_SOUNDS } from '@/lib/chunks/classify';

export type SoundKind = 'drum' | 'melodic' | 'misc';

export interface SoundInfo {
  /** registered name, what goes in the code (e.g. "RolandTR909_bd") */
  name: string;
  kind: SoundKind;
  /** drum-machine bank prefix when present (e.g. "RolandTR909") */
  bank: string | null;
  /** bare drum code when this is a drum hit (e.g. "bd") */
  code: string | null;
  /** human-readable label */
  label: string;
  variants: number;
  type: string;
}

export const DRUM_LABELS: Record<string, string> = {
  bd: 'bass drum',
  sd: 'snare',
  hh: 'hi-hat (closed)',
  oh: 'hi-hat (open)',
  cp: 'clap',
  rim: 'rimshot',
  cr: 'crash',
  rd: 'ride',
  ht: 'high tom',
  mt: 'mid tom',
  lt: 'low tom',
  sh: 'shaker',
  cb: 'cowbell',
  tb: 'tambourine',
  perc: 'percussion',
  misc: 'misc hit',
  fx: 'fx hit',
};

/** "RolandTR909" → "Roland TR909", "akai_linn" → "akai linn" */
export function prettyBank(bank: string): string {
  return bank.replace(/_/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}

export interface KitInfo {
  /** null = the default samples (used when a line has no `.bank()`) */
  bank: string | null;
  label: string;
  /** drum codes this kit provides, in playing-surface order */
  pieces: string[];
}

const PIECE_ORDER = ['bd', 'sd', 'rim', 'cp', 'hh', 'oh', 'ht', 'mt', 'lt', 'cr', 'rd', 'sh', 'cb', 'tb', 'perc', 'misc', 'fx'];

/** Collapse per-piece drum sounds into one entry per kit. */
export function groupKits(sounds: SoundInfo[]): KitInfo[] {
  const byBank = new Map<string | null, Set<string>>();
  for (const sound of sounds) {
    if (sound.kind !== 'drum' || !sound.code) continue;
    const set = byBank.get(sound.bank) ?? new Set<string>();
    set.add(sound.code);
    byBank.set(sound.bank, set);
  }
  return [...byBank.entries()]
    .map(([bank, set]) => ({
      bank,
      label: bank ? prettyBank(bank) : 'default samples',
      pieces: [...set].sort((a, b) => PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b)),
    }))
    .sort((a, b) => (a.bank === null ? -1 : b.bank === null ? 1 : a.label.localeCompare(b.label)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifySound(name: string, data: any): SoundInfo {
  const variants = Array.isArray(data?.samples) ? data.samples.length : 0;
  const type = data?.type ?? 'sound';

  if (DRUM_SOUNDS.has(name)) {
    return { name, kind: 'drum', bank: null, code: name, label: DRUM_LABELS[name] ?? name, variants, type };
  }

  const bankMatch = name.match(/^(.+)_([a-z]+)$/);
  if (bankMatch && DRUM_SOUNDS.has(bankMatch[2])) {
    const [, bank, code] = bankMatch;
    return {
      name,
      kind: 'drum',
      bank,
      code,
      label: `${prettyBank(bank)} · ${DRUM_LABELS[code] ?? code}`,
      variants,
      type,
    };
  }

  // synths and note-mapped samplers (piano, vcsl instruments) are pitched
  const noteMapped = data?.samples && !Array.isArray(data.samples) && typeof data.samples === 'object';
  if (type === 'synth' || noteMapped) {
    return { name, kind: 'melodic', bank: null, code: null, label: name.replace(/_/g, ' '), variants, type };
  }

  return { name, kind: 'misc', bank: null, code: null, label: name.replace(/_/g, ' '), variants, type };
}
