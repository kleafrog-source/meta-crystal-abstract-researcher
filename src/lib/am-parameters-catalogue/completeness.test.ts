import { describe, expect, it } from "vitest";
import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import type { TaxonomyMap } from "./taxonomy";
import { assessCompleteness } from "./completeness";

const taxonomy: TaxonomyMap = {
  version: "test",
  normalization_rules: { empty_tokens: [] },
  synonym_map: { compositional_structures: "compositional_structures" },
  sub_category_rules: { promote_to_sub_when_merged: {} },
  domain_rules: { default_domain: "structure", map: { compositional_structures: "structure" } },
};

const toggle = (overrides: Record<string, unknown> = {}) => ({
  technical_name: "semitones_step_pattern_inversion_toggle",
  name_ru: "Инверсия шага",
  description_en: "Off (0) keeps direction; On (1) reverses it.",
  description_ru: "Выкл (0) сохраняет направление текущего паттерна шагов; Вкл (1) полностью инвертирует его, превращая восходящие шаги в нисходящие.",
  category: "compositional_structures",
  sub_category: "interval_step_architecture",
  ui_element: "Toggle",
  min_value: 0,
  max_value: 1,
  step: 1,
  default: 0,
  unit: "boolean",
  quantity_kind: "boolean_state",
  lyria_prompt_tags: ["step inversion", "pattern flip", "interval control"],
  semantic_keywords: ["инверсия", "шаг", "паттерн", "inversion", "step", "pattern", "toggle"],
  domain: "structure",
  ...overrides,
}) as unknown as GenesisLibraryParameter;

