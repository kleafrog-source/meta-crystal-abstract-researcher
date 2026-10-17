"use client";

import { useState } from "react";

import { Chat } from "@/components/pages/Chat";
import { Crystals } from "@/components/pages/Crystals";
import { Dashboard } from "@/components/pages/Dashboard";
import { Enrichment } from "@/components/pages/Enrichment";
import { Import } from "@/components/pages/Import";
import { Pipelines } from "@/components/pages/Pipelines";
import { ArrowUpRight, Database, Download, LayoutDashboard, MessageSquare, Sparkles, Workflow } from "@/components/icons";
import type { PageId } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";

type HubView = "home" | "dashboard" | "library" | "import" | "enrichment" | "chat" | "pipelines";

export function AMCrystalHub({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [view, setView] = useState<HubView>("home");

  if (view !== "home") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border bg-card/40 px-4 py-2">
          <Button variant="outline" size="sm" onClick={() => setView("home")}>← Библиотека AM-Crystal</Button>
        </div>
        <div className="min-h-0 flex-1">
          {view === "dashboard" && <Dashboard onNavigate={onNavigate} />}
          {view === "library" && <Crystals />}
          {view === "import" && <Import />}
          {view === "enrichment" && <Enrichment />}
          {view === "chat" && <Chat />}
          {view === "pipelines" && <Pipelines />}
        </div>
      </div>
    );
  }

  const cards: Array<{ id: HubView; title: string; description: string; icon: React.ReactNode }> = [
    { id: "dashboard", title: "Legacy Dashboard", description: "Сводка старого контура мета-кристаллов.", icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: "library", title: "Просмотр библиотеки", description: "Каталог и детали сохранённых AM-Crystal.", icon: <Database className="h-5 w-5" /> },
    { id: "import", title: "Импорт", description: "Импорт JSON с предварительным просмотром изменений.", icon: <Download className="h-5 w-5" /> },
    { id: "enrichment", title: "Обогащение", description: "Детерминированное расширение старой базы.", icon: <Sparkles className="h-5 w-5" /> },
    { id: "chat", title: "LLM-чат", description: "Локальный RAG-чат и сборка pipeline.", icon: <MessageSquare className="h-5 w-5" /> },
    { id: "pipelines", title: "Пайплайны", description: "Редактор и запуск legacy pipeline.", icon: <Workflow className="h-5 w-5" /> },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-semibold">Библиотека AM-Crystal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Архивный контур кристаллов и связанные инструменты собраны в одном месте.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <button key={card.id} onClick={() => setView(card.id)} className="group rounded-lg border border-border bg-card/50 p-4 text-left hover:border-violet-400/40 hover:bg-violet-500/5">
              <div className="flex items-center gap-2 text-violet-300">{card.icon}<span className="text-sm font-medium text-foreground">{card.title}</span><ArrowUpRight className="ml-auto h-4 w-4 opacity-40 group-hover:opacity-100" /></div>
              <p className="mt-2 text-xs text-muted-foreground">{card.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
