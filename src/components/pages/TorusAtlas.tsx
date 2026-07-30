"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Database, FileText, Loader2, Search, Sparkles } from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TorusCanvas } from "@/components/torus/TorusCanvas";
import { COLOR_PRESETS, META_PRESETS, SHAPE_PRESETS, WARP_PRESETS, type SurfaceType, type TorusData } from "@/lib/torus/TorusCanvasRenderer";
import type { TorusAtlasCrystal, TorusAtlasDiagnosticResult, TorusAtlasFullRebuildJob, TorusAtlasListResponse } from "@/types/torus-atlas";
import type { GwCrystalPoolActionDefinition, GwCrystalPoolActionId, GwCrystalPoolActionResponse } from "@/types/gw-collapser-pool";

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

export function TorusAtlas() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [emeraldsOnly, setEmeraldsOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [detailCrystal, setDetailCrystal] = useState<TorusAtlasCrystal | null>(null);
  const [runningAction, setRunningAction] = useState<GwCrystalPoolActionId | null>(null);
  const [actionResult, setActionResult] = useState<GwCrystalPoolActionResponse | null>(null);
  const [torusDialogOpen, setTorusDialogOpen] = useState(false);
  const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false);
  const [fullRebuildDialogOpen, setFullRebuildDialogOpen] = useState(false);
  const [rebuildRunning, setRebuildRunning] = useState(false);
  const [fullRebuildStarting, setFullRebuildStarting] = useState(false);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{
    total: number;
    scope: "all" | "selected";
    layoutKey: string;
    clusters: number;
  } | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<TorusAtlasDiagnosticResult | null>(null);
  const [layoutFilterKey, setLayoutFilterKey] = useState("__auto__");
  const [metaPreset, setMetaPreset] = useState("Aurora Horn");
  const [shapePreset, setShapePreset] = useState("Horn Torus");
  const [colorPreset, setColorPreset] = useState("Aurora Borealis");
  const [warpPreset, setWarpPreset] = useState("No Warp");
  const [surfaceType, setSurfaceType] = useState<SurfaceType>("wireframe");
  const [mouseRotation, setMouseRotation] = useState(true);
  const [xSpeed, setXSpeed] = useState(0);
  const [ySpeed, setYSpeed] = useState(0);
  const [zSpeed, setZSpeed] = useState(0);
  const [displayRadiusMajor, setDisplayRadiusMajor] = useState(10);
  const [displayRadiusMinor, setDisplayRadiusMinor] = useState(10);
  const [lockRadii, setLockRadii] = useState(false);
  const [collapseFactor, setCollapseFactor] = useState(0);
  const [showCanvasControls, setShowCanvasControls] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [rebuildScope, setRebuildScope] = useState<"all" | "selected">("all");
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
  const [rebuildParams, setRebuildParams] = useState({
    n_clusters: 32,
    max_steps: 100,
    dt: 0.02,
    friction: 0.01,
    epsilon: 0.15,
    tol_speed: 0.001,
    geometry_R: 1.2,
    geometry_r: 0.6,
  });
  const [fullRebuildParams, setFullRebuildParams] = useState({
    n_clusters: 64,
    max_steps: 100,
    dt: 0.02,
    friction: 0.01,
    epsilon: 0.15,
    tol_speed: 0.001,
    geometry_R: 1.2,
    geometry_r: 0.6,
    batch_size: 200,
  });
  const { toast } = useToast();

  const atlasUrl = `/api/torus-atlas/crystals?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}&emeralds=${emeraldsOnly ? "1" : "0"}`;
  const { data, loading, refresh } = useFetch<TorusAtlasListResponse>(atlasUrl);
  const { data: actionsData } = useFetch<{ ok: boolean; actions: GwCrystalPoolActionDefinition[] }>("/api/torus-atlas/actions");
  const {
    data: fullRebuildJob,
    refresh: refreshFullRebuildJob,
  } = useFetch<TorusAtlasFullRebuildJob>("/api/torus-atlas/rebuild-full");

  const items = data?.items ?? [];
  const actions = actionsData?.actions ?? [];
  const totalPages = data?.totalPages ?? 1;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedSet.has(item.id));
  const visibleLayoutKeys = useMemo(
    () => [...new Set(items.map((item) => item.layoutKey).filter(Boolean))].sort(),
    [items],
  );
  const selectedVisibleLayoutKeys = useMemo(
    () => [...new Set(items.filter((item) => selectedSet.has(item.id)).map((item) => item.layoutKey).filter(Boolean))].sort(),
    [items, selectedSet],
  );
  const dominantVisibleLayoutKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.layoutKey) continue;
      counts.set(item.layoutKey, (counts.get(item.layoutKey) ?? 0) + 1);
    }
    let winner = "";
    let winnerCount = -1;
    for (const [key, count] of counts.entries()) {
      if (count > winnerCount) {
        winner = key;
        winnerCount = count;
      }
    }
    return winner;
  }, [items]);
  const autoLayoutKey = useMemo(() => {
    if (selectedVisibleLayoutKeys.length === 1) return selectedVisibleLayoutKeys[0];
    if (rebuildResult?.layoutKey && visibleLayoutKeys.includes(rebuildResult.layoutKey)) return rebuildResult.layoutKey;
    if (fullRebuildJob?.layoutKey && visibleLayoutKeys.includes(fullRebuildJob.layoutKey)) return fullRebuildJob.layoutKey;
    if (dominantVisibleLayoutKey) return dominantVisibleLayoutKey;
    return visibleLayoutKeys[0] ?? "";
  }, [selectedVisibleLayoutKeys, rebuildResult, fullRebuildJob, visibleLayoutKeys, dominantVisibleLayoutKey]);
  const activeLayoutKey = layoutFilterKey === "__auto__" ? autoLayoutKey : layoutFilterKey;
  const compatibleItems = useMemo(
    () => (activeLayoutKey ? items.filter((item) => item.layoutKey === activeLayoutKey) : items),
    [items, activeLayoutKey],
  );
  const hiddenIncompatibleCount = items.length - compatibleItems.length;
  const actionGroups = useMemo(() => ({
    analysis: actions.filter((item) => item.category === "analysis"),
    generation: actions.filter((item) => item.category === "generation"),
    visualization: actions.filter((item) => item.category === "visualization"),
  }), [actions]);

  const torusData = useMemo<TorusData>(() => {
    const nodes = compatibleItems.map((item) => ({
      id: item.id,
      u: item.torusU,
      v: item.torusV,
      color: CLUSTER_COLORS[item.clusterLabel % CLUSTER_COLORS.length] ?? "#ffffff",
      size: item.isEmerald ? 5 : 3,
      label: item.name,
      mass: 1,
      flow_speed: 0,
    }));

    const byCluster = new Map<number, TorusAtlasCrystal[]>();
    for (const item of compatibleItems) {
      const bucket = byCluster.get(item.clusterLabel) ?? [];
      bucket.push(item);
      byCluster.set(item.clusterLabel, bucket);
    }

    const edges: TorusData["edges"] = [];
    for (const bucket of byCluster.values()) {
      for (let index = 1; index < bucket.length; index += 1) {
        edges.push({
          source: bucket[index - 1].id,
          target: bucket[index].id,
          intensity: 0.5,
        });
      }
    }

  return {
      nodes,
      edges,
      torus_state: { R: 200, r: 80, collapse_factor: collapseFactor, twist: 0.02 },
    };
  }, [compatibleItems, collapseFactor]);

  const hoveredCrystal = items.find((item) => item.id === hoveredId) ?? null;

  useEffect(() => {
    if (layoutFilterKey !== "__auto__" && layoutFilterKey && !visibleLayoutKeys.includes(layoutFilterKey)) {
      setLayoutFilterKey("__auto__");
    }
  }, [layoutFilterKey, visibleLayoutKeys]);

  useEffect(() => {
    if (!fullRebuildJob) return;
    if (!["preparing", "analyzing", "persisting"].includes(fullRebuildJob.status)) {
      if (fullRebuildJob.status === "completed") {
        refresh();
      }
      return;
    }
    const timer = window.setInterval(() => {
      refreshFullRebuildJob();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [fullRebuildJob, refresh, refreshFullRebuildJob]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !items.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...items.map((item) => item.id)])]);
  };

  const runAction = async (action: GwCrystalPoolActionDefinition) => {
    if (!selectedIds.length) {
      toast({
        title: "No selection",
        description: "Select at least one crystal in Torus Atlas before running actions.",
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
      const response = await apiPost<GwCrystalPoolActionResponse>(`/api/torus-atlas/actions/${action.id}`, {
        crystalIds: selectedIds,
        params: {
          document_mode: "combination_only",
        },
      });
      setActionResult(response);
      refresh();
      toast({
        title: action.name,
        description: `Processed: ${response.affectedCount}`,
      });
    } catch (error) {
      toast({
        title: action.name,
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
      const response = await apiPost<GwCrystalPoolActionResponse>("/api/torus-atlas/actions/torus_flow", {
        crystalIds: selectedIds,
        params: torusParams,
      });
      setActionResult(response);
      setTorusDialogOpen(false);
      refresh();
      toast({
        title: "TorusFlow GWCollapser",
        description: `Processed: ${response.affectedCount}`,
      });
    } catch (error) {
      toast({
        title: "TorusFlow GWCollapser",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const runGlobalAtlasRebuild = async () => {
    setRebuildRunning(true);
    try {
      const response = await apiPost<{
        ok: true;
        total: number;
        scope: "all" | "selected";
        layoutKey: string;
        clusters: number;
      }>("/api/torus-atlas/rebuild", {
        crystalIds: rebuildScope === "selected" ? selectedIds : [],
        ...rebuildParams,
      });
      setRebuildResult(response);
      setRebuildDialogOpen(false);
      refresh();
      toast({
        title: "Global atlas rebuild",
        description: `Processed ${response.total} crystals in ${response.scope} scope.`,
      });
    } catch (error) {
      toast({
        title: "Global atlas rebuild",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRebuildRunning(false);
    }
  };

  const runFullAtlasRebuild = async () => {
    setFullRebuildStarting(true);
    try {
      await apiPost<{ ok: true; job: TorusAtlasFullRebuildJob }>("/api/torus-atlas/rebuild-full", fullRebuildParams);
      setFullRebuildDialogOpen(false);
      refreshFullRebuildJob();
      toast({
        title: "Rebuild Full Atlas",
        description: "Started global atlas rebuild in background. Progress panel will update automatically.",
      });
    } catch (error) {
      toast({
        title: "Rebuild Full Atlas",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setFullRebuildStarting(false);
    }
  };

  const runAtlasDiagnostic = async () => {
    if (!selectedIds.length) {
      toast({
        title: "Atlas diagnostic",
        description: "Select at least one crystal for the diagnostic slice.",
        variant: "destructive",
      });
      return;
    }
    setDiagnosticRunning(true);
    try {
      const response = await apiPost<TorusAtlasDiagnosticResult>("/api/torus-atlas/diagnostic", {
        crystalIds: selectedIds,
        n_clusters: rebuildParams.n_clusters,
        max_steps: rebuildParams.max_steps,
        dt: rebuildParams.dt,
        friction: rebuildParams.friction,
        epsilon: rebuildParams.epsilon,
        tol_speed: rebuildParams.tol_speed,
        geometry_R: rebuildParams.geometry_R,
        geometry_r: rebuildParams.geometry_r,
      });
      setDiagnosticResult(response);
      toast({
        title: "Atlas diagnostic",
        description: `Checked ${response.total} formulas, found ${response.uniqueLabels} label buckets.`,
      });
    } catch (error) {
      toast({
        title: "Atlas diagnostic",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDiagnosticRunning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">new section</Badge>
              <h1 className="text-xl font-semibold tracking-tight">Torus Atlas</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Canvas-first atlas view for crystal formulas and torus placement. Existing GW-Collapser sections remain untouched.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={runAtlasDiagnostic} disabled={diagnosticRunning || !selectedIds.length}>
              {diagnosticRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Diagnose Slice
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFullRebuildDialogOpen(true)}>
              Rebuild Full Atlas
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRebuildDialogOpen(true)}>
              Rebuild Global Atlas
            </Button>
            <Badge variant="outline">{data?.total ?? 0} crystals</Badge>
            <Badge variant="outline">{selectedIds.length} selected</Badge>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[360px_320px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Atlas List</CardTitle>
            <CardDescription>
              First migration slice: read-only list, selection and detail panel over the new canvas renderer.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Search by code, focus, pattern or formula"
              />
              <div className="flex w-full gap-2">
                <Button className="flex-1" variant="outline" onClick={() => { setPage(1); setSearch(draftSearch.trim()); }}>
                  <Search className="mr-2 h-4 w-4" />
                  Find
                </Button>
                <Button
                  className="flex-1"
                  variant={emeraldsOnly ? "default" : "outline"}
                  onClick={() => { setPage(1); setEmeraldsOnly((prev) => !prev); }}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Emeralds
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <div>Page {page} / {totalPages}</div>
              <div className="flex items-center gap-2">
                {[12, 24, 48].map((value) => (
                  <Button key={value} size="sm" variant={pageSize === value ? "default" : "outline"} onClick={() => { setPage(1); setPageSize(value); }}>
                    {value}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={(value) => toggleVisible(Boolean(value))} />
                    </TableHead>
                    <TableHead>Crystal</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>V</TableHead>
                    <TableHead>QEC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        Loading atlas crystals...
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No atlas rows for the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      data-state={selectedSet.has(item.id) ? "selected" : undefined}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox checked={selectedSet.has(item.id)} onCheckedChange={() => toggleId(item.id)} />
                      </TableCell>
                      <TableCell>
                        <button className="text-left" onClick={() => setDetailCrystal(item)}>
                          <div className="font-medium">{item.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.code}</div>
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CLUSTER_COLORS[item.clusterLabel % CLUSTER_COLORS.length] }} />
                          <span>{item.clusterLabel}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatMetric(item.metrics.V)}</TableCell>
                      <TableCell>{formatMetric(item.metrics.QEC)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="min-h-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Canvas Controls</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowCanvasControls((prev) => !prev)}>
                  {showCanvasControls ? "Hide" : "Show"}
                </Button>
              </div>
              <CardDescription>
                Demo canvas presets and renderer controls, isolated inside Torus Atlas.
              </CardDescription>
            </CardHeader>
            {showCanvasControls && (
              <CardContent className="space-y-4">
                <AtlasSelect label="Meta Preset" value={metaPreset} values={Object.keys(META_PRESETS)} onChange={(value) => setMetaPreset(value)} />
                <AtlasSelect label="Shape" value={shapePreset} values={Object.keys(SHAPE_PRESETS)} onChange={(value) => setShapePreset(value)} />
                <AtlasSelect label="Color" value={colorPreset} values={Object.keys(COLOR_PRESETS)} onChange={(value) => setColorPreset(value)} />
                <AtlasSelect label="Warp" value={warpPreset} values={Object.keys(WARP_PRESETS)} onChange={(value) => setWarpPreset(value)} />
                <AtlasSelect label="Surface" value={surfaceType} values={["wireframe", "points", "skin"]} onChange={(value) => setSurfaceType(value as SurfaceType)} />
                <div className="grid gap-3 md:grid-cols-2">
                  <NumericField label="Display Radius Major" value={displayRadiusMajor} onChange={setDisplayRadiusMajor} />
                  <NumericField label="Display Radius Minor" value={displayRadiusMinor} onChange={setDisplayRadiusMinor} />
                  <NumericField label="X Speed" value={xSpeed} onChange={setXSpeed} step="0.1" />
                  <NumericField label="Y Speed" value={ySpeed} onChange={setYSpeed} step="0.1" />
                  <NumericField label="Z Speed" value={zSpeed} onChange={setZSpeed} step="0.1" />
                  <NumericField label="Collapse" value={collapseFactor} onChange={setCollapseFactor} step="0.01" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={mouseRotation ? "default" : "outline"} onClick={() => setMouseRotation((prev) => !prev)}>
                    Mouse Rotation
                  </Button>
                  <Button size="sm" variant={lockRadii ? "default" : "outline"} onClick={() => setLockRadii((prev) => !prev)}>
                    Lock Radii
                  </Button>
                  <Button size="sm" variant={showEdges ? "default" : "outline"} onClick={() => setShowEdges((prev) => !prev)}>
                    Show Edges
                  </Button>
                  <Button size="sm" variant={showLabels ? "default" : "outline"} onClick={() => setShowLabels((prev) => !prev)}>
                    Show Labels
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
          <ActionGroup title="Analysis" actions={actionGroups.analysis} runningAction={runningAction} onRun={runAction} />
          <ActionGroup title="Generation" actions={actionGroups.generation} runningAction={runningAction} onRun={runAction} />
          <ActionGroup title="Visualization" actions={actionGroups.visualization} runningAction={runningAction} onRun={runAction} />
          {fullRebuildJob && fullRebuildJob.status !== "idle" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Full Atlas Progress</CardTitle>
                <CardDescription>
                  Large rebuild runs in one shared analysis phase and persists metadata back in batches.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{fullRebuildJob.status}</Badge>
                  <Badge variant="outline">{fullRebuildJob.processed} / {fullRebuildJob.total}</Badge>
                  <Badge variant="outline">{fullRebuildJob.clusters} clusters</Badge>
                  {fullRebuildJob.totalBatches > 0 && (
                    <Badge variant="outline">batch {fullRebuildJob.currentBatch} / {fullRebuildJob.totalBatches}</Badge>
                  )}
                </div>
                <div className="text-muted-foreground">{fullRebuildJob.phaseMessage || "Waiting for updates."}</div>
                {fullRebuildJob.layoutKey && (
                  <div className="break-all text-xs text-muted-foreground">{fullRebuildJob.layoutKey}</div>
                )}
                {fullRebuildJob.error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    {fullRebuildJob.error}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {diagnosticResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Atlas Diagnostic</CardTitle>
                <CardDescription>
                  Raw sidecar summary for the current selected slice before a global rebuild.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{diagnosticResult.total} docs</Badge>
                  <Badge variant="outline">{diagnosticResult.uniqueCombinations} unique</Badge>
                  <Badge variant="outline">{diagnosticResult.duplicateCombinations} duplicates</Badge>
                  <Badge variant="outline">{diagnosticResult.clustersRequested} requested</Badge>
                  <Badge variant="outline">{diagnosticResult.uniqueLabels} labels returned</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-border/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Raw Shape</div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>docs: {String(diagnosticResult.rawShape.hasDocs)} / {diagnosticResult.rawShape.docsLength}</div>
                      <div>doc_coords: {String(diagnosticResult.rawShape.hasDocCoords)} / {diagnosticResult.rawShape.docCoordsLength}</div>
                      <div>labels: {String(diagnosticResult.rawShape.hasLabels)} / {diagnosticResult.rawShape.labelsLength}</div>
                      <div>coords present: {diagnosticResult.docsWithCoords}</div>
                      <div>coords missing: {diagnosticResult.docsWithoutCoords}</div>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Label Histogram</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {diagnosticResult.labelHistogram.length ? diagnosticResult.labelHistogram.map((item) => (
                        <Badge key={`label-${item.label}`} variant="outline">
                          {item.label}: {item.count}
                        </Badge>
                      )) : <span className="text-xs text-muted-foreground">No labels returned.</span>}
                    </div>
                  </div>
                </div>
                <ScrollArea className="h-[220px] rounded-md border border-border/60">
                  <div className="space-y-2 p-3">
                    {diagnosticResult.layoutPreview.map((item) => (
                      <div key={`diag-${item.id}`} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{item.code}</Badge>
                          <Badge variant="outline">cluster {item.clusterLabel}</Badge>
                          <Badge variant="outline">u {item.torusU.toFixed(3)}</Badge>
                          <Badge variant="outline">v {item.torusV.toFixed(3)}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                          {truncate(item.formula, 220)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          <Card className="min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Last Atlas Action</CardTitle>
              <CardDescription>
                New section runs production pool actions through an isolated atlas proxy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rebuildResult && (
                <div className="mb-3 rounded-md border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">global atlas</Badge>
                    <Badge variant="outline">{rebuildResult.scope}</Badge>
                    <Badge variant="outline">{rebuildResult.total} crystals</Badge>
                    <Badge variant="outline">{rebuildResult.clusters} clusters</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground break-all">{rebuildResult.layoutKey}</div>
                </div>
              )}
              {!actionResult ? (
                <div className="text-sm text-muted-foreground">Run an atlas action to inspect typed output.</div>
              ) : (
                <ScrollArea className="h-[320px]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{actionResult.actionName}</Badge>
                      <Badge variant="outline">{actionResult.availability}</Badge>
                      <Badge variant="outline">{actionResult.affectedCount} affected</Badge>
                    </div>
                    {actionResult.results.slice(0, 8).map((item) => (
                      <div key={`${item.id}-${item.code ?? "row"}`} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-mono text-xs break-all">{item.code ?? item.id}</div>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">{item.summary}</div>
                      </div>
                    ))}
                    {actionResult.extra && (
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-5">
                        {JSON.stringify(actionResult.extra, null, 2)}
                      </pre>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Canvas Atlas</CardTitle>
                <CardDescription>
                  Fast canvas renderer from the demo branch, now mounted as an isolated module.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <Database className="mr-2 h-3.5 w-3.5" />
                  {compatibleItems.length} nodes
                </Badge>
                <Badge variant="outline">
                  <Activity className="mr-2 h-3.5 w-3.5" />
                  {activeLayoutKey ? "layout-locked" : "read-only"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex h-[calc(100vh-220px)] min-h-[520px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={layoutFilterKey} onValueChange={setLayoutFilterKey}>
                <SelectTrigger className="w-[360px]">
                  <SelectValue placeholder="Active layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto layout</SelectItem>
                  {visibleLayoutKeys.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeLayoutKey && <Badge variant="outline">{activeLayoutKey}</Badge>}
              {hiddenIncompatibleCount > 0 && (
                <Badge variant="outline">{hiddenIncompatibleCount} hidden as incompatible</Badge>
              )}
              {selectedVisibleLayoutKeys.length > 1 && (
                <Badge variant="destructive">selected rows span multiple layoutKey snapshots</Badge>
              )}
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-black/80">
              <TorusCanvas
                data={torusData}
                selectedId={selectedIds[0] ?? null}
                onSelect={(id) => id && toggleId(id)}
                onHover={setHoveredId}
                autoRotate={false}
                showEdges={showEdges}
                showLabels={showLabels}
                showTorusWireframe
                metaPreset={metaPreset}
                shapePreset={shapePreset}
                colorPreset={colorPreset}
                warpPreset={warpPreset}
                surfaceType={surfaceType}
                mouseRotation={mouseRotation}
                xSpeed={xSpeed}
                ySpeed={ySpeed}
                zSpeed={zSpeed}
                displayRadiusMajor={displayRadiusMajor}
                displayRadiusMinor={displayRadiusMinor}
                lockRadii={lockRadii}
              />
              {hoveredCrystal && (
                <div className="pointer-events-none absolute right-4 top-4 w-[320px] rounded-lg border border-cyan-400/30 bg-slate-950/92 p-3 shadow-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{hoveredCrystal.code}</Badge>
                    <Badge variant="outline">cluster {hoveredCrystal.clusterLabel}</Badge>
                    {hoveredCrystal.isEmerald && <Badge variant="outline">emerald</Badge>}
                  </div>
                  <div className="mt-2 text-sm font-medium break-words">{hoveredCrystal.name}</div>
                  <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                    {truncate(hoveredCrystal.formula, 260)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={Boolean(detailCrystal)} onOpenChange={(open) => !open && setDetailCrystal(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detailCrystal?.name ?? "Atlas crystal"}</SheetTitle>
            <SheetDescription>{detailCrystal?.code ?? ""}</SheetDescription>
          </SheetHeader>
          {detailCrystal && (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label="Type" value={detailCrystal.type} />
              <DetailRow label="Category" value={detailCrystal.category || "—"} />
              <DetailRow label="Pattern" value={detailCrystal.pattern || "—"} />
              <DetailRow label="Cluster" value={String(detailCrystal.clusterLabel)} />
              <DetailRow label="Quality" value={detailCrystal.qualityScore.toFixed(3)} />
              <DetailRow label="Complexity" value={String(detailCrystal.complexity)} />
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Formula</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 font-mono leading-6 break-all">
                  {detailCrystal.formula}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard label="V" value={formatMetric(detailCrystal.metrics.V)} />
                <MetricCard label="QEC" value={formatMetric(detailCrystal.metrics.QEC)} />
                <MetricCard label="CHSH" value={formatMetric(detailCrystal.metrics.CHSH)} />
                <MetricCard label="Q" value={formatMetric(detailCrystal.metrics.Q)} />
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Micro Notes</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailCrystal.microNotes || "—"}</div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Translation</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailCrystal.translation || "—"}</div>
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
              Review runtime parameters before launching torus analysis from Torus Atlas.
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
              {runningAction === "torus_flow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rebuildDialogOpen} onOpenChange={setRebuildDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rebuild Global Atlas</DialogTitle>
            <DialogDescription>
              Runs one global combination-only batch, clusters the whole selected scope in one shared torus space, then saves coordinates back into each crystal metadata record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={rebuildScope === "all" ? "default" : "outline"}
              onClick={() => setRebuildScope("all")}
            >
              Entire base
            </Button>
            <Button
              variant={rebuildScope === "selected" ? "default" : "outline"}
              onClick={() => setRebuildScope("selected")}
              disabled={!selectedIds.length}
            >
              Selected only
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <NumericField label="Clusters" value={rebuildParams.n_clusters} onChange={(value) => setRebuildParams((prev) => ({ ...prev, n_clusters: value }))} />
            <NumericField label="Max steps" value={rebuildParams.max_steps} onChange={(value) => setRebuildParams((prev) => ({ ...prev, max_steps: value }))} />
            <NumericField label="dt" value={rebuildParams.dt} onChange={(value) => setRebuildParams((prev) => ({ ...prev, dt: value }))} step="0.001" />
            <NumericField label="Friction" value={rebuildParams.friction} onChange={(value) => setRebuildParams((prev) => ({ ...prev, friction: value }))} step="0.001" />
            <NumericField label="Epsilon" value={rebuildParams.epsilon} onChange={(value) => setRebuildParams((prev) => ({ ...prev, epsilon: value }))} step="0.001" />
            <NumericField label="Tol speed" value={rebuildParams.tol_speed} onChange={(value) => setRebuildParams((prev) => ({ ...prev, tol_speed: value }))} step="0.0001" />
            <NumericField label="Torus R" value={rebuildParams.geometry_R} onChange={(value) => setRebuildParams((prev) => ({ ...prev, geometry_R: value }))} step="0.1" />
            <NumericField label="Torus r" value={rebuildParams.geometry_r} onChange={(value) => setRebuildParams((prev) => ({ ...prev, geometry_r: value }))} step="0.1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebuildDialogOpen(false)}>Cancel</Button>
            <Button onClick={runGlobalAtlasRebuild} disabled={rebuildRunning || (rebuildScope === "selected" && !selectedIds.length)}>
              {rebuildRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Run rebuild
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fullRebuildDialogOpen} onOpenChange={setFullRebuildDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rebuild Full Atlas</DialogTitle>
            <DialogDescription>
              Runs one atlas analysis across the full crystal base and then writes coordinates back in persistence batches for large datasets.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <NumericField label="Clusters" value={fullRebuildParams.n_clusters} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, n_clusters: value }))} />
            <NumericField label="Batch size" value={fullRebuildParams.batch_size} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, batch_size: value }))} />
            <NumericField label="Max steps" value={fullRebuildParams.max_steps} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, max_steps: value }))} />
            <NumericField label="dt" value={fullRebuildParams.dt} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, dt: value }))} step="0.001" />
            <NumericField label="Friction" value={fullRebuildParams.friction} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, friction: value }))} step="0.001" />
            <NumericField label="Epsilon" value={fullRebuildParams.epsilon} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, epsilon: value }))} step="0.001" />
            <NumericField label="Tol speed" value={fullRebuildParams.tol_speed} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, tol_speed: value }))} step="0.0001" />
            <NumericField label="Torus R" value={fullRebuildParams.geometry_R} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, geometry_R: value }))} step="0.1" />
            <NumericField label="Torus r" value={fullRebuildParams.geometry_r} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, geometry_r: value }))} step="0.1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullRebuildDialogOpen(false)}>Cancel</Button>
            <Button onClick={runFullAtlasRebuild} disabled={fullRebuildStarting || ["preparing", "analyzing", "persisting"].includes(fullRebuildJob?.status ?? "")}>
              {fullRebuildStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Run full rebuild
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
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
          const busy = runningAction === action.id;
          const Icon = action.category === "generation" ? FileText : action.id === "auto_annotation" ? Sparkles : action.id === "semantic_twins" ? Search : Activity;
          return (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto w-full items-start justify-start gap-3 whitespace-normal py-3 text-left"
              disabled={Boolean(runningAction)}
              onClick={() => onRun(action)}
            >
              {busy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : <Icon className="mt-0.5 h-4 w-4" />}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}

function AtlasSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

function formatMetric(value: number | undefined) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
