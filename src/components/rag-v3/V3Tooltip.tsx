"use client";

import { Info } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function V3Tooltip(props: {
  children: ReactElement;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{props.children}</TooltipTrigger>
      <TooltipContent side={props.side ?? "top"} sideOffset={6} className="max-w-xs text-left">
        {props.content}
      </TooltipContent>
    </Tooltip>
  );
}

export function V3InfoTip({ content }: { content: ReactNode }) {
  return (
    <V3Tooltip content={content}>
      <button
        type="button"
        aria-label="Показать подсказку"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
      >
        <Info className="size-3.5" />
      </button>
    </V3Tooltip>
  );
}
