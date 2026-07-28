"use client";

import { useEffect, useMemo, useState } from "react";
import type { GwTorusAnalysisResult } from "@/types/gw-collapser";
import { Activity, Loader2, Pause, Play, RefreshCw } from "@/components/icons";
import { GW_JSON_FIELD_HINTS, GW_METRIC_HINTS, GW_PARAMETER_HINTS } from "@/lib/gw-collapser-glossary";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CrystalListItem {
  id: string;
  code: string;
  combinationShort: string;
  type: string;
}

interface CrystalListResponse {
  ok: boolean;
  items: CrystalListItem[];
}

interface LegacyTorusDoc {
  id: string | number;
  x: number;
  y: number;
  cluster: number;
  label: string;
  text: string;
}

interface LegacyTorusFlow {
  path: number[][];
  final: number[];
  start: number[];
  speeds: number[];
}

interface LegacyTorusMetrics {
  V: number;
  S: number;
  N: number;
  D_f: number;
  QEC: number;
  CHSH: number;
  Q: number;
}

interface LegacyTopDoc {
  rank: number;
  index?: number;
  id?: string;
  title?: string;
  text: string;
  distance: number;
  cluster: number;
}

interface LegacyTorusPayload {
  torus: { R: number; r: number };
  docs: LegacyTorusDoc[];
  flow: LegacyTorusFlow;
  mmss: LegacyTorusMetrics;
  top_docs: LegacyTopDoc[];
  query: string;
  parameters: Record<string, unknown>;
}

interface CrystalTorusRunResponse {
  ok: boolean;
  crystalId: string;
  crystalCode: string;
  docsCount: number;
  query: string;
  storedAt: string;
  analysis?: GwTorusAnalysisResult;
  result?: LegacyTorusPayload;
}

interface PersistedTorusResponse {
  ok: boolean;
  crystalId: string;
  crystalCode: string;
  docsCount: number;
  query: string;
  storedAt: string;
  analysis?: GwTorusAnalysisResult;
  result?: LegacyTorusPayload;
}

interface StoredGwLayer {
  last_run_at?: string;
  query?: string;
  docs_count?: number;
  result?: LegacyTorusPayload;
}

interface ViewDoc {
  id: string;
  x: number;
  y: number;
  cluster: number;
  label: string;
  text: string;
  title?: string;
  sourcePath?: string;
  sourceIndex?: number;
}

interface ViewPayload {
  torus: { R: number; r: number };
  docs: ViewDoc[];
  flow: {
    path: [number, number][];
    final: [number, number];
    start: [number, number];
    speeds: number[];
  };
  mmss: LegacyTorusMetrics;
  top_docs: LegacyTopDoc[];
  query: string;
  parameters: Record<string, unknown>;
}

const DEFAULT_FORM = {
  n_clusters: 5,
  dt: 0.02,
  friction: 0.01,
  epsilon: 0.15,
  max_steps: 1500,
  tol_speed: 0.001,
  geometry_R: 1.2,
  geometry_r: 0.6,
  embedding_model: "qllama/bge-m3:q8_0",
};

