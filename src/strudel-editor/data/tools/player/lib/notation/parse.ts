/**
 * Parse the strict editable subset of mini-notation into editor models.
 *
 * Supported: flat sequences of atoms (`bd`, `bd:3`, `c3`), rests (`~` / `-`),
 * simultaneous stacks (`[bd,hh]`), sub-sequences (`[hh hh]`, expanded onto a
 * uniformly finer grid — parts may be `[a,b]` chords or carry `@n` weights),
 * `@n` elongation (piano roll only), whole-string `<...>` alternations where
 * every slot is one bar (a slot's `@n` holds it for n bars — roll only), and
 * top-level `,` stacks (drum grid only; parts round-trip as written).
 * Anything else (`{}`, `*`, `/`, `!`, `?`, euclids, deeper nesting) →
 * `{ ok: false }` and the panel falls back to "edit as code".
 *
 * Deliberately self-contained: @strudel/mini's full parser only loads in the
 * browser, and a strict subset tokenizer is what the round-trip guarantee
 * needs anyway.
 */
import type { ParseResult, PianoRollModel, RollNote, StepGridModel } from './model';

const ATOM = /^[a-zA-Z][a-zA-Z0-9#]*(:\d+)?$/;
const NOTE_PITCH = /^[a-gA-G][bs#]?\d$/; // c3, eb4, fs2, c#3...

/** expansion guard: `[7 hits] [11 hits]` would otherwise explode the grid */
const MAX_EXPANDED_STEPS = 64;

interface SubSlot {
  /** empty = rest; several atoms = a `[a,b]` chord / simultaneous hit */
  atoms: { token: string }[];
  /** `@n` weight, in group units */
  units: number;
}

interface Step {
  /** empty = rest */
  atoms: { token: string }[];
  /** `@n` — columns in the flat roll, bars inside an alternation */
  elongation: number;
  /** `[a b]` sub-sequence slots; null for plain steps */
  sub: SubSlot[] | null;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

const unitsOf = (s: Step): number => (s.sub ? s.sub.reduce((n, p) => n + p.units, 0) : 1);

/** finest subdivision needed so every step's slots land on whole cells */
function gridDivision(steps: Step[]): number {
  return steps.reduce((l, s) => lcm(l, unitsOf(s)), 1);
}

/** index of the `]` closing the `[` at `open`, or -1 */
function matchingBracket(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

/** split on commas outside any brackets; single-element array = no top-level comma */
function splitTopLevel(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') depth--;
    else if (src[i] === ',' && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts;
}

/** inner content when the entire trimmed string is one `<...>` alternation */
function wholeAlternation(mini: string): string | null {
  const t = mini.trim();
  return t.length >= 2 && t.startsWith('<') && t.endsWith('>') ? t.slice(1, -1) : null;
}

function tokenizeSteps(mini: string): { ok: true; steps: Step[] } | { ok: false; reason: string } {
  const src = mini.trim();
  if (src === '') return { ok: true, steps: [] };
  if (/[<>{}*/!?()%._|]/.test(src)) {
    return { ok: false, reason: 'uses mini-notation features beyond the editable subset' };
  }
  const steps: Step[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (src[i] === '~' || src[i] === '-') {
      steps.push({ atoms: [], elongation: 1, sub: null });
      i++;
      continue;
    }
    if (src[i] === '[') {
      const close = matchingBracket(src, i);
      if (close === -1) return { ok: false, reason: 'unbalanced brackets' };
      const inner = src.slice(i + 1, close);
      i = close + 1;
      const elong = readElongation(src, i);
      if (!elong.ok) return { ok: false, reason: elong.reason };
      i = elong.next;
      const step = parseGroup(inner, elong.value);
      if ('reason' in step) return { ok: false, reason: step.reason };
      steps.push(step);
      continue;
    }
    // bare atom
    const match = src.slice(i).match(/^[^\s[\]@,]+/);
    if (!match) return { ok: false, reason: `unsupported character "${src[i]}"` };
    const atom = parseAtom(match[0]);
    if (!atom) return { ok: false, reason: `unsupported token "${match[0]}"` };
    i += match[0].length;
    const elong = readElongation(src, i);
    if (!elong.ok) return { ok: false, reason: elong.reason };
    i = elong.next;
    steps.push({ atoms: [atom], elongation: elong.value, sub: null });
  }
  return { ok: true, steps };
}

/** the contents of one `[...]`: a `[a,b]` stack or a sub-sequence of slots */
function parseGroup(inner: string, elongation: number): Step | { reason: string } {
  if (splitTopLevel(inner).length > 1) {
    // `[bd,hh]` — simultaneous stack
    const parts = splitTopLevel(inner).map((p) => p.trim());
    if (parts.some((p) => /[\s[\]]/.test(p))) {
      return { reason: 'stacked sub-sequences are beyond the editable subset' };
    }
    const atoms: Step['atoms'] = [];
    for (const part of parts) {
      const atom = parseAtom(part);
      if (!atom) return { reason: `unsupported token "${part}"` };
      atoms.push(atom);
    }
    return { atoms, elongation, sub: null };
  }
  // `[hh hh]` / `[hh ~ hh]` / `[c3@2 [e3,g3]]` — sub-sequence
  const slots: SubSlot[] = [];
  let i = 0;
  while (i < inner.length) {
    if (/\s/.test(inner[i])) {
      i++;
      continue;
    }
    if (inner[i] === '~' || inner[i] === '-') {
      slots.push({ atoms: [], units: 1 });
      i++;
      continue;
    }
    if (inner[i] === '[') {
      // one nesting level: a `[a,b]` chord as a slot
      const close = matchingBracket(inner, i);
      if (close === -1) return { reason: 'unbalanced brackets' };
      const chord = inner.slice(i + 1, close);
      if (/[[\]]/.test(chord) || !chord.includes(',')) {
        return { reason: 'nested groups are beyond the editable subset' };
      }
      i = close + 1;
      const elong = readElongation(inner, i);
      if (!elong.ok) return { reason: elong.reason };
      i = elong.next;
      const atoms: Step['atoms'] = [];
      for (const part of chord.split(',').map((p) => p.trim())) {
        const atom = parseAtom(part);
        if (!atom) return { reason: `unsupported token "${part}"` };
        atoms.push(atom);
      }
      slots.push({ atoms, units: elong.value });
      continue;
    }
    const match = inner.slice(i).match(/^[^\s[\]@,]+/);
    if (!match) return { reason: `unsupported character "${inner[i]}"` };
    const atom = parseAtom(match[0]);
    if (!atom) return { reason: `unsupported token "${match[0]}"` };
    i += match[0].length;
    const elong = readElongation(inner, i);
    if (!elong.ok) return { reason: elong.reason };
    i = elong.next;
    slots.push({ atoms: [atom], units: elong.value });
  }
  if (slots.length === 0) return { reason: 'empty group' };
  if (slots.length === 1 && slots[0].units === 1) {
    // `[bd]` is just a bare atom
    return { atoms: slots[0].atoms, elongation, sub: null };
  }
  return { atoms: [], elongation, sub: slots };
}

function parseAtom(token: string): { token: string } | null {
  if (!ATOM.test(token)) return null;
  return { token };
}

function readElongation(
  src: string,
  i: number,
): { ok: true; value: number; next: number } | { ok: false; reason: string; next: number } {
  if (src[i] !== '@') return { ok: true, value: 1, next: i };
  const match = src.slice(i + 1).match(/^\d+/);
  if (!match) return { ok: false, reason: 'invalid elongation', next: i };
  return { ok: true, value: parseInt(match[0], 10), next: i + 1 + match[0].length };
}

/* ── drum grid ──────────────────────────────────────────────── */

function gridRejectsElongation(steps: Step[]): boolean {
  return steps.some((s) => s.elongation !== 1 || (s.sub !== null && s.sub.some((p) => p.units !== 1)));
}

/** expand steps onto a uniform grid of `steps.length × div` trigger cells */
function expandGridCells(steps: Step[], div: number): Step['atoms'][] {
  const cells: Step['atoms'][] = [];
  for (const step of steps) {
    const slots = step.sub ?? [{ atoms: step.atoms, units: 1 }];
    const total = unitsOf(step);
    for (const slot of slots) {
      const span = (div / total) * slot.units;
      cells.push(slot.atoms);
      for (let j = 1; j < span; j++) cells.push([]);
    }
  }
  return cells;
}

function lanesFromCells(cells: Step['atoms'][], part?: number): StepGridModel['lanes'] {
  const laneOrder: string[] = [];
  for (const cell of cells) {
    for (const atom of cell) {
      if (!laneOrder.includes(atom.token)) laneOrder.push(atom.token);
    }
  }
  return laneOrder.map((sound) => ({
    sound,
    ...(part !== undefined ? { part } : {}),
    cells: cells.map((cell) => cell.some((a) => a.token === sound)),
  }));
}

export function parseStepGrid(mini: string): ParseResult<StepGridModel> {
  const alt = wholeAlternation(mini);
  if (alt !== null) return parseGridAlternation(alt);
  const parts = splitTopLevel(mini);
  if (parts.length > 1) return parseGridStack(parts);

  const result = tokenizeSteps(mini);
  if (!result.ok) return result;
  const { steps } = result;
  if (gridRejectsElongation(steps)) {
    return { ok: false, reason: 'elongation is beyond the drum-grid subset' };
  }
  // expand sub-sequences onto a uniform finer grid: `bd [hh hh]` → `bd ~ hh hh`
  const div = gridDivision(steps);
  if (div > 1 && steps.length * div > MAX_EXPANDED_STEPS) {
    return { ok: false, reason: `sub-sequences expand the grid past ${MAX_EXPANDED_STEPS} steps` };
  }
  const cells = expandGridCells(steps, div);
  return { ok: true, model: { steps: cells.length, lanes: lanesFromCells(cells) } };
}

/** `<[bd ~ sd ~] [bd bd sd ~]>` — one slot per bar */
function parseGridAlternation(inner: string): ParseResult<StepGridModel> {
  const result = tokenizeSteps(inner);
  if (!result.ok) return result;
  const { steps } = result;
  if (steps.length === 0) return { ok: false, reason: 'empty alternation' };
  if (gridRejectsElongation(steps)) {
    return { ok: false, reason: 'elongation is beyond the drum-grid subset' };
  }
  const div = gridDivision(steps);
  if (steps.length * div > MAX_EXPANDED_STEPS) {
    return { ok: false, reason: `the alternation expands the grid past ${MAX_EXPANDED_STEPS} steps` };
  }
  const cells = expandGridCells(steps, div);
  return { ok: true, model: { steps: cells.length, bars: steps.length, lanes: lanesFromCells(cells) } };
}

/** `bd ~ sd ~, hh hh hh hh` — parallel parts merged onto one grid, part kept per lane */
function parseGridStack(parts: string[]): ParseResult<StepGridModel> {
  const partCells: Step['atoms'][][] = [];
  for (const part of parts) {
    if (part.trim() === '') return { ok: false, reason: 'empty stack part' };
    const result = tokenizeSteps(part);
    if (!result.ok) return result;
    if (gridRejectsElongation(result.steps)) {
      return { ok: false, reason: 'elongation is beyond the drum-grid subset' };
    }
    partCells.push(expandGridCells(result.steps, gridDivision(result.steps)));
  }
  // each part spans one cycle; stretch all parts onto the common (lcm) grid
  const total = partCells.reduce((l, cells) => lcm(l, cells.length), 1);
  if (total > MAX_EXPANDED_STEPS) {
    return { ok: false, reason: `the stack expands the grid past ${MAX_EXPANDED_STEPS} steps` };
  }
  const lanes: StepGridModel['lanes'] = [];
  partCells.forEach((cells, p) => {
    const k = total / cells.length;
    const stretched: Step['atoms'][] = Array.from({ length: total }, (_, c) =>
      c % k === 0 ? cells[c / k] : [],
    );
    lanes.push(...lanesFromCells(stretched, p));
  });
  return { ok: true, model: { steps: total, lanes } };
}

/* ── piano roll ─────────────────────────────────────────────── */

export function parsePianoRoll(mini: string): ParseResult<PianoRollModel> {
  const alt = wholeAlternation(mini);
  const result = tokenizeSteps(alt ?? mini);
  if (!result.ok) return result;
  const { steps } = result;
  if (alt !== null && steps.length === 0) return { ok: false, reason: 'empty alternation' };

  // expand sub-sequences onto a uniform finer grid: `c3 [d3 e3]` → `c3@2 d3 e3`
  const div = gridDivision(steps);
  const bars = steps.reduce((b, s) => b + s.elongation, 0);
  const totalCols = bars * div;
  if ((div > 1 || alt !== null) && totalCols > MAX_EXPANDED_STEPS) {
    return { ok: false, reason: `sub-sequences expand the roll past ${MAX_EXPANDED_STEPS} steps` };
  }
  const notes: RollNote[] = [];
  let col = 0;
  for (const step of steps) {
    const slots = step.sub ?? [{ atoms: step.atoms, units: 1 }];
    const total = unitsOf(step);
    for (const slot of slots) {
      const span = (step.elongation * div * slot.units) / total;
      for (const atom of slot.atoms) {
        if (!NOTE_PITCH.test(atom.token)) {
          return { ok: false, reason: `"${atom.token}" is not a note name` };
        }
        notes.push({ pitch: atom.token.toLowerCase(), start: col, duration: span });
      }
      col += span;
    }
  }
  return { ok: true, model: { steps: col, ...(alt !== null ? { bars } : {}), notes } };
}
