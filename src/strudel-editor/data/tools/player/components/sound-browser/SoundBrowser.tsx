'use client';

import { useMemo, useState } from 'react';
import { superdough, getAudioContext } from '@strudel/webaudio';
import { useSounds } from '@/lib/strudel/useSounds';
import { getEngine } from '@/lib/strudel/engine';
import { insideStringLiteral } from '@/lib/chunks/detect';
import { removeBank, setBank, setInstrument } from '@/lib/chunks/transforms';
import { groupKits, type KitInfo, type SoundInfo, type SoundKind } from '@/lib/strudel/sounds';
import { DRUM_SOUNDS, miniAtoms } from '@/lib/chunks/classify';
import { usePlayerStore } from '@/lib/state/store';

type Tab = SoundKind | 'all';

const RENDER_CAP = 250;

/** drum codes used by the selected line, e.g. ["bd","sd"] */
function chunkDrumCodes(): string[] {
  const chunk = usePlayerStore.getState().currentChunk;
  if (!chunk || chunk.type !== 'drums') return [];
  return [...new Set(miniAtoms(chunk.miniString ?? '').map((a) => a.split(':')[0]))].filter((c) => DRUM_SOUNDS.has(c));
}

export default function SoundBrowser() {
  const sounds = useSounds();
  const chunk = usePlayerStore((s) => s.currentChunk);
  const [query, setQuery] = useState('');
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);

  // follow the selected chunk (drum line → kits, melody → instruments),
  // letting a manual tab choice stick until the chunk type changes
  const chunkType = chunk?.type ?? null;
  const autoTab: Tab = chunkType === 'drums' ? 'drum' : chunkType === 'melody' ? 'melodic' : 'all';
  const [override, setOverride] = useState<{ forType: string | null; tab: Tab } | null>(null);
  const tab = override && override.forType === chunkType ? override.tab : autoTab;
  const setTab = (next: Tab) => setOverride({ forType: chunkType, tab: next });

  const kits = useMemo(() => groupKits(sounds), [sounds]);

  const q = query.trim().toLowerCase();
  const filteredSounds = useMemo(
    () =>
      sounds.filter(
        (s) =>
          (tab === 'all' || s.kind === tab) &&
          (!q || s.name.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)),
      ),
    [sounds, q, tab],
  );
  const filteredKits = useMemo(
    () => kits.filter((k) => !q || k.label.toLowerCase().includes(q) || (k.bank ?? '').toLowerCase().includes(q)),
    [kits, q],
  );

  const oneShot = async (name: string) => {
    try {
      await getAudioContext().resume();
      await superdough({ s: name }, getAudioContext().currentTime + 0.02, 0.75);
    } catch {
      // some entries can't one-shot; ignore
    }
  };

  const previewSound = async (sound: SoundInfo) => {
    try {
      await getAudioContext().resume();
      const value = sound.kind === 'melodic' ? { s: sound.name, note: 'c4' } : { s: sound.name };
      await superdough(value, getAudioContext().currentTime + 0.02, 0.75);
      setLastPlayed(sound.name);
    } catch {
      /* ignore */
    }
  };

  const previewKit = (kit: KitInfo) => {
    const piece = kit.pieces.includes('bd') ? 'bd' : kit.pieces[0];
    if (!piece) return;
    void oneShot(kit.bank ? `${kit.bank}_${piece}` : piece);
    setLastPlayed(kit.bank ?? 'default');
  };

  /** Primary action for an individual-sound row. */
  const actionFor = (sound: SoundInfo): { label: string; run: () => void } => {
    const current = usePlayerStore.getState().currentChunk;
    const engine = getEngine();
    if (engine && current && current.type === 'melody' && sound.kind === 'melodic') {
      return { label: 'use', run: () => setInstrument(engine.view, current, sound.name) };
    }
    return { label: 'insert', run: () => insertAtCursor(sound.name) };
  };

  /** Primary action for a kit row. */
  const kitActionFor = (kit: KitInfo): { label: string; warn?: string; run: () => void } => {
    const engine = getEngine();
    const current = usePlayerStore.getState().currentChunk;
    if (engine && current && current.type === 'drums') {
      const missing = chunkDrumCodes().filter((c) => !kit.pieces.includes(c));
      return {
        label: kit.bank ? 'use kit' : 'use default',
        warn: missing.length > 0 ? `no ${missing.join(', ')}` : undefined,
        run: () => {
          const live = usePlayerStore.getState().currentChunk;
          if (!live) return;
          if (kit.bank) setBank(engine.view, live, kit.bank);
          else removeBank(engine.view, live);
          if (missing.length > 0) {
            usePlayerStore
              .getState()
              .setError(`the ${kit.label} kit has no ${missing.join(', ')} — those hits will stay silent`);
          }
        },
      };
    }
    // no drum line selected: start one with this kit
    return {
      label: 'insert',
      run: () => {
        const p1 = kit.pieces.includes('bd') ? 'bd' : kit.pieces[0];
        const p2 = kit.pieces.includes('sd') ? 'sd' : (kit.pieces[1] ?? p1);
        if (!p1) return;
        const statement = `$: s("${p1} ~ ${p2} ~")${kit.bank ? `.bank("${kit.bank}")` : ''}`;
        insertStatement(statement);
      },
    };
  };

  const insertStatement = (statement: string) => {
    const engine = getEngine();
    if (!engine) return;
    const view = engine.view;
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const onBlankLine = line.text.trim() === '';
    const text = onBlankLine ? statement : `\n${statement}`;
    const at = onBlankLine ? from : line.to;
    view.dispatch({
      changes: { from: at, to: onBlankLine ? to : at, insert: text },
      selection: { anchor: at + text.length },
    });
    view.focus();
  };

  const insertAtCursor = (name: string) => {
    const engine = getEngine();
    if (!engine) return;
    const view = engine.view;
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc.toString();

    if (insideStringLiteral(doc, from)) {
      // a .bank() line prefixes every hit name — full sound names won't resolve there
      const current = usePlayerStore.getState().currentChunk;
      const lineHasBank = current?.chain.slice(1).some((c) => c.name === 'bank') ?? false;
      if (lineHasBank && name.includes('_')) {
        usePlayerStore
          .getState()
          .setError(`this line has a .bank() that prefixes hit names — "${name}" won’t resolve; swap the kit instead`);
      }
      // inside a mini string or string arg: replace the token under the
      // cursor (splicing into the middle of a word mangles it)
      let a = from;
      let b = to;
      if (a === b) {
        while (a > 0 && /[\w:#]/.test(doc[a - 1])) a--;
        while (b < doc.length && /[\w:#]/.test(doc[b])) b++;
      }
      view.dispatch({
        changes: { from: a, to: b, insert: name },
        selection: { anchor: a + name.length },
      });
      view.focus();
    } else {
      insertStatement(`$: s("${name}")`);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'drum', label: 'kits' },
    { key: 'melodic', label: 'melodic' },
    { key: 'misc', label: 'misc' },
    { key: 'all', label: 'all' },
  ];

  const showingKits = tab === 'drum';
  const count = showingKits ? filteredKits.length : filteredSounds.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 gap-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`h-6 rounded-sm border px-2 text-xs ${
              tab === key
                ? 'border-acid-dim bg-acid/10 text-acid'
                : 'border-line-bright bg-surface-2 text-text hover:border-acid-dim hover:text-acid'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`search ${count} ${showingKits ? 'kits' : 'sounds'}…`}
        spellCheck={false}
        className="h-8 shrink-0 rounded-sm border border-line bg-background px-2 text-sm text-text outline-none placeholder:text-text-faint focus:border-acid-dim"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col">
          {showingKits
            ? filteredKits.map((kit) => {
                const action = kitActionFor(kit);
                const key = kit.bank ?? 'default';
                return (
                  <li key={key} className="group flex items-center gap-2 border-b border-line/50">
                    <button
                      type="button"
                      onClick={() => previewKit(kit)}
                      title="preview"
                      aria-label={`preview ${kit.label}`}
                      className={`shrink-0 rounded-sm px-1 text-sm ${
                        lastPlayed === key ? 'text-acid' : 'text-text-faint hover:text-acid'
                      }`}
                    >
                      ▸
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        action.run();
                        setLastPlayed(key);
                      }}
                      title={action.label}
                      className="min-w-0 flex-1 truncate py-1.5 text-left"
                    >
                      <span
                        className={`text-xs ${lastPlayed === key ? 'text-acid' : 'text-text group-hover:text-acid'}`}
                      >
                        {kit.label}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-text-faint">
                        {kit.pieces.join(' ')}
                      </span>
                    </button>
                    {action.warn && <span className="shrink-0 text-[10px] text-ember/70">{action.warn}</span>}
                    <span className="shrink-0 pr-1 text-[10px] text-acid-dim opacity-0 transition-opacity group-hover:opacity-100">
                      {action.label}
                    </span>
                  </li>
                );
              })
            : filteredSounds.slice(0, RENDER_CAP).map((sound) => {
                const action = actionFor(sound);
                return (
                  <li key={sound.name} className="group flex items-center gap-2 border-b border-line/50">
                    <button
                      type="button"
                      onClick={() => previewSound(sound)}
                      title="preview"
                      aria-label={`preview ${sound.label}`}
                      className={`shrink-0 rounded-sm px-1 text-sm ${
                        lastPlayed === sound.name ? 'text-acid' : 'text-text-faint hover:text-acid'
                      }`}
                    >
                      ▸
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        action.run();
                        setLastPlayed(sound.name);
                      }}
                      title={action.label}
                      className="min-w-0 flex-1 truncate py-1.5 text-left"
                    >
                      <span
                        className={`text-xs ${lastPlayed === sound.name ? 'text-acid' : 'text-text group-hover:text-acid'}`}
                      >
                        {sound.label}
                      </span>
                      {sound.variants > 1 && <span className="text-xs text-text-faint"> ×{sound.variants}</span>}
                      {sound.label !== sound.name && (
                        <span className="block truncate font-mono text-[10px] text-text-faint">{sound.name}</span>
                      )}
                    </button>
                    <span className="shrink-0 pr-1 text-[10px] text-acid-dim opacity-0 transition-opacity group-hover:opacity-100">
                      {action.label}
                    </span>
                  </li>
                );
              })}
        </ul>
        {!showingKits && filteredSounds.length > RENDER_CAP && (
          <p className="py-2 text-center text-[10px] text-text-faint">
            {filteredSounds.length - RENDER_CAP} more — refine your search
          </p>
        )}
        {count === 0 && <p className="py-4 text-center text-xs text-text-faint">nothing matches</p>}
      </div>
      <p className="silkscreen shrink-0">
        ▸ previews · click a row to{' '}
        {showingKits && chunkType === 'drums'
          ? 'swap this line’s drum kit'
          : chunkType === 'melody' && tab === 'melodic'
            ? 'swap this line’s instrument'
            : 'insert at the cursor'}
      </p>
    </div>
  );
}
