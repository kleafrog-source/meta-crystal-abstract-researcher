import { detectNodePhase, sortSelectedNodes } from "./order";
import type { StrudelNode } from "./strudel-flow-store";
import type { StrudelAppliedControl, StrudelProject } from "./schema";

const SOUND_MAP: Record<string, string> = {
  sine: "sine",
  sawtooth: "sawtooth",
  square: "square",
  triangle: "triangle",
  noise: "noise",
  fm: "sawtooth",
  am: "triangle",
};

type StyleFlavor = "ambient" | "retro" | "industrial" | "idm" | "dub" | "default";

type SourceFragment = {
  key: string;
  expression: string;
};

type LayerBundle = {
  sources: SourceFragment[];
  appliedControls: StrudelAppliedControl[];
  ignoredParamIds: string[];
};

type NodeRole = "drums" | "bass" | "harmony" | "melody" | "texture";

type NodeContext = {
  paramIds: string[];
  orderedParamIds: string[];
  roleSet: Set<NodeRole>;
  blockTypeSet: Set<string>;
  sectionRoleMap: Map<string, Set<NodeRole>>;
  roleParamMap: Map<NodeRole, string[]>;
  sourceSignature: string;
  scoreAverage: number;
  priorityCount: number;
};

type SectionDefinition = {
  key: "intro" | "main" | "break" | "return";
  bars: number;
  expression: string;
};

const EFFECT_BUILDERS: Partial<Record<string, (style: StyleFlavor) => StrudelAppliedControl>> = {
  gain: (style) => ({
    paramId: "gain",
    expression: style === "ambient" ? ".gain(0.9)" : style === "industrial" ? ".gain(1.25)" : ".gain(1.1)",
    reason: "Volume contour from selected dynamics layer",
  }),
  lpf: (style) => ({
    paramId: "lpf",
    expression: style === "ambient" || style === "dub" ? '.lpf("1100 1.4")' : '.lpf("1600 1.1")',
    reason: "Low-pass shaping from selected filter layer",
  }),
  hpf: (style) => ({
    paramId: "hpf",
    expression: style === "industrial" || style === "idm" ? '.hpf("380 1.2")' : '.hpf("220 1")',
    reason: "High-pass cleanup from selected filter layer",
  }),
  crush: (style) => ({
    paramId: "crush",
    expression: style === "retro" ? ".crush(8)" : style === "idm" ? ".crush(5)" : ".crush(4)",
    reason: "Bit reduction from texture layer",
  }),
  distort: (style) => ({
    paramId: "distort",
    expression: style === "industrial" ? ".distort(0.92)" : ".distort(0.65)",
    reason: "Drive and saturation from texture layer",
  }),
  pan: (style) => ({
    paramId: "pan",
    expression: style === "ambient" ? '.pan(sine.range(0.2,0.8).slow(4))' : '.pan("<0.35 0.65>")',
    reason: "Stereo motion from spatial layer",
  }),
  reverb: (style) => ({
    paramId: "reverb",
    expression:
      style === "dub"
        ? '.room("0.35").rsize(2.4).rfade(0.82).rlp(7600).rdim(5400)'
        : '.room("0.22").rsize(1.8).rfade(0.7).rlp(9000).rdim(7000)',
    reason: "Mapped to room/reverb chain",
  }),
  room: (style) => ({
    paramId: "room",
    expression:
      style === "ambient"
        ? '.room("0.34").rsize(2.6).rfade(0.84).rlp(8400).rdim(6200)'
        : style === "dub"
          ? '.room("0.28").rsize(2.2).rfade(0.78).rlp(7800).rdim(5600)'
          : '.room("0.18").rsize(1.7).rfade(0.65).rlp(9000).rdim(7000)',
    reason: "Room ambience from spatial layer",
  }),
  fast: (style) => ({
    paramId: "fast",
    expression: style === "techno" ? ".fast(1.8)" : ".fast(1.55)",
    reason: "Increase event density from temporal layer",
  }),
  slow: (style) => ({
    paramId: "slow",
    expression: style === "ambient" ? ".slow(1.5)" : ".slow(1.2)",
    reason: "Stretch phrase from temporal layer",
  }),
};

function uniqueOrderedParamIds(nodes: StrudelNode[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const node of sortSelectedNodes(nodes)) {
    if (seen.has(node.data.paramId)) continue;
    seen.add(node.data.paramId);
    ordered.push(node.data.paramId);
  }
  return ordered;
}

