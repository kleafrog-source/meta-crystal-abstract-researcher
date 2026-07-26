"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, Play, RefreshCw } from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface CrystalDetailResponse {
  ok: boolean;
  crystal: {
    fullFile: Record<string, unknown> | null;
  };
}

interface TorusDoc {
  id: number;
  x: number;
  y: number;
  cluster: number;
  label: string;
  text: string;
}

interface TorusFlow {
  path: number[][];
  final: number[];
  start: number[];
  speeds: number[];
}

interface TorusMetrics {
  V: number;
  S: number;
  N: number;
  D_f: number;
  QEC: number;
  CHSH: number;
  Q: number;
}

interface TopDoc {
  rank: number;
  index: number;
  text: string;
  distance: number;
  cluster: number;
}

interface TorusPayload {
  torus: { R: number; r: number };
  docs: TorusDoc[];
  flow: TorusFlow;
  mmss: TorusMetrics;
  top_docs: TopDoc[];
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
  result: TorusPayload;
}

interface StoredGwLayer {
  last_run_at?: string;
  query?: string;
  docs_count?: number;
  result?: TorusPayload;
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

const METRIC_HINTS: Record<string, string> = {
  V: "Path volume and traversal intensity of the collapse trajectory.",
  S: "Motion stability derived from speed variability.",
  N: "Noise level estimated from trajectory direction changes.",
  D_f: "Fractal density of visited torus cells.",
  QEC: "Collapse efficiency near the strongest attractors.",
  CHSH: "Contrast heuristic for the retrieved semantic region.",
  Q: "Composite GW-Collapser quality score.",
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
    if (!effectiveSelectedId) {
      return;
    }
    fetch(`/api/crystals/${effectiveSelectedId}`)
      .then((response) => response.json())
      .then((payload: CrystalDetailResponse) => {
        const fullFile = payload?.crystal?.fullFile;
        const gwLayer =
          fullFile && typeof fullFile.gw_collapser === "object"
            ? (fullFile.gw_collapser as StoredGwLayer)
            : null;
        setStoredResult(gwLayer);
        if (typeof gwLayer?.query === "string") {
          setQuery((prev) => prev || gwLayer.query || prev);
        }
      })
      .catch(() => {
        setStoredResult(null);
      });
  }, [effectiveSelectedId]);

  const currentCrystal = filteredCrystals.find((item) => item.id === effectiveSelectedId) ?? null;
  const activeRunResult = result?.crystalId === effectiveSelectedId ? result : null;
  const activeStoredResult = effectiveSelectedId ? storedResult : null;
  const activePayload = activeRunResult?.result ?? activeStoredResult?.result ?? null;

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
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="code / type / text"
                  />
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
                  <NumberField label="Clusters" value={form.n_clusters} onChange={(value) => setForm((prev) => ({ ...prev, n_clusters: value }))} />
                  <NumberField label="Max steps" value={form.max_steps} onChange={(value) => setForm((prev) => ({ ...prev, max_steps: value }))} />
                  <NumberField label="dt" value={form.dt} step="0.01" onChange={(value) => setForm((prev) => ({ ...prev, dt: value }))} />
                  <NumberField label="Friction" value={form.friction} step="0.01" onChange={(value) => setForm((prev) => ({ ...prev, friction: value }))} />
                  <NumberField label="Epsilon" value={form.epsilon} step="0.01" onChange={(value) => setForm((prev) => ({ ...prev, epsilon: value }))} />
                  <NumberField label="Tol speed" value={form.tol_speed} step="0.001" onChange={(value) => setForm((prev) => ({ ...prev, tol_speed: value }))} />
                  <NumberField label="Torus R" value={form.geometry_R} step="0.1" onChange={(value) => setForm((prev) => ({ ...prev, geometry_R: value }))} />
                  <NumberField label="Torus r" value={form.geometry_r} step="0.1" onChange={(value) => setForm((prev) => ({ ...prev, geometry_r: value }))} />
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Embedding model" />
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
                <CardDescription>Latest torus snapshot persisted back into the crystal JSON file.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Last run: {activeStoredResult?.last_run_at ?? "not available"}</div>
                <div>Docs: {activeStoredResult?.docs_count ?? activePayload?.docs.length ?? 0}</div>
                <div className="rounded-md border border-border bg-card/40 p-2 text-xs">
                  {activeStoredResult?.query ?? "No stored query yet."}
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
                <CardDescription>SVG projection of the torus layout, document attractors and the collapse path.</CardDescription>
              </CardHeader>
              <CardContent>
                {activePayload ? (
                  <TorusProjection payload={activePayload} />
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
                        <div key={`${item.rank}-${item.index}`} className="rounded-md border border-border bg-card/40 p-3">
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <Badge variant="outline">#{item.rank}</Badge>
                            <span className="font-mono text-muted-foreground">
                              d={item.distance.toFixed(4)} · c{item.cluster}
                            </span>
                          </div>
                          <div className="text-sm">{item.text}</div>
                        </div>
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
                  <CardTitle className="text-sm">Run summary</CardTitle>
                  <CardDescription>Query, dynamics and parameter snapshot.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <FieldLabel label="Resolved query" />
                    <div className="mt-2 rounded-md border border-border bg-card/40 p-3 text-sm">
                      {activeRunResult?.query ?? activeStoredResult?.query ?? "No query recorded yet."}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <MiniStat label="Path points" value={String(activePayload?.flow.path.length ?? 0)} />
                    <MiniStat label="Speed samples" value={String(activePayload?.flow.speeds.length ?? 0)} />
                    <MiniStat label="Docs" value={String(activeRunResult?.docsCount ?? activeStoredResult?.docs_count ?? activePayload?.docs.length ?? 0)} />
                    <MiniStat label="Stored at" value={formatCompactDate(activeRunResult?.storedAt ?? activeStoredResult?.last_run_at)} />
                  </div>

                  <div>
                    <FieldLabel label="Parameters" />
                    <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
                      {JSON.stringify(activePayload?.parameters ?? {}, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} />
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: TorusMetrics | null }) {
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
              <FieldLabel label={label} hint={METRIC_HINTS[label] ?? ""} />
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

function TorusProjection({ payload }: { payload: TorusPayload }) {
  const width = 760;
  const height = 420;
  const points = payload.docs.map((doc) => projectTorusPoint(doc.x, doc.y, payload.torus));
  const path = payload.flow.path.map(([x, y]) => projectTorusPoint(x, y, payload.torus));
  const start = projectTorusPoint(payload.flow.start[0], payload.flow.start[1], payload.torus);
  const final = projectTorusPoint(payload.flow.final[0], payload.flow.final[1], payload.torus);
  const ring = buildTorusRing(payload.torus);
  const pathData = path.map((point, index) => `${index === 0 ? "M" : "L"} ${point.sx} ${point.sy}`).join(" ");

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-lg border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/60"
      >
        <path d={ring.outer} fill="none" stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1.2" />
        <path d={ring.inner} fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="1" strokeDasharray="4 6" />
        <path d={pathData} fill="none" stroke="rgba(34, 211, 238, 0.92)" strokeWidth="2.25" />
        {points.map((point, index) => (
          <circle
            key={payload.docs[index].id}
            cx={point.sx}
            cy={point.sy}
            r={3 + point.depth * 1.6}
            fill={clusterColor(payload.docs[index].cluster)}
            opacity={0.45 + point.depth * 0.45}
          />
        ))}
        <circle cx={start.sx} cy={start.sy} r="5" fill="#f59e0b" />
        <circle cx={final.sx} cy={final.sy} r="6.5" fill="#22c55e" stroke="white" strokeWidth="1" />
      </svg>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-4">
        <MiniStat label="Start" value={formatPair(payload.flow.start)} />
        <MiniStat label="Final" value={formatPair(payload.flow.final)} />
        <MiniStat label="Torus R/r" value={`${payload.torus.R} / ${payload.torus.r}`} />
        <MiniStat label="Docs plotted" value={String(payload.docs.length)} />
      </div>
    </div>
  );
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
