'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePlayerStore } from '@/lib/state/store';
import { getEngine } from '@/lib/strudel/engine';
import MasterScope from '@/components/visualizer/MasterScope';
import { useSongPosition } from './useSongPosition';
import { formatPosition } from '@/lib/timeline/format';
import { applyLoopRegion, skipSection } from '@/lib/timeline/actions';

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M2.5 1.5 12.5 7 2.5 12.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2.5" width="9" height="9" />
    </svg>
  );
}

interface TransportBarProps {
  title: string;
  onTitleChange?: (title: string) => void;
  onShare?: () => void | Promise<void>;
  onExport?: () => void;
  onReset?: () => void;
}

export default function TransportBar({ title, onTitleChange, onShare, onExport, onReset }: TransportBarProps) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const ready = usePlayerStore((s) => s.ready);
  const bpm = usePlayerStore((s) => s.bpm);
  const setBpm = usePlayerStore((s) => s.setBpm);
  const panel = usePlayerStore((s) => s.panel);
  const setPanel = usePlayerStore((s) => s.setPanel);
  const timeline = usePlayerStore((s) => s.timeline);
  const loopRegion = usePlayerStore((s) => s.loopRegion);
  const timelineOpen = usePlayerStore((s) => s.timelineOpen);
  const setTimelineOpen = usePlayerStore((s) => s.setTimelineOpen);
  const [shared, setShared] = useState(false);
  const songPos = useSongPosition();
  const [lastLoop, setLastLoop] = useState<[number, number] | null>(null);

  const hasSections = (timeline?.sections.length ?? 0) > 1;

  const toggleLoop = () => {
    if (loopRegion) {
      setLastLoop(loopRegion);
      void applyLoopRegion(null);
    } else if (lastLoop) {
      void applyLoopRegion(lastLoop);
    }
  };

  const share = async () => {
    await onShare?.();
    setShared(true);
    setTimeout(() => setShared(false), 1600);
  };

  const changeBpm = (next: number) => {
    const clamped = Math.min(300, Math.max(20, Math.round(next)));
    setBpm(clamped);
    getEngine()?.setBpm(clamped);
  };

  return (
    <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5">
      <Link href="/" title="all songs">
        <h1 className="font-display text-sm font-black tracking-[0.25em] text-acid select-none transition-[text-shadow] hover:[text-shadow:0_0_12px_var(--glow)]">
          PLAYER
        </h1>
      </Link>

      <div className="h-5 w-px bg-line" />

      {/* transport */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => getEngine()?.toggle()}
          aria-label={isPlaying ? 'Stop' : 'Play'}
          className={`flex h-9 w-12 items-center justify-center rounded-sm border transition-all active:translate-y-px ${
            isPlaying
              ? 'border-ember-dim bg-ember/15 text-ember shadow-[0_0_12px_var(--ember-glow)]'
              : 'border-line-bright bg-surface-2 text-acid hover:border-acid-dim hover:shadow-[0_0_10px_var(--glow)]'
          }`}
        >
          {isPlaying ? <StopIcon /> : <PlayIcon />}
        </button>
        <div className="flex items-center gap-2 pl-1">
          <span className={`led ${!ready ? 'led-loading' : isPlaying ? 'led-warm' : 'led-on'}`} />
          <span className="silkscreen w-14">{!ready ? 'loading' : isPlaying ? 'playing' : 'ready'}</span>
        </div>
      </div>

      <div className="h-5 w-px bg-line" />

      {/* tempo */}
      <div className="flex items-center gap-1.5">
        <span className="silkscreen">bpm</span>
        <button
          type="button"
          onClick={() => changeBpm(bpm - 1)}
          className="h-7 w-7 rounded-sm border border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text"
          aria-label="Decrease tempo"
        >
          −
        </button>
        <input
          type="number"
          value={bpm}
          min={20}
          max={300}
          onChange={(e) => changeBpm(Number(e.target.value))}
          className="h-7 w-14 rounded-sm border border-line bg-background px-1 text-center text-sm text-acid tabular-nums outline-none focus:border-acid-dim [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label="Tempo in BPM"
        />
        <button
          type="button"
          onClick={() => changeBpm(bpm + 1)}
          className="h-7 w-7 rounded-sm border border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text"
          aria-label="Increase tempo"
        >
          +
        </button>
      </div>

      <div className="h-5 w-px bg-line" />

      {/* song position */}
      <div className="flex items-center gap-1.5">
        <span className="silkscreen">cycle</span>
        <button
          type="button"
          onClick={() => setTimelineOpen(!timelineOpen)}
          title="toggle timeline"
          className="h-7 min-w-16 rounded-sm border border-line bg-background px-2 text-center text-sm text-acid tabular-nums hover:border-acid-dim"
        >
          {formatPosition(songPos ?? 0, timeline?.cycles)}
        </button>
        <button
          type="button"
          onClick={() => void skipSection(-1)}
          disabled={!hasSections}
          aria-label="Previous section"
          className="h-7 w-7 rounded-sm border border-line bg-surface-2 text-text-dim enabled:hover:border-line-bright enabled:hover:text-text disabled:opacity-40"
        >
          ⇤
        </button>
        <button
          type="button"
          onClick={() => void skipSection(1)}
          disabled={!hasSections}
          aria-label="Next section"
          className="h-7 w-7 rounded-sm border border-line bg-surface-2 text-text-dim enabled:hover:border-line-bright enabled:hover:text-text disabled:opacity-40"
        >
          ⇥
        </button>
        <button
          type="button"
          onClick={toggleLoop}
          disabled={!loopRegion && !lastLoop}
          aria-label="Toggle loop region"
          className={`h-7 rounded-sm border px-2 text-xs transition-colors disabled:opacity-40 ${
            loopRegion
              ? 'border-acid-dim text-acid shadow-[0_0_8px_var(--glow)]'
              : 'border-line bg-surface-2 text-text-dim enabled:hover:border-line-bright enabled:hover:text-text'
          }`}
        >
          loop
        </button>
      </div>

      <div className="hidden lg:block">
        <MasterScope />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => getEngine()?.undo()}
          title="undo (⌘Z)"
          aria-label="Undo"
          className="h-7 w-7 rounded-sm border border-line bg-surface-2 text-sm leading-none text-text-dim hover:border-line-bright hover:text-text"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={() => getEngine()?.redo()}
          title="redo (⇧⌘Z)"
          aria-label="Redo"
          className="h-7 w-7 rounded-sm border border-line bg-surface-2 text-sm leading-none text-text-dim hover:border-line-bright hover:text-text"
        >
          ↪
        </button>
        <div className="h-5 w-px bg-line" />
        <button
          type="button"
          onClick={() => setTimelineOpen(!timelineOpen)}
          className={`h-7 rounded-sm border px-3 text-xs transition-colors ${
            timelineOpen
              ? 'border-acid-dim text-acid'
              : 'border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text'
          }`}
        >
          song
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === 'sounds' ? 'chunk' : 'sounds')}
          className={`h-7 rounded-sm border px-3 text-xs transition-colors ${
            panel === 'sounds'
              ? 'border-acid-dim text-acid'
              : 'border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text'
          }`}
        >
          sounds
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange?.(e.target.value)}
          spellCheck={false}
          aria-label="Song title"
          className="h-7 w-44 rounded-sm border border-transparent bg-transparent px-2 text-right text-sm text-text outline-none transition-colors hover:border-line focus:border-acid-dim focus:bg-background"
        />
        <button
          type="button"
          onClick={share}
          className={`h-7 rounded-sm border px-3 text-xs transition-colors ${
            shared
              ? 'border-acid-dim text-acid'
              : 'border-line bg-surface-2 text-text-dim hover:border-line-bright hover:text-text'
          }`}
        >
          {shared ? 'copied!' : 'share'}
        </button>
        <button
          type="button"
          onClick={onExport}
          className="h-7 rounded-sm border border-line bg-surface-2 px-3 text-xs text-text-dim hover:border-line-bright hover:text-text"
        >
          export
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-7 rounded-sm border border-line bg-surface-2 px-3 text-xs text-text-dim hover:border-ember-dim hover:text-ember"
        >
          reset
        </button>
        <Link
          href="/"
          className="h-7 rounded-sm border border-line bg-surface-2 px-3 text-xs leading-7 text-text-dim hover:border-line-bright hover:text-text"
        >
          songs
        </Link>
      </div>
    </header>
  );
}
