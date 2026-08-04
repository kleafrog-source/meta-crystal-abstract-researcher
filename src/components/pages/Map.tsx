"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, RefreshCw, Search } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useFetch } from "@/hooks/use-fetch";

interface MapPoint {
  id: string;
  x: number;
  y: number;
  code: string;
  title: string;
  formula: string;
  type: string;
  qualityScore: number | null;
  metrics: {
    Q: number | null;
    QEC: number | null;
    D_f: number | null;
    G_S: number | null;
  };
  cluster: number | null;
  semanticClusterLabel: number | null;
  torusClusterLabel: number | null;
  torusPosition: {
    u: number | null;
    v: number | null;
  };
  createdAt: string;
}

interface MapResponse {
  ok: boolean;
  projection: "umap";
  total: number;
  availableClusters: number[];
  items: MapPoint[];
}

interface CrystalDetail {
  ok: boolean;
  crystal: {
    id: string;
    code: string;
    type: string;
    focus: string | null;
    pattern: string | null;
    combination: string;
    metrics: Record<string, number>;
    qualityScore: number | null;
    complexity: number | null;
    counter: number;
    llmMicroNote: string | null;
    fullFile: Record<string, unknown> | null;
  };
}

const SVG_WIDTH = 1200;
const SVG_HEIGHT = 760;
const PADDING = 48;
const CLUSTER_COLORS = [
  "#00BFFF",
  "#FFD700",
  "#FF6B9D",
  "#7CFC00",
  "#FF8C00",
  "#9370DB",
  "#00FA9A",
  "#FF4500",
  "#1E90FF",
  "#DAA520",
];

