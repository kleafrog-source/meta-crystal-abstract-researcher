'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteSong, duplicateSong, listSongs, type Song } from '@/lib/persistence/songs';
import { importSongFile } from '@/lib/persistence/export';

function formatWhen(ts: number): string {
  const delta = Date.now() - ts;
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function SongBrowser() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listSongs().then(setSongs);

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-6 py-14">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-black tracking-[0.3em] text-acid">PLAYER</h1>
          <p className="mt-2 text-xs text-text-dim">build songs with strudel code + visual editors</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="h-9 rounded-sm border border-line bg-surface-2 px-4 text-xs text-text-dim hover:border-line-bright hover:text-text"
          >
            import
          </button>
          <Link
            href="/song/new"
            className="flex h-9 items-center rounded-sm border border-acid-dim bg-surface-2 px-4 text-xs text-acid transition-shadow hover:shadow-[0_0_14px_var(--glow)]"
          >
            + new song
          </Link>
          <input
            ref={fileInput}
            type="file"
            accept=".strudel,.js,.txt"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const song = await importSongFile(file);
              router.push(`/song/${song.id}`);
            }}
          />
        </div>
      </header>

      <div className="silkscreen border-b border-line pb-2">songs</div>

      {songs === null ? (
        <div className="flex items-center gap-3">
          <span className="led led-loading" />
          <span className="silkscreen">loading</span>
        </div>
      ) : songs.length === 0 ? (
        <p className="text-sm text-text-faint">
          no songs yet — start a{' '}
          <Link href="/song/new" className="text-acid-dim underline underline-offset-4 hover:text-acid">
            new one
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {songs.map((song) => (
            <li
              key={song.id}
              className="group flex items-center gap-4 rounded-sm border border-line bg-surface px-4 py-3 transition-colors hover:border-line-bright"
            >
              <Link href={`/song/${song.id}`} className="flex min-w-0 flex-1 items-baseline gap-3">
                <span className="truncate text-sm text-text group-hover:text-acid">{song.title}</span>
                <span className="shrink-0 text-xs text-text-faint">{formatWhen(song.updatedAt)}</span>
              </Link>
              <code className="hidden max-w-64 truncate text-xs text-text-faint sm:block">
                {song.code.split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? ''}
              </code>
              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={async () => {
                    await duplicateSong(song.id);
                    refresh();
                  }}
                  className="rounded-sm border border-line px-2 py-1 text-xs text-text-dim hover:text-text"
                >
                  dup
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Delete "${song.title}"?`)) {
                      await deleteSong(song.id);
                      refresh();
                    }
                  }}
                  className="rounded-sm border border-line px-2 py-1 text-xs text-text-dim hover:border-ember-dim hover:text-ember"
                >
                  del
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
