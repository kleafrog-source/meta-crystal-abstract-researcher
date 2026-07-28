"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Database, FileText, Loader2, Play, Search, Sparkles } from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  GwCrystalPoolActionDefinition,
  GwCrystalPoolActionId,
  GwCrystalPoolActionResponse,
  GwCrystalPoolListItem,
  GwCrystalPoolVisualizationPoint,
} from "@/types/gw-collapser-pool";

interface CrystalPoolResponse {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  actions: GwCrystalPoolActionDefinition[];
  items: GwCrystalPoolListItem[];
}

interface PoolVisualizationResponse {
  ok: boolean;
  total: number;
  limit: number;
  torus: { R: number; r: number };
  points: GwCrystalPoolVisualizationPoint[];
}

const ACTION_ICONS: Partial<Record<GwCrystalPoolActionId, React.ComponentType<{ className?: string }>>> = {
  torus_flow: Activity,
  micro_notes: FileText,
  manifest_donors: Database,
  semantic_twins: Search,
  auto_annotation: Sparkles,
};

export function GWCollapserCrystalPool() {
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [runningAction, setRunningAction] = useState<GwCrystalPoolActionId | null>(null);
  const [actionResult, setActionResult] = useState<GwCrystalPoolActionResponse | null>(null);
  const [detailItem, setDetailItem] = useState<GwCrystalPoolListItem | null>(null);
  const [torusDialogOpen, setTorusDialogOpen] = useState(false);
  const [visualizationHover, setVisualizationHover] = useState<string | null>(null);
  const [torusParams, setTorusParams] = useState({
    n_clusters: 5,
    max_steps: 100,
    dt: 0.02,
    friction: 0.01,
    epsilon: 0.15,
    tol_speed: 0.001,
    geometry_R: 1.2,
    geometry_r: 0.6,
  });
  const { toast } = useToast();
  const { data, loading, refresh } = useFetch<CrystalPoolResponse>(
    `/api/gw-collapser/pool?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`,
  );
  const selectionQuery = useMemo(() => selectedIds.slice(0, 24).join(","), [selectedIds]);
  const { data: visualization } = useFetch<PoolVisualizationResponse>(
    selectionQuery ? `/api/gw-collapser/pool/visualization?crystalIds=${encodeURIComponent(selectionQuery)}&limit=100` : null,
  );

  const items = data?.items ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedSet.has(item.id));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const groupedActions = useMemo(() => {
    const source = data?.actions ?? [];
    return {
      analysis: source.filter((item) => item.category === "analysis"),
      generation: source.filter((item) => item.category === "generation"),
      manual: source.filter((item) => item.category === "manual"),
      visualization: source.filter((item) => item.category === "visualization"),
    };
  }, [data?.actions]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleVisible = (next: boolean) => {
    if (!next) {
      setSelectedIds((prev) => prev.filter((id) => !items.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...items.map((item) => item.id)])]);
  };

  const runAction = async (action: GwCrystalPoolActionDefinition) => {
    if (!selectedIds.length) {
      toast({
        title: "Ничего не выбрано",
        description: "Выберите хотя бы один кристалл в таблице Crystal Pool.",
        variant: "destructive",
      });
      return;
    }

    if (action.id === "torus_flow") {
      setTorusDialogOpen(true);
      return;
    }
    setRunningAction(action.id);
    try {
      const response = await apiPost<GwCrystalPoolActionResponse>(
        `/api/gw-collapser/pool/actions/${action.id}`,
        { crystalIds: selectedIds, params: {} },
      );
      setActionResult(response);
      refresh();
      toast({
        title: action.name,
        description:
          response.availability === "ready"
            ? `Обработано: ${response.affectedCount}`
            : "Действие заведено в registry, но ещё не подключено к production-логике.",
      });
    } catch (error) {
      toast({
        title: `Ошибка: ${action.name}`,
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const runTorusFlowWithParams = async () => {
    setRunningAction("torus_flow");
    try {
      const response = await apiPost<GwCrystalPoolActionResponse>(
        "/api/gw-collapser/pool/actions/torus_flow",
        { crystalIds: selectedIds, params: torusParams },
      );
      setActionResult(response);
      setTorusDialogOpen(false);
      refresh();
      toast({
        title: "TorusFlow GWCollapser",
        description: `Обработано: ${response.affectedCount}`,
      });
    } catch (error) {
      toast({
        title: "Ошибка: TorusFlow GWCollapser",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline">crystal pool</Badge>
                GW-Collapser Crystal Pool
              </CardTitle>
              <CardDescription>
                Bulk selection and action orchestration over the crystal library. Demo structure replaced with typed production API.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{data?.total ?? 0} crystals</Badge>
              <Badge variant="outline">{selectedIds.length} selected</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Filter by code, type, pattern or combination"
              className="max-w-md"
            />
            <Button variant="outline" onClick={() => setSearch(draftSearch.trim())}>
              <Search className="mr-2 h-4 w-4" />
              Find
            </Button>
            <Button variant="outline" onClick={() => { setDraftSearch(""); setSearch(""); setPage(1); }}>
              Reset
            </Button>
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span>Page size</span>
              {[10, 20, 40, 80].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={pageSize === value ? "default" : "outline"}
                  onClick={() => setPageSize(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <div>
              Page {page} / {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Crystal Pool</CardTitle>
                <CardDescription>
                  Current scaffold keeps bulk operations typed and evolvable without mutating the old GW-Collapser flow.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={allVisibleSelected} onCheckedChange={(value) => toggleVisible(Boolean(value))} />
                      </TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Pattern</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Torus</TableHead>
                      <TableHead>Micro note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                          Loading crystal pool...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                          No crystals matched the current filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {items.map((item) => (
                      <TableRow key={item.id} data-state={selectedSet.has(item.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox checked={selectedSet.has(item.id)} onCheckedChange={() => toggleId(item.id)} />
                        </TableCell>
                        <TableCell>
                          <button className="font-mono text-left text-cyan-300 hover:text-cyan-200" onClick={() => setDetailItem(item)}>
                            {item.code}
                          </button>
                        </TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell>{item.pattern ?? "—"}</TableCell>
                        <TableCell>{item.qualityScore != null ? item.qualityScore.toFixed(3) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.hasTorusAnalysis ? "ready" : "none"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-muted-foreground">
                          {item.llmMicroNote ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <ActionGroup title="Analysis" actions={groupedActions.analysis} runningAction={runningAction} onRun={runAction} />
              <ActionGroup title="Generation" actions={groupedActions.generation} runningAction={runningAction} onRun={runAction} />
              <ActionGroup title="Visualization" actions={groupedActions.visualization} runningAction={runningAction} onRun={runAction} />
              <ActionGroup title="Manual" actions={groupedActions.manual} runningAction={runningAction} onRun={runAction} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Crystal Pool Torus Projection</CardTitle>
          <CardDescription>
            Aggregated visualization over persisted torus docs for the current selection, capped at 100 points.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectionQuery ? (
            <div className="text-sm text-muted-foreground">Select crystals in the pool to render their persisted torus fragments.</div>
          ) : !(visualization?.points?.length) ? (
            <div className="text-sm text-muted-foreground">No persisted torus points found for the current selection.</div>
          ) : (
            <PoolProjection
              torus={visualization.torus}
              points={visualization.points}
              hoveredKey={visualizationHover}
              onHover={setVisualizationHover}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Last action result</CardTitle>
          <CardDescription>
            Ready actions already return structured production output; scaffolded actions expose their contract early without fake side effects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!actionResult ? (
            <div className="text-sm text-muted-foreground">Run an action from the Crystal Pool to inspect its typed result.</div>
          ) : (
            <ScrollArea className="max-h-[360px]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{actionResult.actionName}</Badge>
                  <Badge variant="outline">{actionResult.availability}</Badge>
                  <Badge variant="outline">{actionResult.affectedCount} affected</Badge>
                </div>
                {actionResult.results.map((item) => (
                  <div key={`${item.id}-${item.code ?? "row"}`} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-sm">{item.code ?? item.id}</div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.summary}</div>
                    {item.data && (
                      <pre className="mt-3 overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">
                        {JSON.stringify(item.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                {actionResult.extra && (
                  <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">
                    {JSON.stringify(actionResult.extra, null, 2)}
                  </pre>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailItem?.code ?? "Crystal"}</SheetTitle>
            <SheetDescription>{detailItem?.type ?? ""}</SheetDescription>
          </SheetHeader>
          {detailItem && (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label="Pattern" value={detailItem.pattern ?? "—"} />
              <DetailRow label="Category" value={detailItem.category ?? "—"} />
              <DetailRow label="Quality" value={detailItem.qualityScore != null ? detailItem.qualityScore.toFixed(3) : "—"} />
              <DetailRow label="Complexity" value={detailItem.complexity != null ? String(detailItem.complexity) : "—"} />
              <DetailRow label="Torus analysis" value={detailItem.hasTorusAnalysis ? "Persisted snapshot exists" : "No persisted snapshot"} />
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Combination</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailItem.combination}</div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Micro note</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">
                  {detailItem.llmMicroNote ?? "—"}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Vector direction</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">
                  {detailItem.vectorDirection ?? "—"}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={torusDialogOpen} onOpenChange={setTorusDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>TorusFlow GWCollapser</DialogTitle>
            <DialogDescription>
              Review runtime parameters before launching the torus analysis for the selected crystals.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <NumericField label="Clusters" value={torusParams.n_clusters} onChange={(value) => setTorusParams((prev) => ({ ...prev, n_clusters: value }))} />
            <NumericField label="Max steps" value={torusParams.max_steps} onChange={(value) => setTorusParams((prev) => ({ ...prev, max_steps: value }))} />
            <NumericField label="dt" value={torusParams.dt} onChange={(value) => setTorusParams((prev) => ({ ...prev, dt: value }))} step="0.001" />
            <NumericField label="Friction" value={torusParams.friction} onChange={(value) => setTorusParams((prev) => ({ ...prev, friction: value }))} step="0.001" />
            <NumericField label="Epsilon" value={torusParams.epsilon} onChange={(value) => setTorusParams((prev) => ({ ...prev, epsilon: value }))} step="0.001" />
            <NumericField label="Tol speed" value={torusParams.tol_speed} onChange={(value) => setTorusParams((prev) => ({ ...prev, tol_speed: value }))} step="0.0001" />
            <NumericField label="Torus R" value={torusParams.geometry_R} onChange={(value) => setTorusParams((prev) => ({ ...prev, geometry_R: value }))} step="0.1" />
            <NumericField label="Torus r" value={torusParams.geometry_r} onChange={(value) => setTorusParams((prev) => ({ ...prev, geometry_r: value }))} step="0.1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTorusDialogOpen(false)}>Cancel</Button>
            <Button onClick={runTorusFlowWithParams} disabled={runningAction === "torus_flow"}>
              {runningAction === "torus_flow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionGroup({
  title,
  actions,
  runningAction,
  onRun,
}: {
  title: string;
  actions: GwCrystalPoolActionDefinition[];
  runningAction: GwCrystalPoolActionId | null;
  onRun: (action: GwCrystalPoolActionDefinition) => void;
}) {
  if (!actions.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.id];
          const busy = runningAction === action.id;
          return (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto w-full items-start justify-start gap-3 whitespace-normal py-3 text-left"
              disabled={Boolean(runningAction)}
              onClick={() => onRun(action)}
            >
              {busy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : Icon ? <Icon className="mt-0.5 h-4 w-4" /> : <Activity className="mt-0.5 h-4 w-4" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span>{action.name}</span>
                  <Badge variant="outline">{action.availability}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{action.description}</div>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function NumericField({
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
    <label className="space-y-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <Input
        type="number"
        value={String(value)}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PoolProjection({
  torus,
  points,
  hoveredKey,
  onHover,
}: {
  torus: { R: number; r: number };
  points: GwCrystalPoolVisualizationPoint[];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const projected = points.map((point) => ({
    ...point,
    key: `${point.crystalId}:${point.docId}`,
    projected: projectPoolTorusPoint(point.x, point.y, torus),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{points.length} points</Badge>
        <Badge variant="outline">R {torus.R.toFixed(1)}</Badge>
        <Badge variant="outline">r {torus.r.toFixed(1)}</Badge>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/40 p-3">
        <svg viewBox="0 0 760 420" className="h-[420px] w-full min-w-[760px]">
          <ellipse cx="380" cy="210" rx={(torus.R + torus.r) * 118} ry={(torus.R + torus.r) * 46} fill="none" stroke="rgba(34,211,238,0.25)" strokeWidth="1.5" />
          <ellipse cx="380" cy="210" rx={Math.max(12, (torus.R - torus.r) * 118)} ry={Math.max(8, (torus.R - torus.r) * 46)} fill="none" stroke="rgba(56,189,248,0.18)" strokeWidth="1.2" />
          {projected.map((point) => {
            const active = hoveredKey === point.key;
            const color = clusterColor(point.cluster);
            return (
              <g
                key={point.key}
                onMouseEnter={() => onHover(point.key)}
                onMouseLeave={() => onHover(null)}
              >
                <circle
                  cx={point.projected.sx}
                  cy={point.projected.sy}
                  r={active ? 6.5 : 4.2}
                  fill={color}
                  opacity={active ? 1 : 0.85}
                />
                {(active || point.projected.depth > 0.88) && (
                  <text
                    x={point.projected.sx + 8}
                    y={point.projected.sy - 8}
                    fill="#d5f6ff"
                    fontSize="11"
                  >
                    {truncatePoolLabel(`${point.crystalCode}:${point.title}`, 30)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ScrollArea className="max-h-[200px] rounded-lg border border-border/70 p-3">
        <div className="space-y-2 text-sm">
          {projected
            .filter((point) => !hoveredKey || hoveredKey === point.key)
            .slice(0, hoveredKey ? 1 : 12)
            .map((point) => (
              <div key={`meta-${point.key}`} className="rounded-md border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{point.crystalCode}</Badge>
                  <Badge variant="outline">cluster {point.cluster}</Badge>
                </div>
                <div className="mt-2 font-medium">{point.title}</div>
                <div className="mt-1 text-muted-foreground">{point.text}</div>
              </div>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function projectPoolTorusPoint(x: number, y: number, torus: { R: number; r: number }) {
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

function clusterColor(cluster: number) {
  const palette = ["#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#38bdf8", "#facc15"];
  return palette[cluster % palette.length];
}

function truncatePoolLabel(value: string, max = 20) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
