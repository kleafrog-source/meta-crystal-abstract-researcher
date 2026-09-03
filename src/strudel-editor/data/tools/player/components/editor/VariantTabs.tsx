'use client';

import { usePlayerStore } from '@/lib/state/store';
import { getEngine } from '@/lib/strudel/engine';
import type { ChunkInfo } from '@/lib/chunks/detect';

/**
 * Variant switcher for chunks inside a pickRestart/arrange voice: one button
 * per variant (`verse`, `chorus`, …), the active one highlighted. Clicking
 * moves the editor cursor into that variant, which re-detects the chunk and
 * swaps the grid/roll below — same selection mechanics as clicking the code.
 */
export default function VariantTabs({ chunk }: { chunk: ChunkInfo }) {
  const arrangement = usePlayerStore((s) => s.arrangement);

  const voice = arrangement?.voices.find(
    (v) => chunk.statementRange[0] >= v.statementRange[0] && chunk.statementRange[1] <= v.statementRange[1],
  );
  if (!voice) return null;

  const items =
    'variants' in voice.match
      ? voice.match.variants.map((v) => ({ key: v.key, valueRange: v.valueRange }))
      : voice.match.slots.map((s, i) => ({ key: String(i + 1), valueRange: s.valueRange }));
  if (items.length === 0) return null;

  const activeKey =
    chunk.nested && (voice.match.kind === 'arrange' ? String(Number(chunk.nested.key) + 1) : chunk.nested.key);

  const jump = (valueRange: [number, number]) => {
    const engine = getEngine();
    if (!engine) return;
    // never dispatch ranges from an outdated doc
    const doc = engine.view.state.doc.toString();
    if (doc.slice(voice.statementRange[0], voice.statementRange[1]) !== voice.statementText) return;
    engine.view.dispatch({ selection: { anchor: valueRange[0] }, scrollIntoView: true });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="silkscreen">{voice.label ?? 'variant'}</span>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => jump(item.valueRange)}
          className={`h-6 rounded-sm border px-2 text-xs ${
            item.key === activeKey
              ? 'border-acid-dim text-acid'
              : 'border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text'
          }`}
        >
          {item.key}
        </button>
      ))}
    </div>
  );
}
