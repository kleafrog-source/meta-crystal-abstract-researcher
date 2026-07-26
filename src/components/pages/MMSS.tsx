"use client";

import { useEffect, useMemo, useState } from "react";
import { ActiveTasksPanel } from "@/components/tasks/ActiveTasksPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Square,
  Terminal,
  Wifi,
  WifiOff,
} from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import type { SidecarEvent } from "@/lib/engine/runner";

interface MmssStatusResponse {
  ok: boolean;
  torch_ok?: boolean;
  checkpoint_loaded?: boolean;
  ollama_detected?: boolean;
  ollama_mode?: string;
  n_crystals_in_base?: number;
  error?: string;
}

interface MmssReportResponse {
  ok: boolean;
  exists: boolean;
  report: Record<string, unknown> | null;
}

interface MmssRunArtifact {
  path: string;
  kind: "created" | "modified";
  size: number;
  modifiedAt: string;
}

interface MmssRunEntry {
  taskId: string;
  taskType: string;
  title: string;
  command: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "done" | "failed" | "cancelled";
  durationMs?: number;
  summary?: string;
  input?: unknown;
  extraEnv?: Record<string, string>;
  artifacts: MmssRunArtifact[];
}

interface MmssRunsResponse {
  ok: boolean;
  runs: MmssRunEntry[];
}

const DEFAULT_MODELS = {
  chatModel: "mmss-qwen2.5-3b:latest",
  embedModel: "embeddinggemma:300m",
  chatTimeoutSec: 180,
  embedTimeoutSec: 45,
  ollamaHost: "http://127.0.0.1:11434",
};

const MMSS_FIELD_HINTS: Record<string, string> = {
  "Chat model": "LLM-модель учителя для MMSS. Используется при retrain и задачах, где нужен текстовый вывод модели.",
  "Embed model": "Embedding-модель для кодирования кристаллов и запросов. При смене модели результаты пространства признаков меняются.",
  "Chat timeout, sec": "Диапазон: 10-600 секунд. Увеличение полезно для медленных локальных моделей, но дольше удерживает задачу активной при зависаниях.",
  "Embed timeout, sec": "Диапазон: 5-300 секунд. Подходит для медленных embedding-запросов на слабом железе.",
  "Ollama host": "URL локального Ollama API. Обычно http://127.0.0.1:11434. Если адрес неверный, MMSS уйдет в fallback или не увидит модели.",
  "Crystal code": "Код одного кристалла для точечного ingest. Используйте существующий code из библиотеки, чтобы не прогонять всю базу.",
  "n_pairs": "Диапазон: 4-10000. Число обучающих пар для retrain. Рост повышает покрытие, но увеличивает время и нагрузку на CPU.",
  "epochs": "Диапазон: 1-100. Больше эпох усиливает дообучение, но повышает риск переобучения и долгих прогонов.",
  "batch": "Диапазон: 1-256. Большее значение ускоряет проходы при достаточной памяти, но увеличивает нагрузку.",
  "lr x1000": "Скорость обучения, умноженная на 1000 для удобства ввода. Рост делает обучение агрессивнее, но может ухудшить стабильность.",
  "Output checkpoint": "Путь к checkpoint-файлу .pt, куда будет сохранен результат retrain. Используйте отдельное имя для разных экспериментов.",
  "Crystal limit": "Диапазон: 1-10000. Ограничивает размер выборки для MMSS eval. Небольшие значения подходят для smoke/regression проверок.",
};

