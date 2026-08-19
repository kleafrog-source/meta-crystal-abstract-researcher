import type { Edge, Node, ColorMode } from "@xyflow/react";
import { detectNodePhase, readNodeScore, sortSelectedNodes } from "./order";
import type { StrudelNode } from "./strudel-flow-store";
import type { StrudelProject } from "./schema";

export type StrudelFlowProjectState = {
  nodes: Node[];
  edges: Edge[];
  theme: string;
  colorMode: ColorMode;
  cpm: string;
  bpc?: string;
};

export type NativeExportStats = {
  nativeMapped: Array<{ localId: string; paramId: string; upstreamType: string }>;
  fallbackCustom: Array<{ localId: string; paramId: string; reason: string }>;
  orderedSelection: Array<{ localId: string; paramId: string; score: number | null; phase: string }>;
};

type ExportResult = {
  state: StrudelFlowProjectState;
  stats: NativeExportStats;
};

const SYNTH_SOUND_MAP: Record<string, string> = {
  sine: "sine",
  sawtooth: "sawtooth",
  square: "square",
  triangle: "triangle",
  noise: "noise",
  fm: "sawtooth",
  am: "triangle",
};

function createNode(
  id: string,
  type: string,
  position: { x: number; y: number },
  data: Record<string, unknown>,
  measured?: { width: number; height: number },
): Node {
  return {
    id,
    type,
    position,
    data,
    selected: false,
    dragging: false,
    ...(measured ? { measured } : {}),
  };
}

function pushEdge(edges: Edge[], source: string, target: string) {
  edges.push({
    id: `${source}-${target}`,
    source,
    target,
    type: "default",
  });
}

function createArpNode(localNode: StrudelNode, position: { x: number; y: number }): Node {
  return createNode(
    `upstream-${localNode.id}`,
    "arpeggiator-node",
    position,
    {
      title: "Arpeggiator",
      icon: "Zap",
      state: "running",
      selectedPattern: "down-up",
      selectedChordType: "minor",
      selectedKey: "C",
      octave: 4,
      octaveRange: 2,
    },
    { width: 431, height: 356 },
  );
}

function createPadNode(localNode: StrudelNode, position: { x: number; y: number }, mode: "arp" | "chord"): Node {
  const grid = [
    [true, false, false, false, false, false, false, false],
    [false, false, true, false, false, false, false, false],
    [false, false, false, false, true, false, false, false],
    [false, false, false, false, false, false, true, false],
    [false, false, false, true, false, false, false, false],
    [false, true, false, false, false, false, false, false],
  ];

  return createNode(
    `upstream-${localNode.id}`,
    "pad-node",
    position,
    {
      title: "Pad",
      icon: "Spline",
      state: "running",
      steps: grid.length,
      mode,
      octave: 4,
      selectedKey: "C",
      selectedScaleType: "minor",
      grid,
      columnModifiers: {},
      selectedButtons: [],
      noteGroups: mode === "chord" ? { 0: [[0, 2, 4]], 2: [[2, 4, 6]], 4: [[1, 3, 5]] } : {},
    },
    { width: 431, height: 356 },
  );
}

function createBeatMachineNode(localNode: StrudelNode, position: { x: number; y: number }): Node {
  return createNode(
    `upstream-${localNode.id}`,
    "beat-machine-node",
    position,
    {
      title: "Beats",
      icon: "Grid3x3",
      state: "running",
      steps: 16,
      modifiersEnabled: false,
      rows: [
        { instrument: "bd", pattern: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], modifiers: {} },
        { instrument: "sd", pattern: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false], modifiers: {} },
        { instrument: "hh", pattern: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false], modifiers: {} },
      ],
    },
    { width: 480, height: 320 },
  );
}

