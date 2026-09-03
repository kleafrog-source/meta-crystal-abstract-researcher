'use client';

import { usePlayerStore } from '@/lib/state/store';
import { getEngine } from '@/lib/strudel/engine';
import { setAuditionRange } from '@/lib/strudel/audition';
import { scaleSpeed, setEffectArg, toggleReverse } from '@/lib/chunks/transforms';
import type { ChunkInfo } from '@/lib/chunks/detect';

function rangesEqual(a: [number, number] | null, b: [number, number]): boolean {
  return a !== null && a[0] === b[0] && a[1] === b[1];
}

const TYPE_LABEL: Record<ChunkInfo['type'], string> = {
  drums: 'drums',
  melody: 'melody',
  unknown: 'pattern',
};

export default function ChunkToolbar() {
  const chunk = usePlayerStore((s) => s.currentChunk);
  const audition = usePlayerStore((s) => s.audition);
  const setAudition = usePlayerStore((s) => s.setAudition);
  const panel = usePlayerStore((s) => s.panel);
  const setPanel = usePlayerStore((s) => s.setPanel);
  const docBroken = usePlayerStore((s) => s.docBroken);

  if (docBroken) {
    return (
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5">
        <span className="led led-warm" />
        <span className="text-xs text-ember">syntax error — chunk tools paused until the code parses</span>
      </div>
    );
  }

  if (!chunk) return null;

  const soloed = rangesEqual(audition, chunk.statementRange);

  const toggleSolo = async () => {
    const engine = getEngine();
    if (!engine) return;
    if (soloed) {
      setAuditionRange(null);
      setAudition(null);
    } else {
      setAuditionRange(chunk.statementRange);
      setAudition(chunk.statementRange);
      if (!engine.started) await engine.play();
    }
  };

  const withChunk = (fn: (view: NonNullable<ReturnType<typeof getEngine>>['view'], c: ChunkInfo) => void) => {
    const engine = getEngine();
    const current = usePlayerStore.getState().currentChunk;
    if (engine && current) fn(engine.view, current);
  };

  const tBtn =
    'h-6 rounded-sm border border-line bg-surface-2 px-2 text-xs text-text-dim transition-colors hover:border-line-bright hover:text-text';

  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5">
      <span
        className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] ${
          chunk.type === 'drums'
            ? 'border-acid-deep text-acid-dim'
            : chunk.type === 'melody'
              ? 'border-ember-dim/50 text-ember/80'
              : 'border-line text-text-faint'
        }`}
      >
        {TYPE_LABEL[chunk.type]}
      </span>
      {chunk.label && <span className="text-xs text-text-faint">{chunk.label}:</span>}
      {chunk.nested && (
        <span className="text-xs text-text-faint">
          <span className="text-acid-dim">{chunk.nested.key}</span> · in arrangement
        </span>
      )}

      <button
        type="button"
        onClick={() => setPanel('chunk')}
        className={`h-6 rounded-sm border px-2.5 text-xs transition-colors ${
          panel === 'chunk'
            ? 'border-acid-dim bg-acid/10 text-acid'
            : 'border-line bg-surface-2 text-text-dim hover:border-acid-dim hover:text-acid'
        }`}
      >
        edit
      </button>

      <button
        type="button"
        onClick={toggleSolo}
        className={`h-6 rounded-sm border px-2.5 text-xs transition-all ${
          soloed
            ? 'border-ember bg-ember/15 text-ember shadow-[0_0_8px_var(--ember-glow)]'
            : 'border-line bg-surface-2 text-text-dim hover:border-ember-dim hover:text-ember'
        }`}
      >
        solo
      </button>

      <div className="mx-1 h-4 w-px bg-line" />
      <span className="silkscreen">fx</span>
      <button type="button" className={tBtn} onClick={() => withChunk((v, c) => setEffectArg(v, c, 'room', 0.5))}>
        +room
      </button>
      <button type="button" className={tBtn} onClick={() => withChunk((v, c) => setEffectArg(v, c, 'lpf', 800))}>
        +lpf
      </button>
      <button type="button" className={tBtn} onClick={() => withChunk((v, c) => setEffectArg(v, c, 'dist', 1.5))}>
        +dist
      </button>

      <div className="mx-1 h-4 w-px bg-line" />
      <span className="silkscreen">time</span>
      <button type="button" className={tBtn} onClick={() => withChunk((v, c) => scaleSpeed(v, c, 2))}>
        ×2
      </button>
      <button type="button" className={tBtn} onClick={() => withChunk((v, c) => scaleSpeed(v, c, 0.5))}>
        ÷2
      </button>
      <button
        type="button"
        className={`${tBtn} ${chunk.chain.some((c) => c.name === 'rev') ? 'border-acid-dim text-acid' : ''}`}
        onClick={() => withChunk((v, c) => toggleReverse(v, c))}
      >
        rev
      </button>
    </div>
  );
}
