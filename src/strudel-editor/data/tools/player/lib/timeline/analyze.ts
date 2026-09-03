/**
 * Pattern → SongTimeline: query the evaluated pattern over a progressive
 * horizon, attribute every hap to a lane by source location, accumulate
 * per-cycle activity, and detect the song's period from the onset structure.
 *
 * Works for ANY strudel code — pickRestart timelines, arrange(), cat, custom
 * registered helpers — because it reads the pattern's actual output rather
 * than parsing idioms. Imports nothing from @strudel (the pattern is passed
 * in), so it stays node-testable.
 *
 * Querying is sliced against a main-thread budget and yields between slices;
 * the live scheduler has ~100ms of latency headroom, so short slices never
 * starve audio.
 */
import type { LaneActivityCell, LaneSource, SongTimeline, TimelineLane } from './types';
import { detectPeriod, type OnsetInput } from './period';
import { createAttributor, OTHER_LANE_ID } from './attribute';
import { computeSections } from './sections';
import type { HapLocation } from '@/lib/strudel/audition';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AnalyzeOptions {
  /** static horizon hint from detectLanes, in cycles */
  hintCycles?: number | null;
  /** cps at analysis time (display metadata only) */
  cps?: number;
  /** hard cap on how many cycles get queried */
  maxCycles?: number;
  /** per-slice main-thread budget, ms */
  sliceBudgetMs?: number;
  /** set .cancelled to abandon the run (a newer eval superseded it) */
  signal?: { cancelled: boolean };
}

interface CellAgg {
  onsets: number;
  coverage: number;
  rhythm: string[];
  soundCounts: Map<string, number>;
}

const yieldMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Discrete value class for signatures: sound name or (rounded) note. */
function valueClass(value: any): string {
  if (value == null) return 'x';
  if (typeof value === 'object') {
    const s = value.s ?? value.sound;
    if (typeof s === 'string') return s;
    const note = value.note ?? value.n;
    if (typeof note === 'string') return note;
    if (typeof note === 'number') return String(Math.round(note * 1000) / 1000);
    return 'x';
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  return 'x';
}

export async function analyzeSong(
  pattern: unknown,
  laneSources: LaneSource[],
  code: string,
  opts: AnalyzeOptions = {},
): Promise<SongTimeline | null> {
  const pat = pattern as any;
  if (!pat || typeof pat.queryArc !== 'function') return null;
  const { hintCycles = null, cps = 0.5, maxCycles = 512, sliceBudgetMs = 10, signal } = opts;
  const t0 = performance.now();

  const attributor = createAttributor(laneSources);
  const onsets: OnsetInput[] = [];
  const agg = new Map<string, Map<number, CellAgg>>();
  const colorCounts = new Map<string, Map<string, number>>();
  let firstOnsetTime: number | null = null;

  const cell = (laneId: string, cycle: number): CellAgg => {
    let lane = agg.get(laneId);
    if (!lane) agg.set(laneId, (lane = new Map()));
    let c = lane.get(cycle);
    if (!c) lane.set(cycle, (c = { onsets: 0, coverage: 0, rhythm: [], soundCounts: new Map() }));
    return c;
  };

  const processHap = (hap: any) => {
    if (!hap?.whole || !hap.part) return; // continuous signals are modulation, not notes
    const pb = Number(hap.part.begin);
    const pe = Number(hap.part.end);
    if (!(pe > pb)) return;
    const laneId = attributor.attribute(hap.context?.locations as HapLocation[] | undefined);
    const cls = valueClass(hap.value);

    const isOnset =
      typeof hap.hasOnset === 'function' ? hap.hasOnset() : Number(hap.whole.begin) === pb;
    if (isOnset) {
      const begin = hap.whole.begin;
      const cycle = Math.floor(pb);
      if (firstOnsetTime === null || pb < firstOnsetTime) firstOnsetTime = pb;
      const c = cell(laneId, cycle);
      c.onsets++;
      c.rhythm.push(`${Math.round((pb - cycle) * 48)}:${cls}`);
      c.soundCounts.set(cls, (c.soundCounts.get(cls) ?? 0) + 1);
      // exact rational time for period detection — fraction.js stores sign/n/d
      // as BigInt; magnitudes here stay far below 2^53, so Number is lossless
      const bn = begin?.n;
      const bd = begin?.d;
      if ((typeof bn === 'number' || typeof bn === 'bigint') && (typeof bd === 'number' || typeof bd === 'bigint')) {
        const sign = begin.s != null ? Number(begin.s) : 1;
        onsets.push({ n: sign * Number(bn), d: Number(bd), key: `${laneId}¶${cls}` });
      }
      const color = typeof hap.value === 'object' ? hap.value?.color : undefined;
      if (typeof color === 'string') {
        let counts = colorCounts.get(laneId);
        if (!counts) colorCounts.set(laneId, (counts = new Map()));
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
    }
    // sustained coverage, clipped per cycle
    for (let cy = Math.floor(pb); cy < pe; cy++) {
      const overlap = Math.min(pe, cy + 1) - Math.max(pb, cy);
      if (overlap > 0) {
        const c = cell(laneId, cy);
        c.coverage = Math.min(1, c.coverage + overlap);
        // a held note still names its sound in cells after its onset cycle
        if (!c.soundCounts.has(cls)) c.soundCounts.set(cls, 0);
      }
    }
  };

  // progressive horizons: hint-seeded first pass, then doubling up to the cap
  const horizons: number[] = [];
  let h = hintCycles ? Math.min(maxCycles, Math.max(16, Math.ceil(hintCycles * 2) + 8)) : 64;
  while (h < maxCycles) {
    horizons.push(h);
    h *= 2;
  }
  horizons.push(maxCycles);

  let queried = 0;
  let sliceCycles = 8;
  let bail = false;
  let period: ReturnType<typeof detectPeriod> = null;

  for (const horizon of horizons) {
    while (queried < horizon) {
      if (signal?.cancelled) return null;
      const end = Math.min(queried + sliceCycles, horizon);
      const sliceStart = performance.now();
      let haps: any[];
      try {
        haps = pat.queryArc(queried, end);
      } catch {
        return null; // pattern blew up mid-query — keep the last good timeline
      }
      for (const hap of haps) processHap(hap);
      queried = end;
      const elapsed = performance.now() - sliceStart;
      if (elapsed > sliceBudgetMs && sliceCycles > 1) sliceCycles = Math.max(1, sliceCycles >> 1);
      else if (elapsed < sliceBudgetMs / 3 && sliceCycles < 32) sliceCycles *= 2;
      if (elapsed > sliceBudgetMs * 5 && queried >= 16) {
        bail = true; // pathologically heavy pattern: report what we have
        break;
      }
      await yieldMain();
    }
    period = detectPeriod(onsets, queried);
    if (period || bail) break;
  }
  if (signal?.cancelled) return null;

  // period detection anchors at the first onset, so a silent head (leading
  // rests) sits before the loop — display the head plus one full period
  const cycles = period
    ? Math.max(1, Math.ceil((firstOnsetTime ?? 0) + period.cycles.n / period.cycles.d))
    : queried;

  // assemble lanes in source order; only rows with any activity, 'other' last
  const lanes: TimelineLane[] = [];
  const emptyCell = (): LaneActivityCell => ({ onsets: 0, coverage: 0, rhythmKey: '', sounds: [] });
  const rowSources = [
    ...laneSources.filter((s) => s.kind === 'statement' || s.kind === 'stackArg'),
    { id: OTHER_LANE_ID, kind: 'other', label: null, range: null, statementRange: null, refs: [] } as LaneSource,
  ];
  for (const source of rowSources) {
    const cellMap = agg.get(source.id);
    if (!cellMap || cellMap.size === 0) continue;
    const activity: LaneActivityCell[] = [];
    let first: number | null = null;
    let last: number | null = null;
    for (let c = 0; c < cycles; c++) {
      const a = cellMap.get(c);
      if (!a) {
        activity.push(emptyCell());
        continue;
      }
      const sounds = [...a.soundCounts.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([k]) => k);
      activity.push({
        onsets: a.onsets,
        coverage: a.coverage,
        rhythmKey: hashStr(a.rhythm.sort().join(',')),
        sounds,
      });
      if (a.onsets > 0 || a.coverage > 0) {
        if (first === null) first = c;
        last = c;
      }
    }
    if (first === null) continue; // inactive within the displayed window
    let color: string | null = null;
    const counts = colorCounts.get(source.id);
    if (counts) color = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
    lanes.push({ source, color, activity, firstActiveCycle: first, lastActiveCycle: last });
  }

  return {
    code,
    cycles,
    period,
    queriedCycles: queried,
    lanes,
    sections: computeSections(lanes, cycles),
    cpsAtAnalysis: cps,
    analysisMs: Math.round(performance.now() - t0),
  };
}
