/** Structured models the visual editors own; parsed from / serialized to mini-notation. */

export interface StepGridModel {
  /** number of columns (total, across all bars) */
  steps: number;
  /** cycles the pattern spans (`<...>` alternation); absent = 1, a single-cycle loop */
  bars?: number;
  /**
   * lane order is presentation order; sound is the full token incl. `:variant`.
   * `part` is the top-level `,`-stack the lane belongs to (absent = 0) — purely
   * syntactic grouping, preserved so user-written stacks round-trip as written.
   */
  lanes: { sound: string; part?: number; cells: boolean[] }[];
}

export interface RollNote {
  /** note token, e.g. "c3", "eb4" */
  pitch: string;
  /** column index */
  start: number;
  /** in columns (1 = one step; rendered via `@n` elongation) */
  duration: number;
}

export interface PianoRollModel {
  /** number of columns (total, across all bars) */
  steps: number;
  /** cycles the pattern spans (`<...>` alternation); absent = 1, a single-cycle loop */
  bars?: number;
  notes: RollNote[];
}

export type ParseResult<M> = { ok: true; model: M } | { ok: false; reason: string };