function createPolyrhythmNode(localNode: StrudelNode, position: { x: number; y: number }): Node {
  return createNode(
    `upstream-${localNode.id}`,
    "polyrhythm-node",
    position,
    {
      title: "Polyrhythm",
      icon: "Layers",
      state: "running",
      polySound1: "bd",
      polySound2: "sd",
      polySound3: "hh",
      polyPattern1: "euclidean(3,8)",
      polyPattern2: "euclidean(5,16)",
      polyPattern3: "euclidean(7,20)",
      pattern1Active: true,
      pattern2Active: true,
      pattern3Active: true,
    },
    { width: 360, height: 260 },
  );
}

function createSynthNode(localNode: StrudelNode, position: { x: number; y: number }): Node {
  return createNode(
    `upstream-${localNode.id}`,
    "synth-select-node",
    position,
    {
      title: "Synths",
      icon: "CheckCheck",
      state: "running",
      sound: SYNTH_SOUND_MAP[localNode.data.paramId] ?? "sine",
    },
    { width: 238, height: 156 },
  );
}

function createEffectNode(localNode: StrudelNode, position: { x: number; y: number }): Node | null {
  const paramId = localNode.data.paramId;
  const common = {
    title: localNode.data.label,
    state: "running",
  };

  if (paramId === "gain") {
    return createNode(`upstream-${localNode.id}`, "gain-node", position, { ...common, icon: "Volume2", gain: "1.2" }, { width: 320, height: 180 });
  }
  if (paramId === "pan") {
    return createNode(`upstream-${localNode.id}`, "pan-node", position, { ...common, icon: "Move", pan: "0.65" }, { width: 320, height: 220 });
  }
  if (paramId === "distort") {
    return createNode(`upstream-${localNode.id}`, "distort-node", position, { ...common, icon: "Zap", distort: "0.8" }, { width: 320, height: 180 });
  }
  if (paramId === "lpf") {
    return createNode(`upstream-${localNode.id}`, "lpf-node", position, { ...common, icon: "Filter", lpf: "1400 1.2" }, { width: 320, height: 260 });
  }
  if (paramId === "reverb" || paramId === "room") {
    return createNode(
      `upstream-${localNode.id}`,
      "room-node",
      position,
      {
        ...common,
        icon: "CheckCheck",
        room: "0.22",
        roomsize: "1.8",
        roomfade: "0.7",
        roomlp: "9000",
        roomdim: "7000",
      },
      { width: 320, height: 420 },
    );
  }
  if (paramId === "fast") {
    return createNode(`upstream-${localNode.id}`, "fast-node", position, { ...common, icon: "FastForward", fast: "1.6" }, { width: 260, height: 170 });
  }
  if (paramId === "slow") {
    return createNode(`upstream-${localNode.id}`, "slow-node", position, { ...common, icon: "Rewind", slow: "1.25" }, { width: 260, height: 170 });
  }
  return null;
}

