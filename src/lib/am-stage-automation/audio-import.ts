import { promises as fs } from "node:fs";
import path from "node:path";

const AUDIO_TYPES: Record<string, string> = {
  ".aac": "audio/aac", ".flac": "audio/flac", ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg",
  ".wav": "audio/wav", ".webm": "audio/webm",
};
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;

export type ImportAudioEntry = { name: string; sizeBytes: number; mimeType: string; modifiedAt: string };

export function isPathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function listAllowedAudioImports(configuredRoot = process.env.AM_STAGE_AUDIO_IMPORT_DIR): Promise<ImportAudioEntry[]> {
  if (!configuredRoot?.trim()) throw new Error("AM_STAGE_AUDIO_IMPORT_DIR is not configured.");
  const root = await fs.realpath(path.resolve(configuredRoot));
  const entries = await fs.readdir(root, { withFileTypes: true });
  const audio: ImportAudioEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    const mimeType = AUDIO_TYPES[extension];
    if (!mimeType) continue;
    try {
      const resolved = await fs.realpath(path.join(root, entry.name));
      if (!isPathInside(root, resolved)) continue;
      const stat = await fs.stat(resolved);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_AUDIO_BYTES) continue;
      audio.push({ name: entry.name, sizeBytes: stat.size, mimeType, modifiedAt: stat.mtime.toISOString() });
    } catch {
      // Ignore broken links and files that disappear while listing.
    }
  }
  return audio.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function readAllowedAudioImport(name: string, configuredRoot = process.env.AM_STAGE_AUDIO_IMPORT_DIR) {
  if (!configuredRoot?.trim()) throw new Error("AM_STAGE_AUDIO_IMPORT_DIR is not configured.");
  if (!name || name !== path.basename(name) || name.includes("/") || name.includes("\\") || /[\u0000-\u001f]/u.test(name)) {
    throw new Error("Choose a file from the listed import folder.");
  }
  const root = await fs.realpath(path.resolve(configuredRoot));
  const candidate = await fs.realpath(path.join(root, name));
  if (!isPathInside(root, candidate)) throw new Error("The selected file resolves outside the allowed import folder.");
  const extension = path.extname(name).toLowerCase();
  const mimeType = AUDIO_TYPES[extension];
  if (!mimeType) throw new Error("This file type is not supported for audio import.");
  const stat = await fs.stat(candidate);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_AUDIO_BYTES) throw new Error("Audio file must be between 1 byte and 150 MiB.");
  const bytes = await fs.readFile(candidate);
  return { name, mimeType, sizeBytes: bytes.byteLength, bytes: new Uint8Array(bytes) };
}
