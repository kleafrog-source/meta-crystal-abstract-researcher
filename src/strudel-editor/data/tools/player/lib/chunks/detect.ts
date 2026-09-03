/**
 * Selection → chunk: find the top-level pattern statement at a doc position
 * and break it into the pieces the UI layers act on (head fn, mini-notation
 * string, method chain with arg ranges).
 *
 * Strudel programs are plain JS: `$: s("bd")` is a LabeledStatement,
 * bare patterns are ExpressionStatements.
 */
import { parse } from 'acorn';
import { classifyChunk, type ChunkType } from './classify';
import type { LaneSource } from '@/lib/timeline/types';
import { parseTimelineString, type TimelineSlot } from '@/lib/timeline/timelineString';

// acorn's types are minimal; we walk untyped nodes deliberately
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ChainArg {
  raw: string;
  numeric: number | null;
  /** absolute doc offsets of the argument expression */
  range: [number, number];
}

export interface ChainCall {
  name: string;
  args: ChainArg[];
  /**
   * For member calls: [dot, callEnd] — deleting this range removes the call.
   * For the head call: the full call expression.
   */
  range: [number, number];
}

export interface ChunkInfo {
  statementRange: [number, number];
  /** exact source of the statement when detected — used to verify freshness */
  statementText: string;
  /** the pattern expression, excluding any `$:` label — append `.fx()` at its end */
  exprRange: [number, number];
  label: string | null;
  headFn: string | null;
  /** contents of the head call's first string literal, quotes excluded */
  miniRange: [number, number] | null;
  miniString: string | null;
  /** calls in source order, head first */
  chain: ChainCall[];
  type: ChunkType;
  /** set when this chunk is a variant inside a pickRestart/arrange voice */
  nested?: { key: string; container: 'pickRestart' | 'pick' | 'arrange' };
}

/**
 * A chunk's ranges are only valid against the exact doc it was detected from.
 * Writes MUST check this — stale offsets corrupt unrelated code.
 */
export function isChunkFresh(doc: string, chunk: ChunkInfo): boolean {
  return doc.slice(chunk.statementRange[0], chunk.statementRange[1]) === chunk.statementText;
}

/** Distinguishes "no statement at pos" from "the document doesn't parse". */
export function docParses(doc: string): boolean {
  return parseTopLevel(doc) !== null;
}

