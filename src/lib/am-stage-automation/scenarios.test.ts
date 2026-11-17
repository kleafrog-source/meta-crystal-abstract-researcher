import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const scenarios = new Map<string, any>();
  const plans = new Map<string, { scenarioVersionId: string }>();
  const tx = {
    automationScenario: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const scenario = scenarios.get(where.id);
        return scenario ? { ...scenario, versions: [...scenario.versions].sort((a, b) => b.version - a.version).slice(0, 1) } : null;
      },
      create: async ({ data }: { data: any }) => {
        const version = { ...data.versions.create };
        const scenario = { id: data.id, origin: data.origin, title: data.title, description: data.description, currentVersionId: data.currentVersionId, versions: [version] };
        scenarios.set(data.id, scenario);
        return scenario;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const scenario = scenarios.get(where.id);
        Object.assign(scenario, data);
        return scenario;
      },
    },
    automationScenarioVersion: {
      create: async ({ data }: { data: any }) => {
        const version = { ...data };
        scenarios.get(data.scenarioId).versions.push(version);
        return version;
      },
    },
  };
  return {
    scenarios,
    plans,
    db: {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
      automationExecutorLock: { upsert: vi.fn(async () => ({})) },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: state.db }));

import { AUTOMATION_SCENARIOS } from "./catalog";
import { seedBuiltInScenarios } from "./scenarios";

const R_ID = "catalogue-bank-merge-r";
const seedAgain = async () => {
  (globalThis as typeof globalThis & { __amStageAutomationSeed?: Promise<void> }).__amStageAutomationSeed = undefined;
  await seedBuiltInScenarios();
};

describe("built-in scenario registration identity and versioning", () => {
  beforeEach(() => {
    state.scenarios.clear();
    state.plans.clear();
    (globalThis as typeof globalThis & { __amStageAutomationSeed?: Promise<void> }).__amStageAutomationSeed = undefined;
  });

  it("keeps fixture identity separate and reinitializes an already seeded R version idempotently", async () => {
    const definition = AUTOMATION_SCENARIOS.find((item) => item.id === R_ID)!;
    const fixtureId = `fixture-${R_ID}`;
    await seedBuiltInScenarios();

    const first = state.scenarios.get(R_ID);
    expect(first.origin).toBe("builtin");
    expect(first.versions).toHaveLength(1);
    expect(first.versions[0]).toMatchObject({ version: definition.version, definitionJson: JSON.stringify(definition) });
    const firstVersionId = first.currentVersionId;

    state.scenarios.set(fixtureId, { id: fixtureId, origin: "fixture", title: fixtureId, currentVersionId: null, versions: [] });
    await seedAgain();

    expect(state.scenarios.get(R_ID).currentVersionId).toBe(firstVersionId);
    expect(state.scenarios.get(R_ID).versions).toHaveLength(1);
    expect(state.scenarios.get(fixtureId).origin).toBe("fixture");
  });

  it("preserves the collision guard for a fixture stored under the production identity", async () => {
    state.scenarios.set(R_ID, {
      id: R_ID,
      origin: "fixture",
      title: R_ID,
      currentVersionId: null,
      versions: [{ id: "fixture-version", scenarioId: R_ID, version: 1, definitionJson: "{}", definitionHash: "fixture-hash" }],
    });

    await expect(seedBuiltInScenarios()).rejects.toThrow(`Scenario id collision: ${R_ID}`);
    expect(state.scenarios.get(R_ID).origin).toBe("fixture");
  });

  it("adds a new built-in version without rewriting a plan pinned to an older version", async () => {
    const definition = AUTOMATION_SCENARIOS.find((item) => item.id === R_ID)!;
    const priorVersionId = "saved-r-version-1";
    state.scenarios.set(R_ID, {
      id: R_ID,
      origin: "builtin",
      title: definition.title,
      currentVersionId: priorVersionId,
      versions: [{ id: priorVersionId, scenarioId: R_ID, version: 1, definitionJson: "{}", definitionHash: "prior-definition-hash" }],
    });
    state.plans.set("prior-run-plan", { scenarioVersionId: priorVersionId });

    await seedBuiltInScenarios();

    const scenario = state.scenarios.get(R_ID);
    expect(scenario.currentVersionId).not.toBe(priorVersionId);
    expect(scenario.versions).toHaveLength(2);
    expect(scenario.versions.find((version: { id: string }) => version.id === priorVersionId)).toBeDefined();
    expect(scenario.versions.find((version: { id: string }) => version.id === scenario.currentVersionId)).toMatchObject({ version: 2, sourceVersion: 1, definitionJson: JSON.stringify({ ...definition, version: 2 }) });
    expect(state.plans.get("prior-run-plan")?.scenarioVersionId).toBe(priorVersionId);
  });

  it("keeps historical H assemble version and its pinned plan when registering version 2", async () => {
    const definition = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-two-briefs-assemble-qwen-h")!;
    const oldDefinition = { ...definition, version: 1, title: "H historical assemble v1" };
    const oldJson = JSON.stringify(oldDefinition);
    const priorVersionId = "saved-h-assemble-version-1";
    state.scenarios.set(definition.id, {
      id: definition.id,
      origin: "builtin",
      title: oldDefinition.title,
      currentVersionId: priorVersionId,
      versions: [{ id: priorVersionId, scenarioId: definition.id, version: 1, definitionJson: oldJson, definitionHash: "h-v1-hash" }],
    });
    state.plans.set("prior-h-run-plan", { scenarioVersionId: priorVersionId });

    await seedBuiltInScenarios();

    const scenario = state.scenarios.get(definition.id);
    expect(scenario.versions.find((version: { id: string }) => version.id === priorVersionId)?.definitionJson).toBe(oldJson);
    expect(scenario.versions.find((version: { id: string }) => version.id === scenario.currentVersionId)).toMatchObject({ version: 2, sourceVersion: 1, definitionJson: JSON.stringify({ ...definition, version: 2 }) });
    expect(state.plans.get("prior-h-run-plan")?.scenarioVersionId).toBe(priorVersionId);
  });
});

describe("AM2 negative scenario demonstrations", () => {
  it("keeps NEG-1 through NEG-4 as negative-test inputs, not runnable scenarios", () => {
    const negativeDemoIds = [
      "demo-neg-1-incompatible-merge",
      "demo-neg-2-empty-join",
      "demo-neg-3-plan-identity",
      "demo-neg-4-unsupported-export",
    ];
    const registeredScenarioIds = new Set(AUTOMATION_SCENARIOS.map((scenario) => scenario.id));

    for (const id of negativeDemoIds) expect(registeredScenarioIds.has(id), `${id} must not be registered`).toBe(false);
  });
});
