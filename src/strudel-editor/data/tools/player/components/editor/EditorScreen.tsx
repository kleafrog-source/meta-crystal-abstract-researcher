'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import StrudelEditor from './StrudelEditor';
import TransportBar from './TransportBar';
import ChunkToolbar from './ChunkToolbar';
import ChunkPanel from './ChunkPanel';
import TimelineStrip from '@/components/timeline/TimelineStrip';
import { usePlayerStore } from '@/lib/state/store';
import { createSong, getSong, saveSong, type Song } from '@/lib/persistence/songs';
import { buildShareUrl } from '@/lib/persistence/share';
import { exportSong } from '@/lib/persistence/export';
import { getEngine } from '@/lib/strudel/engine';
import { STARTER_CODE } from '@/lib/songs/starter';

export default function EditorScreen({ songId }: { songId: string }) {
  const router = useRouter();
  const error = usePlayerStore((s) => s.error);
  const [song, setSong] = useState<Song | null>(null);
  const songRef = useRef<Song | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (songId === 'new') {
        const fresh = createSong({ code: STARTER_CODE });
        await saveSong(fresh);
        router.replace(`/song/${fresh.id}`);
        return;
      }
      const loaded = await getSong(songId);
      if (cancelled) return;
      if (!loaded) {
        router.replace('/');
        return;
      }
      songRef.current = loaded;
      setSong(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [songId, router]);

  const persist = (patch: Partial<Song>) => {
    const current = songRef.current;
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    songRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveSong(next), 800);
  };

  // global undo/redo — the CodeMirror editor and native inputs handle their
  // own keymaps; this covers focus anywhere else (grid, roll, knobs, strip)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
      const isUndo = key === 'z' && !e.shiftKey;
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('.cm-editor, input, textarea, select, [contenteditable="true"]')) return;
      const engine = getEngine();
      if (!engine) return;
      e.preventDefault();
      if (isRedo) engine.redo();
      else engine.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // flush pending save when leaving the page
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current && songRef.current) {
        clearTimeout(saveTimer.current);
        void saveSong(songRef.current);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  if (!song) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="led led-loading" />
          <span className="silkscreen">loading song</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <TransportBar
        title={song.title}
        onTitleChange={(title) => {
          setSong((s) => (s ? { ...s, title } : s));
          persist({ title });
        }}
        onShare={async () => {
          const current = songRef.current;
          if (!current) return;
          await navigator.clipboard.writeText(buildShareUrl(current.title, current.code));
        }}
        onExport={() => {
          const current = songRef.current;
          if (current) exportSong(current);
        }}
        onReset={() => {
          if (confirm('Replace this song’s code with the default starter pattern? This can be undone with Cmd+Z.')) {
            getEngine()?.setCode(STARTER_CODE);
          }
        }}
      />

      <TimelineStrip />
      <ChunkToolbar />

      <main className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <StrudelEditor key={song.id} initialCode={song.code} onDocChange={(code) => persist({ code })} />
        </section>
        <ChunkPanel />
      </main>

      <footer className="flex h-8 items-center gap-3 border-t border-line bg-surface px-4">
        {error ? (
          <>
            <span className="led led-warm" />
            <span className="truncate text-xs text-ember">{error}</span>
          </>
        ) : (
          <span className="silkscreen">ctrl+enter to evaluate · ctrl+. to stop</span>
        )}
      </footer>
    </div>
  );
}
