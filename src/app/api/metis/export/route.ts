import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "metis-selection";
  const selected = Array.isArray(body.selected) ? body.selected : [];
  if (!selected.length) {
    return NextResponse.json({ error: "selected items required" }, { status: 400 });
  }

  try {
    const root = join(process.cwd(), "data", "metis", "exports");
    await mkdir(root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}-${slugify(query) || "metis-selection"}`;
    const jsonPath = join(root, `${base}.json`);
    const mdPath = join(root, `${base}.md`);
    const payload = {
      query,
      generatedAt: new Date().toISOString(),
      selected,
    };
    const markdown = [
      `# Metis selection`,
      ``,
      `Query: ${query}`,
      `Generated: ${payload.generatedAt}`,
      ``,
      ...selected.map((item: Record<string, unknown>, index: number) =>
        [
          `## ${index + 1}. ${String(item.code ?? "unknown")}`,
          `- type: ${String(item.type ?? "")}`,
          `- focus: ${String(item.focus ?? "")}`,
          `- finalScore: ${String(item.finalScore ?? "")}`,
          `- score: ${String(item.score ?? "")}`,
          `- nodeId: ${String(item.nodeId ?? "")}`,
          `- combination: ${String(item.combination ?? "")}`,
          ``,
        ].join("\n"),
      ),
    ].join("\n");
    await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf-8");
    await writeFile(mdPath, markdown, "utf-8");
    return NextResponse.json({
      ok: true,
      jsonPath,
      mdPath,
      generatedAt: payload.generatedAt,
      count: selected.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Metis export failed" }, { status: 500 });
  }
}