/** Is `pos` inside a string literal of the statement at `pos` (mini string or any string arg)? */
export function insideStringLiteral(doc: string, pos: number): boolean {
  const chunk = detectChunk(doc, pos);
  if (!chunk) return false;
  if (chunk.miniRange && pos >= chunk.miniRange[0] && pos <= chunk.miniRange[1]) return true;
  return chunk.chain.some((call) =>
    call.args.some(
      (arg) => /^["'`]/.test(arg.raw) && pos > arg.range[0] && pos < arg.range[1],
    ),
  );
}

export function detectChunk(doc: string, pos: number): ChunkInfo | null {
  const statements = parseTopLevel(doc);
  if (!statements) return null;
  for (const node of statements) {
    if (pos >= node.start && pos <= node.end) {
      // a cursor inside a pickRestart/arrange variant edits that variant —
      // the step sequencer / piano roll / solo all work on its sub-range
      return findNestedChunk(doc, node, pos) ?? buildChunk(doc, node);
    }
  }
  return null;
}

/** the statement-head `stack(...)` arguments, or the expression itself */
function voiceCandidates(expr: any): any[] {
  let head: any = expr;
  while (head?.type === 'CallExpression' && head.callee.type === 'MemberExpression') {
    head = head.callee.object;
  }
  if (head?.type === 'CallExpression' && head.callee.type === 'Identifier' && head.callee.name === 'stack') {
    return head.arguments;
  }
  return [expr];
}

function findNestedChunk(doc: string, stmtNode: any, pos: number): ChunkInfo | null {
  let label: string | null = null;
  let body = stmtNode;
  if (body.type === 'LabeledStatement') {
    label = body.label.name;
    body = body.body;
  }
  if (body.type !== 'ExpressionStatement') return null;
  const expr = body.expression;

  for (const candidate of voiceCandidates(expr)) {
    if (pos < candidate.start || pos > candidate.end) continue;
    const match = matchVoice(doc, candidate);
    if (match) {
      for (const variant of match.variants) {
        if (pos >= variant.valueRange[0] && pos <= variant.valueRange[1]) {
          return buildChunkFromExpression(doc, variant.node, {
            label,
            nested: { key: variant.key, container: match.kind },
          });
        }
      }
      continue;
    }
    const arr = matchArrange(doc, candidate);
    if (arr) {
      for (let i = 0; i < arr.slots.length; i++) {
        const slot = arr.slots[i];
        if (pos >= slot.valueRange[0] && pos <= slot.valueRange[1]) {
          return buildChunkFromExpression(doc, slot.node, {
            label,
            nested: { key: String(i), container: 'arrange' },
          });
        }
      }
    }
  }
  return null;
}

export function detectAllChunks(doc: string): ChunkInfo[] {
  const statements = parseTopLevel(doc);
  if (!statements) return [];
  return statements.map((node) => buildChunk(doc, node)).filter((c): c is ChunkInfo => c !== null);
}

/**
 * First cursor position (in doc order, optionally restricted to `within`)
 * whose chunk opens a granular editor — a plain editable statement lands on
 * the statement itself, a pickRestart/arrange voice on its first editable
 * variant. Null when nothing inside qualifies.
 */
export function firstEditablePos(doc: string, within?: [number, number] | null): number | null {
  const statements = parseTopLevel(doc);
  if (!statements) return null;
  const inRange = (p: number) => !within || (p >= within[0] && p < within[1]);

  for (const node of statements) {
    if (within && (node.end <= within[0] || node.start >= within[1])) continue;
    const top = buildChunk(doc, node);
    if (top && top.type !== 'unknown' && inRange(node.start)) return node.start;

    let body = node;
    if (body.type === 'LabeledStatement') body = body.body;
    if (body.type !== 'ExpressionStatement') continue;
    for (const candidate of voiceCandidates(body.expression)) {
      const match = matchVoice(doc, candidate);
      const ranges = match
        ? match.variants.map((v) => v.valueRange)
        : (matchArrange(doc, candidate)?.slots.map((s) => s.valueRange) ?? []);
      for (const range of ranges) {
        if (!inRange(range[0])) continue;
        const chunk = detectChunk(doc, range[0]);
        if (chunk && chunk.type !== 'unknown') return range[0];
      }
    }
  }
  return null;
}

/** Top-level statement nodes, or null when the doc doesn't parse. */
export function parseTopLevel(doc: string): any[] | null {
  try {
    const program = parse(doc, {
      ecmaVersion: 'latest',
      allowAwaitOutsideFunction: true,
    }) as any;
    return program.body;
  } catch {
    return null; // mid-keystroke syntax error; caller keeps last good chunk
  }
}

function buildChunk(doc: string, node: any): ChunkInfo | null {
  let label: string | null = null;
  let body = node;
  if (node.type === 'LabeledStatement') {
    label = node.label.name;
    body = node.body;
  }
  if (body.type !== 'ExpressionStatement') return null;
  return buildChunkFromExpression(doc, body.expression, { label, statementRange: [node.start, node.end] });
}

/**
 * Build a ChunkInfo for any expression node. For nested chunks (pickRestart
 * variants) the variant's own range plays the statement role, so freshness
 * checks, write-back, and solo all operate on the sub-range unchanged.
 */
export function buildChunkFromExpression(
  doc: string,
  expr: any,
  opts: { label: string | null; statementRange?: [number, number]; nested?: ChunkInfo['nested'] } = { label: null },
): ChunkInfo {
  const chain = collectChain(doc, expr);
  const head = chain.length > 0 ? chain[0] : null;
  const headFn = head?.name ?? null;

  let miniRange: [number, number] | null = null;
  let miniString: string | null = null;
  const headNode = (expr as any).__headNode;
  if (headNode) {
    const firstString = headNode.arguments.find(
      (a: any) => (a.type === 'Literal' && typeof a.value === 'string') || a.type === 'TemplateLiteral',
    );
    if (firstString) {
      miniRange = [firstString.start + 1, firstString.end - 1];
      miniString = doc.slice(firstString.start + 1, firstString.end - 1);
    }
  }

  const statementRange = opts.statementRange ?? ([expr.start, expr.end] as [number, number]);
  const info: ChunkInfo = {
    statementRange,
    statementText: doc.slice(statementRange[0], statementRange[1]),
    exprRange: [expr.start, expr.end],
    label: opts.label,
    headFn,
    miniRange,
    miniString,
    chain,
    type: 'unknown',
    ...(opts.nested ? { nested: opts.nested } : {}),
  };
  info.type = classifyChunk(info);
  return info;
}

// ---------------------------------------------------------------------------
// Voice shape matchers for the arrangement recognizer (Tier 2):
//   (a) "<timeline>".pickRestart([...] | {...})  — optionally under more chain
//   (b) arrange([n, pat], ...)
// ---------------------------------------------------------------------------

export interface VoiceVariant {
  /** object key, or the array index as a string */
  key: string;
  keyRange: [number, number] | null;
  valueRange: [number, number];
  /** the variant's AST node (for nested chunk building) */
  node: any;
}

export interface VoiceMatch {
  kind: 'pickRestart' | 'pick';
  exprRange: [number, number];
  /** inner content of the timeline string literal, quotes excluded */
  timelineStringRange: [number, number];
  /** slots with ABSOLUTE doc offsets */
  slots: TimelineSlot[];
  totalCycles: number;
  container: 'array' | 'object';
  containerRange: [number, number];
  variants: VoiceVariant[];
}

/** Match `"<timeline>".pickRestart(...)` (with any trailing chain) or null. */
export function matchVoice(doc: string, expr: any): VoiceMatch | null {
  // descend the member-call spine; the last call before the root is the
  // first chained call, i.e. literal.pickRestart(...)
  let node = expr;
  let firstCall: any = null;
  while (node?.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed) {
    firstCall = node;
    node = node.callee.object;
  }
  if (!firstCall || node?.type !== 'Literal' || typeof node.value !== 'string') return null;
  const name = firstCall.callee.property.name;
  if (name !== 'pickRestart' && name !== 'pick') return null;
  if (firstCall.arguments.length !== 1) return null;
  const container = firstCall.arguments[0];

  const parsed = parseTimelineString(node.value);
  if (!parsed.ok) return null;
  const contentStart = node.start + 1;

  const variants: VoiceVariant[] = [];
  let containerKind: 'array' | 'object';
  if (container.type === 'ArrayExpression') {
    containerKind = 'array';
    for (let i = 0; i < container.elements.length; i++) {
      const el = container.elements[i];
      if (!el || el.type === 'SpreadElement') return null;
      variants.push({ key: String(i), keyRange: null, valueRange: [el.start, el.end], node: el });
    }
  } else if (container.type === 'ObjectExpression') {
    containerKind = 'object';
    for (const prop of container.properties) {
      if (prop.type !== 'Property' || prop.computed || prop.kind !== 'init') return null;
      const key =
        prop.key.type === 'Identifier'
          ? prop.key.name
          : prop.key.type === 'Literal' && typeof prop.key.value === 'string'
            ? prop.key.value
            : null;
      if (key === null) return null;
      variants.push({
        key,
        keyRange: [prop.key.start, prop.key.end],
        valueRange: [prop.value.start, prop.value.end],
        node: prop.value,
      });
    }
  } else {
    return null;
  }

  // every non-rest token must point at an existing variant
  const keys = new Set(variants.map((v) => v.key));
  for (const slot of parsed.slots) {
    if (slot.token !== '~' && !keys.has(slot.token)) return null;
  }

  return {
    kind: name,
    exprRange: [expr.start, expr.end],
    timelineStringRange: [contentStart, node.end - 1],
    slots: parsed.slots.map((s) => ({
      ...s,
      tokenRange: [contentStart + s.tokenRange[0], contentStart + s.tokenRange[1]],
      slotRange: [contentStart + s.slotRange[0], contentStart + s.slotRange[1]],
    })),
    totalCycles: parsed.total,
    container: containerKind,
    containerRange: [container.start, container.end],
    variants,
  };
}

export interface ArrangeSlot {
  weight: number;
  weightRange: [number, number];
  valueRange: [number, number];
  node: any;
}

export interface ArrangeMatch {
  kind: 'arrange';
  exprRange: [number, number];
  slots: ArrangeSlot[];
  totalCycles: number;
}

/** Match `arrange([n, pat], ...)` (with any trailing chain) or null. */
export function matchArrange(doc: string, expr: any): ArrangeMatch | null {
  let head = expr;
  while (head?.type === 'CallExpression' && head.callee.type === 'MemberExpression') {
    head = head.callee.object;
  }
  if (head?.type !== 'CallExpression' || head.callee.type !== 'Identifier' || head.callee.name !== 'arrange') {
    return null;
  }
  if (head.arguments.length < 2) return null;
  const slots: ArrangeSlot[] = [];
  let total = 0;
  for (const arg of head.arguments) {
    if (arg.type !== 'ArrayExpression' || arg.elements.length !== 2) return null;
    const [num, pat] = arg.elements;
    if (!num || num.type !== 'Literal' || typeof num.value !== 'number') return null;
    if (!Number.isInteger(num.value) || num.value < 1) return null;
    if (!pat) return null;
    slots.push({
      weight: num.value,
      weightRange: [num.start, num.end],
      valueRange: [pat.start, pat.end],
      node: pat,
    });
    total += num.value;
  }
  return { kind: 'arrange', exprRange: [expr.start, expr.end], slots, totalCycles: total };
}

/**
 * Walk the callee spine of a chained expression, e.g.
 * `s("bd").bank("x").gain(0.6)` → [s, bank, gain] in source order.
 * Stashes the innermost (head) call node on the expression as __headNode.
 */
function collectChain(doc: string, expr: any): ChainCall[] {
  const calls: ChainCall[] = [];
  let node = expr;
  while (node) {
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
        const dot = doc.lastIndexOf('.', callee.property.start);
        calls.push({
          name: callee.property.name,
          args: node.arguments.map((a: any) => toArg(doc, a)),
          range: [dot, node.end],
        });
        node = callee.object;
        continue;
      }
      if (callee.type === 'Identifier') {
        calls.push({
          name: callee.name,
          args: node.arguments.map((a: any) => toArg(doc, a)),
          range: [node.start, node.end],
        });
        expr.__headNode = node;
      }
    }
    break;
  }
  return calls.reverse();
}

