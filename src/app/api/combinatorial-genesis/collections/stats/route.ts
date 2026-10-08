import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { ensureGenesisLibrary } from "@/lib/combinatorial-genesis/library";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(
  process.cwd(),
  "data",
  "combinatorial-genesis",
);
const OUTPUT_DIR = path.join(
  DATA_ROOT,
  "flowmusic-output",
);

async function readOptionalJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return null;
    throw error;
  }
}

function readOptionalReport(name: string) {
  return readOptionalJson(path.join(OUTPUT_DIR, name));
}

export async function GET() {
  try {
    await ensureGenesisLibrary();
    const [report, quality, semantic, triage, libraryManifest, pipelineRun] = await Promise.all([
      readOptionalReport("collection_report.json"),
      readOptionalReport("quality_report.json"),
      readOptionalReport("semantic_report.json"),
      readOptionalReport("semantic_auto_triage_report.json"),
      readOptionalJson(path.join(DATA_ROOT, "library", "manifest.json")),
      readOptionalJson(path.join(DATA_ROOT, "pipeline-last-run.json")),
    ]);
    const latest = await readOptionalJson(path.join(DATA_ROOT, "datasets", "latest.json"));
    const versionId = typeof latest?.version_id === "string" ? latest.version_id : null;
    const frozenManifest = versionId
      ? await readOptionalJson(path.join(DATA_ROOT, "datasets", versionId, "manifest.json"))
      : null;
    const runtimeIndex = versionId
      ? await readOptionalJson(path.join(DATA_ROOT, "indexes", versionId, "manifest.json"))
      : null;
    if (!report) {
      return NextResponse.json({ available: false });
    }
    return NextResponse.json({
      available: true,
      ...report,
      eligible_records: quality?.eligible_records ?? null,
      excluded_records: quality?.excluded_records ?? null,
      atom_count: quality?.atom_count ?? null,
      semantic_candidate_pairs: semantic?.candidate_pair_count ?? null,
      semantic_model:
        semantic?.embedding && typeof semantic.embedding === "object"
          ? (semantic.embedding as Record<string, unknown>).model ?? null
          : null,
      nearest_neighbor_score_quantiles: semantic?.nearest_neighbor_score_quantiles ?? null,
      auto_decision_counts: triage?.auto_decision_counts ?? null,
      semantic_group_count: triage?.semantic_group_count ?? null,
      semantic_draft_record_count: triage?.semantic_draft_record_count ?? null,
      semantic_policy_version: triage?.policy_version ?? null,
      frozen_version_id: versionId,
      frozen_content_sha256: frozenManifest?.content_sha256 ?? null,
      frozen_publish_status: frozenManifest?.publish_status ?? null,
      runtime_index_ready: Boolean(runtimeIndex),
      runtime_index_atom_count: runtimeIndex?.atom_count ?? null,
      runtime_index_model: runtimeIndex?.model ?? null,
      library_parameter_count: libraryManifest?.parameter_count ?? null,
      library_published_package_count: Array.isArray(libraryManifest?.published_package_ids)
        ? libraryManifest.published_package_ids.length
        : 0,
      pipeline_last_run: pipelineRun,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return NextResponse.json({
        available: false,
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