describe("assessCompleteness", () => {
  it("accepts the saved Toggle description with abbreviated Выкл/Вкл and parentheses", () => {
    const result = assessCompleteness(toggle(), taxonomy);
    expect(result.complete).toBe(true);
    expect(result.missing_fields).not.toContain("description_ru");
  });

  it("accepts Range direction expressed as negative and positive values in both locales", () => {
    const row = toggle({
      ui_element: "Range",
      min_value: -1,
      max_value: 1,
      step: 0.1,
      default: 0,
      unit: "offset",
      quantity_kind: "signed_offset",
      description_en: "Negative values move the pitch downward; positive values move it upward.",
      description_ru: "Отрицательные значения смещают высоту вниз, положительные — вверх.",
    });
    const result = assessCompleteness(row, taxonomy);
    expect(result.invalid_fields).not.toContain("description_en");
    expect(result.invalid_fields).not.toContain("description_ru");
  });

  it("accepts the standard Russian lower/upper wording already used by saved Range descriptions", () => {
    const row = toggle({
      ui_element: "Range",
      min_value: 0,
      max_value: 100,
      step: 1,
      default: 50,
      unit: "ms",
      quantity_kind: "duration",
      description_en: "Low values make the loop shorter; higher values extend it.",
      description_ru: "Нижние значения делают петлю короче, высшие удлиняют её.",
    });
    expect(assessCompleteness(row, taxonomy).invalid_fields).not.toContain("description_ru");
  });

  it("accepts directional comparisons around a non-zero reference point", () => {
    const row = toggle({
      ui_element: "Range",
      min_value: 0.1,
      max_value: 2,
      step: 0.01,
      default: 1,
      unit: "coefficient",
      quantity_kind: "glide_asymmetry",
      description_en: "Values below 1.0 make upward glides faster; values above 1.0 make downward glides faster.",
      description_ru: "Значения ниже 1.0 ускоряют скольжение вверх, а значения выше 1.0 ускоряют спуск.",
    });
    const result = assessCompleteness(row, taxonomy);
    expect(result.invalid_fields).not.toContain("description_en");
    expect(result.invalid_fields).not.toContain("description_ru");
  });

  it("accepts short/long direction only for time-like Range units", () => {
    const row = toggle({
      ui_element: "Range",
      min_value: 0,
      max_value: 100,
      step: 1,
      default: 50,
      unit: "ms",
      quantity_kind: "duration",
      description_en: "Shorter delay times create dense diffusion; longer times create spacious reverberation.",
      description_ru: "Более короткие задержки дают плотную диффузию, более длительные — просторную реверберацию.",
    });
    const timeResult = assessCompleteness(row, taxonomy);
    expect(timeResult.invalid_fields).not.toContain("description_en");
    expect(timeResult.invalid_fields).not.toContain("description_ru");

    const nonTime = toggle({ ...row, unit: "degrees", quantity_kind: "angle" });
    expect(assessCompleteness(nonTime, taxonomy).invalid_fields).toContain("description_en");
  });

  it("accepts Toggle descriptions with explicit 0/1 states and meaningful contrasts", () => {
    const row = toggle({
      description_en: "0 allows the tonic drone to follow modal shifts; 1 pins it to the original key.",
      description_ru: "0 позволяет бурдону следовать за сменой лада, 1 удерживает исходную тональность.",
    });
    const result = assessCompleteness(row, taxonomy);
    expect(result.invalid_fields).not.toContain("description_en");
    expect(result.invalid_fields).not.toContain("description_ru");

    const vague = toggle({ description_en: "Values 0 and 1 are supported.", description_ru: "Допустимы значения 0 и 1." });
    expect(assessCompleteness(vague, taxonomy).invalid_fields).toContain("description_en");
    expect(assessCompleteness(vague, taxonomy).invalid_fields).toContain("description_ru");
  });

  it("distinguishes absent descriptions from present but invalid descriptions", () => {
    const missing = assessCompleteness(toggle({ description_ru: "   " }), taxonomy);
    expect(missing.missing_only_fields).toContain("description_ru");
    expect(missing.invalid_fields).not.toContain("description_ru");

    const invalid = assessCompleteness(toggle({ description_ru: "Выкл оставляет паттерн без изменений." }), taxonomy);
    expect(invalid.invalid_fields).toContain("description_ru");
    expect(invalid.missing_only_fields).not.toContain("description_ru");
    expect(invalid.gaps.find((gap) => gap.field === "description_ru")?.kind).toBe("invalid");
  });

  it("treats null and whitespace as missing, but preserves zero as a valid Toggle default", () => {
    expect(assessCompleteness(toggle({ description_ru: null }), taxonomy).missing_only_fields).toContain("description_ru");
    const result = assessCompleteness(toggle({ default: 0 }), taxonomy);
    expect(result.invalid_fields).not.toContain("default");
    expect(result.missing_only_fields).not.toContain("default");
  });

  it("reports false as a present value, then validates it against the project's numeric Toggle contract", () => {
    const result = assessCompleteness(toggle({ default: false }), taxonomy);
    expect(result.invalid_fields).toContain("default");
    expect(result.missing_only_fields).not.toContain("default");
  });

  it("requires only fields applicable to Select and Text controls and accepts an intentional empty Text default", () => {
    const select = toggle({ ui_element: "Select", min_value: undefined, max_value: undefined, step: undefined, options: ["a", "b"], default: "a", unit: "mode", quantity_kind: "mode_choice" });
    expect(assessCompleteness(select, taxonomy).complete).toBe(true);

    const text = toggle({ ui_element: "Text", min_value: undefined, max_value: undefined, step: undefined, options: undefined, default: "", unit: "text", quantity_kind: "text_value" });
    expect(assessCompleteness(text, taxonomy).missing_fields).not.toContain("default");
    expect(assessCompleteness(text, taxonomy).missing_fields).not.toContain("min_value");
    expect(assessCompleteness(text, taxonomy).missing_fields).not.toContain("options");
    expect(assessCompleteness(toggle({ ui_element: "Text", default: null, min_value: undefined, max_value: undefined, step: undefined, options: undefined, unit: "text", quantity_kind: "text_value" }), taxonomy).missing_only_fields).toContain("default");
  });
});
