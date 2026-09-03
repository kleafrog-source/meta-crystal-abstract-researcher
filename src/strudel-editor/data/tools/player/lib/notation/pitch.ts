/** Pitch token ↔ midi number helpers for the piano roll. Sharps use `s` (cs3). */

const PITCH_CLASSES = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
const CLASS_OF: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "cs3" / "c#3" / "eb4" → midi (c3 = 48, strudel convention: c5 = 72 = middle C area) */
export function pitchToMidi(token: string): number | null {
  const m = token.toLowerCase().match(/^([a-g])([sb#]?)(\d)$/);
  if (!m) return null;
  const [, letter, accidental, octave] = m;
  let semitone = CLASS_OF[letter];
  if (accidental === 's' || accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  return (parseInt(octave, 10) + 1) * 12 + ((semitone + 12) % 12);
}

export function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASSES[midi % 12]}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  return PITCH_CLASSES[midi % 12].endsWith('s');
}
