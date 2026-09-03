"use client";

import * as React from "react";
import { Boxes, Github, Info, Layers, Sparkles, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VectorizationDashboard } from "@/components/rag/VectorizationDashboard";
import { SemanticSearch } from "@/components/rag/SemanticSearch";
import { VirtualizedParamList } from "@/components/rag/VirtualizedParamList";
import { MacroGenerator } from "@/components/rag/MacroGenerator";

const DATASET_URL =
  "https://raw.githubusercontent.com/kleafrog-source/meta-crystal-abstract-researcher/refs/heads/main/meta_lexicon/flowmusic-instructions/parameters-dataset.json";
const REPO_URL =
  "https://github.com/kleafrog-source/meta-crystal-abstract-researcher";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        {/* Intro / architecture note */}
        <section className="mb-6 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div className="space-y-1 text-sm">
              <h1 className="text-base font-semibold sm:text-lg">
                RAG Parameter UI — Embeddings-Only Semantic Search
              </h1>
              <p className="text-muted-foreground">
                Локальная RAG-система над 2.7k параметрами Flowmusic. Поиск
                работает <strong>исключительно</strong> на косинусном сходстве
                эмбеддингов модели{" "}
                <code className="rounded bg-muted px-1 text-xs">bge-m3:q8_0</code>{" "}
                через Ollama — <strong>без LLM</strong>. Значения предлагаются из
                дефолтов датасета и точатся слайдерами.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Badge variant="outline" className="text-[10px]">
                  <Layers className="mr-1 size-3" />
                  @tanstack/react-virtual
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Zap className="mr-1 size-3" />
                  cosine similarity
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Boxes className="mr-1 size-3" />
                  zustand
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Ollama · bge-m3:q8_0
                </Badge>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: vectorization + search */}
          <div className="space-y-6 lg:col-span-5">
            <VectorizationDashboard />
            <SemanticSearch />
          </div>

          {/* Right: virtualised parameter list + macro generator */}
          <div className="space-y-6 lg:col-span-7">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Layers className="size-4 text-primary" />
                  Активные параметры
                </h2>
                <span className="text-xs text-muted-foreground">
                  виртуализированный список
                </span>
              </div>
              <VirtualizedParamList />
            </section>
            <MacroGenerator />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">meta-crystal · RAG UI</span>
            <span className="text-[10px] text-muted-foreground">
              Embeddings-Only · bge-m3:q8_0
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="GitHub репозиторий"
                >
                  <Github className="size-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">meta-crystal-abstract-researcher</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={DATASET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Исходный датасет параметров"
                >
                  <Info className="size-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">parameters-dataset.json</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            <span>
              <strong className="font-medium text-foreground">RAG Parameter UI</strong>{" "}
              · local-first embeddings · cosine similarity only
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Запуск: </span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">ollama serve</code>
            <Separator orientation="vertical" className="hidden h-3 sm:block" />
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
              ollama pull bge-m3
            </code>
            <Separator orientation="vertical" className="hidden h-3 sm:block" />
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
              bun run dev
            </code>
          </div>
        </div>
      </div>
    </footer>
  );
}
