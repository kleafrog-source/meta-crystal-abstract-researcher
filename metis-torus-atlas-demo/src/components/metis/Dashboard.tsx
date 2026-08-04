"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Brain, Cpu, Database, Activity, Zap, Globe, Layers, Trash2, RefreshCw,
  Send, AlertTriangle, CheckCircle2, CircleDot, Network, Atom, GitBranch,
  Sparkles, BookOpen, Workflow, Server, MessageSquare, Settings2, Terminal,
} from "lucide-react";
import { MemoryMatrixHeatmap } from "./MemoryMatrixHeatmap";
import { TorusAtlasViz } from "./TorusAtlasViz";
import { useMetricsStream } from "./useMetricsStream";
import { toast } from "sonner";
import type {
  SystemState,
  ChatResponse,
  MemoryOp,
  CrystalNode,
} from "@/lib/engine/types";

// === Static architectural data =============================================
const ARCHITECTURE_LAYERS = [
  {
    id: "L0",
    name: "LAYER 0 · HARDWARE",
    name_ru: "Аппаратный слой",
    icon: Cpu,
    color: "oklch(0.7 0.22 60)",
    desc: "GPU/TPU (NVIDIA A100, TPU v4) или CPU (PyTorch). HBM2e 80GB + DDR4 64GB. NVMe SSD 2TB для crystal persistence.",
    spec: "100GbE network для distributed crystal sync",
  },
  {
    id: "L1",
    name: "LAYER 1 · METIS CORE",
    name_ru: "Ядро METIS",
    icon: Brain,
    color: "oklch(0.7 0.28 320)",
    desc: "Metis-4B/9B (HF transformers). Local Memory Block (M: 1024×1024, S: 1024). Hypermemory Controller (importance W).",
    spec: "GDN update, Low-Rank SVD Adapter (rank 64)",
  },
  {
    id: "L2",
    name: "LAYER 2 · MMSS MODULES",
    name_ru: "MMSS-модули",
    icon: Layers,
    color: "oklch(0.7 0.22 195)",
    desc: "7 модулей: core, distill, session, bridge, overflow, gdn, stabilization. Operations F_101..F_503.",
    spec: "Top-ρ selection: L'_t = clip(min{k: Σ p_(r) ≥ ρ}, 16, L)",
  },
  {
    id: "L3",
    name: "LAYER 3 · TORUS ATLAS",
    name_ru: "Торус-атлас",
    icon: Globe,
    color: "oklch(0.7 0.25 280)",
    desc: "2D тор с периодическими границами (u,v) ∈ [0,1]×[0,1]. Atlas charts A/B/C/D + динамические.",
    spec: "Torus-aware SVD with periodic BC, 99.9% performance preservation",
  },
  {
    id: "L4",
    name: "LAYER 4 · CRYSTAL API",
    name_ru: "Crystal API",
    icon: Database,
    color: "oklch(0.7 0.28 150)",
    desc: "REST: GET/POST/DELETE /api/torus-atlas/crystals. Sync per forward pass, batch=32, timeout=50ms.",
    spec: "JWT Bearer auth, 100 req/min rate limit",
  },
  {
    id: "L5",
    name: "LAYER 5 · AMLS CORRECTIONS",
    name_ru: "AMLS-коррекции",
    icon: Activity,
    color: "oklch(0.75 0.25 30)",
    desc: "5 правил: rank optimization, overflow prevention, interference control, temporal stability, GDN stability.",
    spec: "+6 правил из SYNTHESIZED_MMSS_SYSTEM v3.2",
  },
  {
    id: "L6",
    name: "LAYER 6 · DATA CONSTRUCTION",
    name_ru: "Конструкция данных",
    icon: BookOpen,
    color: "oklch(0.7 0.22 200)",
    desc: "SQuAD/TriviaQA → multi-step memory tasks. 357k samples, 46M tokens. 27 benchmarks.",
    spec: "L_recon (1.0) + L_op (0.8) + L_reg (0.3) multi-objective",
  },
  {
    id: "L7",
    name: "LAYER 7 · QUANTUM FRACTAL",
    name_ru: "Квантово-фрактальная топология",
    icon: Atom,
    color: "oklch(0.75 0.25 0)",
    desc: "W_fractal = lim F^n(W_0, z_q, M_mem). Ψ_attention = Σ α_i |state_i⟩ ⊗ |context_i, mem_i⟩.",
    spec: "ITR_QF → 1.0 через autonomous isomorphism discovery",
  },
];

