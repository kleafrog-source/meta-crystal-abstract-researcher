import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEligibleDonorMap, classifyPublishName, createDonorPolicy, readDonorRestrictions, readEffectiveLiveCatalogue, resolveDonorReferences } from "./donor-policy";
import { donorSimilarityWeight, inferCandidateValues } from "./value-inference";
import { CombinatorialGenerator, type GenesisAtomicToken, type GenesisCandidate } from "./core";
import type { RuntimeParameterRecord } from "./runtime-index";

function parameter(technical_name: string, values: Partial<RuntimeParameterRecord> = {}): RuntimeParameterRecord {
  return {
    technical_name,
    quantity_kind: "duration",
    ui_element: "Range",
    unit: "unitless",
    min_value: 0,
    max_value: 10,
    step: 1,
    default: 4,
    ...values,
  };
}

function candidate(sourceNames: string[]): GenesisCandidate {
  return {
    technical_name: "spectral_harmonic_depth",
    tokens: ["spectral", "harmonic", "depth"],
    parent_parameters: sourceNames,
    structural_score: 1,
    atom_semantic_score: 1,
    token_provenance: [{ token: "depth", role: "property", source_parameters: sourceNames }],
  };
}

describe("Combinatorial Genesis donor policy", () => {
  it("blocks a tombstoned frozen-only donor arriving through macro-local sources", () => {
    const tombstoned = parameter("generative_lsystem_recursion_depth_limit");
    const policy = createDonorPolicy([], [tombstoned], {
      tombstoneNames: new Set([tombstoned.technical_name]),
      excludedNames: new Set(),
      allowFrozenFallback: true,
    });

    const result = inferCandidateValues(candidate([tombstoned.technical_name]), policy);

    expect(result.donor_parameters).toEqual([]);
    expect(resolveDonorReferences([tombstoned.technical_name], policy).diagnostics).toEqual([
      { technical_name: tombstoned.technical_name, reason: "tombstoned" },
    ]);
  });

  it("lets live values win an ID collision and blocks them if tombstoned or excluded", () => {
    const live = parameter("shared_depth", { default: 7 });
    const frozen = parameter("shared_depth", { default: 2 });
    const allowed = createDonorPolicy([live], [frozen], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: true,
    });
    expect(buildEligibleDonorMap(allowed).get("shared_depth")?.default).toBe(7);

    const excluded = createDonorPolicy([live], [frozen], {
      tombstoneNames: new Set(), excludedNames: new Set(["shared_depth"]), allowFrozenFallback: true,
    });
    expect(resolveDonorReferences(["shared_depth"], excluded).acceptedNames).toEqual([]);
    expect(resolveDonorReferences(["shared_depth"], excluded).diagnostics[0].reason).toBe("excluded");
  });

  it("rejects archived sources and preserves unresolved reasons", () => {
    const frozen = parameter("frozen_depth");
    const denied = createDonorPolicy([], [frozen], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = resolveDonorReferences(["frozen_depth", "missing_depth"], denied);
    expect(result.acceptedNames).toEqual([]);
    expect(result.diagnostics).toEqual([
      { technical_name: "frozen_depth", reason: "archived_source_disabled" },
      { technical_name: "missing_depth", reason: "unresolved" },
    ]);
  });

  it("does not let the legacy frozen-fallback option re-enable archived donors", () => {
    const archived = parameter("archived_depth");
    const policy = createDonorPolicy([], [archived], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: true,
    });
    expect(resolveDonorReferences(["archived_depth"], policy)).toMatchObject({
      acceptedNames: [],
      diagnostics: [{ technical_name: "archived_depth", reason: "archived_source_disabled" }],
    });
  });

  it("reads tombstone and exclusion fixtures without writing missing runtime files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cg-donor-policy-"));
    try {
      await fs.mkdir(path.join(root, "library"), { recursive: true });
      await fs.mkdir(path.join(root, "registry"), { recursive: true });
      await fs.writeFile(path.join(root, "library", "catalogue-deleted.json"), JSON.stringify(["deleted_id"]));
      await fs.writeFile(path.join(root, "registry", "excluded.json"), JSON.stringify({
        entries: [{ technical_name: "excluded_id" }],
      }));
      const result = await readDonorRestrictions(root);
      expect(result.tombstoneNames).toEqual(new Set(["deleted_id"]));
      expect(result.excludedNames).toEqual(new Set(["excluded_id"]));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }

    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cg-donor-policy-empty-"));
    try {
      await readDonorRestrictions(missingRoot);
      await expect(fs.readdir(path.join(missingRoot, "library"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(missingRoot, { recursive: true, force: true });
    }
  });

  it("builds an effective donor and candidate snapshot from live only", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cg-effective-live-"));
    try {
      await fs.mkdir(path.join(root, "library"), { recursive: true });
      await fs.mkdir(path.join(root, "registry"), { recursive: true });
      await fs.writeFile(path.join(root, "library", "parameters.json"), JSON.stringify([
        parameter("shared_depth", { default: 7 }),
        parameter("tombstoned_live"),
        parameter("excluded_live"),
      ]));
      await fs.writeFile(path.join(root, "library", "catalogue-deleted.json"), JSON.stringify(["tombstoned_live"]));
      await fs.writeFile(path.join(root, "registry", "excluded.json"), JSON.stringify({
        entries: [{ technical_name: "excluded_live" }],
      }));
      await fs.mkdir(path.join(root, "datasets", "old"), { recursive: true });
      await fs.writeFile(path.join(root, "datasets", "old", "parameters.json"), JSON.stringify([
        parameter("shared_depth", { default: 2 }),
        parameter("archived_only"),
      ]));

      const snapshot = await readEffectiveLiveCatalogue(root);
      expect(snapshot.parameters.map((item) => item.technical_name)).toEqual(["shared_depth"]);
      expect(snapshot.parameters[0]?.default).toBe(7);
      expect(snapshot.tombstoneNames).toEqual(new Set(["tombstoned_live"]));
      expect(snapshot.excludedNames).toEqual(new Set(["excluded_live"]));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not mix distinct UI/unit/options signatures", () => {
    const sources = [
      parameter("a_depth", { unit: "ms" }),
      parameter("b_depth", { unit: "ms" }),
      parameter("c_depth", { unit: "hz" }),
      parameter("d_depth", { unit: "hz" }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const values = new Map([["a_depth", 0.9], ["b_depth", 0.8], ["c_depth", 0.1], ["d_depth", 0.1]]);
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy, values);
    expect(result.donor_parameters).toEqual(["a_depth", "b_depth"]);
  });

  it("ignores malformed numeric donors and preserves a valid aggregate", () => {
    const sources = [
      parameter("a_depth", { min_value: 0, max_value: 10, step: 1, default: 5 }),
      parameter("b_depth", { min_value: 2, max_value: 12, step: 2, default: 7 }),
      parameter("c_depth", { min_value: 0, max_value: 1, step: 2, default: 8 }),
      parameter("d_depth", { min_value: 0, max_value: 10, step: 1, default: "not-a-number" }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy);
    expect(result.donor_parameters).toEqual(["a_depth", "b_depth"]);
    expect(result.min_value).toBeLessThanOrEqual(result.default as number);
    expect(result.default).toBeLessThanOrEqual(result.max_value as number);
    expect(result.step).toBeGreaterThan(0);
    expect(result.step).toBeLessThanOrEqual((result.max_value as number) - (result.min_value as number));
  });

  it("rejects invalid Select donor options/defaults", () => {
    const source = parameter("a_depth", { ui_element: "Select", unit: "mode", options: ["soft", "hard"], default: "invalid" });
    const policy = createDonorPolicy([source], [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate([source.technical_name]), policy);
    expect(result.status).toBe("needs_review");
    expect(result.donor_parameters).toEqual([]);
  });

  it("requires manual review instead of mixing duration and count donors", () => {
    const sources = [
      parameter("a_depth", { quantity_kind: "duration" }),
      parameter("b_depth", { quantity_kind: "count" }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy);
    expect(result.status).toBe("needs_review");
    expect(result.donor_parameters).toEqual([]);
    expect(result.quantity_kind).toBeUndefined();
    expect(result.explanation.join(" ")).toContain("disagree on quantity_kind");
  });

  it("resolves compatible donors and carries their source quantity_kind", () => {
    const sources = [
      parameter("a_depth", { quantity_kind: "duration", default: 3 }),
      parameter("b_depth", { quantity_kind: "duration", default: 5 }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy,
      new Map([['a_depth', 0.9], ['b_depth', 0.8]]));
    expect(result.status).toBe("auto_resolved");
    expect(result.quantity_kind).toBe("duration");
    expect(result.donor_parameters).toEqual(["a_depth", "b_depth"]);
  });

  it("does not let zero-weight donors affect aggregation, and reports missing-score fallback", () => {
    const sources = [
      parameter("a_depth", { quantity_kind: "duration", default: 2 }),
      parameter("b_depth", { quantity_kind: "duration", default: 8 }),
      parameter("c_depth", { quantity_kind: "duration", max_value: 200, default: 100 }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy,
      new Map([['a_depth', 0.8], ['b_depth', 0.8], ['c_depth', -0.4]]));
    expect(result.donor_parameters).toEqual(["a_depth", "b_depth"]);
    expect(result.default).toBe(5);
    expect(result.donor_diagnostics).toContainEqual({ technical_name: "c_depth", reason: "similarity_zero_weight", similarity: -0.4 });

    const fallback = inferCandidateValues(candidate(["a_depth", "b_depth"]), policy);
    expect(fallback.donor_diagnostics).toContainEqual({ technical_name: "a_depth", reason: "similarity_fallback", similarity: 0.5 });
  });

  it("does not auto-resolve when every measured similarity has zero or invalid weight", () => {
    const sources = [
      parameter("a_depth", { quantity_kind: "duration", default: 2 }),
      parameter("b_depth", { quantity_kind: "duration", default: 8 }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    for (const score of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy,
        new Map([['a_depth', score], ['b_depth', 0]]));
      expect(result.status).toBe("needs_review");
      expect(result.donor_parameters).toEqual([]);
      expect(result.default).toBeUndefined();
    }
  });

  it("does not let a zero-weight malformed donor veto two valid positive-weight donors", () => {
    const sources = [
      parameter("a_depth", { quantity_kind: "duration", default: 2 }),
      parameter("b_depth", { quantity_kind: "duration", default: 8 }),
      parameter("c_depth", { quantity_kind: null, max_value: 200, default: 100 }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy,
      new Map([["a_depth", 0.8], ["b_depth", 0.8], ["c_depth", Number.NaN]]));
    expect(result.status).toBe("auto_resolved");
    expect(result.donor_parameters).toEqual(["a_depth", "b_depth"]);
    expect(result.donor_diagnostics).toContainEqual({ technical_name: "c_depth", reason: "similarity_invalid" });
  });

  it("requires manual review for absent or malformed quantity_kind", () => {
    for (const qk of [undefined, null, "Duration"] as const) {
      const sources = [
        parameter("a_depth", { quantity_kind: "duration" }),
        parameter("b_depth", { quantity_kind: qk }),
      ];
      const policy = createDonorPolicy(sources, [], {
        tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
      });
      const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy);
      expect(result.status).toBe("needs_review");
      expect(result.quantity_kind).toBeUndefined();
      expect(result.donor_parameters).toEqual([]);
    }
  });

  it("keeps fourth-power similarity weights finite and gives negative cosine zero weight", () => {
    expect(donorSimilarityWeight(-0.25)).toBe(0);
    expect(donorSimilarityWeight(Number.NaN)).toBe(0);
    expect(donorSimilarityWeight(Number.POSITIVE_INFINITY)).toBe(0);
    expect(donorSimilarityWeight(0.5)).toBe(0.0625);
  });

  it("distinguishes publish conflicts and rechecks names against the current live set", () => {
    const state = {
      liveNames: new Set(["live_duplicate", "also_tombstoned"]),
      tombstoneNames: new Set(["also_tombstoned"]),
      excludedNames: new Set(["excluded_name"]),
    };
    expect(classifyPublishName("live_duplicate", state)).toEqual(["live_duplicate"]);
    expect(classifyPublishName("also_tombstoned", state)).toEqual(["live_duplicate", "tombstoned"]);
    expect(classifyPublishName("excluded_name", state)).toEqual(["excluded"]);
    expect(classifyPublishName("frozen_only", state)).toEqual([]);

    // This state is read at publish time, so a draft that was free earlier is blocked now.
    expect(classifyPublishName("new_since_draft", {
      ...state,
      liveNames: new Set([...state.liveNames, "new_since_draft"]),
    })).toEqual(["live_duplicate"]);
  });

  it("keeps candidate-name reservations separate from eligible source donors", () => {
    const liveDonor = parameter("live_depth", { quantity_kind: "duration" });
    const frozenDonor = parameter("frozen_depth", { quantity_kind: "duration" });
    const policy = createDonorPolicy([liveDonor], [frozenDonor], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    expect(classifyPublishName("live_depth", {
      liveNames: new Set(["live_depth"]), tombstoneNames: new Set(), excludedNames: new Set(),
    })).toContain("live_duplicate");
    expect(resolveDonorReferences(["live_depth", "frozen_depth"], policy)).toMatchObject({
      acceptedNames: ["live_depth"],
      diagnostics: [{ technical_name: "frozen_depth", reason: "archived_source_disabled" }],
    });

    const blocked = createDonorPolicy([liveDonor], [frozenDonor], {
      tombstoneNames: new Set(["frozen_depth"]), excludedNames: new Set(["live_depth"]), allowFrozenFallback: true,
    });
    expect(resolveDonorReferences(["live_depth", "frozen_depth", "unresolved_depth"], blocked).diagnostics)
      .toEqual([
        { technical_name: "live_depth", reason: "excluded" },
        { technical_name: "frozen_depth", reason: "tombstoned" },
        { technical_name: "unresolved_depth", reason: "unresolved" },
      ]);
  });

  it("applies the eight-parent cap after eligibility filtering and chooses lexical first", () => {
    const names = Array.from({ length: 10 }, (_, index) => `source_${String(index).padStart(2, "0")}_depth`);
    const live = names.map((name) => parameter(name));
    const policy = createDonorPolicy(live, [], {
      tombstoneNames: new Set([names[0]]), excludedNames: new Set([names[1]]), allowFrozenFallback: false,
    });
    const eligibleNames = resolveDonorReferences(names, policy).acceptedNames;
    const tokens: GenesisAtomicToken[] = [
      { token: "spectral", frequency: 1, roles: ["descriptor"], source_parameters: [] },
      { token: "harmonic", frequency: 1, roles: ["concept"], source_parameters: [] },
      { token: "depth", frequency: 1, roles: ["property"], source_parameters: eligibleNames },
    ];
    const [generated] = new CombinatorialGenerator().generate(tokens, [], {
      seed: 0, max_candidates: 1, min_tokens: 3, max_tokens: 3,
    });
    expect(generated.parent_parameters).toEqual(names.slice(2, 10));
  });

  it("selects the positive-similarity donor signature over a negative one", () => {
    const sources = [
      parameter("a_depth", { unit: "ms" }),
      parameter("b_depth", { unit: "ms" }),
      parameter("c_depth", { unit: "hz" }),
      parameter("d_depth", { unit: "hz" }),
    ];
    const policy = createDonorPolicy(sources, [], {
      tombstoneNames: new Set(), excludedNames: new Set(), allowFrozenFallback: false,
    });
    const result = inferCandidateValues(candidate(sources.map((item) => item.technical_name)), policy,
      new Map([["a_depth", 0.3], ["b_depth", 0.3], ["c_depth", -0.2], ["d_depth", -0.2]]));
    expect(result.donor_parameters).toEqual(["a_depth", "b_depth"]);
    expect(Number.isFinite(result.confidence)).toBe(true);
  });
});

