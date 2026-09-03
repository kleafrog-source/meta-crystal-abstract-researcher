/**
 * Strict editable subset of timeline strings — the `"<a@4 b@8 ~>"` alternation
 * idiom that drives pickRestart song structures. Sibling philosophy to
 * lib/notation/parse.ts: a deliberately small grammar with a deterministic
 * parse ⇄ serialize round-trip; anything richer falls back to "edit as code".
 *
 *   timeline := '<' slot (ws slot)* '>'     (the entire trimmed string)
 *   slot     := token ('@' int)?
 *   token    := '~' | [0-9]+ | [A-Za-z_][A-Za-z0-9_]*
 *
 * `!n` repeats are deliberately NOT accepted: `a!3` restarts the picked
 * pattern every cycle while `a@3` holds it for three — collapsing one into
 * the other would silently change the music.
 */

export interface TimelineSlot {
  token: string;
  /** whole cycles this slot occupies */
  weight: number;
  /** offsets of the token text, relative to the string content start */
  tokenRange: [number, number];
  /** offsets of the full slot (token + weight suffix) */
  slotRange: [number, number];
}

export type TimelineParse =
  | { ok: true; slots: TimelineSlot[]; total: number }
  | { ok: false; reason: string };

const TOKEN_RE = /^(~|[0-9]+|[A-Za-z_][A-Za-z0-9_]*)$/;

export function parseTimelineString(src: string): TimelineParse {
  const open = src.indexOf('<');
  const close = src.lastIndexOf('>');
  if (open === -1 || close === -1 || close < open) {
    return { ok: false, reason: 'not a <...> alternation' };
  }
  if (src.slice(0, open).trim() !== '' || src.slice(close + 1).trim() !== '') {
    return { ok: false, reason: 'content outside the <...> alternation' };
  }
  const inner = src.slice(open + 1, close);
  const slots: TimelineSlot[] = [];
  let total = 0;
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const raw = m[0];
    const slotStart = open + 1 + m.index;
    const at = raw.indexOf('@');
    const tokenText = at === -1 ? raw : raw.slice(0, at);
    const weightText = at === -1 ? null : raw.slice(at + 1);
    if (!TOKEN_RE.test(tokenText)) {
      return { ok: false, reason: `token "${tokenText}" is beyond the editable subset` };
    }
    let weight = 1;
    if (weightText !== null) {
      if (!/^[0-9]+$/.test(weightText)) {
        return { ok: false, reason: `weight "@${weightText}" must be a whole number` };
      }
      weight = Number(weightText);
      if (weight < 1) return { ok: false, reason: 'weights must be at least 1' };
    }
    slots.push({
      token: tokenText,
      weight,
      tokenRange: [slotStart, slotStart + tokenText.length],
      slotRange: [slotStart, slotStart + raw.length],
    });
    total += weight;
  }
  if (slots.length === 0) return { ok: false, reason: 'empty alternation' };
  return { ok: true, slots, total };
}

/** Canonical form: single spaces, weight 1 omits the `@`. */
export function serializeTimelineSlots(slots: { token: string; weight: number }[]): string {
  return `<${slots.map((s) => (s.weight === 1 ? s.token : `${s.token}@${s.weight}`)).join(' ')}>`;
}
