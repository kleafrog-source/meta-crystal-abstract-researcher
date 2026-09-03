/**
 * Solo/audition by filtering haps at the output stage.
 *
 * Every hap produced from mini-notation carries source locations in
 * `hap.context.locations` (the same data the editor uses to highlight active
 * events). When an audition range is set, haps whose locations don't
 * intersect the range are silently dropped — no code mutation, no re-eval.
 */

type Output = (hap: Hap, deadline: number, duration: number, cps: number, t?: number) => unknown;

interface Hap {
  context?: { locations?: HapLocation[] };
}

/** Observed shapes across strudel versions: offset pairs or line/column spans. */
export type HapLocation =
  | { start: number; end: number }
  | { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } };

let auditionRange: [number, number] | null = null;

export function setAuditionRange(range: [number, number] | null) {
  auditionRange = range;
}

export function getAuditionRange(): [number, number] | null {
  return auditionRange;
}

/** Remap the active range through a document change (CodeMirror mapPos). */
export function mapAuditionRange(mapPos: (pos: number) => number) {
  if (!auditionRange) return;
  auditionRange = [mapPos(auditionRange[0]), mapPos(auditionRange[1])];
}

export function locOffsets(loc: HapLocation): [number, number] | null {
  if (typeof loc.start === 'number' && typeof loc.end === 'number') {
    return [loc.start, loc.end];
  }
  if (typeof loc.start === 'object' && typeof loc.end === 'object') {
    const start = loc.start as { offset?: number };
    const end = loc.end as { offset?: number };
    if (typeof start.offset === 'number' && typeof end.offset === 'number') {
      return [start.offset, end.offset];
    }
  }
  return null;
}

function hapIntersects(hap: Hap, [from, to]: [number, number]): boolean {
  const locations = hap.context?.locations;
  if (!locations?.length) return false; // location-less haps are muted during audition
  return locations.some((loc) => {
    const offsets = locOffsets(loc);
    if (!offsets) return false;
    return offsets[0] < to && offsets[1] > from;
  });
}

let onOutputError: ((message: string) => void) | null = null;

/** Receives per-hap playback errors (e.g. "sound xyz not found"). */
export function setOutputErrorHandler(cb: ((message: string) => void) | null) {
  onOutputError = cb;
}

/**
 * Besides audition filtering, this guards the output: a bad sound name on one
 * hap reports softly and the rest of the pattern keeps playing, instead of an
 * unhandled rejection killing play().
 */
export function makeFilteredOutput(inner: Output): Output {
  return (hap, deadline, duration, cps, t) => {
    if (auditionRange && !hapIntersects(hap, auditionRange)) return;
    try {
      const result = inner(hap, deadline, duration, cps, t);
      if (result instanceof Promise) {
        return result.catch((err: unknown) => {
          onOutputError?.(err instanceof Error ? err.message : String(err));
        });
      }
      return result;
    } catch (err) {
      onOutputError?.(err instanceof Error ? err.message : String(err));
    }
  };
}
