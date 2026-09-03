/** Export/import songs as plain .strudel files (the code itself, UTF-8). */
import { createSong, saveSong, type Song } from './songs';

export function exportSong(song: Pick<Song, 'title' | 'code'>) {
  const blob = new Blob([song.code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${song.title.replace(/[^\w\- ]+/g, '').trim() || 'song'}.strudel`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSongFile(file: File): Promise<Song> {
  const code = await file.text();
  const title = file.name.replace(/\.(strudel|js|txt)$/i, '') || 'imported song';
  const song = createSong({ title, code });
  await saveSong(song);
  return song;
}
