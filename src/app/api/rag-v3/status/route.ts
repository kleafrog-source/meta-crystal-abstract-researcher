import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";
import { getOllamaBaseUrl, getOllamaModel, getOllamaTimeouts, probeOllama } from "@/lib/ollama-client";
import type { StatusResponse } from "@/lib/rag-v3/types";
import { getCompositeIndexInfo } from "@/lib/rag-v3/composite-index";
import { getV3AnchorsJob, getV3IndexJob } from "@/lib/rag-v3/build-jobs";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
export async function GET() {
  try {
    const library = await readGenesisLibrary();
    const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8")) as { version_id: string };
    const frozen = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "parameters.json"), "utf8")) as Array<{ technical_name: string }>;
    const atomIndexManifest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "indexes", latest.version_id, "manifest.json"), "utf8")) as { atom_count: number; created_at: string; model: string };
    const compositeIndex = await getCompositeIndexInfo();
    const anchors = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "v3", "anchoring", "anchors_build.json"), "utf8")) as { stub?: boolean; generated_at?: string };
    const indexJob = getV3IndexJob();
    const anchorsJob = getV3AnchorsJob();
    const union = new Set([...library.map((item) => item.technical_name), ...frozen.map((item) => item.technical_name)]);
    const ollama = await probeOllama();
    const timeouts = getOllamaTimeouts();
    const payload: StatusResponse = {
      artifacts_ready: true,
      total_parameters: union.size,
      anchors_stub: Boolean(anchors.stub),
      axes_enabled: !anchors.stub,
      ollama_reachable: ollama.reachable,
      ollama_model: getOllamaModel(),
      ollama_base_url: getOllamaBaseUrl(),
      probe_timeout_ms: timeouts.probeTimeoutMs,
      embed_timeout_ms: timeouts.embedTimeoutMs,
      anchors_generated_at: anchors.generated_at ?? null,
      retrieval_index_ready: true,
      retrieval_index_count: compositeIndex.parameter_count,
      retrieval_index_generated_at: compositeIndex.created_at,
      retrieval_index_model: compositeIndex.model,
      retrieval_cache_size: compositeIndex.parameter_count,
      retrieval_job: {
        running: indexJob.running, started_at: indexJob.startedAt, finished_at: indexJob.finishedAt,
        exit_code: indexJob.exitCode, last_error: indexJob.lastError, log_tail: indexJob.logTail, progress: indexJob.progress,
      },
      anchors_job: {
        running: anchorsJob.running, started_at: anchorsJob.startedAt, finished_at: anchorsJob.finishedAt,
        exit_code: anchorsJob.exitCode, last_error: anchorsJob.lastError, log_tail: anchorsJob.logTail, progress: anchorsJob.progress,
      },
      required_files: [
        { name: "autonomous_library", exists: true },
        { name: "frozen_corpus", exists: true },
        { name: "combinatorial_atoms", exists: atomIndexManifest.atom_count > 0 },
        { name: "composite_parameter_index", exists: compositeIndex.parameter_count === union.size },
        { name: "v3_live_anchors", exists: !anchors.stub },
      ],
      last_error: ollama.error,
    };
    return NextResponse.json({ ...payload, library_count: library.length, frozen_count: frozen.length, atom_count: atomIndexManifest.atom_count, dataset_version: latest.version_id, composite_index_sha256: compositeIndex.cache_sha256, vector_origins: compositeIndex.vector_origins });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

