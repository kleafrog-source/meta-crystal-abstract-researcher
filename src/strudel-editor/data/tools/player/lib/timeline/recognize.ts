/**
 * Tier-2 arrangement recognition: find every voice in the doc whose structure
 * matches a recognizable idiom — `"<timeline>".pickRestart([...]|{...})` or
 * `arrange([n, pat], ...)` — at top level or as arguments of a statement-head
 * stack(...). Voices that don't match simply aren't in the result; the strip
 * degrades them to the analysis-only view (same UX law as the notation
 * parser's "edit as code" fallback).
 *
 * A shared timeline exists when every recognized voice spans the same total
 * cycle count (the voices need NOT share cut points — the union of their
 * cumulative-weight boundaries becomes the section grid).
 */
import {
  matchArrange,
  matchVoice,
  parseTopLevel,
  type ArrangeMatch,
  type VoiceMatch,
} from '@/lib/chunks/detect';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ArrangedVoice {
  /** lane id, same scheme as detectLanes — pairs voices with strip rows */
  laneId: string;
  label: string | null;
  statementRange: [number, number];
  statementText: string;
  match: VoiceMatch | ArrangeMatch;
}

export interface SongArrangement {
  /** exact doc this was recognized from — freshness token */
  doc: string;
  voices: ArrangedVoice[];
  shared: {
    totalCycles: number;
    /** interior cut points (cycles), sorted — drag handles live here */
    boundaries: number[];
    /** intervals between consecutive cut points, incl. 0 and total */
    sections: { start: number; end: number }[];
  } | null;
}

/**
 * Pixels-per-cycle conversion between the strip's scheduler-cycle axis and an
 * arrangement's musical-cycle weights: `.cpm()` rescales eval-time, so the
 * detected period vs the arrangement total gives the factor. A period that
 * doesn't plausibly correspond to the arrangement (e.g. all sections still
 * identical → period 1) means no rescaling.
 */
export function arrangementScale(
  period: { cycles: { n: number; d: number } } | null,
  totalCycles: number,
): number {
  const p = period ? period.cycles.n / period.cycles.d : null;
  if (p && p >= totalCycles * 0.5 && p <= totalCycles * 2) return p / totalCycles;
  return 1;
}

/** Cumulative interior cut points of a voice's slots. */
export function voiceCuts(match: VoiceMatch | ArrangeMatch): number[] {
  const cuts: number[] = [];
  let at = 0;
  for (const slot of match.slots) {
    at += slot.weight;
    cuts.push(at);
  }
  cuts.pop(); // the total isn't an interior boundary
  return cuts;
}

export function recognizeArrangement(doc: string): SongArrangement | null {
  const statements = parseTopLevel(doc);
  if (!statements) return null;

  const voices: ArrangedVoice[] = [];
  statements.forEach((node: any, idx: number) => {
    let label: string | null = null;
    let body = node;
    if (node.type === 'LabeledStatement') {
      label = node.label.name;
      body = node.body;
    }
    if (body.type !== 'ExpressionStatement') return;
    const expr = body.expression;

    let head: any = expr;
    while (head?.type === 'CallExpression' && head.callee.type === 'MemberExpression') {
      head = head.callee.object;
    }
    const statementRange: [number, number] = [node.start, node.end];
    const statementText = doc.slice(node.start, node.end);

    const tryCandidate = (candidate: any, laneId: string) => {
      const match = matchVoice(doc, candidate) ?? matchArrange(doc, candidate);
      if (match) voices.push({ laneId, label, statementRange, statementText, match });
    };

    if (head?.type === 'CallExpression' && head.callee.type === 'Identifier' && head.callee.name === 'stack' && head.arguments.length >= 2) {
      head.arguments.forEach((arg: any, i: number) => tryCandidate(arg, `stack:${idx}:${i}`));
    } else {
      tryCandidate(expr, `stmt:${idx}`);
    }
  });

  if (voices.length === 0) return { doc, voices, shared: null };

  const totals = new Set(voices.map((v) => v.match.totalCycles));
  let shared: SongArrangement['shared'] = null;
  if (totals.size === 1) {
    const totalCycles = voices[0].match.totalCycles;
    const boundaries = [...new Set(voices.flatMap((v) => voiceCuts(v.match)))].sort((a, b) => a - b);
    const edges = [0, ...boundaries, totalCycles];
    const sections = edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1] }));
    shared = { totalCycles, boundaries, sections };
  }
  return { doc, voices, shared };
}
