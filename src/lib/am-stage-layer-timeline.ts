import type { ActiveParameter } from "@/lib/rag-v3/types";
import { ACOUSTIC_DOMAIN_LAYERS, type AcousticDomainLayerId } from "@/lib/domain-layers";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";

export const UNCLASSIFIED_TIMELINE_LAYER = {
  id: "UNCLASSIFIED",
  label: "Unclassified",
  color: "#94a3b8",
} as const;

export type LayerTimelineSource = "clap" | "siglip" | "text";
export interface LayerTimelineSeries {
  key: string;
  label: string;
  source: LayerTimelineSource;
  color: string;
  values: Array<{ time: number; value: number; min: number; max: number }>;
  movement: number;
}
export interface LayerTimelineLane {
  id: string;
  label: string;
  color: string;
  series: LayerTimelineSeries[];
  totalSeries: number;
}

const layerIds = new Set<string>(ACOUSTIC_DOMAIN_LAYERS.map(({ id }) => id));
const layerColors = new Map(ACOUSTIC_DOMAIN_LAYERS.map(({ id, color }) => [id, color]));
const MAX_SERIES_PER_LANE = 12;

function resolveLayer(parameter: ActiveParameter): AcousticDomainLayerId | null {
  const explicit = (parameter as ActiveParameter & { domain_layer?: unknown }).domain_layer;
  if (typeof explicit === "string" && layerIds.has(explicit)) return explicit as AcousticDomainLayerId;
  if (explicit === "GLOBAL_CONSENSUS_LAYER") return null;
  return classifyDomainLayer(parameter.technical_name, parameter.category) as AcousticDomainLayerId | null;
}

function movementOf(values: LayerTimelineSeries["values"]): number {
  return values.reduce((sum, point, index) => index
    ? sum + Math.abs(point.value - values[index - 1].value) / Math.max(1e-9, point.max - point.min)
    : sum, 0);
}

/** Projects already-computed CLAP/SigLIP frames and the active TEXT brief into acoustic layers. */
export function buildLayerTimelineLanes(
  segments: Array<{ time: number; clap: ActiveParameter[]; siglip: ActiveParameter[] }>,
  textParameters: ActiveParameter[],
  duration: number,
  showClap: boolean,
  showSiglip: boolean,
): LayerTimelineLane[] {
  const buckets = new Map<string, { layerId: string; source: LayerTimelineSource; name: string; values: LayerTimelineSeries["values"] }>();
  const add = (parameter: ActiveParameter, source: LayerTimelineSource, time: number) => {
    if (typeof parameter.current_value !== "number" || !Number.isFinite(parameter.current_value)) return;
    if ((parameter as ActiveParameter & { domain_layer?: unknown }).domain_layer === "GLOBAL_CONSENSUS_LAYER") return;
    const layerId = resolveLayer(parameter) ?? UNCLASSIFIED_TIMELINE_LAYER.id;
    const key = `${layerId}:${source}:${parameter.technical_name}`;
    const bucket = buckets.get(key) ?? { layerId, source, name: parameter.technical_name, values: [] };
    bucket.values.push({
      time,
      value: parameter.current_value,
      min: typeof parameter.min_value === "number" ? parameter.min_value : parameter.current_value - 1,
      max: typeof parameter.max_value === "number" ? parameter.max_value : parameter.current_value + 1,
    });
    buckets.set(key, bucket);
  };

  if (showClap || showSiglip) for (const segment of segments) {
    if (showClap) for (const parameter of segment.clap) add(parameter, "clap", segment.time);
    if (showSiglip) for (const parameter of segment.siglip) add(parameter, "siglip", segment.time);
  }
  if (duration > 0) for (const parameter of textParameters) {
    add(parameter, "text", 0);
    add(parameter, "text", duration);
  }

  const seriesByLayer = new Map<string, LayerTimelineSeries[]>();
  for (const bucket of buckets.values()) {
    if (!bucket.values.length) continue;
    const values = bucket.values.sort((a, b) => a.time - b.time);
    const series: LayerTimelineSeries = {
      key: `${bucket.source}:${bucket.name}`,
      label: bucket.name,
      source: bucket.source,
      color: layerColors.get(bucket.layerId as AcousticDomainLayerId) ?? UNCLASSIFIED_TIMELINE_LAYER.color,
      values,
      movement: movementOf(values),
    };
    const list = seriesByLayer.get(bucket.layerId) ?? [];
    list.push(series);
    seriesByLayer.set(bucket.layerId, list);
  }

  const layers = [...ACOUSTIC_DOMAIN_LAYERS, UNCLASSIFIED_TIMELINE_LAYER];
  return layers.flatMap((layer) => {
    const series = (seriesByLayer.get(layer.id) ?? []).sort((a, b) => b.movement - a.movement);
    if (!series.length) return [];
    return [{ id: layer.id, label: layer.id === "UNCLASSIFIED" ? "Unclassified" : layer.label, color: layer.color, totalSeries: series.length, series: series.slice(0, MAX_SERIES_PER_LANE) }];
  });
}

export const LAYER_TIMELINE_SERIES_LIMIT = MAX_SERIES_PER_LANE;
