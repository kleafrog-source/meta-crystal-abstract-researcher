"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Loader2,
  Brain,
  Sparkles,
  Trash2,
  User,
  Bot,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Sliders,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiPost, apiDelete, useFetch } from "@/hooks/use-fetch";
import { ProfileConfigurator } from "@/components/profile/ProfileConfigurator";
import { ProfileLibraryBar } from "@/components/profile/ProfileLibraryBar";
import {
  DEFAULT_PROFILE,
  normalizeEditableProfile,
  type EditableProfile,
  withDefaultFlags,
} from "@/lib/profile-presets";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ragContext: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
}

interface ChatHistory {
  ok: boolean;
  messages: ChatMessage[];
}

interface PipelineResult {
  ok: boolean;
  pipeline: {
    id?: string;
    name: string;
    description: string;
    steps: Array<{ name: string; action: string; params: Record<string, unknown> }>;
  };
  raw: string;
  ragResults: Array<{ kind: string; name: string; score: number }>;
  provider: string;
  model: string;
  savedToDb?: boolean;
}

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
    params: EditableProfile["params"];
    flags: Record<string, boolean>;
    metrics?: EditableProfile["metrics"] | null;
    customPatterns?: unknown[] | null;
    disabledPatterns?: string[] | null;
  }>;
}

const SUGGESTED_PROMPTS = [
  "Дай интерпретацию последнего сгенерированного кристалла",
  "Собери исполнимый pipeline для поиска алмазов с высоким V и низкой энтропией",
  "Объясни, что означает метрика D_f",
  "Какие домены лучше комбинировать для квантовых кристаллов?",
  "Что такое изоморфизм в контексте Meta Crystal?",
];

