function textFromBriefArtifact(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const row = data as { text?: unknown; query_en?: unknown; reverse_query?: { query_en?: unknown } };
  if (typeof row.text === "string") return row.text.trim();
  if (typeof row.query_en === "string") return row.query_en.trim();
  return typeof row.reverse_query?.query_en === "string" ? row.reverse_query.query_en.trim() : "";
}

/** Resolve the Brief from an explicit artifact binding before considering external text. */
export function resolveAutomationBrief(input: { externalBrief?: string; boundBriefData?: unknown; hasBriefBinding: boolean }): string {
  const bound = textFromBriefArtifact(input.boundBriefData);
  if (input.hasBriefBinding) return bound;
  return input.externalBrief?.trim() || bound;
}
