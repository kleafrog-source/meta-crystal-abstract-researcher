"use client";

import { ListChecks, SearchX } from "lucide-react";

import type { ActiveParameter } from "@/lib/rag-v3/types";
import { useRagV3Store } from "@/store/rag-v3-store";
import { ParameterControl } from "./ParameterControl";

export function VirtualizedParamList(props: {
  parameters?: ActiveParameter[];
  className?: string;
  onChange?: (technicalName: string, value: number | string) => void;
  onRemove?: (technicalName: string) => void;
  displayMode?: "detail" | "standard" | "compact";
  selectedParameterName?: string | null;
  onSelectParameter?: (technicalName: string) => void;
}) {
  const storeParameters = useRagV3Store((state) => state.activeParameters);
  const isSearching = useRagV3Store((state) => state.isSearching);
  const parameters = props.parameters ?? storeParameters;

  return (
    <div
      className={`console-parameter-bank rounded-lg border border-border bg-black/55 p-2 ${props.className ?? ""}`}
    >
      {parameters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {isSearching ? <ListChecks className="size-6" /> : <SearchX className="size-6" />}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isSearching ? "Scoping and anchoring parameters..." : "No active parameters yet"}
            </p>
            {!isSearching ? (
              <p className="text-xs text-muted-foreground">
                Run a semantic query above and the unified V3 parameters will appear here.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={`console-param-grid console-param-grid-${props.displayMode ?? "detail"}`}>
          {parameters.map((parameter, index) => (
            <ParameterControl key={parameter.technical_name} param={parameter} index={index} displayMode={props.displayMode ?? "detail"} onChange={props.onChange} onRemove={props.onRemove} selected={props.selectedParameterName === parameter.technical_name} onSelect={props.onSelectParameter} />
          ))}
        </div>
      )}
    </div>
  );
}


