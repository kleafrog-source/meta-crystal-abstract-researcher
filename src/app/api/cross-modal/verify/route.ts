import { NextResponse } from "next/server";

import { finishVerificationJob, startVerificationJob, stopVerificationJob, verificationJobStatus } from "@/lib/cross-modal/verification-job";
import { verifyJournalCycle } from "@/lib/cross-modal/verify";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 1800;

export async function GET() { return NextResponse.json(verificationJobStatus()); }
export async function POST(request: Request) {
  let job: ReturnType<typeof startVerificationJob> | undefined;
  try {
    const body = await request.json() as { id?: string }; if (!body.id) return NextResponse.json({ error: "Journal record id is required" }, { status: 400 });
    job = startVerificationJob(body.id); request.signal.addEventListener("abort", () => job?.controller.abort(), { once: true });
    const verification = await verifyJournalCycle(body.id, job.controller.signal);
    return NextResponse.json({ verification }, { status: verification.status === "error" ? 422 : 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
  finally { if (job) finishVerificationJob(job); }
}
export async function DELETE() { return NextResponse.json({ stopped: stopVerificationJob() }); }
