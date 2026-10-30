"use client";

import { ArchiveX, MoreVertical, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { ActiveParameter, UiElement } from "@/lib/rag-v3/types";
import { cn } from "@/lib/utils";
import { useRagV3Store } from "@/store/rag-v3-store";
import { resolveDomainStyle } from "./domain-style";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";
import { ACOUSTIC_DOMAIN_LAYERS, GLOBAL_CONSENSUS_LAYER } from "@/lib/domain-layers";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";

export function ParameterControl(props: {
  param: ActiveParameter;
  index: number;
  displayMode?: "detail" | "standard" | "compact";
  onChange?: (technicalName: string, value: number | string) => void;
  onRemove?: (technicalName: string) => void;
  selected?: boolean;
  onSelect?: (technicalName: string) => void;
  useDomainLayerColors?: boolean;
  dataScope?: "am-stage";
}) {
  const storeUpdateParameterValue = useRagV3Store(
    (state) => state.updateParameterValue,
  );
  const storeRemoveParameter = useRagV3Store((state) => state.removeParameter);
  const updateParameterValue = props.onChange ?? storeUpdateParameterValue;
  const removeParameter = props.onRemove ?? storeRemoveParameter;
  const numericValue =
    typeof props.param.current_value === "number"
      ? props.param.current_value
      : Number(props.param.current_value) || 0;
  const textValue = String(props.param.current_value ?? "");
  const domainStyle = resolveDomainStyle(
    props.param.domain,
    props.param.technical_name,
  );
  const explicitLayer = (props.param as ActiveParameter & { domain_layer?: string }).domain_layer;
  const resolvedLayer = explicitLayer === GLOBAL_CONSENSUS_LAYER.id
    ? null
    : ACOUSTIC_DOMAIN_LAYERS.some((layer) => layer.id === explicitLayer)
      ? explicitLayer
      : classifyDomainLayer(props.param.technical_name, props.param.category);
  const layerColor = props.useDomainLayerColors
    ? ACOUSTIC_DOMAIN_LAYERS.find((layer) => layer.id === resolvedLayer)?.color ?? "#94a3b8"
    : domainStyle.accentColor;
  const excludeFromDatabase = async () => {
    const reason = window.prompt(
      "Причина исключения параметра из производных индексов:",
      "not sound-relevant",
    );
    if (reason === null) return;
    const response = await fetch("/api/combinatorial-genesis/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        technical_names: [props.param.technical_name],
        reason,
        scope: props.param.retrieval_scope,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      window.alert(payload.error ?? `HTTP ${response.status}`);
      return;
    }
    removeParameter(props.param.technical_name);
  };
  if (props.displayMode === "compact") {
    const min = props.param.min_value ?? 0;
    const max = props.param.max_value ?? 100;
    const step = props.param.step ?? 0.01;
    const options = props.param.options ?? [];
    const selected = options.indexOf(textValue);
    const percent = props.param.ui_element === "Select" && options.length > 1
      ? Math.max(0, selected) / (options.length - 1) * 100
      : Math.max(0, Math.min(100, (numericValue - min) / Math.max(1e-9, max - min) * 100));
    const fullInfo = [props.param.technical_name, props.param.name_ru, props.param.category, props.param.ui_element, props.param.unit, props.param.source, `default ${String(props.param.default)}`, props.param.detail].filter(Boolean).join(" · ");
    const compactControl = props.param.ui_element === "Range" ? <div className="console-knob-wrap"><div className="console-knob" style={{ "--knob-pct": `${percent}%`, "--knob-sweep": `${percent * 2.7}deg`, "--knob-rotation": `${percent * 2.7 - 135}deg`, "--domain-accent": layerColor } as React.CSSProperties} aria-hidden="true"><span /></div><input data-am-stage-fader={props.dataScope ? props.param.technical_name : undefined} aria-label={`${props.param.technical_name}: ${textValue}`} className="console-knob-input" type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, numericValue))} onChange={(event) => updateParameterValue(props.param.technical_name, roundToStep(Number(event.target.value), min, step))} /></div>
      : props.param.ui_element === "Toggle" ? <RangeControl param={props.param} value={numericValue} accentColor={props.useDomainLayerColors ? layerColor : undefined} onChange={(value) => updateParameterValue(props.param.technical_name, value)} />
      : props.param.ui_element === "Select" ? <SelectControl param={props.param} value={textValue} displayMode="standard" accentColor={props.useDomainLayerColors ? layerColor : undefined} onChange={(value) => updateParameterValue(props.param.technical_name, value)} />
      : <TextControl param={props.param} value={textValue} accentColor={props.useDomainLayerColors ? layerColor : undefined} onChange={(value) => updateParameterValue(props.param.technical_name, parseTextValue(value, props.param.ui_element))} />;
    return <div data-parameter-id={props.param.technical_name} data-am-stage-parameter={props.dataScope ? props.param.technical_name : undefined} data-am-stage-control={props.dataScope ? props.param.ui_element.toLowerCase() : undefined} onClick={(event) => { if (!(event.target as HTMLElement).closest("button,input,[role=slider]")) props.onSelect?.(props.param.technical_name); }} style={{ "--domain-accent": layerColor, ...(props.useDomainLayerColors ? { borderColor: `${layerColor}4d`, backgroundColor: "#111114" } : {}) } as React.CSSProperties} className={cn("console-control-module console-compact-card group relative aspect-square min-w-0 rounded-md border border-white/15 p-2", props.selected && "is-selected")} title={`${fullInfo} · value ${textValue}`} aria-label={`${fullInfo} · current value ${textValue}`}>
      <span className="line-clamp-3 min-h-7 break-words text-[13px] leading-4 font-semibold text-[#d2dde5]" title={props.param.technical_name}>{props.param.name_ru?.trim() || props.param.technical_name.replace(/_/g, " ")}</span>
      <div className="console-compact-control">{compactControl}</div><output style={props.useDomainLayerColors ? { color: layerColor } : undefined} className="block truncate text-center font-mono text-[10px]">{textValue}</output>
      <div className="console-compact-actions" onClick={(event) => event.stopPropagation()}><V3InfoTip content={<div className="space-y-1 text-[11px]"><b>{props.param.technical_name}</b><div>{resolveRussianDescription(props.param)}</div><div>{props.param.category} · {props.param.source}</div></div>} /><DropdownMenu><V3Tooltip content="Действия параметра"><DropdownMenuTrigger asChild><button type="button" className="console-card-action" aria-label={`Действия: ${props.param.technical_name}`}><MoreVertical className="size-3.5" /></button></DropdownMenuTrigger></V3Tooltip><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => removeParameter(props.param.technical_name)}><X className="size-3" />Убрать из панели</DropdownMenuItem><DropdownMenuItem className="text-red-300" onClick={() => void excludeFromDatabase()}><ArchiveX className="size-3" />Исключить из базы</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </div>;
  }
  return (
    <div
      data-parameter-id={props.param.technical_name}
      data-am-stage-parameter={props.dataScope ? props.param.technical_name : undefined}
      data-am-stage-control={props.dataScope ? props.param.ui_element.toLowerCase() : undefined}
      onClick={(event) => { if (!(event.target as HTMLElement).closest("button,input,[role=combobox],[role=slider]")) props.onSelect?.(props.param.technical_name); }}
      style={{ "--domain-accent": layerColor, ...(props.useDomainLayerColors ? { borderColor: `${layerColor}4d`, backgroundColor: "#111114" } : {}) } as React.CSSProperties}
      className={cn(
        "console-control-module group rounded-md border border-white/15 bg-zinc-950/90 px-2 py-2",
        props.selected && "is-selected",
        domainStyle.cardClassName.replace(/bg-[^ ]+/g, ""),
      )}
    >
      <div className="contents">
      <div className="min-w-0">
        <div className="mb-2 flex items-start justify-between gap-1">
          <span
            className={cn(
              "min-w-0 break-words text-[13px] leading-4 font-semibold tracking-tight text-[#d2dde5]",
              props.displayMode === "standard" ? "line-clamp-2" : "truncate",
            )}
          >
            {props.param.name_ru?.trim() || props.param.technical_name.replace(/_/g, " ")}
          </span>
          <div className="flex items-center gap-1">
            <V3InfoTip
              content={
                <div className="space-y-1 text-[11px]">
                  <div className="font-mono font-semibold">
                    {props.param.technical_name}
                  </div>
                  <div>{resolveRussianDescription(props.param)}</div>
                  <div className="text-muted-foreground">
                    {props.param.domain ?? "General"} | {props.param.source} |
                    sim {Math.round(props.param.similarity * 100)}%
                  </div>
                  <div className="text-muted-foreground">
                    {props.param.detail}
                  </div>
                </div>
              }
            />
            {props.param.excluded ? (
              <Badge
                variant="outline"
                className="h-4 border-amber-400/40 px-1 text-[8px] text-amber-300"
              >
                excluded
              </Badge>
            ) : null}
            <DropdownMenu>
              <V3Tooltip content="Открывает действия для этого параметра.">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-zinc-400 opacity-100 hover:text-white focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label="Parameter actions"
                  >
                    <MoreVertical className="size-3" />
                  </button>
                </DropdownMenuTrigger>
              </V3Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => removeParameter(props.param.technical_name)}
                >
                  <X className="size-3" />
                  Убрать из панели
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-300"
                  onClick={() => void excludeFromDatabase()}
                >
                  <ArchiveX className="size-3" />
                  Исключить из базы
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {props.displayMode === "detail" ? <div className="console-param-meta mb-2 text-[9px] leading-4 text-muted-foreground">
          {props.param.name_ru ? <div>{props.param.name_ru}</div> : null}
          <div>sim {Math.round(props.param.similarity * 100)}% · {props.param.category}</div>
          <div>{[props.param.ui_element, props.param.unit, props.param.source, `default ${String(props.param.default)}`, props.param.detail].filter(Boolean).join(" · ")}</div>
        </div> : null}
        {props.displayMode === "standard" ? <div className="mb-2 flex flex-wrap items-center gap-1 text-[9px] text-muted-foreground">{props.param.name_ru?.trim() ? <span>{props.param.name_ru}</span> : null}<span>sim {Math.round(props.param.similarity * 100)}%</span><span>{props.param.category}</span></div> : null}

        {props.param.ui_element === "Range" ||
        props.param.ui_element === "Toggle" ? (
          <RangeControl
            param={props.param}
            value={numericValue}
            detail={props.displayMode === "detail"}
            accentColor={layerColor}
            onChange={(value) =>
              updateParameterValue(props.param.technical_name, value)
            }
          />
        ) : null}

        {props.param.ui_element === "Select" ? (
          <SelectControl
            param={props.param}
            value={textValue}
            displayMode={props.displayMode}
            accentColor={props.useDomainLayerColors ? layerColor : undefined}
            onChange={(value) =>
              updateParameterValue(
                props.param.technical_name,
                parseTextValue(value, props.param.ui_element),
              )
            }
          />
        ) : null}

        {props.param.ui_element !== "Range" &&
        props.param.ui_element !== "Toggle" &&
        props.param.ui_element !== "Select" ? (
          <TextControl
            param={props.param}
            value={textValue}
            onChange={(value) =>
              updateParameterValue(
                props.param.technical_name,
                parseTextValue(value, props.param.ui_element),
              )
            }
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}

function RangeControl(props: {
  param: ActiveParameter;
  value: number;
  onChange: (value: number) => void;
  detail?: boolean;
  accentColor?: string;
}) {
  const min = props.param.min_value ?? 0;
  const max =
    props.param.max_value ?? (props.param.ui_element === "Toggle" ? 1 : 100);
  const step =
    props.param.step ?? (props.param.ui_element === "Toggle" ? 1 : 0.01);
  const clampedValue = clamp(roundToStep(props.value, min, step), min, max);

  if (props.param.ui_element === "Toggle") {
    return (
      <div className="flex h-[38px] items-center justify-between rounded border border-white/10 bg-black/50 px-2">
        <span className="font-mono text-[10px] text-zinc-400" style={props.accentColor ? { color: props.accentColor } : undefined}>
          {clampedValue !== 0 ? "ON" : "OFF"}
        </span>
        <V3Tooltip content="Включает или выключает логический параметр.">
        <Switch
            checked={clampedValue !== 0}
          style={props.accentColor ? { "--primary": props.accentColor, "--primary-foreground": `color-mix(in srgb, ${props.accentColor} 48%, white)`, backgroundColor: clampedValue !== 0 ? `${props.accentColor}80` : undefined, borderColor: clampedValue !== 0 ? props.accentColor : undefined } as React.CSSProperties : undefined}
            onCheckedChange={(checked) => props.onChange(checked ? 1 : 0)}
          />
        </V3Tooltip>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-500">
          {formatNumber(min, step)}
        </span>
        {props.detail ? <button type="button" aria-label={`Decrease ${props.param.technical_name}`} title="− (Shift: ×10)" onClick={(event) => props.onChange(clamp(roundToStep(clampedValue - step * (event.shiftKey ? 10 : 1), min, step), min, max))} className="rounded border border-border px-1 text-xs">−</button> : null}
        <span className="font-mono text-xs font-semibold" style={{ color: props.accentColor ?? resolveDomainStyle(props.param.domain, props.param.technical_name).accentColor }}>
          {formatNumber(clampedValue, step)}
          {props.param.unit ? ` ${props.param.unit}` : ""}
        </span>
        {props.detail ? <button type="button" aria-label={`Increase ${props.param.technical_name}`} title="+ (Shift: ×10)" onClick={(event) => props.onChange(clamp(roundToStep(clampedValue + step * (event.shiftKey ? 10 : 1), min, step), min, max))} className="rounded border border-border px-1 text-xs">+</button> : null}
        <span className="font-mono text-[9px] text-zinc-500">
          {formatNumber(max, step)}
        </span>
      </div>

      <V3Tooltip
        content={`Изменяет значение от ${formatNumber(min, step)} до ${formatNumber(max, step)} с шагом ${step}.`}
      >
        <Slider
          value={[clampedValue]}
          min={min}
          max={max}
          step={step}
          style={{ "--domain-accent": props.accentColor ?? resolveDomainStyle(props.param.domain, props.param.technical_name).accentColor } as React.CSSProperties}
          onValueChange={(values) => {
            if (values.length > 0)
              props.onChange(roundToStep(values[0], min, step));
          }}
        />
      </V3Tooltip>
      {props.detail ? <div className="text-right text-[8px] text-muted-foreground">← → / Shift ×10</div> : null}
    </div>
  );
}

function SelectControl(props: {
  param: ActiveParameter;
  value: string;
  onChange: (value: string) => void;
  displayMode?: "detail" | "standard" | "compact";
  accentColor?: string;
}) {
  const options = props.param.options ?? [];
  const safeValue =
    props.value && options.includes(props.value)
      ? props.value
      : (options[0] ?? "");

  if (props.displayMode !== "standard" && options.length > 1) {
    return <div className="flex flex-wrap gap-1">{options.map((option) => <button key={option} type="button" aria-pressed={safeValue === option} onClick={() => props.onChange(option)} style={props.accentColor ? { borderColor: safeValue === option ? props.accentColor : `${props.accentColor}65`, color: safeValue === option ? props.accentColor : undefined, backgroundColor: safeValue === option ? `${props.accentColor}20` : undefined } : undefined} className={`rounded border px-1.5 py-1 font-mono text-[9px] focus-visible:outline-2 focus-visible:outline-ring ${safeValue === option ? "border-primary/60 bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40"}`}>{option}</button>)}</div>;
  }

  return (
    <div className="space-y-1">
      <Label
        className="sr-only"
        htmlFor={`select-${props.param.technical_name}`}
      >
        {props.param.technical_name}
      </Label>
      <Select value={safeValue} onValueChange={props.onChange}>
        <V3Tooltip content="Выберите одно из допустимых значений параметра.">
          <SelectTrigger
            id={`select-${props.param.technical_name}`}
            style={props.accentColor ? { borderColor: `${props.accentColor}b3`, color: props.accentColor } : undefined}
            className="h-[38px] border-white/10 bg-black/50 font-mono text-[10px]"
          >
            <SelectValue placeholder="Select a value" />
          </SelectTrigger>
        </V3Tooltip>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextControl(props: {
  param: ActiveParameter;
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="sr-only" htmlFor={`text-${props.param.technical_name}`}>
        {props.param.technical_name}
      </Label>
      <V3Tooltip content="Введите текстовое или массивное значение параметра вручную.">
        <Input
          id={`text-${props.param.technical_name}`}
          value={props.value}
          type="text"
          placeholder={String(props.param.default)}
          minLength={props.param.min_length}
          maxLength={props.param.max_length}
          style={props.accentColor ? { borderColor: `${props.accentColor}b3`, color: props.accentColor } : undefined}
          onChange={(event) => props.onChange(event.target.value)}
          className="h-[38px] border-white/10 bg-black/50 font-mono text-[10px]"
        />
      </V3Tooltip>
    </div>
  );
}

function formatNumber(value: number, step?: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (step && step > 0 && step < 1) {
    const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
    return value.toFixed(decimals);
  }
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 1000) / 1000);
}

function parseTextValue(value: string, uiElement: UiElement): number | string {
  if (uiElement === "Array") {
    return value.trim();
  }
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return value;
}

function normalizePresetValue(
  value: number | string,
  min: number,
  max: number,
  step: number,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return roundToStep(min, min, step);
  }
  return clamp(roundToStep(numeric, min, step), min, max);
}

function randomSteppedValue(min: number, max: number, step: number): number {
  if (step <= 0) {
    return min;
  }
  const slots = Math.max(0, Math.floor((max - min) / step));
  const randomSlot = Math.floor(Math.random() * (slots + 1));
  return clamp(roundToStep(min + randomSlot * step, min, step), min, max);
}

function roundToStep(value: number, min: number, step: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }
  const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(rounded.toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveRussianDescription(param: ActiveParameter): string {
  const russianKeyword = param.semantic_keywords.find((keyword) =>
    /[А-Яа-яЁё]/.test(keyword),
  );
  if (russianKeyword) {
    return russianKeyword;
  }

  const russianDetail = /[А-Яа-яЁё]/.test(param.detail) ? param.detail : "";
  if (russianDetail) {
    return russianDetail;
  }

  const englishKeyword = param.semantic_keywords[0];
  if (englishKeyword) {
    return englishKeyword;
  }

  return "Параметр выбран через semantic retrieval и anchoring.";
}
