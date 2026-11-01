"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AMCoreLogo } from "@/components/ui/am-core-logo";
import { AMIcon } from "@/components/ui/am-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowUpRight,
  Activity,
  CircleDot,
  Database,
  FlaskConical,
  RefreshCw,
  Sparkles,
} from "@/components/icons";
import type { PageId } from "@/components/layout/Sidebar";
import { useFetch } from "@/hooks/use-fetch";
import { cn } from "@/lib/utils";
import { V3Tooltip, V3InfoTip } from "@/components/rag-v3/V3Tooltip";
import { useUiText } from "@/lib/ui-i18n";

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

interface DashboardTasks { ok: boolean; running: number; items: Array<{ taskId: string; taskType: string; title: string; status: string; progress: number | null; lastMessage: string | null }> }

export function AMCoreDashboard({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const t = useUiText();
  const v3 = useFetch<V3Status>("/api/rag-v3/status");
  const collections = useFetch<CollectionStats>("/api/combinatorial-genesis/collections/stats");
  const tasks = useFetch<DashboardTasks>("/api/tasks");
  const loading = v3.loading || collections.loading || tasks.loading;
  const recentActivity = useMemo(() => (tasks.data?.items ?? []).filter((task) => task.status === "completed" || task.status === "done").slice(0, 6), [tasks.data]);

  const refresh = () => {
    v3.refresh();
    collections.refresh();
    tasks.refresh();
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AMCoreLogo className="h-14 w-14" label="AM-Core Dashboard" />
              <AMIcon name="dashboard" size="md" bright />
              <span className="text-sm font-medium">Abstract-Mindfreak</span>
              <h1 className="text-xl font-semibold tracking-tight text-glow-emerald">AM-Core Dashboard</h1>
              <V3InfoTip content="Каноническая база параметров, активные процессы и быстрый вход в основные режимы." />
              <Badge variant="outline">canonical V3</Badge>
            </div>
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
          <Metric label="Combinatorial Atoms" value={v3.data?.atom_count} detail={t("структурные источники")} icon={<CircleDot className="h-4 w-4" />} />
          <Metric label="Опубликованные пакеты" value={collections.data?.library_published_package_count} detail="ручное подтверждение" icon={<Sparkles className="h-4 w-4" />} />
        </div>

        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Быстрые действия</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <QuickAction title="Audio-to-Parameter" description="Сегментный анализ трека и интерполяция параметров." icon={<Activity className="h-5 w-5" />} onClick={() => onNavigate("audiotoparameter")} />
            <QuickAction title="Combinatorial Synthesis" description="Создание и ручная публикация новых параметров." icon={<Sparkles className="h-5 w-5" />} onClick={() => onNavigate("combinatorialsynthesis")} />
            <QuickAction title="Morpho-Acoustic RAG" description="Подбор параметров по изображению или спектрограмме." icon={<CircleDot className="h-5 w-5" />} onClick={() => onNavigate("morphoacousticrag")} />
          </div>
        </section>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1 text-sm">Недавняя активность<V3InfoTip content="Последние успешно завершённые процессы текущей сессии сервера." /></CardTitle>
          </CardHeader>
          <CardContent>
            {collections.data?.pipeline_last_run?.status === "completed" && (
              <div className="mb-2 flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{t("Combinatorial Genesis · inbox обработан")}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {collections.data.pipeline_last_run.version_after ?? t("версия без идентификатора")} · {t("файлов:")} {collections.data.pipeline_last_run.inbox_files?.length ?? 0}
                  </div>
                </div>
                <Badge variant="outline">completed</Badge>
              </div>
            )}
            {recentActivity.length ? <div className="divide-y divide-border">{recentActivity.map((task) => <div key={task.taskId} className="flex items-center gap-3 py-2.5"><Activity className="size-4 text-cyan-300" /><div className="min-w-0 flex-1"><div className="truncate text-sm">{t(task.title)}</div><div className="truncate text-[11px] text-muted-foreground">{t(task.lastMessage ?? task.taskType)}</div></div>{typeof task.progress === "number" ? <span className="font-mono text-xs text-muted-foreground">{task.progress}%</span> : null}<Badge variant="outline">{task.status}</Badge></div>)}</div> : <p className="py-4 text-center text-sm text-muted-foreground">{t("Завершённых процессов в текущей сессии пока нет.")}</p>}
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
      <div className="flex items-center gap-2 text-emerald-300">{icon}<V3Tooltip content={description}><span className="text-sm font-medium text-foreground">{title}</span></V3Tooltip><ArrowUpRight className="ml-auto h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100" /></div>
    </button>
  );
}
