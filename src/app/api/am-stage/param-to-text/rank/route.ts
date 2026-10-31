import { NextResponse } from "next/server";
import { embedText, embedTexts } from "@/lib/ollama-client";
import type { ParamTextRankingMode, ParamToTextSnapshot, RankedParamTextFragment } from "@/lib/param-to-text";

export const runtime = "nodejs";

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

function lexicalOverlap(a: string, b: string): number {
  const tokens = (value: string) => new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2));
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}

function diversify(candidates: RankedParamTextFragment[], vectors?: number[][]): RankedParamTextFragment[] {
  const pending = candidates.map((fragment, index) => ({ fragment, vector: vectors?.[index] }));
  const selected: typeof pending = [];
  while (pending.length && selected.length < 24) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      const redundancy = selected.reduce((highest, prior) => Math.max(highest,
        Math.max(item.vector && prior.vector ? Math.max(0, cosine(item.vector, prior.vector)) : 0, lexicalOverlap(item.fragment.text, prior.fragment.text))), 0);
      const adjusted = item.fragment.score - redundancy * 0.14;
      if (adjusted > bestScore) { bestScore = adjusted; bestIndex = index; }
    }
    selected.push(pending.splice(bestIndex, 1)[0]);
  }
  return selected.map(({ fragment }) => fragment);
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 512_000) return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
    const body = await request.json() as { snapshot?: ParamToTextSnapshot; brief?: string };
    const snapshot = body.snapshot;
    if (!snapshot || snapshot.schema !== "param_to_text_snapshot_v1" || !Array.isArray(snapshot.parameters)) {
      return NextResponse.json({ error: "Expected param_to_text_snapshot_v1." }, { status: 400 });
    }
    if (snapshot.parameters.length > 100) return NextResponse.json({ error: "Snapshot may contain at most 100 parameters." }, { status: 400 });
    const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 1200) : "";
    const candidates = snapshot.parameters.flatMap((entry) => {
      const common = { technical_name: String(entry.technical_name).slice(0, 180), intensity: typeof entry.intensity === "string" ? entry.intensity.slice(0, 60) : null, contribution_score: Math.max(0, Math.min(1, Number(entry.contribution_score) || 0)), prevalence: Math.max(0, Math.min(1, Number(entry.prevalence) || 0)), mean_similarity: Math.max(0, Math.min(1, Number(entry.mean_similarity) || 0)) };
      return [
        ...(Array.isArray(entry.tags) ? entry.tags : []).filter((text) => typeof text === "string" && text.trim()).map((text) => ({ ...common, kind: "tag" as const, text: text.trim().slice(0, 180) })),
        ...(Array.isArray(entry.keywords) ? entry.keywords : []).filter((text) => typeof text === "string" && text.trim()).map((text) => ({ ...common, kind: "keyword" as const, text: text.trim().slice(0, 180) })),
        ...(Array.isArray(entry.description_fragments) ? entry.description_fragments : []).filter((text) => typeof text === "string" && text.trim()).map((text) => ({ ...common, kind: "description" as const, text: text.trim().slice(0, 360) })),
      ];
    });
    const unique = [...new Map(candidates.map((fragment) => [`${fragment.kind}:${fragment.text.toLocaleLowerCase()}`, fragment] as const)).values()].slice(0, 180);
    if (!unique.length) return NextResponse.json({ ...snapshot, ranking_comparison: { frequency: [] }, ranked_fragments: [], tags_only: [], active_ranking_mode: "frequency" });

    const frequency = unique.map((fragment) => ({ ...fragment, id: `${fragment.technical_name}|${fragment.kind}|${fragment.text}`, score: fragment.contribution_score } satisfies RankedParamTextFragment)).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const frequencyResult = diversify(frequency);
    const vectors = await embedTexts(unique.map((fragment) => fragment.text));
    const weights = unique.map((fragment) => Math.max(0.01, fragment.contribution_score));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const centroid = vectors[0].map((_, dimension) => vectors.reduce((sum, vector, index) => sum + vector[dimension] * weights[index], 0) / weightTotal);
    const centroidCandidates = unique.map((fragment, index) => ({ fragment: { ...fragment, id: `${fragment.technical_name}|${fragment.kind}|${fragment.text}`, score: Math.max(0, cosine(vectors[index], centroid)) * 0.75 + fragment.contribution_score * 0.25 } satisfies RankedParamTextFragment, vector: vectors[index] })).sort((a, b) => b.fragment.score - a.fragment.score);
    const centroidResult = diversify(centroidCandidates.map((item) => item.fragment), centroidCandidates.map((item) => item.vector));
    const comparison: Partial<Record<ParamTextRankingMode, RankedParamTextFragment[]>> = { frequency: frequencyResult, centroid: centroidResult };
    let activeMode: ParamTextRankingMode = "frequency";
    if (brief) {
      const briefVector = await embedText(brief);
      const briefCandidates = unique.map((fragment, index) => ({ fragment: { ...fragment, id: `${fragment.technical_name}|${fragment.kind}|${fragment.text}`, score: Math.max(0, cosine(vectors[index], briefVector)) * 0.75 + fragment.contribution_score * 0.25 } satisfies RankedParamTextFragment, vector: vectors[index] })).sort((a, b) => b.fragment.score - a.fragment.score);
      comparison.brief = diversify(briefCandidates.map((item) => item.fragment), briefCandidates.map((item) => item.vector));
      activeMode = "brief";
    }
    const ranked = comparison[activeMode] ?? frequencyResult;
    const tagScores = new Map<string, number>();
    for (const fragment of frequencyResult) if (fragment.kind === "tag") tagScores.set(fragment.text, Math.max(tagScores.get(fragment.text) ?? 0, fragment.contribution_score));
    const allTags = [...tagScores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
    return NextResponse.json({ ...snapshot, ranking_comparison: comparison, ranked_fragments: ranked, active_ranking_mode: activeMode, tags_only: allTags });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
