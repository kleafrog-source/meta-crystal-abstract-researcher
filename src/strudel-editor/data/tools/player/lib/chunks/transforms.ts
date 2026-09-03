/** Quick structured rewrites on a chunk: effects, speed, reverse. */
import type { EditorView } from '@codemirror/view';
import { deleteRange, insertAt, replaceRange, type WriteSource } from '@/lib/codemirror/writeback';
import { isChunkFresh, type ChunkInfo } from './detect';

function findCall(chunk: ChunkInfo, name: string) {
  return chunk.chain.find((c) => c.name === name);
}

/** Refuse writes against ranges from an outdated doc — they corrupt other code. */
function fresh(view: EditorView, chunk: ChunkInfo): boolean {
  return isChunkFresh(view.state.doc.toString(), chunk);
}

function formatNum(n: number): string {
  return Number(n.toPrecision(3)).toString();
}

/** Set `.name(value)` — updates the existing call's arg or appends the call. */
export function setEffectArg(
  view: EditorView,
  chunk: ChunkInfo,
  name: string,
  value: number | string,
  source: WriteSource = 'chunk.transform',
) {
  if (!fresh(view, chunk)) return;
  const text = typeof value === 'number' ? formatNum(value) : value;
  const existing = findCall(chunk, name);
  if (existing && existing.args.length > 0) {
    replaceRange(view, existing.args[0].range, text, source);
  } else if (existing) {
    // `.name()` with no args: insert inside the parens
    insertAt(view, existing.range[1] - 1, text, source);
  } else {
    insertAt(view, chunk.exprRange[1], `.${name}(${text})`, source);
  }
}

/** Multiply playback speed: merges into an existing `.fast(n)` when present. */
export function scaleSpeed(view: EditorView, chunk: ChunkInfo, factor: number) {
  if (!fresh(view, chunk)) return;
  const existing = findCall(chunk, 'fast');
  if (existing && existing.args[0]?.numeric !== null && existing.args[0] !== undefined) {
    const next = existing.args[0].numeric! * factor;
    if (next === 1) {
      deleteRange(view, existing.range, 'chunk.transform');
    } else {
      replaceRange(view, existing.args[0].range, formatNum(next), 'chunk.transform');
    }
    return;
  }
  if (factor !== 1) {
    insertAt(view, chunk.exprRange[1], `.fast(${formatNum(factor)})`, 'chunk.transform');
  }
}

/**
 * Swap the chunk's instrument: rewrites the `.s("…")` arg (never the head
 * call's pattern string), replaces a `.piano()` shorthand, or appends `.s()`.
 */
export function setInstrument(view: EditorView, chunk: ChunkInfo, name: string) {
  if (!fresh(view, chunk)) return;
  const sCall = chunk.chain.slice(1).find((c) => c.name === 's' || c.name === 'sound');
  if (sCall && sCall.args.length > 0) {
    replaceRange(view, sCall.args[0].range, `"${name}"`, 'chunk.transform');
    return;
  }
  const pianoCall = chunk.chain.slice(1).find((c) => c.name === 'piano');
  if (pianoCall) {
    replaceRange(view, pianoCall.range, `.s("${name}")`, 'chunk.transform');
    return;
  }
  insertAt(view, chunk.exprRange[1], `.s("${name}")`, 'chunk.transform');
}

/** Set the chunk's drum-machine kit via `.bank("…")`. */
export function setBank(view: EditorView, chunk: ChunkInfo, bank: string) {
  if (!fresh(view, chunk)) return;
  const call = chunk.chain.slice(1).find((c) => c.name === 'bank');
  if (call && call.args.length > 0) {
    replaceRange(view, call.args[0].range, `"${bank}"`, 'chunk.transform');
  } else if (call) {
    insertAt(view, call.range[1] - 1, `"${bank}"`, 'chunk.transform');
  } else {
    insertAt(view, chunk.exprRange[1], `.bank("${bank}")`, 'chunk.transform');
  }
}

/** Drop the chunk's `.bank("…")` so it plays the default samples. */
export function removeBank(view: EditorView, chunk: ChunkInfo) {
  if (!fresh(view, chunk)) return;
  const call = chunk.chain.slice(1).find((c) => c.name === 'bank');
  if (call) deleteRange(view, call.range, 'chunk.transform');
}

/** Toggle `.rev()` on the chunk. */
export function toggleReverse(view: EditorView, chunk: ChunkInfo) {
  if (!fresh(view, chunk)) return;
  const existing = findCall(chunk, 'rev');
  if (existing) {
    deleteRange(view, existing.range, 'chunk.transform');
  } else {
    insertAt(view, chunk.exprRange[1], '.rev()', 'chunk.transform');
  }
}
