/**
 * Tier-2 arrangement edit operations. All pure: (doc, arrangement, op-args) →
 * a list of {range, text} replacements, applied atomically by the caller via
 * replaceRanges (one transaction = one undo). Every timeline-string mutation
 * re-serializes the entire inner string — one canonical form, one serializer.
 *
 * Note on splits: cutting a slot like `0@19` into `0@10 x@4 0@5` makes the
 * tail restart pattern 0 at its own boundary (pickRestart semantics) where it
 * previously ran through — that's inherent to inserting something mid-slot.
 */
import { serializeTimelineSlots } from './timelineString';
import { voiceCuts, type ArrangedVoice, type SongArrangement } from './recognize';
import type { ArrangeMatch, VoiceMatch } from '@/lib/chunks/detect';

export type RangeEdit = { range: [number, number]; text: string };
export type EditResult = { ok: true; edits: RangeEdit[] } | { ok: false; reason: string };

const fail = (reason: string): EditResult => ({ ok: false, reason });

function isPickVoice(match: VoiceMatch | ArrangeMatch): match is VoiceMatch {
  return match.kind === 'pickRestart' || match.kind === 'pick';
}

function fresh(doc: string, arr: SongArrangement): boolean {
  return arr.doc === doc;
}

/** weights-only view of a voice's slots */
function weights(match: VoiceMatch | ArrangeMatch): { token: string; weight: number }[] {
  if (isPickVoice(match)) return match.slots.map((s) => ({ token: s.token, weight: s.weight }));
  return match.slots.map((s, i) => ({ token: String(i), weight: s.weight }));
}

function reserialize(match: VoiceMatch, slots: { token: string; weight: number }[]): RangeEdit {
  // timelineStringRange excludes the quotes but includes the <...> brackets
  return { range: match.timelineStringRange, text: serializeTimelineSlots(slots) };
}

/**
 * Move the shared boundary at `boundary` cycles by `delta` (±, whole cycles).
 * Voices with a slot edge exactly there transfer weight between the adjacent
 * slots; voices whose slot spans the boundary are untouched. Delta is clamped
 * so no participating weight drops below 1; per-voice totals are invariant.
 */
export function dragBoundary(doc: string, arr: SongArrangement, boundary: number, delta: number): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  if (!Number.isInteger(delta)) return fail('delta must be whole cycles');

  // collect participating voices and the global clamp
  const participants: { voice: ArrangedVoice; index: number }[] = [];
  let dMin = -Infinity;
  let dMax = Infinity;
  for (const voice of arr.voices) {
    const cuts = voiceCuts(voice.match);
    const index = cuts.indexOf(boundary);
    if (index === -1) continue;
    const w = weights(voice.match);
    dMin = Math.max(dMin, -(w[index].weight - 1));
    dMax = Math.min(dMax, w[index + 1].weight - 1);
    participants.push({ voice, index });
  }
  if (participants.length === 0) return fail('no voice has an edge at this boundary');
  const d = Math.max(dMin, Math.min(dMax, delta));
  if (d === 0) return fail('boundary is locked by a 1-cycle slot');

  const edits: RangeEdit[] = [];
  for (const { voice, index } of participants) {
    if (isPickVoice(voice.match)) {
      const slots = weights(voice.match);
      slots[index].weight += d;
      slots[index + 1].weight -= d;
      edits.push(reserialize(voice.match, slots));
    } else {
      const left = voice.match.slots[index];
      const right = voice.match.slots[index + 1];
      edits.push({ range: left.weightRange, text: String(left.weight + d) });
      edits.push({ range: right.weightRange, text: String(right.weight - d) });
    }
  }
  return { ok: true, edits };
}

