'use client';

import { useMemo, useRef, useState } from 'react';
import { isChunkFresh, type ChunkInfo } from '@/lib/chunks/detect';
import { parsePianoRoll } from '@/lib/notation/parse';
import { serializePianoRoll } from '@/lib/notation/serialize';
import type { PianoRollModel, RollNote } from '@/lib/notation/model';
import { isBlackKey, midiToPitch, pitchToMidi } from '@/lib/notation/pitch';
import { placeNote } from '@/lib/notation/place';
import { resizeRoll, type ResizeMode } from '@/lib/notation/resize';
import { replaceRange } from '@/lib/codemirror/writeback';
import { getEngine } from '@/lib/strudel/engine';
import ResizeModeToggle from '@/components/editor/ResizeModeToggle';
import { usePlayhead } from '@/components/editor/usePlayhead';

const DEFAULT_STEPS = 8;
const MIN_ROWS = 25; // two octaves

interface Draft {
  midi: number;
  startCol: number;
  endCol: number; // inclusive
}

export default function PianoRoll({ chunk }: { chunk: ChunkInfo }) {
  const [blocked, setBlocked] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('spread');
  const draftRef = useRef<Draft | null>(null);

  const parsed = useMemo(() => (chunk.miniString !== null ? parsePianoRoll(chunk.miniString) : null), [chunk.miniString]);
  const playhead = usePlayhead(parsed?.ok ? parsed.model.steps || DEFAULT_STEPS : 0, parsed?.ok ? (parsed.model.bars ?? 1) : 1);

  if (!parsed || chunk.miniRange === null) {
    return <Unsupported reason="no pattern string found in this statement" />;
  }
  if (!parsed.ok) {
    return <Unsupported reason={parsed.reason} />;
  }

  const model = parsed.model;
  const bars = model.bars ?? 1;
  const steps = model.steps === 0 ? DEFAULT_STEPS : model.steps;
  const colsPerBar = steps / bars;

  const midis = model.notes.map((n) => pitchToMidi(n.pitch)).filter((m): m is number => m !== null);
  const center = midis.length > 0 ? Math.round((Math.min(...midis) + Math.max(...midis)) / 2) : pitchToMidi('e3')!;
  const span = midis.length > 0 ? Math.max(...midis) - Math.min(...midis) : 0;
  const half = Math.max(Math.ceil(span / 2) + 4, Math.floor(MIN_ROWS / 2));
  const topMidi = center + half;
  const rows: number[] = [];
  for (let m = topMidi; m >= center - half; m--) rows.push(m);

  const write = (next: PianoRollModel) => {
    const engine = getEngine();
    if (!engine || chunk.miniRange === null) return false;
    // never write against ranges from an outdated doc
    if (!isChunkFresh(engine.view.state.doc.toString(), chunk)) return false;
    const mini = serializePianoRoll(next);
    if (mini === null) {
      setBlocked('that edit can’t be written as a flat pattern (overlaps)');
      setTimeout(() => setBlocked(null), 2200);
      return false;
    }
    replaceRange(engine.view, chunk.miniRange, mini, 'chunk.roll');
    return true;
  };

  const notesAt = (midi: number, col: number): RollNote | undefined =>
    model.notes.find((n) => pitchToMidi(n.pitch) === midi && col >= n.start && col < n.start + n.duration);

  const commitDraft = () => {
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!d) return;
    const start = Math.min(d.startCol, d.endCol);
    const end = Math.max(d.startCol, d.endCol);
    write(placeNote({ ...model, steps }, midiToPitch(d.midi), start, end - start + 1));
  };

  const resize = (nextSteps: number) => {
    write(resizeRoll({ ...model, steps }, nextSteps, resizeMode));
  };

  return (
    <div className="flex flex-col gap-3" onPointerUp={commitDraft} onPointerLeave={commitDraft}>
      {/* steps control — multi-bar resolution lives in the string, so no resize */}
      <div className="flex items-center gap-2">
        <span className="silkscreen">steps</span>
        {bars === 1 ? (
          <>
            {[4, 8, 16, 32].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => resize(n)}
                className={`h-6 rounded-sm border px-2 text-xs ${
                  steps === n
                    ? 'border-acid-dim text-acid'
                    : 'border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text'
                }`}
              >
                {n}
              </button>
            ))}
            <ResizeModeToggle mode={resizeMode} onChange={setResizeMode} />
          </>
        ) : (
          <span className="text-xs text-text-dim">
            {bars} bars × {colsPerBar}
          </span>
        )}
        {blocked && <span className="ml-auto text-xs text-ember">{blocked}</span>}
      </div>

      <div className="max-h-[60dvh] overflow-y-auto rounded-sm border border-line">
        {rows.map((midi) => {
          const pitch = midiToPitch(midi);
          const black = isBlackKey(midi);
          return (
            <div key={midi} className={`flex h-5 items-stretch ${black ? 'bg-background' : 'bg-surface'}`}>
              <div
                className={`w-9 shrink-0 border-r border-line pr-1 text-right text-[9px] leading-5 select-none ${
                  pitch.startsWith('c') && !black ? 'text-text-dim' : 'text-text-faint'
                }`}
              >
                {black ? '' : pitch}
              </div>
              <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${steps}, 1fr)` }}>
                {Array.from({ length: steps }, (_, col) => {
                  const note = notesAt(midi, col);
                  const inDraft =
                    draft &&
                    draft.midi === midi &&
                    col >= Math.min(draft.startCol, draft.endCol) &&
                    col <= Math.max(draft.startCol, draft.endCol);
                  const isNoteStart = note && note.start === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      aria-label={`${pitch} step ${col + 1}${note ? ' (note)' : ''}`}
                      data-note={note ? 'true' : undefined}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (note) {
                          // click a note → delete it
                          write({ ...model, steps, notes: model.notes.filter((n) => n !== note) });
                        } else {
                          const d = { midi, startCol: col, endCol: col };
                          draftRef.current = d;
                          setDraft(d);
                        }
                      }}
                      onPointerEnter={() => {
                        if (draftRef.current && draftRef.current.midi === midi) {
                          const d = { ...draftRef.current, endCol: col };
                          draftRef.current = d;
                          setDraft(d);
                        }
                      }}
                      className={`h-full border-r ${
                        bars > 1 && (col + 1) % colsPerBar === 0
                          ? 'border-line-bright'
                          : col % 4 === 3
                            ? 'border-line'
                            : 'border-line/40'
                      } transition-colors ${
                        note
                          ? `bg-ember/85 ${isNoteStart ? 'rounded-l-[2px]' : ''} shadow-[0_0_5px_var(--ember-glow)] ${col === playhead ? 'brightness-150' : ''}`
                          : inDraft
                            ? 'bg-ember/40'
                            : col === playhead
                              ? 'bg-ember/10'
                              : 'hover:bg-ember/15'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="silkscreen">click to delete · drag right to hold a note</p>
    </div>
  );
}

function Unsupported({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-dim">too complex for the piano roll — edit as code</p>
      <p className="text-xs text-text-faint">{reason}</p>
    </div>
  );
}