export function Chat() {
  const PROFILE_MODE = "chat_pipeline";
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [lastRag, setLastRag] = useState<Array<{ kind: string; name: string; score: number }> | null>(null);
  const [showRag, setShowRag] = useState(false);
  const [genPipeline, setGenPipeline] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult["pipeline"] | null>(null);
  const [profileName, setProfileName] = useState("default");
  const [selectedProfileName, setSelectedProfileName] = useState("");
  const [pipelineProfile, setPipelineProfile] = useState<EditableProfile>(DEFAULT_PROFILE);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { data: history, refresh: refreshHistory } = useFetch<ChatHistory>("/api/llm/messages?limit=50");
  const { data: engineInfo } = useFetch<EngineInfo>("/api/engine");
  const { data: profilesList, refresh: refreshProfiles } = useFetch<ProfilesList>(`/api/profiles?mode=${PROFILE_MODE}`);

  useEffect(() => {
    if (history?.messages) setMessages(history.messages);
  }, [history]);

  useEffect(() => {
    if (engineInfo?.flags?.length) {
      setPipelineProfile((prev) => withDefaultFlags(prev, engineInfo.flags));
    }
  }, [engineInfo]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userText = input.trim();
    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now()}`;
    setInput("");
    setSending(true);
    setPipelineResult(null);

    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: "user",
        content: userText,
        ragContext: null,
        provider: null,
        model: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        ragContext: null,
        provider: null,
        model: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setStreamingId(assistantId);

    try {
      const response = await fetch("/api/llm/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userText }],
          useRAG: true,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Chat stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());

          if (payload.event === "meta") {
            setLastRag(payload.ragResults ?? []);
          } else if (payload.event === "delta") {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, content: msg.content + payload.textDelta } : msg,
              ),
            );
          } else if (payload.event === "done") {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: payload.reply,
                      ragContext: payload.ragContext ?? null,
                      provider: payload.provider ?? null,
                      model: payload.model ?? null,
                    }
                  : msg,
              ),
            );
            refreshHistory();
          } else if (payload.event === "error") {
            throw new Error(payload.error);
          }
        }
      }
    } catch (error) {
      toast({
        title: "Ошибка LLM",
        description: (error as Error).message,
        variant: "destructive",
      });
      setMessages((prev) => prev.filter((msg) => msg.id !== userId && msg.id !== assistantId));
    } finally {
      setStreamingId(null);
      setSending(false);
    }
  };

  const handleGeneratePipeline = async () => {
    if (!input.trim() || sending) return;
    const description = input.trim();
    setInput("");
    setGenPipeline(true);
    setPipelineResult(null);
    setSending(true);

    try {
      const r = await apiPost<PipelineResult>("/api/llm/generate_pipeline", {
        description,
        useRAG: true,
        saveToDb: true,
        profile: { ...pipelineProfile, name: profileName },
      });
      setPipelineResult(r.pipeline);
      setLastRag(r.ragResults);
      toast({
        title: "Pipeline создан",
        description: `"${r.pipeline.name}" · шагов: ${r.pipeline.steps.length}`,
      });
      refreshHistory();
    } catch (error) {
      toast({
        title: "Ошибка генерации pipeline",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setGenPipeline(false);
      setSending(false);
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
    setPipelineProfile(engineInfo?.flags?.length ? withDefaultFlags(nextProfile, engineInfo.flags) : nextProfile);
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
        ...pipelineProfile,
        name: safeName,
        mode: PROFILE_MODE,
        customPatterns: pipelineProfile.custom_patterns,
        disabledPatterns: pipelineProfile.disabled_patterns,
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
      setPipelineProfile(DEFAULT_PROFILE);
      toast({ title: "Профиль удален", description: selectedProfileName });
    } catch (error) {
      toast({
        title: "Ошибка удаления профиля",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const clearHistory = async () => {
    try {
      await apiDelete("/api/llm/messages");
      setMessages([]);
      setLastRag(null);
      setPipelineResult(null);
      toast({ title: "История очищена" });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="text-glow-emerald">LLM-чат</span>
              <Badge variant="outline" className="text-violet-300 border-violet-500/30 text-[10px]">
                <Brain className="h-3 w-3 mr-1" />
                RAG
              </Badge>
              <Badge variant="outline" className="text-cyan-300 border-cyan-500/30 text-[10px]">
                stream
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Чат с потоковым ответом и поиском по базе знаний</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearHistory}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Очистить
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="relative h-16 w-16 mb-4">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500/30 via-cyan-500/30 to-violet-500/30 blur-xl" />
                  <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 via-cyan-400 to-violet-500 flex items-center justify-center">
                    <Brain className="h-8 w-8 text-white" />
                  </div>
                </div>
                <h2 className="text-lg font-medium mb-2">Спросите что-нибудь о Meta Crystal</h2>
                <p className="text-sm text-muted-foreground max-w-md mb-6">Чат использует RAG и умеет отдельно собирать исполнимые pipeline.</p>
                <div className="grid grid-cols-1 gap-2 max-w-2xl">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="text-left px-3 py-2 rounded-md border border-border bg-card/40 hover:bg-accent/30 hover:border-primary/30 text-xs transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} streaming={message.id === streamingId} />
            ))}

            {pipelineResult && (
              <Card className="border-violet-500/30 bg-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-violet-300" />
                  <span className="text-sm font-medium">Сгенерированный pipeline</span>
                </div>
                <div className="space-y-2">
                  <div><span className="text-xs text-muted-foreground">Имя: </span><span className="text-sm font-medium">{pipelineResult.name}</span></div>
                  <div><span className="text-xs text-muted-foreground">Описание: </span><span className="text-sm">{pipelineResult.description}</span></div>
                  <div className="space-y-1">
                    {pipelineResult.steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-card/40 text-xs">
                        <Badge variant="outline" className="text-[10px] font-mono">{index + 1}</Badge>
                        <span className="font-medium">{step.name}</span>
                        <Badge variant="outline" className="text-[10px] text-cyan-300 border-cyan-500/30">{step.action}</Badge>
                        <code className="text-[10px] text-muted-foreground ml-auto">{JSON.stringify(step.params)}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="border-t border-border p-4 bg-card/30 backdrop-blur-sm">
            {lastRag && lastRag.length > 0 && (
              <div className="mb-2">
                <button onClick={() => setShowRag((prev) => !prev)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {showRag ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <BookOpen className="h-3 w-3" />
                  RAG: найдено {lastRag.length} сущностей
                </button>
                {showRag && (
                  <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                    {lastRag.map((item, index) => (
                      <div key={index} className="text-[10px] px-2 py-1 rounded border border-border bg-card/40 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] py-0 h-4">{item.kind}</Badge>
                        <span className="font-mono truncate">{item.name}</span>
                        <span className="ml-auto text-violet-300 font-mono">{item.score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Спросите о кристалле, метрике, pipeline... Enter — отправить, Shift+Enter — новая строка"
                className="min-h-[44px] max-h-32 resize-none font-mono text-sm"
                rows={1}
              />
              <Button
                onClick={() => setShowProfileDialog(true)}
                variant="outline"
                size="sm"
                className="h-10"
                title="Профиль ограничений для pipeline"
              >
                <Sliders className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleGeneratePipeline}
                disabled={sending || !input.trim()}
                variant="outline"
                size="sm"
                className="h-10"
                title="Собрать pipeline"
              >
                {genPipeline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
              <Button onClick={send} disabled={sending || !input.trim()} size="sm" className="h-10">
                {sending && !genPipeline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ограничения для LLM pipeline builder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ProfileLibraryBar
              title="Профили LLM pipeline builder"
              profiles={profilesList?.items ?? []}
              selectedProfile={selectedProfileName}
              editableName={profileName}
              onEditableNameChange={setProfileName}
              onSelectProfile={handleLoadProfile}
              onSave={() => saveProfile(profileName)}
              onSaveAs={() => saveProfile(profileName.trim() || `${selectedProfileName || "chat"}-copy`)}
              onDelete={handleDeleteProfile}
            />
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="outline">{Object.values(pipelineProfile.flags).filter(Boolean).length} flags</Badge>
              <Badge variant="outline">{pipelineProfile.metrics.influencing.length} влияющих метрик</Badge>
              <Badge variant="outline">{pipelineProfile.metrics.observational.length} оценочных метрик</Badge>
              <Badge variant="outline">{pipelineProfile.disabled_patterns.length} исключённых паттернов</Badge>
            </div>
            <ProfileConfigurator
              profile={{ ...pipelineProfile, name: profileName }}
              onChange={setPipelineProfile}
              engineFlags={engineInfo?.flags}
              enginePatterns={engineInfo?.patterns}
              compact
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-gradient-to-br from-cyan-500/40 to-blue-500/40" : "bg-gradient-to-br from-violet-500/40 to-emerald-500/40"}`}>
        {isUser ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div className={`flex-1 min-w-0 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        <div className={`inline-block text-left px-3 py-2 rounded-lg text-sm ${isUser ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-card border border-border"}`}>
          <pre className="whitespace-pre-wrap break-words font-sans text-foreground/90">
            {message.content || (streaming ? "..." : "")}
          </pre>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-2">
          <span>{new Date(message.createdAt).toLocaleTimeString("ru-RU")}</span>
          {message.provider && <span className="font-mono">{message.provider}/{message.model ?? "?"}</span>}
          {streaming && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
      </div>
    </div>
  );
}
