"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListChecks, SearchX } from "lucide-react";

import type { ActiveParameter } from "@/lib/rag-v2/types";
import { useRagV2Store } from "@/store/rag-v2-store";
import { ParameterControl } from "./ParameterControl";

const ROW_HEIGHT = 152;
const OVERSCAN = 8;

export function VirtualizedParamList(props: {
  parameters?: ActiveParameter[];
  className?: string;
}) {
  const storeParameters = useRagV2Store((state) => state.activeParameters);
  const isSearching = useRagV2Store((state) => state.isSearching);
  const parameters = props.parameters ?? storeParameters;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: parameters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  return (
    <div
      ref={parentRef}
      className={`max-h-[70vh] overflow-y-auto rounded-xl border border-border/60 bg-background/40 ${props.className ?? ""}`}
    >
      {parameters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {isSearching ? <ListChecks className="size-6 animate-pulse" /> : <SearchX className="size-6" />}
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
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const parameter = parameters[virtualRow.index];
            if (!parameter) {
              return null;
            }
            return (
              <div
                key={parameter.technical_name}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingLeft: "0.25rem",
                  paddingRight: "0.25rem",
                  paddingBottom: "0.5rem",
                }}
              >
                <ParameterControl param={parameter} index={virtualRow.index} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
