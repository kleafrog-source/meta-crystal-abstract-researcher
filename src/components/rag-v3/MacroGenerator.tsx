"use client";

import { useMemo, useState } from "react";
import { Copy, Download, HardDrive, Loader2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buildInstructionOutputBlock } from "@/lib/rag-v3/instruction-support";
import { buildMacroExport, DEFAULT_MACRO_EXPORT_FIELDS, MACRO_EXPORT_FIELDS, macroExtension, type MacroExportField, type MacroExportFormat } from "@/lib/rag-v3/macro-export";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { useRagV3Store } from "@/store/rag-v3-store";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";

interface AudioExportContext { originalName: string; start: number; end: number; topK: number }

export function MacroGenerator(props: { parameters?: ActiveParameter[]; audioExport?: AudioExportContext } = {}) {
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

  return <Card className="console-macro-panel h-full border border-white/75 bg-black/70">
    <CardHeader className="border-b border-white/15 px-4 py-3"><CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.12em] text-emerald-300"><WandSparkles className="size-4 text-primary" />Clean Macro Output<V3InfoTip content="Формирует готовый блок параметров из текущего Anchored control bank." /></CardTitle></CardHeader>
    <CardContent className="flex h-[calc(100%-52px)] flex-col gap-3 p-4">
      <V3Tooltip content="Генерирует macro из всех параметров и текущих ручных значений в панели.">
        <Button type="button" className="h-11 w-full rounded border border-emerald-300/50 bg-emerald-500/80 font-mono text-xs uppercase tracking-[0.12em] text-black hover:bg-emerald-400" onClick={() => void generateMacro()} disabled={!parameters.length || isGeneratingMacro}>{isGeneratingMacro ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}Generate from {parameters.length} parameters</Button>
      </V3Tooltip>
      <div className="grid grid-cols-3 gap-1">{(["short", "json", "markdown"] as const).map((item) => <V3Tooltip key={item} content={item === "short" ? "Короткий текст только с активными значениями." : item === "json" ? "Расширенный JSON с выбранными метаданными." : "Читаемый Markdown-отчёт с выбранными метаданными."}><Button type="button" size="sm" variant={format === item ? "default" : "outline"} onClick={() => setFormat(item)} className="text-[10px]">{item === "short" ? "Short Text" : item === "json" ? "Extended JSON" : "Markdown"}</Button></V3Tooltip>)}</div>
      {format !== "short" ? <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-white/10 p-2">{MACRO_EXPORT_FIELDS.map((field) => <label key={field.key} className="flex items-center gap-1.5 text-[10px] text-zinc-400"><V3Tooltip content={`Включает поле «${field.label}» в расширенный экспорт.`}><input type="checkbox" checked={fields.includes(field.key)} onChange={() => setFields((current) => current.includes(field.key) ? current.filter((key) => key !== field.key) : [...current, field.key])} /></V3Tooltip>{field.label}</label>)}</div> : null}
      <div className="grid grid-cols-2 gap-2">
        <V3Tooltip content="Копирует текущий output в буфер обмена."><Button type="button" variant="outline" className="h-9 border-white/20 bg-white/[0.06] text-[10px] uppercase" disabled={!output} onClick={async () => { try { await navigator.clipboard.writeText(output); setCopyState("done"); } catch { setCopyState("error"); } finally { window.setTimeout(() => setCopyState("idle"), 1800); } }}><Copy className="size-4" />{copyState === "done" ? "Copied" : copyState === "error" ? "Failed" : "Copy"}</Button></V3Tooltip>
        <V3Tooltip content="Скачивает output в выбранном формате."><Button type="button" variant="outline" className="h-9 border-white/20 bg-white/[0.06] text-[10px] uppercase" disabled={!output} onClick={download}><Download className="size-4" />{exportState === "done" ? "Exported" : exportState === "error" ? "Failed" : `Export .${extension}`}</Button></V3Tooltip>
      </div>
      {props.audioExport ? <V3Tooltip content="Сохраняет macro рядом с выбранным аудиофрагментом в audio_parts."><Button type="button" variant="outline" disabled={!output || serverState === "saving"} onClick={() => void saveBesideAudio()}><HardDrive className="size-4" />{serverState === "saving" ? "Сохранение..." : serverState === "idle" ? "Сохранить в audio_parts" : serverState}</Button></V3Tooltip> : null}
      <V3Tooltip content="Только для чтения: здесь отображается итоговый macro в выбранном формате."><Textarea value={output} readOnly rows={16} placeholder="Generated overrides will appear here." className="min-h-0 flex-1 resize-none border-white/15 bg-black/70 font-mono text-[11px] leading-6 text-emerald-300" /></V3Tooltip>
      {macroError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{macroError}</div> : null}
    </CardContent>
  </Card>;
}

function composeMacroOutput(macro: string, instructionSlots: ReturnType<typeof useRagV3Store.getState>["instructionSlots"]): string {
  const trimmedMacro = macro.trim(); const instructionBlock = buildInstructionOutputBlock(instructionSlots);
  return instructionBlock ? (trimmedMacro ? `${trimmedMacro}\n\n${instructionBlock}` : instructionBlock) : trimmedMacro;
}
