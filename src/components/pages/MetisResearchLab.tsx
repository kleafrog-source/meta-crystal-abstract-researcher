"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Atom, Clock3, Database, GitCompare, History, Play, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MemoryMatrixHeatmap, type MetisVizMode } from "@/components/metis/MemoryMatrixHeatmap";
import { TorusAtlasViz, type MetisPaletteMode } from "@/components/metis/TorusAtlasViz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { AtlasChart, CrystalNode, SystemState } from "@/lib/metis/types";
import type { ComparisonResult, ResearchInitState, RetrievalRun } from "@/lib/metis-research/types";

const PALETTE_OPTIONS: Array<{ value: MetisPaletteMode; label: string }> = [
  { value: "signal", label: "Signal" },
  { value: "contrast", label: "Contrast" },
  { value: "warm", label: "Warm" },
  { value: "mono", label: "Mono" },
];
const VIZ_MODE_OPTIONS: Array<{ value: MetisVizMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "quality", label: "Quality" },
  { value: "density", label: "Density" },
];

function fmt(value: number, digits = 4) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function parsePoolSizes(value: string) {
  return [...new Set(value.split(/[,\s;]+/g).map((item) => Math.max(1, Number(item) || 0)).filter(Boolean))];
}

function buildTraceText(run: RetrievalRun | null) {
  if (!run) return "";
  return run.stages
    .map((stage, index) => `${index + 1}. ${stage.name} · ${stage.status} · ${stage.durationMs}ms · ${stage.inputCount} -> ${stage.outputCount}`)
    .join("\n");
}

