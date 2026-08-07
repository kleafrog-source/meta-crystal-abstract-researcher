"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Atom, Brain, Database, RefreshCw, Send, Settings2, Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { MemoryMatrixHeatmap, type MetisVizMode } from "@/components/metis/MemoryMatrixHeatmap";
import { TorusAtlasViz, type MetisPaletteMode } from "@/components/metis/TorusAtlasViz";
import type { ChatResponse, MemoryOp, MetisProviderConfig, OllamaModelInfo, SystemState } from "@/lib/metis/types";

type ChatEntry = { role: "user" | "agent"; text: string } & Partial<ChatResponse>;
type SelectionResult = {
  query: string;
  imported: number;
  skipped: number;
  candidateCount: number;
  selectedCount: number;
  forgottenCount: number;
  selected: Array<{
    id: string;
    code: string;
    type: string;
    focus: string | null;
    combination: string;
    score: number;
    finalScore: number;
    nodeId: string | null;
  }>;
  forgottenNodeIds: string[];
  generatedAt: string;
};

const OP_ORDER: MemoryOp[] = ["REMEMBER", "UPDATE", "FORGET", "REFLECT"];
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

const DEFAULT_CONFIG: MetisProviderConfig = {
  llmProvider: "stub",
  embeddingProvider: "stub",
  vllmBaseUrl: "http://127.0.0.1:8000/v1",
  vllmModel: "IAAR-Shanghai/Metis-4B",
  vllmEmbeddingModel: "BAAI/bge-small-en-v1.5",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaModel: "mmss-qwen2.5-3b-cpu2:latest",
  ollamaEmbeddingModel: "qllama/bge-m3:q8_0",
  temperature: 0.5,
  maxTokens: 180,
  requestTimeoutMs: 60000,
};

function fmt(value: number, digits = 4) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatOllamaLabel(model: OllamaModelInfo) {
  return [model.name, model.details?.parameter_size, model.details?.quantization_level].filter(Boolean).join(" · ");
}