function readStringSetting(node: StrudelNode, key: string) {
  const value = node.data.settings?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildNodeContext(nodes: StrudelNode[]): NodeContext {
  const orderedNodes = sortSelectedNodes(nodes);
  const paramIds = uniqueOrderedParamIds(nodes);
  const orderedParamIds = orderedNodes.map((node) => node.data.paramId);
  const roleSet = new Set<NodeRole>();
  const blockTypeSet = new Set<string>();
  const sectionRoleMap = new Map<string, Set<NodeRole>>();
  const roleParamMap = new Map<NodeRole, string[]>();
  const signatureParts: string[] = [];
  let scoreSum = 0;
  let scoredCount = 0;
  let priorityCount = 0;

  for (const node of orderedNodes) {
    const role = readStringSetting(node, "role");
    if (role === "drums" || role === "bass" || role === "harmony" || role === "melody" || role === "texture") {
      roleSet.add(role);
      const params = roleParamMap.get(role) ?? [];
      if (!params.includes(node.data.paramId)) {
        params.push(node.data.paramId);
      }
      roleParamMap.set(role, params);
    }
    const blockType = readStringSetting(node, "sourceBlockType");
    if (blockType) {
      blockTypeSet.add(blockType);
    }
    const score = node.data.settings?.score;
    if (typeof score === "number" && Number.isFinite(score)) {
      scoreSum += score;
      scoredCount += 1;
    }
    const priority = node.data.settings?.priority;
    if (typeof priority === "number" && Number.isFinite(priority)) {
      priorityCount += 1;
    }
    const sectionHints = node.data.settings?.sectionHints;
    if (Array.isArray(sectionHints) && role) {
      for (const sectionName of sectionHints) {
        if (typeof sectionName !== "string") continue;
        const sectionRoles = sectionRoleMap.get(sectionName) ?? new Set<NodeRole>();
        sectionRoles.add(role);
        sectionRoleMap.set(sectionName, sectionRoles);
      }
    }
    signatureParts.push(
      [
        node.data.paramId,
        role ?? "none",
        blockType ?? "none",
        readStringSetting(node, "sourceBlockId") ?? "none",
      ].join(":"),
    );
  }

  return {
    paramIds,
    orderedParamIds,
    roleSet,
    blockTypeSet,
    sectionRoleMap,
    roleParamMap,
    sourceSignature: signatureParts.join("|"),
    scoreAverage: scoredCount > 0 ? scoreSum / scoredCount : 0,
    priorityCount,
  };
}

function firstRoleParam(context: NodeContext, role: NodeRole, fallback: string[] = []) {
  const roleParams = context.roleParamMap.get(role) ?? [];
  for (const paramId of roleParams) {
    if (paramId) return paramId;
  }
  for (const paramId of fallback) {
    if (context.paramIds.includes(paramId)) return paramId;
  }
  return null;
}

function hashSignature(signature: string) {
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickVariant<T>(items: T[], signature: string, offset = 0) {
  if (items.length === 0) {
    throw new Error("pickVariant requires a non-empty item list");
  }
  return items[(hashSignature(`${signature}:${offset}`) % items.length)];
}

function hasAny(paramIds: string[], candidates: string[]) {
  return candidates.some((candidate) => paramIds.includes(candidate));
}

function determineStyleFlavor(paramIds: string[]): StyleFlavor {
  if (paramIds.includes("square") || (paramIds.includes("arp") && paramIds.includes("crush"))) return "retro";
  if (paramIds.includes("sawtooth") && paramIds.includes("distort")) return "industrial";
  if (paramIds.includes("euclid") && (paramIds.includes("noise") || paramIds.includes("crush"))) return "idm";
  if (paramIds.includes("room") && paramIds.includes("chord")) return "dub";
  if (paramIds.includes("triangle") && (paramIds.includes("room") || paramIds.includes("slow"))) return "ambient";
  return "default";
}

function determineStyleFlavorFromContext(context: NodeContext): StyleFlavor {
  const inferred = determineStyleFlavor(context.paramIds);
  if (inferred !== "default") {
    return inferred;
  }
  if (context.blockTypeSet.has("bed") && context.roleSet.has("harmony")) {
    return "ambient";
  }
  if (context.blockTypeSet.has("peak") && context.roleSet.has("drums")) {
    return "industrial";
  }
  if (context.roleSet.has("texture") && context.paramIds.includes("euclid")) {
    return "idm";
  }
  if (context.roleSet.has("harmony") && context.roleSet.has("bass") && context.paramIds.includes("room")) {
    return "dub";
  }
  return "default";
}

function determineVoiceFromContext(context: NodeContext, style: StyleFlavor) {
  const selected = context.orderedParamIds.find((paramId) => SOUND_MAP[paramId]);
  if (selected) return SOUND_MAP[selected];
  if (style === "retro") return "square";
  if (style === "industrial") return "sawtooth";
  if (style === "ambient" || style === "dub") return "triangle";
  if (style === "idm") return "noise";
  return "triangle";
}

function determineScale(style: StyleFlavor, paramIds: string[]) {
  if (style === "retro") return "C5:dorian";
  if (style === "ambient") return "D4:minor";
  if (style === "industrial") return "C4:minor";
  if (style === "dub") return "F4:minor";
  if (style === "idm") return "E4:phrygian";
  return hasAny(paramIds, ["chord", "note", "seq"]) ? "C4:minor" : "A4:minor";
}

function buildLeadBase(
  style: StyleFlavor,
  scale: string,
  sound: string,
  paramIds: string[],
  signature: string,
  melodyDriver: string | null,
) {
  const drivenByArp = melodyDriver === "arp" || paramIds.includes("arp");
  const drivenBySeq = melodyDriver === "seq";
  const drivenByChunk = melodyDriver === "chunk";
  const drivenByNote = melodyDriver === "note" || melodyDriver === "scale";
  if (style === "retro") {
    return pickVariant([
      drivenByArp
        ? `n("0 2 4 7 9 7 4 2").scale("${scale}").sound("${sound}").fast(2)`
        : `n("0 4 7 9 7 4 2 0").scale("${scale}").sound("${sound}").fast(2)`,
      drivenByChunk
        ? `n("0 2 [4 7] 9 7 4 2 [0 2]").scale("${scale}").sound("${sound}").struct("1 1 ~ 1 1 ~ 1 ~").fast(2)`
        : `n("0 2 [4 7] 9 7 4 2 [0 2]").scale("${scale}").sound("${sound}").fast(2)`,
      drivenBySeq
        ? `n("0 2 4 7 4 2 9 7").scale("${scale}").sound("${sound}").struct("1 ~ 1 1 ~ 1 1 ~").fast(2)`
        : `n("0 2 4 7 9 7 4 2").scale("${scale}").sound("${sound}").fast(2)`,
    ], signature, 1);
  }
  if (style === "industrial") {
    return pickVariant([
      drivenBySeq
        ? `n("0 0 3 2 7 6 3 2").scale("${scale}").sound("${sound}").struct("1 ~ 1 ~ 1 1 ~ ~")`
        : `n("0 3 0 2 7 3 6 2").scale("${scale}").sound("${sound}").struct("1 ~ 1 1 ~ 1 ~ ~")`,
      drivenByChunk
        ? `n("0 [0 3] 2 7 6 3 2 1").scale("${scale}").sound("${sound}").struct("1 1 ~ 1 ~ 1 ~ ~")`
        : `n("0 0 3 2 7 6 3 2").scale("${scale}").sound("${sound}").struct("1 ~ 1 ~ 1 1 ~ ~")`,
      drivenByNote
        ? `n("0 2 3 2 7 6 3 1").scale("${scale}").sound("${sound}").struct("1 ~ ~ 1 1 ~ 1 ~")`
        : `n("0 3 0 2 7 3 6 2").scale("${scale}").sound("${sound}").struct("1 ~ 1 1 ~ 1 ~ ~")`,
    ], signature, 2);
  }
  if (style === "ambient") {
    return pickVariant([
      drivenByNote
        ? `n("0 ~ 2 ~ 4 ~ 7 ~").scale("${scale}").sound("${sound}").slow(2)`
        : `n("0 ~ 3 ~ 5 ~ 7 ~").scale("${scale}").sound("${sound}").slow(2)`,
      drivenByChunk
        ? `n("0 ~ [2 4] ~ 7 ~ 9 ~").scale("${scale}").sound("${sound}").slow(2)`
        : `n("0 ~ 2 ~ 4 ~ 7 ~").scale("${scale}").sound("${sound}").slow(2)`,
      drivenBySeq
        ? `n("0 ~ 2 4 ~ 5 ~ 7").scale("${scale}").sound("${sound}").slow(2)`
        : `n("0 ~ 3 ~ 5 ~ 7 ~").scale("${scale}").sound("${sound}").slow(2)`,
    ], signature, 3);
  }
  if (style === "idm") {
    return pickVariant([
      drivenByChunk
        ? `n("0 [2 5] 7 [3 6] 4 1").scale("${scale}").sound("${sound}").struct("1 ~ 1 1 ~ 1 ~ 1")`
        : `n("[0 3] 5 7 [2 6] 4 1").scale("${scale}").sound("${sound}").struct("1 1 ~ 1 ~ 1 1 ~")`,
      drivenBySeq
        ? `n("0 2 [5 7] [3 6] 1 4").scale("${scale}").sound("${sound}").struct("1 ~ 1 1 1 ~ ~ 1")`
        : `n("0 [2 5] 7 [3 6] 4 1").scale("${scale}").sound("${sound}").struct("1 ~ 1 1 ~ 1 ~ 1")`,
      drivenByArp
        ? `n("[0 2] [5 7] [3 6] [1 4]").scale("${scale}").sound("${sound}").struct("1 1 ~ 1 ~ 1 ~ 1")`
        : `n("[0 3] 5 7 [2 6] 4 1").scale("${scale}").sound("${sound}").struct("1 1 ~ 1 ~ 1 1 ~")`,
    ], signature, 4);
  }
  if (style === "dub") {
    return pickVariant([
      `n("0 2 4 2 7 6 4 2").scale("${scale}").sound("${sound}").slow(2)`,
      `n("0 3 5 3 7 5 3 2").scale("${scale}").sound("${sound}").slow(2)`,
      `n("0 2 [4 5] 2 7 6 4 2").scale("${scale}").sound("${sound}").slow(2)`,
    ], signature, 5);
  }
  if (paramIds.includes("arp")) {
    return pickVariant([
      `n("2 1 0 1 4 3 2 3").scale("${scale}").sound("${sound}")`,
      `n("4 3 2 1 0 1 2 3").scale("${scale}").sound("${sound}")`,
      `n("[2 4] 1 0 1 [4 7] 3 2 3").scale("${scale}").sound("${sound}")`,
    ], signature, 6);
  }
  return pickVariant([
    `n("0 2 4 6 4 2").scale("${scale}").sound("${sound}")`,
    `n("0 3 5 7 5 3").scale("${scale}").sound("${sound}")`,
    `n("0 2 [4 6] 4 2 0").scale("${scale}").sound("${sound}")`,
  ], signature, 7);
}

function buildChordBase(
  style: StyleFlavor,
  scale: string,
  sound: string,
  signature: string,
  harmonyDriver: string | null,
) {
  const drivenByChord = harmonyDriver === "chord";
  const drivenByRoom = harmonyDriver === "room";
  const drivenByTriangle = harmonyDriver === "triangle";
  if (style === "ambient") {
    return pickVariant([
      drivenByRoom
        ? `n("[0, 2, 4, 6] [3, 5, 7, 9] [4, 6, 8, 10]").scale("${scale}").sound("${sound}").slow(2)`
        : `n("[0, 3, 5, 7] [2, 4, 7, 9] [4, 6, 9, 11]").scale("${scale}").sound("${sound}").slow(2)`,
      drivenByTriangle
        ? `n("[0, 4, 7, 11] [2, 5, 9, 12] [4, 7, 9, 14]").scale("${scale}").sound("${sound}").slow(2)`
        : `n("[0, 2, 4, 6] [3, 5, 7, 9] [4, 6, 8, 10]").scale("${scale}").sound("${sound}").slow(2)`,
    ], signature, 8);
  }
  if (style === "dub") {
    return pickVariant([
      drivenByChord
        ? `n("[0, 3, 7] [2, 5, 9] [4, 7, 10] [3, 6, 9]").scale("${scale}").sound("${sound}")`
        : `n("[0, 4, 7] [3, 5, 8] [2, 5, 9] [4, 7, 11]").scale("${scale}").sound("${sound}")`,
      drivenByRoom
        ? `n("[0, 3, 7] [3, 6, 10] [2, 5, 9] [4, 7, 11]").scale("${scale}").sound("${sound}").slow(1.1)`
        : `n("[0, 4, 7] [3, 5, 8] [2, 5, 9] [4, 7, 11]").scale("${scale}").sound("${sound}")`,
    ], signature, 9);
  }
  if (style === "retro") {
    return pickVariant([
      drivenByChord
        ? `n("[0, 4, 7] [2, 5, 9] [4, 7, 11]").scale("${scale}").sound("${sound}").fast(2)`
        : `n("[0, 3, 7] [2, 5, 8] [4, 7, 10]").scale("${scale}").sound("${sound}").fast(2)`,
      `n("[0, 4, 7] [3, 7, 10] [2, 5, 9]").scale("${scale}").sound("${sound}").struct("1 ~ 1 1").fast(2)`,
    ], signature, 10);
  }
  return pickVariant([
    drivenByChord
      ? `n("[0, 2, 4] [3, 5, 7] [4, 6, 8] [1, 3, 5]").scale("${scale}").sound("${sound}")`
      : `n("[0, 3, 5] [2, 4, 7] [4, 6, 9] [1, 4, 6]").scale("${scale}").sound("${sound}")`,
    `n("[0, 4, 6] [2, 5, 7] [3, 6, 8] [1, 4, 5]").scale("${scale}").sound("${sound}")`,
  ], signature, 11);
}

function buildBassBase(style: StyleFlavor, scale: string, signature: string, bassDriver: string | null) {
  const drivenBySeq = bassDriver === "seq";
  const drivenByNote = bassDriver === "note" || bassDriver === "scale";
  if (style === "ambient") {
    return pickVariant([
      drivenByNote
        ? `n("0 ~ ~ 0 3 ~ ~ 2").scale("${scale}").sound("sine").slow(2).gain(0.95)`
        : `n("0 ~ 3 ~ 0 ~ 2 ~").scale("${scale}").sound("sine").slow(2).gain(0.95)`,
      `n("0 ~ 2 ~ 3 ~ 0 ~").scale("${scale}").sound("sine").slow(2).gain(0.95)`,
    ], signature, 12);
  }
  if (style === "dub") {
    return pickVariant([
      drivenBySeq
        ? `n("0 ~ 0 ~ 3 ~ 2 ~").scale("${scale}").sound("sine").gain(1.05)`
        : `n("0 ~ 3 ~ 0 ~ 5 ~").scale("${scale}").sound("sine").gain(1.05)`,
      `n("0 ~ 2 ~ 3 ~ 5 ~").scale("${scale}").sound("sine").gain(1.05)`,
    ], signature, 13);
  }
  if (style === "industrial") {
    return pickVariant([
      `n("0 0 ~ 3 0 0 ~ 2").scale("${scale}").sound("sawtooth").gain(0.95)`,
      `n("0 ~ 0 3 0 ~ 2 1").scale("${scale}").sound("sawtooth").gain(0.95)`,
    ], signature, 14);
  }
  if (style === "retro") {
    return pickVariant([
      `n("0 0 4 4 2 2 7 7").scale("${scale}").sound("square").gain(0.85)`,
      `n("0 4 0 4 2 7 2 7").scale("${scale}").sound("square").gain(0.85)`,
    ], signature, 15);
  }
  if (style === "idm") {
    return pickVariant([
      `n("0 ~ 3 [5 2] 0 ~ 6 1").scale("${scale}").sound("triangle").gain(0.9)`,
      `n("0 [3 5] ~ 2 0 6 ~ 1").scale("${scale}").sound("triangle").gain(0.9)`,
    ], signature, 16);
  }
  return pickVariant([
    `n("0 2 0 4 3 2 1 0").scale("${scale}").sound("sine").gain(0.9)`,
    `n("0 3 0 5 4 3 2 0").scale("${scale}").sound("sine").gain(0.9)`,
  ], signature, 17);
}

function buildBeatBase(style: StyleFlavor, drumsDriver: string | null, signature: string) {
  const drivenByEuclid = drumsDriver === "euclid";
  const drivenByBeat = drumsDriver === "beat";
  if (style === "retro") {
    return pickVariant([
      drivenByBeat
        ? 'stack(sound("bd").struct("1 ~ 1 ~ 1 ~ 1 ~"), sound("sd").struct("~ ~ 1 ~ ~ ~ 1 ~"), sound("hh").struct("1 1 1 1 1 1 1 1").gain(0.6))'
        : 'stack(sound("bd").struct("1 ~ ~ 1 1 ~ ~ 1"), sound("sd").struct("~ ~ 1 ~ ~ ~ 1 ~"), sound("hh").struct("1 1 ~ 1 1 1 ~ 1").gain(0.6))',
      'stack(sound("bd").struct("1 ~ 1 ~ ~ ~ 1 ~"), sound("sd").struct("~ ~ 1 ~ ~ ~ 1 ~"), sound("hh").struct("1 1 1 1 1 1 1 1").gain(0.6))',
    ], signature, 18);
  }
  if (style === "industrial") {
    return pickVariant([
      drivenByBeat
        ? 'stack(sound("bd").struct("1 ~ ~ 1 1 ~ ~ 1 1 ~ ~ 1 1 ~ 1 ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ 1 1 1 ~ 1 ~ 1 ~ 1 1 1 ~ 1 ~").gain(0.55))'
        : 'stack(sound("bd").struct("1 ~ 1 ~ 1 ~ ~ 1 1 ~ 1 ~ 1 ~ ~ 1"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ 1 ~ 1 1 ~ 1 1 ~ 1 ~ 1 1 ~ 1").gain(0.55))',
      'stack(sound("bd").struct("1 ~ ~ 1 1 ~ 1 ~ 1 ~ ~ 1 1 ~ 1 ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ 1 1 ~ 1 1 ~ 1 ~ 1 1 ~ 1 1 ~").gain(0.55))',
    ], signature, 19);
  }
  if (style === "ambient") {
    return pickVariant([
      'stack(sound("bd").struct("1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~").gain(0.8), sound("hh").struct("~ ~ 1 ~ ~ ~ 1 ~").gain(0.3))',
      'stack(sound("bd").struct("1 ~ ~ ~ ~ ~ ~ ~").gain(0.75), sound("hh").struct("~ ~ ~ 1 ~ ~ ~ 1").gain(0.28))',
    ], signature, 20);
  }
  if (style === "dub") {
    return pickVariant([
      drivenByBeat
        ? 'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("~ 1 ~ 1 ~ 1 ~ 1").gain(0.35))'
        : 'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ ~ 1 1 ~ ~ 1").gain(0.25))',
      'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("~ 1 1 ~ ~ 1 1 ~").gain(0.3))',
    ], signature, 21);
  }
  return pickVariant([
    drivenByEuclid
      ? 'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~ 1 ~ ~ ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ 1 ~ 1 ~ 1 ~ 1 ~ 1 ~ 1 ~ 1 ~"))'
      : 'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~ 1 ~ 1 ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ 1 1 ~ 1 ~ 1 1 ~ 1 1 ~ 1 ~ 1"))',
    'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~ 1 ~ ~ ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 1 ~ 1 1 ~ 1 ~ 1 1 ~ 1 1 ~ 1 ~"))',
  ], signature, 22);
}

function buildPolyrhythmBase(style: StyleFlavor) {
  if (style === "tribal") {
    return 'stack(sound("bd").struct("euclidean(5,12)"), sound("sd").struct("euclidean(7,16)"), sound("hh").struct("euclidean(9,20)"))';
  }
  if (style === "idm") {
    return 'stack(sound("bd").struct("euclidean(3,8)"), sound("sd").struct("euclidean(5,16)"), sound("hh").struct("euclidean(7,20)").gain(0.5))';
  }
  return 'stack(sound("bd").struct("euclidean(4,12)"), sound("sd").struct("euclidean(5,16)"), sound("hh").struct("euclidean(7,16)"))';
}

function buildTextureBase(style: StyleFlavor) {
  if (style === "ambient") {
    return 'sound("hh").struct("~ ~ 1 ~ ~ ~ ~ ~").gain(0.12).room(0.35)';
  }
  if (style === "industrial") {
    return 'sound("noise").struct("1 ~ 1 ~ 1 ~ ~ 1").gain(0.18).distort(0.9)';
  }
  if (style === "idm") {
    return 'sound("hh").struct("1 ~ ~ 1 ~ 1 ~ ~ 1 ~").crush(5).gain(0.18)';
  }
  if (style === "dub") {
    return 'sound("hh").struct("~ 1 ~ ~ ~ 1 ~ ~").gain(0.14).room(0.28)';
  }
  return 'sound("hh").struct("~ ~ 1 ~ 1 ~ ~ ~").gain(0.12)';
}

function buildSourceFragments(context: NodeContext, sound: string, style: StyleFlavor, scale: string) {
  const { paramIds, roleSet, blockTypeSet } = context;
  const sources: SourceFragment[] = [];
  const melodyDriver = firstRoleParam(context, "melody", ["arp", "seq", "chunk", "note", "scale"]);
  const bassDriver = firstRoleParam(context, "bass", ["seq", "note", "scale"]);
  const harmonyDriver = firstRoleParam(context, "harmony", ["chord", "room", "triangle", "note"]);
  const drumsDriver = firstRoleParam(context, "drums", ["euclid", "beat", "distort"]);
  const melodicEnabled = roleSet.has("melody") || hasAny(paramIds, ["note", "seq", "chunk", "loop", "scale", "arp"]);
  const chordEnabled = roleSet.has("harmony") || paramIds.includes("chord");
  const rhythmEnabled = roleSet.has("drums") || paramIds.includes("beat");
  const polyEnabled = (roleSet.has("drums") && paramIds.includes("euclid")) || paramIds.includes("euclid");
  const textureEnabled = roleSet.has("texture") || hasAny(paramIds, ["noise", "crush", "distort", "room", "pan"]);
  const bassEnabled = roleSet.has("bass") || melodicEnabled || chordEnabled || hasAny(paramIds, ["lpf", "gain"]);
  const peakDriven = blockTypeSet.has("peak");
  const bedDriven = blockTypeSet.has("bed");

  if (melodicEnabled) {
    sources.push({ key: "lead", expression: buildLeadBase(style, scale, sound, paramIds, `${context.sourceSignature}:lead`, melodyDriver) });
  }
  if (chordEnabled) {
    sources.push({ key: "chords", expression: buildChordBase(style, scale, sound, `${context.sourceSignature}:chords`, harmonyDriver) });
  }
  if (bassEnabled) {
    sources.push({ key: "bass", expression: buildBassBase(style, scale, `${context.sourceSignature}:bass`, bassDriver) });
  }
  if (rhythmEnabled) {
    sources.push({ key: "beat", expression: buildBeatBase(style, drumsDriver, `${context.sourceSignature}:beat`) });
  }
  if (polyEnabled || peakDriven) {
    sources.push({ key: "polyrhythm", expression: buildPolyrhythmBase(style) });
  }
  if (textureEnabled || bedDriven) {
    sources.push({ key: "texture", expression: buildTextureBase(style) });
  }

  if (sources.length === 0) {
    sources.push({ key: "fallback", expression: `n("[0] [2] [4] [6]").scale("${scale}").sound("${sound}")` });
  }
  return sources;
}

function buildControls(paramIds: string[], style: StyleFlavor) {
  const appliedControls: StrudelAppliedControl[] = [];
  const ignoredParamIds: string[] = [];

  for (const paramId of paramIds) {
    if (SOUND_MAP[paramId]) continue;
    const phase = detectNodePhase(paramId);
    if (phase === "melodic" || phase === "rhythm" || phase === "instrument") continue;
    const builder = EFFECT_BUILDERS[paramId];
    if (!builder) {
      ignoredParamIds.push(paramId);
      continue;
    }
    appliedControls.push(builder(style));
  }

  const seen = new Set<string>();
  return {
    appliedControls: appliedControls.filter((control) => {
      if (seen.has(control.paramId)) return false;
      seen.add(control.paramId);
      return true;
    }),
    ignoredParamIds,
  };
}

function buildCombinedSource(sources: SourceFragment[]) {
  if (sources.length === 1) {
    return sources[0].expression;
  }
  return `stack(\n  ${sources.map((source) => source.expression).join(",\n  ")}\n)`;
}

function tweakSectionExpression(sectionKey: SectionDefinition["key"], source: SourceFragment, style: StyleFlavor) {
  const expression = source.expression;
  if (sectionKey === "intro") {
    if (source.key === "lead") return `${expression}.gain(0.72)`;
    if (source.key === "chords") return `${expression}.gain(0.78)`;
    if (source.key === "bass") return `${expression}.gain(0.7)`;
    if (source.key === "beat") return `${expression}.gain(0.45)`;
    if (source.key === "polyrhythm") return `${expression}.gain(0.35)`;
    if (source.key === "texture") return `${expression}.gain(0.6)`;
  }
  if (sectionKey === "break") {
    if (source.key === "beat") return `${expression}.struct("~ ~ ~ ~ 1 ~ ~ ~")`;
    if (source.key === "polyrhythm") return `${expression}.gain(0.3)`;
    if (source.key === "bass") return `${expression}.slow(2).gain(0.82)`;
    if (source.key === "lead") return `${expression}.slow(2).gain(0.66)`;
    if (source.key === "texture") return `${expression}.gain(${style === "ambient" ? "0.75" : "0.5"})`;
  }
  if (sectionKey === "return") {
    if (source.key === "lead") return `${expression}.gain(1.05)`;
    if (source.key === "beat") return `${expression}.gain(1.08)`;
    if (source.key === "texture") return `${expression}.gain(0.8)`;
  }
  return expression;
}

function mutateSectionExpression(sectionKey: SectionDefinition["key"], source: SourceFragment, style: StyleFlavor) {
  const expression = tweakSectionExpression(sectionKey, source, style);
  if (sectionKey === "main") {
    if (style === "ambient") {
      if (source.key === "lead") return `${expression}.late(1/8)`;
      if (source.key === "chords") return `${expression}.room(0.28)`;
      if (source.key === "texture") return `${expression}.pan(0.62)`;
    }
    if (style === "retro") {
      if (source.key === "lead") return `${expression}.fast(2)`;
      if (source.key === "bass") return `${expression}.struct("1 1 ~ 1 1 ~ 1 ~")`;
      if (source.key === "beat") return `${expression}.gain(0.95)`;
    }
    if (style === "industrial") {
      if (source.key === "lead") return `${expression}.distort(0.82)`;
      if (source.key === "bass") return `${expression}.struct("1 ~ 1 1 1 ~ 1 ~")`;
      if (source.key === "texture") return `${expression}.fast(1.5)`;
    }
    if (style === "idm") {
      if (source.key === "lead") return `${expression}.chunk(4, x => x.fast("<1 1 1 1.5>"))`;
      if (source.key === "polyrhythm") return `${expression}.fast(1.25)`;
      if (source.key === "texture") return `${expression}.pan(0.22)`;
    }
    if (style === "dub") {
      if (source.key === "chords") return `${expression}.room(0.3)`;
      if (source.key === "bass") return `${expression}.lpf("900 1.4")`;
      if (source.key === "beat") return `${expression}.gain(0.88)`;
    }
  }
  if (sectionKey === "return") {
    if (style === "ambient") {
      if (source.key === "lead") return `${expression}.fast(1.15)`;
      if (source.key === "chords") return `${expression}.gain(1.08)`;
      if (source.key === "texture") return `${expression}.room(0.42)`;
    }
    if (style === "retro") {
      if (source.key === "lead") return `${expression}.struct("1 1 1 ~ 1 1 1 ~")`;
      if (source.key === "beat") return `${expression}.fast(1.1)`;
      if (source.key === "bass") return `${expression}.gain(0.95)`;
    }
    if (style === "industrial") {
      if (source.key === "lead") return `${expression}.fast(1.12)`;
      if (source.key === "beat") return `${expression}.struct("1 ~ ~ 1 1 ~ 1 ~ 1 ~ ~ 1 1 ~ 1 1")`;
      if (source.key === "texture") return `${expression}.gain(0.92)`;
    }
    if (style === "idm") {
      if (source.key === "lead") return `${expression}.late(1/16)`;
      if (source.key === "polyrhythm") return `${expression}.struct("euclidean(11,20)")`;
      if (source.key === "texture") return `${expression}.crush(6)`;
    }
    if (style === "dub") {
      if (source.key === "chords") return `${expression}.slow(1.15)`;
      if (source.key === "bass") return `${expression}.gain(1.08)`;
      if (source.key === "texture") return `${expression}.pan(0.68)`;
    }
  }
  return expression;
}

function sourceRole(sourceKey: string): NodeRole | null {
  if (sourceKey === "lead") return "melody";
  if (sourceKey === "chords") return "harmony";
  if (sourceKey === "bass") return "bass";
  if (sourceKey === "beat" || sourceKey === "polyrhythm") return "drums";
  if (sourceKey === "texture") return "texture";
  return null;
}

function buildSectionStack(sectionKey: SectionDefinition["key"], sources: SourceFragment[], style: StyleFlavor) {
  const sectionSources = sources.map((source) => mutateSectionExpression(sectionKey, source, style));
  if (sectionSources.length === 1) {
    return sectionSources[0];
  }
  return `stack(\n    ${sectionSources.join(",\n    ")}\n  )`;
}

function buildSectionStackFromContext(
  sectionKey: SectionDefinition["key"],
  sources: SourceFragment[],
  style: StyleFlavor,
  context: NodeContext,
) {
  const hintedRoles = context.sectionRoleMap.get(sectionKey);
  const filteredSources =
    hintedRoles && hintedRoles.size > 0
      ? sources.filter((source) => {
          const role = sourceRole(source.key);
          return role ? hintedRoles.has(role) : true;
        })
      : sources;
  const finalSources = filteredSources.length > 0 ? filteredSources : sources;
  return buildSectionStack(sectionKey, finalSources, style);
}

function buildSections(style: StyleFlavor, sources: SourceFragment[]): SectionDefinition[] {
  const sectionBars =
    style === "ambient"
      ? { intro: 8, main: 16, break: 8, return: 16 }
      : style === "retro"
        ? { intro: 4, main: 12, break: 4, return: 12 }
        : style === "industrial" || style === "idm"
          ? { intro: 8, main: 16, break: 8, return: 16 }
          : { intro: 4, main: 16, break: 4, return: 12 };

  return [
    {
      key: "intro",
      bars: sectionBars.intro,
      expression: buildSectionStack("intro", sources.filter((source) => source.key !== "polyrhythm" || style === "idm"), style),
    },
    {
      key: "main",
      bars: sectionBars.main,
      expression: buildSectionStack("main", sources, style),
    },
    {
      key: "break",
      bars: sectionBars.break,
      expression: buildSectionStack("break", sources.filter((source) => source.key !== "beat" || style === "ambient"), style),
    },
    {
      key: "return",
      bars: sectionBars.return,
      expression: buildSectionStack("return", sources, style),
    },
  ];
}

function buildSectionsFromContext(style: StyleFlavor, sources: SourceFragment[], context: NodeContext): SectionDefinition[] {
  const base = buildSections(style, sources).map((section) => ({
    ...section,
    expression: buildSectionStackFromContext(section.key, sources, style, context),
  }));
  if (context.blockTypeSet.has("bed")) {
    return base.map((section) =>
      section.key === "intro" || section.key === "break"
        ? { ...section, bars: section.bars + 4, expression: section.expression }
        : section,
    );
  }
  if (context.blockTypeSet.has("peak")) {
    return base.map((section) =>
      section.key === "main" || section.key === "return"
        ? { ...section, bars: section.bars + 4, expression: section.expression }
        : section,
    );
  }
  if (context.scoreAverage > 0.82 && context.roleSet.has("texture")) {
    return base.map((section) =>
      section.key === "break"
        ? { ...section, bars: Math.max(4, section.bars - 2), expression: section.expression }
        : section,
    );
  }
  return base;
}

function buildArrangedTrack(sections: SectionDefinition[]) {
  return `arrange(\n  ${sections.map((section) => `[${section.bars}, ${section.expression}]`).join(",\n  ")}\n)`;
}

export function buildStrudelProject(nodes: StrudelNode[]): StrudelProject {
  return buildStrudelProjectWithTransport(nodes, { cpm: 120, beatsPerCycle: 4 });
}

export function buildStrudelProjectWithTransport(
  nodes: StrudelNode[],
  transport: { cpm: number; beatsPerCycle: number },
): StrudelProject {
  const orderedNodes = sortSelectedNodes(nodes);
  const context = buildNodeContext(orderedNodes);
  const paramIds = context.paramIds;
  const style = determineStyleFlavorFromContext(context);
  const sound = determineVoiceFromContext(context, style);
  const scale = determineScale(style, paramIds);
  const sourceFragments = buildSourceFragments(context, sound, style, scale);
  const sections = buildSectionsFromContext(style, sourceFragments, context);
  const { appliedControls, ignoredParamIds } = buildControls(paramIds, style);
  const controlChain = appliedControls.map((control) => control.expression).join("");
  const arrangedTrack = buildArrangedTrack(sections);
  const code = `setcpm(${transport.cpm} / ${transport.beatsPerCycle})\n${arrangedTrack}${controlChain}\n`;

  return {
    schema: "mmss.strudel.project.v1",
    generatedAt: new Date().toISOString(),
    source: "selected-nodes",
    selectedNodeIds: orderedNodes.map((node) => node.id),
    ignoredNodeIds: orderedNodes.filter((node) => ignoredParamIds.includes(node.data.paramId)).map((node) => node.id),
    nodes: orderedNodes.map((node) => ({
      id: node.id,
      paramId: node.data.paramId,
      label: node.data.label,
      category: node.data.category,
      type: node.type,
    })),
    voice: {
      sound,
      noteMode: hasAny(paramIds, ["scale", "transpose", "transp"]) ? "scale" : "note",
    },
    fragments: {
      melodicBase: sections.map((section) => `// ${section.key}\n${section.expression}`).join("\n\n"),
      percussionBase: sourceFragments.filter((fragment) => ["beat", "polyrhythm", "texture"].includes(fragment.key)).map((fragment) => fragment.expression).join("\n"),
      effectChain: [...appliedControls.map((control) => control.expression), `// sections: ${sections.map((section) => `${section.key}:${section.bars}`).join(", ")}`],
    },
    transport: {
      cpm: transport.cpm,
      beatsPerCycle: transport.beatsPerCycle,
      autoplay: true,
    },
    appliedControls,
    code,
  };
}
