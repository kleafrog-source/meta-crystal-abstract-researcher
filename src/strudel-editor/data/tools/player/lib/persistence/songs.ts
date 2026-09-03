/** Local-first song storage in IndexedDB (browser-only). */
import { get, set, del, keys } from 'idb-keyval';
import { nanoid } from 'nanoid';

export interface Song {
  id: string;
  title: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

const PREFIX = 'song:';

export async function listSongs(): Promise<Song[]> {
  const allKeys = (await keys()) as string[];
  const songKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
  const songs = await Promise.all(songKeys.map((k) => get<Song>(k)));
  return songs.filter((s): s is Song => !!s).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSong(id: string): Promise<Song | null> {
  return (await get<Song>(PREFIX + id)) ?? null;
}

export async function saveSong(song: Song): Promise<void> {
  await set(PREFIX + song.id, song);
}

export async function deleteSong(id: string): Promise<void> {
  await del(PREFIX + id);
}

export function createSong(partial?: Partial<Pick<Song, 'title' | 'code'>>): Song {
  const now = Date.now();
  return {
    id: nanoid(10),
    title: partial?.title ?? 'untitled',
    code: partial?.code ?? '',
    createdAt: now,
    updatedAt: now,
  };
}

export async function duplicateSong(id: string): Promise<Song | null> {
  const source = await getSong(id);
  if (!source) return null;
  const copy = createSong({ title: `${source.title} copy`, code: source.code });
  await saveSong(copy);
  return copy;
}
