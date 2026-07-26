import { existsSync, readFileSync } from "fs";
import { NextResponse } from "next/server";
import { MMSS_REPORT_PATH } from "@/lib/mmss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!existsSync(MMSS_REPORT_PATH)) {
      return NextResponse.json({
        ok: true,
        exists: false,
        report: null,
      });
    }

    const report = JSON.parse(readFileSync(MMSS_REPORT_PATH, "utf-8"));
    return NextResponse.json({
      ok: true,
      exists: true,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
