"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Copy, FileJson, Loader2, Play, Sparkles, Square, Trash2, Workflow } from "@/components/icons";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { CrystalBridgePanel } from "@/components/strudel-flow/crystal-bridge/CrystalBridgePanel";
import { SemanticStrudelSuggester } from "@/components/strudel-flow/SemanticStrudelSuggester";
import { upstreamPreviewNodeTypes } from "@/components/strudel-flow/upstream-preview-nodes";
import type { StrudelSearchResult } from "@/components/strudel-flow/types";
import { useStrudelFlowStore } from "@/lib/strudel/strudel-flow-store";
import type { MetaCrystalState } from "@/lib/strudel/types-crystal-bridge";
import {
  buildStrudelProjectWithTransport,
  STRUDEL_CATALOG_SCHEMA,
  STRUDEL_PROJECT_SCHEMA,
  type NativeExportStats,
  strudelFlowProjectStateToJson,
  toStrudelFlowProjectState,
  type StrudelProject,
} from "@/lib/strudel";
import { saveStrudelEditorSeed } from "@/lib/strudel-editor-bridge";
import { ensureStrudelInitialized } from "@/lib/strudel-runtime";

interface StrudelParamsResponse {
  ok: boolean;
  total: number;
  categories: string[];
  params?: Array<{
    package?: string;
  }>;
}

interface CrystalsResponse {
  ok: boolean;
  items: Array<{
    id: number;
    code: string;
    type: string;
    focus?: string | null;
    pattern?: string | null;
    combination: string;
    qualityScore?: number | null;
    complexity?: number | null;
  }>;
}

type CrystalDraft = {
  id: string;
  name: string;
  description: string;
  tagsText: string;
  complexity: number;
  chaos: number;
  harmony: number;
  density: number;
};

const EMPTY_DRAFT: CrystalDraft = {
  id: "manual-crystal",
  name: "Manual crystal",
  description: "",
  tagsText: "",
  complexity: 0.5,
  chaos: 0.5,
  harmony: 0.5,
  density: 0.5,
};

