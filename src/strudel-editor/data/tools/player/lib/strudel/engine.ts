/**
 * Facade over StrudelMirror (editor + repl + scheduler). Browser-only.
 * Everything else in the app — transport, audition, write-back — talks to this.
 */
import { StrudelMirror, updateMiniLocations } from '@strudel/codemirror';
import { getAudioContext, initAudioOnFirstClick, webaudioOutput } from '@strudel/webaudio';
import { transpiler } from '@strudel/transpiler';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { redo as cmRedo, undo as cmUndo } from '@codemirror/commands';
import type { ReplState } from '@strudel/core';
import { prebake } from './prebake';
import { makeFilteredOutput, setOutputErrorHandler } from './audition';

const BEATS_PER_CYCLE = 4;

export interface EngineOptions {
  root: HTMLElement;
  initialCode: string;
  onDocChange?: (doc: string, update: ViewUpdate) => void;
  onToggle?: (started: boolean) => void;
  onError?: (message: string | null) => void;
  onReady?: () => void;
  /** fires after every successful evaluation with the raw (unwrapped) pattern */
  onPatternChange?: (pattern: unknown, code: string) => void;
}

/**
 * Mapping from scheduler time (cycles since the clock started) to song
 * position. Applied to the raw pattern at eval/swap time. Idempotent: re-evals
 * during playback re-apply the same wrap without drifting.
 */
export type Transport =
  | { mode: 'linear'; offset: number }
  | { mode: 'loop'; start: number; len: number; phase: number };

const mod = (x: number, m: number) => ((x % m) + m) % m;

export class StrudelEngine {
  readonly mirror: StrudelMirror;
  private opts: EngineOptions;
  /** last successfully evaluated pattern, before any transport/analyser wrap */
  private rawPattern: unknown = null;
  private transport: Transport = { mode: 'linear', offset: 0 };

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.mirror = new StrudelMirror({
      root: opts.root,
      initialCode: opts.initialCode,
      prebake: () => prebake().then(() => opts.onReady?.()),
      drawTime: [0, 0],
      solo: false, // we may run preview repls later; don't let them kill each other
      defaultOutput: makeFilteredOutput(webaudioOutput),
      getTime: () => getAudioContext().currentTime,
      transpiler,
      // capture the raw pattern for timeline analysis, then wrap it: transport
      // mapping (seek/loop) + analyser 1 for the master scope — user code untouched
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editPattern: (pat: any) => {
        this.rawPattern = pat;
        const wrapped = this.applyTransport(pat);
        return wrapped.analyze?.(1) ?? wrapped;
      },
      // fires only on successful evaluation — the analysis trigger
      afterEval: (info: { code?: string }) => {
        opts.onPatternChange?.(this.rawPattern, typeof info?.code === 'string' ? info.code : this.code);
      },
      onToggle: (started: boolean) => opts.onToggle?.(started),
      onUpdateState: (state: ReplState) => {
        const err = state.evalError || state.schedulerError;
        opts.onError?.(err ? String(err) : null);
      },
    });

    setOutputErrorHandler((message) => opts.onError?.(message));

