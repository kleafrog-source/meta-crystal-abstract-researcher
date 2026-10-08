import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { callSidecar } from "@/lib/engine/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(request: Request) {
  let tempDir: string | null = null;
  try {
    const form = await request.formData(); const audio = form.get("audio");
    if (!(audio instanceof File) || !audio.size) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    const offset = Math.max(0, Number(form.get("offset")) || 0); const duration = Math.max(1, Math.min(800, Number(form.get("duration")) || 8));
    const stem = safeStem(String(form.get("original_name") || audio.name)); const end = offset + duration;
    const filename = `${stem}_${timeToken(offset)}-${timeToken(end)}.wav`;
    const partsDir = path.join(process.cwd(), "audio_parts"); await fs.mkdir(partsDir, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-crystal-part-"));
    const input = path.join(tempDir, `input${path.extname(audio.name) || ".audio"}`); await fs.writeFile(input, Buffer.from(await audio.arrayBuffer()));
    const { result } = await callSidecar("audio_save_fragment", { args: [input], inputFile: { output_path: path.join(partsDir, filename), offset, duration }, timeoutMs: 30 * 60_000, taskType: "audio-clap", title: "Save audio fragment" });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
  finally { if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined); }
}

function safeStem(name: string) { return path.parse(path.basename(name)).name.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "audio"; }
function timeToken(value: number) { return value.toFixed(2).replace(/\.00$/, "").replace(".", "p"); }