export function StrudelLab() {
  const { data: paramsInfo } = useFetch<StrudelParamsResponse>("/api/strudel/params");
  const { data: crystals } = useFetch<CrystalsResponse>("/api/crystals?pageSize=24");
  const nodes = useStrudelFlowStore((state) => state.nodes);
  const removeNode = useStrudelFlowStore((state) => state.removeNode);
  const clearFlow = useStrudelFlowStore((state) => state.clearFlow);

  const [selectedCode, setSelectedCode] = useState<string>("manual");
  const [draft, setDraft] = useState<CrystalDraft>(EMPTY_DRAFT);
  const [playerState, setPlayerState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [cpm, setCpm] = useState("120");
  const [beatsPerCycle, setBeatsPerCycle] = useState("4");
  const [compiledProject, setCompiledProject] = useState<StrudelProject | null>(null);
  const [exportStats, setExportStats] = useState<NativeExportStats | null>(null);
  const [compiledFlowState, setCompiledFlowState] = useState<ReturnType<typeof toStrudelFlowProjectState>["state"] | null>(null);
  const [compiledSnapshot, setCompiledSnapshot] = useState<string>("");
  const [compiledAt, setCompiledAt] = useState<string>("");
  const strudelEngineRef = useRef<null | { evaluate: (code: string, autoplay?: boolean) => Promise<unknown>; hush: () => void }>(null);

  useEffect(() => {
    if (selectedCode === "manual") {
      setDraft((prev) => ({ ...prev, id: prev.id || EMPTY_DRAFT.id }));
      return;
    }
    const source = crystals?.items.find((item) => item.code === selectedCode);
    if (!source) return;
    setDraft(buildDraftFromCrystal(source));
  }, [crystals?.items, selectedCode]);

  const crystal = useMemo<MetaCrystalState>(() => ({
    id: draft.id,
    name: draft.name.trim() || "Untitled crystal",
    description: draft.description.trim(),
    tags: splitTags(draft.tagsText),
    dimensions: {
      complexity: draft.complexity,
      chaos: draft.chaos,
      harmony: draft.harmony,
      density: draft.density,
    },
  }), [draft]);

  const handleSearch = async (query: string) => {
    const response = await apiPost<{ results: StrudelSearchResult[] }>("/api/strudel/search", {
      query,
      top_k: 6,
      min_score: 0.1,
    });
    return response.results ?? [];
  };

  const draftTransport = useMemo(
    () => ({
      cpm: Number.parseInt(cpm, 10) || 120,
      beatsPerCycle: Number.parseInt(beatsPerCycle, 10) || 4,
    }),
    [beatsPerCycle, cpm],
  );
  const nextProject = useMemo<StrudelProject>(
    () => buildStrudelProjectWithTransport(nodes, draftTransport),
    [draftTransport, nodes],
  );
  const nextSnapshot = useMemo(
    () => JSON.stringify({ nodes, cpm: draftTransport.cpm, bpc: draftTransport.beatsPerCycle }),
    [draftTransport.beatsPerCycle, draftTransport.cpm, nodes],
  );
  const strudelProject = compiledProject ?? nextProject;
  const projectJson = useMemo(() => JSON.stringify(strudelProject, null, 2), [strudelProject]);
  const catalogSchemaJson = useMemo(() => JSON.stringify(STRUDEL_CATALOG_SCHEMA, null, 2), []);
  const projectSchemaJson = useMemo(() => JSON.stringify(STRUDEL_PROJECT_SCHEMA, null, 2), []);
  const packageCount = useMemo(() => new Set((paramsInfo?.params ?? []).map((item) => item.package).filter(Boolean)).size, [paramsInfo?.params]);
  const strudelFlowExport = useMemo(
    () => toStrudelFlowProjectState(nodes, strudelProject),
    [nodes, strudelProject],
  );
  const flowState = compiledFlowState ?? strudelFlowExport.state;
  const orderedNodeIds = exportStats?.orderedSelection.map((item) => item.localId) ?? [];
  const orderedNodes = useMemo(() => {
    if (orderedNodeIds.length === 0) {
      return nodes;
    }
    const rank = new Map(orderedNodeIds.map((id, index) => [id, index]));
    return [...nodes].sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));
  }, [nodes, orderedNodeIds]);
  const strudelFlowProjectJson = useMemo(
    () => strudelFlowProjectStateToJson(flowState),
    [flowState],
  );
  const isCompilationDirty = compiledSnapshot !== "" && compiledSnapshot !== nextSnapshot;

  useEffect(() => {
    return () => {
      strudelEngineRef.current?.hush();
    };
  }, []);

  useEffect(() => {
    if (compiledProject) {
      return;
    }
    setCompiledProject(nextProject);
    setExportStats(strudelFlowExport.stats);
    setCompiledFlowState(strudelFlowExport.state);
    setCompiledSnapshot(nextSnapshot);
    setCompiledAt(new Date().toISOString());
  }, [compiledProject, nextProject, nextSnapshot, strudelFlowExport.stats]);

  const ensureStrudelEngine = async () => {
    if (strudelEngineRef.current) {
      return strudelEngineRef.current;
    }
    const { runtime } = await ensureStrudelInitialized();
    const engine = {
      evaluate: runtime.evaluate,
      hush: runtime.hush,
    };
    strudelEngineRef.current = engine;
    return engine;
  };

  const handlePlay = async () => {
    setPlayerState("loading");
    setPlayerError(null);
    try {
      const engine = await ensureStrudelEngine();
      await engine.evaluate(strudelProject.code, true);
      setPlayerState("playing");
    } catch (error) {
      setPlayerState("error");
      setPlayerError((error as Error).message);
    }
  };

  const handleStop = () => {
    strudelEngineRef.current?.hush();
    setPlayerState("idle");
  };

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const handleRebuild = () => {
    setCompiledProject(nextProject);
    setExportStats(strudelFlowExport.stats);
    setCompiledFlowState(strudelFlowExport.state);
    setCompiledSnapshot(nextSnapshot);
    setCompiledAt(new Date().toISOString());
    setPlayerError(null);
  };

  const handleDownloadStrudelFlow = () => {
    const blob = new Blob([strudelFlowProjectJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "strudel-flow-project.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleQueueForEditor = () => {
    saveStrudelEditorSeed(flowState);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">Strudel Lab</span>
              <Badge variant="outline">Qwen branch integration</Badge>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Semantic Strudel parameter search plus crystal-to-audio bridge, isolated from the main generation flow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{paramsInfo?.total ?? 0} params</Badge>
            <Badge variant="outline">{paramsInfo?.categories?.length ?? 0} categories</Badge>
            <Badge variant="outline">{packageCount} packages</Badge>
            <Badge variant="outline">{nodes.length} selected nodes</Badge>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Process order</CardTitle>
                <CardDescription>
                  Officially aligned flow for the first working Strudel integration.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-5">
                {[
                  "1. Catalog",
                  "2. Search / select",
                  "3. Project JSON",
                  "4. Rebuild code",
                  "5. Play / Stop",
                ].map((step) => (
                  <div key={step} className="rounded-md border border-border/60 bg-card/20 px-3 py-2 text-sm text-muted-foreground">
                    {step}
                  </div>
                ))}
              </CardContent>
            </Card>

            <SemanticStrudelSuggester />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  Selected Strudel nodes
                </CardTitle>
                <CardDescription>
                  Nodes added from semantic search or the crystal bridge. This is kept separate from the rest of the project.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Current scratch flow</div>
                  <Button variant="outline" size="sm" onClick={clearFlow} disabled={nodes.length === 0}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
                <ScrollArea className="h-[320px] rounded-md border border-border/60 bg-card/20">
                  <div className="space-y-2 p-3">
                    {nodes.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No nodes added yet.</div>
                    ) : (
                      orderedNodes.map((node) => (
                        <div key={node.id} className="rounded-md border border-border/60 bg-card/30 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{node.data.label}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {node.data.category ?? node.type} · {node.data.paramId ?? node.data.strudelId ?? node.id}
                              </div>
                              {node.data.description ? (
                                <div className="mt-1 text-xs text-muted-foreground">{node.data.description}</div>
                              ) : null}
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeNode(node.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileJson className="h-4 w-4 text-emerald-300" />
                  Step 1. Schemas and generated project
                </CardTitle>
                <CardDescription>
                  Canonical catalog metadata plus the first working MMSS Strudel project JSON assembled from the current selected nodes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <SchemaPreview title="Catalog schema" value={catalogSchemaJson} onCopy={() => handleCopy(catalogSchemaJson)} />
                  <SchemaPreview title="Project schema" value={projectSchemaJson} onCopy={() => handleCopy(projectSchemaJson)} />
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel label="CPM / BPM" hint="Upstream strudel-flow stores this as string cpm. It is used in setcpm(bpm / beatsPerCycle)." />
                    <Input value={cpm} onChange={(event) => setCpm(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel label="Beats per cycle" hint="Upstream field bpc. Example: 4 for common meter, 2 for shorter loop cycles." />
                    <Input value={beatsPerCycle} onChange={(event) => setBeatsPerCycle(event.target.value)} />
                  </div>
                </div>
                <SchemaPreview title="Generated project JSON" value={projectJson} onCopy={() => handleCopy(projectJson)} heightClassName="h-[320px]" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Play className="h-4 w-4 text-cyan-300" />
                  Step 2. Rebuild Strudel code → Play/Stop
                </CardTitle>
                <CardDescription>
                  Compiled snapshot used for playback and export. Rebuild explicitly after changing selected nodes, CPM, or beats-per-cycle if you want a locked checkpoint before Play.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">voice: {strudelProject.voice.sound}</Badge>
                  <Badge variant="outline">mode: {strudelProject.voice.noteMode}</Badge>
                  <Badge variant="outline">{strudelProject.appliedControls.length} applied controls</Badge>
                  <Badge variant="outline">{exportStats?.nativeMapped.length ?? 0} native mapped</Badge>
                  <Badge variant="outline">{exportStats?.fallbackCustom.length ?? 0} fallback/custom</Badge>
                  <Badge variant={isCompilationDirty ? "secondary" : "outline"}>
                    {isCompilationDirty ? "changes pending rebuild" : "compiled snapshot is current"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant={isCompilationDirty ? "default" : "outline"} onClick={handleRebuild}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Rebuild Strudel code
                  </Button>
                  <Button onClick={handlePlay} disabled={playerState === "loading" || nodes.length === 0}>
                    {playerState === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    Play
                  </Button>
                  <Button variant="outline" onClick={handleStop}>
                    <Square className="mr-1.5 h-3.5 w-3.5" />
                    Stop
                  </Button>
                  <Button variant="outline" onClick={() => handleCopy(strudelProject.code)} disabled={nodes.length === 0}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy code
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Last rebuild: {compiledAt ? new Date(compiledAt).toLocaleString("ru-RU") : "not yet"}
                </div>
                {playerError ? (
                  <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {playerError}
                  </div>
                ) : null}
                <SchemaPreview title="Generated Strudel code" value={strudelProject.code} onCopy={() => handleCopy(strudelProject.code)} heightClassName="h-[220px]" />
                {exportStats ? (
                  <div className="rounded-md border border-border/60 bg-card/20 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Automatic order from selected nodes</div>
                    <div className="space-y-2 text-sm">
                      {exportStats.orderedSelection.map((item, index) => (
                        <div key={item.localId} className="flex items-center justify-between gap-3 rounded border border-border/50 px-3 py-2">
                          <div className="font-mono text-xs">
                            {index + 1}. {item.paramId}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{item.phase}</span>
                            <span>score: {item.score !== null ? item.score.toFixed(3) : "n/a"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {strudelProject.appliedControls.length > 0 ? (
                  <div className="rounded-md border border-border/60 bg-card/20 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applied controls</div>
                    <div className="space-y-2 text-sm">
                      {strudelProject.appliedControls.map((control) => (
                        <div key={control.paramId} className="rounded border border-border/50 px-3 py-2">
                          <div className="font-mono text-xs text-cyan-300">{control.expression}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{control.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Step 3. Strudel Flow preview</CardTitle>
                <CardDescription>
                  Visual flow assembled from the generated project. This is a lightweight XYFlow bridge layer before a full editable Strudel Flow implementation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[420px] overflow-hidden rounded-md border border-border/60 bg-[#081018]">
                  <ReactFlow
                    nodes={flowState.nodes}
                    edges={flowState.edges}
                    nodeTypes={upstreamPreviewNodeTypes}
                    fitView
                    attributionPosition="bottom-left"
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    zoomOnScroll
                  >
                    <MiniMap
                      pannable
                      zoomable
                      nodeColor={(node) => {
                        if (node.id === "transport") return "#facc15";
                        if (String(node.id).startsWith("control-")) return "#22d3ee";
                        if (String(node.id).startsWith("selected-")) return "#34d399";
                        return "#c084fc";
                      }}
                    />
                    <Controls />
                    <Background gap={20} size={1} color="rgba(148, 163, 184, 0.15)" />
                  </ReactFlow>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Step 4. Upstream strudel-flow compatible JSON</CardTitle>
                <CardDescription>
                  Exact upstream file shape: <code>nodes</code>, <code>edges</code>, <code>theme</code>, <code>colorMode</code>, <code>cpm</code>, <code>bpc</code>. This export now prefers native upstream nodes and reports unmapped params separately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {exportStats ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-md border border-border/60 bg-card/20 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Native upstream nodes</div>
                      <div className="space-y-2 text-sm">
                        {exportStats.nativeMapped.length === 0 ? (
                          <div className="text-muted-foreground">No native nodes mapped yet.</div>
                        ) : (
                          exportStats.nativeMapped.map((item) => (
                            <div key={item.localId} className="rounded border border-border/50 px-3 py-2">
                              <div className="font-mono text-xs">{item.paramId}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{item.upstreamType}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-card/20 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fallback / audit layer</div>
                      <div className="space-y-2 text-sm">
                        {exportStats.fallbackCustom.length === 0 ? (
                          <div className="text-muted-foreground">No fallback nodes were needed.</div>
                        ) : (
                          exportStats.fallbackCustom.map((item) => (
                            <div key={`${item.localId}-${item.paramId}`} className="rounded border border-border/50 px-3 py-2">
                              <div className="font-mono text-xs">{item.paramId}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{item.reason}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => handleCopy(strudelFlowProjectJson)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy compatible JSON
                  </Button>
                  <Button variant="outline" onClick={handleQueueForEditor}>
                    <Workflow className="mr-1.5 h-3.5 w-3.5" />
                    Queue for Strudel Flow Editor
                  </Button>
                  <Button variant="outline" onClick={handleDownloadStrudelFlow}>
                    <FileJson className="mr-1.5 h-3.5 w-3.5" />
                    Download `strudel-flow-project.json`
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  After queuing, open the <code>Strudel Flow</code> page from the sidebar to load the current compiled graph into the full editor.
                </div>
                <SchemaPreview
                  title="Compatible strudel-flow project JSON"
                  value={strudelFlowProjectJson}
                  onCopy={() => handleCopy(strudelFlowProjectJson)}
                  heightClassName="h-[320px]"
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Brain className="h-4 w-4 text-violet-300" />
                  Crystal draft for bridge
                </CardTitle>
                <CardDescription>
                  Choose a recent crystal or edit a manual draft. The bridge turns this semantic state into Strudel parameter suggestions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <FieldLabel label="Source crystal" hint="Select a recent crystal from the library or stay in manual mode." />
                  <Select value={selectedCode} onValueChange={setSelectedCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select crystal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual draft</SelectItem>
                      {(crystals?.items ?? []).map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.code} · {item.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <FieldLabel label="Crystal name" />
                  <Input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel label="Description" />
                  <Textarea
                    value={draft.description}
                    onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                    className="min-h-[96px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel label="Tags" hint="Comma-separated semantic tags used to shape the generated audio query." />
                  <Input value={draft.tagsText} onChange={(event) => setDraft((prev) => ({ ...prev, tagsText: event.target.value }))} />
                </div>

                <DimensionSlider
                  label="Complexity"
                  value={draft.complexity}
                  onChange={(value) => setDraft((prev) => ({ ...prev, complexity: value }))}
                />
                <DimensionSlider
                  label="Chaos"
                  value={draft.chaos}
                  onChange={(value) => setDraft((prev) => ({ ...prev, chaos: value }))}
                />
                <DimensionSlider
                  label="Harmony"
                  value={draft.harmony}
                  onChange={(value) => setDraft((prev) => ({ ...prev, harmony: value }))}
                />
                <DimensionSlider
                  label="Density"
                  value={draft.density}
                  onChange={(value) => setDraft((prev) => ({ ...prev, density: value }))}
                />
              </CardContent>
            </Card>

            <CrystalBridgePanel crystal={crystal} onSearch={handleSearch} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SchemaPreview({
  title,
  value,
  onCopy,
  heightClassName = "h-[220px]",
}: {
  title: string;
  value: string;
  onCopy: () => void;
  heightClassName?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <ScrollArea className={`${heightClassName} rounded-md border border-border/60 bg-card/20`}>
        <pre className="p-3 text-xs leading-5 text-muted-foreground">{value}</pre>
      </ScrollArea>
    </div>
  );
}

function DimensionSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={0} max={1} step={0.01} onValueChange={([next]) => onChange(next ?? 0)} />
    </div>
  );
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDraftFromCrystal(source: CrystalsResponse["items"][number]): CrystalDraft {
  const quality = normalizeNumber(source.qualityScore, 0.55);
  const complexity = normalizeNumber(source.complexity, 0.45, 12);
  const description = source.combination || source.focus || source.pattern || source.code;
  const tags = [source.type, source.focus, source.pattern].filter((item): item is string => Boolean(item)).join(", ");
  const typeLower = source.type.toLowerCase();

  return {
    id: String(source.id),
    name: source.code,
    description,
    tagsText: tags,
    complexity,
    chaos: typeLower.includes("парад") || typeLower.includes("quant") ? 0.78 : Math.min(0.9, complexity + 0.12),
    harmony: quality,
    density: Math.min(1, Math.max(0.15, description.split(/[,+]/).length / 8)),
  };
}

function normalizeNumber(value: number | null | undefined, fallback: number, divisor = 10) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value / divisor));
}
