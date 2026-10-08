import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { content?: string; originalName?: string; start?: number; end?: number; topK?: number; extension?: string };
    if (typeof body.content !== "string" || !body.content) return NextResponse.json({ error: "Macro content is required" }, { status: 400 });
    const extension = ["txt", "json", "md"].includes(body.extension ?? "") ? body.extension! : "txt";
    const stem = safeStem(body.originalName ?? "audio"); const start = timeToken(Number(body.start) || 0); const end = timeToken(Number(body.end) || 0); const topK = Math.max(1, Math.trunc(Number(body.topK) || 1));
    const dir = path.join(process.cwd(), "audio_parts"); await fs.mkdir(dir, { recursive: true });
    let version = 1; let filename = "";
    do { filename = `${stem}_${start}-${end}_top${topK}_v${version}.${extension}`; version += 1; } while (await exists(path.join(dir, filename)));
    await fs.writeFile(path.join(dir, filename), body.content, "utf8");
    return NextResponse.json({ filename });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
function safeStem(name: string) { return path.parse(path.basename(name)).name.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "audio"; }
function timeToken(value: number) { return value.toFixed(2).replace(/\.00$/, "").replace(".", "p"); }
