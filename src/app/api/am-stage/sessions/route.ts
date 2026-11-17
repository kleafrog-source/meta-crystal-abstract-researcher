import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AmStageSessionSnapshot, AmStageSessionSummary } from "@/lib/am-stage-session";
import { nextSessionRevision, readStageSnapshot, sessionFile, withStageSessionLock, writeStageSnapshot } from "@/lib/am-stage-session-storage";
import { reconcileMergeImportOnSave, restoreMergeImportState } from "@/lib/am-stage-automation/merge-stage-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROOT = path.join(process.cwd(), "data", "am-stage-snapshots");
const SAFE_ID = /^[a-zA-Z0-9-]{1,80}$/;

const readSnapshot = readStageSnapshot;

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
    const body = await request.json() as { id?: string; sourceId?: string; expectedRevision?: string; mergeDeletedNames?: string[]; title?: string; data?: AmStageSessionSnapshot["data"] };
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 64 * 1024 * 1024) return NextResponse.json({ error: "Session snapshot exceeds 64 MB." }, { status: 413 });
    const incomingData = body.data;
    if (!incomingData || incomingData.schema !== "am_stage_session_v1") return NextResponse.json({ error: "Expected am_stage_session_v1 data." }, { status: 400 });
    if (body.id && !body.expectedRevision) return NextResponse.json({ error: "expectedRevision is required when saving an existing session." }, { status: 400 });
    const id = body.id ?? randomUUID();
    return await withStageSessionLock(id, async () => {
      const previous = body.id ? await readSnapshot(id) : null;
      if (body.id && !previous) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      if (previous && previous.meta.updated_at !== body.expectedRevision) return NextResponse.json({ error: "Session changed since it was opened.", code: "STALE_SESSION_REVISION", latestRevision: previous.meta.updated_at }, { status: 409 });
      if (!previous && body.id) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      let metadataSource = previous;
      if (!previous && body.sourceId) {
        const source = await withStageSessionLock(body.sourceId, () => readSnapshot(body.sourceId!));
        if (!source || source.meta.updated_at !== body.expectedRevision) return NextResponse.json({ error: "Source session changed since it was opened.", code: "STALE_SESSION_REVISION", latestRevision: source?.meta.updated_at }, { status: 409 });
        metadataSource = source;
      }
      const revision = nextSessionRevision(previous?.meta.updated_at);
      const data = structuredClone(incomingData);
      const trusted = restoreMergeImportState(metadataSource?.data.v3.merge_import);
      const deleted = Array.isArray(body.mergeDeletedNames) ? body.mergeDeletedNames.filter((name): name is string => typeof name === "string") : [];
      const reconciled = reconcileMergeImportOnSave(trusted, metadataSource?.data.v3.active_parameters ?? [], data.v3.active_parameters ?? [], deleted);
      if (reconciled) data.v3.merge_import = reconciled;
      else delete data.v3.merge_import;
      const snapshot: AmStageSessionSnapshot = {
        schema: "am_stage_session_snapshot_v1",
        meta: { id, title: String(body.title ?? previous?.meta.title ?? "Сессия AM-Stage").trim().slice(0, 120) || "Сессия AM-Stage", created_at: previous?.meta.created_at ?? revision, updated_at: revision },
        data,
      };
      await writeStageSnapshot(snapshot);
      return NextResponse.json({ snapshot: { meta: snapshot.meta }, summary: summary(snapshot), revision, mergeImportState: snapshot.data.v3.merge_import });
    });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
