"use client";

import { useEffect, useState } from "react";
import { Layers, Sliders, Zap } from "@/components/icons";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import { AnchoringDashboard } from "@/components/rag-v3/AnchoringDashboard";
import { MacroGenerator } from "@/components/rag-v3/MacroGenerator";
import { SemanticSearch } from "@/components/rag-v3/SemanticSearch";
import { VirtualizedParamList } from "@/components/rag-v3/VirtualizedParamList";
import { V3InfoTip, V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { Badge } from "@/components/ui/badge";
import { useRagV3Store } from "@/store/rag-v3-store";
import { AMIcon } from "@/components/ui/am-icon";
import { AMCoreLogo } from "@/components/ui/am-core-logo";
import { ServiceBayIndexControls } from "@/components/rag-v3/ServiceBayIndexControls";
import { useUiText } from "@/lib/ui-i18n";

export function RagParametersV3Page() {
  const t = useUiText();
  const statusModel = useRagV3Store((state) => state.status?.ollama_model);
  const activeParameters = useRagV3Store((state) => state.activeParameters);
  const query = useRagV3Store((state) => state.query);
  const topK = useRagV3Store((state) => state.topK);
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"detail" | "standard" | "compact">("detail");
  const [selectedParameterName, setSelectedParameterName] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<"card" | "macro">("card");
  const [serviceBayOpen, setServiceBayOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("am-core-card-mode");
      // Restore the client-only preference after hydration to keep server markup deterministic.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "detail" || saved === "standard" || saved === "compact") setDisplayMode(saved);
    } catch {}
  }, []);
  const chooseDisplayMode = (mode: "detail" | "standard" | "compact") => {
    setDisplayMode(mode);
    try { localStorage.setItem("am-core-card-mode", mode); } catch {}
  };

  useEffect(() => {
    let disposed = false;
    void fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ llm?: { embedModel?: string } }>)
      .then((payload) => {
        if (!disposed && payload.llm?.embedModel) setConfiguredModel(payload.llm.embedModel);
      })
      .catch(() => {});
    return () => { disposed = true; };
  }, []);

  const model = configuredModel ?? statusModel;

  useEffect(() => { if (selectionSource !== "macro" || !selectedParameterName) return; document.querySelector(`[data-parameter-id="${CSS.escape(selectedParameterName)}"]`)?.scrollIntoView({ block: "nearest" }); }, [selectedParameterName, selectionSource]);
  useEffect(() => { if (window.location.hash === "#service-bay") { document.getElementById("service-bay")?.setAttribute("open", ""); setServiceBayOpen(true); } }, []);

  return (
    <div className="flowmusic-console flex h-full flex-col">
      <header className="border-b border-white/15 bg-black/70 px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight text-white sm:text-lg">
              <AMCoreLogo className="!h-12 !w-12" label="AM-Core" />
              <span className="text-sm font-semibold">Abstract-Mindfreak</span>
              <V3Tooltip content="Активная embedding-модель из общих настроек приложения.">
                <span className="rounded border border-fuchsia-400/70 bg-fuchsia-950/40 px-2 py-1 text-[10px] tracking-wide text-fuchsia-200">
                  {model ?? "embedding model"} console
                </span>
              </V3Tooltip>
              <span className="max-w-full rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs leading-relaxed text-primary sm:text-sm">AM-Core · Unified Parameter Synthesizer</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <V3Tooltip content="Поиск ограничивается выбранными источниками и retrieval scope.">
              <Badge variant="outline" className="console-status-badge"><Layers className="mr-1 size-3" />scoped retrieval</Badge>
            </V3Tooltip>
            <V3Tooltip content="V3 объединяет библиотеку, корпус Flowmusic, атомы и опубликованные комбинации.">
              <Badge variant="outline" className="console-status-badge"><Zap className="mr-1 size-3" />library + corpus + atoms</Badge>
            </V3Tooltip>
            <V3Tooltip content="Найденные параметры доступны для ручной настройки перед генерацией macro.">
              <Badge variant="outline" className="console-status-badge"><Sliders className="mr-1 size-3" />live controls</Badge>
            </V3Tooltip>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="console-engine-layout">
          <div className="console-engine-left flex min-w-0 flex-col gap-3">
          <details id="service-bay" onToggle={(event) => setServiceBayOpen(event.currentTarget.open)} className="console-service-drawer rounded border border-white/20 bg-black/50">
            <V3Tooltip content="Открывает служебную панель состояния и управляемой перестройки индексов V3.">
              <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                Service bay: anchoring status, index and live anchors
              </summary>
            </V3Tooltip>
            <div className="border-t border-white/15 p-2">
              {serviceBayOpen ? <><ServiceBayIndexControls /><AnchoringDashboard /></> : null}
            </div>
          </details>
          <SemanticSearch />

          <section className="console-bank flex min-h-0 flex-col">
              <div className="console-bank-header flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-white">
                  <AMIcon name="engine" size="sm" bright />
                  Anchored control bank
                  <V3InfoTip content="Здесь отображаются параметры, отобранные текущим запросом. Значения можно корректировать вручную." />
                </h2>
                <div className="flex items-center gap-1" role="group" aria-label="Card display mode">{([ ["detail", "Подробно"], ["standard", "Обычный"], ["compact", "Компактно"] ] as const).map(([mode, title]) => <button key={mode} type="button" aria-pressed={displayMode === mode} title={t(title)} onClick={() => chooseDisplayMode(mode)} className="console-mode-button">{t(title)}</button>)}</div>
              </div>
              <VirtualizedParamList className="min-h-0 flex-1" displayMode={displayMode} selectedParameterName={selectedParameterName} onSelectParameter={(name) => { setSelectedParameterName(name); setSelectionSource("card"); }} />
              <div className="border-t border-white/10 p-2"><JournalDraftButton modality="text" engine="semantic-v3" parameters={activeParameters} model={{ id: model ?? "unknown" }} settings={{ top_k: topK }} query={query} label={`Semantic V3 · ${query.slice(0, 96) || "query"}`} /></div>
          </section>
          </div>
            <aside id="sidePanel" className="min-h-0">
              <MacroGenerator selectedParameterName={selectedParameterName} selectionSource={selectionSource} onSelectParameter={(name) => { setSelectedParameterName(name); setSelectionSource("macro"); }} />
            </aside>
        </div>
        <button type="button" className="console-mobile-macro-fab" aria-label={t("Перейти к Clean Macro Output")} onClick={() => document.getElementById("sidePanel")?.scrollIntoView({ behavior: "smooth", block: "start" })}><AMIcon name="macro" size="md" bright /><span>Macro</span></button>
      </div>
    </div>
  );
}

