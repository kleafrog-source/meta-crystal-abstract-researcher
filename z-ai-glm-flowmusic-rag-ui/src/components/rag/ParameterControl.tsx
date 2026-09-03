"use client";

import * as React from "react";
import { HelpCircle, X } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { cn } from "@/lib/utils";
import { useRagStore } from "@/store/rag-store";
import type { ActiveParameter, UiElement } from "@/lib/rag-types";

export interface ParameterControlProps {
  param: ActiveParameter;
  /** Index in the active list — used only for a subtle stripe. */
  index: number;
}

/** Format a numeric current value for display. Keeps a sane number of
 *  decimals based on the parameter's `step`. */
function formatNumber(value: number, step?: number): string {
  if (!Number.isFinite(value)) return "—";
  if (step && step > 0 && step < 1) {
    const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))));
    return value.toFixed(decimals);
  }
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

/** Parse an Array parameter's default value into a comma-separated string
 *  for editing in a text field. */
function arrayToText(value: number | string): string {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

/** Parse a comma-separated string back into a value for the store. For an
 *  Array parameter we keep it as a comma-joined string (the macro output
 *  will render it verbatim); for everything else we coerce to number when
 *  it looks numeric. */
function parseTextValue(text: string, uiElement: UiElement): number | string {
  const trimmed = text.trim();
  if (uiElement === "Array") return trimmed;
  // Numeric-looking scalar → keep numeric so the macro emits `1.5` not `"1.5"`.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return trimmed;
}

/** Similarity score → tailwind-friendly percentage + colour class. */
function similarityBadge(sim: number): { label: string; className: string } {
  const pct = Math.round(sim * 100);
  let cls = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (pct < 35) cls = "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  else if (pct < 60) cls = "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
  return { label: `${pct}%`, className: cls };
}

export function ParameterControl({ param, index }: ParameterControlProps) {
  const updateParameterValue = useRagStore((s) => s.updateParameterValue);
  const removeParameter = useRagStore((s) => s.removeParameter);

  // ---- local live state (instant visual feedback) ----------------------
  // We keep a *local* mirror of the value so the slider thumb / text caret
  // moves with zero latency; the global store update is debounced.
  const initial = param.current_value;
  const [localNum, setLocalNum] = React.useState<number>(() =>
    typeof initial === "number" ? initial : Number(initial) || 0,
  );
  const [localStr, setLocalStr] = React.useState<string>(() =>
    Array.isArray(initial) ? arrayToText(initial) : String(initial ?? ""),
  );
  const [localArr, setLocalArr] = React.useState<string>(() => arrayToText(initial));

  // Resync the local mirror when the upstream value changes externally
  // (e.g. a brand-new search result replaces this slot).
  React.useEffect(() => {
    if (param.ui_element === "Range" || param.ui_element === "Toggle") {
      const n = typeof param.current_value === "number"
        ? param.current_value
        : Number(param.current_value) || 0;
      setLocalNum(n);
    } else if (param.ui_element === "Array") {
      setLocalArr(arrayToText(param.current_value));
    } else {
      setLocalStr(
        Array.isArray(param.current_value)
          ? arrayToText(param.current_value)
          : String(param.current_value ?? ""),
      );
    }
  }, [param.ui_element, param.current_value]);

  // ---- debounced commit to the global store -----------------------------
  const commitNumeric = useDebouncedCallback((name: string, value: number) => {
    updateParameterValue(name, value);
  }, 250);
  const commitString = useDebouncedCallback((name: string, value: string, ui: UiElement) => {
    updateParameterValue(name, parseTextValue(value, ui));
  }, 400);
  const commitArr = useDebouncedCallback((name: string, value: string) => {
    updateParameterValue(name, value);
  }, 400);

  const sim = similarityBadge(param.similarity);
  const isOdd = index % 2 === 1;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 px-4 py-3 transition-colors",
        isOdd ? "bg-muted/30" : "bg-card",
        "hover:border-border",
      )}
    >
      {/* Header: name + tooltip + similarity + remove */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-xs font-medium text-foreground sm:text-sm">
              {param.technical_name}
            </span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Показать семантические ключевые слова"
                    className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <HelpCircle className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs whitespace-normal text-left"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-primary-foreground">
                      Семантические ключевые слова
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug">
                      {param.semantic_keywords.map((kw, i) => (
                        <li key={i}>{kw}</li>
                      ))}
                    </ul>
                    {param.lyria_prompt_tags.length > 0 && (
                      <div className="pt-1 text-[11px] opacity-80">
                        Tags: {param.lyria_prompt_tags.join(" · ")}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-normal">
              {param.ui_element}
            </Badge>
            {param.unit && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {param.unit}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn("text-[10px] font-medium", sim.className)}
            >
              sim {sim.label}
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={() => removeParameter(param.technical_name)}
          aria-label="Убрать параметр из активного набора"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body: the control itself, chosen by ui_element */}
      <ControlBody
        param={param}
        localNum={localNum}
        localStr={localStr}
        localArr={localArr}
        onNumChange={(v) => {
          setLocalNum(v);
          commitNumeric(param.technical_name, v);
        }}
        onStrChange={(v) => {
          setLocalStr(v);
          commitString(param.technical_name, v, param.ui_element);
        }}
        onArrChange={(v) => {
          setLocalArr(v);
          commitArr(param.technical_name, v);
        }}
      />
    </div>
  );
}

