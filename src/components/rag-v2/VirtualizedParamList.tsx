"use client";

import { ListChecks, SearchX } from "lucide-react";

import type { ActiveParameter } from "@/lib/rag-v2/types";
import { useRagV2Store } from "@/store/rag-v2-store";
import { ParameterControl } from "./ParameterControl";

export function VirtualizedParamList(props: {
  parameters?: ActiveParameter[];
  className?: string;
}) {
  const storeParameters = useRagV2Store((state) => state.activeParameters);
  const isSearching = useRagV2Store((state) => state.isSearching);
  const parameters = props.parameters ?? storeParameters;

  return (
    <div
      className={`console-parameter-bank overflow-y-auto rounded-lg border border-white/75 bg-black/55 p-2 ${props.className ?? ""}`}
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
                Run a semantic query above and the v2 scoped parameters will appear here.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {parameters.map((parameter, index) => (
            <ParameterControl key={parameter.technical_name} param={parameter} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
