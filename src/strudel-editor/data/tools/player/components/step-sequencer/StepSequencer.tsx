'use client';

import { useMemo, useState } from 'react';
import { isChunkFresh, type ChunkInfo } from '@/lib/chunks/detect';
import { DRUM_SOUNDS } from '@/lib/chunks/classify';
import { parseStepGrid } from '@/lib/notation/parse';
import { serializeStepGrid } from '@/lib/notation/serialize';
import { resizeGrid, type ResizeMode } from '@/lib/notation/resize';
import type { StepGridModel } from '@/lib/notation/model';
import { replaceRange } from '@/lib/codemirror/writeback';
import { getEngine } from '@/lib/strudel/engine';
import ResizeModeToggle from '@/components/editor/ResizeModeToggle';
import { usePlayhead } from '@/components/editor/usePlayhead';
import { DRUM_LABELS } from '@/lib/strudel/sounds';

const LANE_ORDER = ['bd', 'sd', 'cp', 'rim', 'lt', 'mt', 'ht', 'hh', 'oh', 'cr', 'rd', 'sh', 'cb', 'tb', 'perc'];

function laneRank(sound: string): number {
  const base = sound.split(':')[0];
  const idx = LANE_ORDER.indexOf(base);
  return idx === -1 ? LANE_ORDER.length : idx;
}

/** lane identity is (sound, part) — the same sound may appear in two `,`-stack parts */
interface ViewLane {
  sound: string;
  part: number;
  cells: boolean[];
}

export default function StepSequencer({ chunk }: { chunk: ChunkInfo }) {
  const [ghostLanes, setGhostLanes] = useState<string[]>([]);
  const [resizeMode, setResizeMode] = useState<ResizeMode>('spread');

  const parsed = useMemo(() => (chunk.miniString !== null ? parseStepGrid(chunk.miniString) : null), [chunk.miniString]);
  const playhead = usePlayhead(parsed?.ok ? parsed.model.steps || 8 : 0, parsed?.ok ? (parsed.model.bars ?? 1) : 1);

  if (!parsed || chunk.miniRange === null) {
    return <Unsupported reason="no pattern string found in this statement" />;
  }
  if (!parsed.ok) {
    return <Unsupported reason={parsed.reason} />;
  }

  const model = parsed.model;
  const bars = model.bars ?? 1;
  const steps = model.steps === 0 ? 8 : model.steps;
  const colsPerBar = steps / bars;

  const modelLanes: ViewLane[] = model.lanes.map((l) => ({
    sound: l.sound,
    part: l.part ?? 0,
    cells: padCells(l.cells, steps),
  }));
  const ghosts: ViewLane[] = ghostLanes
    .filter((s) => !modelLanes.some((l) => l.sound === s))
    .map((sound) => ({ sound, part: 0, cells: new Array(steps).fill(false) }));
  const lanes = [...modelLanes, ...ghosts].sort((a, b) => a.part - b.part || laneRank(a.sound) - laneRank(b.sound));

  const gridModel = (viewLanes: ViewLane[], nextSteps = steps): StepGridModel => ({
    steps: nextSteps,
    ...(bars > 1 ? { bars } : {}),
    lanes: viewLanes.map((l) => ({ sound: l.sound, part: l.part, cells: [...l.cells] })),
  });

  const write = (next: StepGridModel) => {
    const engine = getEngine();
    if (!engine || chunk.miniRange === null) return;
    // never write against ranges from an outdated doc
    if (!isChunkFresh(engine.view.state.doc.toString(), chunk)) return;
    replaceRange(engine.view, chunk.miniRange, serializeStepGrid(next), 'chunk.grid');
  };

  const toggleCell = (lane: ViewLane, step: number) => {
    write(
      gridModel(lanes.map((l) => (l === lane ? { ...l, cells: l.cells.map((c, i) => (i === step ? !c : c)) } : l))),
    );
  };

  const resize = (nextSteps: number) => {
    write(resizeGrid(gridModel(lanes), nextSteps, resizeMode));
  };

  const clearLane = (lane: ViewLane) => {
    write(gridModel(lanes.filter((l) => l !== lane)));
    setGhostLanes((g) => g.filter((s) => s !== lane.sound));
  };

  const laneSounds = lanes.map((l) => l.sound);
  const addableSounds = [...DRUM_SOUNDS].filter((s) => !laneSounds.includes(s)).sort((a, b) => laneRank(a) - laneRank(b));

  return (
    <div className="flex flex-col gap-3">
      {/* steps control — multi-bar resolution lives in the string, so no resize */}
      <div className="flex items-center gap-2">
        <span className="silkscreen">steps</span>
        {bars === 1 ? (
          <>
            {[4, 8, 16, 32].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => resize(n)}
                className={`h-6 rounded-sm border px-2 text-xs ${
                  steps === n
                    ? 'border-acid-dim text-acid'
                    : 'border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text'
                }`}
              >
                {n}
              </button>
            ))}
            <ResizeModeToggle mode={resizeMode} onChange={setResizeMode} />
          </>
        ) : (
          <span className="text-xs text-text-dim">
            {bars} bars × {colsPerBar}
          </span>
        )}
      </div>

      {/* grid */}
      <div className="flex flex-col gap-1.5">
        {lanes.map((lane) => (
          <div key={`${lane.part}:${lane.sound}`} className="group/lane flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => clearLane(lane)}
              title={`${DRUM_LABELS[lane.sound.split(':')[0]] ?? lane.sound} — click to clear lane`}
              className="w-10 shrink-0 truncate text-left text-xs text-text-dim hover:text-ember"
            >
              {lane.sound}
            </button>
            <div className="flex flex-1 gap-[3px]">
              {lane.cells.map((on, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCell(lane, i)}
                  className={`h-7 min-w-0 flex-1 rounded-[2px] border transition-all ${
                    bars > 1 && i > 0 && i % colsPerBar === 0 ? 'ml-1.5' : ''
                  } ${
                    on
                      ? `border-acid bg-acid/80 shadow-[0_0_6px_var(--glow)] ${i === playhead ? 'brightness-150' : ''}`
                      : i === playhead
                        ? 'border-acid-dim bg-acid/15'
                        : `border-line bg-surface-2 hover:border-line-bright ${i % 4 === 0 ? 'border-l-line-bright' : ''}`
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
        {lanes.length === 0 && <p className="text-xs text-text-faint">add an instrument to start placing hits</p>}
      </div>

      <select
        value=""
        onChange={(e) => {
          if (e.target.value) setGhostLanes((g) => [...g, e.target.value]);
        }}
        className="h-8 w-full rounded-sm border border-line bg-surface-2 px-2 text-xs text-text-dim outline-none hover:border-line-bright hover:text-text"
        aria-label="Add instrument lane"
      >
        <option value="">+ instrument</option>
        {addableSounds.map((s) => (
          <option key={s} value={s}>
            {DRUM_LABELS[s] ?? s}
          </option>
        ))}
      </select>
    </div>
  );
}

function padCells(cells: boolean[], steps: number): boolean[] {
  if (cells.length === steps) return [...cells];
  if (cells.length > steps) return cells.slice(0, steps);
  return [...cells, ...new Array(steps - cells.length).fill(false)];
}

function Unsupported({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-dim">too complex for the grid — edit as code</p>
      <p className="text-xs text-text-faint">{reason}</p>
    </div>
  );
}
