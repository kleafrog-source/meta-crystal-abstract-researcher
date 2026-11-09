import { beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(async () => undefined),
    readdir: vi.fn(async () => []),
    readFile: vi.fn(async (file: string) => {
      const value = files.get(String(file));
      if (value === undefined) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      return value;
    }),
    writeFile: vi.fn(async (file: string, value: string) => { files.set(String(file), String(value)); }),
    rename: vi.fn(async (from: string, to: string) => {
      const value = files.get(String(from));
      if (value === undefined) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      files.set(String(to), value); files.delete(String(from));
    }),
    rm: vi.fn(async () => undefined),
  },
}));

import { POST } from "./route";
import { GET as GET_ONE } from "./[id]/route";
import { applyQwenArtifact, qwenSessionMetadataForSnapshot, replaceQwenBank, restoreQwenMetadataFromSnapshot, restoreQwenSessionState, type QwenSessionState } from "@/lib/am-stage-automation/qwen-stage-apply";
import type { ActiveParameter } from "@/lib/rag-v3/types";

const qwen: ActiveParameter[] = [{
  technical_name: "filter_cutoff_hz", current_value: 1200, suggested_value: 1200, default: 1000, before: 1000,
  category: "filter", sub_category: "cutoff", ui_element: "Range", source: "default", detail: "fixture",
  lyria_prompt_tags: [], semantic_keywords: [], similarity: 0, axes: [], retrieval_scope: "sound",
}];

const neighboring = (technical_name: string): ActiveParameter => ({ ...qwen[0], technical_name });
const source = { runId: "run-qwen", stageId: "text-qwen", attemptId: "attempt-qwen", artifactId: "artifact-qwen", bankId: "qwen-text" as const, pass: "resolved" as const };

function sessionData(qwenImport?: ReturnType<typeof qwenSessionMetadataForSnapshot>, capturedBanks = { qwen3: qwen, gemma: [] as ActiveParameter[], clap: [] as ActiveParameter[], siglip: [] as ActiveParameter[] }) {
  return {
    schema: "am_stage_session_v1",
    audio: { name: null, duration_seconds: 0, path: null, missing_on_restore: false, warning: null },
    timeline: { segments: [] },
    v3: { active_parameters: [], text_index: "qwen3" },
    banks: { text_parameters: [], text_parameters_qwen3: capturedBanks.qwen3, text_parameters_gemma: capturedBanks.gemma, clap_parameters: capturedBanks.clap, siglip_parameters: capturedBanks.siglip, ...(qwenImport ? { qwen_import: qwenImport } : {}) },
  };
}

describe("Qwen metadata through штатный session API", () => {
  beforeEach(() => files.clear());

  it("saves and restores Qwen provenance and operation receipts through POST and GET", async () => {
    const state: QwenSessionState = {
      parameters: qwen, manualNames: ["filter_cutoff_hz"], tombstones: ["removed"],
      provenance: { filter_cutoff_hz: { runId: "run", stageId: "stage", attemptId: "attempt", artifactId: "artifact", bankId: "qwen-text", pass: "resolved" } },
      appliedSources: ["source-key"], operationReceipts: { "op-1": "source-key" },
    };
    const response = await POST(new Request("http://localhost/api/am-stage/sessions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "fixture", data: sessionData(qwenSessionMetadataForSnapshot(state)) }),
    }));
    expect(response.status).toBe(200);
    const saved = await response.json() as { snapshot: { meta: { id: string } } };
    const restoredResponse = await GET_ONE(new Request(`http://localhost/api/am-stage/sessions/${saved.snapshot.meta.id}`), { params: Promise.resolve({ id: saved.snapshot.meta.id }) });
    const restored = await restoredResponse.json() as { snapshot: { data: { banks: { text_parameters_qwen3: ActiveParameter[]; qwen_import: ReturnType<typeof qwenSessionMetadataForSnapshot> } } } };
    expect(restored.snapshot.data.banks.text_parameters_qwen3).toEqual(qwen);
    expect(restoreQwenMetadataFromSnapshot(restored.snapshot.data.banks.text_parameters_qwen3, restored.snapshot.data.banks.qwen_import)).toEqual(state);
  });

  it("continues to open an older snapshot without Qwen metadata", async () => {
    const response = await POST(new Request("http://localhost/api/am-stage/sessions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "legacy", data: sessionData() }),
    }));
    const saved = await response.json() as { snapshot: { meta: { id: string } } };
    const restoredResponse = await GET_ONE(new Request(`http://localhost/api/am-stage/sessions/${saved.snapshot.meta.id}`), { params: Promise.resolve({ id: saved.snapshot.meta.id }) });
    const restored = await restoredResponse.json() as { snapshot: { data: { banks: { text_parameters_qwen3: ActiveParameter[]; qwen_import?: undefined } } } };
    expect(restoredResponse.status).toBe(200);
    expect(restored.snapshot.data.banks.text_parameters_qwen3).toEqual(qwen);
    expect(restored.snapshot.data.banks.qwen_import).toBeUndefined();
  });

  it("applies Qwen through the production bank update and round-trips non-empty neighboring banks unchanged", async () => {
    const originalBanks = {
      qwen3: [] as ActiveParameter[],
      gemma: [neighboring("gemma_neighbor")],
      clap: [neighboring("clap_neighbor")],
      siglip: [neighboring("siglip_neighbor")],
    };
    const initial = restoreQwenSessionState(originalBanks.qwen3);
    const applied = applyQwenArtifact(initial, qwen, source, "operation-qwen");
    const updatedBanks = replaceQwenBank(originalBanks, applied);
    const response = await POST(new Request("http://localhost/api/am-stage/sessions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "neighbor-bank fixture", data: sessionData(qwenSessionMetadataForSnapshot(applied), updatedBanks) }),
    }));
    expect(response.status).toBe(200);
    const saved = await response.json() as { snapshot: { meta: { id: string } } };
    const restoredResponse = await GET_ONE(new Request(`http://localhost/api/am-stage/sessions/${saved.snapshot.meta.id}`), { params: Promise.resolve({ id: saved.snapshot.meta.id }) });
    const restored = await restoredResponse.json() as { snapshot: { data: { banks: { text_parameters_qwen3: ActiveParameter[]; text_parameters_gemma: ActiveParameter[]; clap_parameters: ActiveParameter[]; siglip_parameters: ActiveParameter[] } } } };
    expect(restored.snapshot.data.banks.text_parameters_qwen3).toEqual(qwen);
    expect(restored.snapshot.data.banks.text_parameters_gemma).toEqual(originalBanks.gemma);
    expect(restored.snapshot.data.banks.clap_parameters).toEqual(originalBanks.clap);
    expect(restored.snapshot.data.banks.siglip_parameters).toEqual(originalBanks.siglip);
  });
});
