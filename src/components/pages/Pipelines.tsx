"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-hint";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Play,
  Trash2,
  Pencil,
  Loader2,
  Workflow,
  CheckCircle2,
  XCircle,
  Activity,
  Eye,
  Terminal,
  ChevronDown,
  ChevronRight,
  Sliders,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useFetch, apiPost, apiDelete, apiPut } from "@/hooks/use-fetch";
import type { SidecarEvent } from "@/lib/engine/runner";
import { ProfileConfigurator } from "@/components/profile/ProfileConfigurator";
import { ProfileLibraryBar } from "@/components/profile/ProfileLibraryBar";
import { ActiveTasksPanel } from "@/components/tasks/ActiveTasksPanel";
import {
  DEFAULT_PROFILE,
  normalizeEditableProfile,
  type EditableProfile,
  withDefaultFlags,
} from "@/lib/profile-presets";

interface PipelineListItem {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStepData[];
  profile?: EditableProfile | null;
  runsCount: number;
  createdAt: string;
  modifiedAt: string;
}

interface PipelineStepData {
  name: string;
  action: string;
  params: Record<string, unknown>;
  laws?: unknown[];
  conditions?: unknown[];
}

interface PipelinesList {
  ok: boolean;
  items: PipelineListItem[];
}

interface ProfilesList {
  ok: boolean;
  items: Array<{
    id: string;
    name: string;
    params: EditableProfile["params"];
    flags: Record<string, boolean>;
    metrics?: EditableProfile["metrics"] | null;
    customPatterns?: unknown[] | null;
    disabledPatterns?: string[] | null;
  }>;
}

interface EngineInfo {
  ok: boolean;
  engineOk: boolean;
  version: string;
  flags: string[];
  patterns?: string[];
}

const ACTION_TYPES = [
  { value: "generate", label: "Generate (генерация)" },
  { value: "filter", label: "Filter (фильтр изумрудов)" },
  { value: "catalog", label: "Catalog (каталогизация)" },
  { value: "save", label: "Save (сохранение)" },
  { value: "evolve", label: "Evolve (эволюция)" },
  { value: "transform", label: "Transform (операторы)" },
  { value: "manifest_micro_notes", label: "Manifest: micro notes" },
  { value: "manifest_manifest", label: "Manifest: manifest" },
  { value: "manifest_palette_query", label: "Manifest: palette query" },
  { value: "manifest_diffuse", label: "Manifest: diffuse" },
  { value: "manifest_embeddings_index", label: "Manifest: embeddings index" },
  { value: "manifest_isomorphisms_scan", label: "Manifest: isomorph scan" },
];

const PIPELINE_FIELD_HINTS: Record<string, string> = {
  "Batch": "Диапазон: 1-10000. Число комбинаций или объектов, которые шаг обрабатывает за проход.",
  "Top": "Диапазон: 1-1000. Сколько лучших результатов оставить после этапа отбора.",
  "Generations": "Диапазон: 1-100. Число поколений или итераций генератора на шаге.",
  "Min V": "Диапазон: 0-1. Минимальный порог метрики V для фильтрации кристаллов.",
  "Min S": "Диапазон: 0-1. Минимальный порог метрики S для фильтрации.",
  "Target": "Диапазон: 1-10000. Сколько объектов шаг должен попытаться оставить на выходе.",
  "Operators through comma": "Список операторов через запятую. Используйте ключи операторов движка, чтобы ограничить transform-шаг конкретными операциями.",
  "Crystal IDs": "Список кодов кристаллов через запятую. Используется для targeted manifestation и индексных шагов.",
  "Donor IDs": "Список донорских кристаллов через запятую для diffuse/synthesis.",
  "Temperature": "Диапазон: 0-2. Более высокое значение делает LLM-часть свободнее, но менее детерминированной.",
  "Guidance": "Диапазон: 0-1. Управляет силой направляющего сигнала при diffuse.",
  "Superposition size": "Диапазон: 1-64. Сколько кандидатов участвуют в суперпозиции перед collapse.",
  "Collapse mode": "best сохраняет лучший результат, diverse возвращает более разнообразные кандидаты, manual оставляет выбор пользователю.",
  "Threshold": "Диапазон: 0-1. Порог силы связи для поиска изоморфизмов.",
  "Limit": "Диапазон: 1-10000. Ограничивает число результатов в palette query.",
  "Micro note contains": "Фильтр по содержимому llm_micro_note. Помогает сузить palette query по текстовым признакам.",
  "Vector contains": "Фильтр по описанию vector_direction. Полезно для отбора по направлению embedding-вектора.",
  "Semantic query": "Свободный семантический запрос для palette query поверх embedding-индекса.",
  "Include isomorphs": "Если включено, manifestation учитывает найденные связи изоморфизма между кристаллами.",
  "Has micro note": "Фильтр только по кристаллам, у которых уже есть llm_micro_note.",
  "Has vector": "Фильтр только по кристаллам, у которых есть embedding/vector_direction.",
  "Include isomorphic donors": "Разрешает diffuse использовать доноров, найденных через граф изоморфизмов.",
  "Force reindex": "Полностью пересчитывает embedding-индекс для выбранных кристаллов, даже если записи уже существуют.",
};

