"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRagStore } from "@/store/rag-store";

/** Vectorization control panel.
 *
 *  Shows the dataset/vectorization statistics ("Total / Vectorized /
 *  Readiness %"), a button to start vectorization, and a (confirmed)
 *  button to fully re-vectorize the dataset. Polls the status endpoint
 *  while a background job is running to drive the live progress bar.
 */
export function VectorizationDashboard() {
  const status = useRagStore((s) => s.status);
  const statusLoading = useRagStore((s) => s.statusLoading);
  const isVectorizing = useRagStore((s) => s.isVectorizing);
  const statusError = useRagStore((s) => s.statusError);
  const fetchStatus = useRagStore((s) => s.fetchStatus);
  const startVectorization = useRagStore((s) => s.startVectorization);
  const reVectorizeAll = useRagStore((s) => s.reVectorizeAll);
  const stopPolling = useRagStore((s) => s.stopPolling);

  // Initial status fetch + cleanup of the poller on unmount.
  React.useEffect(() => {
    void fetchStatus();
    return () => stopPolling();
  }, [fetchStatus, stopPolling]);

  const total = status?.total_parameters ?? 0;
  const vectorized = status?.vectorized_parameters ?? 0;
  const readiness =
    total > 0 ? Math.round((vectorized / total) * 100) : 0;
  const isReady = status?.is_ready ?? false;

  // Progress within the current run (if running), else fall back to the
  // overall readiness so the bar is never empty.
  const runProcessed = status?.processed_in_run ?? 0;
  const runTotal = status?.total_in_run ?? total;
  const runProgress =
    isVectorizing && runTotal > 0
      ? Math.round((runProcessed / runTotal) * 100)
      : readiness;

  const ollamaReachable = status?.ollama_reachable ?? false;
  const usedFallback = status?.used_fallback ?? false;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-base">
            <Cpu className="size-4 text-primary" />
            Панель векторизации
          </span>
          <div className="flex items-center gap-1.5">
            <EngineBadge ollamaReachable={ollamaReachable} usedFallback={usedFallback} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
          <Stat
            icon={<Database className="size-3.5" />}
            label="Всего параметров"
            value={statusLoading && total === 0 ? "—" : String(total)}
          />
          <Stat
            icon={<Zap className="size-3.5" />}
            label="Векторизовано"
            value={statusLoading && vectorized === 0 ? "—" : String(vectorized)}
            accent="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            icon={<Activity className="size-3.5" />}
            label="Готовность"
            value={`${readiness}%`}
            accent={isReady ? "text-emerald-600 dark:text-emerald-400" : undefined}
          />
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {isVectorizing
                ? `Векторизация… ${runProcessed}/${runTotal}`
                : isReady
                  ? "Готово к семантическому поиску"
                  : vectorized > 0
                    ? "Частично векторизовано"
                    : "Датасет не векторизован"}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {runProgress}%
            </span>
          </div>
          <Progress value={runProgress} className="h-2" />
          {isVectorizing && status?.errors_in_run > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              ошибок в текущем проходе: {status.errors_in_run}
            </div>
          )}
        </div>

        {/* Engine status / errors */}
        {!ollamaReachable && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div className="space-y-0.5">
                <div className="font-medium">
                  Ollama недоступен — используется детерминированный fallback.
                </div>
                <div className="opacity-80">
                  Запустите{" "}
                  <code className="rounded bg-amber-500/20 px-1">ollama serve</code>{" "}
                  и модель{" "}
                  <code className="rounded bg-amber-500/20 px-1">bge-m3:q8_0</code>{" "}
                  (<code className="rounded bg-amber-500/20 px-1">ollama pull bge-m3</code>),
                  чтобы получить настоящие эмбеддинги.
                </div>
                {status?.last_error && (
                  <div className="opacity-70">
                    Деталь: {status.last_error}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {ollamaReachable && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Ollama подключена — эмбеддинги считает модель{" "}
            <code className="rounded bg-emerald-500/20 px-1">bge-m3:q8_0</code>.
          </div>
        )}
        {statusError && !status?.last_error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {statusError}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => startVectorization(false)}
            disabled={isVectorizing || isReady}
            size="sm"
          >
            {isVectorizing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isReady ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isVectorizing
              ? "Векторизация…"
              : isReady
                ? "Уже векторизовано"
                : "Запустить векторизацию"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isVectorizing}
              >
                <RefreshCw className="size-4" />
                Перевекторизовать всё
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Перевекторизовать весь датасет?</AlertDialogTitle>
                <AlertDialogDescription>
                  Это сбросит статусы векторизации всех {total} параметров и
                  пересчитает эмбеддинги заново через{" "}
                  <code className="rounded bg-muted px-1">bge-m3:q8_0</code>.
                  Операция может занять несколько минут при реальной Ollama.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => reVectorizeAll()}
                  className="bg-primary text-primary-foreground"
                >
                  Да, перевекторизовать
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fetchStatus()}
            disabled={statusLoading}
          >
            {statusLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Обновить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EngineBadge({
  ollamaReachable,
  usedFallback,
}: {
  ollamaReachable: boolean;
  usedFallback: boolean;
}) {
  if (ollamaReachable) {
    return (
      <Badge className="border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
        <span className="mr-1 size-1.5 rounded-full bg-emerald-500" />
        Ollama
      </Badge>
    );
  }
  if (usedFallback) {
    return (
      <Badge className="border-amber-500/40 bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-300">
        <span className="mr-1 size-1.5 rounded-full bg-amber-500" />
        Fallback
      </Badge>
    );
  }
  return (
    <Badge className="border-border bg-muted text-[10px] text-muted-foreground">
      <span className="mr-1 size-1.5 rounded-full bg-muted-foreground/50" />
      Idle
    </Badge>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          accent ?? "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