/** Point one slot at a different variant (or rest). pickRestart voices only. */
export function setSlotToken(
  doc: string,
  arr: SongArrangement,
  voiceIndex: number,
  slotIndex: number,
  token: string,
): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  const voice = arr.voices[voiceIndex];
  if (!voice || !isPickVoice(voice.match)) return fail('not an editable pickRestart voice');
  const slots = weights(voice.match);
  if (slotIndex < 0 || slotIndex >= slots.length) return fail('no such slot');
  if (token !== '~' && !voice.match.variants.some((v) => v.key === token)) return fail(`no variant "${token}"`);
  slots[slotIndex] = { ...slots[slotIndex], token };
  return { ok: true, edits: [reserialize(voice.match, slots)] };
}

/**
 * Assign `token` to the [start, end) cycle window of one voice, splitting
 * spanning slots as needed. Slot subdivisions outside the window survive.
 */
export function setCell(
  doc: string,
  arr: SongArrangement,
  voiceIndex: number,
  start: number,
  end: number,
  token: string,
): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  const voice = arr.voices[voiceIndex];
  if (!voice || !isPickVoice(voice.match)) return fail('not an editable pickRestart voice');
  if (!(end > start)) return fail('empty window');
  if (token !== '~' && !voice.match.variants.some((v) => v.key === token)) return fail(`no variant "${token}"`);

  const out: { token: string; weight: number }[] = [];
  let at = 0;
  let inserted = false;
  for (const slot of weights(voice.match)) {
    const a = at;
    const b = at + slot.weight;
    at = b;
    if (b <= start || a >= end) {
      out.push(slot);
      continue;
    }
    if (a < start) out.push({ token: slot.token, weight: start - a });
    if (!inserted) {
      out.push({ token, weight: Math.min(end, voice.match.totalCycles) - start });
      inserted = true;
    }
    if (b > end) out.push({ token: slot.token, weight: b - end });
  }
  if (!inserted) return fail('window is outside the timeline');
  return { ok: true, edits: [reserialize(voice.match, out)] };
}

/** Eligibility for structural section ops: every voice has edges at both endpoints. */
function sectionAligned(arr: SongArrangement, start: number, end: number): boolean {
  return arr.voices.every((voice) => {
    const edges = new Set([0, ...voiceCuts(voice.match), voice.match.totalCycles]);
    return edges.has(start) && edges.has(end);
  });
}

/** Delete the [start, end) section from every voice's timeline. */
export function deleteSection(doc: string, arr: SongArrangement, start: number, end: number): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  if (!arr.shared) return fail('voices do not share a timeline');
  if (arr.voices.some((v) => !isPickVoice(v.match))) return fail('arrange() voices: edit as code');
  if (!sectionAligned(arr, start, end)) return fail('a voice spans this boundary — edit as code');
  if (end - start >= arr.shared.totalCycles) return fail('cannot delete the whole song');

  const edits: RangeEdit[] = [];
  for (const voice of arr.voices) {
    const match = voice.match as VoiceMatch;
    const out: { token: string; weight: number }[] = [];
    let at = 0;
    for (const slot of weights(match)) {
      const a = at;
      at += slot.weight;
      if (a >= start && at <= end) continue;
      out.push(slot);
    }
    edits.push(reserialize(match, out));
  }
  return { ok: true, edits };
}

/**
 * Remove the [start, end) cycle window from every voice's timeline, shrinking
 * slots that span it and dropping slots that fall entirely inside. Unlike
 * deleteSection this needs no slot edges at the endpoints, so it can take a
 * single cycle out of the middle of a `verse@8`.
 */
