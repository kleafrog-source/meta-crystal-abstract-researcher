import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock("@/lib/llm/factory", () => ({
  loadProviderForModelListing: vi.fn(async () => ({ provider: { chat: mocks.chat }, settings: { chatModel: "fixture" } })),
}));

const root = path.join(os.tmpdir(), `am-completeness-run-${process.pid}-${Date.now()}`);
const oldCwd = process.cwd();
let POST: (request: NextRequest) => Promise<Response>;
const taxonomy = {
  version: "fixture",
  normalization_rules: { empty_tokens: [] },
  synonym_map: { compositional_structures: "compositional_structures" },
  sub_category_rules: { promote_to_sub_when_merged: {} },
  domain_rules: { default_domain: "structure", map: { compositional_structures: "structure" } },
};
const original = {
  technical_name: "fixture_range",
  name_ru: "Тестовый диапазон",
  description_en: "Controls the parameter.",
  description_ru: "Нижние значения уменьшают параметр, верхние увеличивают его.",
  category: "compositional_structures",
  sub_category: "fixture_range",
  ui_element: "Range",
  min_value: 0,
  max_value: 10,
  step: 1,
  default: 5,
  unit: "ms",
  quantity_kind: "duration",
  lyria_prompt_tags: ["parameter control", "range test", "time value"],
  semantic_keywords: ["диапазон", "параметр", "время", "parameter", "range", "duration", "fixture"],
  domain: "structure",
};
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

beforeAll(async () => {
  await fs.mkdir(root, { recursive: true });
  process.chdir(root);
  await writeJson("data/combinatorial-genesis/library/parameters.json", [original]);
  await writeJson("data/combinatorial-genesis/library/manifest.json", { schema_version: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", base_sha256: "fixture", parameter_count: 1, published_package_ids: [], source: "autonomous_v2_snapshot" });
  await writeJson("data/combinatorial-genesis/library/taxonomy/category-synonym-map.json", taxonomy);
  await writeJson("data/combinatorial-genesis/library/catalogue-state.json", { revision: "old", indexes_dirty: false, last_commit_at: null, last_commit_counts: null, last_composite_at: null, last_anchors_at: null, job: { running: false, started_at: null, finished_at: null, step: null, current: 0, total: 0, error: null, logs: [] } });
  const route = await import("./route");
  POST = route.POST;
});

beforeEach(async () => {
  mocks.chat.mockReset();
  await writeJson("data/combinatorial-genesis/library/parameters.json", [original]);
  await writeJson("data/combinatorial-genesis/library/completeness/retry-queue.json", []);
  await writeJson("data/combinatorial-genesis/library/catalogue-queue.json", { updated_at: "2026-01-01T00:00:00.000Z", items: [] });
});

afterAll(async () => {
  process.chdir(oldCwd);
  await fs.rm(root, { recursive: true, force: true });
});

describe("completeness run invalid-field repair contract", () => {
  it("sends explicit invalid issues and merges only the validated issue field through the save path", async () => {
    mocks.chat.mockResolvedValueOnce({ text: JSON.stringify({ items: [{ technical_name: "fixture_range", confidence: 0.95, fields: { description_en: "Low values shorten the delay; higher values extend it." } }] }) });
    const response = await POST(new NextRequest("http://fixture/api/am-parameters-catalogue/completeness/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ technical_names: ["fixture_range"], batch_size: 1, confidence_threshold: 0.6, provider: "freellmapi" }) }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.succeeded).toBe(1);
    const prompts = mocks.chat.mock.calls[0][0];
    expect(prompts[0].content).toContain("replace an invalid existing value");
    const request = JSON.parse(prompts[1].content);
    expect(request.parameters[0].field_issues).toEqual([{ field: "description_en", kind: "invalid", reason: "Для Range нужно объяснить направление низких и высоких значений." }]);
    const saved = JSON.parse(await fs.readFile("data/combinatorial-genesis/library/parameters.json", "utf8"))[0];
    expect(saved.description_en).toBe("Low values shorten the delay; higher values extend it.");
    expect(saved.default).toBe(original.default);
    expect(saved.unit).toBe(original.unit);
    expect(saved.technical_name).toBe(original.technical_name);
    const retry = JSON.parse(await fs.readFile("data/combinatorial-genesis/library/completeness/retry-queue.json", "utf8"))[0];
    expect(retry.task_version).toBe("field-issues-v2");
    expect(retry.attempts).toBe(1);
  });

  it("rejects an overlong description patch before catalogue save", async () => {
    const tooLong = `Lower values reduce delay while higher values extend it. ${"Additional explanatory wording. ".repeat(12)}`;
    mocks.chat.mockResolvedValueOnce({ text: JSON.stringify({ items: [{ technical_name: "fixture_range", confidence: 0.95, fields: { description_en: tooLong } }] }) });
    const response = await POST(new NextRequest("http://fixture/api/am-parameters-catalogue/completeness/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ technical_names: ["fixture_range"], batch_size: 1, confidence_threshold: 0.6, provider: "freellmapi" }) }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.succeeded).toBe(0);
    expect(result.failed[0].error).toContain("description_en");
    const saved = JSON.parse(await fs.readFile("data/combinatorial-genesis/library/parameters.json", "utf8"))[0];
    expect(saved.description_en).toBe(original.description_en);
    const retry = JSON.parse(await fs.readFile("data/combinatorial-genesis/library/completeness/retry-queue.json", "utf8"))[0];
    expect(retry.status).toBe("retry");
    expect(retry.attempts).toBe(1);
  });
});
