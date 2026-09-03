/**
 * Derived song-structure model. Everything here is computed from the
 * evaluated pattern and the parsed doc — never persisted. The code stays the
 * single source of truth; a new analysis replaces the old wholesale.
 */

/** Exact rational number (strudel cycle times are Fractions). */
export interface Frac {
  n: number;
  d: number;
}

export type LaneKind = 'statement' | 'stackArg' | 'definition' | 'other';

/** A row of the timeline, found statically in the doc (or synthesized). */
export interface LaneSource {
  /** 'stmt:2' | 'stack:0' | 'def:crdpart' | 'other' */
  id: string;
  kind: LaneKind;
  /** $-label, const name, or head function name */
  label: string | null;
  /** doc byte offsets of the lane's own expression; null for 'other' */
  range: [number, number] | null;
  /** byte offsets of the enclosing top-level statement */
  statementRange: [number, number] | null;
  /** identifiers referenced inside the range — attribution fallback graph */
  refs: string[];
}

/** Per-lane, per-cycle activity summary. */
export interface LaneActivityCell {
  /** onset count in this cycle */
  onsets: number;
  /** fraction of the cycle covered by sounding events, 0..1 */
  coverage: number;
  /** hash of quantized in-cycle onsets + value classes — drives sectioning */
  rhythmKey: string;
  /** up to 3 distinct sound/note summaries active this cycle */
  sounds: string[];
}

export interface TimelineLane {
  source: LaneSource;
  /** majority hap.value.color when the code uses .color(), else null */
  color: string | null;
  /** index = song cycle; length = SongTimeline.cycles */
  activity: LaneActivityCell[];
  firstActiveCycle: number | null;
  lastActiveCycle: number | null;
}

export interface PeriodInfo {
  /** detected period in cycles — rational, since .cpm() rescales eval-time */
  cycles: Frac;
  /** full repeats observed inside the queried window */
  repeats: number;
  confidence: 'exact' | 'none';
}

export interface SongSection {
  /** [start, end) in song cycles */
  start: number;
  end: number;
  activeLaneIds: string[];
  /** 'A', 'B', … — sections with identical signatures share a letter */
  label: string;
}

export interface SongTimeline {
  /** exact source the analysis ran against — freshness token */
  code: string;
  /** ceil(period) when detected, else the queried horizon */
  cycles: number;
  period: PeriodInfo | null;
  /** how many cycles were actually queried */
  queriedCycles: number;
  lanes: TimelineLane[];
  sections: SongSection[];
  /** cps at analysis time, for cycle ↔ seconds display */
  cpsAtAnalysis: number;
  /** analysis wall time in ms — perf telemetry */
  analysisMs: number;
}
