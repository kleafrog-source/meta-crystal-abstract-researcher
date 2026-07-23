"use client";

import { useFetch, apiPost } from "@/hooks/use-fetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Gem,
  Sparkles,
  Workflow,
  Activity,
  RefreshCw,
  Play,
  Star,
  TrendingUp,
  Database,
  Brain,
  ArrowUpRight,
} from "@/components/icons";
import { type PageId } from "@/components/layout/Sidebar";
import { useToast } from "@/hooks/use-toast";

interface DashboardData {
  ok: boolean;
  stats: {
    totalCrystals: number;
    totalEmeralds: number;
    totalDiamonds: number;
    totalFavourites: number;
    totalPipelines: number;
    activeRuns: number;
  };
  typeBreakdown: Record<string, number>;
  recentCrystals: Array<{
    id: string;
    code: string;
    type: string;
    focus: string | null;
    combination: string;
    qualityScore: number | null;
    complexity: number | null;
    counter: number;
    createdAt: string;
  }>;
  recentRuns: Array<{
    id: string;
    pipelineId: string;
    pipelineName: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  }>;
}

interface DashboardProps {
  onNavigate: (p: PageId) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { data, loading, error, refresh } = useFetch<DashboardData>("/api/dashboard");
  const { toast } = useToast();

  const handleSync = async () => {
    try {
      toast({ title: "Синхронизация…", description: "Чтение индекса кристаллов" });
      await apiPost("/api/crystals?refresh=1&page=1&pageSize=1", {});
      refresh();
      toast({ title: "Готово", description: "Индекс синхронизирован" });
    } catch (e) {
      toast({
        title: "Ошибка синхронизации",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-64 bg-muted/40 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted/30 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Ошибка загрузки</CardTitle>
            <CardDescription>{error ?? "Не удалось получить данные"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Повторить
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = data.stats;
  const topTypes = Object.entries(data.typeBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="px-6 py-5 border-b border-border bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="text-glow-emerald">Дашборд</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                v7.2
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Обзор сгенерированных кристаллов и активных пайплайнов
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Синхронизировать
            </Button>
            <Button size="sm" onClick={() => onNavigate("generation")}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Запустить генерацию
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Всего кристаллов"
            value={stats.totalCrystals}
            icon={<Database className="h-4 w-4" />}
            accent="cyan"
          />
          <StatCard
            label="Изумрудов"
            value={stats.totalEmeralds}
            icon={<Gem className="h-4 w-4" />}
            accent="emerald"
          />
          <StatCard
            label="Алмазов"
            value={stats.totalDiamonds}
            icon={<Sparkles className="h-4 w-4" />}
            accent="diamond"
          />
          <StatCard
            label="Избранное"
            value={stats.totalFavourites}
            icon={<Star className="h-4 w-4" />}
            accent="amber"
          />
          <StatCard
            label="Пайплайнов"
            value={stats.totalPipelines}
            icon={<Workflow className="h-4 w-4" />}
            accent="violet"
          />
          <StatCard
            label="Активных задач"
            value={stats.activeRuns}
            icon={<Activity className="h-4 w-4" />}
            accent={stats.activeRuns > 0 ? "emerald" : "muted"}
            pulsing={stats.activeRuns > 0}
          />
        </div>

        {/* Two columns: recent crystals + type breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent crystals */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Последние кристаллы
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate("crystals")}
                >
                  Все
                  <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentCrystals.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                  <Gem className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  Пока нет сгенерированных кристаллов.
                  <br />
                  Запустите генерацию, чтобы увидеть результаты здесь.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.recentCrystals.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onNavigate("crystals")}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/40 transition-colors text-left"
                    >
                      <CrystalTypeBadge type={c.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-foreground/90">
                            {c.code}
                          </code>
                          {c.focus && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {c.focus}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                          {c.combination.slice(0, 100)}
                        </div>
                      </div>
                      {c.qualityScore != null && (
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground">Q</div>
                          <div className="text-xs font-mono text-emerald-300">
                            {c.qualityScore.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Type breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" />
                Распределение по типам
              </CardTitle>
              <CardDescription className="text-[11px]">
                Топ-{topTypes.length} категорий
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {topTypes.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Нет данных
                </div>
              ) : (
                topTypes.map(([type, count]) => {
                  const max = topTypes[0][1];
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">{type}</span>
                        <span className="text-muted-foreground font-mono">{count}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent runs */}
        {data.recentRuns.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Workflow className="h-4 w-4 text-violet-400" />
                Последние запуски пайплайнов
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {data.recentRuns.map((r) => (
                  <div
                    key={r.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <RunStatusBadge status={r.status} />
                      <span className="text-sm truncate">{r.pipelineName}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(r.startedAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            title="Сгенерировать пайплайн"
            description="Опишите цель — LLM построит JSON-схему"
            icon={<Brain className="h-4 w-4" />}
            onClick={() => onNavigate("chat")}
          />
          <QuickAction
            title="Импорт базы знаний"
            description="Загрузите JSON с терминами и операторами"
            icon={<Database className="h-4 w-4" />}
            onClick={() => onNavigate("import")}
          />
          <QuickAction
            title="Настроить LLM"
            description="Ollama, модель, температура, top_p"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => onNavigate("settings")}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  pulsing,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: "emerald" | "diamond" | "amber" | "violet" | "cyan" | "muted";
  pulsing?: boolean;
}) {
  const colors: Record<string, string> = {
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-300",
    diamond: "from-cyan-500/10 to-cyan-500/5 border-cyan-500/20 text-cyan-300",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-300",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20 text-violet-300",
    cyan: "from-cyan-500/10 to-cyan-500/5 border-cyan-500/20 text-cyan-300",
    muted: "from-muted/40 to-muted/10 border-border text-muted-foreground",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-gradient-to-br ${colors[accent]} p-3 ${pulsing ? "animate-pulse" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest opacity-80">
          {label}
        </span>
        <span className="opacity-70">{icon}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}

function CrystalTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    ИЗУМРУД: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    АЛМАЗ: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    ПРИНЦИП: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    ГИБРИД: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    ПАРАДОКС: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    КВАНТОВЫЙ: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    ФРАКТАЛЬНЫЙ: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  };
  const cls = colors[type] ?? "bg-muted/40 text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center justify-center h-7 px-2 rounded text-[10px] font-mono font-semibold border ${cls} shrink-0`}
    >
      {type.length > 8 ? type.slice(0, 8) : type}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-emerald-500/15 text-emerald-300",
    completed: "bg-cyan-500/15 text-cyan-300",
    failed: "bg-rose-500/15 text-rose-300",
    cancelled: "bg-muted text-muted-foreground",
    pending: "bg-amber-500/15 text-amber-300",
  };
  const cls = colors[status] ?? colors.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {status}
    </span>
  );
}

function QuickAction({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-lg border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/30 transition-all group"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary group-hover:text-primary/90">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
        <ArrowUpRight className="h-3.5 w-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}