export function deleteCycles(doc: string, arr: SongArrangement, start: number, end: number): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  if (!arr.shared) return fail('voices do not share a timeline');
  if (arr.voices.some((v) => !isPickVoice(v.match))) return fail('arrange() voices: edit as code');
  if (!Number.isInteger(start) || !Number.isInteger(end) || !(end > start)) return fail('empty window');
  if (start < 0 || end > arr.shared.totalCycles) return fail('window is outside the timeline');
  if (end - start >= arr.shared.totalCycles) return fail('cannot delete the whole song');

  const edits: RangeEdit[] = [];
  for (const voice of arr.voices) {
    const match = voice.match as VoiceMatch;
    const out: { token: string; weight: number }[] = [];
    let at = 0;
    for (const slot of weights(match)) {
      const a = at;
      const b = at + slot.weight;
      at = b;
      const overlap = Math.max(0, Math.min(b, end) - Math.max(a, start));
      if (slot.weight - overlap > 0) out.push({ ...slot, weight: slot.weight - overlap });
    }
    edits.push(reserialize(match, out));
  }
  return { ok: true, edits };
}

/** Duplicate the [start, end) section in place (the copy follows the original). */
export function duplicateSection(doc: string, arr: SongArrangement, start: number, end: number): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  if (!arr.shared) return fail('voices do not share a timeline');
  if (arr.voices.some((v) => !isPickVoice(v.match))) return fail('arrange() voices: edit as code');
  if (!sectionAligned(arr, start, end)) return fail('a voice spans this boundary — edit as code');

  const edits: RangeEdit[] = [];
  for (const voice of arr.voices) {
    const match = voice.match as VoiceMatch;
    const out: { token: string; weight: number }[] = [];
    let at = 0;
    for (const slot of weights(match)) {
      at += slot.weight;
      out.push(slot);
      if (at === end) {
        // append a copy of the covered slots right after the section
        let inner = 0;
        for (const s of weights(match)) {
          const ia = inner;
          inner += s.weight;
          if (ia >= start && inner <= end) out.push({ ...s });
        }
      }
    }
    edits.push(reserialize(match, out));
  }
  return { ok: true, edits };
}

/** Rename an object-form variant key and every timeline token pointing at it. */
export function renameVariant(
  doc: string,
  arr: SongArrangement,
  voiceIndex: number,
  oldKey: string,
  newKey: string,
): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  const voice = arr.voices[voiceIndex];
  if (!voice || !isPickVoice(voice.match)) return fail('not an editable pickRestart voice');
  if (voice.match.container !== 'object') return fail('array variants have no names');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)) return fail('name must be a plain identifier');
  if (voice.match.variants.some((v) => v.key === newKey)) return fail(`"${newKey}" already exists`);
  const variant = voice.match.variants.find((v) => v.key === oldKey);
  if (!variant?.keyRange) return fail(`no variant "${oldKey}"`);

  const slots = weights(voice.match).map((s) => (s.token === oldKey ? { ...s, token: newKey } : s));
  return { ok: true, edits: [reserialize(voice.match, slots), { range: variant.keyRange, text: newKey }] };
}

/** Add a variant to an object-form voice, copying `fromKey`'s source (or silence). */
export function addVariant(
  doc: string,
  arr: SongArrangement,
  voiceIndex: number,
  newKey: string,
  fromKey?: string,
): EditResult {
  if (!fresh(doc, arr)) return fail('arrangement is stale');
  const voice = arr.voices[voiceIndex];
  if (!voice || !isPickVoice(voice.match)) return fail('not an editable pickRestart voice');
  if (voice.match.container !== 'object') return fail('add variants to object-form voices only');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)) return fail('name must be a plain identifier');
  if (voice.match.variants.some((v) => v.key === newKey)) return fail(`"${newKey}" already exists`);

  let source = 'silence';
  if (fromKey !== undefined) {
    const from = voice.match.variants.find((v) => v.key === fromKey);
    if (!from) return fail(`no variant "${fromKey}"`);
    source = doc.slice(from.valueRange[0], from.valueRange[1]);
  }
  const last = voice.match.variants[voice.match.variants.length - 1];
  const insertAt = last ? last.valueRange[1] : voice.match.containerRange[0] + 1;
  return { ok: true, edits: [{ range: [insertAt, insertAt], text: `, ${newKey}: ${source}` }] };
}
