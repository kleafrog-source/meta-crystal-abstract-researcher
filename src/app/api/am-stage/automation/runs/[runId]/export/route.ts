import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAutomationRun } from "@/lib/am-stage-automation/executor";

export const runtime = "nodejs";
type Context = { params: Promise<{ runId: string }> };
const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [/api.?key|secret|authorization|bearer|access.?token|refresh.?token/i.test(key) ? "[redacted-key]" : key, /api.?key|secret|authorization|bearer|access.?token|refresh.?token/i.test(key) ? "[redacted]" : redact(item)]));
};

export async function GET(_request: Request, context: Context) {
  try {
    const { runId } = await context.params;
    const run = await getAutomationRun(runId);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    const results = run.stages.flatMap((stage) => [...stage.artifacts.map((artifact) => ({ id: artifact.id, kind: artifact.kind, payload: artifact.payload })), ...stage.nodeCheckpoints.map((checkpoint) => ({ id: checkpoint.id, kind: "automation-node-checkpoint", payload: checkpoint.payload }))].map((artifact) => {
      const content = JSON.stringify(redact(artifact.payload));
      return { filename: `results/${stage.stageId}/${artifact.id}.json`, stageId: stage.stageId, kind: artifact.kind, checksum: createHash("sha256").update(content).digest("hex"), content: JSON.parse(content) as unknown };
    }));
    const manifest = {
      schemaVersion: 1, format: "am-stage-automation-json-bundle", runId: run.id, scenarioId: run.scenarioId,
      planId: run.plan?.id ?? null, planFingerprint: run.plan?.fingerprint ?? null, statusAtExport: run.status,
      snapshotAt: new Date().toISOString(), complete: run.status === "finished",
      stages: run.stages.map((stage) => ({ stageId: stage.stageId, actionId: stage.actionId, status: stage.status, attempts: stage.attempts.map((attempt) => ({ id: attempt.id, number: attempt.attemptNumber, status: attempt.status })) })),
      files: ["plan.json", "summary.json", ...results.map((result) => result.filename)],
      excludedResources: ["source audio bytes", "server configuration", "provider credentials", "unrelated workbench state"],
      incompleteStages: run.stages.filter((stage) => !["succeeded", "skipped"].includes(stage.status)).map((stage) => stage.stageId),
    };
    const bundle = { manifest, plan: redact(run.plan), summary: redact({ id: run.id, title: run.title, status: run.status, createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt, lastErrorSummary: run.lastErrorSummary }), results };
    return new Response(JSON.stringify(bundle, null, 2), { headers: { "Content-Type": "application/vnd.am-stage.automation+json; charset=utf-8", "Content-Disposition": `attachment; filename="automation-${run.id}.bundle.json"`, "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
