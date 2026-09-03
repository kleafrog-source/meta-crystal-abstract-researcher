/**
 * Deterministic model → mini-notation. The round-trip law (vitest golden tests):
 *   parse(serialize(m)) ≡ m   and   serialize(parse(s).model) === s
 * for canonical strings (single-space separated, lanes in first-appearance
 * order, multi-bar patterns as whole-string `<...>` alternations with one slot
 * per bar, `,`-stack parts in ascending part order).
 */
import type { PianoRollModel, StepGridModel } from './model';

export function serializeStepGrid(model: StepGridModel): string {
  const bars = model.bars ?? 1;
  if (bars > 1) return serializeGridBars(model, bars);
  const parts = [...new Set(model.lanes.map((l) => l.part ?? 0))].sort((a, b) => a - b);
  if (parts.length <= 1) return gridCols(model.lanes, model.steps).join(' ');
  return parts
    .map((p) =>
      gridCols(
        model.lanes.filter((l) => (l.part ?? 0) === p),
        model.steps,
      ).join(' '),
    )
    .join(', ');
}

/** one token per column: `~`, `bd`, or `[bd,sd]` */
function gridCols(lanes: StepGridModel['lanes'], steps: number): string[] {
  const cols: string[] = [];
  for (let i = 0; i < steps; i++) {
    const active = lanes.filter((lane) => lane.cells[i]).map((lane) => lane.sound);
    if (active.length === 0) cols.push('~');
    else if (active.length === 1) cols.push(active[0]);
    else cols.push(`[${active.join(',')}]`);
  }
  return cols;
}

/** `<...>` with one slot per bar; silent bars collapse to `~` */
function serializeGridBars(model: StepGridModel, bars: number): string {
  const colsPerBar = model.steps / bars;
  const cols = gridCols(model.lanes, model.steps);
  const slots: string[] = [];
  for (let b = 0; b < bars; b++) {
    const bar = cols.slice(b * colsPerBar, (b + 1) * colsPerBar);
    if (bar.every((c) => c === '~')) slots.push('~');
    else if (colsPerBar === 1) slots.push(bar[0]);
    else slots.push(`[${bar.join(' ')}]`);
  }
  return `<${slots.join(' ')}>`;
}

/* ── piano roll ─────────────────────────────────────────────── */

interface RollGroup {
  pitches: string[];
  duration: number;
}

/**
 * Notes must tile: group notes by start; each group shares one duration and
 * groups may not overlap (gaps fill with rests). Returns null when the layout
 * can't be expressed in the subset.
 */
function buildGroups(model: PianoRollModel): Map<number, RollGroup> | null {
  const groups = new Map<number, RollGroup>();
  for (const note of [...model.notes].sort((a, b) => a.start - b.start)) {
    if (note.start < 0 || note.duration < 1 || note.start + note.duration > model.steps) return null;
    const group = groups.get(note.start);
    if (!group) {
      groups.set(note.start, { pitches: [note.pitch], duration: note.duration });
    } else {
      if (group.duration !== note.duration) return null; // chord notes must share duration
      group.pitches.push(note.pitch);
    }
  }
  return groups;
}

const groupBody = (g: RollGroup): string => (g.pitches.length === 1 ? g.pitches[0] : `[${g.pitches.join(',')}]`);

export function serializePianoRoll(model: PianoRollModel): string | null {
  const groups = buildGroups(model);
  if (groups === null) return null;
  const bars = model.bars ?? 1;
  if (bars > 1) return rollBarsString(groups, model.steps, bars);

  const cols: string[] = [];
  let col = 0;
  const starts = [...groups.keys()].sort((a, b) => a - b);
  for (const start of starts) {
    const group = groups.get(start)!;
    if (start < col) return null; // overlapping groups can't be expressed
    while (col < start) {
      cols.push('~');
      col++;
    }
    cols.push(group.duration === 1 ? groupBody(group) : `${groupBody(group)}@${group.duration}`);
    col += group.duration;
  }
  while (col < model.steps) {
    cols.push('~');
    col++;
  }
  return cols.join(' ');
}

/**
 * `<...>` with one slot per bar: a group filling whole bars from a bar start
 * becomes a bare slot (`@k` holds k bars); a subdivided bar becomes a group
 * whose tokens carry in-bar `@` durations; silent bars collapse to `~`.
 * Notes crossing a bar line partially are inexpressible → null.
 */
function rollBarsString(groups: Map<number, RollGroup>, steps: number, bars: number): string | null {
  const colsPerBar = steps / bars;
  if (!Number.isInteger(colsPerBar)) return null;
  const starts = [...groups.keys()].sort((a, b) => a - b);
  const slots: string[] = [];
  let b = 0;
  while (b < bars) {
    const barStart = b * colsPerBar;
    const barEnd = barStart + colsPerBar;
    const atBarStart = groups.get(barStart);
    if (atBarStart && atBarStart.duration % colsPerBar === 0) {
      // whole-bar (or multi-bar) hold
      const k = atBarStart.duration / colsPerBar;
      const heldEnd = barStart + atBarStart.duration;
      if (starts.some((s) => s > barStart && s < heldEnd)) return null; // overlap
      slots.push(k === 1 ? groupBody(atBarStart) : `${groupBody(atBarStart)}@${k}`);
      b += k;
      continue;
    }
    if (colsPerBar === 1) {
      // no group can start here (handled above) — silent bar
      slots.push('~');
      b++;
      continue;
    }
    const tokens: string[] = [];
    let c = barStart;
    let consumed = 0;
    while (c < barEnd) {
      const g = groups.get(c);
      if (!g) {
        tokens.push('~');
        c++;
        continue;
      }
      if (c + g.duration > barEnd) return null; // crosses the bar line
      tokens.push(g.duration === 1 ? groupBody(g) : `${groupBody(g)}@${g.duration}`);
      c += g.duration;
      consumed++;
    }
    // a group the cursor jumped over (inside another's span) is an overlap
    if (consumed !== starts.filter((s) => s >= barStart && s < barEnd).length) return null;
    slots.push(tokens.every((t) => t === '~') ? '~' : `[${tokens.join(' ')}]`);
    b++;
  }
  return `<${slots.join(' ')}>`;
}
