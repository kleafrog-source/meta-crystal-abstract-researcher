type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

export interface VocalAllocationView {
  kind: "vocal-allocation";
  query: string;
  languages: string[];
  techniques: string[];
  effects: string[];
  digits: Array<[string, number]>;
  totalScoped: number | null;
  parameters: Array<{ technicalName: string; value: unknown; category: string; source: string }>;
}

export interface FlowmusicTimelineView {
  kind: "flowmusic-timeline";
  audioName: string;
  durationSeconds: number;
  validationRecorded: boolean;
  sourcePlan: string | null;
  sourceBanks: string[];
  points: Array<{ time: number; values: Array<{ modality: "CLAP" | "SigLIP2" | "Blended"; technicalName: string; value: unknown }> }>;
}

export type SpecialArtifactView = VocalAllocationView | FlowmusicTimelineView;

function projectVocalAllocation(data: unknown): VocalAllocationView | null {
  const root = object(data);
  const parsed = object(root?.parsed);
  if (!root || !parsed || typeof root.query !== "string" || !Array.isArray(root.results)) return null;
  const languages = stringList(parsed.languages);
  const techniques = stringList(parsed.techniques);
  const effects = stringList(parsed.effects);
  const rawDigits = object(parsed.digits);
  if (!languages || !techniques || !effects || !rawDigits) return null;

  const parameters: VocalAllocationView["parameters"] = [];
  for (const raw of root.results) {
    const row = object(raw);
    if (!row || typeof row.technical_name !== "string" || !row.technical_name) return null;
    parameters.push({
      technicalName: row.technical_name,
      value: row.current_value ?? row.suggested_value ?? row.default ?? null,
      category: [row.category, row.sub_category].filter((item): item is string => typeof item === "string" && item.length > 0).join(" · ") || "—",
      source: typeof row.source === "string" ? row.source : "—",
    });
  }

  const digits = Object.entries(rawDigits).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
  return {
    kind: "vocal-allocation",
    query: root.query,
    languages,
    techniques,
    effects,
    digits,
    totalScoped: typeof root.total_scoped === "number" && Number.isFinite(root.total_scoped) ? root.total_scoped : null,
    parameters,
  };
}

type Pair = [number, unknown];
function parsePairs(value: unknown, registry: string[]): Array<{ technicalName: string; value: unknown }> | null {
  if (!Array.isArray(value)) return null;
  const result: Array<{ technicalName: string; value: unknown }> = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length !== 2 || !Number.isInteger(raw[0]) || (raw[0] as number) < 0) return null;
    const [index, parameterValue] = raw as Pair;
    result.push({ technicalName: registry[index] ?? `registry[${index}]`, value: parameterValue });
  }
  return result;
}

function projectFlowmusic(data: unknown): FlowmusicTimelineView | null {
  const root = object(data);
  const audio = object(root?.audio);
  if (root?.schema !== "FLOWMUSIC_PRIORITY_TIMELINE_V1" || typeof audio?.name !== "string" || typeof audio.duration_seconds !== "number" || !Number.isFinite(audio.duration_seconds) || !Array.isArray(root.timeline) || !root.timeline.length) return null;
  const clapRegistry = stringList(root.clap_registry);
  const siglipRegistry = stringList(root.siglip_registry);
  const blendedRegistry = stringList(root.blended_registry);
  if ((!clapRegistry || !siglipRegistry) && !blendedRegistry) return null;

  const points: FlowmusicTimelineView["points"] = [];
  for (const raw of root.timeline) {
    const point = object(raw);
    if (!point || typeof point.t !== "number" || !Number.isFinite(point.t)) return null;
    const values: FlowmusicTimelineView["points"][number]["values"] = [];
    if (point.clap !== undefined || point.siglip !== undefined) {
      if (!clapRegistry || !siglipRegistry) return null;
      const clap = parsePairs(point.clap, clapRegistry);
      const siglip = parsePairs(point.siglip, siglipRegistry);
      if (!clap || !siglip) return null;
      values.push(...clap.map((item) => ({ ...item, modality: "CLAP" as const })), ...siglip.map((item) => ({ ...item, modality: "SigLIP2" as const })));
    }
    if (point.blended !== undefined) {
      if (!blendedRegistry) return null;
      const blended = parsePairs(point.blended, blendedRegistry);
      if (!blended) return null;
      values.push(...blended.map((item) => ({ ...item, modality: "Blended" as const })));
    }
    if (!values.length) return null;
    points.push({ time: point.t, values });
  }

  const sourceBanks = stringList(root.sourceBanks);
  if (!sourceBanks || (root.sourcePlan !== null && typeof root.sourcePlan !== "string")) return null;
  return {
    kind: "flowmusic-timeline",
    audioName: audio.name,
    durationSeconds: audio.duration_seconds,
    validationRecorded: object(root.validation)?.ok === true,
    sourcePlan: typeof root.sourcePlan === "string" ? root.sourcePlan : null,
    sourceBanks,
    points,
  };
}

export function projectSpecialAutomationArtifact(actionId: string, artifactKind: string, data: unknown): SpecialArtifactView | null {
  if (actionId === "vocal_allocation.search" && artifactKind === "vocal-allocation") return projectVocalAllocation(data);
  if (actionId === "flowmusic.export" && artifactKind === "flowmusic-timeline") return projectFlowmusic(data);
  return null;
}
