/**
 * Hap → lane attribution by source location.
 *
 * Every hap that came through mini-notation carries `context.locations` (doc
 * byte offsets) — the same data the solo feature filters on. A hap may carry
 * several locations (combineContext concatenates them through pattern
 * combinations); the lane whose range collects the most of them wins.
 * Location-less haps, or haps whose locations live in a shared `const`
 * definition, fall back through the definition usage graph; anything still
 * unresolved lands on the synthetic 'other' lane.
 */
import { locOffsets, type HapLocation } from '@/lib/strudel/audition';
import type { LaneSource } from './types';

export const OTHER_LANE_ID = 'other';

export interface Attributor {
  /** lane id for this hap's locations */
  attribute(locations: HapLocation[] | undefined): string;
}

export function createAttributor(sources: LaneSource[]): Attributor {
  const lanes = sources.filter((s) => (s.kind === 'statement' || s.kind === 'stackArg') && s.range);
  const defs = sources.filter((s) => s.kind === 'definition' && s.range);
  // definition name → the single lane that references it, if unambiguous
  const defOwner = new Map<string, string>();
  for (const def of defs) {
    if (!def.label) continue;
    const referrers = lanes.filter((l) => l.refs.includes(def.label!));
    if (referrers.length === 1) defOwner.set(def.label, referrers[0].id);
  }

  const cache = new Map<string, string>();

  const resolve = (offsets: [number, number][]): string => {
    let best: string | null = null;
    let bestHits = 0;
    let bestWidth = Infinity;
    for (const lane of lanes) {
      const [from, to] = lane.range!;
      let hits = 0;
      for (const [s, e] of offsets) if (s < to && e > from) hits++;
      const width = to - from;
      if (hits > bestHits || (hits === bestHits && hits > 0 && width < bestWidth)) {
        best = lane.id;
        bestHits = hits;
        bestWidth = width;
      }
    }
    if (best) return best;
    // locations inside a const definition: attribute to its sole referrer
    for (const def of defs) {
      const [from, to] = def.range!;
      if (offsets.some(([s, e]) => s < to && e > from)) {
        const owner = def.label ? defOwner.get(def.label) : undefined;
        return owner ?? OTHER_LANE_ID;
      }
    }
    return OTHER_LANE_ID;
  };

  return {
    attribute(locations) {
      if (!locations?.length) return OTHER_LANE_ID;
      const offsets = locations.map(locOffsets).filter((o): o is [number, number] => o !== null);
      if (!offsets.length) return OTHER_LANE_ID;
      const key = offsets.map(([s, e]) => `${s}-${e}`).join(',');
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const id = resolve(offsets);
      cache.set(key, id);
      return id;
    },
  };
}
