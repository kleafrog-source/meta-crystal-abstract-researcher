/**
 * Load the Strudel evaluation scope and default sound palette.
 * Mirrors @strudel/repl's prebake so code written here also runs on strudel.cc.
 * Browser-only — must never be imported during SSR.
 */
import { evalScope, noteToMidi, valueToMidi, Pattern } from '@strudel/core';
import * as core from '@strudel/core';
import { aliasBank, registerSynthSounds, registerZZFXSounds, samples } from '@strudel/webaudio';

const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
const UZU = 'https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main';
const ALIASES = 'https://raw.githubusercontent.com/todepond/samples/main';

let prebaked: Promise<void> | null = null;

export function prebake(): Promise<void> {
  prebaked ??= doPrebake();
  return prebaked;
}

async function doPrebake() {
  const modulesLoading = evalScope(
    core,
    import('@strudel/draw'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/webaudio'),
    import('@strudel/codemirror'),
  );
  await Promise.all([
    modulesLoading,
    registerSynthSounds(),
    registerZZFXSounds(),
    samples(`${DOUGH}/tidal-drum-machines.json`),
    samples(`${DOUGH}/piano.json`),
    samples(`${DOUGH}/Dirt-Samples.json`),
    samples(`${DOUGH}/vcsl.json`),
    samples(`${DOUGH}/mridangam.json`),
    samples(`${UZU}/strudel.json`),
  ]);
  aliasBank(`${ALIASES}/tidal-drum-machines-alias.json`);
  registerPianoHelper();
}

/** Same `.piano()` sugar the strudel.cc REPL ships (pitch-panned piano samples). */
/* eslint-disable @typescript-eslint/no-explicit-any */
function registerPianoHelper() {
  const maxPan = noteToMidi('C8');
  const panwidth = (pan: number, width: number) => pan * width + (1 - width) / 2;
  (Pattern.prototype as any).piano = function (this: any) {
    return this.fmap((v: any) => ({ ...v, clip: v.clip ?? 1 }))
      .s('piano')
      .release(0.1)
      .fmap((value: any) => {
        const midi = valueToMidi(value);
        const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5);
        return { ...value, pan: (value.pan || 1) * pan };
      });
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
