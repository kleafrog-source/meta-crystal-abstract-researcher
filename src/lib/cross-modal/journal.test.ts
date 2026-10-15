import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ActiveParameter } from "@/lib/rag-v3/types";

import { deleteJournalRecord, listJournalRecords, saveJournalRecord, saveJournalVerdict, saveJournalVerification } from "./journal";

let root = "";
const parameter: ActiveParameter = { technical_name: "filter_cutoff", category: "filter", sub_category: "lowpass", ui_element: "Range", min_value: 0, max_value: 1, step: 0.01, default: 0.5, suggested_value: 0.8, current_value: 0.8, before: 0.5, source: "value_anchor", detail: "test", lyria_prompt_tags: [], semantic_keywords: [], similarity: 0.75, axes: [], retrieval_scope: "sound" };
const metadata = { modality: "image" as const, engine: "siglip2" as const, label: "fixture", model: { id: "siglip-fixture", dimensions: 4 }, settings: { top_k: 1 }, parameters: [parameter] };
const identity = { version: "fixture-v1", sha256: "a".repeat(64) };
const asset = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", originalName: "fixture.png", extension: ".png" };

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "cross-modal-journal-test-")); });
afterEach(async () => { const resolved = path.resolve(root); if (resolved.startsWith(path.resolve(os.tmpdir()))) await fs.rm(resolved, { recursive: true, force: true }); });

describe("cross-modal journal", () => {
  it("is idempotent for identical content", async () => {
    const first = await saveJournalRecord(metadata, identity, asset, root); const second = await saveJournalRecord(metadata, identity, asset, root);
    expect(first.existed).toBe(false); expect(second.existed).toBe(true); expect(second.record.id).toBe(first.record.id); expect(await listJournalRecords(root)).toHaveLength(1);
  });

  it("keeps a shared asset until the final reference is deleted", async () => {
    const first = await saveJournalRecord(metadata, identity, asset, root); const second = await saveJournalRecord({ ...metadata, label: "second fixture" }, identity, asset, root);
    const assetPath = path.join(root, ...first.record.asset!.relative_path.split("/"));
    expect((await fs.stat(assetPath)).isFile()).toBe(true);
    expect((await deleteJournalRecord(first.record.id, root)).asset_deleted).toBe(false); expect((await fs.stat(assetPath)).isFile()).toBe(true);
    expect((await deleteJournalRecord(second.record.id, root)).asset_deleted).toBe(true); await expect(fs.stat(assetPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes normalized source scores and atomic manifests", async () => {
    const second = { ...parameter, technical_name: "resonance", similarity: 0.25 };
    const saved = await saveJournalRecord({ ...metadata, parameters: [parameter, second] }, identity, asset, root);
    expect(saved.record.snapshot.parameters.map((item) => item.normalized_score)).toEqual([1, 0]);
    const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
    expect(manifest.count).toBe(1); expect(manifest.journal_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps immutable verification history outside the source record", async () => {
    const saved = await saveJournalRecord(metadata, identity, asset, root);
    await saveJournalVerification({ schema_version: 1, source_record_id: saved.record.id, status: "verified", reverse_query: { query_en: "Bright resonant sound", query_ru: "Яркий резонансный звук", key_concepts: ["bright", "resonant", "sound"], uncertainties: [] }, raw_response: "{}", error: null, replay_query: "bright", replay_parameters: saved.record.snapshot.parameters, metrics: { weighted_overlap: 1, jaccard_at_k: 1, value_agreement: 1, scope_agreement: 1, verification_score: 1 }, chat: { provider: "mock", model: "fixture" }, replay: { dataset_version: "fixture-v1", dataset_sha256: identity.sha256, embedding_model: "fixture", top_k: 1 }, config: { version: "cycle-v1", weights: { weighted_overlap: .5, jaccard_at_k: .25, value_agreement: .2, scope_agreement: .05, verification_score: 0 }, thresholds: { verified: .7, review: .45 } } }, root);
    const [listed] = await listJournalRecords(root); expect(listed.latest_verification?.status).toBe("verified");
    const raw = JSON.parse(await fs.readFile(path.join(root, "records", `${saved.record.id}.json`), "utf8")); expect(raw.latest_verification).toBeUndefined();
  });

  it("stores the human verdict separately from the source record", async () => { const saved = await saveJournalRecord(metadata, identity, asset, root); await saveJournalVerdict(saved.record.id, "approved", "human review", root); const [listed] = await listJournalRecords(root); expect(listed.latest_user_verdict?.decision).toBe("approved"); const raw = JSON.parse(await fs.readFile(path.join(root, "records", `${saved.record.id}.json`), "utf8")); expect(raw.latest_user_verdict).toBeUndefined(); });
});
