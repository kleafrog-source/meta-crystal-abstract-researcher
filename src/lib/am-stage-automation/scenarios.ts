import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AUTOMATION_SCENARIOS } from "./catalog";
import { validateScenarioDefinition } from "./planning";
import type { AutomationScenarioDefinition } from "./contracts";
import type { AutomationActionId } from "./contracts";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const parseDefinition = (value: string) => JSON.parse(value) as AutomationScenarioDefinition;
const globalSeed = globalThis as typeof globalThis & { __amStageAutomationSeed?: Promise<void> };

export async function seedBuiltInScenarios() {
  if (!globalSeed.__amStageAutomationSeed) {
    globalSeed.__amStageAutomationSeed = seedBuiltInScenariosImpl().catch((error) => { globalSeed.__amStageAutomationSeed = undefined; throw error; });
  }
  return globalSeed.__amStageAutomationSeed;
}

async function seedBuiltInScenariosImpl() {
  for (const definition of AUTOMATION_SCENARIOS) {
    const issues = validateScenarioDefinition(definition);
    if (issues.length) throw new Error(`Invalid built-in scenario ${definition.id}: ${issues.join(" ")}`);
    const definitionHash = hash(definition);
    await db.$transaction(async (tx) => {
      const existing = await tx.automationScenario.findUnique({ where: { id: definition.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
      if (!existing) {
        const versionId = randomUUID();
        await tx.automationScenario.create({ data: { id: definition.id, origin: "builtin", title: definition.title, description: definition.description, currentVersionId: versionId, versions: { create: { id: versionId, version: definition.version, definitionJson: JSON.stringify(definition), definitionHash } } } });
        return;
      }
      if (existing.origin !== "builtin") throw new Error(`Scenario id collision: ${definition.id}`);
      if (existing.versions[0]?.definitionHash === definitionHash) return;
      const nextVersion = Math.max(existing.versions[0]?.version ?? 0, definition.version - 1) + 1;
      const nextDefinition = { ...definition, version: nextVersion };
      const versionId = randomUUID();
      await tx.automationScenarioVersion.create({ data: { id: versionId, scenarioId: definition.id, version: nextVersion, definitionJson: JSON.stringify(nextDefinition), definitionHash: hash(nextDefinition), sourceVersion: existing.versions[0]?.version ?? null } });
      await tx.automationScenario.update({ where: { id: definition.id }, data: { title: definition.title, description: definition.description, currentVersionId: versionId } });
    }, { timeout: 30_000 });
  }
  await db.automationExecutorLock.upsert({ where: { id: "application" }, create: { id: "application" }, update: {} });
}

export async function listAutomationScenarios(includeArchived = false) {
  await seedBuiltInScenarios();
  const scenarios = await db.automationScenario.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: [{ origin: "asc" }, { updatedAt: "desc" }], include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  return scenarios.map((scenario) => ({ id: scenario.id, origin: scenario.origin, title: scenario.title, description: scenario.description, version: scenario.versions[0]?.version ?? 0, archived: Boolean(scenario.archivedAt), definition: scenario.versions[0] ? parseDefinition(scenario.versions[0].definitionJson) : null }));
}

export async function getAutomationScenario(id: string, version?: number) {
  await seedBuiltInScenarios();
  const scenario = await db.automationScenario.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!scenario || scenario.archivedAt) return null;
  const selected = version === undefined ? scenario.versions.find((item) => item.id === scenario.currentVersionId) ?? scenario.versions[0] : scenario.versions.find((item) => item.version === version);
  return selected ? { scenario, version: selected, definition: parseDefinition(selected.definitionJson) } : null;
}

export async function createUserScenario(input: { id?: string; title: string; description?: string; definition: AutomationScenarioDefinition; importOrigin?: string }) {
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new Error("Scenario title is required.");
  const id = input.id?.trim() || `scenario-${randomUUID()}`;
  if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(id)) throw new Error("Scenario id contains unsupported characters.");
  const definition = { ...input.definition, id, version: 1, title };
  const issues = validateScenarioDefinition(definition);
  if (issues.length) throw new Error(issues.join(" "));
  const definitionHash = hash(definition), versionId = randomUUID();
  const existing = await db.automationScenario.findUnique({ where: { id } });
  if (existing) return { created: false, scenario: existing };
  const scenario = await db.automationScenario.create({ data: { id, origin: "user", title, description: input.description ?? definition.description, currentVersionId: versionId, versions: { create: { id: versionId, version: 1, definitionJson: JSON.stringify(definition), definitionHash } } } });
  return { created: true, scenario };
}

export async function saveScenarioVersion(input: { id: string; expectedVersion: number; definition: AutomationScenarioDefinition; title?: string }) {
  const scenario = await db.automationScenario.findUnique({ where: { id: input.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!scenario || scenario.origin !== "user" || scenario.archivedAt) throw new Error("Only an active user scenario can be edited.");
  const current = scenario.versions[0];
  if (!current || current.version !== input.expectedVersion) throw new Error("SCENARIO_VERSION_CONFLICT");
  const title = (input.title ?? input.definition.title).trim().slice(0, 160);
  const definition = { ...input.definition, id: scenario.id, version: current.version + 1, title };
  const issues = validateScenarioDefinition(definition);
  if (issues.length) throw new Error(issues.join(" "));
  const definitionHash = hash(definition), versionId = randomUUID();
  await db.$transaction(async (tx) => {
    const changed = await tx.automationScenario.updateMany({ where: { id: scenario.id, currentVersionId: current.id }, data: { title, description: definition.description, currentVersionId: versionId } });
    if (!changed.count) throw new Error("SCENARIO_VERSION_CONFLICT");
    await tx.automationScenarioVersion.create({ data: { id: versionId, scenarioId: scenario.id, version: definition.version, definitionJson: JSON.stringify(definition), definitionHash, sourceVersion: current.version } });
  });
  return { scenarioId: scenario.id, version: definition.version, definition };
}

export async function archiveScenario(id: string) {
  const scenario = await db.automationScenario.findUnique({ where: { id } });
  if (!scenario || scenario.origin !== "user") throw new Error("Built-in scenarios cannot be archived.");
  return db.automationScenario.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function importLegacyAutomations(items: unknown[]) {
  const results: Array<{ id: string; status: "imported" | "exists" | "incompatible"; reason?: string }> = [];
  for (const [index, raw] of items.entries()) {
    if (!raw || typeof raw !== "object") { results.push({ id: `legacy-item-${index + 1}`, status: "incompatible", reason: "The stored entry is not an object." }); continue; }
    const item = raw as { id?: unknown; name?: unknown; steps?: unknown; updatedAt?: unknown };
    const legacyId = typeof item.id === "string" && item.id.trim() ? item.id : `legacy-item-${index + 1}`;
    if (typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.steps)) { results.push({ id: legacyId, status: "incompatible", reason: "Expected id, name and a steps array; source entry was left untouched." }); continue; }
    const existing = await db.automationScenario.findUnique({ where: { id: item.id } });
    if (existing) { results.push({ id: item.id, status: "exists" }); continue; }
    const supportedSteps = item.steps.filter((step): step is AutomationActionId => typeof step === "string" && ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.server"].includes(step));
    const unsupportedSteps = item.steps.filter((step) => typeof step !== "string" || !["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.server"].includes(step));
    if (!supportedSteps.length && item.steps.length) { results.push({ id: item.id, status: "incompatible", reason: `No legacy action IDs can be mapped (${unsupportedSteps.map(String).join(", ")}). Source entry was left untouched.` }); continue; }
    if (unsupportedSteps.length) { results.push({ id: item.id, status: "incompatible", reason: `This chain contains unsupported actions (${unsupportedSteps.map(String).join(", ")}); the full chain was not partially imported. Source entry was left untouched.` }); continue; }
    const stages = supportedSteps.map((actionId, index) => ({
      stageId: `${item.id}:${String(index + 1).padStart(2, "0")}:${actionId.replaceAll(".", "-")}`,
      actionId, title: actionId, role: actionId.split(".")[0], inputBindings: index ? [{ name: "previousStage", from: `stage:${item.id}:${String(index).padStart(2, "0")}:${supportedSteps[index - 1].replaceAll(".", "-")}`, port: "order" }] : [],
      outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }], settings: { requested: {}, effective: {}, origin: "scenario_default" as const }, requiredForGoal: true, failurePolicy: "fail_run" as const, allowedFallbacks: [], available: true,
    }));
    const definition: AutomationScenarioDefinition = { id: item.id, version: 1, title: item.name.trim().slice(0, 160) || "Imported automation", description: "Imported from the previous browser automation library.", goal: "legacy_custom", acceptedInputs: ["audio_only", "brief_only", "audio_and_brief", "empty"], preparationPolicies: { importedFrom: "localStorage" }, stages, defaultSettings: {}, requiredResults: stages.flatMap((stage) => stage.outputDefinitions.map((output) => output.kind)), optionalResults: [], resultDestinations: ["automation-history", "tri-modal-stage"] };
    try { await createUserScenario({ id: item.id, title: definition.title, definition, importOrigin: "am-stage-automation-library-v1" }); results.push({ id: item.id, status: "imported" }); }
    catch (error) { results.push({ id: item.id, status: "incompatible", reason: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}
