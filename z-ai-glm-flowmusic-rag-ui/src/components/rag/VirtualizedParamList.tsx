"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListChecks, SearchX } from "lucide-react";

import { ParameterControl } from "./ParameterControl";
import { useRagStore } from "@/store/rag-store";
import type { ActiveParameter } from "@/lib/rag-types";

/**
 * Virtualised list of the active (RAG-proposed) parameters.
 *
 * The underlying dataset has 2.7k+ rows, so rendering the whole thing with
 * `.map()` would freeze the browser. `@tanstack/react-virtual` keeps only
 * the visible rows (+ overscan buffer) in the DOM at any time. Each row
 * has a fixed, predictable height so the virtualiser can compute the
 * total scroll size exactly.
 *
 * Row height:
 *   - A Range parameter needs the header (~40px) + slider block (~64px)
 *     ≈ 120px.
 *   - A Select / Text / Array parameter is a bit shorter but keeping a
 *     single fixed height for every row is what lets the virtualiser work
 *     without measuring. We pad the shorter controls so they still fit.
 */
const ROW_HEIGHT = 132;
const OVERSCAN = 8;

export interface VirtualizedParamListProps {
  /** Override the active parameters (defaults to the store's set). */
  parameters?: ActiveParameter[];
  /** Optional className for the outer wrapper. */
  className?: string;
}

export function VirtualizedParamList({
  parameters,
  className,
}: VirtualizedParamListProps) {
  const storeParams = useRagStore((s) => s.activeParameters);
  const isSearching = useRagStore((s) => s.isSearching);
  const list = parameters ?? storeParams;

  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: list.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    measureElement: undefined,
  });

  const totalHeight = virtualizer.getTotalSize();
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={
        "max-h-[70vh] w-full overflow-y-auto rounded-xl border border-border/60 bg-background/40 " +
        "scroll-smooth " +
        "[scrollbar-width:thin] [scrollbar-color:theme(colors.border)_transparent] " +
        (className ?? "")
      }
    >
      {list.length === 0 ? (
        <EmptyState isSearching={isSearching} />
      ) : (
        <div
          style={{
            height: `${totalHeight}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualRow) => {
            const param = list[virtualRow.index];
            if (!param) return null;
            return (
              <div
                key={param.technical_name}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  // Fixed height keeps the virtualiser exact; the inner
                  // card is allowed to be shorter and centre itself.
                  height: `${ROW_HEIGHT}px`,
                  paddingRight: "0.25rem",
                  paddingLeft: "0.25rem",
                  paddingBottom: "0.5rem",
                }}
              >
                <ParameterControl param={param} index={virtualRow.index} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {isSearching ? (
          <ListChecks className="size-6 animate-pulse" />
        ) : (
          <SearchX className="size-6" />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {isSearching
            ? "Идёт семантический поиск по 2.7k параметрам…"
            : "Активный набор параметров пуст"}
        </p>
        {!isSearching && (
          <p className="text-xs text-muted-foreground">
            Опишите нужный эффект в поле семантического поиска выше — RAG вернёт
            топ-25 релевантных параметров для точной настройки.
          </p>
        )}
      </div>
    </div>
  );
}
