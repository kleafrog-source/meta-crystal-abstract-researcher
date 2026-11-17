// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { candidateArtifactOutputLabel, ManagedRebuildPanel } from "./ManagedRebuildPanel";

vi.mock("@/lib/ui-i18n", () => ({ useUiText: () => (value: string) => value }));
vi.mock("@/hooks/use-capability-registry", () => ({ useCapabilityEnabled: () => true }));

const job = {
  running: false, kind: null, stage: null, started_at: 0, finished_at: 0, exit_code: null,
  stop_requested: false, safe_to_stop: false, source_revision: null, candidate_version: null,
  last_error: null, log_tail: [],
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

describe("ManagedRebuildPanel confirmation", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("labels candidate outputs with the actual encoder-specific directories", () => {
    expect(candidateArtifactOutputLabel("composite")).toBe("artifacts/qwen3/composite-index");
    expect(candidateArtifactOutputLabel("gemma2_atoms")).toBe("artifacts/embeddinggemma2/runtime-atoms");
  });

  it("keeps Prepare inert on open, cancel and Escape, and starts once on confirmation", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    const nativeAlert = vi.spyOn(window, "alert");
    const starts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("view=job")) return jsonResponse({ job });
      if (url.includes("view=preflight")) return jsonResponse({
        checked_at: "now", source: { kind: "effective-live-catalogue", revision: "rev", content_sha256: "snapshot", parameter_count: 1, tombstoned_live_count: 0, excluded_live_count: 0, excluded_sha256: "excluded" },
        model: { endpoint: "http://localhost:11434", model: "qwen", local_endpoint: true, installed: true, check_error: null },
        output_directory: "candidate", output_writable: true, builder_dependencies: { ready: true, missing: [] },
        available_memory_bytes: 8 * 1024 ** 3, minimum_memory_bytes: 2 * 1024 ** 3,
        active_corpus_current: false, active_corpus_version: "active", legacy_routes: "disabled", qwen_candidate: null,
        can_build_candidate: true, can_prepare_candidate: true, can_vectorize_candidate: false, can_finalize_candidate: false,
        candidate_blockers: [], dependent_indexes_build_with_candidate: false, can_build_dependent_indexes: false,
        dependent_index_reason: null, can_activate: false, activation_reason: "not finalized",
      });
      if (url.includes("/api/audio/index") || url.includes("/api/morpho/status")) return jsonResponse({ job: null });
      if (url === "/api/rag-v3/rebuild" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { action?: string; kind?: string };
        if (body.action === "audit") return jsonResponse({
          artifacts: [], banks: [], active_model: "qwen", registry_sha256: "excluded", active_parameters: 1,
          active_version: "active", source_snapshot_sha256: "snapshot", effective_catalogue_revision: "rev",
          tombstoned_live_count: 0, excluded_live_count: 0, active_corpus_ready: false,
          active_corpus_block_reason: null, corpus_candidates: [], job,
        });
        starts.push(body);
        return jsonResponse({ started: true, job: { ...job, running: true, kind: body.kind, started_at: 1 } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<ManagedRebuildPanel />);
    const prepare = await screen.findByRole("button", { name: "Prepare source files · no model" });
    await screen.findByText("Prepare can start without a model");
    await waitFor(() => expect((prepare as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(prepare);
    await screen.findByRole("alertdialog");
    expect(screen.getByText(/All supported rows/)).toBeTruthy();
    expect(screen.getByText(/Вызов модели:/)).toBeTruthy();
    expect(starts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(starts).toHaveLength(0);

    fireEvent.click(prepare);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(starts).toHaveLength(0);

    fireEvent.click(prepare);
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    await waitFor(() => expect(starts).toHaveLength(1));
    expect(starts).toEqual([{ kind: "corpus_candidate", candidate_version: undefined, artifact_kind: undefined }]);
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(nativeAlert).not.toHaveBeenCalled();
  });

  it("keeps a connected current-source workset selected so Gemma can connect independently", async () => {
    const candidateId = "corpus-candidate-current-ready";
    const starts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("view=job")) return jsonResponse({ job });
      if (url.includes("view=preflight")) return jsonResponse({
        checked_at: "now", source: { kind: "effective-live-catalogue", revision: "rev", content_sha256: "snapshot", parameter_count: 6962, tombstoned_live_count: 0, excluded_live_count: 0, excluded_sha256: "excluded" },
        model: { endpoint: "http://localhost:11434", model: "qwen", local_endpoint: true, installed: true, check_error: null },
        output_directory: "candidate", output_writable: true, builder_dependencies: { ready: true, missing: [] },
        available_memory_bytes: 8 * 1024 ** 3, minimum_memory_bytes: 2 * 1024 ** 3,
        active_corpus_current: false, active_corpus_version: "active", legacy_routes: "disabled", qwen_candidate: null,
        can_build_candidate: true, can_prepare_candidate: true, can_vectorize_candidate: false, can_finalize_candidate: false,
        candidate_blockers: [], dependent_indexes_build_with_candidate: false, can_build_dependent_indexes: false,
        dependent_index_reason: null, can_activate: true, activation_reason: "ready",
      });
      if (url.includes("/api/audio/index") || url.includes("/api/morpho/status")) return jsonResponse({ job: null });
      if (url === "/api/rag-v3/rebuild" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { action?: string; kind?: string };
        if (body.action === "audit") return jsonResponse({
          artifacts: [], banks: [], active_model: "qwen", active_endpoint: "http://localhost:11434", registry_sha256: "excluded", active_parameters: 6962,
          active_version: "active", source_snapshot_sha256: "snapshot", effective_catalogue_revision: "rev",
          tombstoned_live_count: 0, excluded_live_count: 0, active_corpus_ready: false, active_corpus_block_reason: null,
          corpus_candidates: [{
            candidate_id: candidateId, status: "active", prepare_status: "complete", finalization_status: "complete", qwen_bundle_status: "complete",
            source_revision: "rev", source_snapshot_sha256: "snapshot", model: "qwen", endpoint: "http://localhost:11434",
            gemma_finalization_status: "complete", gemma_bundle_status: "complete",
            gemma_artifact_builds: { embeddinggemma2_text: "complete", gemma2_atoms: "vectorization_complete", gemma2_anchors: "complete", gemma2_range: "complete", gemma2_select: "complete", gemma2_relations: "complete" },
          }], job,
        });
        starts.push(body);
        return jsonResponse({ started: true, job: { ...job, running: true, kind: body.kind, started_at: 1 } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<ManagedRebuildPanel />);
    expect(await screen.findByText(new RegExp(candidateId))).toBeTruthy();
    const connectGemma = await screen.findByRole("button", { name: "Connect Gemma set" });
    expect((connectGemma as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Finalize Qwen set" })).toBeTruthy();
    expect(starts).toHaveLength(0);
  });
});
