/**
 * Tier-3 authoring: turn today's looping statements into a song. Each
 * included statement becomes an object-form pickRestart voice — one variant
 * key per (unique) section, every section initially playing a copy of the
 * original pattern — under a shared `"<intro@4 verse@8 …>"` timeline. The
 * output is maximally recognizable by the Tier-2 recognizer, so the strip's
 * editing affordances light up immediately; there is no separate arrangement
 * state, the generated code IS the arrangement.
 */
import { serializeTimelineSlots } from './timelineString';
import type { ChunkInfo } from '@/lib/chunks/detect';
import type { RangeEdit } from './edits';

export interface SectionSpec {
  name: string;
  cycles: number;
}

export const DEFAULT_PLAN: SectionSpec[] = [
  { name: 'intro', cycles: 4 },
  { name: 'verse', cycles: 8 },
  { name: 'chorus', cycles: 8 },
  { name: 'outro', cycles: 4 },
];

export function validatePlan(plan: SectionSpec[]): string | null {
  if (plan.length === 0) return 'add at least one section';
  for (const s of plan) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.name)) return `"${s.name}" — names must be plain identifiers`;
    if (!Number.isInteger(s.cycles) || s.cycles < 1) return `"${s.name}" needs a whole number of cycles`;
  }
  return null;
}

/** One voice's generated source. Repeated section names share one variant. */
export function generateVoice(exprText: string, label: string | null, plan: SectionSpec[]): string {
  const timeline = serializeTimelineSlots(plan.map((s) => ({ token: s.name, weight: s.cycles })));
  const uniqueNames = [...new Set(plan.map((s) => s.name))];
  const entries = uniqueNames.map((name) => `  ${name}: ${exprText},`).join('\n');
  const prefix = label ? `${label}: ` : '';
  return `${prefix}"${timeline}".pickRestart({\n${entries}\n})`;
}

/**
 * Replacement edits turning every included statement into a voice. Verifies
 * each chunk against the current doc (stale offsets must never write).
 */
export function authorArrangement(doc: string, chunks: ChunkInfo[], plan: SectionSpec[]): RangeEdit[] | null {
  if (validatePlan(plan) !== null || chunks.length === 0) return null;
  const edits: RangeEdit[] = [];
  for (const chunk of chunks) {
    if (doc.slice(chunk.statementRange[0], chunk.statementRange[1]) !== chunk.statementText) return null;
    const exprText = doc.slice(chunk.exprRange[0], chunk.exprRange[1]);
    edits.push({ range: chunk.statementRange, text: generateVoice(exprText, chunk.label, plan) });
  }
  return edits;
}
