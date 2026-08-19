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

const EFFECT_BUILDERS: Partial<Record<string, () => StrudelAppliedControl>> = {
  gain: () => ({ paramId: "gain", expression: ".gain(1.2)", reason: "Volume lift" }),
  lpf: () => ({ paramId: "lpf", expression: '.lpf("1400 1.2")', reason: "Warm low-pass shaping" }),
  hpf: () => ({ paramId: "hpf", expression: '.hpf("240 1")', reason: "Remove low-end mud" }),
  crush: () => ({ paramId: "crush", expression: ".crush(6)", reason: "Lo-fi bit reduction" }),
  distort: () => ({ paramId: "distort", expression: ".distort(0.8)", reason: "Saturate the synth voice" }),
  pan: () => ({ paramId: "pan", expression: ".pan(0.65)", reason: "Push sound right of center" }),
  reverb: () => ({ paramId: "reverb", expression: '.room("0.22").rsize(1.8).rfade(0.7).rlp(9000).rdim(7000)', reason: "Mapped to upstream room/reverb chain" }),
  room: () => ({ paramId: "room", expression: '.room("0.22").rsize(1.8).rfade(0.7).rlp(9000).rdim(7000)', reason: "Room ambience" }),
  fast: () => ({ paramId: "fast", expression: ".fast(1.6)", reason: "Increase event density" }),
  slow: () => ({ paramId: "slow", expression: ".slow(1.25)", reason: "Stretch the phrase" }),
};

function uniqueOrderedParamIds(nodes: StrudelNode[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const node of sortSelectedNodes(nodes)) {
    if (seen.has(node.data.paramId)) {
      continue;
    }
    seen.add(node.data.paramId);
    ordered.push(node.data.paramId);
  }
  return ordered;
}

function determineVoice(paramIds: string[]) {
  const selected = paramIds.find((paramId) => SOUND_MAP[paramId]);
  return SOUND_MAP[selected ?? "triangle"] ?? "triangle";
}

function hasAny(paramIds: string[], candidates: string[]) {
  return candidates.some((candidate) => paramIds.includes(candidate));
}

function buildArpBase() {
  return 'n("2 1 0 1 4 3 2 3").scale("C4:minor")';
}

function buildPadBase(paramIds: string[]) {
  if (paramIds.includes("chord")) {
    return 'n("[0, 2, 4] [3, 5, 7] [4, 6, 8] [1, 3, 5]").scale("C4:minor")';
  }
  if (paramIds.includes("seq") || paramIds.includes("loop")) {
    return 'n("[0] [2] [4] [6] [7] [4] [2] [1]").scale("C4:minor")';
  }
  if (paramIds.includes("chunk")) {
    return 'n("[0 2] [4 6] [3 5] [1 4]").scale("C4:minor")';
  }
  return 'n("[0] [2] [4] [6] [4] [2]").scale("C4:minor")';
}

function buildBeatBase() {
  return 'stack(sound("bd").struct("1 ~ ~ ~ 1 ~ ~ ~ 1 ~ ~ ~ 1 ~ ~ ~"), sound("sd").struct("~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~"), sound("hh").struct("1 ~ 1 ~ 1 ~ 1 ~ 1 ~ 1 ~ 1 ~ 1 ~"))';
}

function buildPolyrhythmBase() {
  return 'stack(sound("bd").struct("euclidean(3,8)"), sound("sd").struct("euclidean(5,16)"), sound("hh").struct("euclidean(7,20)"))';
}

function applyMelodicVoice(base: string, sound: string) {
  return `${base}.sound("${sound}")`;
}

function buildSourceFragments(paramIds: string[], sound: string) {
  const orderedSources: Array<{ key: string; expression: string }> = [];

  if (paramIds.includes("arp")) {
    orderedSources.push({ key: "arp", expression: applyMelodicVoice(buildArpBase(), sound) });
  } else if (hasAny(paramIds, ["note", "scale", "chord", "seq", "loop", "chunk"])) {
    orderedSources.push({ key: "pad", expression: applyMelodicVoice(buildPadBase(paramIds), sound) });
  }

  if (paramIds.includes("beat")) {
    orderedSources.push({ key: "beat", expression: buildBeatBase() });
  }
  if (paramIds.includes("euclid")) {
    orderedSources.push({ key: "polyrhythm", expression: buildPolyrhythmBase() });
  }

  return orderedSources;
}

function buildControls(paramIds: string[]) {
  const appliedControls: StrudelAppliedControl[] = [];
  const ignoredParamIds: string[] = [];

  for (const paramId of paramIds) {
    if (SOUND_MAP[paramId]) {
      continue;
    }
    if (detectNodePhase(paramId) === "melodic" || detectNodePhase(paramId) === "rhythm" || detectNodePhase(paramId) === "instrument") {
      continue;
    }
    const builder = EFFECT_BUILDERS[paramId];
    if (!builder) {
      ignoredParamIds.push(paramId);
      continue;
    }
    appliedControls.push(builder());
  }

  return { appliedControls, ignoredParamIds };
}

function buildCombinedSource(sources: Array<{ key: string; expression: string }>) {
  if (sources.length === 0) {
    return 'n("[0] [2] [4] [6]").scale("C4:minor").sound("triangle")';
  }
  if (sources.length === 1) {
    return sources[0].expression;
  }
  return `stack(\n  ${sources.map((source) => source.expression).join(",\n  ")}\n)`;
}

export function buildStrudelProject(nodes: StrudelNode[]): StrudelProject {
  return buildStrudelProjectWithTransport(nodes, { cpm: 120, beatsPerCycle: 4 });
}

export function buildStrudelProjectWithTransport(
  nodes: StrudelNode[],
  transport: { cpm: number; beatsPerCycle: number },
): StrudelProject {
  const orderedNodes = sortSelectedNodes(nodes);
  const paramIds = uniqueOrderedParamIds(orderedNodes);
  const sound = determineVoice(paramIds);
  const sourceFragments = buildSourceFragments(paramIds, sound);
  const { appliedControls, ignoredParamIds } = buildControls(paramIds);
  const controlChain = appliedControls.map((control) => control.expression).join("");
  const combinedSource = buildCombinedSource(sourceFragments);
  const code = `setcpm(${transport.cpm} / ${transport.beatsPerCycle})\n${combinedSource}${controlChain}\n`;

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
      melodicBase: sourceFragments.filter((fragment) => fragment.key === "arp" || fragment.key === "pad").map((fragment) => fragment.expression).join("\n"),
      percussionBase: sourceFragments.filter((fragment) => fragment.key === "beat" || fragment.key === "polyrhythm").map((fragment) => fragment.expression).join("\n"),
      effectChain: appliedControls.map((control) => control.expression),
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
