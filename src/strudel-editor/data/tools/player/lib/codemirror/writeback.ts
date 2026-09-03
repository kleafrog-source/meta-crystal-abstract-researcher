/**
 * All UI-originated code edits flow through here as single tagged
 * transactions, so the editor's update listener can tell panel edits
 * (re-evaluate audio, keep panel state) apart from typed edits
 * (re-parse panel model).
 */
import { Annotation } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type WriteSource =
  | 'chunk.grid'
  | 'chunk.roll'
  | 'chunk.knob'
  | 'chunk.transform'
  | 'timeline.weights'
  | 'timeline.structure'
  | 'timeline.cell'
  | 'timeline.author';

export const writeSource = Annotation.define<WriteSource>();

/** Replace a doc range; returns the range of the inserted text. */
export function replaceRange(
  view: EditorView,
  range: [number, number],
  text: string,
  source: WriteSource,
): [number, number] {
  view.dispatch({
    changes: { from: range[0], to: range[1], insert: text },
    annotations: writeSource.of(source),
  });
  return [range[0], range[0] + text.length];
}

/**
 * Apply several non-overlapping replacements as ONE transaction — CodeMirror
 * resolves all `from`/`to` against the pre-transaction doc, and a single
 * transaction means a single undo step (a boundary drag across five voices
 * reverts with one Cmd+Z).
 */
export function replaceRanges(
  view: EditorView,
  edits: { range: [number, number]; text: string }[],
  source: WriteSource,
): void {
  if (edits.length === 0) return;
  view.dispatch({
    changes: edits.map((e) => ({ from: e.range[0], to: e.range[1], insert: e.text })),
    annotations: writeSource.of(source),
  });
}

export function insertAt(view: EditorView, pos: number, text: string, source: WriteSource): void {
  view.dispatch({
    changes: { from: pos, insert: text },
    annotations: writeSource.of(source),
  });
}

export function deleteRange(view: EditorView, range: [number, number], source: WriteSource): void {
  view.dispatch({
    changes: { from: range[0], to: range[1] },
    annotations: writeSource.of(source),
  });
}