export function GWCollapser() {
  const { data, loading, refresh } = useFetch<CrystalListResponse>("/api/crystals?page=1&pageSize=100");
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CrystalTorusRunResponse | null>(null);
  const [storedResult, setStoredResult] = useState<StoredGwLayer | null>(null);
  const [persistedAnalysis, setPersistedAnalysis] = useState<GwTorusAnalysisResult | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [frame, setFrame] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const { toast } = useToast();

  const filteredCrystals = useMemo(() => {
    const items = data?.items ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const hay = `${item.code} ${item.type} ${item.combinationShort}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data?.items, filter]);
  const effectiveSelectedId = selectedId || filteredCrystals[0]?.id || "";

  useEffect(() => {
    if (!effectiveSelectedId) return;

    let cancelled = false;
    setPersistedAnalysis(null);
    fetch(`/api/crystals/${effectiveSelectedId}/torus`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: PersistedTorusResponse | null) => {
        if (cancelled) return;
        setPersistedAnalysis(payload?.analysis ?? null);
        if (typeof payload?.query === "string") {
          setQuery((prev) => prev || payload.query || prev);
        }
      })
      .catch(() => {
        if (!cancelled) setPersistedAnalysis(null);
      });

    fetch(`/api/crystals/${effectiveSelectedId}`)
      .then((response) => response.json())
      .then((payload: { crystal?: { fullFile?: Record<string, unknown> | null } }) => {
        if (cancelled) return;
        const fullFile = payload?.crystal?.fullFile;
        const gwLayer =
          fullFile && typeof fullFile.gw_collapser === "object"
            ? (fullFile.gw_collapser as StoredGwLayer)
            : null;
        setStoredResult(gwLayer);
      })
      .catch(() => {
        if (!cancelled) setStoredResult(null);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedId]);

  const currentCrystal = filteredCrystals.find((item) => item.id === effectiveSelectedId) ?? null;
  const activeRunResult = result?.crystalId === effectiveSelectedId ? result : null;
  const activeAnalysis = activeRunResult?.analysis ?? persistedAnalysis ?? null;
  const activePayload = useMemo(
    () =>
      normalizePayload(activeRunResult?.analysis, activeRunResult?.result) ??
      normalizePayload(persistedAnalysis, undefined) ??
      normalizePayload(undefined, storedResult?.result) ??
      null,
    [activeRunResult?.analysis, activeRunResult?.result, persistedAnalysis, storedResult?.result],
  );

  const selectedDoc = useMemo(
    () => activePayload?.docs.find((doc) => doc.id === selectedDocId) ?? null,
    [activePayload?.docs, selectedDocId],
  );
  const activeFrameMax = Math.max(0, (activePayload?.flow.path.length ?? 0) - 1);

  useEffect(() => {
    setFrame(-1);
    setIsPlaying(false);
    setSelectedDocId(null);
    setHoveredDocId(null);
  }, [effectiveSelectedId, activePayload?.flow.path.length]);

  useEffect(() => {
    if (!isPlaying || !activePayload || activeFrameMax <= 0) return;
    const timer = window.setInterval(() => {
      setFrame((prev) => {
        const next = prev < 0 ? 0 : prev + 1;
        if (next >= activeFrameMax) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return activeFrameMax;
        }
        return next;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [isPlaying, activePayload, activeFrameMax]);

  const runAnalysis = async () => {
    if (!effectiveSelectedId) {
      toast({
        title: "Crystal is required",
        description: "Select a crystal before running GW-Collapser.",
        variant: "destructive",
      });
      return;
    }

    try {
      setRunning(true);
      const response = await apiPost<CrystalTorusRunResponse>(`/api/crystals/${effectiveSelectedId}/torus`, {
        query: query.trim() || undefined,
        ...form,
      });
      setResult(response);
      setPersistedAnalysis(response.analysis ?? null);
      setStoredResult({
        last_run_at: response.storedAt,
        query: response.query,
        docs_count: response.docsCount,
        result: response.result,
      });
      toast({
        title: "GW-Collapser finished",
        description: `${response.crystalCode} processed with ${response.docsCount} semantic fragments.`,
      });
    } catch (error) {
      toast({
        title: "GW-Collapser failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">GW-Collapser</span>
              <Badge variant="outline">torus flow</Badge>
              {currentCrystal ? (
                <Badge variant="outline" className="font-mono">
                  {currentCrystal.code}
                </Badge>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Crystal-level semantic collapse over extracted text fragments with MMSS metrics and torus projection.
            </p>
          </div>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh crystals
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Run analysis</CardTitle>
                <CardDescription>Select a crystal, override the query if needed, then launch the torus collapse.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel label="Filter crystals" />
                  <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="code / type / text" />
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Crystal" />
                  <select
                    value={effectiveSelectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select crystal</option>
                    {filteredCrystals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.type}
                      </option>
                    ))}
                  </select>
                  {currentCrystal ? (
                    <div className="rounded-md border border-border bg-card/40 p-2 text-xs text-muted-foreground">
                      {currentCrystal.combinationShort}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Query override" />
                  <textarea
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    rows={4}
                    placeholder="Leave empty to use the crystal-derived query"
                    className="flex min-h-[104px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Clusters" hint={GW_PARAMETER_HINTS.n_clusters} value={form.n_clusters} onChange={(value) => setForm((prev) => ({ ...prev, n_clusters: value }))} />
                  <NumberField label="Max steps" hint={GW_PARAMETER_HINTS.max_steps} value={form.max_steps} onChange={(value) => setForm((prev) => ({ ...prev, max_steps: value }))} />
                  <NumberField label="dt" hint={GW_PARAMETER_HINTS.dt} value={form.dt} step="0.01" onChange={(value) => setForm((prev) => ({ ...prev, dt: value }))} />
                  <NumberField label="Friction" hint={GW_PARAMETER_HINTS.friction} value={form.friction} step="0.01" onChange={(value) => setForm((prev) => ({ ...prev, friction: value }))} />
                  <NumberField label="Epsilon" hint={GW_PARAMETER_HINTS.epsilon} value={form.epsilon} step="0.01" onChange={(value) => setForm((prev) => ({ ...prev, epsilon: value }))} />
                  <NumberField label="Tol speed" hint={GW_PARAMETER_HINTS.tol_speed} value={form.tol_speed} step="0.001" onChange={(value) => setForm((prev) => ({ ...prev, tol_speed: value }))} />
                  <NumberField label="Torus R" hint={GW_PARAMETER_HINTS.geometry_R} value={form.geometry_R} step="0.1" onChange={(value) => setForm((prev) => ({ ...prev, geometry_R: value }))} />
                  <NumberField label="Torus r" hint={GW_PARAMETER_HINTS.geometry_r} value={form.geometry_r} step="0.1" onChange={(value) => setForm((prev) => ({ ...prev, geometry_r: value }))} />
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Embedding model" hint={GW_PARAMETER_HINTS.embedding_model} />
                  <Input
                    value={form.embedding_model}
                    onChange={(event) => setForm((prev) => ({ ...prev, embedding_model: event.target.value }))}
                  />
                </div>

                <Button className="w-full" onClick={runAnalysis} disabled={running || !effectiveSelectedId}>
                  {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                  Run GW-Collapser
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Stored state</CardTitle>
                <CardDescription>Latest torus snapshot persisted for this crystal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Last run: {formatCompactDate(activeRunResult?.storedAt ?? activeAnalysis?.stored_at ?? storedResult?.last_run_at)}</div>
                <div>Docs: {activePayload?.docs.length ?? storedResult?.docs_count ?? 0}</div>
                <div className="rounded-md border border-border bg-card/40 p-2 text-xs">
                  {activeRunResult?.query ?? activeAnalysis?.query ?? storedResult?.query ?? "No stored query yet."}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <MetricsGrid metrics={activePayload?.mmss ?? null} />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  Torus projection
                </CardTitle>
                <CardDescription>Interactive projection of the torus layout, document points and collapse path.</CardDescription>
              </CardHeader>
              <CardContent>
                {activePayload ? (
                  <TorusProjection
                    payload={activePayload}
                    frame={frame}
                    isPlaying={isPlaying}
                    hoveredDocId={hoveredDocId}
                    selectedDocId={selectedDocId}
                    onHoverDoc={setHoveredDocId}
                    onSelectDoc={setSelectedDocId}
                    onFrameChange={setFrame}
                    onTogglePlay={() => setIsPlaying((prev) => !prev)}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
                    Run GW-Collapser on a crystal to render the torus projection.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top attractor docs</CardTitle>
                  <CardDescription>Nearest fragments to the final collapse point.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[320px] pr-4">
                    <div className="space-y-2">
                      {(activePayload?.top_docs ?? []).map((item) => (
                        <button
                          type="button"
                          key={`${item.rank}-${item.id ?? item.title ?? item.text}`}
                          onClick={() => item.id && setSelectedDocId(item.id)}
                          className="w-full rounded-md border border-border bg-card/40 p-3 text-left transition hover:border-cyan-500/50"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <Badge variant="outline">#{item.rank}</Badge>
                            <span className="font-mono text-muted-foreground">
                              d={item.distance.toFixed(4)} · c{item.cluster}
                            </span>
                          </div>
                          <div className="text-sm">{item.text}</div>
                        </button>
                      ))}
                      {!activePayload?.top_docs?.length ? (
                        <div className="text-sm text-muted-foreground">No result yet.</div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Persisted analysis</CardTitle>
                  <CardDescription>Typed `GwTorusAnalysisResult` with field-level hints.</CardDescription>
                </CardHeader>
                <CardContent>
                  {activeAnalysis ? (
                    <ScrollArea className="h-[320px] pr-4">
                      <JsonTree value={activeAnalysis} />
                    </ScrollArea>
                  ) : (
                    <div className="text-sm text-muted-foreground">No persisted analysis yet.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Drawer open={Boolean(selectedDoc)} onOpenChange={(open) => (!open ? setSelectedDocId(null) : undefined)} direction="right">
        <DrawerContent className="max-w-xl">
          <DrawerHeader>
            <DrawerTitle>{selectedDoc?.title ?? selectedDoc?.label ?? "Fragment"}</DrawerTitle>
            <DrawerDescription>
              {selectedDoc ? `Cluster c${selectedDoc.cluster} · ${selectedDoc.id}` : "No fragment selected"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-auto p-4 pt-0">
            <InfoRow label="Source path" value={selectedDoc?.sourcePath ?? "not available"} />
            <InfoRow label="Point" value={selectedDoc ? `${selectedDoc.x.toFixed(3)}, ${selectedDoc.y.toFixed(3)}` : "n/a"} />
            <InfoRow label="Source index" value={selectedDoc?.sourceIndex !== undefined ? String(selectedDoc.sourceIndex) : "n/a"} />
            <div>
              <FieldLabel label="Text" />
              <div className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-card/40 p-3 text-sm">
                {selectedDoc?.text ?? "No fragment selected."}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} hint={hint} />
      <Input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: LegacyTorusMetrics | null }) {
  const entries = metrics
    ? [
        ["Q", metrics.Q],
        ["QEC", metrics.QEC],
        ["S", metrics.S],
        ["V", metrics.V],
        ["N", metrics.N],
        ["D_f", metrics.D_f],
        ["CHSH", metrics.CHSH],
      ]
    : [];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {entries.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel label={label} hint={GW_METRIC_HINTS[label] ?? ""} />
              <Badge variant="outline">{Number(value).toFixed(3)}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
      {!entries.length ? (
        <Card className="col-span-full">
          <CardContent className="p-4 text-sm text-muted-foreground">
            MMSS metrics will appear after the first successful run.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TorusProjection({
  payload,
  frame,
  isPlaying,
  hoveredDocId,
  selectedDocId,
  onHoverDoc,
  onSelectDoc,
  onFrameChange,
  onTogglePlay,
}: {
  payload: ViewPayload;
  frame: number;
  isPlaying: boolean;
  hoveredDocId: string | null;
  selectedDocId: string | null;
  onHoverDoc: (id: string | null) => void;
  onSelectDoc: (id: string | null) => void;
  onFrameChange: (value: number) => void;
  onTogglePlay: () => void;
}) {
  const width = 760;
  const height = 420;
  const visiblePath = frame >= 0 ? payload.flow.path.slice(0, frame + 1) : payload.flow.path;
  const points = payload.docs.map((doc) => projectTorusPoint(doc.x, doc.y, payload.torus));
  const path = visiblePath.map(([x, y]) => projectTorusPoint(x, y, payload.torus));
  const start = projectTorusPoint(payload.flow.start[0], payload.flow.start[1], payload.torus);
  const final = projectTorusPoint(payload.flow.final[0], payload.flow.final[1], payload.torus);
  const currentPoint = visiblePath.length
    ? projectTorusPoint(visiblePath[visiblePath.length - 1][0], visiblePath[visiblePath.length - 1][1], payload.torus)
    : start;
  const ring = buildTorusRing(payload.torus);
  const pathData = path.map((point, index) => `${index === 0 ? "M" : "L"} ${point.sx} ${point.sy}`).join(" ");
  const maxFrame = Math.max(0, payload.flow.path.length - 1);

  return (
    <div className="space-y-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-lg border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/60"
      >
        <path d={ring.outer} fill="none" stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1.2" />
        <path d={ring.inner} fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="1" strokeDasharray="4 6" />
        {pathData ? <path d={pathData} fill="none" stroke="rgba(34, 211, 238, 0.92)" strokeWidth="2.25" /> : null}
        {points.map((point, index) => {
          const doc = payload.docs[index];
          const isHovered = hoveredDocId === doc.id;
          const isSelected = selectedDocId === doc.id;
          return (
            <Tooltip key={doc.id}>
              <TooltipTrigger asChild>
                <circle
                  cx={point.sx}
                  cy={point.sy}
                  r={isSelected ? 7 : isHovered ? 6 : 3 + point.depth * 1.6}
                  fill={clusterColor(doc.cluster)}
                  opacity={isSelected ? 1 : isHovered ? 0.95 : 0.45 + point.depth * 0.45}
                  stroke={isSelected ? "white" : "transparent"}
                  strokeWidth={isSelected ? "1.5" : "0"}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => onHoverDoc(doc.id)}
                  onMouseLeave={() => onHoverDoc(null)}
                  onClick={() => onSelectDoc(doc.id)}
                />
              </TooltipTrigger>
              <TooltipContent sideOffset={8} className="max-w-xs text-left">
                <div className="space-y-1">
                  <div className="font-medium">{doc.title ?? doc.label}</div>
                  <div>Cluster: c{doc.cluster}</div>
                  <div className="text-[11px] opacity-80">{doc.text.slice(0, 160)}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        <circle cx={start.sx} cy={start.sy} r="5" fill="#f59e0b" />
        <circle cx={final.sx} cy={final.sy} r="6.5" fill="#22c55e" stroke="white" strokeWidth="1" />
        {path.length ? <circle cx={currentPoint.sx} cy={currentPoint.sy} r="5.5" fill="#67e8f9" stroke="white" strokeWidth="1" /> : null}
      </svg>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-4">
        <InfoStat label="Start" value={formatPair(payload.flow.start)} />
        <InfoStat label="Final" value={formatPair(payload.flow.final)} />
        <InfoStat label="Frame" value={frame < 0 ? `all (${payload.flow.path.length})` : `${frame + 1}/${payload.flow.path.length}`} />
        <InfoStat label="Docs plotted" value={String(payload.docs.length)} />
      </div>

      <div className="rounded-lg border border-border bg-card/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <FieldLabel label="Trajectory playback" hint="Move through the collapse path or animate it frame by frame." />
          <Button size="sm" variant="outline" onClick={onTogglePlay} disabled={maxFrame <= 0}>
            {isPlaying ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
        </div>
        <Slider
          value={[frame < 0 ? maxFrame : frame]}
          min={0}
          max={Math.max(0, maxFrame)}
          step={1}
          onValueChange={([value]) => onFrameChange(value)}
          disabled={maxFrame <= 0}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <button type="button" className="underline-offset-4 hover:underline" onClick={() => onFrameChange(-1)}>
            Show full path
          </button>
          <span>{payload.torus.R.toFixed(1)} / {payload.torus.r.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function JsonTree({ value, path = [] }: { value: unknown; path?: string[] }) {
  if (value === null || value === undefined) {
    return <div className="text-xs text-muted-foreground">null</div>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-1 pl-3">
        {value.map((item, index) => (
          <div key={[...path, String(index)].join(".")} className="rounded-md border border-border/40 bg-card/20 p-2">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">[{index}]</div>
            <JsonTree value={item} path={[...path, String(index)]} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    return (
      <div className="space-y-2 pl-1">
        {Object.entries(value as Record<string, unknown>).map(([key, child]) => (
          <div key={[...path, key].join(".")} className="rounded-md border border-border/40 bg-card/20 p-2">
            <div className="mb-1 flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-xs font-semibold text-cyan-300">{key}</span>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-xs text-left">
                  {GW_JSON_FIELD_HINTS[key] ?? "Persisted analysis field."}
                </TooltipContent>
              </Tooltip>
              <span className="text-[11px] text-muted-foreground">{describeValue(child)}</span>
            </div>
            <JsonTree value={child} path={[...path, key]} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <code className={valueColor(value)}>
      {typeof value === "string" ? JSON.stringify(value) : String(value)}
    </code>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="mt-1 rounded-md border border-border bg-card/30 p-2 text-sm">{value}</div>
    </div>
  );
}

function normalizePayload(
  analysis?: GwTorusAnalysisResult | null,
  legacy?: LegacyTorusPayload,
): ViewPayload | null {
  if (analysis) {
    return {
      torus: {
        R: analysis.torus.R,
        r: analysis.torus.r,
      },
      docs: analysis.docs.map((doc) => ({
        id: doc.id,
        x: doc.torus.x,
        y: doc.torus.y,
        cluster: doc.cluster,
        label: doc.title,
        title: doc.title,
        text: doc.text,
        sourcePath: doc.sourcePath,
        sourceIndex: doc.sourceIndex,
      })),
      flow: {
        path: analysis.flow.history,
        final: analysis.flow.final,
        start: analysis.flow.start,
        speeds: analysis.flow.speeds,
      },
      mmss: analysis.mmss,
      top_docs: analysis.top_docs,
      query: analysis.query,
      parameters: analysis.parameters,
    };
  }

  if (legacy) {
    return {
      torus: legacy.torus,
      docs: legacy.docs.map((doc) => ({
        id: String(doc.id),
        x: doc.x,
        y: doc.y,
        cluster: doc.cluster,
        label: doc.label,
        title: doc.label,
        text: doc.text,
      })),
      flow: {
        path: legacy.flow.path.map((point) => [Number(point[0] ?? 0), Number(point[1] ?? 0)] as [number, number]),
        final: [Number(legacy.flow.final[0] ?? 0), Number(legacy.flow.final[1] ?? 0)],
        start: [Number(legacy.flow.start[0] ?? 0), Number(legacy.flow.start[1] ?? 0)],
        speeds: legacy.flow.speeds.map((item) => Number(item ?? 0)),
      },
      mmss: legacy.mmss,
      top_docs: legacy.top_docs,
      query: legacy.query,
      parameters: legacy.parameters,
    };
  }

  return null;
}

function projectTorusPoint(x: number, y: number, torus: { R: number; r: number }) {
  const X = (torus.R + torus.r * Math.cos(y)) * Math.cos(x);
  const Y = (torus.R + torus.r * Math.cos(y)) * Math.sin(x);
  const Z = torus.r * Math.sin(y);
  const scale = 118;
  return {
    sx: 380 + X * scale,
    sy: 210 + Z * scale,
    depth: (Y + (torus.R + torus.r)) / (2 * (torus.R + torus.r)),
  };
}

function buildTorusRing(torus: { R: number; r: number }) {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let step = 0; step <= 120; step += 1) {
    const angle = (step / 120) * Math.PI * 2;
    const outerPoint = projectFlatPoint(torus.R + torus.r, angle);
    const innerPoint = projectFlatPoint(Math.max(0.1, torus.R - torus.r), angle);
    outer.push(`${step === 0 ? "M" : "L"} ${outerPoint[0]} ${outerPoint[1]}`);
    inner.push(`${step === 0 ? "M" : "L"} ${innerPoint[0]} ${innerPoint[1]}`);
  }
  return { outer: outer.join(" "), inner: inner.join(" ") };
}

function projectFlatPoint(radius: number, angle: number) {
  const scale = 118;
  return [380 + Math.cos(angle) * radius * scale, 210 + Math.sin(angle) * radius * scale * 0.38];
}

function clusterColor(cluster: number) {
  const palette = ["#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#38bdf8", "#facc15"];
  return palette[cluster % palette.length];
}

function formatPair(value: number[]) {
  return value.map((item) => item.toFixed(2)).join(", ");
}

function formatCompactDate(value?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeValue(value: unknown) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return "null";
  return typeof value;
}

function valueColor(value: unknown) {
  if (typeof value === "number") return "text-amber-300 text-xs";
  if (typeof value === "string") return "text-emerald-300 text-xs";
  if (typeof value === "boolean") return "text-fuchsia-300 text-xs";
  return "text-muted-foreground text-xs";
}
