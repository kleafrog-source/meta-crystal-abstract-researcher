import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");

export async function POST(request: Request) {
  try {
    const body = await request.json() as { candidates?: unknown; model?: unknown };
    const candidates = Array.isArray(body.candidates) ? body.candidates as Array<Record<string, unknown>> : [];
    if (candidates.length < 1 || candidates.length > 50) {
      return NextResponse.json({ error: "Provide between 1 and 50 candidates." }, { status: 400 });
    }
    const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8")) as { version_id: string };
    const frozen = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "parameters.json"), "utf8")) as Array<Record<string, unknown>>;
    const library = await readGenesisLibrary() as Array<Record<string, unknown>>;
    const byName = new Map([...library, ...frozen].map((parameter) => [String(parameter.technical_name), parameter]));
    const records = candidates.map((candidate) => {
      const parentNames = Array.isArray(candidate.parent_parameters) ? candidate.parent_parameters.map(String) : [];
      return {
        candidate,
        donors: parentNames.flatMap((name) => byName.get(name) ? [byName.get(name)] : []),
      };
    });
    const jobId = randomUUID();
    const directory = path.join(DATA_ROOT, "normalization-jobs");
    const filePath = path.join(directory, `${jobId}.json`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify({
      schema_version: 1,
      job_id: jobId,
      status: "prepared",
      created_at: new Date().toISOString(),
      chat_model: typeof body.model === "string" ? body.model : null,
      dataset_version: latest.version_id,
      candidate_count: candidates.length,
      records,
    }, null, 2)}\n`, "utf8");
    return NextResponse.json({ job_id: jobId, path: filePath, candidate_count: candidates.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { job_id?: unknown; results?: unknown; status?: unknown };
    const jobId = typeof body.job_id === "string" && /^[a-f0-9-]{36}$/.test(body.job_id) ? body.job_id : "";
    if (!jobId) return NextResponse.json({ error: "Valid job_id is required." }, { status: 400 });
    const filePath = path.join(DATA_ROOT, "normalization-jobs", `${jobId}.json`);
    const job = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
    const previous = Array.isArray(job.results) ? job.results as Array<Record<string, unknown>> : [];
    const incoming = Array.isArray(body.results) ? body.results as Array<Record<string, unknown>> : [];
    const incomingNames = new Set(incoming.map((item) => String(item.technical_name ?? "")));
    const updated = {
      ...job,
      status: typeof body.status === "string" ? body.status : job.status,
      updated_at: new Date().toISOString(),
      results: [...previous.filter((item) => !incomingNames.has(String(item.technical_name ?? ""))), ...incoming],
    };
    await fs.writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    return NextResponse.json({ job_id: jobId, status: updated.status, result_count: updated.results.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
