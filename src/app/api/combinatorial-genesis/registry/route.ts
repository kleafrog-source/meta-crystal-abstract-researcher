import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";
import { excludeParameters, excludedRegistrySha, readExcludedRegistry, restoreParameters } from "@/lib/combinatorial-genesis/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function responsePayload() {
  const [library, registry] = await Promise.all([readGenesisLibrary(), readExcludedRegistry()]);
  let dataset: typeof library = [];
  try {
    dataset = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "dataset.json"), "utf8")) as typeof library;
  } catch {
    dataset = [];
  }
  const records = new Map([...library, ...dataset].map((parameter) => [parameter.technical_name, parameter]));
  const excluded = new Map(registry.entries.map((entry) => [entry.technical_name, entry]));
  const registrySha = excludedRegistrySha(registry);
  const manifestPaths = [
    path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "composite-index", "manifest.json"),
    path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "anchoring", "anchors_build.json"),
    path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "value-anchors", "manifest.json"),
    path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "value-anchors", "select-options.json"),
    path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "relations", "manifest.json"),
    path.join(process.cwd(), "data", "combinatorial-genesis", "audio-clap-index", "index.json"),
  ];
  const staleChecks = await Promise.all(manifestPaths.map(async (manifestPath) => {
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { excluded_sha256?: string };
      return manifest.excluded_sha256 !== registrySha;
    } catch {
      return true;
    }
  }));
  return {
    registry,
    registry_sha256: registrySha,
    indexes_stale: staleChecks.some(Boolean),
    parameters: [...records.values()].map((parameter) => ({
      technical_name: parameter.technical_name,
      category: String(parameter.category ?? ""),
      sub_category: String(parameter.sub_category ?? ""),
      retrieval_scope: String(parameter.retrieval_scope ?? "sound"),
      excluded: excluded.has(parameter.technical_name),
      exclusion: excluded.get(parameter.technical_name) ?? null,
    })),
  };
}

export async function GET() {
  return NextResponse.json(await responsePayload());
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { technical_names?: unknown; reason?: unknown; scope?: unknown };
  const names = Array.isArray(body.technical_names) ? body.technical_names.filter((item): item is string => typeof item === "string") : [];
  if (names.length === 0) return NextResponse.json({ error: "technical_names must contain at least one name" }, { status: 400 });
  const payload = await responsePayload();
  const known = new Map(payload.parameters.map((parameter) => [parameter.technical_name, parameter]));
  const unknown = names.filter((name) => !known.has(name));
  if (unknown.length > 0) return NextResponse.json({ error: `Unknown parameter(s): ${unknown.join(", ")}` }, { status: 404 });
  await excludeParameters(names.map((name) => ({
    technical_name: name,
    reason: typeof body.reason === "string" ? body.reason : "excluded by user",
    scope: typeof body.scope === "string" ? body.scope : String(known.get(name)?.retrieval_scope ?? "sound"),
  })));
  return NextResponse.json(await responsePayload());
}

export async function DELETE(request: NextRequest) {
  const body = await request.json() as { technical_names?: unknown };
  const names = Array.isArray(body.technical_names) ? body.technical_names.filter((item): item is string => typeof item === "string") : [];
  if (names.length === 0) return NextResponse.json({ error: "technical_names must contain at least one name" }, { status: 400 });
  await restoreParameters(names);
  return NextResponse.json(await responsePayload());
}
