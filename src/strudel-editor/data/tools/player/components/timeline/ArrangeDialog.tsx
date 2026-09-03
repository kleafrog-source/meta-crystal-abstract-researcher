'use client';

import { useState } from 'react';
import { getEngine } from '@/lib/strudel/engine';
import { detectAllChunks, type ChunkInfo } from '@/lib/chunks/detect';
import { authorArrangement, DEFAULT_PLAN, validatePlan, type SectionSpec } from '@/lib/timeline/author';
import { replaceRanges } from '@/lib/codemirror/writeback';

interface Props {
  onClose: () => void;
}

/**
 * "Make this a song": pick a section plan and which statements become
 * voices; each becomes an object-form pickRestart with one variant per
 * section. One atomic write — one Cmd+Z restores the original loops.
 */
export default function ArrangeDialog({ onClose }: Props) {
  const [plan, setPlan] = useState<SectionSpec[]>(DEFAULT_PLAN.map((s) => ({ ...s })));
  const [chunks] = useState<ChunkInfo[]>(() => {
    const engine = getEngine();
    return engine ? detectAllChunks(engine.code) : [];
  });
  const [included, setIncluded] = useState<boolean[]>(() => chunks.map(() => true));

  const planError = validatePlan(plan);
  const totalCycles = plan.reduce((sum, s) => sum + s.cycles, 0);
  const anyIncluded = included.some(Boolean);

  const updateSection = (i: number, patch: Partial<SectionSpec>) =>
    setPlan((p) => p.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const confirm = () => {
    const engine = getEngine();
    if (!engine || planError) return;
    const selected = chunks.filter((_, i) => included[i]);
    const edits = authorArrangement(engine.code, selected, plan);
    if (!edits) return; // doc changed under the dialog — bail rather than corrupt
    replaceRanges(engine.view, edits, 'timeline.author');
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/70" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 z-50 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-line-bright bg-surface p-4 shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="silkscreen">make this a song</span>
          <span className="text-[10px] text-text-faint tabular-nums">{totalCycles} cycles</span>
        </div>

        <div className="mb-1 silkscreen">sections</div>
        <div className="mb-3 flex flex-col gap-1">
          {plan.map((section, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={section.name}
                onChange={(e) => updateSection(i, { name: e.target.value })}
                spellCheck={false}
                aria-label={`Section ${i + 1} name`}
                className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-background px-2 text-xs text-text outline-none focus:border-acid-dim"
              />
              <input
                type="number"
                value={section.cycles}
                min={1}
                onChange={(e) => updateSection(i, { cycles: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                aria-label={`Section ${i + 1} cycles`}
                className="h-7 w-14 rounded-sm border border-line bg-background px-1 text-center text-xs text-acid tabular-nums outline-none focus:border-acid-dim [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="silkscreen">cyc</span>
              <button
                type="button"
                onClick={() => setPlan((p) => p.filter((_, j) => j !== i))}
                disabled={plan.length === 1}
                aria-label={`Remove section ${i + 1}`}
                className="h-7 w-7 rounded-sm border border-line text-xs text-text-dim enabled:hover:border-ember-dim enabled:hover:text-ember disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPlan((p) => [...p, { name: `part${p.length + 1}`, cycles: 4 }])}
            className="h-7 self-start rounded-sm border border-line bg-surface-2 px-2 text-xs text-text-dim hover:border-line-bright hover:text-text"
          >
            + section
          </button>
        </div>

        <div className="mb-1 silkscreen">voices</div>
        <div className="mb-3 flex max-h-40 flex-col gap-1 overflow-y-auto">
          {chunks.length === 0 && <span className="text-xs text-text-faint">no pattern statements found</span>}
          {chunks.map((chunk, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 text-xs text-text-dim hover:text-text">
              <input
                type="checkbox"
                checked={included[i]}
                onChange={(e) => setIncluded((arr) => arr.map((v, j) => (j === i ? e.target.checked : v)))}
                className="accent-(--acid)"
              />
              <span className="truncate font-mono">
                {chunk.miniString ?? chunk.statementText.slice(0, 40)}
              </span>
            </label>
          ))}
        </div>

        {planError && <div className="mb-2 text-xs text-ember">{planError}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded-sm border border-line bg-surface-2 px-3 text-xs text-text-dim hover:border-line-bright hover:text-text"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!!planError || !anyIncluded}
            className="h-7 rounded-sm border border-acid-dim bg-acid/10 px-3 text-xs text-acid transition-all enabled:hover:shadow-[0_0_10px_var(--glow)] disabled:opacity-40"
          >
            arrange
          </button>
        </div>
      </div>
    </>
  );
}
