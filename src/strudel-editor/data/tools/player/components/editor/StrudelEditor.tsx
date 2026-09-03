'use client';

import { useEffect, useRef } from 'react';
import { createEngine, releaseEngine } from '@/lib/strudel/engine';
import { usePlayerStore } from '@/lib/state/store';
import { mapAuditionRange, setAuditionRange } from '@/lib/strudel/audition';
import { detectAllChunks, detectChunk, docParses, firstEditablePos } from '@/lib/chunks/detect';
import { cancelTimelineAnalysis, runTimelineAnalysis } from '@/lib/timeline/controller';
import { recognizeArrangement } from '@/lib/timeline/recognize';
import { writeSource } from '@/lib/codemirror/writeback';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';

/** how long after the last keystroke a typed edit re-evaluates, while playing */
const TYPED_EVAL_DELAY = 500;

interface Props {
  initialCode: string;
  onDocChange?: (doc: string) => void;
}

export default function StrudelEditor({ initialCode, onDocChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onDocChangeRef = useRef(onDocChange);

  useEffect(() => {
    onDocChangeRef.current = onDocChange;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const {
      setPlaying,
      setError,
      setReady,
      setBpm,
      setAudition,
      setCurrentChunk,
      setDocBroken,
      setPanel,
      setTimeline,
      setTimelineStale,
      setArrangement,
    } = usePlayerStore.getState();

    const refreshChunk = (
      doc: string,
      pos: number,
      opts: { fromSelection?: boolean; mapPos?: (p: number) => number } = {},
    ) => {
      let chunk = detectChunk(doc, pos);
      if (!chunk && opts.mapPos) {
        // doc changed and the cursor isn't in a statement: the previous
        // chunk's ranges are now invalid — re-detect it at its mapped start
        const prev = usePlayerStore.getState().currentChunk;
        if (prev) chunk = detectChunk(doc, opts.mapPos(prev.statementRange[0]));
      }
      if (chunk && chunk.type === 'unknown' && !chunk.nested) {
        // the cursor is on a voice's head (label / timeline string) — surface
        // its first editable variant in the panel instead of the uneditable
        // statement; the cursor stays where the user put it
        const editable = firstEditablePos(doc, chunk.statementRange);
        if (editable !== null) chunk = detectChunk(doc, editable) ?? chunk;
      }
      if (chunk) {
        setDocBroken(false);
        const prev = usePlayerStore.getState().currentChunk;
        const movedStatement =
          !prev ||
          prev.statementRange[0] !== chunk.statementRange[0] ||
          prev.statementRange[1] !== chunk.statementRange[1];
        setCurrentChunk(chunk);
        // clicking into a different statement while browsing sounds means
        // "edit this line" — bring the chunk editor back
        if (opts.fromSelection && movedStatement && usePlayerStore.getState().panel === 'sounds') {
          setPanel('chunk');
        }
        return;
      }
      if (doc.trim() === '') {
        setDocBroken(false);
        setCurrentChunk(null);
        return;
      }
      const parses = docParses(doc);
      setDocBroken(!parses);
      if (parses && opts.mapPos) {
        // doc changed, statement is genuinely gone — never keep stale ranges
        setCurrentChunk(null);
      }
      // selection-only updates may keep the last chunk: the doc is unchanged,
      // so its ranges are still valid
    };

    const engine = createEngine({
      root,
      initialCode,
      onReady: () => {
        setReady(true);
        // initial silent eval so the timeline exists before first play
        engine.scheduleAnalysisEvaluate(0);
      },
      onPatternChange: (pattern, code) => runTimelineAnalysis(pattern, code),
      onToggle: (started) => {
        setPlaying(started);
        if (!started) {
          setAuditionRange(null);
          setAudition(null);
        }
      },
      onError: (message) => setError(message),
      onDocChange: (doc, update) => {
        // keep the solo range pointing at the same text as the doc changes
        mapAuditionRange((pos) => update.changes.mapPos(pos));
        const range = usePlayerStore.getState().audition;
        if (range) {
          setAudition([update.changes.mapPos(range[0]), update.changes.mapPos(range[1])]);
        }
        refreshChunk(doc, update.state.selection.main.head, {
          mapPos: (p) => update.changes.mapPos(p, 1),
        });
        // Every edit re-evaluates live while playing, so the audio always tracks
        // the code. Discrete UI edits (grid/roll/transform) evaluate immediately
        // so playback highlighting doesn't linger on stale positions; knob drags
        // and typing debounce — typing waits out the keystroke burst and never
        // evaluates a doc that doesn't parse.
        const source = update.transactions.map((tr) => tr.annotation(writeSource)).find(Boolean);
        if (source) {
          // old highlight marks get remapped into garbage spots by big string
          // rewrites — hide them until the re-eval registers fresh ones
          queueMicrotask(() => engine.clearHighlights());
          if (source === 'chunk.knob') {
            engine.throttleEvaluate(); // keep evaluating during the drag
          } else {
            engine.scheduleEvaluate(0);
          }
        } else if (engine.started) {
          if (doc.trim() === '') {
            // deleted everything — that means silence, not "keep looping"
            engine.cancelEvaluate();
            engine.stop();
          } else if (docParses(doc)) {
            engine.scheduleEvaluate(TYPED_EVAL_DELAY);
          } else {
            // mid-edit syntax error: keep the last good pattern playing and
            // make sure no earlier-scheduled eval fires against broken code
            engine.cancelEvaluate();
          }
        }
        // the timeline is derived from the last evaluated pattern; flag it
        // stale until the next successful eval refreshes the analysis
        setTimelineStale(true);
        if (!engine.started && doc.trim() !== '' && docParses(doc)) {
          engine.scheduleAnalysisEvaluate(source ? 300 : 700);
        }
        // Tier-2 recognition is acorn-only — cheap enough to run eagerly; a
        // null keeps the previous arrangement hidden until the doc parses
        setArrangement(recognizeArrangement(doc));
        onDocChangeRef.current?.(doc);
      },
    });
    setBpm(Math.round(engine.getBpm()));

    // follow the cursor to keep currentChunk in sync
    engine.view.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.selectionSet && !update.docChanged) {
            refreshChunk(update.state.doc.toString(), update.state.selection.main.head, { fromSelection: true });
          }
        }),
      ),
    });
    // land the cursor on the first editable pattern (a voice's first variant,
    // or a plain statement) so the side panel opens with a grid/roll right
    // away instead of the "click into a statement" hint
    const firstPos = firstEditablePos(initialCode) ?? detectAllChunks(initialCode)[0]?.statementRange[0] ?? null;
    if (firstPos !== null) {
      engine.view.dispatch({ selection: { anchor: firstPos } });
    }
    refreshChunk(initialCode, firstPos ?? 0);
    setArrangement(recognizeArrangement(initialCode));

    if (process.env.NODE_ENV === 'development') {
      // console access for debugging: __player.engine, __player.store.getState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__player = { engine, store: usePlayerStore };
    }

    return () => {
      cancelTimelineAnalysis();
      releaseEngine(engine);
      setAuditionRange(null);
      setPlaying(false);
      setCurrentChunk(null);
      setAudition(null);
      setTimeline(null);
      setTimelineStale(false);
      setArrangement(null);
    };
    // initialCode is only the mount-time seed; song switches remount via key=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="strudel-editor-root min-h-0 flex-1 overflow-y-auto text-[15px]" />;
}