const STUB_FILES = [
  {
    path: "src/lib/stubs/llm.ts",
    name: "LLM Inference",
    replacement: "HuggingFace transformers / Ollama / transformers.js",
    current: "stub:metis-4b@local — rule-based responses",
    fn: "stubLLMGenerate(req)",
  },
  {
    path: "src/lib/stubs/embeddings.ts",
    name: "Embedding Generator",
    replacement: "sentence-transformers (BGE) / Xenova / Ollama embeddings",
    current: "stub:bge-small-en-v1.5@local — hash-based 384d vector",
    fn: "stubEmbed(text)",
  },
  {
    path: "src/lib/stubs/memory-ops.ts",
    name: "Native Memory Operations",
    replacement: "Metis PyTorch memory engine (REMEMBER/FORGET/UPDATE/REFLECT)",
    current: "stub:metis-memory-ops@local — op detection + content extraction",
    fn: "stubMemoryOp(input) + detectOpFromText()",
  },
  {
    path: "src/lib/stubs/crystal-sync.ts",
    name: "Crystal Distributed Sync",
    replacement: "Redis / PostgreSQL JSONB / FoundationDB / etcd",
    current: "stub:in-memory-map@local — process-local Map",
    fn: "StubCrystalStore class (query/upsert/forget)",
  },
  {
    path: "src/lib/stubs/federated.ts",
    name: "Federated Edge Update (FedAvg)",
    replacement: "Flower (flwr.dev) / PySyft / custom WebSocket protocol",
    current: "stub:fedavg-simulator@local — synthetic edge updates",
    fn: "stubFedAvg(updates) + generateEdgeUpdates()",
  },
];

const OP_PRESETS: { op: MemoryOp; label: string; example: string; icon: typeof Brain }[] = [
  { op: "REMEMBER", label: "Remember", example: "Я предпочитаю metalcore в стиле Dehumanized", icon: Brain },
  { op: "UPDATE", label: "Update", example: "Обнови: теперь я слушаю прогрессив-метал", icon: RefreshCw },
  { op: "FORGET", label: "Forget", example: "Dehumanized", icon: Trash2 },
  { op: "REFLECT", label: "Reflect", example: "реорганизуй музыкальные предпочтения", icon: Sparkles },
];

const CHAT_PRESETS = [
  "Запомни, что я предпочитаю metalcore в стиле Dehumanized",
  "Какой жанр музыки я люблю?",
  "Забудь про Dehumanized, теперь слушаю только прогрессив-метал",
  "Запомни: я работаю над проектом METIS-MMSS",
  "Что ты знаешь обо мне?",
  "Отрази текущее состояние памяти",
];

// === Helper functions ======================================================
function fmt(n: number, digits = 4): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(digits);
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", { hour12: false });
}