export function MetisResearchLab() {
  const [initState, setInitState] = useState<ResearchInitState | null>(null);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [query, setQuery] = useState("find paradoxes and hybrids suitable for transformation into an audio album");
  const [topK, setTopK] = useState("16");
  const [poolSize, setPoolSize] = useState("400");
  const [poolSizesText, setPoolSizesText] = useState("32, 400, 880, 4704");
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [activeRun, setActiveRun] = useState<RetrievalRun | null>(null);
  const [runs, setRuns] = useState<RetrievalRun[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteMode, setPaletteMode] = useState<MetisPaletteMode>("signal");
  const [torusMode, setTorusMode] = useState<MetisVizMode>("auto");
  const [matrixMode, setMatrixMode] = useState<MetisVizMode>("auto");

  const refreshHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const response = await fetch("/api/metis/research/history", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load research history");
      const data = await response.json();
      setRuns(data.runs || []);
      const nextActive = (data.runs || []).find((item: RetrievalRun) => item.runId === data.activeRunId) || data.runs?.[0] || null;
      setActiveRun(nextActive);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load research history");
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  const refreshInit = useCallback(async () => {
    try {
      const [initResponse, stateResponse] = await Promise.all([
        fetch("/api/metis/research/init", { cache: "no-store" }),
        fetch("/api/metis/state", { cache: "no-store" }),
      ]);
      if (!initResponse.ok) throw new Error("Failed to initialize research workspace");
      const initJson = (await initResponse.json()) as ResearchInitState;
      setInitState(initJson);
      if (stateResponse.ok) {
        setSystemState((await stateResponse.json()) as SystemState);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to initialize research workspace");
    }
  }, []);

  useEffect(() => {
    refreshInit().catch(() => {});
    refreshHistory().catch(() => {});
  }, [refreshHistory, refreshInit]);

  const corpusNodes = initState?.corpusNodes ?? [];
  const charts = initState?.charts ?? [];

  const activeResultMap = useMemo(() => {
    const map = new Map<string, { rank: number; finalScore: number; stable: boolean; fresh: boolean }>();
    if (!activeRun) return map;
    const stableSet = new Set(comparison?.multiRun.stableObservedSet ?? []);
    const freshSet = new Set(
      comparison?.comparisons.flatMap((item) => {
        const run = runs.find((candidate) => candidate.runId === item.comparisonId);
        return run?.resultIds.filter((id) => !activeRun.resultIds.includes(id)) ?? [];
      }) ?? [],
    );
    for (const result of activeRun.results) {
      map.set(result.crystal.node_id, {
        rank: result.rank,
        finalScore: result.score.finalScore,
        stable: stableSet.has(result.crystal.node_id),
        fresh: freshSet.has(result.crystal.node_id),
      });
    }
    return map;
  }, [activeRun, comparison, runs]);

  const displayNodes = useMemo<CrystalNode[]>(() => {
    return corpusNodes.map((node) => {
      const active = activeResultMap.get(node.node_id);
      return {
        ...node,
        importance: active ? Math.max(0.45, Math.min(0.98, active.finalScore)) : Math.max(0.04, Math.min(0.18, node.importance * 0.18)),
        content: active ? `#${active.rank} · ${node.content}` : node.content,
      };
    });
  }, [activeResultMap, corpusNodes]);

  const selectedResult = useMemo(() => {
    if (!activeRun || !selectedNodeId) return null;
    return activeRun.results.find((item) => item.crystal.node_id === selectedNodeId) ?? null;
  }, [activeRun, selectedNodeId]);

  async function runSingle() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/metis/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          candidatePoolSize: Number(poolSize) || 400,
          topK: Number(topK) || 16,
          seed: seed.trim() ? Number(seed) : null,
          mode: "single_run",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Run failed");
      setActiveRun(data as RetrievalRun);
      setComparison(null);
      setSelectedNodeId(null);
      await refreshHistory();
      toast.success(`Run completed in ${data.metrics.runtimeMs}ms`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function runComparison() {
    if (!query.trim()) return;
    const poolSizes = parsePoolSizes(poolSizesText);
    if (poolSizes.length < 2) {
      toast.error("Need at least two pool sizes");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/metis/research/pool-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          poolSizes,
          topK: Number(topK) || 16,
          seed: seed.trim() ? Number(seed) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comparison failed");
      const nextRuns = (data.runs || []) as RetrievalRun[];
      setActiveRun(nextRuns[0] ?? null);
      setRuns((prev) => [...nextRuns, ...prev].slice(0, 80));
      const compareResponse = await fetch("/api/metis/research/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runIds: nextRuns.map((item) => item.runId) }),
      });
      if (compareResponse.ok) {
        setComparison((await compareResponse.json()) as ComparisonResult);
      }
      setSelectedNodeId(null);
      await refreshHistory();
      toast.success(`Completed ${nextRuns.length} runs`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Comparison failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    setBusy(true);
    try {
      const response = await fetch("/api/metis/research/clear", { method: "POST" });
      if (!response.ok) throw new Error("Failed to clear history");
      setRuns([]);
      setActiveRun(null);
      setComparison(null);
      setSelectedNodeId(null);
      toast.success("Research history cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear history");
    } finally {
      setBusy(false);
    }
  }

  async function selectRun(runId: string) {
    const response = await fetch("/api/metis/research/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    if (!response.ok) {
      toast.error("Failed to switch active run");
      return;
    }
    const nextRun = runs.find((item) => item.runId === runId) ?? null;
    setActiveRun(nextRun);
    setSelectedNodeId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metis Torus Atlas Research</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Separate research workspace integrated from demo-v2: candidate pool comparison, run history, retrieval trace and atlas-centric analysis over the main crystal SQLite library.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { refreshInit(); refreshHistory(); }} disabled={busy || historyBusy}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={clearHistory} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear history
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Atom className="h-4 w-4 text-primary" />
              Query workspace
            </CardTitle>
            <CardDescription>
              Single-run mode and pool-comparison mode use the current Metis embedding provider and the real `Crystal` library from SQLite.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Query</Label>
              <Textarea value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-[110px]" />
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Candidate pool</Label>
                <Input value={poolSize} onChange={(event) => setPoolSize(event.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label>Top-K</Label>
                <Input value={topK} onChange={(event) => setTopK(event.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label>Seed</Label>
                <Input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-2">
                <Label>Corpus</Label>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                  {initState?.summary?.totalCrystals ?? 0} crystals
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={runSingle} disabled={busy}>
                <Play className="mr-2 h-4 w-4" />
                Run query
              </Button>
              <Button variant="secondary" onClick={runComparison} disabled={busy}>
                <GitCompare className="mr-2 h-4 w-4" />
                Compare pools
              </Button>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Pool sizes for comparison</Label>
              <Input value={poolSizesText} onChange={(event) => setPoolSizesText(event.target.value)} />
              <p className="text-xs text-muted-foreground">Example: `32, 400, 880, 4704`</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Corpus summary
            </CardTitle>
            <CardDescription>Audit snapshot for the integrated research corpus.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <Stat label="total crystals" value={initState?.summary?.totalCrystals ?? 0} />
            <Stat label="avg importance" value={fmt(initState?.summary?.avgImportance ?? 0, 3)} />
            <Stat label="domain groups" value={Object.keys(initState?.summary?.byDomain ?? {}).length} />
            <Stat label="type groups" value={Object.keys(initState?.summary?.byType ?? {}).length} />
            <Stat label="charts" value={charts.length} />
            <Stat label="history runs" value={runs.length} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Torus Atlas research view</CardTitle>
              <CardDescription>
                Full corpus is shown as low-signal background; active Top-K results are amplified for visual comparison.
              </CardDescription>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>Palette</Label>
                <Select value={paletteMode} onValueChange={(value) => setPaletteMode(value as MetisPaletteMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PALETTE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Torus mode</Label>
                <Select value={torusMode} onValueChange={(value) => setTorusMode(value as MetisVizMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIZ_MODE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Active run</Label>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
                  {activeRun ? `${activeRun.runId} · pool=${activeRun.config.candidatePoolSize}` : "none"}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TorusAtlasViz
            charts={charts as AtlasChart[]}
            nodes={displayNodes}
            activeChart={activeRun?.results.find((item) => item.crystal.node_id === selectedNodeId)?.crystal.coords.atlas_chart ?? charts[0]?.chart_id ?? "chart_A"}
            palette={paletteMode}
            mode={torusMode}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => setSelectedNodeId(node.node_id)}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run metrics and results</CardTitle>
            <CardDescription>
              {activeRun ? `runId ${activeRun.runId} · ${activeRun.resultIds.length} results` : "No active run yet"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeRun && (
              <div className="grid gap-3 md:grid-cols-3">
                <Stat label="runtime" value={`${activeRun.metrics.runtimeMs} ms`} />
                <Stat label="mean finalScore" value={fmt(activeRun.metrics.meanFinalScore)} />
                <Stat label="score gap @K" value={fmt(activeRun.metrics.scoreGapAtK)} />
              </div>
            )}
            <ScrollArea className="h-[360px] rounded-xl border border-border/60">
              <div className="divide-y divide-border/50">
                {(activeRun?.results ?? []).map((result) => (
                  <button
                    key={result.crystal.node_id}
                    type="button"
                    className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-background/40 ${selectedNodeId === result.crystal.node_id ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedNodeId(result.crystal.node_id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{result.rank}</Badge>
                      <Badge variant="secondary">{result.crystal.type}</Badge>
                      <span className="font-mono text-sm">{result.crystal.code}</span>
                    </div>
                    <div className="text-sm">{result.crystal.focus}</div>
                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <span>raw={fmt(result.score.rawScore)}</span>
                      <span>final={fmt(result.score.finalScore)}</span>
                      <span>domain={result.crystal.domain}</span>
                    </div>
                  </button>
                ))}
                {!activeRun && <div className="px-4 py-8 text-sm text-muted-foreground">Run a query to populate results.</div>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selected element and trace</CardTitle>
            <CardDescription>Node details, score decomposition and retrieval stages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedResult ? (
              <>
                <div className="space-y-2 rounded-xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{selectedResult.crystal.type}</Badge>
                    <Badge variant="secondary">{selectedResult.crystal.domain}</Badge>
                    <span className="font-mono text-sm">{selectedResult.crystal.code}</span>
                  </div>
                  <div className="text-sm">{selectedResult.crystal.focus}</div>
                  <div className="text-xs text-muted-foreground">{selectedResult.crystal.combination}</div>
                  <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                    <span>raw score={fmt(selectedResult.score.rawScore)}</span>
                    <span>final score={fmt(selectedResult.score.finalScore)}</span>
                    <span>importance={fmt(selectedResult.score.importance, 3)}</span>
                    <span>atlas={selectedResult.crystal.coords.atlas_chart}</span>
                  </div>
                </div>
                <Textarea readOnly value={selectedResult.crystal.content} className="min-h-[150px] text-xs" />
              </>
            ) : (
              <div className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                Select a result from the list or click a highlighted node on the atlas.
              </div>
            )}
            <Textarea readOnly value={buildTraceText(activeRun)} className="min-h-[180px] font-mono text-xs" />
          </CardContent>
        </Card>
      </div>

      {comparison && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitCompare className="h-4 w-4 text-primary" />
              Candidate pool comparison
            </CardTitle>
            <CardDescription>Observed stable set, candidate-dependent set and per-run overlap metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Stat label="stable observed set" value={comparison.multiRun.stableObservedSet.length} />
              <Stat label="candidate-dependent set" value={comparison.multiRun.candidateDependentSet.length} />
              <Stat label="compared runs" value={comparison.comparisons.length + 1} />
            </div>
            <div className="space-y-3">
              {comparison.comparisons.map((item) => (
                <div key={item.comparisonId} className="rounded-xl border border-border/60 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.comparisonId}</Badge>
                    <span className="text-sm text-muted-foreground">vs baseline {item.baselineId}</span>
                  </div>
                  <div className="grid gap-2 text-sm md:grid-cols-3 xl:grid-cols-6">
                    <span>overlap@5={fmt(item.metrics.overlapAt5, 3)}</span>
                    <span>overlap@16={fmt(item.metrics.overlapAt16, 3)}</span>
                    <span>jaccard={fmt(item.metrics.jaccardAtK, 3)}</span>
                    <span>rank changes={item.metrics.rankChanges}</span>
                    <span>new={item.metrics.newDiscoveryCount}</span>
                    <span>removed={item.metrics.removedFromPreviousCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Run history
            </CardTitle>
            <CardDescription>Stored locally in a separate research journal.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] rounded-xl border border-border/60">
              <div className="divide-y divide-border/50">
                {runs.map((run) => (
                  <button
                    key={run.runId}
                    type="button"
                    onClick={() => selectRun(run.runId)}
                    className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-background/40 ${activeRun?.runId === run.runId ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{run.runId}</Badge>
                      <Badge variant="secondary">pool {run.config.candidatePoolSize}</Badge>
                    </div>
                    <div className="text-sm">{run.query}</div>
                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <span><Clock3 className="mr-1 inline h-3 w-3" />{run.metrics.runtimeMs}ms</span>
                      <span>mean={fmt(run.metrics.meanFinalScore)}</span>
                      <span>topK={run.config.topK}</span>
                    </div>
                  </button>
                ))}
                {!runs.length && <div className="px-4 py-8 text-sm text-muted-foreground">History is empty.</div>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shared Metis matrix context</CardTitle>
            <CardDescription>The research page reuses the existing Metis memory matrix instead of creating a separate stack.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matrix mode</Label>
                <Select value={matrixMode} onValueChange={(value) => setMatrixMode(value as MetisVizMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIZ_MODE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                matrix {systemState?.metis.matrix.rank ?? 0} x {systemState?.metis.matrix.dim ?? 0}
              </div>
            </div>
            {systemState && (
              <MemoryMatrixHeatmap
                flat={systemState.metis.matrix.flat}
                rank={systemState.metis.matrix.rank}
                dim={systemState.metis.matrix.dim}
                mode={matrixMode}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