export function MetisLab() {
  const [state, setState] = useState<SystemState | null>(null);
  const [config, setConfig] = useState<MetisProviderConfig>(DEFAULT_CONFIG);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [ollamaBusy, setOllamaBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importLimit, setImportLimit] = useState("200");
  const [importOnlyEmbeddings, setImportOnlyEmbeddings] = useState(true);
  const [importType, setImportType] = useState("");
  const [importIds, setImportIds] = useState("");
  const [importCodes, setImportCodes] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [manualContent, setManualContent] = useState("Запомни, что я тестирую режим METIS внутри Meta-Crystal.");
  const [manualImportance, setManualImportance] = useState([0.85]);
  const [metricsTick, setMetricsTick] = useState(0);
  const [paletteMode, setPaletteMode] = useState<MetisPaletteMode>("signal");
  const [torusEnabled, setTorusEnabled] = useState(true);
  const [matrixEnabled, setMatrixEnabled] = useState(true);
  const [torusMode, setTorusMode] = useState<MetisVizMode>("auto");
  const [matrixMode, setMatrixMode] = useState<MetisVizMode>("auto");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchOp, setBatchOp] = useState<MemoryOp>("REMEMBER");
  const [batchInput, setBatchInput] = useState("");
  const [batchImportance, setBatchImportance] = useState([0.7]);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionQuery, setSelectionQuery] = useState("найди парадоксы и гибриды, которые подходят для трансформации в аудио-альбом");
  const [selectionCandidateLimit, setSelectionCandidateLimit] = useState("100");
  const [selectionKeepTop, setSelectionKeepTop] = useState("8");
  const [selectionImportedOnly, setSelectionImportedOnly] = useState(false);
  const [selectionEnrichedOnly, setSelectionEnrichedOnly] = useState(false);
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const metrics = useMemo(() => state?.metrics.real_time, [state]);
  const embeddingCandidates = useMemo(
    () => ollamaModels.filter((model) => /embed|embedding|bge|e5|gte|nomic/i.test(model.name)),
    [ollamaModels],
  );
  const opsJournalText = useMemo(() => buildOpsJournal(state?.ops_log || []), [state?.ops_log]);

  async function refreshState() {
    const response = await fetch("/api/metis/state", { cache: "no-store" });
    if (!response.ok) throw new Error("state fetch failed");
    const data = (await response.json()) as SystemState;
    setState(data);
    setConfig(data.providers);
  }

  async function refreshMetrics() {
    const response = await fetch("/api/metis/metrics", { cache: "no-store" });
    if (!response.ok) return;
    await response.json();
    setMetricsTick((value) => value + 1);
    refreshState().catch(() => {});
  }

  async function refreshOllamaModels(baseUrl = config.ollamaBaseUrl) {
    setOllamaBusy(true);
    try {
      const response = await fetch(`/api/metis/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Ollama models fetch failed");
      const models = (json.models || []) as OllamaModelInfo[];
      setOllamaModels(models);
      setConfig((prev) => {
        const fallbackEmbed =
          models.find((model) => /embed|embedding|bge|e5|gte|nomic/i.test(model.name))?.name || models[0]?.name || prev.ollamaEmbeddingModel;
        return {
          ...prev,
          ollamaModel: models.some((model) => model.name === prev.ollamaModel) ? prev.ollamaModel : models[0]?.name || prev.ollamaModel,
          ollamaEmbeddingModel: models.some((model) => model.name === prev.ollamaEmbeddingModel) ? prev.ollamaEmbeddingModel : fallbackEmbed,
        };
      });
      toast.success(`Ollama models loaded: ${models.length}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ollama models fetch failed");
    } finally {
      setOllamaBusy(false);
    }
  }

  useEffect(() => {
    refreshState().catch((error) => toast.error(error instanceof Error ? error.message : "Metis state load failed"));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshMetrics().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (config.llmProvider === "ollama" || config.embeddingProvider === "ollama") {
      refreshOllamaModels(config.ollamaBaseUrl).catch(() => {});
    }
  }, [config.llmProvider, config.embeddingProvider, config.ollamaBaseUrl]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ block: "end" });
  }, [chatLog]);

  async function saveConfig() {
    const response = await fetch("/api/metis/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(json.error || "Не удалось сохранить конфиг Metis");
      return;
    }
    setConfig(json as MetisProviderConfig);
    toast.success("Конфиг Metis сохранен");
  }

  async function resetSystem() {
    const response = await fetch("/api/metis/reset", { method: "POST" });
    if (!response.ok) {
      toast.error("Сброс Metis не удался");
      return;
    }
    setChatLog([]);
    await refreshState();
    toast.success("Metis reset выполнен");
  }

  async function sendChatMessage(text?: string) {
    const message = (text ?? chatInput).trim();
    if (!message || chatBusy) return;
    setChatBusy(true);
    setChatInput("");
    setChatLog((prev) => [...prev, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/metis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Metis chat failed");
      setChatLog((prev) => [...prev, { role: "agent", text: json.response_text || "", ...json }]);
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metis chat failed");
    } finally {
      setChatBusy(false);
    }
  }

  async function applyManualOp(op: MemoryOp) {
    const content = manualContent.trim();
    if (!content) return;
    try {
      const response = await fetch("/api/metis/memory/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, content, importance: manualImportance[0] }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Metis op failed");
      await refreshState();
      toast.success(`${op} выполнен`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metis op failed");
    }
  }

  async function forgetNode(nodeId: string) {
    const response = await fetch(`/api/metis/crystals/${nodeId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Не удалось удалить node");
      return;
    }
    await refreshState();
  }

  async function importLibraryCrystals() {
    setImportBusy(true);
    try {
      const response = await fetch("/api/metis/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: Number(importLimit) || 100,
          ids: importIds,
          codes: importCodes,
          onlyWithEmbeddings: importOnlyEmbeddings,
          type: importType.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Metis import failed");
      await refreshState();
      toast.success(`Импортировано ${json.imported}, пропущено ${json.skipped}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metis import failed");
    } finally {
      setImportBusy(false);
    }
  }

  async function copyOpsJournal() {
    try {
      await navigator.clipboard.writeText(opsJournalText);
      toast.success("Metis journal copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clipboard write failed");
    }
  }

  async function runBatchOp() {
    const items = batchInput
      .split(/\n+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((content) => ({ content, importance: batchImportance[0] }));
    if (!items.length) return;
    setBatchBusy(true);
    try {
      const response = await fetch("/api/metis/memory/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: batchOp,
          items,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Metis batch op failed");
      await refreshState();
      toast.success(`${batchOp} batch: ${json.processed}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metis batch op failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function runSelection() {
    if (!selectionQuery.trim()) return;
    setSelectionBusy(true);
    try {
      const response = await fetch("/api/metis/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: selectionQuery,
          candidateLimit: Number(selectionCandidateLimit) || 100,
          keepTop: Number(selectionKeepTop) || 8,
          type: importType.trim() || undefined,
          onlyWithEmbeddings: importOnlyEmbeddings,
          importedOnly: selectionImportedOnly,
          enrichedOnly: selectionEnrichedOnly,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Metis selection failed");
      setSelectionResult(json as SelectionResult);
      await refreshState();
      toast.success(`Selection ready: ${json.selectedCount} of ${json.candidateCount}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metis selection failed");
    } finally {
      setSelectionBusy(false);
    }
  }

  async function copySelection() {
    if (!selectionResult?.selected.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectionResult.selected, null, 2));
      toast.success("Selection copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clipboard write failed");
    }
  }

  async function saveSelection() {
    if (!selectionResult?.selected.length) return;
    setSaveBusy(true);
    try {
      const response = await fetch("/api/metis/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: selectionResult.query,
          selected: selectionResult.selected,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Metis export failed");
      toast.success(`Saved: ${json.mdPath}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metis export failed");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Atom className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">Metis Lab</div>
              <div className="text-xs text-muted-foreground">
                Отдельный режим для memory stack, torus atlas и экспериментов с локальными провайдерами.
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{config.llmProvider.toUpperCase()}</Badge>
            <Badge variant="outline">{config.embeddingProvider.toUpperCase()}</Badge>
            <Button variant="outline" size="sm" onClick={() => refreshState().catch(() => {})}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Обновить
            </Button>
            <Button variant="outline" size="sm" onClick={resetSystem}>
              <Trash2 className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard title="V" value={metrics?.V ?? 0} subtitle="Memory variance" />
          <MetricCard title="N" value={metrics?.N ?? 0} subtitle="Node coherence" />
          <MetricCard title="S" value={metrics?.S ?? 0} subtitle="Stabilization" />
          <MetricCard title="D_f" value={metrics?.D_f ?? 0} subtitle="Fractal dimension" />
          <MetricCard title="G_S" value={metrics?.G_S ?? 0} subtitle="Global stability" />
          <MetricCard title="R_T" value={metrics?.R_T ?? 0} subtitle={`tick ${metricsTick}`} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" />
                Runtime providers
              </CardTitle>
              <CardDescription>
                `stub` работает сразу. `ollama` использует локальный Ollama, `vllm` ожидает OpenAI-compatible endpoint.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ProviderSelect label="LLM provider" value={config.llmProvider} onValueChange={(value) => setConfig((prev) => ({ ...prev, llmProvider: value }))} />
              <ProviderSelect label="Embedding provider" value={config.embeddingProvider} onValueChange={(value) => setConfig((prev) => ({ ...prev, embeddingProvider: value }))} />
              <ConfigInput label="Ollama base URL" value={config.ollamaBaseUrl} onChange={(value) => setConfig((prev) => ({ ...prev, ollamaBaseUrl: value }))} />
              <div className="space-y-2">
                <Label>Ollama models</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => refreshOllamaModels()} disabled={ollamaBusy}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {ollamaBusy ? "..." : "Refresh models"}
                  </Button>
                  <span className="text-xs text-muted-foreground">{ollamaModels.length ? `${ollamaModels.length} models` : "not loaded"}</span>
                </div>
              </div>
              <OllamaModelSelect label="Ollama chat model" value={config.ollamaModel} models={ollamaModels} onChange={(value) => setConfig((prev) => ({ ...prev, ollamaModel: value }))} />
              <OllamaModelSelect
                label="Ollama embedding model"
                value={config.ollamaEmbeddingModel}
                models={embeddingCandidates.length ? embeddingCandidates : ollamaModels}
                onChange={(value) => setConfig((prev) => ({ ...prev, ollamaEmbeddingModel: value }))}
              />
              <ConfigInput label="vLLM base URL" value={config.vllmBaseUrl} onChange={(value) => setConfig((prev) => ({ ...prev, vllmBaseUrl: value }))} />
              <ConfigInput label="vLLM chat model" value={config.vllmModel} onChange={(value) => setConfig((prev) => ({ ...prev, vllmModel: value }))} />
              <ConfigInput label="vLLM embedding model" value={config.vllmEmbeddingModel} onChange={(value) => setConfig((prev) => ({ ...prev, vllmEmbeddingModel: value }))} />
              <ConfigInput label="Max tokens" value={String(config.maxTokens)} onChange={(value) => setConfig((prev) => ({ ...prev, maxTokens: Number(value) || prev.maxTokens }))} />
              <div className="space-y-2">
                <Label>Temperature: {config.temperature.toFixed(2)}</Label>
                <Slider value={[config.temperature]} min={0} max={2} step={0.05} onValueChange={(value) => setConfig((prev) => ({ ...prev, temperature: value[0] ?? prev.temperature }))} />
              </div>
              <div className="space-y-2">
                <Label>Request timeout ms</Label>
                <Input value={String(config.requestTimeoutMs)} onChange={(event) => setConfig((prev) => ({ ...prev, requestTimeoutMs: Number(event.target.value) || prev.requestTimeoutMs }))} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={saveConfig}>Сохранить runtime config</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" />
                Manual memory ops
              </CardTitle>
              <CardDescription>Прямой запуск REMEMBER / UPDATE / FORGET / REFLECT без JSON-ручного ввода.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea rows={5} value={manualContent} onChange={(event) => setManualContent(event.target.value)} />
              <div className="space-y-2">
                <Label>Importance: {manualImportance[0].toFixed(2)}</Label>
                <Slider value={manualImportance} min={0} max={1} step={0.05} onValueChange={setManualImportance} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {OP_ORDER.map((op) => (
                  <Button key={op} variant="outline" onClick={() => applyManualOp(op)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {op}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Import from crystal library
            </CardTitle>
            <CardDescription>
              Импортирует реальные кристаллы из основной SQLite-библиотеки в persisted Metis nodes. Можно фильтровать по типу,
              ids, codes и наличию embedding.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <ConfigInput label="Limit" value={importLimit} onChange={setImportLimit} />
            <ConfigInput label="Type filter" value={importType} onChange={setImportType} />
            <div className="space-y-2 md:col-span-2 xl:col-span-1">
              <Label>Crystal ids</Label>
              <Textarea
                rows={4}
                value={importIds}
                onChange={(event) => setImportIds(event.target.value)}
                placeholder="cuid1, cuid2 или по одному id с новой строки"
              />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-1">
              <Label>Crystal codes</Label>
              <Textarea
                rows={4}
                value={importCodes}
                onChange={(event) => setImportCodes(event.target.value)}
                placeholder="GQC0S-f15, NQC0S-977 или по одному коду с новой строки"
              />
            </div>
            <div className="space-y-2">
              <Label>Only with embeddings</Label>
              <Select value={importOnlyEmbeddings ? "yes" : "no"} onValueChange={(value) => setImportOnlyEmbeddings(value === "yes")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">yes</SelectItem>
                  <SelectItem value="no">no</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end md:col-span-2 xl:col-span-5">
              <Button onClick={importLibraryCrystals} disabled={importBusy}>
                <Database className="mr-2 h-4 w-4" />
                {importBusy ? "Импорт..." : "Импортировать из библиотеки"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Metis API panel
            </CardTitle>
            <CardDescription>
              Единая панель операций. Все, что можно сделать через память и selection-flow, доступно и через UI, и через тот же Metis API.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline">POST /api/metis/memory/ops</Badge>
                  <div className="text-sm font-medium">Batch memory ops</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Operation</Label>
                    <Select value={batchOp} onValueChange={(value) => setBatchOp(value as MemoryOp)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OP_ORDER.map((op) => (
                          <SelectItem key={op} value={op}>
                            {op}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Importance: {batchImportance[0].toFixed(2)}</Label>
                    <Slider value={batchImportance} min={0} max={1} step={0.05} onValueChange={setBatchImportance} />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label>Items</Label>
                  <Textarea
                    rows={6}
                    value={batchInput}
                    onChange={(event) => setBatchInput(event.target.value)}
                    placeholder="По одному элементу на строку. Для FORGET можно указать nodeId вроде lib_GQC0S-f15."
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={runBatchOp} disabled={batchBusy}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {batchBusy ? "Выполнение..." : "Запустить batch"}
                  </Button>
                  <Button variant="outline" onClick={() => refreshMetrics().catch(() => {})}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Читать метрики
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline">GET /api/metis/state</Badge>
                  <Badge variant="outline">GET /api/metis/metrics</Badge>
                  <div className="text-sm font-medium">Available API surface</div>
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  <div>`/api/metis/import`</div>
                  <div>ids, codes, limit, type, onlyWithEmbeddings</div>
                  <div>`/api/metis/memory/ops`</div>
                  <div>REMEMBER / UPDATE / FORGET / REFLECT, single + batch</div>
                  <div>`/api/metis/select`</div>
                  <div>query {"->"} 100 candidates {"->"} keep top 8</div>
                  <div>`/api/metis/export`</div>
                  <div>save selection to JSON + Markdown</div>
                  <div>`/api/metis/state`</div>
                  <div>nodes, ops log, metrics, matrix, torus charts</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline">POST /api/metis/select</Badge>
                  <div className="text-sm font-medium">Отбор по запросу: 100 → 8</div>
                </div>
                <div className="space-y-2">
                  <Label>Query</Label>
                  <Textarea value={selectionQuery} onChange={(event) => setSelectionQuery(event.target.value)} rows={4} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ConfigInput label="Candidates" value={selectionCandidateLimit} onChange={setSelectionCandidateLimit} />
                  <ConfigInput label="Keep top" value={selectionKeepTop} onChange={setSelectionKeepTop} />
                  <div className="space-y-2">
                    <Label>Imported only</Label>
                    <Select value={selectionImportedOnly ? "yes" : "no"} onValueChange={(value) => setSelectionImportedOnly(value === "yes")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">no</SelectItem>
                        <SelectItem value="yes">yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Metis-enriched only</Label>
                    <Select value={selectionEnrichedOnly ? "yes" : "no"} onValueChange={(value) => setSelectionEnrichedOnly(value === "yes")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">no</SelectItem>
                        <SelectItem value="yes">yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={runSelection} disabled={selectionBusy}>
                    <Database className="mr-2 h-4 w-4" />
                    {selectionBusy ? "Отбор..." : "Отбор по запросу"}
                  </Button>
                  <Button variant="outline" onClick={copySelection} disabled={!selectionResult?.selected.length}>
                    Copy top set
                  </Button>
                  <Button variant="outline" onClick={saveSelection} disabled={!selectionResult?.selected.length || saveBusy}>
                    {saveBusy ? "Сохранение..." : "Save to file"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 p-4">
                <div className="mb-3 text-sm font-medium">Selection result</div>
                {!selectionResult ? (
                  <div className="text-sm text-muted-foreground">Пока нет результата. Запустите "Отбор по запросу".</div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-2 text-sm md:grid-cols-4">
                      <Stat label="imported" value={selectionResult.imported} />
                      <Stat label="skipped" value={selectionResult.skipped} />
                      <Stat label="candidates" value={selectionResult.candidateCount} />
                      <Stat label="selected" value={selectionResult.selectedCount} />
                    </div>
                    <ScrollArea className="h-[220px] rounded-xl border border-border/60 p-3">
                      <div className="space-y-3">
                        {selectionResult.selected.map((item, index) => (
                          <div key={`${item.code}-${index}`} className="rounded-lg border border-border/50 p-3">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{item.code}</Badge>
                              <Badge variant="secondary">{item.type}</Badge>
                              <span className="text-xs text-muted-foreground">final={fmt(item.finalScore, 4)}</span>
                            </div>
                            <div className="text-sm">{item.focus || "Без focus"}</div>
                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.combination}</div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
          <Card className="min-h-[780px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-primary" />
                Metis chat
              </CardTitle>
              <CardDescription>Широкий чат с фиксированным composer внизу и отдельной прокруткой истории.</CardDescription>
            </CardHeader>
            <CardContent className="flex h-[680px] min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-background/30">
                <ScrollArea className="h-full px-4 py-4">
                  <div className="space-y-3 pr-3">
                    {chatLog.length === 0 && <div className="text-sm text-muted-foreground">Пока нет сообщений. Начните с "Запомни ..." или "Что ты знаешь обо мне?".</div>}
                    {chatLog.map((entry, index) => (
                      <div key={index} className={`rounded-xl border px-3 py-2 ${entry.role === "user" ? "ml-16 border-primary/30 bg-primary/5" : "mr-8 border-border/60 bg-background/40"}`}>
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{entry.role === "user" ? "USER" : entry.detected_op || "METIS"}</Badge>
                          {entry.model_id && <span className="truncate">{entry.model_id}</span>}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-sm">{entry.text}</div>
                        {entry.role === "agent" && entry.internal_trace && (
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer text-muted-foreground">trace</summary>
                            <div className="mt-2 space-y-1 rounded-lg bg-muted/30 p-2 font-mono">
                              <div>top_rho: {entry.internal_trace.top_rho_selection.L_prime}</div>
                              <div>gdn lambda: {fmt(entry.internal_trace.gdn_update.lambda)}</div>
                              <div>overflow: {fmt(entry.internal_trace.overflow_check.risk)}</div>
                              <div className="break-all">crystal_api: {entry.internal_trace.crystal_api_call}</div>
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>
                </ScrollArea>
              </div>
              <div className="mt-4 border-t border-border/60 pt-4">
                <div className="flex items-end gap-3">
                  <Textarea
                    rows={4}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Например: Запомни, что я проверяю Ollama-провайдер в Metis Lab."
                    className="min-h-[112px] resize-none"
                  />
                  <Button className="h-11 shrink-0" onClick={() => sendChatMessage()} disabled={chatBusy}>
                    <Send className="mr-2 h-4 w-4" />
                    {chatBusy ? "..." : "Отправить"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[780px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-primary" />
                Crystal nodes
              </CardTitle>
              <CardDescription>{state?.crystal.nodes.length ?? 0} nodes in current in-memory atlas.</CardDescription>
            </CardHeader>
            <CardContent className="h-[680px] min-h-0">
              <ScrollArea className="h-full pr-3">
                <div className="space-y-3">
                  {(state?.crystal.nodes || []).map((node) => (
                    <div key={node.node_id} className="rounded-xl border border-border/60 p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs text-muted-foreground">{node.node_id}</div>
                          <div className="mt-1 break-words text-sm leading-5">{node.content}</div>
                        </div>
                        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => forgetNode(node.node_id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{node.coords.atlas_chart}</span>
                        <span>W={node.importance.toFixed(3)}</span>
                        <span>u={node.coords.torus_u.toFixed(2)}</span>
                        <span>v={node.coords.torus_v.toFixed(2)}</span>
                      </div>
                      <div className="flex max-w-full gap-1 overflow-hidden">
                        {node.embedding_preview.map((value, index) => (
                          <div key={index} className="h-2 min-w-0 flex-1 rounded-sm" style={{ opacity: 0.45 + Math.abs(value) * 0.55, background: value >= 0 ? "oklch(0.72 0.18 195)" : "oklch(0.72 0.2 320)" }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Atom className="h-4 w-4 text-primary" />
                    Torus atlas
                  </CardTitle>
                  <CardDescription>{state?.torus.charts.length ?? 0} charts, active {state?.torus.active_chart || "chart_A"}.</CardDescription>
                </div>
                <div className="grid w-full max-w-[420px] gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select value={torusEnabled ? "on" : "off"} onValueChange={(value) => setTorusEnabled(value === "on")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on">On</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select value={torusMode} onValueChange={(value) => setTorusMode(value as MetisVizMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIZ_MODE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Palette</Label>
                    <Select value={paletteMode} onValueChange={(value) => setPaletteMode(value as MetisPaletteMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PALETTE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {state && (
                <TorusAtlasViz
                  charts={state.torus.charts}
                  nodes={state.crystal.nodes}
                  activeChart={state.torus.active_chart}
                  palette={paletteMode}
                  enabled={torusEnabled}
                  mode={torusMode}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="h-4 w-4 text-primary" />
                    Memory matrix
                  </CardTitle>
                  <CardDescription>rank {state?.metis.matrix.rank ?? 0} x dim {state?.metis.matrix.dim ?? 0}, overflow {fmt(state?.metis.matrix.overflow_risk ?? 0)}</CardDescription>
                </div>
                <div className="grid w-full max-w-[280px] gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select value={matrixEnabled ? "on" : "off"} onValueChange={(value) => setMatrixEnabled(value === "on")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on">On</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select value={matrixMode} onValueChange={(value) => setMatrixMode(value as MetisVizMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIZ_MODE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {state && (
                <MemoryMatrixHeatmap
                  flat={state.metis.matrix.flat}
                  rank={state.metis.matrix.rank}
                  dim={state.metis.matrix.dim}
                  enabled={matrixEnabled}
                  mode={matrixMode}
                />
              )}
              <Separator />
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <Stat label="matrix updates" value={state?.performance_log.memory_matrix_updates ?? 0} />
                <Stat label="api calls" value={state?.performance_log.crystal_api_calls ?? 0} />
                <Stat label="avg inference ms" value={fmt(state?.performance_log.avg_inference_latency_ms ?? 0, 2)} />
                <Stat label="gdn stability" value={fmt(state?.performance_log.gdn_stability_score ?? 0)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4 text-primary" />
                  Metis operations journal
                </CardTitle>
                <CardDescription>Лента REMEMBER / UPDATE / FORGET / REFLECT с importance, trace, overflow и слепком realtime-метрик.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={copyOpsJournal} disabled={!state?.ops_log.length}>
                <Database className="mr-2 h-4 w-4" />
                Copy journal
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <ScrollArea className="h-[320px] rounded-xl border border-border/60 p-3">
              <div className="space-y-3">
                {(state?.ops_log || []).length === 0 && (
                  <div className="text-sm text-muted-foreground">Журнал пока пуст. Выполните хотя бы одну memory-операцию.</div>
                )}
                {(state?.ops_log || []).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-border/60 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.op}</Badge>
                      <Badge variant={entry.overflow_triggered ? "destructive" : "secondary"}>
                        {entry.overflow_triggered ? "overflow" : "stable"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString("ru-RU")}</span>
                    </div>
                    <div className="mb-2 whitespace-pre-wrap break-words text-sm">{entry.content}</div>
                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
                      <span>importance={fmt(entry.importance, 3)}</span>
                      <span>L'={entry.top_rho.L_prime}</span>
                      <span>lambda={fmt(entry.gates.lambda, 4)}</span>
                      <span>trace {fmt(entry.trace_before, 4)} → {fmt(entry.trace_after, 4)}</span>
                      <span>gdn={fmt(entry.gdn_stability, 4)}</span>
                      <span>node={entry.crystal_node_id ?? "n/a"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <span>V={fmt(entry.metrics.V, 4)}</span>
                      <span>N={fmt(entry.metrics.N, 4)}</span>
                      <span>S={fmt(entry.metrics.S, 4)}</span>
                      <span>D_f={fmt(entry.metrics.D_f, 4)}</span>
                      <span>G_S={fmt(entry.metrics.G_S, 4)}</span>
                      <span>R_T={fmt(entry.metrics.R_T, 4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Textarea readOnly value={opsJournalText} className="h-[320px] font-mono text-xs" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              AMLS and unified metrics
            </CardTitle>
            <CardDescription>Правила стабилизации и агрегированные показатели текущего Metis runtime.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard title="M_S" value={state?.metrics.unified.M_S ?? 0} subtitle="Memory savings" />
              <MetricCard title="D_G" value={state?.metrics.unified.D_G ?? 0} subtitle="Distillation" />
              <MetricCard title="FED" value={state?.metrics.unified.FED ?? 0} subtitle="Federated" />
              <MetricCard title="QCI" value={state?.metrics.unified.QCI ?? 0} subtitle="Quantum coherence" />
              <MetricCard title="M_R" value={state?.metrics.unified.M_R ?? 0} subtitle="Memory retention" />
              <MetricCard title="M_F" value={state?.metrics.unified.M_F ?? 0} subtitle="Forget control" />
            </div>
            <ScrollArea className="h-[260px] rounded-xl border border-border/60 p-3">
              <div className="space-y-3">
                {(state?.amls.rules || []).map((rule) => (
                  <div key={rule.id} className="rounded-xl border border-border/60 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={rule.triggered ? "destructive" : "outline"}>{rule.triggered ? "triggered" : "ok"}</Badge>
                      <div className="font-medium">{rule.name}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{rule.function_ru}</div>
                    <div className="mt-2 break-words font-mono text-xs">{rule.formula}</div>
                    <div className="mt-1 text-xs text-muted-foreground">value {fmt(rule.value)} / threshold {fmt(rule.threshold)}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function buildOpsJournal(opsLog: SystemState["ops_log"]) {
  if (!opsLog.length) return "";
  return opsLog
    .map((entry, index) =>
      [
        `#${index + 1} ${entry.op} ${new Date(entry.timestamp).toLocaleString("ru-RU")}`,
        `content: ${entry.content}`,
        `importance: ${fmt(entry.importance, 3)}`,
        `node: ${entry.crystal_node_id ?? "n/a"}`,
        `trace: ${fmt(entry.trace_before, 4)} -> ${fmt(entry.trace_after, 4)}`,
        `overflow: ${entry.overflow_triggered ? "yes" : "no"}`,
        `lambda: ${fmt(entry.gates.lambda, 4)}, L': ${entry.top_rho.L_prime}, gdn: ${fmt(entry.gdn_stability, 4)}`,
        `metrics: V=${fmt(entry.metrics.V, 4)}, N=${fmt(entry.metrics.N, 4)}, S=${fmt(entry.metrics.S, 4)}, D_f=${fmt(entry.metrics.D_f, 4)}, G_S=${fmt(entry.metrics.G_S, 4)}, R_T=${fmt(entry.metrics.R_T, 4)}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function ConfigInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ProviderSelect({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: "stub" | "vllm" | "ollama";
  onValueChange: (value: "stub" | "vllm" | "ollama") => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stub">stub</SelectItem>
          <SelectItem value="ollama">ollama</SelectItem>
          <SelectItem value="vllm">vllm</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function OllamaModelSelect({
  label,
  value,
  models,
  onChange,
}: {
  label: string;
  value: string;
  models: OllamaModelInfo[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.name} value={model.name}>
              {formatOllamaLabel(model)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MetricCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="mt-2 text-2xl font-semibold">{fmt(value, value > 100 ? 2 : 4)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}
