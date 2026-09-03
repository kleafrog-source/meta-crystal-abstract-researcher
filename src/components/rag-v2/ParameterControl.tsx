"use client";

import { HelpCircle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 px-4 py-3 transition-colors hover:border-border",
        props.index % 2 === 0 ? "bg-card" : "bg-muted/30",
      )}
    >
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-xs font-medium sm:text-sm">
              {props.param.technical_name}
            </span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <HelpCircle className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs whitespace-normal text-left">
                  <div className="space-y-2 text-[11px]">
                    <div className="font-semibold">Semantic keywords</div>
                    <div>{props.param.semantic_keywords.join(" | ")}</div>
                    <div className="opacity-80">
                      Source: {props.param.source}
                      {" | "}
                      Domain: {props.param.domain ?? "n/a"}
                    </div>
                    <div className="opacity-80">Detail: {props.param.detail}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="outline">{props.param.ui_element}</Badge>
            <Badge variant="secondary">{props.param.category}</Badge>
            {props.param.unit ? <Badge variant="secondary">{props.param.unit}</Badge> : null}
            <Badge variant="outline">{props.param.source}</Badge>
            <Badge variant="outline">sim {Math.round(props.param.similarity * 100)}%</Badge>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => removeParameter(props.param.technical_name)}
          aria-label="Remove parameter"
        >
          <X className="size-4" />
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
      <div className="flex items-center gap-3">
        <Switch checked={clampedValue !== 0} onCheckedChange={(checked) => props.onChange(checked ? 1 : 0)} />
        <span className="text-xs text-muted-foreground">
          {clampedValue !== 0 ? "Enabled (1)" : "Disabled (0)"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">{formatNumber(min, step)}</span>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-sm text-primary">
          {formatNumber(clampedValue, step)}
          {props.param.unit ? ` ${props.param.unit}` : ""}
        </span>
        <span className="font-mono text-muted-foreground">{formatNumber(max, step)}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CompactPresetButton label="Min" onClick={() => props.onChange(roundToStep(min, min, step))} />
        <CompactPresetButton
          label="Def"
          onClick={() => props.onChange(normalizePresetValue(props.param.default, min, max, step))}
        />
        <CompactPresetButton label="Max" onClick={() => props.onChange(roundToStep(max, min, step))} />
        <CompactPresetButton label="Rnd" onClick={() => props.onChange(randomSteppedValue(min, max, step))} />
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

function CompactPresetButton(props: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={props.onClick}>
      {props.label}
    </Button>
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
        <SelectTrigger id={`select-${props.param.technical_name}`}>
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
        className="font-mono text-sm"
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
