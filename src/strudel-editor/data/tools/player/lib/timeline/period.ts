/**
 * Song period detection from pattern onsets.
 *
 * Patterns are infinite, so "how long is the song" means "where does the
 * onset structure repeat". Onset times are exact rationals (strudel
 * Fractions), and `.cpm()` rescales them by an arbitrary rational at eval
 * time, so the period itself can be rational (e.g. 50.625 cycles) and no
 * fixed uniform grid is safe to bin into. Instead the onsets are grouped by
 * exact time and run-length encoded into tokens of (simultaneous-onset
 * signature, exact gap to the next group); the smallest repeating prefix of
 * that token string — found with the KMP prefix function, O(n) — is the
 * period. Equality is exact, so detection never drifts; genuinely
 * non-repeating (random) patterns simply report no period.
 */
import type { Frac, PeriodInfo } from './types';

/** A single onset: exact rational time plus a discrete signature key. */
export interface OnsetInput {
  /** time in cycles = n/d */
  n: number;
  d: number;
  /** discrete signature (lane id + value class) — continuous values excluded */
  key: string;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function reduce(n: number, d: number): Frac {
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(Math.abs(n), Math.abs(d));
  return { n: n / g, d: d / g };
}

/** exact a/b vs c/d comparison (cross products stay well under 2^53 here) */
function cmp(an: number, ad: number, bn: number, bd: number): number {
  return an * bd - bn * ad;
}

interface Group {
  n: number;
  d: number;
  key: string;
}

/** Group onsets by exact time; each group's key is the sorted multiset of onset keys. */
function groupOnsets(onsets: OnsetInput[]): Group[] {
  const sorted = [...onsets].sort((a, b) => cmp(a.n, a.d, b.n, b.d));
  const groups: Group[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i].n, sorted[i].d, sorted[j].n, sorted[j].d) === 0) j++;
    const keys = sorted
      .slice(i, j)
      .map((o) => o.key)
      .sort();
    groups.push({ n: sorted[i].n, d: sorted[i].d, key: keys.join('|') });
    i = j;
  }
  return groups;
}

/** KMP prefix function over an array of strings. */
function prefixFunction(tokens: string[]): number[] {
  const pi = new Array<number>(tokens.length).fill(0);
  for (let i = 1; i < tokens.length; i++) {
    let k = pi[i - 1];
    while (k > 0 && tokens[i] !== tokens[k]) k = pi[k - 1];
    if (tokens[i] === tokens[k]) k++;
    pi[i] = k;
  }
  return pi;
}

/**
 * Detect the smallest period (in cycles) of the onset structure observed over
 * `observedCycles`. Returns null when no period is established — fewer than
 * two full repeats observed, or the structure genuinely doesn't repeat.
 */
export function detectPeriod(onsets: OnsetInput[], observedCycles: number): PeriodInfo | null {
  const groups = groupOnsets(onsets);
  if (groups.length < 2) return null;

  // Token i = (group signature, exact gap to the next group). The trailing
  // group has no gap (the horizon cut is arbitrary), so it's checked apart.
  const tokens: string[] = [];
  for (let i = 0; i < groups.length - 1; i++) {
    const a = groups[i];
    const b = groups[i + 1];
    const gap = reduce(b.n * a.d - a.n * b.d, a.d * b.d);
    tokens.push(`${gap.n}/${gap.d}¶${a.key}`);
  }

  const m = tokens.length;
  const pi = prefixFunction(tokens);
  const k = m - pi[m - 1];
  if (k >= m || m < 2 * k) return null; // no repeat, or fewer than 2 full repeats
  // the trailing group must continue the pattern too
  if (groups[groups.length - 1].key !== groups[groups.length - 1 - k].key) return null;

  // gaps repeat with period k, so the time period is t[k] − t[0]
  const p = reduce(groups[k].n * groups[0].d - groups[0].n * groups[k].d, groups[0].d * groups[k].d);
  if (p.n <= 0) return null;
  const repeats = Math.floor(observedCycles / (p.n / p.d));
  if (repeats < 2) return null;
  return { cycles: p, repeats, confidence: 'exact' };
}
