"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildInstructionOutputBlock } from "@/lib/rag-v3/instruction-support";
import { buildMacroExport, DEFAULT_MACRO_EXPORT_FIELDS, MACRO_EXPORT_FIELDS, macroExtension, type MacroExportField, type MacroExportFormat } from "@/lib/rag-v3/macro-export";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { useRagV3Store } from "@/store/rag-v3-store";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";
import { AMIcon } from "@/components/ui/am-icon";
import { resolveDomainStyle } from "./domain-style";
import { useUiText } from "@/lib/ui-i18n";

interface AudioExportContext { originalName: string; start: number; end: number; topK: number }

type SelectionSource = "card" | "macro";

export function MacroGenerator(props: { parameters?: ActiveParameter[]; audioExport?: AudioExportContext; selectedParameterName?: string | null; selectionSource?: SelectionSource; onSelectParameter?: (technicalName: string) => void; collapsible?: boolean; collapseLabel?: string; dataScope?: "am-stage" } = {}) {
  const t = useUiText();
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const [exportState, setExportState] = useState<"idle" | "done" | "error">("idle");
  const [serverState, setServerState] = useState("idle");
  const [format, setFormat] = useState<MacroExportFormat>("short");
  const [fields, setFields] = useState<MacroExportField[]>(DEFAULT_MACRO_EXPORT_FIELDS);
  const storeParameters = useRagV3Store((state) => state.activeParameters);
  const storeMacro = useRagV3Store((state) => state.macro);
  const instructionSlots = useRagV3Store((state) => state.instructionSlots);
  const storeIsGeneratingMacro = useRagV3Store((state) => state.isGeneratingMacro);
  const storeMacroError = useRagV3Store((state) => state.macroError);
  const storeGenerateMacro = useRagV3Store((state) => state.generateMacro);
  const [controlledMacro, setControlledMacro] = useState("");
  const [controlledBusy, setControlledBusy] = useState(false);
  const [controlledError, setControlledError] = useState<string | null>(null);
  const controlled = props.parameters !== undefined;
  const parameters = props.parameters ?? storeParameters;
  const isGeneratingMacro = controlled ? controlledBusy : storeIsGeneratingMacro;
  const macroError = controlled ? controlledError : storeMacroError;
  const shortOutput = controlled ? controlledMacro : composeMacroOutput(storeMacro, instructionSlots);
  const output = useMemo(() => format === "short" ? shortOutput : buildMacroExport(parameters, format, fields), [fields, format, parameters, shortOutput]);
  useEffect(() => { if (props.selectionSource !== "card" || !props.selectedParameterName) return; document.querySelector(`[data-macro-parameter="${CSS.escape(props.selectedParameterName)}"]`)?.scrollIntoView({ block: "nearest" }); }, [props.selectedParameterName, props.selectionSource, output]);

  const generateMacro = async () => {
    if (!controlled) { await storeGenerateMacro(); return; }
    setControlledBusy(true); setControlledError(null);
    try {
      const response = await fetch("/api/rag-v3/generate-macro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameters: parameters.map(({ technical_name, current_value }) => ({ technical_name, current_value })) }) });
      const payload = await response.json() as { macro?: string; error?: string };
      if (!response.ok || typeof payload.macro !== "string") throw new Error(payload.error ?? `HTTP ${response.status}`);
      setControlledMacro(payload.macro);
    } catch (error) { setControlledError(error instanceof Error ? error.message : String(error)); } finally { setControlledBusy(false); }
  };

  const extension = macroExtension(format);
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([output], { type: format === "json" ? "application/json" : "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `rag-v3-macro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${extension}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); setExportState("done");
    } catch { setExportState("error"); } finally { window.setTimeout(() => setExportState("idle"), 1800); }
  };

  const saveBesideAudio = async () => {
    if (!props.audioExport || !output) return;
    setServerState("saving");
    try {
      const response = await fetch("/api/audio/save-macro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...props.audioExport, content: output, extension, format }) });
      const payload = await response.json() as { filename?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setServerState(payload.filename ?? "saved");
    } catch (error) { setServerState(error instanceof Error ? error.message : "error"); }
  };

  const card = <Card className="console-macro-panel h-full border border-border bg-black/70">
    {!props.collapsible ? <CardHeader className="border-b border-white/15 px-4 py-3"><CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.12em] text-primary"><AMIcon name="macro" size="md" bright />{t("Clean Macro Output")}<V3InfoTip content={t("Формирует готовый блок параметров из текущего Anchored control bank.")} /></CardTitle></CardHeader> : null}
    <CardContent className={props.collapsible ? "flex min-h-[280px] flex-col gap-3 p-3" : "flex h-[calc(100%-52px)] flex-col gap-3 p-4"}>
      <V3Tooltip content={t("Генерирует макрос из всех параметров и текущих ручных значений в панели.")}>
        <Button type="button" data-am-stage-action={props.dataScope ? `macro-generate-${props.collapseLabel?.startsWith("TEXT") ? "text" : "audio"}` : undefined} className="macro-generate-button am-icon-button h-11 w-full rounded font-mono text-xs uppercase tracking-[0.12em]" onClick={() => void generateMacro()} disabled={!parameters.length || isGeneratingMacro}>{isGeneratingMacro ? <Loader2 className="size-4 animate-spin" /> : <AMIcon name="generate" bright />}{t("Generate from")} {parameters.length} {t("parameters")}</Button>
      </V3Tooltip>
      <div className="grid grid-cols-3 gap-1">{(["short", "json", "markdown"] as const).map((item) => <V3Tooltip key={item} content={t(item === "short" ? "Короткий текст только с активными значениями." : item === "json" ? "Расширенный JSON с выбранными метаданными." : "Читаемый Markdown-отчёт с выбранными метаданными.")}><Button type="button" size="sm" variant={format === item ? "default" : "outline"} aria-pressed={format === item} onClick={() => setFormat(item)} className="macro-format-tab">{t(item === "short" ? "Short Text" : item === "json" ? "Extended JSON" : "Markdown")}</Button></V3Tooltip>)}</div>
      {format !== "short" ? <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-white/10 p-2">{MACRO_EXPORT_FIELDS.map((field) => <label key={field.key} className="flex items-center gap-1.5 text-[10px] text-zinc-400"><V3Tooltip content={`Включает поле «${field.label}» в расширенный экспорт.`}><input type="checkbox" checked={fields.includes(field.key)} onChange={() => setFields((current) => current.includes(field.key) ? current.filter((key) => key !== field.key) : [...current, field.key])} /></V3Tooltip>{field.label}</label>)}</div> : null}
      <div className="grid grid-cols-2 gap-2">
        <V3Tooltip content={t("Копирует чистый текст макроса в буфер обмена.")}><Button type="button" variant="outline" className="macro-action-button am-icon-button h-9 text-[10px] uppercase" disabled={!output} onClick={async () => { try { await navigator.clipboard.writeText(output); setCopyState("done"); } catch { setCopyState("error"); } finally { window.setTimeout(() => setCopyState("idle"), 1800); } }}><AMIcon name="copy" size="sm" />{t(copyState === "done" ? "Copied" : copyState === "error" ? "Failed" : "Copy")}</Button></V3Tooltip>
        <V3Tooltip content={t("Скачивает чистый текст output в выбранном формате.")}><Button type="button" variant="outline" className="macro-action-button am-icon-button h-9 text-[10px] uppercase" disabled={!output} onClick={download}><AMIcon name="export" size="sm" />{exportState === "done" ? t("Exported") : exportState === "error" ? t("Failed") : `${t("Export")} .${extension}`}</Button></V3Tooltip>
      </div>
      {props.audioExport ? <V3Tooltip content={t("Сохраняет macro рядом с выбранным аудиофрагментом в audio_parts.")}><Button type="button" variant="outline" disabled={!output || serverState === "saving"} onClick={() => void saveBesideAudio()}><HardDrive className="size-4" />{serverState === "saving" ? t("Сохранение...") : serverState === "idle" ? t("Сохранить в audio_parts") : serverState}</Button></V3Tooltip> : null}
      <V3Tooltip content={t("Цвета показывают известные параметры и их категории; копирование и экспорт используют исходный чистый текст.")}><pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded border border-white/15 bg-black/70 p-2 font-mono text-[11px] leading-6" aria-label={t("Clean macro output")}>{renderColoredMacro(output, parameters, props.selectedParameterName, props.onSelectParameter)}</pre></V3Tooltip>
      {macroError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{macroError}</div> : null}
    </CardContent>
  </Card>;
  return props.collapsible ? <details open data-am-stage-disclosure={props.dataScope ? `macro-${props.collapseLabel?.startsWith("TEXT") ? "text" : "audio"}` : undefined} className="min-w-0 rounded-lg border border-border bg-black/50 p-2"><summary className="flex list-none cursor-pointer items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary [&::-webkit-details-marker]:hidden"><AMIcon name="macro" size="sm" bright />{t("Clean Macro Output")} · {props.collapseLabel ?? `${parameters.length} ${t("parameters")}`}<ChevronDown className="am-stage-disclosure-chevron size-3.5" /></summary><div className="mt-2">{card}</div></details> : card;
}

function renderColoredMacro(output: string, parameters: ActiveParameter[], selected?: string | null, onSelect?: (technicalName: string) => void) {
  const known = new Map(parameters.map((parameter) => [parameter.technical_name, resolveDomainStyle(parameter.domain, parameter.technical_name).accentClassName]));
  return output.split("\n").map((line, index) => {
    const separator = line.indexOf(":");
    const name = separator >= 0 ? line.slice(0, separator).trim().replace(/^\"|\"$/g, "") : "";
    const valueClass = known.get(name);
    const interactive = valueClass && onSelect; const selectedClass = name === selected ? " bg-primary/25 rounded-sm" : "";
    return <span key={`${index}-${line}`} data-macro-parameter={valueClass ? name : undefined}>{separator < 0 ? line : <><span role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-pressed={interactive ? name === selected : undefined} onClick={interactive ? () => onSelect(name) : undefined} onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(name); } } : undefined} className={`${valueClass ?? "text-muted-foreground"}${selectedClass}${interactive ? " cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" : ""}`}>{line.slice(0, separator)}</span><span className="text-foreground">:</span><span className={valueClass ? "text-foreground" : "text-muted-foreground"}>{line.slice(separator + 1)}</span></>}{index < output.split("\n").length - 1 ? "\n" : ""}</span>;
  });
}

function composeMacroOutput(macro: string, instructionSlots: ReturnType<typeof useRagV3Store.getState>["instructionSlots"]): string {
  const trimmedMacro = macro.trim(); const instructionBlock = buildInstructionOutputBlock(instructionSlots);
  return instructionBlock ? (trimmedMacro ? `${trimmedMacro}\n\n${instructionBlock}` : instructionBlock) : trimmedMacro;
}
