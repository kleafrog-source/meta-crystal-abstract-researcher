'use client';

import { usePlayerStore } from '@/lib/state/store';
import StepSequencer from '@/components/step-sequencer/StepSequencer';
import PianoRoll from '@/components/piano-roll/PianoRoll';
import EffectKnobs from '@/components/knobs/EffectKnobs';
import SoundBrowser from '@/components/sound-browser/SoundBrowser';
import InstrumentPicker from './InstrumentPicker';
import VariantTabs from './VariantTabs';

export default function ChunkPanel() {
  const panel = usePlayerStore((s) => s.panel);
  const chunk = usePlayerStore((s) => s.currentChunk);
  const docBroken = usePlayerStore((s) => s.docBroken);

  if (panel === null) return null;

  const title =
    panel === 'sounds'
      ? 'sound browser'
      : chunk?.type === 'drums'
        ? 'step sequencer'
        : chunk?.type === 'melody'
          ? 'piano roll'
          : 'chunk editor';

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex items-center border-b border-line px-4 py-2">
        <span className="silkscreen">{title}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {panel === 'sounds' ? (
          <SoundBrowser />
        ) : docBroken ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ember">the code has a syntax error</p>
            <p className="text-xs text-text-faint">
              chunk editing is paused until it parses again — check the highlighted line in the editor
            </p>
          </div>
        ) : !chunk ? (
          <p className="text-xs text-text-faint">click into a pattern statement to edit it here</p>
        ) : (
          <>
            <VariantTabs chunk={chunk} />
            <InstrumentPicker chunk={chunk} />
            {chunk.type === 'drums' && <StepSequencer chunk={chunk} />}
            {chunk.type === 'melody' && <PianoRoll chunk={chunk} />}
            {chunk.type === 'unknown' && (
              <p className="text-xs text-text-faint">no grid/roll for this pattern — effects below still apply</p>
            )}
            <div className="border-t border-line pt-4">
              <EffectKnobs />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
