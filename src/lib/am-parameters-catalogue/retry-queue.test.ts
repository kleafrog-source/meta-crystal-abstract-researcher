import { describe, expect, it } from "vitest";
import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import type { TaxonomyMap } from "./taxonomy";
import { COMPLETENESS_TASK_VERSION, completenessFieldSignature, inspectRetryEntry } from "./retry-queue";

const taxonomy: TaxonomyMap = {
  version: "test",
  normalization_rules: { empty_tokens: [] },
  synonym_map: { compositional_structures: "compositional_structures" },
  sub_category_rules: { promote_to_sub_when_merged: {} },
  domain_rules: { default_domain: "structure", map: { compositional_structures: "structure" } },
};

const complete = {
  technical_name: "test_toggle",
  name_ru: "Переключатель",
  description_en: "Off disables; On enables the control.",
  description_ru: "Выкл отключает, вкл включает переключатель.",
  category: "compositional_structures",
  sub_category: "test_toggle",
  ui_element: "Toggle",
  min_value: 0,
  max_value: 1,
  step: 1,
  default: 0,
  unit: "boolean",
  quantity_kind: "boolean_state",
  lyria_prompt_tags: ["toggle control", "switch mode", "state change"],
  semantic_keywords: ["переключатель", "режим", "состояние", "toggle", "switch", "mode", "state"],
  domain: "structure",
} as unknown as GenesisLibraryParameter;

const item = (overrides: Record<string, unknown> = {}) => ({
  technical_name: complete.technical_name,
  attempts: 1,
  status: "retry",
  error: "previous error",
  updated_at: "2026-11-11T00:00:00.000Z",
  task_version: COMPLETENESS_TASK_VERSION,
  ...overrides,
});

describe("retry queue eligibility", () => {
  it("keeps a manually or otherwise completed record as resolved history, not actionable work", () => {
    const result = inspectRetryEntry(item(), complete, taxonomy);
    expect(result.effective_status).toBe("resolved");
    expect(result.eligible).toBe(false);
    expect(result.error).toBe("previous error");
  });

  it("marks a deleted or tombstoned record as superseded", () => {
    const result = inspectRetryEntry(item(), undefined, taxonomy);
    expect(result.effective_status).toBe("superseded");
    expect(result.eligible).toBe(false);
  });

  it("allows only a still-incomplete current task under the three-attempt limit", () => {
    const partial = { ...complete, description_en: " " } as GenesisLibraryParameter;
    const fields = ["description_en"];
    const result = inspectRetryEntry(item({ field_signature: completenessFieldSignature(fields), attempts: 2 }), partial, taxonomy);
    expect(result.effective_status).toBe("retry");
    expect(result.eligible).toBe(true);
  });

  it("does not reset the limit for a new field set or after refresh", () => {
    const partial = { ...complete, description_en: " " } as GenesisLibraryParameter;
    const oldTask = item({ field_signature: "description_ru", attempts: 2 });
    const result = inspectRetryEntry(oldTask, partial, taxonomy);
    expect(result.effective_status).toBe("superseded");
    expect(result.eligible).toBe(false);
    expect(inspectRetryEntry(item({ attempts: 3 }), partial, taxonomy).effective_status).toBe("failed_permanent");
  });

  it("uses the saved legacy missing-field signature to supersede an old task version", () => {
    const partial = { ...complete, description_en: " " } as GenesisLibraryParameter;
    const oldTask = item({ error: "Patch did not improve; missing=description_ru; fields=description_ru;" });
    expect(inspectRetryEntry(oldTask, partial, taxonomy).effective_status).toBe("superseded");
  });

  it("supersedes tasks from the prior prompt contract without clearing their retry history", () => {
    const partial = { ...complete, description_en: " " } as GenesisLibraryParameter;
    const history = [{ attempt: 3, status: "failed", error: "provider failure", at: "2026-11-10T00:00:00Z" }];
    const oldTask = item({ task_version: "legacy", attempts: 3, attempt_history: history });
    const result = inspectRetryEntry(oldTask, partial, taxonomy);
    expect(result.effective_status).toBe("superseded");
    expect(result.eligible).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.attempt_history).toEqual(history);
  });

  it("keeps explicit manual-review tasks out of automatic retries", () => {
    const partial = { ...complete, description_en: " " } as GenesisLibraryParameter;
    const result = inspectRetryEntry(item({ status: "needs_review" }), partial, taxonomy);
    expect(result.effective_status).toBe("needs_review");
    expect(result.eligible).toBe(false);
  });

  it("counts one queue task per parameter and records the field set deterministically", () => {
    expect(completenessFieldSignature(["description_ru", "description_en", "description_ru"])).toBe("description_en|description_ru");
  });
});
