import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const QUEUE_PATH = path.join(
  process.cwd(),
  "data",
  "combinatorial-genesis",
  "flowmusic-output",
  "semantic_review_queue.json",
);
const TRIAGE_PATH = path.join(
  process.cwd(),
  "data",
  "combinatorial-genesis",
  "flowmusic-output",
  "semantic_auto_triage.json",
);
const DECISIONS_PATH = path.join(
  process.cwd(),
  "data",
  "combinatorial-genesis",
  "reviews",
  "semantic_decisions.json",
);
const DECISIONS = new Set(["same", "related", "distinct"]);

interface DecisionRecord {
  left: string;
  right: string;
  decision: string;
  updated_at: string;
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join("\u0000");
}

async function readQueue(): Promise<Array<Record<string, unknown>>> {
  let raw: string;
  try {
    raw = await fs.readFile(TRIAGE_PATH, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
    raw = await fs.readFile(QUEUE_PATH, "utf8");
  }
  const queue = JSON.parse(raw) as unknown;
  if (!Array.isArray(queue)) throw new Error("semantic_review_queue.json must contain an array");
  return queue as Array<Record<string, unknown>>;
}

async function readDecisions(): Promise<DecisionRecord[]> {
  try {
    const payload = JSON.parse(await fs.readFile(DECISIONS_PATH, "utf8")) as { decisions?: unknown };
    return Array.isArray(payload.decisions) ? payload.decisions as DecisionRecord[] : [];
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return [];
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 12);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
    : 12;
  try {
    const [queue, decisions] = await Promise.all([readQueue(), readDecisions()]);
    const byPair = new Map(decisions.map((item) => [pairKey(item.left, item.right), item]));
    const pairs = queue.slice(0, limit).map((item) => {
      const left = String(item.left ?? "");
      const right = String(item.right ?? "");
      const manualDecision = byPair.get(pairKey(left, right))?.decision ?? null;
      return {
        ...item,
        decision: manualDecision,
        effective_decision: manualDecision ?? item.auto_decision ?? item.effective_decision ?? null,
        decision_source: manualDecision ? "manual" : "auto",
      };
    });
    return NextResponse.json({ available: true, total: queue.length, decided: decisions.length, pairs });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return NextResponse.json({ available: false, total: 0, pairs: [] });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const left = typeof body.left === "string" ? body.left : "";
    const right = typeof body.right === "string" ? body.right : "";
    const decision = typeof body.decision === "string" ? body.decision : "";
    if (!left || !right || left === right || !DECISIONS.has(decision)) {
      return NextResponse.json({ error: "left, right and decision (same|related|distinct) are required" }, { status: 400 });
    }

    const queue = await readQueue();
    const key = pairKey(left, right);
    const exists = queue.some((item) => pairKey(String(item.left ?? ""), String(item.right ?? "")) === key);
    if (!exists) return NextResponse.json({ error: "Pair is not present in the semantic review queue" }, { status: 404 });

    const decisions = await readDecisions();
    const record: DecisionRecord = { left, right, decision, updated_at: new Date().toISOString() };
    const existingIndex = decisions.findIndex((item) => pairKey(item.left, item.right) === key);
    if (existingIndex >= 0) decisions[existingIndex] = record;
    else decisions.push(record);
    decisions.sort((a, b) => pairKey(a.left, a.right).localeCompare(pairKey(b.left, b.right)));
    await fs.mkdir(path.dirname(DECISIONS_PATH), { recursive: true });
    await fs.writeFile(
      DECISIONS_PATH,
      `${JSON.stringify({ version: 1, updated_at: record.updated_at, decisions }, null, 2)}\n`,
      "utf8",
    );
    return NextResponse.json({ saved: true, record, decided: decisions.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
