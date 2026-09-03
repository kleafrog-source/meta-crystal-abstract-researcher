'use client';

import { useState } from 'react';
import { getEngine } from '@/lib/strudel/engine';
import { replaceRanges, type WriteSource } from '@/lib/codemirror/writeback';
import { addVariant, dragBoundary, setSlotToken, type EditResult } from '@/lib/timeline/edits';
import { arrangementScale, type ArrangedVoice, type SongArrangement } from '@/lib/timeline/recognize';
import type { SongTimeline } from '@/lib/timeline/types';
import type { VoiceMatch } from '@/lib/chunks/detect';

interface Props {
  arrangement: SongArrangement;
  timeline: SongTimeline;
  pxPerCycle: number;
  rulerHeight: number;
  rowHeight: number;
  /** strip row index per lane id — voices pair with lanes by id */
  laneIndexById: Map<string, number>;
}

interface PopoverState {
  voiceIndex: number;
  slotIndex: number;
  x: number;
  y: number;
}

function isPick(voice: ArrangedVoice): boolean {
  return voice.match.kind === 'pickRestart' || voice.match.kind === 'pick';
}

function nextKeyName(keys: string[], base: string): string {
  const stem = /^[A-Za-z_][A-Za-z0-9_]*$/.test(base) ? base.replace(/\d+$/, '') : 'v';
  for (let n = 2; ; n++) {
    const candidate = `${stem}${n}`;
    if (!keys.includes(candidate)) return candidate;
  }
}

/**
 * Tier-2 affordances drawn over the strip canvas: shared-boundary drag
 * handles on the ruler, and per-voice slot segments (token chips) that open
 * a variant picker. Timeline weights are in musical cycles; the strip axis is
 * scheduler cycles — `scale` (period / shared total) converts between them.
 */
export default function ArrangementOverlay({
  arrangement,
  timeline,
  pxPerCycle,
  rulerHeight,
  rowHeight,
  laneIndexById,
}: Props) {
  const [handleDrag, setHandleDrag] = useState<{ boundary: number; dx: number } | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const { shared, voices } = arrangement;
  const scale = shared ? arrangementScale(timeline.period, shared.totalCycles) : 1;
  const pxm = pxPerCycle * scale; // pixels per musical cycle

  const apply = (result: EditResult, source: WriteSource) => {
    const engine = getEngine();
    if (!engine || !result.ok) return;
    replaceRanges(engine.view, result.edits, source);
  };

  const startHandleDrag = (e: React.PointerEvent, boundary: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setHandleDrag({ boundary, dx: 0 });
    const onMove = (ev: PointerEvent) => setHandleDrag({ boundary, dx: ev.clientX - startX });
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      setHandleDrag(null);
      const delta = Math.round((ev.clientX - startX) / pxm);
      const engine = getEngine();
      if (delta !== 0 && engine) {
        apply(dragBoundary(engine.code, arrangement, boundary, delta), 'timeline.weights');
      }
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  const popoverVoice = popover ? voices[popover.voiceIndex] : null;

  return (
    <>
      {/* shared boundary drag handles, on the ruler */}
      {shared?.boundaries.map((b) => {
        const dragging = handleDrag?.boundary === b;
        const x = b * pxm + (dragging ? handleDrag.dx : 0);
        return (
          <div
            key={b}
            onPointerDown={(e) => startHandleDrag(e, b)}
            title={`section boundary · cycle ${b} — drag to resize`}
            className={`absolute z-10 w-2 -translate-x-1/2 cursor-col-resize ${
              dragging ? 'bg-acid/30' : 'hover:bg-acid/15'
            }`}
            style={{ left: x, top: 0, height: rulerHeight }}
          >
            <div className={`mx-auto h-full w-0.5 ${dragging ? 'bg-acid' : 'bg-acid-dim/70'}`} />
          </div>
        );
      })}

      {/* per-voice slot segments (top sliver of each paired lane row) */}
      {voices.map((voice, vi) => {
        const laneIndex = laneIndexById.get(voice.laneId);
        if (laneIndex === undefined) return null;
        const top = rulerHeight + laneIndex * rowHeight;
        const editable = isPick(voice);
        let at = 0;
        return voice.match.slots.map((slot, si) => {
          const left = at * pxm;
          const width = slot.weight * pxm;
          at += slot.weight;
          const token = 'token' in slot ? slot.token : String(si);
          return (
            <div
              key={`${vi}:${si}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                if (!editable) return;
                e.stopPropagation();
                setPopover({ voiceIndex: vi, slotIndex: si, x: e.clientX, y: e.clientY });
              }}
              title={editable ? `slot ${si}: ${token} — click to change` : undefined}
              className={`absolute border-l border-line-bright/80 ${
                editable ? 'cursor-pointer hover:bg-acid/10' : ''
              }`}
              style={{ left, width, top, height: 9 }}
            >
              {width >= 18 && (
                <span className="pointer-events-none block truncate px-0.5 text-[8px] leading-[9px] text-text-dim">
                  {token}
                </span>
              )}
            </div>
          );
        });
      })}

      {/* variant picker */}
      {popover && popoverVoice && isPick(popoverVoice) && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPopover(null)} onPointerDown={(e) => e.stopPropagation()} />
          <div
            className="fixed z-30 min-w-28 rounded-sm border border-line-bright bg-surface-2 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            style={{ left: popover.x, top: popover.y + 6 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-2 pb-1 silkscreen">slot {popover.slotIndex}</div>
            {(() => {
              const match = popoverVoice.match as VoiceMatch;
              const current = match.slots[popover.slotIndex].token;
              const choose = (token: string) => {
                const engine = getEngine();
                if (engine) apply(setSlotToken(engine.code, arrangement, popover.voiceIndex, popover.slotIndex, token), 'timeline.cell');
                setPopover(null);
              };
              return (
                <>
                  {['~', ...match.variants.map((v) => v.key)].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => choose(key)}
                      className={`block w-full px-2 py-0.5 text-left text-[11px] transition-colors hover:bg-acid/10 ${
                        key === current ? 'text-acid' : 'text-text-dim'
                      }`}
                    >
                      {key === '~' ? '~ rest' : key}
                    </button>
                  ))}
                  {match.container === 'object' && current !== '~' && (
                    <button
                      type="button"
                      onClick={() => {
                        const engine = getEngine();
                        if (engine) {
                          const newKey = nextKeyName(match.variants.map((v) => v.key), current);
                          apply(addVariant(engine.code, arrangement, popover.voiceIndex, newKey, current), 'timeline.structure');
                        }
                        setPopover(null);
                      }}
                      className="block w-full border-t border-line px-2 py-0.5 text-left text-[11px] text-text-dim transition-colors hover:bg-acid/10"
                    >
                      + duplicate as new variant
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}
    </>
  );
}
