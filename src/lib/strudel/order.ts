import type { StrudelNode } from "./strudel-flow-store";

const SOURCE_PRIORITY: Record<string, number> = {
  arp: 10,
  note: 20,
  scale: 21,
  chord: 22,
  seq: 23,
  loop: 24,
  chunk: 25,
  beat: 30,
  euclid: 31,
  sine: 40,
  sawtooth: 41,
  square: 42,
  triangle: 43,
  noise: 44,
  fm: 45,
  am: 46,
  gain: 60,
  lpf: 61,
  hpf: 62,
  distort: 63,
  crush: 64,
  reverb: 65,
  room: 66,
  pan: 67,
  fast: 80,
  slow: 81,
};

export function readNodeScore(node: StrudelNode) {
  const value = node.data.settings?.score;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function detectNodePhase(paramId: string) {
  if (paramId === "arp") return "instrument";
  if (paramId === "note" || paramId === "scale" || paramId === "chord" || paramId === "seq" || paramId === "loop" || paramId === "chunk") {
    return "melodic";
  }
  if (paramId === "beat" || paramId === "euclid") return "rhythm";
  if (paramId === "gain" || paramId === "pan") return "dynamics";
  if (paramId === "lpf" || paramId === "hpf") return "filter";
  if (paramId === "distort" || paramId === "crush") return "texture";
  if (paramId === "reverb" || paramId === "room") return "space";
  if (paramId === "fast" || paramId === "slow") return "time";
  return "other";
}

export function sortSelectedNodes(nodes: StrudelNode[]) {
  return [...nodes].sort((left, right) => {
    const phaseDelta = (SOURCE_PRIORITY[left.data.paramId] ?? 999) - (SOURCE_PRIORITY[right.data.paramId] ?? 999);
    if (phaseDelta !== 0) {
      return phaseDelta;
    }
    const scoreDelta = (readNodeScore(right) ?? -1) - (readNodeScore(left) ?? -1);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const addedAtLeft = Number(left.data.settings?.addedAt ?? 0);
    const addedAtRight = Number(right.data.settings?.addedAt ?? 0);
    return addedAtLeft - addedAtRight;
  });
}
