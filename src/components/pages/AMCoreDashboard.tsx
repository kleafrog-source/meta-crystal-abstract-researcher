"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  CircleDot,
  Database,
  FlaskConical,
  RefreshCw,
  Sparkles,
} from "@/components/icons";
import type { PageId } from "@/components/layout/Sidebar";
import { useFetch } from "@/hooks/use-fetch";
import { cn } from "@/lib/utils";

interface V3Status {
  total_parameters?: number;
  library_count?: number;
  frozen_count?: number;
  atom_count?: number;
  dataset_version?: string;
  retrieval_index_ready?: boolean;
  anchors_stub?: boolean;
  ollama_model?: string;
  error?: string;
}

interface CollectionStats {
  library_parameter_count?: number;
  library_published_package_count?: number;
  frozen_version_id?: string | null;
  pipeline_last_run?: {
    status?: string;
    finished_at?: string;
    version_after?: string;
    inbox_files?: string[];
  } | null;
}

interface TaskItem {
  taskId: string;
  taskType: string;
  title: string;
  status: string;
  startedAt: string | null;
  progress: number | null;
  lastMessage: string | null;
}

interface TasksResponse {
  ok: boolean;
  running: number;
  items: TaskItem[];
}

export function AMCoreDashboard({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [ireOpen, setIreOpen] = useState(false);
  const v3 = useFetch<V3Status>("/api/rag-v3/status");
  const collections = useFetch<CollectionStats>("/api/combinatorial-genesis/collections/stats");
  const tasks = useFetch<TasksResponse>("/api/tasks");
  const loading = v3.loading || collections.loading || tasks.loading;

  const ireTasks = useMemo(
    () =>
      (tasks.data?.items ?? []).filter((task) => {
        const identity = `${task.taskType} ${task.title}`.toLowerCase();
        return identity.includes("mmss") || identity.startsWith("ire ") || identity.includes(" ire ");
      }),
    [tasks.data],
  );
  const recentActivity = (tasks.data?.items ?? [])
    .filter((task) => task.status === "completed" || task.status === "done")
    .slice(0, 6);

  const refresh = () => {
    v3.refresh();
    collections.refresh();
    tasks.refresh();
  };

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_32%)]">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-300" />
              <h1 className="text-xl font-semibold tracking-tight text-glow-emerald">AM-Core Dashboard</h1>
              <Badge variant="outline">canonical V3</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Каноническая база параметров, активные процессы и быстрый вход в основные режимы.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Обновить
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Параметры AM-Core" value={v3.data?.total_parameters} detail={v3.data?.dataset_version ?? "версия не определена"} icon={<Database className="h-4 w-4" />} />
          <Metric label="Автономная библиотека" value={v3.data?.library_count ?? collections.data?.library_parameter_count} detail="Combinatorial Genesis" icon={<FlaskConical className="h-4 w-4" />} />
          <Metric label="Combinatorial Atoms" value={v3.data?.atom_count} detail="структурные источники" icon={<CircleDot className="h-4 w-4" />} />
          <Metric label="Опубликованные пакеты" value={collections.data?.library_published_package_count} detail="ручное подтверждение" icon={<Sparkles className="h-4 w-4" />} />
        </div>

        <Collapsible open={ireOpen} onOpenChange={setIreOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-accent/30">
                <Activity className="h-4 w-4 text-cyan-300" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Активные задачи IRE</div>
                  <div className="text-xs text-muted-foreground">Ingest · Retrain · Eval — {ireTasks.filter((task) => task.status === "running").length} выполняется</div>
                </div>
                <Badge variant="outline">{ireTasks.length}</Badge>
                <ChevronDown className={cn("h-4 w-4 transition-transform", ireOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="border-t pt-4">
                {ireTasks.length ? (
                  <div className="space-y-2">
                    {ireTasks.slice(0, 8).map((task) => (
                      <TaskRow key={task.taskId} task={task} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Задач IRE в текущем журнале нет.</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Быстрые действия</h2>
            <p className="text-xs text-muted-foreground">Основные точки входа в AM-Core.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <QuickAction title="Audio-to-Parameter" description="Сегментный анализ трека и интерполяция параметров." icon={<Activity className="h-5 w-5" />} onClick={() => onNavigate("audiotoparameter")} />
            <QuickAction title="Combinatorial Synthesis" description="Создание и ручная публикация новых параметров." icon={<Sparkles className="h-5 w-5" />} onClick={() => onNavigate("combinatorialsynthesis")} />
            <QuickAction title="Morpho-Acoustic RAG" description="Подбор параметров по изображению или спектрограмме." icon={<CircleDot className="h-5 w-5" />} onClick={() => onNavigate("morphoacousticrag")} />
          </div>
        </section>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Недавняя активность</CardTitle>
            <CardDescription>Последние успешно завершённые процессы текущей сессии сервера.</CardDescription>
          </CardHeader>
          <CardContent>
            {collections.data?.pipeline_last_run?.status === "completed" && (
              <div className="mb-2 flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">Combinatorial Genesis · inbox обработан</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {collections.data.pipeline_last_run.version_after ?? "версия без идентификатора"} · файлов: {collections.data.pipeline_last_run.inbox_files?.length ?? 0}
                  </div>
                </div>
                <Badge variant="outline">completed</Badge>
              </div>
            )}
            {recentActivity.length ? (
              <div className="divide-y divide-border">
                {recentActivity.map((task) => <TaskRow key={task.taskId} task={task} />)}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Завершённых процессов в текущей сессии пока нет.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value?: number; detail: string; icon: React.ReactNode }) {
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-emerald-500/8 to-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-emerald-300"><span className="text-[10px] uppercase tracking-widest">{label}</span>{icon}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("ru-RU") : "—"}</div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ title, description, icon, onClick }: { title: string; description: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-lg border border-border bg-card/50 p-4 text-left transition-all hover:border-emerald-400/40 hover:bg-emerald-500/5">
      <div className="flex items-center gap-2 text-emerald-300">{icon}<span className="text-sm font-medium text-foreground">{title}</span><ArrowUpRight className="ml-auto h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100" /></div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function TaskRow({ task }: { task: TaskItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={cn("h-2 w-2 rounded-full", task.status === "running" ? "animate-pulse bg-emerald-400" : "bg-cyan-400")} />
      <div className="min-w-0 flex-1"><div className="truncate text-sm">{task.title}</div><div className="truncate text-[11px] text-muted-foreground">{task.lastMessage ?? task.taskType}</div></div>
      {typeof task.progress === "number" && <span className="font-mono text-xs text-muted-foreground">{task.progress}%</span>}
      <Badge variant="outline">{task.status}</Badge>
    </div>
  );
}