// ---------------------------------------------------------------------------
// Lane scanning for the timeline: rows are top-level statements, or the
// arguments of a statement-head stack(...). Definitions (`const x = ...`)
// aren't rows themselves but feed hap attribution via the refs usage graph.
// ---------------------------------------------------------------------------

export interface LaneScan {
  lanes: LaneSource[];
  /** static guess at the song length from `<...>` weight sums, in cycles */
  horizonHint: number | null;
}

export function detectLanes(doc: string): LaneScan | null {
  const statements = parseTopLevel(doc);
  if (!statements) return null;
  const lanes: LaneSource[] = [];
  const hints: number[] = [];

  statements.forEach((node: any, idx: number) => {
    let label: string | null = null;
    let body = node;
    if (node.type === 'LabeledStatement') {
      label = node.label.name;
      body = node.body;
    }
    if (body.type === 'VariableDeclaration') {
      for (const decl of body.declarations) {
        if (decl.id?.type !== 'Identifier' || !decl.init) continue;
        lanes.push({
          id: `def:${decl.id.name}`,
          kind: 'definition',
          label: decl.id.name,
          range: [decl.init.start, decl.init.end],
          statementRange: [node.start, node.end],
          refs: collectRefs(decl.init),
        });
        const h = hintFromNode(doc, decl.init);
        if (h) hints.push(h);
      }
      return;
    }
    if (body.type !== 'ExpressionStatement') return;
    const expr = body.expression;

    // walk the member-call spine down to the head, e.g. stack(...).cpm(128/4)
    let headNode: any = expr;
    while (headNode?.type === 'CallExpression' && headNode.callee.type === 'MemberExpression') {
      headNode = headNode.callee.object;
    }
    if (
      headNode?.type === 'CallExpression' &&
      headNode.callee.type === 'Identifier' &&
      headNode.callee.name === 'stack' &&
      headNode.arguments.length >= 2
    ) {
      headNode.arguments.forEach((arg: any, i: number) => {
        lanes.push({
          id: `stack:${idx}:${i}`,
          kind: 'stackArg',
          label: laneLabel(doc, arg, null),
          range: [arg.start, arg.end],
          statementRange: [node.start, node.end],
          refs: collectRefs(arg),
        });
        const h = hintFromNode(doc, arg);
        if (h) hints.push(h);
      });
      return;
    }

    lanes.push({
      id: `stmt:${idx}`,
      kind: 'statement',
      label: laneLabel(doc, expr, label),
      range: [expr.start, expr.end],
      statementRange: [node.start, node.end],
      refs: collectRefs(expr),
    });
    const h = hintFromNode(doc, expr);
    if (h) hints.push(h);
  });

  // a shared timeline gives every lane the same sum, so the LCM stays small;
  // a runaway LCM means the hint is meaningless — drop it
  let hint: number | null = null;
  for (const h of hints) {
    hint = hint === null ? h : lcm(hint, h);
    if (hint > 512) {
      hint = null;
      break;
    }
  }
  return { lanes, horizonHint: hint };
}

