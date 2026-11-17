import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getPipelineJob, stopPipelineJob } from "@/lib/combinatorial-genesis/pipeline-job";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

const PROJECT_ROOT = process.cwd();
const REPORT_PATH = path.join(PROJECT_ROOT, "data", "combinatorial-genesis", "pipeline-last-run.json");

interface PipelineReport {
  status: "completed" | "failed";
  started_at: string;
  finished_at: string;
  inbox_files: string[];
  version_before: string | null;
  version_after: string | null;
  new_version_created: boolean;
  steps: Array<{ script: string; exit_code: number; stdout: string; stderr: string }>;
}

async function readReport(): Promise<PipelineReport | null> {
  try {
    return JSON.parse(await fs.readFile(REPORT_PATH, "utf8")) as PipelineReport;
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ job: getPipelineJob(), report: await readReport() });
}

export async function POST() {
  return NextResponse.json({
    error: "The legacy inbox pipeline is disabled because it can activate a corpus outside the current-catalogue candidate workflow. Use Service Bay → Build current-catalog candidate.",
    job: getPipelineJob(),
  }, { status: 410 });
}

export async function DELETE() {
  const result = await stopPipelineJob();
  return NextResponse.json({ ...result, job: getPipelineJob() });
}