export function Pipelines() {
  const { data, loading, refresh } = useFetch<PipelinesList>("/api/pipelines");
  const [editing, setEditing] = useState<PipelineListItem | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runTaskId, setRunTaskId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<SidecarEvent[]>([]);
  const [showLog, setShowLog] = useState(false);
  const { toast } = useToast();

  // SSE subscription for running pipeline
  useEffect(() => {
    if (!runTaskId) return;
    const es = new EventSource(`/api/generate/stream/${runTaskId}`);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as SidecarEvent;
        setRunEvents((prev) => [...prev, evt]);
        if (evt.event === "done" || evt.event === "error") {
          es.close();
          setRunningId(null);
          refresh();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("tasks:refresh"));
          }
          if (evt.event === "done") {
            toast({ title: "Пайплайн завершён" });
          }
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [runTaskId, toast, refresh]);

  const handleRun = async (id: string) => {
    try {
      setRunEvents([]);
      setShowLog(true);
      setRunningId(id);
      const r = await apiPost<{ taskId: string; runId: string }>(
        `/api/pipelines/${id}/run`,
        {},
      );
      setRunTaskId(r.taskId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tasks:refresh"));
      }
      toast({ title: "Запущен", description: `Task: ${r.taskId.slice(0, 8)}` });
    } catch (e) {
      setRunningId(null);
      toast({
        title: "Ошибка запуска",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить пайплайн?")) return;
    try {
      await apiDelete(`/api/pipelines/${id}`);
      toast({ title: "Удалено" });
      refresh();
    } catch (e) {
      toast({
        title: "Ошибка",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleAddTemplates = async () => {
    try {
      const result = await apiPost<{ created: number; names: string[] }>("/api/pipelines/templates/manifestation", {});
      refresh();
      toast({
        title: "Тестовые пайплайны добавлены",
        description: `${result.created} шт.`,
      });
    } catch (e) {
      toast({
        title: "Не удалось создать шаблоны",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-5 border-b border-border bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="text-glow-emerald">Пайплайны</span>
              {data && (
                <Badge variant="outline" className="font-mono">
                  {data.items.length}
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Конструктор последовательностей шагов для генерации и обработки
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAddTemplates}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Добавить тестовые
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Создать
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <ActiveTasksPanel />
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Workflow className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Пайплайнов пока нет</p>
              <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
                Создайте первый пайплайн или сгенерируйте его через LLM-чат
              </p>
              <Button onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Создать пайплайн
              </Button>
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl">
              {data.items.map((p) => (
                <Card key={p.id} className="hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Workflow className="h-4 w-4 text-violet-400" />
                          {p.name}
                          <Badge variant="outline" className="text-[10px]">
                            {p.steps.length} шагов
                          </Badge>
                          {p.runsCount > 0 && (
                            <Badge variant="outline" className="text-[10px] text-cyan-300 border-cyan-500/30">
                              {p.runsCount} запусков
                            </Badge>
                          )}
                        </CardTitle>
                        {p.description && (
                          <CardDescription className="text-xs mt-1">
                            {p.description}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleRun(p.id)}
                          disabled={runningId === p.id}
                        >
                          {runningId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Запустить
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1">
                      {p.steps.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border bg-card/40 text-xs"
                        >
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {i + 1}
                          </Badge>
                          <span className="font-medium">{s.name}</span>
                          <Badge variant="outline" className="text-[10px] text-cyan-300 border-cyan-500/30">
                            {s.action}
                          </Badge>
                          {Object.keys(s.params).length > 0 && (
                            <code className="text-[10px] text-muted-foreground ml-auto truncate max-w-[400px]">
                              {JSON.stringify(s.params)}
                            </code>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Log panel */}
        {showLog && (
          <div className="w-96 border-l border-border bg-card/20 flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                Лог выполнения
                {runningId && (
                  <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                )}
              </span>
              <div className="flex items-center gap-1">
                {runTaskId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await apiPost(`/api/tasks/stop/${runTaskId}`, {});
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("tasks:refresh"));
                        }
                        toast({ title: "Остановка отправлена", description: runTaskId.slice(0, 8) });
                      } catch (error) {
                        toast({
                          title: "Не удалось остановить",
                          description: (error as Error).message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Stop
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLog(false)}
                >
                  ✕
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 font-mono text-[11px] space-y-0.5 log-terminal min-h-full">
                {runEvents.length === 0 ? (
                  <div className="text-muted-foreground italic">
                    $ ожидание запуска…
                  </div>
                ) : (
                  runEvents.map((e, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">
                      {e.event === "log" && (
                        <span className={
                          e.level === "error" ? "text-rose-300" :
                          e.level === "warn" ? "text-amber-300" :
                          e.level === "success" ? "text-emerald-300" :
                          "text-cyan-300"
                        }>
                          <span className="opacity-50">[{e.ts?.slice(11, 19)}]</span>{" "}
                          {e.msg}
                        </span>
                      )}
                      {e.event === "progress" && (
                        <span className="text-violet-300">
                          <span className="opacity-50">[{e.ts?.slice(11, 19)}]</span>{" "}
                          ▸ {e.value}% — {e.step}
                        </span>
                      )}
                      {e.event === "done" && (
                        <span className="text-emerald-300 font-bold">
                          ✓✓ done
                        </span>
                      )}
                      {e.event === "error" && (
                        <span className="text-rose-300 font-bold">
                          ✗✗ {e.msg}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Editor dialog */}
      {(editing || showNew) && (
        <PipelineEditor
          pipeline={editing}
          onClose={() => {
            setEditing(null);
            setShowNew(false);
          }}
          onSaved={() => {
            setEditing(null);
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PipelineEditor({
  pipeline,
  onClose,
  onSaved,
}: {
  pipeline: PipelineListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const PROFILE_MODE = "pipeline_editor";
  const [name, setName] = useState(pipeline?.name ?? "");
  const [description, setDescription] = useState(pipeline?.description ?? "");
  const [steps, setSteps] = useState<PipelineStepData[]>(
    pipeline?.steps ?? [
      { name: "Генерация", action: "generate", params: { batch: 50, top: 3 } },
      { name: "Фильтр изумрудов", action: "filter", params: { min_v: 0.6, target: 10 } },
      { name: "Сохранение", action: "save", params: {} },
    ],
  );
  const [profile, setProfile] = useState<EditableProfile>(normalizeEditableProfile(pipeline?.profile ?? DEFAULT_PROFILE));
  const [profileName, setProfileName] = useState(pipeline?.profile?.name ?? "default");
  const [selectedProfileName, setSelectedProfileName] = useState(pipeline?.profile?.name ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { data: engineInfo } = useFetch<EngineInfo>("/api/engine");
  const { data: profilesList, refresh: refreshProfiles } = useFetch<ProfilesList>(`/api/profiles?mode=${PROFILE_MODE}`);

  useEffect(() => {
    if (engineInfo?.flags?.length) {
      setProfile((prev) => withDefaultFlags(prev, engineInfo.flags));
    }
  }, [engineInfo]);

  const addStep = () => {
    setSteps((s) => [
      ...s,
      { name: `Шаг ${s.length + 1}`, action: "generate", params: {} },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((s) => s.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, patch: Partial<PipelineStepData>) => {
    setSteps((s) => s.map((st, i) => (i === idx ? { ...st, ...patch } : st)));
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Введите имя", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { name, description, steps, profile: { ...profile, name: profileName } };
      if (pipeline) {
        await apiPut(`/api/pipelines/${pipeline.id}`, body);
      } else {
        await apiPost("/api/pipelines", body);
      }
      toast({ title: "Сохранено" });
      onSaved();
    } catch (e) {
      toast({
        title: "Ошибка сохранения",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadProfile = (value: string) => {
    const found = profilesList?.items.find((item) => item.name === value);
    if (!found) return;
    const nextProfile = normalizeEditableProfile({
      ...DEFAULT_PROFILE,
      name: found.name,
      params: found.params,
      flags: found.flags,
      metrics: found.metrics ?? DEFAULT_PROFILE.metrics,
      customPatterns: found.customPatterns ?? [],
      disabledPatterns: found.disabledPatterns ?? [],
    });
    setProfile(engineInfo?.flags?.length ? withDefaultFlags(nextProfile, engineInfo.flags) : nextProfile);
    setSelectedProfileName(found.name);
    setProfileName(found.name);
  };

  const saveProfile = async (targetName: string) => {
    const safeName = targetName.trim();
    if (!safeName) {
      toast({ title: "Укажите имя профиля", variant: "destructive" });
      return;
    }
    try {
      await apiPost("/api/profiles", {
        ...profile,
        name: safeName,
        mode: PROFILE_MODE,
        customPatterns: profile.custom_patterns,
        disabledPatterns: profile.disabled_patterns,
      });
      refreshProfiles();
      setSelectedProfileName(safeName);
      setProfileName(safeName);
      toast({ title: "Профиль сохранен", description: safeName });
    } catch (error) {
      toast({
        title: "Ошибка сохранения профиля",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileName) return;
    try {
      await apiDelete(`/api/profiles/${encodeURIComponent(selectedProfileName)}?mode=${PROFILE_MODE}`);
      refreshProfiles();
      setSelectedProfileName("");
      setProfileName("default");
      setProfile(DEFAULT_PROFILE);
      toast({ title: "Профиль удален", description: selectedProfileName });
    } catch (error) {
      toast({
        title: "Ошибка удаления профиля",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pipeline ? "Редактировать пайплайн" : "Новый пайплайн"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Имя</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Описание</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <Card className="border-violet-500/20 bg-violet-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Sliders className="h-4 w-4 text-violet-300" />Профиль генерации для пайплайна</CardTitle>
              <CardDescription>Этот профиль будет передан в LLM-builder и в runtime пайплайна без ручного JSON.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProfileLibraryBar
                title="Профили pipeline editor"
                profiles={profilesList?.items ?? []}
                selectedProfile={selectedProfileName}
                editableName={profileName}
                onEditableNameChange={setProfileName}
                onSelectProfile={handleLoadProfile}
                onSave={() => saveProfile(profileName)}
                onSaveAs={() => saveProfile(profileName.trim() || `${selectedProfileName || "pipeline"}-copy`)}
                onDelete={handleDeleteProfile}
              />
              <ProfileConfigurator
                profile={{ ...profile, name: profileName }}
                onChange={setProfile}
                engineFlags={engineInfo?.flags}
                enginePatterns={engineInfo?.patterns}
                compact
              />
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Шаги ({steps.length})</Label>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Добавить
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className="p-3 rounded border border-border bg-card/40 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {i + 1}
                    </Badge>
                    <Input
                      value={s.name}
                      onChange={(e) => updateStep(i, { name: e.target.value })}
                      className="h-7 text-xs"
                      placeholder="Имя шага"
                    />
                    <Select
                      value={s.action}
                      onValueChange={(value) =>
                        updateStep(i, { action: value, params: buildDefaultParams(value) })
                      }
                    >
                      <SelectTrigger className="h-7 w-[220px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStep(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    </Button>
                  </div>
                  <StepParamsEditor
                    action={s.action}
                    params={s.params}
                    onChange={(params) => updateStep(i, { params })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepParamsEditor({
  action,
  params,
  onChange,
}: {
  action: string;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const update = (key: string, value: unknown) => onChange({ ...params, [key]: value });

  switch (action) {
    case "generate":
    case "evolve":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <InlineNumber label="Batch" value={toNumber(params.batch, 50)} onChange={(v) => update("batch", v)} />
          <InlineNumber label="Top" value={toNumber(params.top, 3)} onChange={(v) => update("top", v)} />
          <InlineNumber label="Generations" value={toNumber(params.generations, 1)} onChange={(v) => update("generations", v)} />
        </div>
      );
    case "filter":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <InlineNumber label="Min V" value={toNumber(params.min_v, 0.6)} step="0.05" onChange={(v) => update("min_v", v)} />
          <InlineNumber label="Min S" value={toNumber(params.min_s, 0.5)} step="0.05" onChange={(v) => update("min_s", v)} />
          <InlineNumber label="Target" value={toNumber(params.target, 10)} onChange={(v) => update("target", v)} />
        </div>
      );
    case "transform":
      return (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Операторы через запятую</Label>
          <Input value={toCsv(params.operators)} onChange={(e) => update("operators", splitCsv(e.target.value))} className="h-8 text-xs font-mono" />
        </div>
      );
    case "manifest_micro_notes":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CsvField label="Crystal IDs" value={params.crystal_ids} onChange={(v) => update("crystal_ids", v)} />
          <InlineNumber label="Temperature" value={toNumber(params.temperature, 0.75)} step="0.05" onChange={(v) => update("temperature", v)} />
        </div>
      );
    case "manifest_manifest":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CsvField label="Crystal IDs" value={params.crystal_ids} onChange={(v) => update("crystal_ids", v)} />
          <InlineNumber label="Temperature" value={toNumber(params.temperature, 0.45)} step="0.05" onChange={(v) => update("temperature", v)} />
          <ToggleRow label="Include isomorphs" checked={Boolean(params.include_isomorphs)} onChange={(v) => update("include_isomorphs", v)} />
        </div>
      );
    case "manifest_palette_query":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <InlineText label="Micro note contains" value={String(params.q ?? "")} onChange={(v) => update("q", v)} />
          <InlineText label="Vector contains" value={String(params.vector ?? "")} onChange={(v) => update("vector", v)} />
          <InlineText label="Semantic query" value={String(params.semantic_query ?? "")} onChange={(v) => update("semantic_query", v)} />
          <InlineNumber label="Limit" value={toNumber(params.limit, 50)} onChange={(v) => update("limit", v)} />
          <ToggleRow label="Has micro note" checked={Boolean(params.has_micro_note)} onChange={(v) => update("has_micro_note", v)} />
          <ToggleRow label="Has vector" checked={Boolean(params.has_vector)} onChange={(v) => update("has_vector", v)} />
        </div>
      );
    case "manifest_diffuse":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CsvField label="Donor IDs" value={params.donor_ids} onChange={(v) => update("donor_ids", v)} />
          <InlineNumber label="Temperature" value={toNumber(params.temperature, 0.6)} step="0.05" onChange={(v) => update("temperature", v)} />
          <InlineNumber label="Guidance" value={toNumber(params.guidance, 0.6)} step="0.05" onChange={(v) => update("guidance", v)} />
          <InlineNumber label="Superposition size" value={toNumber(params.superposition_size, 1)} onChange={(v) => update("superposition_size", v)} />
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Collapse mode</Label>
            <Select value={String(params.collapse_mode ?? "best")} onValueChange={(v) => update("collapse_mode", v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best">best</SelectItem>
                <SelectItem value="diverse">diverse</SelectItem>
                <SelectItem value="manual">manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ToggleRow label="Include isomorphic donors" checked={Boolean(params.include_isomorphic_donors)} onChange={(v) => update("include_isomorphic_donors", v)} />
        </div>
      );
    case "manifest_embeddings_index":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CsvField label="Crystal IDs" value={params.crystal_ids} onChange={(v) => update("crystal_ids", v)} />
          <ToggleRow label="Force reindex" checked={Boolean(params.force_reindex)} onChange={(v) => update("force_reindex", v)} />
        </div>
      );
    case "manifest_isomorphisms_scan":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CsvField label="Crystal IDs" value={params.crystal_ids} onChange={(v) => update("crystal_ids", v)} />
          <InlineNumber label="Threshold" value={toNumber(params.threshold, 0.8)} step="0.05" onChange={(v) => update("threshold", v)} />
        </div>
      );
    default:
      return <div className="text-[11px] text-muted-foreground">Для этого шага дополнительные параметры не нужны.</div>;
  }
}

function buildDefaultParams(action: string) {
  switch (action) {
    case "generate":
      return { batch: 50, top: 3, generations: 1 };
    case "filter":
      return { min_v: 0.6, min_s: 0.5, target: 10 };
    case "evolve":
      return { generations: 1, batch: 50, top: 3 };
    case "transform":
      return { operators: [] };
    case "manifest_micro_notes":
      return { crystal_ids: [], temperature: 0.75 };
    case "manifest_manifest":
      return { crystal_ids: [], temperature: 0.45, include_isomorphs: false };
    case "manifest_palette_query":
      return { q: "", vector: "", semantic_query: "", has_micro_note: false, has_vector: false, limit: 50 };
    case "manifest_diffuse":
      return { donor_ids: [], temperature: 0.6, guidance: 0.6, superposition_size: 1, collapse_mode: "best", include_isomorphic_donors: false };
    case "manifest_embeddings_index":
      return { crystal_ids: [], force_reindex: false };
    case "manifest_isomorphisms_scan":
      return { crystal_ids: [], threshold: 0.8 };
    default:
      return {};
  }
}

function InlineNumber({ label, value, onChange, step = "1" }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} hint={PIPELINE_FIELD_HINTS[label]} className="text-[11px] text-muted-foreground" />
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
    </div>
  );
}

function InlineText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} hint={PIPELINE_FIELD_HINTS[label]} className="text-[11px] text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

function CsvField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string[]) => void }) {
  return <InlineText label={label} value={toCsv(value)} onChange={(v) => onChange(splitCsv(v))} />;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded border border-border bg-card/40 px-3 py-2">
      <FieldLabel label={label} hint={PIPELINE_FIELD_HINTS[label]} className="text-[11px] text-muted-foreground" />
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toCsv(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(", ") : "";
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
