"use client";

import { useState, useEffect } from "react";
import {
  Gem,
  FlaskConical,
  Workflow,
  Library,
  Download,
  Sparkles,
  MessageSquare,
  Brain,
  Settings,
  LayoutDashboard,
  CrystalIcon,
  Cpu,
  Activity,
  Database,
  CircleDot,
} from "@/components/icons";
import { cn } from "@/lib/utils";

export type PageId =
  | "dashboard"
  | "generation"
  | "pipelines"
  | "crystals"
  | "import"
  | "enrichment"
  | "chat"
  | "semanticplane"
  | "strudel"
  | "strudelflow"
  | "mmss"
  | "metis"
  | "metisresearch"
  | "gwcollapser"
  | "crystalpool"
  | "torusatlas"
  | "map"
  | "settings";

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Дашборд",
    icon: <LayoutDashboard className="h-4 w-4" />,
    description: "Статистика и последние алмазы",
  },
  {
    id: "generation",
    label: "Генерация",
    icon: <FlaskConical className="h-4 w-4" />,
    description: "Запуск генерации мета-кристаллов",
  },
  {
    id: "pipelines",
    label: "Пайплайны",
    icon: <Workflow className="h-4 w-4" />,
    description: "Конструктор и запуск пайплайнов",
  },
  {
    id: "crystals",
    label: "Библиотека",
    icon: <Library className="h-4 w-4" />,
    description: "Каталог сгенерированных кристаллов",
  },
  {
    id: "import",
    label: "Импорт",
    icon: <Download className="h-4 w-4" />,
    description: "Импорт файлов с diff-предпросмотром",
  },
  {
    id: "enrichment",
    label: "Обогащение",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Детерминированное расширение базы",
  },
  {
    id: "chat",
    label: "LLM-чат",
    icon: <MessageSquare className="h-4 w-4" />,
    description: "RAG-чат с локальной LLM",
  },
  {
    id: "semanticplane",
    label: "Semantic Plane",
    icon: <Brain className="h-4 w-4" />,
    description: "Separate semantic settings control plane over generation profiles",
  },
  {
    id: "strudel",
    label: "Strudel Lab",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Semantic Strudel parameter search and crystal-to-audio bridge",
  },
  {
    id: "strudelflow",
    label: "Strudel Flow",
    icon: <Workflow className="h-4 w-4" />,
    description: "Full upstream-style Strudel Flow editor with drag-and-drop nodes, playback, save/load and shareable project JSON",
  },
  {
    id: "mmss",
    label: "MMSS",
    icon: <Cpu className="h-4 w-4" />,
    description: "MMSS ingest, retrain, eval и результаты",
  },
  {
    id: "metis",
    label: "Metis Lab",
    icon: <Cpu className="h-4 w-4" />,
    description: "Isolated Metis memory stack with torus atlas and provider runtime switch",
  },
  {
    id: "metisresearch",
    label: "Metis Research",
    icon: <Database className="h-4 w-4" />,
    description: "Separate research workspace for candidate-pool comparison, run history and atlas-centered retrieval analysis",
  },
  {
    id: "gwcollapser",
    label: "GW-Collapser",
    icon: <Activity className="h-4 w-4" />,
    description: "Torus flow analysis over crystal semantic fragments",
  },
  {
    id: "crystalpool",
    label: "Crystal Pool",
    icon: <Database className="h-4 w-4" />,
    description: "Bulk operations and action orchestration for GW-Collapser crystal pools",
  },
  {
    id: "torusatlas",
    label: "Torus Atlas",
    icon: <Database className="h-4 w-4" />,
    description: "Canvas-first atlas view for torus placement, formulas and fast visual exploration",
  },
  {
    id: "map",
    label: "Map",
    icon: <CircleDot className="h-4 w-4" />,
    description: "2D UMAP field over crystal embeddings for neighborhood exploration",
  },
  {
    id: "settings",
    label: "Настройки",
    icon: <Settings className="h-4 w-4" />,
    description: "LLM-провайдер и параметры",
  },
];

interface SidebarProps {
  active: PageId;
  onNavigate: (page: PageId) => void;
  activeRuns: number;
}

export function Sidebar({ active, onNavigate, activeRuns }: SidebarProps) {
  const [engineOk, setEngineOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/engine")
      .then((r) => r.json())
      .then((d) => setEngineOk(!!d.ok && !!d.engineOk))
      .catch(() => setEngineOk(false));
  }, []);

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-sidebar/80 backdrop-blur-sm flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 via-cyan-400 to-purple-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Gem className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-glow-emerald">
              Мета-Кристалл
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
              v7.2 · web
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Модули
        </div>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 group",
                  active === item.id
                    ? "bg-primary/15 text-primary-foreground border border-primary/30 shadow-sm shadow-primary/10"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent",
                )}
                title={item.description}
              >
                <span
                  className={cn(
                    "shrink-0 transition-colors",
                    active === item.id
                      ? "text-primary"
                      : "text-muted-foreground/70 group-hover:text-sidebar-accent-foreground",
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.id === "generation" && activeRuns > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 animate-pulse">
                    {activeRuns}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Status footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Engine</span>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                engineOk === null
                  ? "bg-yellow-500 animate-pulse"
                  : engineOk
                    ? "bg-emerald-500"
                    : "bg-red-500",
              )}
            />
            <span className={engineOk ? "text-emerald-300" : "text-muted-foreground"}>
              {engineOk === null ? "проверка…" : engineOk ? "готов" : "недоступен"}
            </span>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground/60 px-1">
          Активных задач: <span className="text-foreground">{activeRuns}</span>
        </div>
      </div>
    </aside>
  );
}