export function MMSS() {
  const { data: status, loading: statusLoading, refresh: refreshStatus } = useFetch<MmssStatusResponse>("/api/mmss/status");
  const { data: reportData, loading: reportLoading, refresh: refreshReport } = useFetch<MmssReportResponse>("/api/mmss/report");
  const { data: runsData, loading: runsLoading, refresh: refreshRuns } = useFetch<MmssRunsResponse>("/api/mmss/runs?limit=14");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [events, setEvents] = useState<SidecarEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [currentAction, setCurrentAction] = useState<string>("idle");
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [ingestMode, setIngestMode] = useState<"all" | "code">("all");
  const [crystalCode, setCrystalCode] = useState("GQC0S-f15");
  const [retrainForm, setRetrainForm] = useState({
    n_pairs: 48,
    epochs: 2,
    batch: 4,
    lr: 0.002,
    out_checkpoint: "D:/WORK/CLIENTS/mmss-meta-crystal/python_engine/mmss/v22_hyper_ollama_distilled.pt",
  });
  const [evalForm, setEvalForm] = useState({
    crystal_limit: 24,
  });
  const [runtimeForm, setRuntimeForm] = useState(DEFAULT_MODELS);
  const [stopping, setStopping] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!taskId) return;
    const es = new EventSource(`/api/generate/stream/${taskId}`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as SidecarEvent;
        setEvents((prev) => [...prev, payload]);
        if (payload.event === "done") {
          setRunning(false);
          setLastResult(payload.result ?? null);
          es.close();
          refreshReport();
          refreshStatus();
          refreshRuns();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("tasks:refresh"));
          }
        }
        if (payload.event === "error") {
          setRunning(false);
          es.close();
          toast({
            title: "MMSS задача завершилась с ошибкой",
            description: payload.msg ?? "unknown error",
            variant: "destructive",
          });
          refreshReport();
          refreshStatus();
          refreshRuns();
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [taskId, refreshReport, refreshRuns, refreshStatus, toast]);

  const progressValue = useMemo(() => {
    const progress = [...events].reverse().find((event) => event.event === "progress" && typeof event.value === "number");
    return typeof progress?.value === "number" ? progress.value : 0;
  }, [events]);

  const launch = async (url: string, body: Record<string, unknown>, actionLabel: string) => {
    try {
      setEvents([]);
      setLastResult(null);
      setRunning(true);
      setCurrentAction(actionLabel);
      const response = await apiPost<{ taskId: string }>(url, {
        ...body,
        ...runtimeForm,
      });
      setTaskId(response.taskId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tasks:refresh"));
      }
    } catch (error) {
      setRunning(false);
      toast({
        title: "Не удалось запустить MMSS режим",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const stopCurrentTask = async () => {
    if (!taskId) return;
    try {
      setStopping(true);
      await apiPost(`/api/tasks/stop/${taskId}`, {});
      toast({ title: "Остановка отправлена", description: taskId.slice(0, 8) });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tasks:refresh"));
      }
    } catch (error) {
      toast({
        title: "Не удалось остановить MMSS задачу",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">MMSS</span>
              <Badge variant="outline">real-data gate</Badge>
              {running && (
                <Badge variant="outline">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  {currentAction}
                </Badge>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Отдельный режим для MMSS ingest, retrain, eval и просмотра результатов поверх текущей базы кристаллов.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { refreshStatus(); refreshReport(); refreshRuns(); }}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${statusLoading || reportLoading || runsLoading ? "animate-spin" : ""}`} />
              Обновить
            </Button>
            {running && (
              <Button variant="outline" onClick={stopCurrentTask} disabled={stopping}>
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Остановить
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Server className="h-4 w-4 text-cyan-400" />
                  MMSS runtime
                </CardTitle>
                <CardDescription>Модели и timeout для teacher/encoder. Эти значения передаются только MMSS задачам.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Chat model" value={runtimeForm.chatModel} onChange={(value) => setRuntimeForm((prev) => ({ ...prev, chatModel: value }))} />
                <Field label="Embed model" value={runtimeForm.embedModel} onChange={(value) => setRuntimeForm((prev) => ({ ...prev, embedModel: value }))} />
                <NumberField label="Chat timeout, sec" value={runtimeForm.chatTimeoutSec} onChange={(value) => setRuntimeForm((prev) => ({ ...prev, chatTimeoutSec: value }))} />
                <NumberField label="Embed timeout, sec" value={runtimeForm.embedTimeoutSec} onChange={(value) => setRuntimeForm((prev) => ({ ...prev, embedTimeoutSec: value }))} />
                <div className="md:col-span-2">
                  <Field label="Ollama host" value={runtimeForm.ollamaHost} onChange={(value) => setRuntimeForm((prev) => ({ ...prev, ollamaHost: value }))} />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm"><Database className="h-4 w-4 text-emerald-400" />Ingest</CardTitle>
                  <CardDescription>Запуск `mmss_ingest_all` или `mmss_ingest_code`.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={ingestMode === "all" ? "default" : "outline"} onClick={() => setIngestMode("all")}>Вся база</Button>
                    <Button variant={ingestMode === "code" ? "default" : "outline"} onClick={() => setIngestMode("code")}>Один код</Button>
                  </div>
                  {ingestMode === "code" && (
                    <Field label="Crystal code" value={crystalCode} onChange={setCrystalCode} />
                  )}
                  <Button
                    className="w-full"
                    disabled={running}
                    onClick={() => launch("/api/mmss/ingest", { mode: ingestMode, code: crystalCode }, ingestMode === "code" ? "mmss_ingest_code" : "mmss_ingest_all")}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Запустить ingest
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm"><Brain className="h-4 w-4 text-violet-400" />Retrain</CardTitle>
                  <CardDescription>Обучение Ollama-based checkpoint на реальных crystal queries.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label="n_pairs" value={retrainForm.n_pairs} onChange={(value) => setRetrainForm((prev) => ({ ...prev, n_pairs: value }))} />
                    <NumberField label="epochs" value={retrainForm.epochs} onChange={(value) => setRetrainForm((prev) => ({ ...prev, epochs: value }))} />
                    <NumberField label="batch" value={retrainForm.batch} onChange={(value) => setRetrainForm((prev) => ({ ...prev, batch: value }))} />
                    <NumberField label="lr x1000" value={Math.round(retrainForm.lr * 1000)} onChange={(value) => setRetrainForm((prev) => ({ ...prev, lr: value / 1000 }))} />
                  </div>
                  <Field label="Output checkpoint" value={retrainForm.out_checkpoint} onChange={(value) => setRetrainForm((prev) => ({ ...prev, out_checkpoint: value }))} />
                  <Button
                    className="w-full"
                    disabled={running}
                    onClick={() => launch("/api/mmss/retrain", retrainForm as unknown as Record<string, unknown>, "mmss_retrain")}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Запустить retrain
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm"><Cpu className="h-4 w-4 text-amber-400" />Eval</CardTitle>
                <CardDescription>Запуск `mmss_eval` с ограничением размера выборки для smoke/regression проверок.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
                <NumberField label="Crystal limit" value={evalForm.crystal_limit} onChange={(value) => setEvalForm({ crystal_limit: value })} />
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    disabled={running}
                    onClick={() => launch("/api/mmss/eval", evalForm as unknown as Record<string, unknown>, "mmss_eval")}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Запустить eval
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm"><Terminal className="h-4 w-4 text-emerald-400" />Текущий лог MMSS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={running ? progressValue : lastResult ? 100 : 0} />
                <ScrollArea className="h-[260px] rounded-md border border-border bg-card/40">
                  <div className="space-y-0.5 p-3 font-mono text-xs">
                    {events.length === 0 ? (
                      <div className="italic text-muted-foreground">$ ожидание запуска mmss…</div>
                    ) : (
                      events.map((event, index) => <LogLine key={index} event={event} />)
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm"><Activity className="h-4 w-4 text-cyan-400" />Последний результат</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[260px] overflow-auto rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
                  {JSON.stringify(lastResult ?? reportData?.report ?? null, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm"><Server className="h-4 w-4 text-cyan-400" />Статус MMSS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatusRow
                  label="Torch"
                  value={status?.torch_ok ? "available" : "missing"}
                  icon={status?.torch_ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-rose-400" />}
                />
                <StatusRow
                  label="Checkpoint"
                  value={status?.checkpoint_loaded ? "loaded" : "missing"}
                  icon={status?.checkpoint_loaded ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-rose-400" />}
                />
                <StatusRow
                  label="Ollama"
                  value={status?.ollama_detected ? String(status.ollama_mode ?? "detected") : "offline"}
                  icon={status?.ollama_detected ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-rose-400" />}
                />
                <StatusRow
                  label="Crystal base"
                  value={String(status?.n_crystals_in_base ?? "—")}
                  icon={<Database className="h-4 w-4 text-cyan-400" />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Последний eval report</CardTitle>
                <CardDescription>
                  {reportData?.exists ? "Файл найден" : "Файл еще не создан"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>verdict: <span className="font-mono text-foreground">{String((reportData?.report as { verdict?: string } | null)?.verdict ?? "—")}</span></div>
                <div>created_at: <span className="font-mono text-foreground">{String((reportData?.report as { created_at?: string } | null)?.created_at ?? "—")}</span></div>
                <div>notes: <span className="font-mono text-foreground">{JSON.stringify((reportData?.report as { notes?: unknown } | null)?.notes ?? [])}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Журнал запусков MMSS</CardTitle>
                <CardDescription>Параметры запуска, статус, итог и измененные артефакты по последним MMSS задачам.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {runsData?.runs?.length ? (
                  <div className="space-y-3">
                    {runsData.runs.map((run) => (
                      <div key={run.taskId} className="rounded-md border border-border bg-card/40 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-foreground">{run.title}</div>
                          <Badge variant="outline">{run.command}</Badge>
                          <Badge variant="outline">{run.status}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{formatRunMeta(run)}</div>
                        {run.summary && (
                          <div className="mt-2 text-xs text-foreground">{run.summary}</div>
                        )}
                        <pre className="mt-2 overflow-auto rounded-md border border-border bg-background/60 p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(
                            {
                              input: run.input ?? null,
                              extraEnv: run.extraEnv ?? {},
                            },
                            null,
                            2,
                          )}
                        </pre>
                        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                          {run.artifacts.length === 0 ? (
                            <div>Артефакты не изменились.</div>
                          ) : (
                            run.artifacts.slice(0, 6).map((artifact) => (
                              <div key={`${run.taskId}-${artifact.path}`} className="font-mono">
                                [{artifact.kind}] {artifact.path}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Журнал пока пуст.</div>
                )}
              </CardContent>
            </Card>

            <ActiveTasksPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} hint={MMSS_FIELD_HINTS[label]} />
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-xs" />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} hint={MMSS_FIELD_HINTS[label]} />
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="font-mono text-xs"
      />
    </div>
  );
}

function StatusRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function LogLine({ event }: { event: SidecarEvent }) {
  if (event.event === "log") {
    return <div className="text-cyan-300"><span className="opacity-50">[{event.ts?.slice(11, 19) ?? ""}]</span> {event.msg}</div>;
  }
  if (event.event === "progress") {
    return <div className="text-violet-300"><span className="opacity-50">[{event.ts?.slice(11, 19) ?? ""}]</span> {event.value}% — {event.step}</div>;
  }
  if (event.event === "error") {
    return <div className="font-bold text-rose-300">{event.msg}</div>;
  }
  if (event.event === "done") {
    return <div className="font-bold text-emerald-300">done</div>;
  }
  if (event.event === "data") {
    return <div className="text-amber-200">{JSON.stringify(event.payload ?? {}, null, 0)}</div>;
  }
  return null;
}

function formatRunMeta(run: MmssRunEntry) {
  const started = new Date(run.startedAt).toLocaleString("ru-RU");
  const finished = run.finishedAt ? new Date(run.finishedAt).toLocaleString("ru-RU") : "в процессе";
  const duration =
    typeof run.durationMs === "number" && Number.isFinite(run.durationMs)
      ? `${(run.durationMs / 1000).toFixed(1)}s`
      : "—";
  return `start: ${started} | finish: ${finished} | duration: ${duration} | files: ${run.artifacts.length}`;
}
