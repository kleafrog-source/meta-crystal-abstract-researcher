/**
 * Insert a note into a roll, resolving overlaps so the result stays
 * expressible as a flat sequence (the serializer's tiling rule). Without
 * this, a roll full of sustained notes — e.g. right after a "spread"
 * resize turns `c3 e3 g3 b3` into `c3@4 e3@4 g3@4 b3@4` — would reject
 * every new note as an overlap. DAW-style resolution instead:
 *
 * - a group already starting at `start` → the note joins the chord and
 *   adopts the group's duration (chord members must share one)
 * - an earlier group sustaining past `start` → it trims to end there
 * - the next group (or the grid end) caps the new note's duration
 */
import type { PianoRollModel } from './model';

export function placeNote(
  model: PianoRollModel,
  pitch: string,
  start: number,
  duration: number,
): PianoRollModel {
  const groupAt = model.notes.find((n) => n.start === start);
  if (groupAt) {
    return {
      ...model,
      notes: [...model.notes, { pitch, start, duration: groupAt.duration }],
    };
  }
  const nextStart = Math.min(...model.notes.filter((n) => n.start > start).map((n) => n.start), model.steps);
  const notes = model.notes.map((n) =>
    n.start < start && n.start + n.duration > start ? { ...n, duration: start - n.start } : n,
  );
  notes.push({ pitch, start, duration: Math.max(1, Math.min(duration, nextStart - start)) });
  return { ...model, notes };
}
