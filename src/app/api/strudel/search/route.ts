import { NextRequest, NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";
import type { StrudelSearchResult } from "@/components/strudel-flow/types";
import { getStrudelPatternIndex } from "@/lib/strudel/pattern-index";
import { getStrudelRoleBlockIndex, searchRoleBlockIndex, type StrudelRoleBlockEntry } from "@/lib/strudel/role-block-index";
import { buildTrackPlan, type TrackPlan, type TrackRole } from "@/lib/strudel/track-plan";

type SearchAggregation = {
  score: number;
  evidence: Set<string>;
  matched: string | null;
  roles: Set<TrackRole>;
  sourceBlockIds: Set<string>;
  sourceBlockTypes: Set<string>;
};

const PARAM_DESCRIPTIONS: Record<string, Pick<StrudelSearchResult, "name" | "description" | "category">> = {
  beat: { name: "beat", description: "Primary drum or groove layer for the planned track.", category: "Pattern Assembly" },
  euclid: { name: "euclid", description: "Polyrhythmic drum layer for complex or tribal rhythmic motion.", category: "Pattern Assembly" },
  note: { name: "note", description: "Primary melodic or bass note stream derived from retrieved role blocks.", category: "Pattern Assembly" },
  chord: { name: "chord", description: "Harmony block suggested from compatible harmonic role blocks.", category: "Pattern Assembly" },
  arp: { name: "arp", description: "Arpeggiated lead layer selected from melodic role blocks.", category: "Pattern Assembly" },
  seq: { name: "seq", description: "Sequenced motif layer for more driven or mechanical phrasing.", category: "Pattern Assembly" },
  chunk: { name: "chunk", description: "Chunked phrase shaping for broken or stepped melodic material.", category: "Pattern Assembly" },
  room: { name: "room", description: "Spatial block for ambience and section depth.", category: "Pattern Assembly" },
  pan: { name: "pan", description: "Stereo motion block for spatial differentiation.", category: "Pattern Assembly" },
  lpf: { name: "lpf", description: "Low-pass filter block for warmth, softness, or bass focus.", category: "Pattern Assembly" },
  hpf: { name: "hpf", description: "High-pass filter block for brightness or sharper texture.", category: "Pattern Assembly" },
  distort: { name: "distort", description: "Aggressive texture block for industrial or driven layers.", category: "Pattern Assembly" },
  crush: { name: "crush", description: "Lo-fi or glitch texture block.", category: "Pattern Assembly" },
  fast: { name: "fast", description: "Temporal acceleration block for denser phrasing.", category: "Pattern Assembly" },
  slow: { name: "slow", description: "Temporal stretching block for sparse or ambient phrasing.", category: "Pattern Assembly" },
  square: { name: "square", description: "Chip-like oscillator suggestion for retro material.", category: "Voice Selection" },
  sawtooth: { name: "sawtooth", description: "Bright or harsh synth voice suggestion.", category: "Voice Selection" },
  triangle: { name: "triangle", description: "Soft synth voice suggestion for ambient or mellow layers.", category: "Voice Selection" },
  sine: { name: "sine", description: "Pure tone voice suggestion, often for bass support.", category: "Voice Selection" },
  noise: { name: "noise", description: "Noise-based texture source suggestion.", category: "Voice Selection" },
  fm: { name: "fm", description: "Metallic FM-style voice suggestion.", category: "Voice Selection" },
};

function styleVoiceParams(style: TrackPlan["style"]) {
  if (style === "retro") return ["square", "arp", "beat", "crush", "fast"];
  if (style === "ambient") return ["triangle", "chord", "room", "slow", "lpf"];
  if (style === "industrial") return ["sawtooth", "distort", "beat", "seq", "hpf"];
  if (style === "idm") return ["noise", "euclid", "chunk", "crush", "pan"];
  if (style === "dub") return ["triangle", "chord", "room", "note", "lpf"];
  if (style === "tribal") return ["euclid", "beat", "note", "pan", "room"];
  return ["note", "beat", "chord", "room"];
}

function paramsForRole(block: StrudelRoleBlockEntry, plan: TrackPlan): string[] {
  const base: string[] = [];
  if (block.role === "drums") {
    base.push((plan.style === "idm" || plan.style === "tribal") ? "euclid" : "beat");
    if (plan.style === "industrial") base.push("distort", "hpf");
    if (plan.style === "retro") base.push("crush");
  }
  if (block.role === "bass") {
    base.push("note", plan.style === "industrial" ? "sawtooth" : plan.style === "retro" ? "square" : "sine");
    if (plan.style === "ambient" || plan.style === "dub") base.push("lpf", "slow");
    else base.push("seq");
  }
  if (block.role === "harmony") {
    base.push("chord");
    if (plan.style === "ambient" || plan.style === "dub") base.push("room", "triangle");
    if (plan.style === "retro") base.push("square");
  }
  if (block.role === "melody") {
    base.push(plan.style === "retro" ? "arp" : "note");
    base.push(...styleVoiceParams(plan.style).filter((paramId) => ["square", "sawtooth", "triangle", "noise", "fm"].includes(paramId)));
    if (plan.style === "retro" || plan.style === "industrial") base.push("fast");
  }
  if (block.role === "texture") {
    base.push("room", "pan");
    if (plan.style === "industrial") base.push("distort");
    if (plan.style === "idm" || plan.style === "retro") base.push("crush");
    if (plan.style === "ambient") base.push("slow");
  }
  if ((block.methods ?? []).includes("euclid")) base.push("euclid");
  if ((block.methods ?? []).includes("room")) base.push("room");
  if ((block.methods ?? []).includes("pan")) base.push("pan");
  if ((block.methods ?? []).includes("distort")) base.push("distort");
  if ((block.methods ?? []).includes("crush")) base.push("crush");
  return [...new Set(base)];
}

function blockStyleBonus(block: StrudelRoleBlockEntry, plan: TrackPlan) {
  let score = 0;
  if ((block.style_tags ?? []).includes(plan.style)) score += 0.35;
  if ((block.section_fit ?? []).some((section) => plan.sections.includes(section as never))) score += 0.08;
  if (plan.style === "ambient" && (block.mood_tags ?? []).includes("ambient")) score += 0.12;
  if ((plan.style === "industrial" || plan.style === "idm") && (block.mood_tags ?? []).includes("aggressive")) score += 0.12;
  if (plan.requiredRoles.includes(block.role)) score += 0.08;
  return score;
}

function aggregateResults(query: string, plan: TrackPlan, hitsByRole: Map<TrackRole, Array<{ entry: StrudelRoleBlockEntry; score: number }>>, topK: number) {
  const aggregate = new Map<string, SearchAggregation>();

  const push = (
    paramId: string,
    amount: number,
    evidence: string,
    role: TrackRole | null,
    sourceBlockId: string | null,
    sourceBlockType: string | null,
    matched: string | null = null,
  ) => {
    const current = aggregate.get(paramId) ?? {
      score: 0,
      evidence: new Set<string>(),
      matched: null,
      roles: new Set<TrackRole>(),
      sourceBlockIds: new Set<string>(),
      sourceBlockTypes: new Set<string>(),
    };
    current.score += amount;
    current.evidence.add(evidence);
    if (!current.matched && matched) current.matched = matched;
    if (role) current.roles.add(role);
    if (sourceBlockId) current.sourceBlockIds.add(sourceBlockId);
    if (sourceBlockType) current.sourceBlockTypes.add(sourceBlockType);
    aggregate.set(paramId, current);
  };

  for (const role of plan.requiredRoles) {
    const hits = hitsByRole.get(role) ?? [];
    for (const hit of hits.slice(0, 4)) {
      const params = paramsForRole(hit.entry, plan);
      const evidence = `${role}:${hit.entry.instrument_family ?? hit.entry.block_type ?? hit.entry.id}`;
      for (const paramId of params) {
        push(paramId, hit.score + blockStyleBonus(hit.entry, plan), evidence, role, hit.entry.id, hit.entry.block_type ?? null, role);
      }
    }
  }

  for (const seeded of styleVoiceParams(plan.style)) {
    push(seeded, 0.42, `style:${plan.style}`, null, null, null, plan.style);
  }

  return [...aggregate.entries()]
    .map(([paramId, value]) => {
      const meta = PARAM_DESCRIPTIONS[paramId];
      if (!meta) return null;
      return {
        id: paramId,
        name: meta.name,
        description: `${meta.description} Evidence: ${[...value.evidence].slice(0, 3).join(", ")}.`,
        category: meta.category,
        score: Math.min(1, value.score / Math.max(1.25, plan.requiredRoles.length * 1.2)),
        matched_phrase: value.matched,
        role: value.roles.values().next().value ?? null,
        priority: value.roles.size > 0 ? 1 : 2,
        sourceBlockId: value.sourceBlockIds.values().next().value ?? null,
        sourceBlockType: value.sourceBlockTypes.values().next().value ?? null,
      } satisfies StrudelSearchResult;
    })
    .filter((item): item is StrudelSearchResult => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

function buildAssemblyStack(
  plan: TrackPlan,
  hitsByRole: Map<TrackRole, Array<{ entry: StrudelRoleBlockEntry; score: number }>>,
) {
  const stack: StrudelSearchResult[] = [];
  const seen = new Set<string>();
  const rolePriority = new Map<TrackRole, number>([
    ["drums", 0],
    ["bass", 1],
    ["harmony", 2],
    ["melody", 3],
    ["texture", 4],
  ]);

  const candidateMap = new Map<
    string,
    {
      score: number;
      role: TrackRole;
      sourceBlockId: string | null;
      sourceBlockType: string | null;
      reasons: Set<string>;
    }
  >();

  const pushCandidate = (
    paramId: string,
    role: TrackRole,
    hitScore: number,
    sourceBlockId: string | null,
    sourceBlockType: string | null,
    reason: string,
  ) => {
    const key = `${role}:${paramId}`;
    const current = candidateMap.get(key) ?? {
      score: 0,
      role,
      sourceBlockId,
      sourceBlockType,
      reasons: new Set<string>(),
    };
    current.score += hitScore;
    current.reasons.add(reason);
    if (!current.sourceBlockId && sourceBlockId) current.sourceBlockId = sourceBlockId;
    if (!current.sourceBlockType && sourceBlockType) current.sourceBlockType = sourceBlockType;
    candidateMap.set(key, current);
  };

  const enrichParamsForHit = (role: TrackRole, entry: StrudelRoleBlockEntry, hitRank: number) => {
    const extra: string[] = [];
    const density = entry.density ?? 0;
    const blockType = entry.block_type ?? "";
    const methods = entry.methods ?? [];

    if (role === "drums") {
      if (density > 0.28) extra.push("fast");
      if (blockType === "peak") extra.push("distort");
      if (methods.includes("euclid")) extra.push("euclid");
    }
    if (role === "bass") {
      if (density > 0.24 || blockType === "peak") extra.push("seq");
      if (density < 0.18 || blockType === "bed") extra.push("slow", "lpf");
      if (methods.includes("distort")) extra.push("distort");
    }
    if (role === "harmony") {
      if (blockType === "bed" || density < 0.2) extra.push("slow", "room");
      if (methods.includes("room")) extra.push("room");
      if (methods.includes("pan")) extra.push("pan");
      if (hitRank === 0 && plan.style !== "industrial") extra.push("triangle");
    }
    if (role === "melody") {
      if (methods.includes("chunk") || blockType === "peak") extra.push("chunk");
      if (density > 0.22) extra.push("fast");
      if (density < 0.12 && plan.style === "ambient") extra.push("slow");
      if (methods.includes("arp")) extra.push("arp");
    }
    if (role === "texture") {
      if (blockType === "bed" || blockType === "support") extra.push("room", "pan");
      if (blockType === "peak" || methods.includes("distort")) extra.push("distort");
      if (methods.includes("crush")) extra.push("crush");
      if (plan.style === "ambient" && density < 0.12) extra.push("slow");
    }

    return [...new Set(extra)];
  };

  for (const role of plan.requiredRoles) {
    const hits = hitsByRole.get(role) ?? [];
    for (const [hitRank, hit] of hits.slice(0, 3).entries()) {
      const params = [
        ...paramsForRole(hit.entry, plan),
        ...enrichParamsForHit(role, hit.entry, hitRank),
      ];
      const hitWeight = Math.max(0.2, hit.score * (1 - hitRank * 0.18) + blockStyleBonus(hit.entry, plan) * 0.6);
      for (const [index, paramId] of [...new Set(params)].entries()) {
        pushCandidate(
          paramId,
          role,
          Math.max(0.08, hitWeight - index * 0.04),
          hit.entry.id,
          hit.entry.block_type ?? null,
          `${role}:${hit.entry.id}`,
        );
      }
    }
  }

  for (const role of plan.requiredRoles) {
    const candidates = [...candidateMap.entries()]
      .filter(([, value]) => value.role === role)
      .sort((left, right) => right[1].score - left[1].score)
      .slice(0, role === "drums" || role === "harmony" ? 4 : 3);

    for (const [index, [key, value]] of candidates.entries()) {
      const [, paramId] = key.split(":");
      if (seen.has(paramId)) continue;
      const meta = PARAM_DESCRIPTIONS[paramId];
      if (!meta) continue;
      seen.add(paramId);
      stack.push({
        id: paramId,
        name: meta.name,
        description: `${meta.description} Assembly role: ${role}. Evidence: ${[...value.reasons].slice(0, 2).join(", ")}.`,
        category: meta.category,
        score: Math.max(0.35, Math.min(0.98, value.score)),
        matched_phrase: role,
        role,
        priority: (rolePriority.get(role) ?? 0) * 10 + index,
        sourceBlockId: value.sourceBlockId ?? null,
        sourceBlockType: value.sourceBlockType ?? null,
      });
    }
  }

  for (const paramId of styleVoiceParams(plan.style).slice(0, 3)) {
    if (seen.has(paramId)) continue;
    const meta = PARAM_DESCRIPTIONS[paramId];
    if (!meta) continue;
    seen.add(paramId);
    stack.push({
      id: paramId,
      name: meta.name,
      description: `${meta.description} Style seed for ${plan.style}.`,
      category: meta.category,
      score: 0.5,
      matched_phrase: plan.style,
      role: null,
      priority: 90 + stack.length,
      sourceBlockId: null,
      sourceBlockType: null,
    });
  }

  return stack.slice(0, 14);
}

function buildSectionAssemblyPlan(
  plan: TrackPlan,
  assemblyStack: StrudelSearchResult[],
) {
  const byRole = new Map<string, StrudelSearchResult[]>();
  for (const item of assemblyStack) {
    const roleKey = item.role ?? "unassigned";
    const bucket = byRole.get(roleKey) ?? [];
    bucket.push(item);
    byRole.set(roleKey, bucket);
  }

  const topForRole = (role: TrackRole, limit: number) => (byRole.get(role) ?? []).slice(0, limit);
  const topTexture = topForRole("texture", 2);
  const topHarmony = topForRole("harmony", 2);
  const topMelody = topForRole("melody", 2);
  const topBass = topForRole("bass", 2);
  const topDrums = topForRole("drums", 2);
  const introFocus = plan.style === "ambient" || plan.style === "dub" ? "atmosphere + harmony" : "setup motif";
  const breakFocus = plan.style === "industrial" || plan.style === "idm" ? "contrast + tension reset" : "space + reduction";

  return [
    {
      section: "intro",
      focus: introFocus,
      items: [...topTexture, ...topHarmony, ...topMelody.slice(0, 1)].slice(0, 4),
    },
    {
      section: "main",
      focus: "full arrangement core",
      items: [...topDrums, ...topBass, ...topHarmony.slice(0, 1), ...topMelody.slice(0, 1)].slice(0, 5),
    },
    {
      section: "break",
      focus: breakFocus,
      items: [...topTexture, ...topHarmony.slice(0, 1), ...topMelody.slice(0, 1)].slice(0, 4),
    },
    {
      section: "return",
      focus: "energy return + reinforcement",
      items: [...topDrums, ...topBass, ...topMelody, ...topTexture.slice(0, 1)].slice(0, 5),
    },
  ].map((sectionPlan) => ({
    ...sectionPlan,
    items: sectionPlan.items.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role ?? null,
      sourceBlockType: item.sourceBlockType ?? null,
      priority: item.priority ?? null,
    })),
  }));
}

