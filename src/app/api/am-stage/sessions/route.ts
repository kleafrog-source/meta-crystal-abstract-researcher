import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AmStageSessionSnapshot, AmStageSessionSummary } from "@/lib/am-stage-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROOT = path.join(process.cwd(), "data", "am-stage-snapshots");
const SAFE_ID = /^[a-zA-Z0-9-]{1,80}$/;

function fileFor(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("Invalid session id.");
  return path.join(ROOT, id, "snapshot.json");
}

async function readSnapshot(id: string): Promise<AmStageSessionSnapshot | null> {
  try { return JSON.parse(await fs.readFile(fileFor(id), "utf8")) as AmStageSessionSnapshot; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function summary(snapshot: AmStageSessionSnapshot): AmStageSessionSummary {
  return {
    id: snapshot.meta.id, title: snapshot.meta.title, created_at: snapshot.meta.created_at,
    updated_at: snapshot.meta.updated_at, audio_name: snapshot.data.audio.name,
    segment_count: snapshot.data.timeline.segments.length,
    parameter_count: snapshot.data.v3.active_parameters?.length ?? snapshot.data.banks.text_parameters.length,
    reverse_query_saved: Boolean(snapshot.data.param_to_text?.reverseQuery),
  };
}

export async function GET() {
  try {
    await fs.mkdir(ROOT, { recursive: true });
    const entries = await fs.readdir(ROOT, { withFileTypes: true });
    const snapshots = await Promise.all(entries.filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name)).map((entry) => readSnapshot(entry.name)));
    return NextResponse.json({ sessions: snapshots.filter((item): item is AmStageSessionSnapshot => Boolean(item)).map(summary).sort((a, b) => b.updated_at.localeCompare(a.updated_at)) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 64 * 1024 * 1024) return NextResponse.json({ error: "Session snapshot exceeds 64 MB." }, { status: 413 });
    const body = await request.json() as { id?: string; title?: string; data?: AmStageSessionSnapshot["data"] };
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 64 * 1024 * 1024) return NextResponse.json({ error: "Session snapshot exceeds 64 MB." }, { status: 413 });
    if (!body.data || body.data.schema !== "am_stage_session_v1") return NextResponse.json({ error: "Expected am_stage_session_v1 data." }, { status: 400 });
    const id = body.id ?? randomUUID();
    const previous = body.id ? await readSnapshot(id) : null;
    if (body.id && !previous) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const now = new Date().toISOString();
    const snapshot: AmStageSessionSnapshot = {
      schema: "am_stage_session_snapshot_v1",
      meta: { id, title: String(body.title ?? previous?.meta.title ?? "Сессия AM-Stage").trim().slice(0, 120) || "Сессия AM-Stage", created_at: previous?.meta.created_at ?? now, updated_at: now },
      data: body.data,
    };
    const target = fileFor(id); await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
    return NextResponse.json({ snapshot: { meta: snapshot.meta }, summary: summary(snapshot) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
