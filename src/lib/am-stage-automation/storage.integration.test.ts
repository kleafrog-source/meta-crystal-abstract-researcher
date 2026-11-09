import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { automationRoot, moveRunToTrash, purgeTrashedRun, readRunArtifact, restoreRunDirectory, writeRunArtifact } from "./storage";

const cleanupRuns = new Set<string>();
const cleanupTrash = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupRuns].map((id) => fs.rm(path.join(automationRoot(), "runs", id), { recursive: true, force: true })));
  await Promise.all([...cleanupTrash].map((dir) => fs.rm(dir, { recursive: true, force: true })));
  cleanupRuns.clear();
  cleanupTrash.clear();
});

describe("automation artifact storage lifecycle", () => {
  it("writes, reads, trashes, restores and purges only the selected run", async () => {
    const runId = `storage-test-${randomUUID()}`;
    const artifactId = "result-1";
    cleanupRuns.add(runId);
    const payload = { actionId: "text.qwen.resolved", values: [{ technical_name: "tempo_bpm", current_value: 128 }] };

    const written = await writeRunArtifact(runId, artifactId, payload);
    expect(written.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(await readRunArtifact(written.storageRef)).toEqual(payload);

    const trashPath = await moveRunToTrash(runId);
    expect(trashPath).toBeTruthy();
    cleanupTrash.add(trashPath!);
    await expect(fs.access(path.join(automationRoot(), "runs", runId))).rejects.toThrow();

    await restoreRunDirectory(runId, trashPath!);
    cleanupTrash.delete(trashPath!);
    expect(await readRunArtifact(written.storageRef)).toEqual(payload);

    const secondTrash = await moveRunToTrash(runId);
    expect(secondTrash).toBeTruthy();
    cleanupTrash.add(secondTrash!);
    await purgeTrashedRun(secondTrash!);
    cleanupTrash.delete(secondTrash!);
    cleanupRuns.delete(runId);
    await expect(fs.access(path.join(automationRoot(), "runs", runId))).rejects.toThrow();
  }, 15000);

  it("rejects traversal outside the automation data root", async () => {
    await expect(readRunArtifact("../outside.json")).rejects.toThrow(/Invalid server storage reference/u);
  });
});