function applySectionHints(
  assemblyStack: StrudelSearchResult[],
  sectionAssemblyPlan: ReturnType<typeof buildSectionAssemblyPlan>,
) {
  const sectionMap = new Map<string, Set<string>>();
  for (const sectionPlan of sectionAssemblyPlan) {
    for (const item of sectionPlan.items) {
      const bucket = sectionMap.get(item.id) ?? new Set<string>();
      bucket.add(sectionPlan.section);
      sectionMap.set(item.id, bucket);
    }
  }
  return assemblyStack.map((item) => ({
    ...item,
    sectionHints: [...(sectionMap.get(item.id) ?? [])],
  }));
}

function detectBeatsPerCycle(plan: TrackPlan, hitsByRole: Map<TrackRole, Array<{ entry: StrudelRoleBlockEntry; score: number }>>) {
  if (plan.style === "ambient") return 8;
  if (plan.style === "dub") return 8;
  if (plan.style === "tribal") return 8;
  if (plan.style === "idm" && (hitsByRole.get("drums")?.[0]?.entry.density ?? 0) > 0.3) return 8;
  return 4;
}

function keywordFallback(query: string): StrudelSearchResult[] {
  const normalized = query.toLowerCase();
  const plan = buildTrackPlan(query);
  return styleVoiceParams(plan.style).slice(0, 6).map((paramId, index) => ({
    id: paramId,
    name: PARAM_DESCRIPTIONS[paramId]?.name ?? paramId,
    description: PARAM_DESCRIPTIONS[paramId]?.description ?? `Fallback suggestion for ${paramId}.`,
    category: PARAM_DESCRIPTIONS[paramId]?.category ?? "Fallback",
    score: Math.max(0.3, 0.9 - index * 0.08),
    matched_phrase: normalized.split(/\s+/).find(Boolean) ?? null,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, top_k = 10 } = body;
    if (!query || typeof query !== "string") {
      return NextResponse.json({ ok: false, error: "Query parameter is required" }, { status: 400 });
    }

    const plan = buildTrackPlan(query);
    const roleBlockIndex = getStrudelRoleBlockIndex();
    if (!roleBlockIndex) {
      const results = keywordFallback(query);
      return NextResponse.json({
        ok: true,
        query,
        count: results.length,
        results,
        search_type: "keyword_fallback",
        track_plan: plan,
        role_block_index_ready: false,
        transport_plan: {
          cpm: plan.bpm,
          bpc: 4,
          reason: "Fallback transport from track plan.",
        },
      });
    }

    const { provider, settings } = await getActiveProvider();
    const queryEmbedding = await provider.embed(query, settings.embedModel);
    const hitsByRole = new Map<TrackRole, Array<{ entry: StrudelRoleBlockEntry; score: number }>>();
    for (const role of plan.requiredRoles) {
      const styledHits = searchRoleBlockIndex(queryEmbedding, { topK: 8, role, styleTag: plan.style === "default" ? undefined : plan.style });
      const hits = styledHits.length > 0 ? styledHits : searchRoleBlockIndex(queryEmbedding, { topK: 8, role });
      hitsByRole.set(role, hits);
    }

    const results = aggregateResults(query, plan, hitsByRole, top_k);
    const assemblyStackBase = buildAssemblyStack(plan, hitsByRole);
    const sectionAssemblyPlan = buildSectionAssemblyPlan(plan, assemblyStackBase);
    const assemblyStack = applySectionHints(assemblyStackBase, sectionAssemblyPlan);
    const bpc = detectBeatsPerCycle(plan, hitsByRole);
    return NextResponse.json({
      ok: true,
      query,
      count: results.length,
      results,
      assembly_stack: assemblyStack,
      section_assembly_plan: sectionAssemblyPlan,
      search_type: "role_block_track_plan",
      embedding_model: settings.embedModel,
      track_plan: plan,
      transport_plan: {
        cpm: plan.bpm,
        bpc,
        reason: `Transport inferred from style=${plan.style}, density=${plan.density}.`,
      },
      role_block_index_ready: true,
      role_block_index_rows: roleBlockIndex.manifest.rows,
      backend: roleBlockIndex.manifest.backend,
      block_preview: Object.fromEntries(
        [...hitsByRole.entries()].map(([role, hits]) => [
          role,
          hits.slice(0, 2).map((hit) => ({
            id: hit.entry.id,
            score: Number(hit.score.toFixed(4)),
            source_file: hit.entry.source_file,
            block_type: hit.entry.block_type,
            style_tags: hit.entry.style_tags ?? [],
            renderable_code: hit.entry.renderable_code,
          })),
        ]),
      ),
    });
  } catch (error) {
    console.error("Error in strudel search API:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function GET() {
  const patternIndex = getStrudelPatternIndex();
  const roleBlockIndex = getStrudelRoleBlockIndex();
  return NextResponse.json({
    ok: true,
    name: "Strudel semantic search API",
    version: "3.0.0",
    description: "Track-plan-guided retrieval over role blocks with pattern index fallback metadata.",
    endpoints: {
      search: "POST /api/strudel/search",
      params: "GET /api/strudel/params",
    },
    pattern_index: patternIndex?.manifest ?? null,
    role_block_index: roleBlockIndex?.manifest ?? null,
  });
}
