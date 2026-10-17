"use client";

import { useState, useEffect } from "react";
import {
  Gem,
  FlaskConical,
  Workflow,
  Library,
  Sparkles,
  Brain,
  Settings,
  LayoutDashboard,
  Cpu,
  Activity,
  Database,
  CircleDot,
  Sliders,
  Search,
  BookOpen,
  ChevronLeft,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { SidebarSpoiler } from "./SidebarSpoiler";

export type PageId =
  | "dashboard"
  | "generation"
  | "pipelines"
  | "crystals"
  | "import"
  | "enrichment"
  | "chat"
  | "semanticplane"
  | "mmss"
  | "metis"
  | "metisresearch"
  | "gwcollapser"
  | "crystalpool"
  | "torusatlas"
  | "map"
  | "ragparametersv3"
  | "combinatorialgenesis"
  | "combinatorialsynthesis"
  | "audioclaprag"
  | "audiotoparameter"
  | "metacrystalv3lab"
  | "whitespacediscovery"
  | "knowledgegraph"
  | "morphoacousticrag"
  | "crossmodalconsensus"
  | "vocalallocationmatrix"
  | "settings";

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "AM-Core Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    description: "Статистика и последние алмазы",
  },
  {
    id: "ragparametersv3",
    label: "AM-Core Engine",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Unified semantic search over the autonomous library, Flowmusic corpus and Combinatorial Atoms",
  },
  {
    id: "combinatorialgenesis",
    label: "Combinatorial Genesis",
    icon: <FlaskConical className="h-4 w-4" />,
    description: "Изолированная лаборатория новых комбинаций без прямой записи в рабочий датасет V3",
  },
  {
    id: "combinatorialsynthesis",
    label: "Combinatorial Synthesis",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Embedding-генерация, отбор и публикация новых параметров из Combinatorial Atoms",
  },
  {
    id: "audioclaprag",
    label: "Audio CLAP RAG",
    icon: <Activity className="h-4 w-4" />,
    description: "Cross-modal search of V3 parameters from an audio reference with LAION-CLAP",
  },
  {
    id: "audiotoparameter",
    label: "Audio-to-Parameter",
    icon: <Activity className="h-4 w-4" />,
    description: "Авто-разбивка аудио по таймингам с batch поиском и интерполяцией параметров",
  },
  {
    id: "morphoacousticrag",
    label: "Morpho-Acoustic RAG",
    icon: <CircleDot className="h-4 w-4" />,
    description: "CPU-поиск параметров V3 по изображению через локальный SigLIP2",
  },
  {
    id: "vocalallocationmatrix",
    label: "AM-Vocal Morphology Matrix",
    icon: <Sliders className="h-4 w-4" />,
    description: "Целевой подбор языков, TECH4, FX4 и слоёв вокальной матрицы",
  },
  {
    id: "settings",
    label: "Настройки",
    icon: <Settings className="h-4 w-4" />,
    description: "Модели, провайдеры и параметры AM-Core",
  },
];

const LEGACY_NAV_ITEMS: NavItem[] = [
  { id: "crystals", label: "Библиотека AM-Crystal", icon: <Library className="h-4 w-4" />, description: "Архив кристаллов и связанные инструменты" },
  { id: "semanticplane", label: "Semantic Plane", icon: <Brain className="h-4 w-4" />, description: "Legacy semantic generation profiles" },
  { id: "mmss", label: "IRE", icon: <Cpu className="h-4 w-4" />, description: "Ingest · Retrain · Eval старого crystal-контура" },
  { id: "metis", label: "Metis Lab", icon: <Cpu className="h-4 w-4" />, description: "Экспериментальная среда памяти Metis" },
  { id: "metisresearch", label: "Metis Research", icon: <Database className="h-4 w-4" />, description: "Исследовательский контур Metis" },
  { id: "gwcollapser", label: "GW-Collapser", icon: <Activity className="h-4 w-4" />, description: "Torus flow analysis" },
  { id: "crystalpool", label: "GW Crystal Pool", icon: <Database className="h-4 w-4" />, description: "Пакетные операции GW-Collapser" },
  { id: "torusatlas", label: "Torus Atlas", icon: <Database className="h-4 w-4" />, description: "Legacy torus visualization" },
  { id: "map", label: "Map · Crystal UMAP", icon: <CircleDot className="h-4 w-4" />, description: "UMAP старой библиотеки кристаллов" },
  { id: "metacrystalv3lab", label: "Meta-Crystal V3 Lab", icon: <Brain className="h-4 w-4" />, description: "Мост от AM-Crystal к V3" },
  { id: "whitespacediscovery", label: "White Space Discovery", icon: <Search className="h-4 w-4" />, description: "Анализ пробелов AM-Core" },
  { id: "knowledgegraph", label: "Knowledge Graph", icon: <Workflow className="h-4 w-4" />, description: "Граф связей AM-Core" },
  { id: "crossmodalconsensus", label: "Cross-Modal Consensus", icon: <BookOpen className="h-4 w-4" />, description: "Исследовательская мультимодальная верификация" },
];

interface SidebarProps {
  active: PageId;
  onNavigate: (page: PageId) => void;
  activeRuns: number;
  onClose?: () => void;
}

export function Sidebar({ active, onNavigate, activeRuns, onClose }: SidebarProps) {
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
              Abstract-Mindfreak
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
              AM-Core · web
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          AM-Core
        </div>
        <ul className="space-y-0.5">
          {PRIMARY_NAV_ITEMS.map((item) => (
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
        <SidebarSpoiler title="Архив / Legacy & Research">
          <ul className="space-y-0.5">
            {LEGACY_NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button onClick={() => onNavigate(item.id)} className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm border transition-colors", active === item.id ? "bg-primary/15 border-primary/30 text-primary-foreground" : "border-transparent text-muted-foreground hover:bg-sidebar-accent")} title={item.description}>
                  <span className="shrink-0">{item.icon}</span><span className="flex-1 truncate text-left">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </SidebarSpoiler>
      </nav>

      {/* Status footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {onClose && <button onClick={onClose} className="mb-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent"><ChevronLeft className="h-3.5 w-3.5" />Скрыть панель</button>}
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
