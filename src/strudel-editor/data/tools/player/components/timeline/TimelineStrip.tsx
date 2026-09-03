'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/state/store';
import { getEngine } from '@/lib/strudel/engine';
import { setAuditionRange } from '@/lib/strudel/audition';
import { applyLoopRegion, seekTo } from '@/lib/timeline/actions';
import { firstEditablePos } from '@/lib/chunks/detect';
import { deleteCycles, type EditResult } from '@/lib/timeline/edits';
import { replaceRanges } from '@/lib/codemirror/writeback';
import { arrangementScale } from '@/lib/timeline/recognize';
import type { SongSection, TimelineLane } from '@/lib/timeline/types';
import TimelineRuler from './TimelineRuler';
import TimelineLaneRow from './TimelineLaneRow';
import TimelinePlayhead from './TimelinePlayhead';
import ArrangementOverlay from './ArrangementOverlay';
import ArrangeDialog from './ArrangeDialog';

const MIN_PX = 6;
const MAX_PX = 48;
const ROW_H = 20; // h-5, keep gutter and canvas rows aligned

function rangesEqual(a: [number, number] | null, b: [number, number] | null): boolean {
  return a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
}

export default function TimelineStrip() {
  const timeline = usePlayerStore((s) => s.timeline);
  const timelineOpen = usePlayerStore((s) => s.timelineOpen);
  const timelineStale = usePlayerStore((s) => s.timelineStale);
  const loopRegion = usePlayerStore((s) => s.loopRegion);
  const audition = usePlayerStore((s) => s.audition);
  const setAudition = usePlayerStore((s) => s.setAudition);
  const setTimelineOpen = usePlayerStore((s) => s.setTimelineOpen);
  const arrangement = usePlayerStore((s) => s.arrangement);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [follow, setFollow] = useState(true);
  const [dragPreview, setDragPreview] = useState<[number, number] | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [cycleMenu, setCycleMenu] = useState<{ cycle: number; x: number; y: number } | null>(null);
  const dragState = useRef<{ startCycle: number; startX: number; onRuler: boolean; moved: boolean } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasWidth(el.clientWidth));
    observer.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [timelineOpen, timeline]);

  if (!timelineOpen || !timeline) return null;

  const { cycles, lanes, sections, period } = timeline;
  // a recognized arrangement always shows its full span — freshly authored
  // songs have identical sections (period 1) but a real 24-cycle structure
  const shared = arrangement?.shared ?? null;
  const scale = shared ? arrangementScale(period, shared.totalCycles) : 1;
  const displayCycles = shared ? Math.max(cycles, Math.ceil(shared.totalCycles * scale)) : cycles;
  const degenerate = displayCycles <= 2 && period !== null;

  const fitPx = canvasWidth > 0 ? canvasWidth / displayCycles : 12;
  const pxPerCycle = Math.min(MAX_PX, Math.max(MIN_PX, zoom === 'fit' ? fitPx : zoom));
  const canvasPx = displayCycles * pxPerCycle;

  const zoomBy = (factor: number) => setZoom(Math.min(MAX_PX, Math.max(MIN_PX, pxPerCycle * factor)));

  // ── canvas pointer logic: click = seek, drag on ruler = loop region ──
  const cycleAt = (e: React.PointerEvent | React.MouseEvent): number => {
    const canvas = e.currentTarget as HTMLElement;
    const rect = canvas.getBoundingClientRect();
    return Math.min(displayCycles, Math.max(0, (e.clientX - rect.left) / pxPerCycle));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const onRuler = (e.target as HTMLElement).closest('[data-ruler]') !== null;
    dragState.current = { startCycle: cycleAt(e), startX: e.clientX, onRuler, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) > 4) drag.moved = true;
    if (drag.moved && drag.onRuler) {
      const now = cycleAt(e);
      setDragPreview([
        Math.floor(Math.min(drag.startCycle, now)),
        Math.max(Math.floor(Math.min(drag.startCycle, now)) + 1, Math.ceil(Math.max(drag.startCycle, now))),
      ]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragState.current;
    dragState.current = null;
    if (!drag) return;
    if (drag.moved && drag.onRuler && dragPreview) {
      void applyLoopRegion(dragPreview);
    } else if (!drag.moved) {
      void seekTo(Math.floor(cycleAt(e)));
    }
    setDragPreview(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-ruler]')) void applyLoopRegion(null);
  };

  // ── right-click: structural edits on the recognized arrangement ──
  const arrangementEditable =
    shared !== null && arrangement !== null && arrangement.voices.every((v) => v.match.kind !== 'arrange');

  const onContextMenu = (e: React.MouseEvent) => {
    if (!arrangementEditable || !shared) return;
    const cycle = Math.floor(cycleAt(e) / scale);
    if (cycle < 0 || cycle >= shared.totalCycles) return;
    e.preventDefault();
    setCycleMenu({ cycle, x: e.clientX, y: e.clientY });
  };

  const removeCycles = (start: number, end: number) => {
    setCycleMenu(null);
    const engine = getEngine();
    if (!engine || !arrangement) return;
    const result: EditResult = deleteCycles(engine.code, arrangement, start, end);
    if (result.ok) replaceRanges(engine.view, result.edits, 'timeline.structure');
  };

  const onSectionClick = (section: SongSection, altKey: boolean) => {
    if (altKey) {
      void applyLoopRegion([section.start, section.end]);
      void seekTo(section.start);
    } else {
      void seekTo(section.start);
    }
  };

  // ── lane gutter actions (ranges are doc offsets — gated while stale) ──
  const selectLane = (lane: TimelineLane) => {
    const engine = getEngine();
    if (!engine || timelineStale || !lane.source.range) return;
    // land on the lane's first editable pattern (a voice's first variant) so
    // the side panel opens a grid/roll, not the bare statement head
    const doc = engine.view.state.doc.toString();
    const pos = firstEditablePos(doc, lane.source.range) ?? lane.source.range[0];
    engine.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    engine.view.focus();
    if (usePlayerStore.getState().panel !== 'chunk') usePlayerStore.getState().setPanel('chunk');
  };

  const toggleSolo = async (lane: TimelineLane) => {
    const engine = getEngine();
    const range = lane.source.range;
    if (!engine || timelineStale || !range) return;
    if (rangesEqual(audition, range)) {
      setAuditionRange(null);
      setAudition(null);
    } else {
      setAuditionRange(range);
      setAudition(range);
      if (!engine.started) await engine.play();
    }
  };

  const region = dragPreview ?? loopRegion;

  return (
    <div className="border-b border-line bg-surface">
      {/* header */}
      <div className="flex h-7 items-center gap-3 border-b border-line px-4">
        <span className="silkscreen">song</span>
        <span className="text-[10px] text-text-dim tabular-nums">
          {degenerate
            ? `${displayCycles}-cycle loop`
            : period
              ? `${displayCycles} cycles`
              : `first ${timeline.queriedCycles} cycles · continues →`}
        </span>
        {timelineStale && (
          <span className="flex items-center gap-1.5">
            <span className="led led-loading" />
            <span className="silkscreen">analyzing</span>
          </span>
        )}
        {(arrangement?.voices.length ?? 0) === 0 && (
          <button
            type="button"
            onClick={() => setArrangeOpen(true)}
            className="h-5 rounded-sm border border-acid-dim/60 px-2 text-[10px] text-acid transition-all hover:shadow-[0_0_8px_var(--glow)]"
          >
            arrange →
          </button>
        )}
        {!degenerate && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFollow(!follow)}
              className={`h-5 rounded-sm border px-1.5 text-[10px] ${
                follow ? 'border-acid-dim text-acid' : 'border-line text-text-dim hover:text-text'
              }`}
            >
              follow
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.5)}
              aria-label="Zoom out"
              className="h-5 w-5 rounded-sm border border-line text-[10px] text-text-dim hover:text-text"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom('fit')}
              className={`h-5 rounded-sm border px-1.5 text-[10px] ${
                zoom === 'fit' ? 'border-acid-dim text-acid' : 'border-line text-text-dim hover:text-text'
              }`}
            >
              fit
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1.5)}
              aria-label="Zoom in"
              className="h-5 w-5 rounded-sm border border-line text-[10px] text-text-dim hover:text-text"
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setTimelineOpen(false)}
          aria-label="Collapse timeline"
          className={`${degenerate ? 'ml-auto' : ''} h-5 w-5 rounded-sm border border-line text-[10px] text-text-dim hover:text-text`}
        >
          ▾
        </button>
      </div>

      {!degenerate && (
        <div className="flex">
          {/* lane label gutter */}
          <div className="w-36 shrink-0 border-r border-line">
            <div className="h-6 border-b border-line" />
            {lanes.map((lane) => {
              const soloed = rangesEqual(audition, lane.source.range);
              return (
                <div
                  key={lane.source.id}
                  className="flex items-center gap-1.5 border-b border-line/40 px-2"
                  style={{ height: ROW_H }}
                >
                  <button
                    type="button"
                    onClick={() => void toggleSolo(lane)}
                    disabled={timelineStale || !lane.source.range}
                    title="solo"
                    className={`h-3.5 w-3.5 rounded-[2px] border text-[8px] leading-none transition-all disabled:opacity-40 ${
                      soloed
                        ? 'border-ember bg-ember/15 text-ember shadow-[0_0_6px_var(--ember-glow)]'
                        : 'border-line text-text-faint hover:border-ember-dim hover:text-ember'
                    }`}
                  >
                    s
                  </button>
                  {lane.color && (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-[1px]"
                      style={{ backgroundColor: lane.color }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => selectLane(lane)}
                    disabled={timelineStale || !lane.source.range}
                    className="min-w-0 flex-1 truncate text-left text-[10px] text-text-dim transition-colors hover:text-text disabled:opacity-60"
                    title={lane.source.label ?? lane.source.id}
                  >
                    {lane.source.label ?? lane.source.id}
                  </button>
                </div>
              );
            })}
          </div>

          {/* scrollable canvas */}
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
            <div
              className="relative"
              style={{ width: Math.max(canvasPx, canvasWidth) }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
            >
              <TimelineRuler
                cycles={displayCycles}
                pxPerCycle={pxPerCycle}
                sections={sections}
                onSectionClick={onSectionClick}
              />
              {lanes.map((lane) => (
                <TimelineLaneRow key={lane.source.id} lane={lane} pxPerCycle={pxPerCycle} displayCycles={displayCycles} />
              ))}

              {/* 4-cycle gridlines + section boundaries */}
              {Array.from({ length: Math.ceil(displayCycles / 4) }, (_, i) => (
                <div
                  key={`g${i}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-line/60"
                  style={{ left: i * 4 * pxPerCycle }}
                />
              ))}
              {sections.slice(1).map((section, i) => (
                <div
                  key={`s${i}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-line-bright"
                  style={{ left: section.start * pxPerCycle }}
                />
              ))}

              {/* Tier-2: boundary handles + slot segments for recognized voices */}
              {arrangement && arrangement.voices.length > 0 && (
                <ArrangementOverlay
                  arrangement={arrangement}
                  timeline={timeline}
                  pxPerCycle={pxPerCycle}
                  rulerHeight={24}
                  rowHeight={ROW_H}
                  laneIndexById={new Map(lanes.map((l, i) => [l.source.id, i]))}
                />
              )}

              {/* loop region */}
              {region && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 border-x border-acid-dim bg-acid/10"
                  style={{ left: region[0] * pxPerCycle, width: (region[1] - region[0]) * pxPerCycle }}
                />
              )}

              <TimelinePlayhead pxPerCycle={pxPerCycle} cycles={displayCycles} scrollRef={scrollRef} follow={follow} />
            </div>
          </div>
        </div>
      )}

      {/* right-click menu: delete a cycle (or the whole section) everywhere */}
      {cycleMenu && shared && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setCycleMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCycleMenu(null);
            }}
          />
          <div
            className="fixed z-30 min-w-36 rounded-sm border border-line-bright bg-surface-2 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            style={{ left: cycleMenu.x, top: cycleMenu.y + 6 }}
          >
            <div className="px-2 pb-1 silkscreen">cycle {cycleMenu.cycle}</div>
            <button
              type="button"
              disabled={shared.totalCycles <= 1}
              onClick={() => removeCycles(cycleMenu.cycle, cycleMenu.cycle + 1)}
              className="block w-full px-2 py-0.5 text-left text-[11px] text-text-dim transition-colors hover:bg-ember/10 hover:text-ember disabled:opacity-40"
            >
              delete cycle {cycleMenu.cycle}
            </button>
            {(() => {
              const section = shared.sections.find((s) => cycleMenu.cycle >= s.start && cycleMenu.cycle < s.end);
              if (!section || section.end - section.start >= shared.totalCycles) return null;
              return (
                <button
                  type="button"
                  onClick={() => removeCycles(section.start, section.end)}
                  className="block w-full px-2 py-0.5 text-left text-[11px] text-text-dim transition-colors hover:bg-ember/10 hover:text-ember"
                >
                  delete section · cycles {section.start}–{section.end}
                </button>
              );
            })()}
          </div>
        </>
      )}

      {arrangeOpen && <ArrangeDialog onClose={() => setArrangeOpen(false)} />}
    </div>
  );
}
