import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AmStageSessionSnapshot } from "@/lib/am-stage-session";
import { nextSessionRevision, readStageSnapshot, sessionFile, withStageSessionLock, writeStageSnapshot } from "@/lib/am-stage-session-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROOT = path.join(process.cwd(), "data", "am-stage-snapshots");

function getFile(id: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Invalid session id.");
  return path.join(ROOT, id, "snapshot.json");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const snapshot = JSON.parse(await fs.readFile(getFile(id), "utf8")) as AmStageSessionSnapshot;
    return NextResponse.json({ snapshot });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    getFile(id);
    const body = await request.json() as { title?: string; expectedRevision?: string };
    const title = String(body.title ?? "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    if (!body.expectedRevision) return NextResponse.json({ error: "expectedRevision is required." }, { status: 400 });
    return await withStageSessionLock(id, async () => {
      const snapshot = await readStageSnapshot(id);
      if (!snapshot) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      if (snapshot.meta.updated_at !== body.expectedRevision) return NextResponse.json({ error: "Session changed since it was opened.", code: "STALE_SESSION_REVISION", latestRevision: snapshot.meta.updated_at }, { status: 409 });
      snapshot.meta.title = title; snapshot.meta.updated_at = nextSessionRevision(snapshot.meta.updated_at);
      await writeStageSnapshot(snapshot);
      return NextResponse.json({ snapshot });
    });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const revision = new URL(_request.url).searchParams.get("expectedRevision");
    if (!revision) return NextResponse.json({ error: "expectedRevision is required." }, { status: 400 });
    return await withStageSessionLock(id, async () => {
      const snapshot = await readStageSnapshot(id);
      if (!snapshot) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      if (snapshot.meta.updated_at !== revision) return NextResponse.json({ error: "Session changed since it was opened.", code: "STALE_SESSION_REVISION", latestRevision: snapshot.meta.updated_at }, { status: 409 });
      await fs.rm(path.dirname(sessionFile(id)), { recursive: true, force: false });
      return NextResponse.json({ deleted: true });
    });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