    // Observe all document changes (typing, write-back, undo) in one place.
    this.mirror.editor.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.opts.onDocChange?.(update.state.doc.toString(), update);
          }
        }),
      ),
    });

    initAudioOnFirstClick();
  }

  get view(): EditorView {
    return this.mirror.editor;
  }

  get code(): string {
    return this.mirror.editor.state.doc.toString();
  }

  async play() {
    await getAudioContext().resume();
    try {
      await this.mirror.evaluate();
    } catch (err) {
      // eval errors also arrive via onUpdateState; swallowing here keeps the
      // rejection from surfacing as an unhandled error overlay in dev
      this.opts.onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  /** Re-evaluate current code without toggling playback off. */
  async evaluate() {
    try {
      await this.mirror.evaluate(this.started);
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  stop() {
    // a fresh play restarts the song (or the loop region, if one is set)
    const t = this.transport;
    this.transport = t.mode === 'loop' ? { ...t, phase: 0 } : { mode: 'linear', offset: 0 };
    this.mirror.stop();
  }

  /** Evaluate current code without starting playback (keeps analysis fresh). */
  async evaluateSilently() {
    try {
      await this.mirror.evaluate(false);
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  private analysisTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Debounced evaluate-without-autostart so the raw pattern (and the timeline
   * derived from it) tracks edits made while the transport is stopped. While
   * playing, the regular evaluate path already covers this.
   */
  scheduleAnalysisEvaluate(delay = 700) {
    if (this.analysisTimer) clearTimeout(this.analysisTimer);
    this.analysisTimer = setTimeout(() => {
      this.analysisTimer = null;
      if (!this.started) void this.evaluateSilently();
    }, delay);
  }

  /**
   * Drop the active-event highlight marks. Marks are positioned at eval time
   * and remapped through edits, so rewriting a whole pattern string leaves
   * them in garbage spots until the next eval — clear them instead.
   */
  clearHighlights() {
    updateMiniLocations(this.mirror.editor, []);
  }

  private evalTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced re-evaluation for live edits (typing, knob drags, grid toggles). */
  scheduleEvaluate(delay = 200) {
    if (this.evalTimer) clearTimeout(this.evalTimer);
    this.evalTimer = setTimeout(() => {
      this.evalTimer = null;
      if (this.started) void this.evaluate();
    }, delay);
  }

  /** Cancel a pending scheduled re-evaluation (e.g. the doc stopped parsing). */
  cancelEvaluate() {
    if (this.evalTimer) {
      clearTimeout(this.evalTimer);
      this.evalTimer = null;
    }
  }

  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastThrottledEval = 0;

  /**
   * Throttled re-evaluation for continuous gestures (knob drags): unlike a
   * debounce, it keeps firing every `interval` ms DURING the gesture, so the
   * sweep is audible while dragging — the trailing call picks up the final value.
   */
  throttleEvaluate(interval = 180) {
    if (this.throttleTimer) return;
    const wait = Math.max(0, this.lastThrottledEval + interval - Date.now());
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.lastThrottledEval = Date.now();
      if (this.started) void this.evaluate();
    }, wait);
  }

  /** Wrap the raw pattern so scheduler time maps onto the song position. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyTransport(pat: any): any {
    const t = this.transport;
    if (t.mode === 'linear') return t.offset !== 0 ? pat.early(t.offset) : pat;
    // ribbon cuts [start, start+len) out of the song and loops it — the loop
    // boundary lives in pattern space, so it's gapless and sample-accurate
    return pat.ribbon(t.start, t.len).early(t.phase);
  }

  /**
   * Re-wrap the current raw pattern with the transport mapping. While playing
   * this hot-swaps the scheduled pattern (the same path live edits take), so
   * the clock never stops; while stopped it starts playback.
   */
  private async applyTransportNow(): Promise<void> {
    if (this.started && this.rawPattern) {
      await this.mirror.repl.setPattern(this.rawPattern, false);
    } else {
      await this.play();
    }
  }

  /** Absolute song position in cycles (transport-mapped); 0 when stopped. */
  songPosition(): number {
    if (!this.started) return 0;
    const t = this.mirror.repl.scheduler.now();
    const tr = this.transport;
    if (tr.mode === 'linear') return t + tr.offset;
    return tr.start + mod(t + tr.phase, tr.len);
  }

  /** Whole song cycle currently playing; 0 when stopped. */
  currentCycle(): number {
    return Math.floor(this.songPosition());
  }

  /** The loop region applied to playback, in song cycles, or null. */
  getLoopRegion(): [number, number] | null {
    const t = this.transport;
    return t.mode === 'loop' ? [t.start, t.start + t.len] : null;
  }

  /**
   * Jump playback to a song cycle. Seeking inside an active loop region keeps
   * looping; seeking outside drops the engine loop (callers mirror that into
   * UI state via getLoopRegion).
   */
  async playFrom(cycle: number): Promise<void> {
    const t = this.started ? this.mirror.repl.scheduler.now() : 0;
    const region = this.getLoopRegion();
    if (region && cycle >= region[0] && cycle < region[1]) {
      const len = region[1] - region[0];
      this.transport = { mode: 'loop', start: region[0], len, phase: mod(cycle - region[0] - t, len) };
    } else {
      this.transport = { mode: 'linear', offset: cycle - t };
    }
    await this.applyTransportNow();
  }

  /**
   * Loop a [start, end) song-cycle region. The mapping is chosen to be
   * continuous at swap time: a playhead inside the region keeps its position,
   * otherwise it lands at the region start.
   */
  async setLoopRegion(start: number, end: number): Promise<void> {
    const len = end - start;
    if (!(len > 0)) return;
    const t = this.started ? this.mirror.repl.scheduler.now() : 0;
    const pos = this.songPosition();
    const target = pos >= start && pos < end ? pos : start;
    this.transport = { mode: 'loop', start, len, phase: mod(target - start - t, len) };
    if (this.started) await this.applyTransportNow();
  }

  /** Drop the loop, keeping the playhead where it is. */
  async clearLoopRegion(): Promise<void> {
    if (this.transport.mode !== 'loop') return;
    const t = this.started ? this.mirror.repl.scheduler.now() : 0;
    this.transport = { mode: 'linear', offset: this.songPosition() - t };
    if (this.started) await this.applyTransportNow();
  }

  /** Position within the current cycle, 0 ≤ phase < 1; 0 when stopped. */
  cyclePhase(): number {
    const p = this.songPosition();
    return p - Math.floor(p);
  }

  async toggle() {
    if (this.started) {
      this.stop();
    } else {
      await this.play();
    }
  }

  /** Undo the last doc edit — typed or written back from the grid/roll/knobs. */
  undo(): boolean {
    return cmUndo(this.view);
  }

  redo(): boolean {
    return cmRedo(this.view);
  }

  get started(): boolean {
    return this.mirror.repl.scheduler.started;
  }

  /** bpm assuming 4 beats per cycle; survives re-evaluation unless code calls setcpm/setcps */
  setBpm(bpm: number) {
    this.mirror.repl.scheduler.setCps(bpm / 60 / BEATS_PER_CYCLE);
  }

  getBpm(): number {
    return this.mirror.repl.scheduler.cps * 60 * BEATS_PER_CYCLE;
  }

  setCode(code: string) {
    this.mirror.setCode(code);
  }

  destroy() {
    if (this.analysisTimer) clearTimeout(this.analysisTimer);
    setOutputErrorHandler(null);
    this.mirror.stop();
    this.mirror.clear();
    this.opts.root.replaceChildren();
  }
}

let current: StrudelEngine | null = null;

export function createEngine(opts: EngineOptions): StrudelEngine {
  current?.destroy();
  current = new StrudelEngine(opts);
  return current;
}

export function getEngine(): StrudelEngine | null {
  return current;
}

export function releaseEngine(engine: StrudelEngine) {
  engine.destroy();
  if (current === engine) current = null;
}
