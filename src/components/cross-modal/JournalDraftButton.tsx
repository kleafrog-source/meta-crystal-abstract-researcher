"use client";

import { useState } from "react";
import { Archive, Loader2 } from "lucide-react";

import { V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { useUiText } from "@/lib/ui-i18n";
import { Button } from "@/components/ui/button";
import type { CrossModalEngine, CrossModalModality } from "@/lib/cross-modal/types";
import type { ActiveParameter } from "@/lib/rag-v3/types";

export function JournalDraftButton(props: { modality: CrossModalModality; engine: CrossModalEngine; parameters: ActiveParameter[]; model: { id: string; revision?: string; dimensions?: number }; settings?: Record<string, string | number | boolean>; query?: string; asset?: File | null; label?: string; actionLabel?: string; className?: string; onSaved?: (message: string) => void }) {
  const t = useUiText();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const save = async () => { setBusy(true); setMessage(""); try { const form = new FormData(); form.append("metadata", JSON.stringify({ modality: props.modality, engine: props.engine, parameters: props.parameters, model: props.model, settings: props.settings ?? {}, query: props.query, label: props.label })); if (props.asset) form.append("asset", props.asset, props.asset.name); const response = await fetch("/api/cross-modal/journal", { method: "POST", body: form }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`); const text = payload.existed ? "Такая запись уже есть в Journal." : "Черновик сохранён в Journal."; setMessage(text); props.onSaved?.(text); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  return <div className={props.className}><V3Tooltip content={t("Сохраняет текущую выборку и media asset как неизменяемый черновик. Reverse Query и верификация выполняются на следующем этапе.")}><Button type="button" size="sm" variant="outline" onClick={() => void save()} disabled={busy || !props.parameters.length || ((props.modality === "audio" || props.modality === "image") && !props.asset)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}{t(props.actionLabel ?? "Сохранить в Journal")}</Button></V3Tooltip>{message ? <div className="mt-1 max-w-72 text-[10px] text-cyan-200">{message}</div> : null}</div>;
}
