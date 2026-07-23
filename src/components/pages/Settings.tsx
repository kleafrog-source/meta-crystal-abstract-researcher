"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Square,
  Wifi,
  WifiOff,
  XCircle,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiPost, apiPut, useFetch } from "@/hooks/use-fetch";

interface SettingsData {
  ok: boolean;
  llm: {
    provider: "ollama" | "mock";
    ollamaUrl: string;
    chatModel: string;
    embedModel: string;
    temperature: number;
    topP: number;
    maxTokens: number;
  };
}

interface ModelsData {
  ok: boolean;
  provider: string;
  reachable: boolean;
  currentChatModel: string;
  currentEmbedModel: string;
  models: Array<{
    id: string;
    name: string;
    size?: number;
    quantization?: string;
    family?: string;
  }>;
}

interface IndexTaskEvent {
  event: "log" | "progress" | "data" | "error" | "done" | "closed";
  level?: "info" | "warn" | "error" | "success";
  msg?: string;
  value?: number;
  step?: string;
  payload?: { processed?: number; total?: number };
  result?: {
    total?: number;
    processed?: number;
    embedded?: number;
    skipped?: number;
    failed?: number;
    cancelled?: boolean;
    elapsedMs?: number;
  };
}

export function Settings() {
  const { data, refresh } = useFetch<SettingsData>("/api/settings");
  const [llm, setLlm] = useState<SettingsData["llm"] | null>(null);
  const [models, setModels] = useState<ModelsData | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [kbIndexing, setKbIndexing] = useState(false);
  const [kbIndexProgress, setKbIndexProgress] = useState<{ total: number; embedded: number } | null>(null);
  const [crystalIndexTaskId, setCrystalIndexTaskId] = useState<string | null>(null);
  const [crystalIndexStatus, setCrystalIndexStatus] = useState<"idle" | "running" | "done" | "failed" | "cancelled">("idle");
  const [crystalIndexProgress, setCrystalIndexProgress] = useState<{ processed: number; total: number; percent: number }>({
    processed: 0,
    total: 0,
    percent: 0,
  });
  const [crystalIndexSummary, setCrystalIndexSummary] = useState<IndexTaskEvent["result"] | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (data?.llm) setLlm(data.llm);
  }, [data]);

  useEffect(() => {
    if (!crystalIndexTaskId) return;
    const es = new EventSource(`/api/llm/index_crystals/stream/${crystalIndexTaskId}`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as IndexTaskEvent;
        if (payload.event === "progress") {
          const processed = payload.payload?.processed ?? crystalIndexProgress.processed;
          const total = payload.payload?.total ?? crystalIndexProgress.total;
          setCrystalIndexProgress({
            processed,
            total,
            percent: payload.value ?? (total > 0 ? Math.round((processed / total) * 100) : 0),
          });
        }
        if (payload.event === "done") {
          const result = payload.result ?? null;
          setCrystalIndexSummary(result);
          setCrystalIndexStatus(result?.cancelled ? "cancelled" : "done");
          es.close();
          toast({
            title: result?.cancelled ? "Индексация остановлена" : "Индексация завершена",
            description: result
              ? `Обработано ${result.processed ?? 0}/${result.total ?? 0}, embedding: ${result.embedded ?? 0}, ошибок: ${result.failed ?? 0}`
              : "Фоновая задача завершилась.",
          });
        }
        if (payload.event === "error") {
          setCrystalIndexStatus("failed");
          es.close();
          toast({
            title: "Ошибка индексации кристаллов",
            description: payload.msg ?? "Неизвестная ошибка",
            variant: "destructive",
          });
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [crystalIndexTaskId, crystalIndexProgress.processed, crystalIndexProgress.total, toast]);

  const refreshModels = async () => {
    setModelsLoading(true);
    try {
      const response = await fetch("/api/llm/models");
      const payload = await response.json();
      setModels(payload);
      if (payload.reachable) {
        toast({
          title: "Список моделей обновлен",
          description: `Найдено ${payload.models.length} моделей.`,
        });
      } else {
        toast({
          title: "Ollama недоступен",
          description: `По адресу ${llm?.ollamaUrl}. Используется mock-провайдер.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setModelsLoading(false);
    }
  };

  const save = async () => {
    if (!llm) return;
    try {
      await apiPut("/api/settings", llm);
      toast({ title: "Настройки сохранены" });
      refresh();
    } catch (error) {
      toast({
        title: "Ошибка сохранения",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const indexKB = async (force: boolean) => {
    setKbIndexing(true);
    setKbIndexProgress(null);
    try {
      const payload = await apiPost<{
        synced: { total: number; byKind: Record<string, number> };
        embedded: { total: number; embedded: number; skipped: number };
      }>("/api/llm/index_kb", { force });
      setKbIndexProgress({
        total: payload.embedded.total,
        embedded: payload.embedded.embedded,
      });
      toast({
        title: "Индексация базы знаний завершена",
        description: `Синхронизировано ${payload.synced.total}, новых embedding ${payload.embedded.embedded}.`,
      });
    } catch (error) {
      toast({
        title: "Ошибка индексации базы знаний",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setKbIndexing(false);
    }
  };

  const startCrystalIndex = async (force: boolean) => {
    try {
      setCrystalIndexSummary(null);
      setCrystalIndexStatus("running");
      setCrystalIndexProgress({ processed: 0, total: 0, percent: 0 });
      const payload = await apiPost<{ taskId: string }>("/api/llm/index_crystals/start", { force });
      setCrystalIndexTaskId(payload.taskId);
      toast({
        title: "Фоновая индексация кристаллов запущена",
        description: force ? "Будут пересчитаны все embedding." : "Будут обработаны только записи без embedding.",
      });
    } catch (error) {
      setCrystalIndexStatus("failed");
      toast({
        title: "Не удалось запустить индексацию",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const stopCrystalIndex = async () => {
    if (!crystalIndexTaskId) return;
    try {
      await apiPost(`/api/llm/index_crystals/stop/${crystalIndexTaskId}`, {});
      toast({ title: "Команда остановки отправлена" });
    } catch (error) {
      toast({
        title: "Не удалось остановить индексацию",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const presetModels = useMemo(
    () => [
      "mmss-qwen2.5-3b-cpu2:latest",
      "mmss-qwen2.5-3b:latest",
      "hermes3-3b-cpu2:latest",
      "hermes3:3b",
      "llama3:latest",
      "qwen2.5-coder-3b-cpu:latest",
      "qwen2.5-coder-7b-cpu:latest",
      "mmss-qwen3.5-0.8b:latest",
      "mmss-qwen2.5-0.5b:latest",
    ],
    [],
  );
  const embedPresets = useMemo(
    () => [
      "qwen3-embedding:0.6b",
      "embeddinggemma:300m",
      "nomic-embed-text",
      "all-minilm",
    ],
    [],
  );

  if (!llm) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-glow-emerald">Настройки</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Конфигурация LLM, моделей и фоновой индексации для чата и интерпретации.
            </p>
          </div>
          <Button onClick={save}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Сохранить
          </Button>
        </div>
      </header>

      <div className="max-w-5xl flex-1 space-y-4 overflow-y-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-emerald-400" />
              LLM-провайдер
            </CardTitle>
            <CardDescription>Ollama для локальной работы или mock для безопасного fallback.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ProviderCard
                label="Ollama"
                description="Локальный сервер моделей. Нужен для чата, интерпретации и embedding."
                icon={<Server className="h-5 w-5" />}
                active={llm.provider === "ollama"}
                onClick={() => setLlm({ ...llm, provider: "ollama" })}
              />
              <ProviderCard
                label="Mock"
                description="Безопасный fallback без реальной локальной модели."
                icon={<Brain className="h-5 w-5" />}
                active={llm.provider === "mock"}
                onClick={() => setLlm({ ...llm, provider: "mock" })}
              />
            </div>

            {llm.provider === "ollama" && (
              <div className="space-y-3 border-t border-border pt-2">
                <div className="space-y-1.5">
                  <HintLabel
                    label="URL Ollama"
                    hint="Адрес локального Ollama API. Обычно это http://127.0.0.1:11434."
                  />
                  <Input
                    value={llm.ollamaUrl}
                    onChange={(e) => setLlm({ ...llm, ollamaUrl: e.target.value })}
                    placeholder="http://127.0.0.1:11434"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={refreshModels} disabled={modelsLoading}>
                    {modelsLoading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Обновить список моделей
                  </Button>
                  {models && (
                    <Badge
                      variant="outline"
                      className={
                        models.reachable
                          ? "border-emerald-500/30 text-emerald-300"
                          : "border-rose-500/30 text-rose-300"
                      }
                    >
                      {models.reachable ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
                      {models.reachable ? "доступен" : "недоступен"}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Модели
            </CardTitle>
            <CardDescription>
              Используйте refresh, чтобы подтянуть актуальный список локальных моделей из Ollama, а не старые пресеты.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <HintLabel
                label="Chat-модель"
                hint="Основная модель для LLM-чата, интерпретации кристаллов и генерации pipeline."
              />
              <div className="flex gap-2">
                <Input
                  value={llm.chatModel}
                  onChange={(e) => setLlm({ ...llm, chatModel: e.target.value })}
                  className="flex-1 font-mono text-sm"
                />
                <Select value={llm.chatModel} onValueChange={(value) => setLlm({ ...llm, chatModel: value })}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Выбрать..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(models?.models?.length ? models.models : presetModels.map((id) => ({ id, name: id }))).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <HintLabel
                label="Embedding-модель"
                hint="Используется для RAG и индексации кристаллов. Если смените модель, лучше запустить полную переиндексацию."
              />
              <div className="flex gap-2">
                <Input
                  value={llm.embedModel}
                  onChange={(e) => setLlm({ ...llm, embedModel: e.target.value })}
                  className="flex-1 font-mono text-sm"
                />
                <Select value={llm.embedModel} onValueChange={(value) => setLlm({ ...llm, embedModel: value })}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Выбрать..." />
                  </SelectTrigger>
                  <SelectContent>
                    {embedPresets.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-cyan-400" />
              Параметры генерации
            </CardTitle>
            <CardDescription>Эти параметры влияют на все LLM-вызовы в web-приложении.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SliderField
              label="Temperature"
              value={llm.temperature}
              min={0}
              max={1.5}
              step={0.05}
              hint="Чем выше значение, тем менее детерминирован и более свободен ответ модели."
              format={(value) => value.toFixed(2)}
              onChange={(value) => setLlm({ ...llm, temperature: value })}
            />
            <SliderField
              label="Top-P"
              value={llm.topP}
              min={0.1}
              max={1}
              step={0.05}
              hint="Nucleus sampling. Оставляйте ближе к 0.8-0.95 для практичного баланса."
              format={(value) => value.toFixed(2)}
              onChange={(value) => setLlm({ ...llm, topP: value })}
            />
            <SliderField
              label="Max Tokens"
              value={llm.maxTokens}
              min={128}
              max={8192}
              step={128}
              hint="Лимит размера ответа. Слишком большие значения на слабом железе часто замедляют ответ."
              format={(value) => String(Math.round(value))}
              onChange={(value) => setLlm({ ...llm, maxTokens: Math.round(value) })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-amber-400" />
              База знаний
            </CardTitle>
            <CardDescription>
              Отдельная индексация словаря доменов, операторов, паттернов и фокусов для RAG по знаниям движка.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kbIndexProgress && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Embedding базы знаний</span>
                  <span className="font-mono">
                    {kbIndexProgress.embedded} / {kbIndexProgress.total}
                  </span>
                </div>
                <Progress
                  value={kbIndexProgress.total > 0 ? (kbIndexProgress.embedded / kbIndexProgress.total) * 100 : 0}
                  className="h-1.5"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => indexKB(false)} disabled={kbIndexing}>
                {kbIndexing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1.5 h-3.5 w-3.5" />}
                Индексировать недостающие
              </Button>
              <Button variant="outline" size="sm" onClick={() => indexKB(true)} disabled={kbIndexing}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Переиндексировать все
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Brain className="h-4 w-4 text-emerald-400" />
              Индексация кристаллов
            </CardTitle>
            <CardDescription>
              Безопасная фоновая индексация embedding по SQLite без блокировки refresh. Ее можно запускать вручную и останавливать.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {crystalIndexStatus === "running" && (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  выполняется
                </Badge>
              )}
              {crystalIndexStatus === "done" && (
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  завершено
                </Badge>
              )}
              {crystalIndexStatus === "failed" && (
                <Badge variant="outline" className="border-rose-500/30 text-rose-300">
                  <XCircle className="mr-1 h-3 w-3" />
                  ошибка
                </Badge>
              )}
              {crystalIndexStatus === "cancelled" && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-300">
                  <Square className="mr-1 h-3 w-3" />
                  остановлено
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Прогресс</span>
                <span className="font-mono">
                  {crystalIndexProgress.processed} / {crystalIndexProgress.total || "?"}
                </span>
              </div>
              <Progress value={crystalIndexProgress.percent} className="h-1.5" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={crystalIndexStatus === "running"}
                onClick={() => startCrystalIndex(false)}
              >
                <Database className="mr-1.5 h-3.5 w-3.5" />
                Индексировать недостающие
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={crystalIndexStatus === "running"}
                onClick={() => startCrystalIndex(true)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Переиндексировать все
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={crystalIndexStatus !== "running"}
                onClick={stopCrystalIndex}
              >
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Остановить
              </Button>
            </div>

            {crystalIndexSummary && (
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 bg-card/40 p-3 text-xs md:grid-cols-5">
                <Stat label="Всего" value={String(crystalIndexSummary.total ?? 0)} />
                <Stat label="Обработано" value={String(crystalIndexSummary.processed ?? 0)} />
                <Stat label="Embedding" value={String(crystalIndexSummary.embedded ?? 0)} />
                <Stat label="Пропущено" value={String(crystalIndexSummary.skipped ?? 0)} />
                <Stat label="Ошибок" value={String(crystalIndexSummary.failed ?? 0)} />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Рекомендуемый режим: сначала “Индексировать недостающие”. Полную переиндексацию запускайте после смены embedding-модели.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Текущее состояние</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">Провайдер</dt>
              <dd className="font-mono">{llm.provider}</dd>
              <dt className="text-muted-foreground">Chat-модель</dt>
              <dd className="font-mono">{llm.chatModel}</dd>
              <dt className="text-muted-foreground">Embed-модель</dt>
              <dd className="font-mono">{llm.embedModel}</dd>
              <dt className="text-muted-foreground">Temperature</dt>
              <dd className="font-mono">{llm.temperature.toFixed(2)}</dd>
              <dt className="text-muted-foreground">Top-P</dt>
              <dd className="font-mono">{llm.topP.toFixed(2)}</dd>
              <dt className="text-muted-foreground">Max tokens</dt>
              <dd className="font-mono">{llm.maxTokens}</dd>
              {models && (
                <>
                  <dt className="text-muted-foreground">Ollama</dt>
                  <dd className="flex items-center gap-1 font-mono">
                    {models.reachable ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-rose-400" />
                    )}
                    {models.reachable ? "online" : "offline"}
                  </dd>
                  <dt className="text-muted-foreground">Моделей доступно</dt>
                  <dd className="font-mono">{models.models.length}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProviderCard({
  label,
  description,
  icon,
  active,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-all ${
        active
          ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
          : "border-border bg-card/40 hover:border-border/80"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="text-sm font-medium">{label}</span>
        {active && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />}
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <HintLabel label={label} hint={hint} />
        <span className="text-xs font-mono text-emerald-300">{format(value)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(values) => onChange(values[0])} />
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function HintLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center gap-1">
      <Label className="text-xs">{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