export function toStrudelFlowProjectState(
  selectedNodes: StrudelNode[],
  project: StrudelProject,
  options?: {
    theme?: string;
    colorMode?: ColorMode;
  },
): ExportResult {
  const theme = options?.theme ?? "catppuccin";
  const colorMode = options?.colorMode ?? "dark";
  const ordered = sortSelectedNodes(selectedNodes);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nativeMapped: NativeExportStats["nativeMapped"] = [];
  const fallbackCustom: NativeExportStats["fallbackCustom"] = [];
  const orderedSelection: NativeExportStats["orderedSelection"] = ordered.map((node) => ({
    localId: node.id,
    paramId: node.data.paramId,
    score: readNodeScore(node),
    phase: detectNodePhase(node.data.paramId),
  }));

  const rhythmicSources: string[] = [];
  const melodicSources: string[] = [];

  const primaryArp = ordered.find((node) => node.data.paramId === "arp");
  const primaryPad = !primaryArp
    ? ordered.find((node) => ["note", "scale", "chord", "seq", "loop", "chunk"].includes(node.data.paramId))
    : null;
  const beatNode = ordered.find((node) => node.data.paramId === "beat");
  const polyrhythmNode = ordered.find((node) => node.data.paramId === "euclid");

  if (primaryArp) {
    const arpNode = createArpNode(primaryArp, { x: 80, y: 80 });
    nodes.push(arpNode);
    melodicSources.push(arpNode.id);
    nativeMapped.push({ localId: primaryArp.id, paramId: primaryArp.data.paramId, upstreamType: "arpeggiator-node" });
  } else if (primaryPad) {
    const mode = primaryPad.data.paramId === "chord" ? "chord" : "arp";
    const padNode = createPadNode(primaryPad, { x: 80, y: 80 }, mode);
    nodes.push(padNode);
    melodicSources.push(padNode.id);
    nativeMapped.push({ localId: primaryPad.id, paramId: primaryPad.data.paramId, upstreamType: "pad-node" });
  }

  if (beatNode) {
    const beatSource = createBeatMachineNode(beatNode, { x: 80, y: melodicSources.length > 0 ? 420 : 80 });
    nodes.push(beatSource);
    rhythmicSources.push(beatSource.id);
    nativeMapped.push({ localId: beatNode.id, paramId: beatNode.data.paramId, upstreamType: "beat-machine-node" });
  }
  if (polyrhythmNode) {
    const polySource = createPolyrhythmNode(polyrhythmNode, { x: 80, y: beatNode ? 760 : melodicSources.length > 0 ? 420 : 80 });
    nodes.push(polySource);
    rhythmicSources.push(polySource.id);
    nativeMapped.push({ localId: polyrhythmNode.id, paramId: polyrhythmNode.data.paramId, upstreamType: "polyrhythm-node" });
  }

  let previousTargets = [...melodicSources];
  let column = 1;

  const synthCandidates = ordered.filter((node) => node.data.paramId in SYNTH_SOUND_MAP);
  for (const synth of synthCandidates) {
    if (previousTargets.length === 0) {
      fallbackCustom.push({
        localId: synth.id,
        paramId: synth.data.paramId,
        reason: "Synth node was selected without a melodic source; skipped from upstream graph.",
      });
      continue;
    }
    const synthNode = createSynthNode(synth, { x: 80 + column * 280, y: 80 });
    nodes.push(synthNode);
    for (const sourceId of previousTargets) {
      pushEdge(edges, sourceId, synthNode.id);
    }
    previousTargets = [synthNode.id];
    column += 1;
    nativeMapped.push({ localId: synth.id, paramId: synth.data.paramId, upstreamType: "synth-select-node" });
  }

  const branchTargets = [...previousTargets, ...rhythmicSources];
  let effectSources = branchTargets.length > 0 ? branchTargets : [...melodicSources, ...rhythmicSources];
  const effectNodes = ordered.filter((node) => ["gain", "pan", "distort", "lpf", "reverb", "room", "fast", "slow"].includes(node.data.paramId));
  const baseY = rhythmicSources.length > 0 ? 320 : 80;

  for (const effect of effectNodes) {
    const nextNode = createEffectNode(effect, { x: 80 + column * 280, y: baseY });
    if (!nextNode) {
      fallbackCustom.push({ localId: effect.id, paramId: effect.data.paramId, reason: "Mapped effect factory returned null." });
      continue;
    }
    nodes.push(nextNode);
    for (const sourceId of effectSources) {
      pushEdge(edges, sourceId, nextNode.id);
    }
    effectSources = [nextNode.id];
    column += 1;
    nativeMapped.push({ localId: effect.id, paramId: effect.data.paramId, upstreamType: nextNode.type as string });
  }

  const unsupported = ordered.filter((node) => {
    return !nativeMapped.some((mapped) => mapped.localId === node.id);
  });

  for (const node of unsupported) {
    fallbackCustom.push({
      localId: node.id,
      paramId: node.data.paramId,
      reason: "No native upstream mapping is implemented for this parameter yet.",
    });
  }

  return {
    state: {
      nodes,
      edges,
      theme,
      colorMode,
      cpm: String(project.transport.cpm),
      bpc: String(project.transport.beatsPerCycle),
    },
    stats: {
      nativeMapped,
      fallbackCustom,
      orderedSelection,
    },
  };
}

export function strudelFlowProjectStateToJson(state: StrudelFlowProjectState) {
  return JSON.stringify(state, null, 2);
}
