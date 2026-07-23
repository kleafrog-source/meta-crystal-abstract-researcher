"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Layers,
  Loader2,
  Play,
  Save,
  Sliders,
  Square,
  Terminal,
} from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import type { SidecarEvent } from "@/lib/engine/runner";
import { ProfileConfigurator } from "@/components/profile/ProfileConfigurator";
import { DEFAULT_PROFILE, type EditableProfile, withDefaultFlags } from "@/lib/profile-presets";
import type { Profile } from "@/types";

interface EngineInfo {
  ok: boolean;
  engineOk: boolean;
  version: string;
  flags: string[];
  patterns?: string[];
}

interface ProfilesList {
  ok: boolean;
  items: Array<{
    id: string;
    name: string;
    params: Profile["params"];
    flags: Record<string, boolean>;
    metrics?: Profile["metrics"] | null;
    customPatterns?: unknown[] | null;
    disabledPatterns?: string[] | null;
  }>;
}

export function Generation() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [profileName, setProfileName] = useState("default");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<"idle" | "running" | "done" | "failed" | "cancelled">("idle");
  const [events, setEvents] = useState<SidecarEvent[]>([]);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("params");

  const { toast } = useToast();
  const { data: engineInfo } = useFetch<EngineInfo>("/api/engine");
  const { data: profilesList, refresh: refreshProfiles } = useFetch<ProfilesList>("/api/profiles");

  useEffect(() => {
    if (engineInfo?.engineOk && engineInfo.flags?.length) {
      setProfile((prev) => withDefaultFlags(prev, engineInfo.flags));
    }
  }, [engineInfo, profile.flags]);
  useEffect(() => {
    if (!taskId) return;
    const es = new EventSource(`/api/generate/stream/${taskId}`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as SidecarEvent;
        setEvents((prev) => [...prev, payload]);
        if (payload.event === "progress" && typeof payload.value === "number") {
          setProgress(payload.value);
        }
        if (payload.event === "done") {
          setTaskStatus("done");
          setProgress(100);
          es.close();
          toast({ title: "Генерация завершена" });
        }
        if (payload.event === "error") {
          setTaskStatus("failed");
          es.close();
          toast({ title: "Ошибка генерации", description: payload.msg, variant: "destructive" });
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [taskId, toast]);


  const handleStart = async () => {
    try {
      setEvents([]);
      setProgress(0);
      setTaskStatus("running");
      setActiveTab("log");
      const result = await apiPost<{ taskId: string }>("/api/generate/start", {
        ...profile,
        name: profileName,
        disabled_patterns: profile.disabled_patterns,
      });
      setTaskId(result.taskId);
    } catch (error) {
      setTaskStatus("failed");
      toast({ title: "Не удалось запустить", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleStop = async () => {
    if (!taskId) return;
    try {
      await apiPost(`/api/generate/stop/${taskId}`, {});
      setTaskStatus("cancelled");
    } catch (error) {
      toast({ title: "Не удалось остановить", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleSaveProfile = async () => {
    try {
      await apiPost("/api/profiles", {
        ...profile,
        name: profileName,
        customPatterns: profile.custom_patterns,
        disabledPatterns: profile.disabled_patterns,
      });
      refreshProfiles();
      toast({ title: "Профиль сохранен", description: profileName });
    } catch (error) {
      toast({ title: "Ошибка сохранения", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleLoadProfile = (name: string) => {
    const found = profilesList?.items.find((item) => item.name === name);
    if (!found) return;
    const nextProfile: EditableProfile = {
      ...DEFAULT_PROFILE,
      name: found.name,
      params: { ...DEFAULT_PROFILE.params, ...found.params },
      flags: found.flags ?? {},
      metrics: found.metrics ?? DEFAULT_PROFILE.metrics,
      custom_patterns: found.customPatterns ?? [],
      disabled_patterns: found.disabledPatterns ?? [],
    };
    setProfile(engineInfo?.flags?.length ? withDefaultFlags(nextProfile, engineInfo.flags) : nextProfile);
    setProfileName(found.name);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">Генерация</span>
              {taskStatus === "running" && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />выполняется</Badge>}
              {taskStatus === "done" && <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />завершено</Badge>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Профиль генерации с группами доменов, ролями метрик и паттернами.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={profileName} onValueChange={handleLoadProfile}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Профиль" /></SelectTrigger>
              <SelectContent>
                {profilesList?.items.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleSaveProfile}><Save className="mr-1.5 h-3.5 w-3.5" />Сохранить</Button>
            {taskStatus === "running" ? (
              <Button variant="destructive" size="sm" onClick={handleStop}><Square className="mr-1.5 h-3.5 w-3.5" />Остановить</Button>
            ) : (
              <Button size="sm" onClick={handleStart}><Play className="mr-1.5 h-3.5 w-3.5" />Запустить</Button>
            )}
          </div>
        </div>
        {taskStatus === "running" && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Прогресс</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
          <TabsList className="mb-4 grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="params"><Sliders className="mr-1.5 h-3.5 w-3.5" />Параметры</TabsTrigger>
            <TabsTrigger value="domains"><Layers className="mr-1.5 h-3.5 w-3.5" />Домены</TabsTrigger>
            <TabsTrigger value="log"><Terminal className="mr-1.5 h-3.5 w-3.5" />Лог</TabsTrigger>
          </TabsList>

          <TabsContent value="params" className="mt-0 flex-1 overflow-y-auto">
            <ProfileConfigurator
              profile={profile}
              onChange={setProfile}
              engineFlags={engineInfo?.flags}
              enginePatterns={engineInfo?.patterns}
              sections={["params", "metrics", "patterns"]}
            />
          </TabsContent>

          <TabsContent value="domains" className="mt-0 flex-1 overflow-y-auto">
            <ProfileConfigurator
              profile={profile}
              onChange={setProfile}
              engineFlags={engineInfo?.flags}
              sections={["domains"]}
            />
          </TabsContent>

          <TabsContent value="log" className="mt-0 flex-1 overflow-hidden">
            <Card className="flex h-full flex-col">
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Terminal className="h-4 w-4 text-emerald-400" />Лог генерации</CardTitle></CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full max-h-[60vh] rounded-b-lg log-terminal">
                  <div className="space-y-0.5 p-4 font-mono text-xs">
                    {events.length === 0 ? (
                      <div className="italic text-muted-foreground">$ ожидание запуска генерации…</div>
                    ) : (
                      events.map((event, index) => <LogLine key={index} event={event} />)
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LogLine({ event }: { event: SidecarEvent }) {
  if (event.event === "log") {
    const className =
      event.level === "error"
        ? "text-rose-300"
        : event.level === "warn"
          ? "text-amber-300"
          : event.level === "success"
            ? "text-emerald-300"
            : "text-cyan-300";
    return <div className={className}><span className="opacity-50">[{event.ts?.slice(11, 19) ?? ""}]</span> {event.msg}</div>;
  }
  if (event.event === "progress") {
    return <div className="text-violet-300"><span className="opacity-50">[{event.ts?.slice(11, 19) ?? ""}]</span> {event.value}% — {event.step}</div>;
  }
  if (event.event === "done") return <div className="font-bold text-emerald-300">done</div>;
  if (event.event === "error") return <div className="font-bold text-rose-300">{event.msg}</div>;
  return null;
}