function lcm(a: number, b: number): number {
  const g = ((x: number, y: number) => {
    while (y) [x, y] = [y, x % y];
    return x;
  })(a, b);
  return (a / g) * b;
}

/** Human label for a lane: explicit $label, else sound name, else color, else head fn. */
function laneLabel(doc: string, node: any, label: string | null): string | null {
  if (label && label !== '$') return label;
  const src = doc.slice(node.start, node.end);
  const sound = src.match(/(?:^|[^\w])s\(\s*["'`]([^"'`\n]{1,32})/);
  if (sound) return sound[1];
  const note = src.match(/(?:^|[^\w])(?:note|n)\(\s*["'`]([^"'`\n]{1,32})/);
  if (note) return note[1];
  const color = src.match(/\.color\(\s*["'`]([^"'`\n]+?)["'`]/);
  if (color) return color[1];
  let head: any = node;
  while (head?.type === 'CallExpression' && head.callee.type === 'MemberExpression') {
    head = head.callee.object;
  }
  if (head?.type === 'CallExpression' && head.callee.type === 'Identifier') return head.callee.name;
  return label;
}

/** Identifier names referenced in a subtree (skipping member/property name positions). */
function collectRefs(root: any): string[] {
  const names = new Set<string>();
  (function walk(node: any): void {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier':
        names.add(node.name);
        return;
      case 'MemberExpression':
        walk(node.object);
        if (node.computed) walk(node.property);
        return;
      case 'Property':
        if (node.computed) walk(node.key);
        walk(node.value);
        return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  })(root);
  return [...names];
}

/**
 * Static horizon hint: the largest `<...>` weight sum found in the subtree
 * (× a directly-chained `.slow(k)`). Only used to seed how many cycles the
 * analysis queries first — never trusted as the song length, because `.cpm()`
 * rescales cycle counts at eval time.
 */
function hintFromNode(doc: string, root: any): number | null {
  let best: number | null = null;
  (function walk(node: any): void {
    if (!node || typeof node.type !== 'string') return;
    let slowFactor = 1;
    let literal: any = null;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.name === 'slow' &&
      node.callee.object.type === 'Literal' &&
      typeof node.callee.object.value === 'string' &&
      node.arguments.length === 1 &&
      node.arguments[0].type === 'Literal' &&
      typeof node.arguments[0].value === 'number'
    ) {
      literal = node.callee.object;
      slowFactor = node.arguments[0].value;
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      literal = node;
    }
    if (literal) {
      const sum = angleWeightSum(literal.value);
      if (sum !== null) {
        const cycles = sum * slowFactor;
        if (best === null || cycles > best) best = cycles;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  })(root);
  return best;
}

/** Weight sum of a whole-string `<...>` alternation, or null if not one. */
export function angleWeightSum(src: string): number | null {
  const trimmed = src.trim();
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return null;
  const inner = trimmed.slice(1, -1);
  // split into top-level tokens, respecting nested brackets
  const tokens: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if ('[<{('.includes(ch)) depth++;
    else if (']>})'.includes(ch)) depth--;
    if (depth === 0 && /\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  if (depth !== 0 || tokens.length === 0) return null;
  let sum = 0;
  for (const token of tokens) {
    const weight = token.match(/@([\d.]+)$/);
    const repeat = token.match(/!(\d+)$/);
    if (weight) sum += Number(weight[1]);
    else if (repeat) sum += Number(repeat[1]);
    else sum += 1;
  }
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

function toArg(doc: string, node: any): ChainArg {
  let numeric: number | null = null;
  if (node.type === 'Literal' && typeof node.value === 'number') {
    numeric = node.value;
  } else if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'Literal' &&
    typeof node.argument.value === 'number'
  ) {
    numeric = -node.argument.value;
  }
  return {
    raw: doc.slice(node.start, node.end),
    numeric,
    range: [node.start, node.end],
  };
}
