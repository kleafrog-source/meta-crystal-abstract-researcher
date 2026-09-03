'use client';

import { usePlayerStore } from '@/lib/state/store';
import { getEngine } from '@/lib/strudel/engine';
import { getKnobBindings } from '@/lib/chunks/params';
import { setEffectArg } from '@/lib/chunks/transforms';
import Knob from './Knob';

export default function EffectKnobs() {
  const chunk = usePlayerStore((s) => s.currentChunk);
  if (!chunk) return null;

  const bindings = getKnobBindings(chunk);

  const writeValue = (name: string, value: number) => {
    const engine = getEngine();
    // always act on the freshest chunk — ranges shift on every write
    const current = usePlayerStore.getState().currentChunk;
    if (engine && current) setEffectArg(engine.view, current, name, value, 'chunk.knob');
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="silkscreen">effects — drag up/down · faint knobs add the effect</span>
      <div className="flex flex-wrap gap-x-2 gap-y-3">
        {bindings.map(({ spec, bound, value, editable }) => (
          <Knob
            key={spec.name}
            label={spec.name}
            value={value}
            min={spec.min}
            max={spec.max}
            scale={spec.scale}
            ghost={!bound}
            disabled={bound && !editable}
            onChange={(v) => writeValue(spec.name, v)}
            onActivate={() => writeValue(spec.name, spec.default)}
          />
        ))}
      </div>
    </div>
  );
}
