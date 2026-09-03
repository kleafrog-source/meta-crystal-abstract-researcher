"use client";

import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useRagStore } from "@/store/rag-store";

export function VectorizationDashboard() {
  const status = useRagStore((state) => state.status);
  const statusLoading = useRagStore((state) => state.statusLoading);
  const isVectorizing = useRagStore((state) => state.isVectorizing);
  const statusError = useRagStore((state) => state.statusError);
  const fetchStatus = useRagStore((state) => state.fetchStatus);
  const startVectorization = useRagStore((state) => state.startVectorization);
  const reVectorizeAll = useRagStore((state) => state.reVectorizeAll);
  const stopPolling = useRagStore((state) => state.stopPolling);

  useEffect(() => {
    void fetchStatus();
    return () => stopPolling();
  }, [fetchStatus, stopPolling]);

  const total = status?.total_parameters ?? 0;
  const vectorized = status?.vectorized_parameters ?? 0;
  const readiness = total > 0 ? Math.round((vectorized / total) * 100) : 0;
  const runProcessed = status?.processed_in_run ?? 0;
  const runTotal = status?.total_in_run ?? total;
  const runProgress =
    isVectorizing && runTotal > 0
      ? Math.round((runProcessed / runTotal) * 100)
      : readiness;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            Vectorization Dashboard
          </span>
          <Badge
            variant="outline"
            className={cn(
              status?.ollama_reachable
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            {status?.ollama_reachable ? "Ollama connected" : "Ollama required"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon={<Database className="size-3.5" />}
            label="Total"
            value={statusLoading && total === 0 ? "..." : String(total)}
          />
          <Stat
            icon={<Zap className="size-3.5" />}
            label="Vectorized"
            value={statusLoading && vectorized === 0 ? "..." : String(vectorized)}
            accent="text-emerald-300"
          />
          <Stat
            icon={<CheckCircle2 className="size-3.5" />}
            label="Ready"
            value={`${readiness}%`}
            accent={readiness === 100 ? "text-emerald-300" : undefined}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isVectorizing
                ? `Embedding rows ${runProcessed}/${runTotal}`
                : readiness === 100
                  ? "Dataset is fully vectorized"
                  : "Dataset is waiting for vectorization"}
            </span>
            <span className="font-mono">{runProgress}%</span>
          </div>
          <Progress value={runProgress} className="h-2" />
          {status?.errors_in_run ? (
            <div className="text-xs text-amber-300">
              Errors in current run: {status.errors_in_run}
            </div>
          ) : null}
        </div>

        {status?.ollama_reachable ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            Embeddings are generated through local Ollama model{" "}
            <code>qllama/bge-m3:q8_0</code>.
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                Local Ollama is required. Start `ollama serve` and pull
                `qllama/bge-m3:q8_0` before vectorization.
                {status?.last_error ? (
                  <div className="mt-1 opacity-80">Details: {status.last_error}</div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {statusError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {statusError}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => startVectorization(false)}
            disabled={isVectorizing || readiness === 100}
          >
            {isVectorizing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isVectorizing ? "Vectorizing..." : "Start vectorization"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={isVectorizing}>
                <RefreshCw className="size-4" />
                Re-vectorize all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Recompute all embeddings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This resets the vectorization status for the whole dataset and
                  recomputes every embedding through `qllama/bge-m3:q8_0`.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => reVectorizeAll()}>
                  Re-vectorize
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => fetchStatus()}
            disabled={statusLoading}
          >
            {statusLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {props.icon}
        {props.label}
      </div>
      <div className={cn("mt-1 font-mono text-lg font-semibold", props.accent)}>
        {props.value}
      </div>
    </div>
  );
}
