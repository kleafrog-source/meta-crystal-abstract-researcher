"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Square, Activity } from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";

interface TasksResponse {
  ok: boolean;
  running: number;
  items: Array<{
    taskId: string;
    taskType: string;
    title: string;
    status: string;
    startedAt: string | null;
    progress: number | null;
    lastMessage: string | null;
    canStop: boolean;
  }>;
}

export function ActiveTasksPanel() {
  const { data, loading, refresh } = useFetch<TasksResponse>("/api/tasks");
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleStop = async (taskId: string) => {
    try {
      setStoppingId(taskId);
      await apiPost(`/api/tasks/stop/${taskId}`, {});
      refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tasks:refresh"));
      }
      toast({ title: "Остановка отправлена", description: taskId.slice(0, 8) });
    } catch (error) {
      toast({
        title: "Не удалось остановить задачу",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setStoppingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-emerald-400" />
            Активные задачи
            {data && <Badge variant="outline">{data.running}</Badge>}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => {
            refresh();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("tasks:refresh"));
            }
          }}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Обновить статус
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!data || data.items.length === 0 ? (
          <div className="text-xs text-muted-foreground">Список задач пуст.</div>
        ) : (
          data.items.map((item) => (
            <div key={item.taskId} className="rounded-md border border-border bg-card/40 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{item.title}</span>
                    <Badge variant="outline" className="text-[10px]">{item.taskType}</Badge>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {item.startedAt ? new Date(item.startedAt).toLocaleString("ru-RU") : "—"}
                    {item.progress != null ? ` · ${item.progress}%` : ""}
                  </div>
                  {item.lastMessage && (
                    <div className="mt-1 text-[11px] text-muted-foreground truncate">{item.lastMessage}</div>
                  )}
                </div>
                {item.canStop && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={stoppingId === item.taskId}
                    onClick={() => handleStop(item.taskId)}
                  >
                    <Square className="mr-1.5 h-3.5 w-3.5" />
                    Остановить
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "running"
      ? "text-emerald-300 border-emerald-500/30"
      : status === "done" || status === "completed"
        ? "text-cyan-300 border-cyan-500/30"
        : status === "cancelled"
          ? "text-amber-300 border-amber-500/30"
          : "text-rose-300 border-rose-500/30";
  return <Badge variant="outline" className={`text-[10px] ${tone}`}>{status}</Badge>;
}