export function Map() {
  const [projection, setProjection] = useState("umap");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrystalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const { toast } = useToast();

  const mapUrl = useMemo(() => {
    const params = new URLSearchParams({ projection });
    if (clusterFilter !== "all") params.set("cluster", clusterFilter);
    if (search.trim()) params.set("search", search.trim());
    return `/api/crystals/map?${params.toString()}`;
  }, [clusterFilter, projection, search]);

  const { data, loading, error, refresh } = useFetch<MapResponse>(mapUrl);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/crystals/${selectedId}`)
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `HTTP ${response.status}`);
        }
        return response.json() as Promise<CrystalDetail>;
      })
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          toast({
            title: "Map detail error",
            description: (fetchError as Error).message,
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  const points = data?.items ?? [];
  const bounds = useMemo(() => {
    if (!points.length) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return {
      minX: padRange(minX, maxX).min,
      maxX: padRange(minX, maxX).max,
      minY: padRange(minY, maxY).min,
      maxY: padRange(minY, maxY).max,
    };
  }, [points]);

  const plotted = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        px: scale(point.x, bounds.minX, bounds.maxX, PADDING, SVG_WIDTH - PADDING),
        py: scale(point.y, bounds.minY, bounds.maxY, SVG_HEIGHT - PADDING, PADDING),
        radius: computeRadius(point),
        color: colorForPoint(point),
      })),
    [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, points],
  );

  useEffect(() => {
    if (error) {
      toast({
        title: "Map loading error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">Map</span>
              <Badge variant="outline">UMAP</Badge>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              2D navigation over crystal embeddings with semantic and torus context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{data?.total ?? 0} points</Badge>
            <Badge variant="outline">t-SNE later</Badge>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-4 overflow-hidden p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle className="text-base">Controls</CardTitle>
            <CardDescription>Filter the UMAP field and inspect local neighborhoods.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Projection</Label>
              <Select value={projection} onValueChange={setProjection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="umap">UMAP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Semantic cluster</Label>
              <Select value={clusterFilter} onValueChange={setClusterFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clusters</SelectItem>
                  {(data?.availableClusters ?? []).map((cluster) => (
                    <SelectItem key={`map-cluster-${cluster}`} value={String(cluster)}>
                      Cluster {cluster}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="flex gap-2">
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="code / focus / formula"
                />
                <Button size="icon" variant="outline" onClick={() => setSearch(searchDraft)}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setSearchDraft(""); setSearch(""); setClusterFilter("all"); }}>
                Reset
              </Button>
              <Button variant="outline" onClick={() => refresh()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
              <div>Color: semantic cluster</div>
              <div>Size: quality / Q metric</div>
              <div>Click point: open crystal details</div>
            </div>
            {hovered && (
              <div className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{hovered.code}</Badge>
                  {hovered.semanticClusterLabel !== null && <Badge variant="outline">semantic {hovered.semanticClusterLabel}</Badge>}
                  {hovered.torusClusterLabel !== null && <Badge variant="outline">torus {hovered.torusClusterLabel}</Badge>}
                </div>
                <div className="mt-2 font-medium break-words">{hovered.title}</div>
                <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                  {hovered.formula.slice(0, 220)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">UMAP Field</CardTitle>
            <CardDescription>
              Hover for metrics, click for full crystal detail, inspect semantic neighborhoods in 2D.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative h-[calc(100vh-220px)] min-h-[720px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading map points...
              </div>
            ) : !plotted.length ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No crystals with computed UMAP coordinates were found.
              </div>
            ) : (
              <div className="relative h-full overflow-hidden rounded-xl border border-border/70 bg-black/80">
                <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="h-full w-full">
                  <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill="#050508" />
                  <line x1={PADDING} x2={SVG_WIDTH - PADDING} y1={SVG_HEIGHT - PADDING} y2={SVG_HEIGHT - PADDING} stroke="#2a3441" strokeWidth="1" />
                  <line x1={PADDING} x2={PADDING} y1={PADDING} y2={SVG_HEIGHT - PADDING} stroke="#2a3441" strokeWidth="1" />
                  {plotted.map((point) => (
                    <circle
                      key={point.id}
                      cx={point.px}
                      cy={point.py}
                      r={point.radius}
                      fill={point.color}
                      opacity={hovered?.id === point.id ? 1 : 0.84}
                      stroke={hovered?.id === point.id ? "#ffffff" : "transparent"}
                      strokeWidth={hovered?.id === point.id ? 1.5 : 0}
                      onMouseEnter={(event) => {
                        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        setHovered(point);
                        if (rect) {
                          setHoverPosition({
                            x: event.clientX - rect.left,
                            y: event.clientY - rect.top,
                          });
                        }
                      }}
                      onMouseMove={(event) => {
                        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (rect) {
                          setHoverPosition({
                            x: event.clientX - rect.left,
                            y: event.clientY - rect.top,
                          });
                        }
                      }}
                      onMouseLeave={() => setHovered((current) => (current?.id === point.id ? null : current))}
                      onClick={() => setSelectedId(point.id)}
                      className="cursor-pointer"
                    />
                  ))}
                </svg>
                {hovered && (
                  <div
                    className="pointer-events-none absolute z-10 w-[320px] rounded-lg border border-cyan-400/30 bg-slate-950/95 p-3 text-sm shadow-2xl"
                    style={{
                      left: hoverPosition.x + 16,
                      top: Math.max(12, hoverPosition.y + 12),
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{hovered.code}</Badge>
                      <Badge variant="outline">{hovered.type}</Badge>
                    </div>
                    <div className="mt-2 font-medium break-words">{hovered.title}</div>
                    <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                      {hovered.formula.slice(0, 220)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {renderMetricBadge("Q", hovered.metrics.Q)}
                      {renderMetricBadge("QEC", hovered.metrics.QEC)}
                      {renderMetricBadge("D_f", hovered.metrics.D_f)}
                      {renderMetricBadge("G_S", hovered.metrics.G_S)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detail?.crystal.code ?? "Crystal detail"}</SheetTitle>
            <SheetDescription>{detail?.crystal.focus ?? "Map-selected crystal"}</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="mt-6 flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading detail...
            </div>
          ) : detail?.crystal ? (
            <ScrollArea className="mt-6 h-[calc(100vh-140px)] pr-4">
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{detail.crystal.type}</Badge>
                  {detail.crystal.pattern && <Badge variant="outline">{detail.crystal.pattern}</Badge>}
                  <Badge variant="outline">#{detail.crystal.counter}</Badge>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Formula</div>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 font-mono leading-6 break-all">
                    {detail.crystal.combination}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(detail.crystal.metrics).slice(0, 8).map(([key, value]) => (
                    <div key={`map-metric-${key}`} className="rounded-md border border-border/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div>
                      <div className="mt-1 text-base font-semibold">{formatMetric(value)}</div>
                    </div>
                  ))}
                </div>
                {detail.crystal.llmMicroNote && (
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">LLM Micro Note</div>
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">
                      {detail.crystal.llmMicroNote}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">Crystal detail is not available.</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function padRange(min: number, max: number) {
  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
}

function scale(value: number, domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  if (domainMax === domainMin) {
    return (rangeMin + rangeMax) / 2;
  }
  const ratio = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + ratio * (rangeMax - rangeMin);
}

function computeRadius(point: MapPoint) {
  const qValue = typeof point.metrics.Q === "number" ? point.metrics.Q : point.qualityScore;
  if (typeof qValue !== "number" || !Number.isFinite(qValue)) return 3.2;
  return Math.max(2.5, Math.min(7.5, 3 + qValue * 4));
}

function colorForPoint(point: MapPoint) {
  if (typeof point.semanticClusterLabel === "number") {
    return CLUSTER_COLORS[point.semanticClusterLabel % CLUSTER_COLORS.length] ?? "#9ad6ff";
  }
  const normalizedType = point.type.toLowerCase();
  if (normalizedType.includes("diamond") || normalizedType.includes("алмаз")) return "#ffd166";
  if (normalizedType.includes("emerald") || normalizedType.includes("изумруд")) return "#34d399";
  if (normalizedType.includes("hybrid") || normalizedType.includes("гибрид")) return "#60a5fa";
  return "#c084fc";
}

function renderMetricBadge(label: string, value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return <Badge key={`metric-${label}`} variant="outline">{label} {formatMetric(value)}</Badge>;
}

function formatMetric(value: number) {
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}
