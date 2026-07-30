"use client";

import { useEffect, useMemo, useState } from "react";
import type { GwGhostContinueResult } from "@/types/gw-collapser-ghost";
import type { GwTorusAnalysisResult } from "@/types/gw-collapser";
import { Activity, ChevronLeft, ChevronRight, Database, FileText, Loader2, Pause, Play, Search, Sparkles } from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  GwCrystalPoolActionDefinition,
  GwCrystalPoolActionId,
  GwCrystalPoolActionResponse,
  GwCrystalPoolListItem,
  GwCrystalPoolVisualizationModeSummary,
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
  modes: GwCrystalPoolVisualizationModeSummary[];
  points: GwCrystalPoolVisualizationPoint[];
}

interface PersistedTorusResponse {
  ok: boolean;
  crystalId: string;
  crystalCode: string;
  docsCount: number;
  query: string;
  storedAt: string;
  analysis?: GwTorusAnalysisResult;
  error?: string;
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
  const [ghostDialogOpen, setGhostDialogOpen] = useState(false);
  const [ghostCrystal, setGhostCrystal] = useState<GwCrystalPoolListItem | null>(null);
  const [ghostAnalysis, setGhostAnalysis] = useState<GwTorusAnalysisResult | null>(null);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostRunning, setGhostRunning] = useState(false);
  const [ghostResult, setGhostResult] = useState<GwGhostContinueResult | null>(null);
  const [ghostFrame, setGhostFrame] = useState(0);
  const [ghostPlaying, setGhostPlaying] = useState(false);
  const [visualizationHover, setVisualizationHover] = useState<string | null>(null);
  const [visualizationModes, setVisualizationModes] = useState<Array<"combination_only" | "full">>(["combination_only", "full"]);
  const [torusParams, setTorusParams] = useState({
    document_mode: "combination_only" as "combination_only" | "full",
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

  const selectionQuery = useMemo(() => selectedIds.slice(0, 40).join(","), [selectedIds]);
  const visualizationModesQuery = useMemo(
    () => visualizationModes.map((mode) => `modes=${encodeURIComponent(mode)}`).join("&"),
    [visualizationModes],
  );
  const { data: visualization } = useFetch<PoolVisualizationResponse>(
    selectionQuery
      ? `/api/gw-collapser/pool/visualization?crystalIds=${encodeURIComponent(selectionQuery)}&limit=100&${visualizationModesQuery}`
      : null,
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

  const toggleVisualizationMode = (mode: "combination_only" | "full") => {
    setVisualizationModes((prev) => {
      if (prev.includes(mode)) {
        const next = prev.filter((item) => item !== mode);
        return next.length ? next : prev;
      }
      return [...prev, mode];
    });
  };

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
        title: "РќРёС‡РµРіРѕ РЅРµ РІС‹Р±СЂР°РЅРѕ",
        description: "Р’С‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РєСЂРёСЃС‚Р°Р»Р» РІ С‚Р°Р±Р»РёС†Рµ Crystal Pool.",
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
        {
          crystalIds: selectedIds,
          params: {
            document_mode: torusParams.document_mode,
          },
        },
      );
      setActionResult(response);
      refresh();
      toast({
        title: action.name,
        description:
          response.availability === "ready"
            ? `РћР±СЂР°Р±РѕС‚Р°РЅРѕ: ${response.affectedCount}`
            : "Р”РµР№СЃС‚РІРёРµ Р·Р°РІРµРґРµРЅРѕ РІ registry, РЅРѕ РµС‰С‘ РЅРµ РїРѕРґРєР»СЋС‡РµРЅРѕ Рє production-Р»РѕРіРёРєРµ.",
      });
    } catch (error) {
      toast({
        title: `РћС€РёР±РєР°: ${action.name}`,
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
        {
          crystalIds: selectedIds,
          params: torusParams,
        },
      );
      setActionResult(response);
      setTorusDialogOpen(false);
      refresh();
      toast({
        title: "TorusFlow GWCollapser",
        description: `РћР±СЂР°Р±РѕС‚Р°РЅРѕ: ${response.affectedCount}`,
      });
    } catch (error) {
      toast({
        title: "РћС€РёР±РєР°: TorusFlow GWCollapser",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const openGhostDialog = async (item: GwCrystalPoolListItem) => {
    if (!item.hasTorusAnalysis) {
      toast({
        title: "Ghost animation",
        description: "Persisted torus analysis is required first.",
        variant: "destructive",
      });
      return;
    }

    setGhostCrystal(item);
    setGhostAnalysis(null);
    setGhostDialogOpen(true);
    setGhostLoading(true);
    setGhostResult(null);
    setGhostFrame(0);
    setGhostPlaying(false);

    try {
      const response = await fetch(`/api/crystals/${item.id}/torus`);
      const payload = (await response.json()) as PersistedTorusResponse;
      if (!response.ok || !payload.ok || !payload.analysis) {
        throw new Error(payload.error || "Failed to load persisted torus analysis");
      }
      setGhostAnalysis(payload.analysis);
    } catch (error) {
      setGhostDialogOpen(false);
      toast({
        title: "Ghost animation",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setGhostLoading(false);
    }
  };

  const oscillationFrame = useMemo(
    () => detectOscillation(ghostAnalysis?.flow.history ?? [], 5, ghostAnalysis?.parameters.tol_speed ?? 0.001),
    [ghostAnalysis],
  );
  const ghostMaxFrame = Math.max(0, (ghostAnalysis?.flow.history.length ?? 1) - 1);

  useEffect(() => {
    if (!ghostDialogOpen || !ghostPlaying || !ghostAnalysis || ghostMaxFrame <= 0) return;
    const timer = window.setTimeout(() => {
      setGhostFrame((prev) => {
        if (prev >= ghostMaxFrame) {
          setGhostPlaying(false);
          return ghostMaxFrame;
        }
        return prev + 1;
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [ghostDialogOpen, ghostPlaying, ghostAnalysis, ghostMaxFrame, ghostFrame]);

  const continueGhost = async () => {
    if (!ghostCrystal || !ghostAnalysis) return;
    setGhostRunning(true);
    try {
      const response = await apiPost<{ ok: true; result: GwGhostContinueResult }>("/api/ghost/continue", {
        crystalId: ghostCrystal.id,
        startFrame: oscillationFrame ?? ghostFrame,
        steps: 100,
      });
      setGhostResult(response.result);
      toast({
        title: "Ghost trajectory",
        description: `Continuation computed for ${response.result.crystalCode}`,
      });
    } catch (error) {
      toast({
        title: "Ghost trajectory",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setGhostRunning(false);
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
                Bulk selection and action orchestration over the crystal library with combination-first torus exploration.
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
            <div>Page {page} / {totalPages}</div>
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
                  Selection drives both the bulk actions and the aggregate torus projection.
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
                        <TableCell>{item.pattern ?? "вЂ”"}</TableCell>
                        <TableCell>{item.qualityScore != null ? item.qualityScore.toFixed(3) : "вЂ”"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.hasTorusAnalysis ? "ready" : "none"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-muted-foreground">
                          {item.llmMicroNote ?? "вЂ”"}
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
            Aggregated visualization over persisted torus snapshots for the current selection, capped at 100 points.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={visualizationModes.includes("combination_only") ? "default" : "outline"}
              onClick={() => toggleVisualizationMode("combination_only")}
            >
              Combination-only
            </Button>
            <Button
              size="sm"
              variant={visualizationModes.includes("full") ? "default" : "outline"}
              onClick={() => toggleVisualizationMode("full")}
            >
              Full
            </Button>
          </div>
          {!selectionQuery ? (
            <div className="text-sm text-muted-foreground">Select crystals in the pool to render their persisted combination formulas.</div>
          ) : !(visualization?.points?.length) ? (
            <div className="text-sm text-muted-foreground">No persisted torus points found for the current selection.</div>
          ) : (
            <PoolProjection
              torus={visualization.torus}
              modes={visualization.modes}
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
            Results are laid out in two columns to keep long formula text and JSON payloads readable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!actionResult ? (
            <div className="text-sm text-muted-foreground">Run an action from the Crystal Pool to inspect its typed result.</div>
          ) : (
            <ScrollArea className="max-h-[420px]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{actionResult.actionName}</Badge>
                  <Badge variant="outline">{actionResult.availability}</Badge>
                  <Badge variant="outline">{actionResult.affectedCount} affected</Badge>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {actionResult.results.map((item) => (
                    <div key={`${item.id}-${item.code ?? "row"}`} className="min-w-0 overflow-hidden rounded-lg border border-border/60 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 font-mono text-sm break-all">{item.code ?? item.id}</div>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <div className="mt-2 break-words whitespace-pre-wrap text-sm text-muted-foreground">{item.summary}</div>
                      {item.data && (
                        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-5">
                          {JSON.stringify(item.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
                {actionResult.extra && (
                  <div className="rounded-lg border border-border/60 p-3">
                    <div className="mb-2 text-sm font-medium">Aggregate payload</div>
                    <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-5">
                      {JSON.stringify(actionResult.extra, null, 2)}
                    </pre>
                  </div>
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
              <DetailRow label="Pattern" value={detailItem.pattern ?? "вЂ”"} />
              <DetailRow label="Category" value={detailItem.category ?? "вЂ”"} />
              <DetailRow label="Quality" value={detailItem.qualityScore != null ? detailItem.qualityScore.toFixed(3) : "вЂ”"} />
              <DetailRow label="Complexity" value={detailItem.complexity != null ? String(detailItem.complexity) : "вЂ”"} />
              <DetailRow label="Torus analysis" value={detailItem.hasTorusAnalysis ? "Persisted snapshot exists" : "No persisted snapshot"} />
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Combination</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailItem.combination}</div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Micro note</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailItem.llmMicroNote ?? "вЂ”"}</div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Vector direction</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailItem.vectorDirection ?? "вЂ”"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!detailItem.hasTorusAnalysis} onClick={() => openGhostDialog(detailItem)}>
                  <Play className="mr-2 h-4 w-4" />
                  Ghost animation
                </Button>
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant={torusParams.document_mode === "combination_only" ? "default" : "outline"}
              onClick={() => setTorusParams((prev) => ({ ...prev, document_mode: "combination_only" }))}
            >
              Combination-only
            </Button>
            <Button
              variant={torusParams.document_mode === "full" ? "default" : "outline"}
              onClick={() => setTorusParams((prev) => ({ ...prev, document_mode: "full" }))}
            >
              Full
            </Button>
          </div>
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

      <Dialog
        open={ghostDialogOpen}
        onOpenChange={(open) => {
          setGhostDialogOpen(open);
          if (!open) {
            setGhostPlaying(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ghost trajectory</DialogTitle>
            <DialogDescription>
              Playback the persisted torus history and continue the path from the detected oscillation frame.
            </DialogDescription>
          </DialogHeader>
          {ghostLoading ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading persisted torus analysis...
            </div>
          ) : !ghostAnalysis ? (
            <div className="min-h-[320px] text-sm text-muted-foreground">No persisted torus analysis loaded.</div>
          ) : (
            <GhostTrajectoryDialogBody
              analysis={ghostAnalysis}
              frame={ghostFrame}
              isPlaying={ghostPlaying}
              onFrameChange={setGhostFrame}
              onTogglePlay={() => setGhostPlaying((prev) => !prev)}
              oscillationFrame={oscillationFrame}
              ghostResult={ghostResult}
              onContinue={continueGhost}
              running={ghostRunning}
            />
          )}
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
      <Input type="number" value={String(value)} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function GhostTrajectoryDialogBody({
  analysis,
  frame,
  isPlaying,
  onFrameChange,
  onTogglePlay,
  oscillationFrame,
  ghostResult,
  onContinue,
  running,
}: {
  analysis: GwTorusAnalysisResult;
  frame: number;
  isPlaying: boolean;
  onFrameChange: (value: number) => void;
  onTogglePlay: () => void;
  oscillationFrame: number | null;
  ghostResult: GwGhostContinueResult | null;
  onContinue: () => void;
  running: boolean;
}) {
  const ring = buildPoolTorusRing(analysis.torus);
  const maxFrame = Math.max(0, analysis.flow.history.length - 1);
  const safeFrame = Math.min(frame, maxFrame);
  const visiblePath = analysis.flow.history.slice(0, safeFrame + 1);
  const currentFramePoint = analysis.flow.history[safeFrame] ?? analysis.flow.history[0] ?? [0, 0];
  const current = projectPoolTorusPoint(currentFramePoint[0], currentFramePoint[1], analysis.torus);
  const docPoints = analysis.docs.map((doc) => ({
    ...doc,
    projected: projectPoolTorusPoint(doc.torus.x, doc.torus.y, analysis.torus),
  }));
  const visibleProjectedPath = visiblePath.map(([x, y]) => projectPoolTorusPoint(x, y, analysis.torus));
  const pathData = buildProjectionPath(visibleProjectedPath);
  const ghostProjectedPath = (ghostResult?.ghostHistory ?? []).map((point) => projectPoolTorusPoint(point.x, point.y, analysis.torus));
  const ghostPathData = buildProjectionPath(ghostProjectedPath);
  const ghostEnd = ghostProjectedPath.at(-1) ?? null;
  const oscillationPercent = oscillationFrame != null && maxFrame > 0 ? (oscillationFrame / maxFrame) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{analysis.docs.length} docs</Badge>
        <Badge variant="outline">{analysis.flow.history.length} frames</Badge>
        <Badge variant="outline">R {analysis.torus.R.toFixed(1)}</Badge>
        <Badge variant="outline">r {analysis.torus.r.toFixed(1)}</Badge>
        {oscillationFrame != null && <Badge variant="outline">oscillation frame {oscillationFrame}</Badge>}
        {ghostResult && <Badge variant="outline">ghost steps {ghostResult.ghostHistory.length}</Badge>}
      </div>

      <div className="relative overflow-x-auto rounded-xl border border-border/70 bg-card/40 p-3">
        <svg viewBox="0 0 760 420" className="h-[420px] w-full min-w-[760px]">
          <path d={ring.outer} fill="none" stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1.2" />
          <path d={ring.inner} fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="1" strokeDasharray="4 6" />
          {docPoints.map((point) => (
            <circle
              key={point.id}
              cx={point.projected.sx}
              cy={point.projected.sy}
              r={3.5}
              fill={clusterColor(point.cluster)}
              opacity={0.75}
            />
          ))}
          {pathData && <path d={pathData} fill="none" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
          {ghostPathData && (
            <path
              d={ghostPathData}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <circle cx={current.sx} cy={current.sy} r={6.5} fill="#e0f2fe" stroke="#38bdf8" strokeWidth="2" />
          {ghostEnd && <circle cx={ghostEnd.sx} cy={ghostEnd.sy} r={5.5} fill="#f59e0b" stroke="#fef3c7" strokeWidth="1.5" />}
        </svg>
      </div>

      <div className="space-y-3 rounded-lg border border-border/70 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onTogglePlay} disabled={maxFrame <= 0}>
            {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button onClick={onContinue} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Continue from oscillation
          </Button>
          <div className="text-sm text-muted-foreground">
            Frame {safeFrame} / {maxFrame}
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative px-1">
            {oscillationPercent != null && (
              <div
                className="pointer-events-none absolute -top-4 text-[10px] text-amber-300"
                style={{ left: `calc(${oscillationPercent}% - 20px)` }}
              >
                osc
              </div>
            )}
            <Slider value={[safeFrame]} min={0} max={Math.max(1, maxFrame)} step={1} onValueChange={(value) => onFrameChange(value[0] ?? 0)} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>Start</span>
            <span>Oscillation {oscillationFrame != null ? oscillationFrame : "not detected"}</span>
            <span>End</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PoolProjection({
  torus,
  modes,
  points,
  hoveredKey,
  onHover,
}: {
  torus: { R: number; r: number };
  modes: GwCrystalPoolVisualizationModeSummary[];
  points: GwCrystalPoolVisualizationPoint[];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const projected = points.map((point) => ({
    ...point,
    key: `${point.mode}:${point.crystalId}:${point.docId}`,
    projected: projectPoolTorusPoint(point.x, point.y, torus),
  }));
  const hoveredPoint = projected.find((point) => point.key === hoveredKey) ?? null;
  const ring = buildPoolTorusRing(torus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{points.length} points</Badge>
        <Badge variant="outline">R {torus.R.toFixed(1)}</Badge>
        <Badge variant="outline">r {torus.r.toFixed(1)}</Badge>
        {modes.map((mode) => (
          <Badge key={mode.mode} variant="outline" className="gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mode.color }} />
            {mode.mode === "combination_only" ? "Combination-only" : "Full"} {mode.count}
          </Badge>
        ))}
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-border/70 bg-card/40 p-3">
        <svg viewBox="0 0 760 420" className="h-[420px] w-full min-w-[760px]">
          <path d={ring.outer} fill="none" stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1.2" />
          <path d={ring.inner} fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="1" strokeDasharray="4 6" />
          {projected.map((point) => {
            const active = hoveredKey === point.key;
            const color = clusterColor(point.cluster);
            return (
              <g key={point.key} onMouseEnter={() => onHover(point.key)} onMouseLeave={() => onHover(null)}>
                <circle
                  cx={point.projected.sx}
                  cy={point.projected.sy}
                  r={active ? 6.5 : 4.2}
                  fill={visualizationModePointColor(point.mode, color)}
                  opacity={active ? 1 : 0.85}
                />
                {(active || point.projected.depth > 0.88) && (
                  <text x={point.projected.sx + 8} y={point.projected.sy - 8} fill="#d5f6ff" fontSize="11">
                    {truncatePoolLabel(`${point.crystalCode}:${point.title}`, 30)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hoveredPoint && (
          <div className="pointer-events-none absolute right-4 top-4 w-[320px] rounded-lg border border-cyan-400/30 bg-slate-950/92 p-3 shadow-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{hoveredPoint.crystalCode}</Badge>
              <Badge variant="outline">cluster {hoveredPoint.cluster}</Badge>
              <Badge variant="outline">{hoveredPoint.mode === "combination_only" ? "Combination-only" : "Full"}</Badge>
            </div>
            <div className="mt-2 text-sm font-medium break-words">{hoveredPoint.title}</div>
            <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">{hoveredPoint.text}</div>
          </div>
        )}
      </div>
      <ScrollArea className="max-h-[220px] rounded-lg border border-border/70 p-3">
        <div className="grid gap-2 text-sm xl:grid-cols-2">
          {projected.slice(0, 12).map((point) => (
            <div key={`meta-${point.key}`} className="rounded-md border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{point.crystalCode}</Badge>
                <Badge variant="outline">cluster {point.cluster}</Badge>
                <Badge variant="outline">{point.mode === "combination_only" ? "Combination-only" : "Full"}</Badge>
              </div>
              <div className="mt-2 break-words font-medium">{point.title}</div>
              <div className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">{point.text}</div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function detectOscillation(history: Array<[number, number]>, windowSize = 5, speedThreshold = 0.001): number | null {
  if (history.length < windowSize + 1) {
    return null;
  }

  const torusDelta = (current: number, previous: number) => {
    let delta = current - previous;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  };

  for (let index = windowSize; index < history.length; index += 1) {
    let speedSum = 0;
    for (let offset = index - windowSize + 1; offset <= index; offset += 1) {
      const current = history[offset];
      const previous = history[offset - 1];
      const dx = torusDelta(current[0], previous[0]);
      const dy = torusDelta(current[1], previous[1]);
      speedSum += Math.hypot(dx, dy);
    }

    if (speedSum / windowSize <= speedThreshold) {
      return index;
    }
  }

  return null;
}

function buildProjectionPath(points: Array<{ sx: number; sy: number }>): string | null {
  if (!points.length) {
    return null;
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.sx} ${point.sy}`).join(" ");
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

function buildPoolTorusRing(torus: { R: number; r: number }) {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let step = 0; step <= 120; step += 1) {
    const angle = (step / 120) * Math.PI * 2;
    const outerPoint = projectPoolFlatPoint(torus.R + torus.r, angle);
    const innerPoint = projectPoolFlatPoint(Math.max(0.1, torus.R - torus.r), angle);
    outer.push(`${step === 0 ? "M" : "L"} ${outerPoint[0]} ${outerPoint[1]}`);
    inner.push(`${step === 0 ? "M" : "L"} ${innerPoint[0]} ${innerPoint[1]}`);
  }
  return { outer: outer.join(" "), inner: inner.join(" ") };
}

function projectPoolFlatPoint(radius: number, angle: number) {
  const scale = 118;
  return [380 + Math.cos(angle) * radius * scale, 210 + Math.sin(angle) * radius * scale * 0.38];
}

function clusterColor(cluster: number) {
  const palette = ["#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#38bdf8", "#facc15"];
  return palette[cluster % palette.length];
}

function visualizationModePointColor(mode: "combination_only" | "full", fallback: string) {
  return mode === "combination_only" ? "#38bdf8" : mode === "full" ? "#34d399" : fallback;
}

function truncatePoolLabel(value: string, max = 20) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