// === Main page =============================================================
export default function Home() {
  const [state, setState] = useState<SystemState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<"ru" | "en">("ru");
  const metrics = useMetricsStream(true);

  // chat state
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<Array<ChatResponse & { role: "user" | "agent" }>>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // manual op state
  const [opContent, setOpContent] = useState("Я предпочитаю metalcore в стиле Dehumanized");
  const [opImportance, setOpImportance] = useState(0.85);
  const [opResult, setOpResult] = useState<any>(null);

  // selected crystal node
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // load initial state
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/system/state");
      const data = await res.json();
      setState(data);
    } catch (e) {
      console.error("refresh state error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();
    const id = setInterval(refreshState, 4000);
    return () => clearInterval(id);
  }, [refreshState]);

  // auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatLog]);

  // === Chat submit ============================================
  const submitChat = async (text?: string) => {
    const message = (text ?? chatInput).trim();
    if (!message || chatBusy) return;
    setChatBusy(true);
    setChatInput("");
    setChatLog((prev) => [...prev, { role: "user", user_message: message, response_text: "", detected_op: "CHAT", internal_trace: {} as any, timestamp: Date.now() }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data: ChatResponse = await res.json();
      setChatLog((prev) => [...prev, { role: "agent", ...data }]);
      // refresh system state after op
      setTimeout(refreshState, 200);
    } catch (e) {
      toast.error("Chat error: " + (e as Error).message);
    } finally {
      setChatBusy(false);
    }
  };

  // === Manual op submit =======================================
  const submitOp = async (op: MemoryOp) => {
    if (!opContent.trim()) return;
    try {
      const res = await fetch("/api/memory/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, content: opContent, importance: opImportance }),
      });
      const data = await res.json();
      setOpResult({ op, ...data });
      toast.success(`Operation ${op} applied · gdn_stab=${data.gdn_stability.toFixed(4)}`);
      refreshState();
    } catch (e) {
      toast.error("Op error: " + (e as Error).message);
    }
  };

  // === Crystal ops ===========================================
  const forgetNode = async (nodeId: string) => {
    try {
      await fetch(`/api/torus-atlas/crystals/${nodeId}`, { method: "DELETE" });
      toast.success(`Node ${nodeId.slice(0, 16)} forgotten`);
      refreshState();
    } catch (e) {
      toast.error("Forget error");
    }
  };

  const resetSystem = async () => {
    try {
      await fetch("/api/system/reset", { method: "POST" });
      setChatLog([]);
      setOpResult(null);
      toast.success("System reset to initial state");
      refreshState();
    } catch (e) {
      toast.error("Reset error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Atom className="w-16 h-16 mx-auto mb-4 quantum-pulse" style={{ color: "oklch(0.7 0.28 320)" }} />
          <div className="quantum-text-gradient text-xl font-mono">Initializing METIS-MMSS stack…</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* === HEADER === */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Atom className="w-9 h-9 quantum-pulse" style={{ color: "oklch(0.75 0.28 320)" }} />
              <div className="absolute inset-0 blur-md opacity-50">
                <Atom className="w-9 h-9" style={{ color: "oklch(0.7 0.22 195)" }} />
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold quantum-text-gradient leading-tight">
                METIS · MMSS · Torus Atlas
              </h1>
              <p className="text-[10px] md:text-xs text-muted-foreground font-mono">
                FULL_STACK_v2.0 · {state?.system_id}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-4">
            {/* Connection indicator */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md quantum-card text-xs font-mono">
              <CircleDot
                className={`w-3 h-3 ${metrics.connected ? "quantum-pulse" : ""}`}
                style={{ color: metrics.connected ? "oklch(0.7 0.22 150)" : "oklch(0.6 0.1 30)" }}
              />
              <span className="hidden md:inline">metrics</span>
              <span className="text-muted-foreground">
                {metrics.connected ? `live · ${metrics.transport}` : "off"}
              </span>
            </div>

            {/* Activation status */}
            <Badge
              variant="outline"
              className="hidden md:flex border-primary/40 text-primary font-mono"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {state?.activation_status?.replace("_ACTIVE", "") || "..."}
            </Badge>

            {/* Language toggle */}
            <div className="flex items-center gap-1 px-1 py-1 rounded-md quantum-card">
              <Button
                size="sm"
                variant={lang === "ru" ? "default" : "ghost"}
                className="h-6 px-2 text-xs"
                onClick={() => setLang("ru")}
              >
                RU
              </Button>
              <Button
                size="sm"
                variant={lang === "en" ? "default" : "ghost"}
                className="h-6 px-2 text-xs"
                onClick={() => setLang("en")}
              >
                EN
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={resetSystem}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden md:inline">Reset</span>
            </Button>
          </div>
        </div>
      </header>

      {/* === MAIN GRID === */}
      <div className="flex-1 max-w-[1800px] w-full mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Hero / system status strip */}
        <Card className="quantum-card quantum-border-glow overflow-hidden">
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 md:gap-4">
              <HeroMetric
                label="V · Memory Variance"
                value={metrics.current?.V ?? state?.metrics.real_time.V ?? 0}
                target={0.996}
                color="oklch(0.75 0.28 320)"
              />
              <HeroMetric
                label="N · Node Coherence"
                value={metrics.current?.N ?? state?.metrics.real_time.N ?? 0}
                target={0.997}
                color="oklch(0.75 0.22 195)"
              />
              <HeroMetric
                label="S · Stabilization"
                value={metrics.current?.S ?? state?.metrics.real_time.S ?? 0}
                target={0.005}
                color="oklch(0.75 0.25 280)"
                invert
              />
              <HeroMetric
                label="D_f · Fractal Dim"
                value={metrics.current?.D_f ?? state?.metrics.real_time.D_f ?? 0}
                target={9.008}
                color="oklch(0.75 0.25 60)"
              />
              <HeroMetric
                label="G_S · Global Stability"
                value={metrics.current?.G_S ?? state?.metrics.real_time.G_S ?? 0}
                target={145.32}
                color="oklch(0.75 0.22 150)"
              />
              <HeroMetric
                label="R_T · Golden Ratio"
                value={metrics.current?.R_T ?? state?.metrics.real_time.R_T ?? 0}
                target={2.61803}
                color="oklch(0.75 0.28 0)"
              />
              <HeroMetric
                label="GDN Stability"
                value={state?.performance_log.gdn_stability_score ?? 0}
                target={0.997}
                color="oklch(0.75 0.25 30)"
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span>
                readiness: <span className="text-primary">{state?.readiness?.replace(/_/g, " ") || "..."}</span>
              </span>
              <span>energy: {state?.energy_state?.replace(/_/g, " ").toLowerCase() || "..."}</span>
              <span className="hidden md:inline">
                tick #{metrics.current?.tick ?? 0} · {metrics.current ? fmtTime(metrics.current.timestamp) : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* === Architecture layers grid === */}
        <section>
          <SectionHeader
            icon={Layers}
            title={lang === "ru" ? "Архитектурные слои (8)" : "Architecture Layers (8)"}
            subtitle={lang === "ru"
              ? "Полный стек от hardware до quantum-fractal topology"
              : "Full stack from hardware to quantum-fractal topology"}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ARCHITECTURE_LAYERS.map((layer) => (
              <Card key={layer.id} className="quantum-card group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center"
                      style={{ background: `${layer.color}22`, border: `1px solid ${layer.color}55` }}
                    >
                      <layer.icon className="w-5 h-5" style={{ color: layer.color }} />
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono opacity-70">
                      {layer.id}
                    </Badge>
                  </div>
                  <CardTitle className="text-xs font-mono mt-2 leading-tight" style={{ color: layer.color }}>
                    {layer.name}
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground">
                    {layer.name_ru}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground space-y-2">
                  <p className="leading-relaxed">{layer.desc}</p>
                  <Separator className="opacity-40" />
                  <p className="font-mono text-[10px] opacity-80">{layer.spec}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* === Main working area: chat + manual ops + matrix === */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Live chat */}
          <Card className="quantum-card xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {lang === "ru" ? "Живой чат с агентом" : "Live Chat with Agent"}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {lang === "ru" ? "авто-детекция" : "auto-detect"}: REMEMBER / FORGET / UPDATE / REFLECT / QUERY
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {lang === "ru"
                  ? "Команды парсятся через STUB memory-ops. Внутренний трейс (gates, top-ρ, loss, crystal sync) отображается под каждым ответом."
                  : "Commands parsed via STUB memory-ops. Internal trace (gates, top-ρ, loss, crystal sync) shown under each reply."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* chat scroll area */}
              <div
                ref={chatScrollRef}
                className="h-[360px] overflow-y-auto quantum-scroll space-y-3 pr-2"
              >
                {chatLog.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground text-sm">
                    <Terminal className="w-8 h-8 mb-3 opacity-40" />
                    <p>{lang === "ru" ? "Чат пуст. Попробуйте пресеты ниже." : "Chat is empty. Try presets below."}</p>
                  </div>
                )}
                {chatLog.map((entry, i) => (
                  <ChatMessage key={i} entry={entry} lang={lang} />
                ))}
              </div>

              {/* presets */}
              <div className="flex flex-wrap gap-1.5">
                {CHAT_PRESETS.map((p, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] font-mono opacity-80 hover:opacity-100"
                    onClick={() => submitChat(p)}
                    disabled={chatBusy}
                  >
                    {p.length > 50 ? p.slice(0, 50) + "…" : p}
                  </Button>
                ))}
              </div>

              {/* input */}
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitChat(); } }}
                  placeholder={lang === "ru" ? "Введите команду..." : "Type a command..."}
                  disabled={chatBusy}
                  className="font-mono text-sm"
                />
                <Button onClick={() => submitChat()} disabled={chatBusy || !chatInput.trim()}>
                  {chatBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Memory matrix + GDN gates */}
          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Матрица памяти M + GDN gates" : "Memory Matrix M + GDN Gates"}
              </CardTitle>
              <CardDescription className="text-xs font-mono">
                {state?.metis.config.matrix_size} · rank={state?.metis.config.memory_rank} · γ={state?.metis.config.gamma_init}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <MemoryMatrixHeatmap
                flat={state?.metis.matrix.flat ?? []}
                rank={state?.metis.matrix.rank ?? 32}
                dim={state?.metis.matrix.dim ?? 32}
                className="aspect-square"
              />
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <Gate label="input_gate σ(W_i)" value={state?.metis.last_gates?.input_gate} color="oklch(0.75 0.22 150)" />
                <Gate label="forget_gate σ(W_f)" value={state?.metis.last_gates?.forget_gate} color="oklch(0.75 0.25 30)" />
                <Gate label="output_gate σ(W_o)" value={state?.metis.last_gates?.output_gate} color="oklch(0.75 0.28 320)" />
                <Gate label="λ retention" value={state?.metis.last_gates?.lambda} color="oklch(0.75 0.25 195)" />
              </div>
              <div className="text-xs space-y-1.5 pt-2 border-t border-border/40">
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">Tr(M·Mᵀ)</span>
                  <span>{fmt(state?.metis.matrix.trace ?? 0, 3)}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">overflow_risk</span>
                  <span className={((state?.metis.matrix.overflow_risk ?? 0) > 0.9) ? "text-destructive" : "text-primary"}>
                    {fmt(state?.metis.matrix.overflow_risk ?? 0, 4)}
                  </span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-muted-foreground">L'_t (top-ρ)</span>
                  <span>{state?.metis.last_top_rho?.L_prime ?? "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* === Manual memory ops + result trace === */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Ручные операции памяти" : "Manual Memory Operations"}
              </CardTitle>
              <CardDescription className="text-xs">
                {lang === "ru"
                  ? "Прямой вызов 𝔐(M_mem, op, context) — помните, что этот интерфейс вызывает тот же pipeline что и чат."
                  : "Direct invocation of 𝔐(M_mem, op, context) — uses same pipeline as chat."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-mono">content</Label>
                <Textarea
                  value={opContent}
                  onChange={(e) => setOpContent(e.target.value)}
                  className="mt-1 font-mono text-sm min-h-[70px]"
                  placeholder="контент для операции"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-xs font-mono">importance override</Label>
                  <span className="text-xs font-mono text-primary">{opImportance.toFixed(2)}</span>
                </div>
                <Slider
                  value={[opImportance]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => setOpImportance(v[0])}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {OP_PRESETS.map((p) => (
                  <Button
                    key={p.op}
                    variant="outline"
                    onClick={() => submitOp(p.op)}
                    disabled={!opContent.trim()}
                    className="h-auto py-2 flex flex-col items-center gap-1"
                  >
                    <p.icon className="w-4 h-4" />
                    <span className="text-[10px] font-mono">{p.label}</span>
                  </Button>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {lang === "ru" ? "Примеры контента:" : "Content examples:"}
                <ul className="mt-1 space-y-0.5">
                  {OP_PRESETS.map((p) => (
                    <li key={p.op} className="opacity-80">
                      <span className="text-primary">[{p.op}]</span> {p.example}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Трейс последней операции" : "Last Operation Trace"}
              </CardTitle>
              <CardDescription className="text-xs">
                F_101 → F_102 → F_502 → F_103 → stabilization → overflow → crystal sync
              </CardDescription>
            </CardHeader>
            <CardContent>
              {opResult ? (
                <ScrollArea className="h-[420px] quantum-scroll pr-3">
                  <div className="space-y-3 text-xs font-mono">
                    <TraceRow label="op" value={opResult.op} color="oklch(0.75 0.28 320)" />
                    <TraceRow label="crystal_node_id" value={opResult.crystal_node_id || "—"} color="oklch(0.75 0.22 150)" />
                    <TraceRow label="L'_t (top-ρ)" value={opResult.top_rho?.L_prime ?? "—"} color="oklch(0.75 0.25 280)" />
                    <TraceRow label="trace_before" value={fmt(opResult.trace_before, 4)} color="oklch(0.75 0.25 60)" />
                    <TraceRow label="trace_after" value={fmt(opResult.trace_after, 4)} color="oklch(0.75 0.25 60)" />
                    <TraceRow
                      label="overflow_triggered"
                      value={opResult.overflow_triggered ? "TRUE" : "false"}
                      color={opResult.overflow_triggered ? "oklch(0.8 0.25 25)" : "oklch(0.7 0.22 150)"}
                    />
                    <TraceRow label="gdn_stability" value={fmt(opResult.gdn_stability, 4)} color="oklch(0.75 0.25 30)" />
                    <Separator className="opacity-30" />
                    <div className="text-muted-foreground">GDN gates:</div>
                    <div className="grid grid-cols-2 gap-2 pl-3">
                      <TraceRow label="input" value={fmt(opResult.gates?.input_gate, 4)} />
                      <TraceRow label="forget" value={fmt(opResult.gates?.forget_gate, 4)} />
                      <TraceRow label="output" value={fmt(opResult.gates?.output_gate, 4)} />
                      <TraceRow label="λ" value={fmt(opResult.gates?.lambda, 4)} />
                    </div>
                    <Separator className="opacity-30" />
                    <div className="text-muted-foreground">Multi-objective loss:</div>
                    <div className="pl-3 space-y-1">
                      <TraceRow label="L_recon (×1.0)" value={fmt(opResult.loss?.L_recon, 5)} />
                      <TraceRow label="L_op (×0.8)" value={fmt(opResult.loss?.L_op, 5)} />
                      <TraceRow label="L_reg (×0.3)" value={fmt(opResult.loss?.L_reg, 5)} />
                      <TraceRow label="total" value={fmt(opResult.loss?.total, 5)} color="oklch(0.75 0.28 320)" />
                    </div>
                    <Separator className="opacity-30" />
                    <div className="text-muted-foreground">Top-ρ selection:</div>
                    <div className="pl-3 space-y-1">
                      <TraceRow label="ρ threshold" value={fmt(opResult.top_rho?.rho_threshold, 2)} />
                      <TraceRow label="K_min" value={opResult.top_rho?.K_min} />
                      <TraceRow label="τ temperature" value={fmt(opResult.top_rho?.temperature_tau, 2)} />
                      <TraceRow label="probabilities[0..5]" value={
                        opResult.top_rho?.probabilities?.slice(0, 6).map((p: number) => p.toFixed(3)).join(", ")
                      } />
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="h-[420px] flex flex-col items-center justify-center text-muted-foreground text-sm">
                  <Workflow className="w-8 h-8 mb-3 opacity-40" />
                  <p>{lang === "ru" ? "Выполните операцию слева" : "Run an operation on the left"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* === Torus Atlas + Crystal Explorer === */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Torus Atlas · топология памяти" : "Torus Atlas · memory topology"}
              </CardTitle>
              <CardDescription className="text-xs font-mono">
                2D-тор (u,v)∈[0,1]² · {state?.torus.charts.length ?? 0} charts · periodic BC
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <TorusAtlasViz
                charts={state?.torus.charts ?? []}
                nodes={state?.crystal.nodes ?? []}
                activeChart={state?.torus.active_chart ?? "chart_A"}
                onSelectChart={(id) => {
                  toast.info(`Chart ${id} selected (display only)`);
                }}
                className="aspect-square w-full max-w-md mx-auto"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                {state?.torus.charts.map((c, i) => (
                  <div key={c.chart_id} className="p-2 rounded-md quantum-card text-center">
                    <div className="text-primary font-bold">{c.chart_id.replace("chart_", "")}</div>
                    <div className="text-muted-foreground text-[10px]">{c.node_count} nodes</div>
                    {c.created_due_to_overflow && (
                      <Badge variant="outline" className="mt-1 text-[9px] border-yellow-500/40 text-yellow-500">
                        overflow
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="w-4 h-4 text-primary" />
                Crystal API Explorer
              </CardTitle>
              <CardDescription className="text-xs font-mono">
                {state?.crystal.nodes.length ?? 0} nodes · {state?.crystal.api_calls ?? 0} API calls · 45.6 MB/s sync
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[420px] quantum-scroll pr-3">
                <div className="space-y-2">
                  {(state?.crystal.nodes ?? []).length === 0 && (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Database className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p>{lang === "ru" ? "Crystal nodes появятся после REMEMBER/UPDATE операций" : "Crystal nodes will appear after REMEMBER/UPDATE ops"}</p>
                    </div>
                  )}
                  {(state?.crystal.nodes ?? []).map((n) => (
                    <CrystalNodeRow
                      key={n.node_id}
                      node={n}
                      onForget={() => forgetNode(n.node_id)}
                      selected={selectedNodeId === n.node_id}
                      onSelect={() => setSelectedNodeId(n.node_id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        {/* === AMLS Rules + Ops Log === */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-4 h-4 text-primary" />
                AMLS Correction Rules
              </CardTitle>
              <CardDescription className="text-xs">
                {lang === "ru" ? "5 METIS правил + 6 MMSS правил с реальными формулами" : "5 METIS + 6 MMSS rules with real formulas"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[420px] quantum-scroll pr-3">
                <div className="space-y-2">
                  {state?.amls.rules.map((r) => (
                    <div
                      key={r.id}
                      className={`p-3 rounded-md border ${
                        r.triggered
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {r.triggered ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span className="text-xs font-mono font-bold">{r.id}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${
                            r.triggered ? "border-destructive/50 text-destructive" : "border-emerald-500/30 text-emerald-500"
                          }`}
                        >
                          {r.triggered ? "TRIGGERED" : "stable"}
                        </Badge>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground mb-1">{r.formula}</div>
                      <div className="text-[11px] text-muted-foreground">{r.function_ru}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <Progress
                          value={Math.min(100, (r.value / Math.max(r.threshold, 0.001)) * 100)}
                          className="h-1"
                        />
                        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                          {fmt(r.value, 3)} / {fmt(r.threshold, 3)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Terminal className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Лог операций памяти" : "Memory Ops Log"}
              </CardTitle>
              <CardDescription className="text-xs font-mono">
                {state?.ops_log.length ?? 0} entries · последние 50
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[420px] quantum-scroll pr-3">
                <div className="space-y-2">
                  {(state?.ops_log ?? []).length === 0 && (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Terminal className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p>{lang === "ru" ? "Лог пуст. Выполните операцию." : "Log is empty. Run an operation."}</p>
                    </div>
                  )}
                  {(state?.ops_log ?? []).map((log) => (
                    <div key={log.id} className="p-2.5 rounded-md border border-border/40 hover:border-primary/40 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className={`text-[10px] font-mono ${
                          log.op === "REMEMBER" ? "border-emerald-500/40 text-emerald-500" :
                          log.op === "FORGET" ? "border-destructive/40 text-destructive" :
                          log.op === "UPDATE" ? "border-yellow-500/40 text-yellow-500" :
                          "border-primary/40 text-primary"
                        }`}>
                          {log.op}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">{fmtTime(log.timestamp)}</span>
                      </div>
                      <p className="text-xs font-mono truncate opacity-80">{log.content}</p>
                      <div className="grid grid-cols-3 gap-2 mt-1.5 text-[10px] font-mono text-muted-foreground">
                        <span>L'={log.top_rho.L_prime}</span>
                        <span className={log.overflow_triggered ? "text-destructive" : ""}>
                          risk={fmt(log.trace_after, 3)}
                        </span>
                        <span>stab={fmt(log.gdn_stability, 3)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        {/* === Unified metrics + STUB markers === */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Унифицированные метрики (v3.2)" : "Unified Metrics Framework (v3.2)"}
              </CardTitle>
              <CardDescription className="text-xs">
                M_S · D_G · F_E · ITR_QF · QCI · FED · SCQ · M_R · M_F
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricBadge label="M_S" name="Memory Savings" value={state?.metrics.unified.M_S ?? 0} target="MAX" />
                <MetricBadge label="D_G" name="Distillation Coverage" value={state?.metrics.unified.D_G ?? 0} target={0.95} />
                <MetricBadge label="F_E" name="Federated Edge" value={state?.metrics.unified.F_E ?? 0} target={0.3} />
                <MetricBadge label="ITR_QF" name="QF Isomorphism Rate" value={state?.metrics.unified.ITR_QF ?? 0} target={1.0} />
                <MetricBadge label="QCI" name="Quantum Coherence" value={state?.metrics.unified.QCI ?? 0} target={0.999} />
                <MetricBadge label="FED" name="Federated Efficiency" value={state?.metrics.unified.FED ?? 0} target={0.99} />
                <MetricBadge label="SCQ" name="Self-Containment" value={state?.metrics.unified.SCQ ?? 0} target={1.0} />
                <MetricBadge label="M_R" name="Memory Retention" value={state?.metrics.unified.M_R ?? 0} target={0.95} />
                <MetricBadge label="M_F" name="Forgetting Control" value={state?.metrics.unified.M_F ?? 0} target={0.98} />
              </div>
              <Separator className="my-3 opacity-30" />
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">latency_p95</span>
                  <span>{fmt(state?.metrics.unified.latency_p95_ms ?? 0, 2)} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">mem_usage_core</span>
                  <span>{fmt(state?.metrics.unified.memory_usage_mb_core ?? 0, 1)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">quantum_coherence</span>
                  <span>{fmt(state?.metrics.system_health.quantum_coherence ?? 0, 5)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">torus_coherence</span>
                  <span>{fmt(state?.metrics.system_health.torus_coherence ?? 0, 5)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="quantum-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                {lang === "ru" ? "STUB-точки замены" : "STUB Replacement Points"}
              </CardTitle>
              <CardDescription className="text-xs">
                {lang === "ru"
                  ? "Замените эти функции на реальные локальные модели. Сигнатуры сохранятся."
                  : "Replace these functions with real local models. Signatures will stay."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[420px] quantum-scroll pr-3">
                <div className="space-y-2">
                  {STUB_FILES.map((s) => (
                    <div key={s.path} className="p-3 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono border-yellow-500/40 text-yellow-500">
                          STUB
                        </Badge>
                        <span className="text-xs font-mono font-bold">{s.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground mb-1.5">
                        <span className="text-primary">{s.path}</span>
                      </div>
                      <div className="text-[11px] font-mono mb-1">
                        <span className="text-muted-foreground">fn:</span> <code className="text-cyan-400">{s.fn}</code>
                      </div>
                      <div className="text-[11px] mb-1">
                        <span className="text-muted-foreground text-[10px] uppercase">current:</span>
                        <div className="font-mono text-[11px] opacity-80">{s.current}</div>
                      </div>
                      <div className="text-[11px]">
                        <span className="text-muted-foreground text-[10px] uppercase">replace with:</span>
                        <div className="font-mono text-[11px] text-emerald-400">{s.replacement}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        {/* === Performance log === */}
        <Card className="quantum-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-4 h-4 text-primary" />
              {lang === "ru" ? "Журнал производительности" : "Performance Log"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <PerfStat label="tokens processed" value={state?.performance_log.total_tokens_processed ?? 0} />
              <PerfStat label="matrix updates" value={state?.performance_log.memory_matrix_updates ?? 0} />
              <PerfStat label="crystal API calls" value={state?.performance_log.crystal_api_calls ?? 0} />
              <PerfStat label="atlas charts created" value={state?.performance_log.atlas_charts_created ?? 0} />
              <PerfStat label="avg latency (ms)" value={fmt(state?.performance_log.avg_inference_latency_ms ?? 0, 1)} />
              <PerfStat label="forget accuracy" value={fmt(state?.performance_log.forget_accuracy ?? 0, 3)} />
              <PerfStat label="overflow events" value={state?.performance_log.overflow_events ?? 0} />
              <PerfStat label="top-ρ avg tokens" value={fmt(state?.performance_log.top_rho_avg_tokens ?? 0, 1)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === FOOTER === */}
      <footer className="mt-auto border-t border-border/40 backdrop-blur-md bg-background/60">
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 py-4 text-xs text-muted-foreground flex flex-col md:flex-row gap-2 justify-between items-center">
          <p className="font-mono">
            METIS_MMSS_TORUS_ATLAS_FULL_STACK_v2.0 · arxiv_reference 2607.26760
          </p>
          <p className="font-mono opacity-70">
            {lang === "ru"
              ? "Демо-режим: STUB-функции помечены. Замените на локальные модели для production."
              : "Demo mode: STUB functions marked. Replace with local models for production."}
          </p>
        </div>
      </footer>
    </main>
  );
}

// === Sub-components ========================================================

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Brain; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md flex items-center justify-center quantum-card">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function HeroMetric({ label, value, target, color, invert = false }: {
  label: string;
  value: number;
  target: number;
  color: string;
  invert?: boolean;
}) {
  const ratio = invert ? (target > 0 ? target / Math.max(value, 0.001) : 1) : (target > 0 ? value / target : 0);
  const isGood = ratio > 0.95;
  return (
    <div className="flex flex-col gap-1 p-2.5 rounded-md quantum-card">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider truncate">{label}</span>
        <CircleDot className="w-2.5 h-2.5" style={{ color }} />
      </div>
      <div className="font-mono-num text-lg font-bold" style={{ color }}>
        {fmt(value, value > 100 ? 2 : 5)}
      </div>
      <Progress value={Math.min(100, ratio * 100)} className="h-0.5" />
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
        <span>target: {fmt(target, target > 100 ? 2 : 4)}</span>
        <span className={isGood ? "text-emerald-500" : "text-yellow-500"}>
          {isGood ? "✓" : "≈"} {Math.round(ratio * 100)}%
        </span>
      </div>
    </div>
  );
}

function Gate({ label, value, color }: { label: string; value: number | undefined; color: string }) {
  return (
    <div className="p-2 rounded-md border border-border/40 bg-background/30">
      <div className="text-[10px] text-muted-foreground font-mono">{label}</div>
      <div className="font-mono-num text-base font-bold" style={{ color }}>
        {value !== undefined ? fmt(value, 4) : "—"}
      </div>
    </div>
  );
}

function ChatMessage({ entry, lang }: { entry: ChatResponse & { role: "user" | "agent" }; lang: "ru" | "en" }) {
  const isUser = entry.role === "user";
  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
        isUser
          ? "bg-primary/15 border border-primary/30 text-foreground"
          : "quantum-card"
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[9px] font-mono h-4">
            {isUser ? "USER" : "METIS-AGENT"}
          </Badge>
          {!isUser && entry.detected_op && (
            <Badge variant="outline" className="text-[9px] font-mono h-4 border-primary/40 text-primary">
              {entry.detected_op}
            </Badge>
          )}
        </div>
        <p className="text-sm">
          {isUser ? entry.user_message : entry.response_text || "..."}
        </p>
        {!isUser && entry.internal_trace?.gdn_update && (
          <details className="mt-2 group">
            <summary className="text-[10px] font-mono text-muted-foreground cursor-pointer hover:text-primary">
              ▸ {lang === "ru" ? "внутренний трейс" : "internal trace"}
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] font-mono p-2 rounded-md bg-background/40">
              <TraceLine label="hypermemory_W[0..5]" value={entry.internal_trace.hypermemory_importance.slice(0, 6).map((w) => w.toFixed(3)).join(", ")} />
              <TraceLine label="top-ρ L'_t" value={entry.internal_trace.top_rho_selection.L_prime} />
              <TraceLine label="GDN λ" value={fmt(entry.internal_trace.gdn_update.lambda, 4)} />
              <TraceLine label="GDN input_gate" value={fmt(entry.internal_trace.gdn_update.input_gate, 4)} />
              <TraceLine label="GDN forget_gate" value={fmt(entry.internal_trace.gdn_update.forget_gate, 4)} />
              <TraceLine label="GDN output_gate" value={fmt(entry.internal_trace.gdn_update.output_gate, 4)} />
              <TraceLine label="crystal API" value={entry.internal_trace.crystal_api_call} />
              <TraceLine label="overflow risk" value={`${fmt(entry.internal_trace.overflow_check.risk, 4)} (thr=${entry.internal_trace.overflow_check.threshold})`} />
              <TraceLine label="gdn_stability" value={fmt(entry.internal_trace.gdn_stability, 4)} />
              <TraceLine label="L_total" value={fmt(entry.internal_trace.multi_objective_loss.total, 5)} />
              <TraceLine label="stabilization" value={entry.internal_trace.stabilization_formula} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function TraceLine({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[140px]">{label}</span>
      <span className="text-primary">{String(value)}</span>
    </div>
  );
}

function TraceRow({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span style={{ color: color || "inherit" }}>{String(value)}</span>
    </div>
  );
}

function CrystalNodeRow({ node, onForget, selected, onSelect }: {
  node: CrystalNode;
  onForget: () => void;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`p-2.5 rounded-md border cursor-pointer transition-colors ${
        selected ? "border-primary/60 bg-primary/5" : "border-border/40 hover:border-primary/30"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">{node.node_id}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={(e) => { e.stopPropagation(); onForget(); }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <p className="text-xs font-mono truncate mb-1">{node.content}</p>
      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
        <span>chart={node.coords.atlas_chart.replace("chart_", "")}</span>
        <span>·</span>
        <span>W={node.importance.toFixed(3)}</span>
        <span>·</span>
        <span>(u={node.coords.torus_u.toFixed(2)}, v={node.coords.torus_v.toFixed(2)})</span>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        {node.embedding_preview.map((v, i) => (
          <div
            key={i}
            className="h-2 flex-1 rounded-sm"
            style={{
              background: `oklch(${0.4 + Math.abs(v) * 0.4} ${0.18 + Math.abs(v) * 0.1} ${v >= 0 ? 195 : 320})`,
              opacity: 0.5 + Math.abs(v) * 0.5,
            }}
            title={`z[${i}] = ${v.toFixed(3)}`}
          />
        ))}
      </div>
    </div>
  );
}

function MetricBadge({ label, name, value, target }: {
  label: string;
  name: string;
  value: number;
  target: number | string;
}) {
  const numTarget = typeof target === "number" ? target : 1;
  const isGood = typeof target === "string" ? value > 0 : (numTarget > 1 ? value >= numTarget : value >= numTarget * 0.95);
  return (
    <div className="p-2.5 rounded-md quantum-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono font-bold text-primary">{label}</span>
        <CircleDot className="w-2.5 h-2.5" style={{ color: isGood ? "oklch(0.7 0.22 150)" : "oklch(0.7 0.25 60)" }} />
      </div>
      <div className="font-mono-num text-base font-bold">
        {fmt(value, value > 10 ? 1 : 4)}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{name}</div>
      <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
        target: {typeof target === "string" ? target : fmt(target, 3)}
      </div>
    </div>
  );
}

function PerfStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-2.5 rounded-md quantum-card">
      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">{label}</div>
      <div className="font-mono-num text-lg font-bold text-primary">{value}</div>
    </div>
  );
}
