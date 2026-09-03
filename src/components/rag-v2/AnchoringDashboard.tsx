"use client";

import { useEffect } from "react";
import { CheckCircle2, Cpu, Database, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { StatusResponse } from "@/lib/rag-v2/types";
import { cn } from "@/lib/utils";
import { useRagV2Store } from "@/store/rag-v2-store";

export function AnchoringDashboard() {
  const status = useRagV2Store((state) => state.status);
  const statusLoading = useRagV2Store((state) => state.statusLoading);
  const statusError = useRagV2Store((state) => state.statusError);
  const fetchStatus = useRagV2Store((state) => state.fetchStatus);
  const startBuildIndex = useRagV2Store((state) => state.startBuildIndex);
  const startBuildAnchors = useRagV2Store((state) => state.startBuildAnchors);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            Semantic Value Anchoring V2
          </span>
          <Badge
            variant="outline"
            className={cn(
              status?.ollama_reachable
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            {status?.ollama_reachable ? "Ollama connected" : "Ollama unavailable"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat icon={<Database className="size-3.5" />} label="Dataset" value={String(status?.total_parameters ?? 0)} />
          <Stat icon={<CheckCircle2 className="size-3.5" />} label="Artifacts" value={status?.artifacts_ready ? "ready" : "missing"} accent={status?.artifacts_ready ? "text-emerald-300" : undefined} />
          <Stat icon={<Cpu className="size-3.5" />} label="Axes" value={status?.axes_enabled ? "live" : status?.anchors_stub ? "stub" : "off"} />
          <Stat icon={<RefreshCw className="size-3.5" />} label="Index" value={status?.retrieval_index_ready ? String(status?.retrieval_index_count ?? 0) : "missing"} />
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Model: <code>{status?.ollama_model ?? "n/a"}</code>
          {" | "}
          Endpoint: <code>{status?.ollama_base_url ?? "n/a"}</code>
          {" | "}
          Retrieval index: <code>{status?.retrieval_index_generated_at ?? "n/a"}</code>
          {" | "}
          Anchors generated: <code>{status?.anchors_generated_at ?? "n/a"}</code>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Retrieval job: {status?.retrieval_job.running ? "running" : "idle"}
          {" | "}
          Anchors job: {status?.anchors_job.running ? "running" : "idle"}
        </div>

        <JobProgress title="Retrieval Index Progress" job={status?.retrieval_job} />
        <JobProgress title="Live Anchors Progress" job={status?.anchors_job} />

        {status?.anchors_stub ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <div>
                `anchors_build.json` is in stub mode, so v2 currently runs lexical anchoring only. This is valid, but axis projection is disabled until anchors are rebuilt from Ollama.
              </div>
            </div>
          </div>
        ) : null}

        {!status?.retrieval_index_ready ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Full v2 retrieval is not ready yet. Build the persistent retrieval index before searching.
          </div>
        ) : null}

        {status?.retrieval_job.last_error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Retrieval build: {status.retrieval_job.last_error}
          </div>
        ) : null}

        {status?.anchors_job.last_error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Anchors build: {status.anchors_job.last_error}
          </div>
        ) : null}

        {status?.retrieval_job.log_tail?.length ? (
          <pre className="max-h-32 overflow-auto rounded-md border border-border/60 bg-background/70 p-3 text-[10px] text-muted-foreground">
            {status.retrieval_job.log_tail.join("\n")}
          </pre>
        ) : null}

        {status?.anchors_job.log_tail?.length ? (
          <pre className="max-h-32 overflow-auto rounded-md border border-border/60 bg-background/70 p-3 text-[10px] text-muted-foreground">
            {status.anchors_job.log_tail.join("\n")}
          </pre>
        ) : null}

        {statusError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {statusError}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => startBuildIndex()}
            disabled={statusLoading || status?.retrieval_job.running}
          >
            {status?.retrieval_job.running ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            Build retrieval index
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => startBuildAnchors()}
            disabled={statusLoading || status?.anchors_job.running}
          >
            {status?.anchors_job.running ? <Loader2 className="size-4 animate-spin" /> : <Cpu className="size-4" />}
            Build live anchors
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fetchStatus()} disabled={statusLoading}>
            {statusLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat(props: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {props.icon}
        {props.label}
      </div>
      <div className={cn("mt-1 font-mono text-lg font-semibold", props.accent)}>{props.value}</div>
    </div>
  );
}

function JobProgress(props: {
  title: string;
  job:
    | StatusResponse["retrieval_job"]
    | StatusResponse["anchors_job"]
    | undefined;
}) {
  const job = props.job;
  if (!job) {
    return null;
  }

  const total = job.progress.total;
  const current = job.progress.current;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const elapsedMs =
    job.running && job.started_at > 0 ? Math.max(0, Date.now() - job.started_at) : 0;
  const remainingMs =
    job.running && current > 0 && total > current
      ? Math.round((elapsedMs / current) * (total - current))
      : 0;

  if (!job.running && total === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{props.title}</span>
        <span className="font-mono text-muted-foreground">
          {job.running ? "running" : "last snapshot"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{job.progress.label ?? job.progress.stage ?? "idle"}</span>
        <span className="font-mono">
          {current}/{total || 0} {total > 0 ? `(${percent}%)` : ""}
        </span>
      </div>
      <Progress value={percent} className="h-2" />
      <div className="text-[11px] text-muted-foreground">
        Stage: {job.progress.stage ?? "n/a"}
        {remainingMs > 0 ? ` | est. remaining: ${formatDuration(remainingMs)}` : ""}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
