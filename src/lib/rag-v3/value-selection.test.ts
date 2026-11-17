import { describe, expect, it } from "vitest";
import { applyValueSelection } from "./value-selection";
import type { ActiveParameter } from "./types";

const parameter = (patch: Partial<ActiveParameter> = {}): ActiveParameter => ({
  technical_name: "array_parameter",
  category: "test",
  sub_category: "test",
  ui_element: "Array",
  default: undefined,
  catalogue_default: [1, 2, 3],
  suggested_value: undefined,
  current_value: undefined,
  source: "unselected",
  detail: "not selected",
  similarity: 0.8,
  lyria_prompt_tags: [],
  semantic_keywords: [],
  axes: [],
  retrieval_scope: "sound",
  ...patch,
});

describe("applyValueSelection", () => {
  it("preserves JSON arrays and separates default, input and selected value", () => {
    const input = [3, 2, 1];
    const selected = [5, 4, 3];
    const result = applyValueSelection(parameter(), input, {
      status: "selected", value: selected, detail: "candidate chosen", source: "embedding_candidate",
    });
    expect(result.catalogue_default).toEqual([1, 2, 3]);
    expect(result.input_value).toEqual(input);
    expect(result.selected_value).toEqual(selected);
    expect(result.value_status).toBe("selected");
  });

  it("does not turn an absent selection into current or catalogue default", () => {
    const input = "actual input";
    const result = applyValueSelection(parameter({ default: "catalogue default" }), input, {
      status: "domain_unavailable", detail: "No declared candidate domain.",
    });
    expect(result.default).toBe("catalogue default");
    expect(result.input_value).toBe(input);
    expect(result.before).toBe(input);
    expect(result.selected_value).toBeUndefined();
    expect(result.suggested_value).toBeUndefined();
    expect(result.current_value).toBeUndefined();
    expect(result.value_status).toBe("domain_unavailable");
  });

  it("marks a selected value equal to the typed catalogue default", () => {
    const result = applyValueSelection(parameter(), undefined, {
      status: "selected", value: [1, 2, 3], detail: "candidate chosen", source: "embedding_candidate",
    });
    expect(result.value_status).toBe("selected_matches_default");
    expect(result.selected_value).toEqual(result.catalogue_default);
  });

  it("rejects internally inconsistent selection statuses", () => {
    expect(() => applyValueSelection(parameter(), undefined, {
      status: "selected", detail: "missing payload",
    })).toThrow("requires a selected value");
    expect(() => applyValueSelection(parameter(), undefined, {
      status: "selection_uncertain", value: [1, 2, 3], detail: "uncertain",
    })).toThrow("cannot carry a selected value");
  });
});
