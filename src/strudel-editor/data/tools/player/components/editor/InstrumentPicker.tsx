'use client';

import { useMemo } from 'react';
import { useSounds } from '@/lib/strudel/useSounds';
import { groupKits } from '@/lib/strudel/sounds';
import { removeBank, setBank, setInstrument } from '@/lib/chunks/transforms';
import { getEngine } from '@/lib/strudel/engine';
import { usePlayerStore } from '@/lib/state/store';
import type { ChunkInfo } from '@/lib/chunks/detect';

function stripQuotes(raw: string): string {
  return raw.replace(/^["'`]|["'`]$/g, '');
}

function currentInstrument(chunk: ChunkInfo): string {
  const sCall = chunk.chain.slice(1).find((c) => c.name === 's' || c.name === 'sound');
  if (sCall?.args[0]) return stripQuotes(sCall.args[0].raw);
  if (chunk.chain.slice(1).some((c) => c.name === 'piano')) return 'piano';
  return '';
}

function currentBank(chunk: ChunkInfo): string {
  const call = chunk.chain.slice(1).find((c) => c.name === 'bank');
  return call?.args[0] ? stripQuotes(call.args[0].raw) : '';
}

/** Inline kit/instrument switcher shown above the grid and roll. */
export default function InstrumentPicker({ chunk }: { chunk: ChunkInfo }) {
  const sounds = useSounds();
  const kits = useMemo(() => groupKits(sounds), [sounds]);
  const melodic = useMemo(() => sounds.filter((s) => s.kind === 'melodic'), [sounds]);

  const apply = (fn: (view: NonNullable<ReturnType<typeof getEngine>>['view'], c: ChunkInfo) => void) => {
    const engine = getEngine();
    const live = usePlayerStore.getState().currentChunk;
    if (engine && live) fn(engine.view, live);
  };

  if (chunk.type === 'drums') {
    const bank = currentBank(chunk);
    return (
      <label className="flex items-center gap-2">
        <span className="silkscreen shrink-0">kit</span>
        <select
          value={bank}
          onChange={(e) => {
            const next = e.target.value;
            apply((view, c) => (next === '' ? removeBank(view, c) : setBank(view, c, next)));
          }}
          className="h-7 min-w-0 flex-1 rounded-sm border border-line-bright bg-surface-2 px-2 text-xs text-text outline-none hover:border-acid-dim"
        >
          <option value="">default samples</option>
          {kits
            .filter((k) => k.bank !== null)
            .map((k) => (
              <option key={k.bank} value={k.bank!}>
                {k.label}
              </option>
            ))}
          {bank !== '' && !kits.some((k) => k.bank === bank) && <option value={bank}>{bank}</option>}
        </select>
      </label>
    );
  }

  if (chunk.type === 'melody') {
    const instrument = currentInstrument(chunk);
    return (
      <label className="flex items-center gap-2">
        <span className="silkscreen shrink-0">instrument</span>
        <select
          value={instrument}
          onChange={(e) => {
            const next = e.target.value;
            if (next) apply((view, c) => setInstrument(view, c, next));
          }}
          className="h-7 min-w-0 flex-1 rounded-sm border border-line-bright bg-surface-2 px-2 text-xs text-text outline-none hover:border-acid-dim"
        >
          {instrument === '' && <option value="">choose…</option>}
          {instrument !== '' && !melodic.some((s) => s.name === instrument) && (
            <option value={instrument}>{instrument}</option>
          )}
          {melodic.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return null;
}
