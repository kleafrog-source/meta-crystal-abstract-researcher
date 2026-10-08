import { NextResponse } from "next/server";

import { inspectCollectionResponse } from "@/lib/combinatorial-genesis/collection";
import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { raw_response?: string };
  try {
    body = (await request.json()) as { raw_response?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = typeof body.raw_response === "string" ? body.raw_response : "";
  const dataset = await readGenesisLibrary();
  const inspection = inspectCollectionResponse(
    raw,
    new Set(dataset.map((parameter) => parameter.technical_name)),
  );
  return NextResponse.json(inspection, { status: inspection.parameters.length > 0 ? 200 : 422 });
}
