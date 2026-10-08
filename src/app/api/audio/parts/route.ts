import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const PARTS_DIR = path.join(process.cwd(), "audio_parts");
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm", ".aac"]);

export async function GET(request: Request) {
  await fs.mkdir(PARTS_DIR, { recursive: true });
  const name = new URL(request.url).searchParams.get("name");
  if (name) {
    const safeName = path.basename(name);
    if (safeName !== name || !AUDIO_EXTENSIONS.has(path.extname(safeName).toLowerCase())) return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    try {
      const data = await fs.readFile(path.join(PARTS_DIR, safeName));
      return new NextResponse(data, { headers: { "Content-Type": mime(path.extname(safeName)), "Content-Disposition": `inline; filename="${safeName}"` } });
    } catch { return NextResponse.json({ error: "File not found" }, { status: 404 }); }
  }
  const entries = await fs.readdir(PARTS_DIR, { withFileTypes: true });
  const files = await Promise.all(entries.filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())).map(async (entry) => ({ name: entry.name, size: (await fs.stat(path.join(PARTS_DIR, entry.name))).size })));
  return NextResponse.json({ files: files.sort((a, b) => a.name.localeCompare(b.name)) });
}

function mime(extension: string) { return extension === ".wav" ? "audio/wav" : extension === ".mp3" ? "audio/mpeg" : extension === ".flac" ? "audio/flac" : extension === ".ogg" ? "audio/ogg" : extension === ".webm" ? "audio/webm" : "audio/mp4"; }
