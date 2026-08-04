import { NextRequest, NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

function parseStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const limit = Number(body.limit ?? 100);
  const ids = parseStringList(body.ids);
  const codes = parseStringList(body.codes);
  const onlyWithEmbeddings = body.onlyWithEmbeddings !== false;
  const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : undefined;

  try {
    const result = await getMetisStore().importFromLibrary({
      limit,
      ids,
      codes,
      onlyWithEmbeddings,
      type,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Metis import failed" },
      { status: 500 },
    );
  }
}
