import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "python_engine", "repair-flowmusic-inbox.py");
const INBOX = path.join(
  ROOT,
  "data",
  "combinatorial-genesis",
  "flowmusic-inbox",
);
const REPORT = path.join(
  ROOT,
  "data",
  "combinatorial-genesis",
  "inbox-repair-report.json",
);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { apply?: unknown };
  if (body.apply !== undefined && typeof body.apply !== "boolean")
    return NextResponse.json(
      { error: "apply must be boolean" },
      { status: 400 },
    );
  const args = ["-u", SCRIPT, INBOX];
  if (body.apply) args.push("--apply");
  const result = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    const child = spawn(process.env.PYTHON_EXECUTABLE || "python", args, {
      cwd: ROOT,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) =>
      resolve({ code: -1, stdout, stderr: error.message }),
    );
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
  try {
    const report = JSON.parse(await fs.readFile(REPORT, "utf8")) as Record<
      string,
      unknown
    >;
    return NextResponse.json({
      ...report,
      exit_code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch {
    return NextResponse.json(
      {
        error: result.stderr || result.stdout || `repair exited ${result.code}`,
      },
      { status: 500 },
    );
  }
}
