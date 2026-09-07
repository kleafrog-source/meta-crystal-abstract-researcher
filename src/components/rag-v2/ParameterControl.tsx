"use client";

import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActiveParameter, UiElement } from "@/lib/rag-v2/types";
import { cn } from "@/lib/utils";
import { useRagV2Store } from "@/store/rag-v2-store";
import {
  resolveDomainStyle,
} from "./domain-style";

export function ParameterControl(props: {
  param: ActiveParameter;
  index: number;
}) {
  const updateParameterValue = useRagV2Store((state) => state.updateParameterValue);
  const removeParameter = useRagV2Store((state) => state.removeParameter);
  const numericValue =
    typeof props.param.current_value === "number"
      ? props.param.current_value
      : Number(props.param.current_value) || 0;
  const textValue = String(props.param.current_value ?? "");
  const domainStyle = resolveDomainStyle(props.param.domain, props.param.technical_name);
  return (
    <div
      className={cn(
        "console-control-module group rounded-md border border-white/15 bg-zinc-950/90 px-2 py-2",
        domainStyle.cardClassName.replace(/bg-[^ ]+/g, ""),
      )}
    >
      <TooltipProvider delayDuration={180}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className={cn("truncate font-mono text-[9px] font-semibold uppercase tracking-tight", domainStyle.accentClassName)}>
                  {props.param.technical_name.replace(/_/g, " ")}
                </span>
                <button
                  type="button"
                  className="-mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 transition-none group-hover:opacity-100 hover:text-white"
                  onClick={() => removeParameter(props.param.technical_name)}
                  aria-label="Remove parameter"
                >
                  <X className="size-3" />
                </button>
              </div>

              {props.param.ui_element === "Range" || props.param.ui_element === "Toggle" ? (
                <RangeControl
                  param={props.param}
                  value={numericValue}
                  onChange={(value) => updateParameterValue(props.param.technical_name, value)}
                />
              ) : null}

              {props.param.ui_element === "Select" ? (
                <SelectControl
                  param={props.param}
                  value={textValue}
                  onChange={(value) => updateParameterValue(props.param.technical_name, parseTextValue(value, props.param.ui_element))}
                />
              ) : null}

              {props.param.ui_element !== "Range" &&
              props.param.ui_element !== "Toggle" &&
              props.param.ui_element !== "Select" ? (
                <TextControl
                  param={props.param}
                  value={textValue}
                  onChange={(value) => updateParameterValue(props.param.technical_name, parseTextValue(value, props.param.ui_element))}
                />
              ) : null}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm whitespace-normal text-left">
            <div className="space-y-1 text-[11px]">
              <div className="font-mono font-semibold">{props.param.technical_name}</div>
              <div>{resolveRussianDescription(props.param)}</div>
              <div className="text-muted-foreground">{props.param.domain ?? "General"} | {props.param.source} | sim {Math.round(props.param.similarity * 100)}%</div>
              <div className="text-muted-foreground">{props.param.detail}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function RangeControl(props: {
  param: ActiveParameter;
  value: number;
  onChange: (value: number) => void;
}) {
  const min = props.param.min_value ?? 0;
  const max = props.param.max_value ?? (props.param.ui_element === "Toggle" ? 1 : 100);
  const step = props.param.step ?? (props.param.ui_element === "Toggle" ? 1 : 0.01);
  const clampedValue = clamp(roundToStep(props.value, min, step), min, max);

  if (props.param.ui_element === "Toggle") {
    return (
      <div className="flex h-[38px] items-center justify-between rounded border border-white/10 bg-black/50 px-2">
        <span className="font-mono text-[10px] text-zinc-400">{clampedValue !== 0 ? "ON" : "OFF"}</span>
        <Switch checked={clampedValue !== 0} onCheckedChange={(checked) => props.onChange(checked ? 1 : 0)} />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-500">{formatNumber(min, step)}</span>
        <span className="font-mono text-xs font-semibold text-fuchsia-300">
          {formatNumber(clampedValue, step)}{props.param.unit ? ` ${props.param.unit}` : ""}
        </span>
        <span className="font-mono text-[9px] text-zinc-500">{formatNumber(max, step)}</span>
      </div>

      <Slider
        value={[clampedValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => {
          if (values.length > 0) {
            props.onChange(roundToStep(values[0], min, step));
          }
        }}
      />

    </div>
  );
}

function SelectControl(props: { param: ActiveParameter; value: string; onChange: (value: string) => void }) {
  const options = props.param.options ?? [];
  const safeValue = props.value && options.includes(props.value) ? props.value : (options[0] ?? "");

  return (
    <div className="space-y-1">
      <Label className="sr-only" htmlFor={`select-${props.param.technical_name}`}>
        {props.param.technical_name}
      </Label>
      <Select value={safeValue} onValueChange={props.onChange}>
        <SelectTrigger id={`select-${props.param.technical_name}`} className="h-[38px] border-white/10 bg-black/50 font-mono text-[10px]">
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
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

function TextControl(props: { param: ActiveParameter; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="sr-only" htmlFor={`text-${props.param.technical_name}`}>
        {props.param.technical_name}
      </Label>
      <Input
        id={`text-${props.param.technical_name}`}
        value={props.value}
        type="text"
        placeholder={String(props.param.default)}
        minLength={props.param.min_length}
        maxLength={props.param.max_length}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-[38px] border-white/10 bg-black/50 font-mono text-[10px]"
      />
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
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
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

function normalizePresetValue(value: number | string, min: number, max: number, step: number): number {
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
  const russianKeyword = param.semantic_keywords.find((keyword) => /[А-Яа-яЁё]/.test(keyword));
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