interface ControlBodyProps {
  param: ActiveParameter;
  localNum: number;
  localStr: string;
  localArr: string;
  onNumChange: (v: number) => void;
  onStrChange: (v: string) => void;
  onArrChange: (v: string) => void;
}

function ControlBody({
  param,
  localNum,
  localStr,
  localArr,
  onNumChange,
  onStrChange,
  onArrChange,
}: ControlBodyProps) {
  const ui = param.ui_element;

  if (ui === "Range" || ui === "Toggle") {
    const min = param.min_value ?? 0;
    const max = param.max_value ?? (ui === "Toggle" ? 1 : 100);
    const step = param.step ?? (ui === "Toggle" ? 1 : 0.01);
    return (
      <RangeControl
        param={param}
        value={localNum}
        min={min}
        max={max}
        step={step}
        onChange={onNumChange}
      />
    );
  }

  if (ui === "Select") {
    const options = param.options ?? [];
    return (
      <SelectControl
        param={param}
        options={options}
        value={localStr}
        onChange={onStrChange}
      />
    );
  }

  if (ui === "Array") {
    return (
      <ArrayControl
        param={param}
        value={localArr}
        onChange={onArrChange}
      />
    );
  }

  // String / Text → text input.
  return (
    <TextControl
      param={param}
      value={localStr}
      onChange={onStrChange}
    />
  );
}

// --- Range / Toggle --------------------------------------------------------

interface RangeControlProps {
  param: ActiveParameter;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function RangeControl({ param, value, min, max, step, onChange }: RangeControlProps) {
  const isToggle = param.ui_element === "Toggle";
  const sliderValue = Math.min(max, Math.max(min, value));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatNumber(min, step)}
        </span>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-sm font-semibold tabular-nums text-primary">
          {formatNumber(sliderValue, step)}
          {param.unit ? ` ${param.unit}` : ""}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatNumber(max, step)}
        </span>
      </div>
      {isToggle ? (
        <div className="flex items-center gap-3">
          <Switch
            checked={sliderValue !== 0}
            onCheckedChange={(checked) => onChange(checked ? 1 : 0)}
            aria-label={param.technical_name}
          />
          <span className="text-xs text-muted-foreground">
            {sliderValue !== 0 ? "Включено (1)" : "Выключено (0)"}
          </span>
        </div>
      ) : (
        <Slider
          value={[sliderValue]}
          min={min}
          max={max}
          step={step}
          onValueChange={(vals) => {
            if (vals.length > 0) onChange(vals[0]);
          }}
          aria-label={param.technical_name}
          className="py-1"
        />
      )}
      {step < 1 && (
        <div className="text-[10px] text-muted-foreground">
          шаг {formatNumber(step, step)}
        </div>
      )}
    </div>
  );
}

// --- Select ----------------------------------------------------------------

interface SelectControlProps {
  param: ActiveParameter;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

function SelectControl({ param, options, value, onChange }: SelectControlProps) {
  // shadcn Select requires non-empty string values; default to the first
  // option when the current value is missing.
  const safeValue = value && options.includes(value) ? value : (options[0] ?? "");
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={`sel-${param.technical_name}`} className="sr-only">
        {param.technical_name}
      </Label>
      <Select value={safeValue} onValueChange={onChange}>
        <SelectTrigger id={`sel-${param.technical_name}`} className="w-full">
          <SelectValue placeholder="Выберите значение" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// --- Text / String ---------------------------------------------------------

interface TextControlProps {
  param: ActiveParameter;
  value: string;
  onChange: (v: string) => void;
}

function TextControl({ param, value, onChange }: TextControlProps) {
  const maxLen = param.max_length ?? undefined;
  const minLen = param.min_length ?? undefined;
  return (
    <div className="space-y-1">
      <Label htmlFor={`txt-${param.technical_name}`} className="sr-only">
        {param.technical_name}
      </Label>
      <Input
        id={`txt-${param.technical_name}`}
        type="text"
        value={value}
        minLength={minLen}
        maxLength={maxLen}
        placeholder={String(param.default ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm"
      />
      {(minLen !== undefined || maxLen !== undefined) && (
        <div className="text-[10px] text-muted-foreground">
          {minLen !== undefined && `min ${minLen} симв. `}
          {maxLen !== undefined && `max ${maxLen} симв.`}
        </div>
      )}
    </div>
  );
}

// --- Array -----------------------------------------------------------------

interface ArrayControlProps {
  param: ActiveParameter;
  value: string;
  onChange: (v: string) => void;
}

function ArrayControl({ param, value, onChange }: ArrayControlProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`arr-${param.technical_name}`} className="sr-only">
        {param.technical_name}
      </Label>
      <Input
        id={`arr-${param.technical_name}`}
        type="text"
        value={value}
        placeholder="значения через запятую"
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm"
      />
      <div className="text-[10px] text-muted-foreground">
        диапазон {param.min_value ?? "—"} … {param.max_value ?? "—"} {param.unit ?? ""}
      </div>
    </div>
  );
}
