import { NextRequest, NextResponse } from "next/server";

import { readCatalogueParameters, stage } from "@/lib/am-parameters-catalogue/catalogue";
import { excludedRegistrySha, readExcludedRegistry } from "@/lib/combinatorial-genesis/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function responsePayload() {
  const [activeCatalogue, registry] = await Promise.all([readCatalogueParameters(), readExcludedRegistry()]);
  const known = new Set(activeCatalogue.map((parameter) => parameter.technical_name));
  const liveExcluded = registry.entries.filter((entry) => known.has(entry.technical_name));
  const orphaned = registry.entries.filter((entry) => !known.has(entry.technical_name));
  return {
    registry,
    registry_sha256: excludedRegistrySha(registry),
    migration: { live_count: liveExcluded.length, orphan_count: orphaned.length, live_names: liveExcluded.map((entry) => entry.technical_name), orphan_names: orphaned.map((entry) => entry.technical_name) },
  };
}

export async function GET() {
  return NextResponse.json(await responsePayload());
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { action?: string };
  if (body.action !== "stage_delete_migration") return NextResponse.json({ error: "Exclusions are retired. Use catalogue delete via queue and commit." }, { status: 410 });
  const payload = await responsePayload();
  const staged = await Promise.all(payload.migration.live_names.map((name) => stage("delete", name, undefined, "Migrated from legacy index exclusion registry", "Legacy exclusion migration")));
  return NextResponse.json({ ok: true, staged_count: staged.length, orphan_count: payload.migration.orphan_count, next: "Review catalogue queue, then confirm commit to create backups and delete parameters." });
}
