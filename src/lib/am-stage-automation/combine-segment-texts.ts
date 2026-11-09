export interface SegmentTextRecord {
  id: string;
  startSeconds: number;
  endSeconds: number;
  result: unknown;
}

export interface SegmentBriefInput {
  id: string;
  startSeconds: number;
  endSeconds: number;
  reverseQuery: string;
  reverseQueryLanguage: "en" | "ru" | "unknown";
  interpretationEn: string;
  interpretationRu: string;
}

export interface SelectedSegmentBriefInput {
  id: string;
  startSeconds: number;
  endSeconds: number;
  sources: {
    reverseQuery?: string;
    reverseQueryLanguage?: "en" | "ru" | "unknown";
    interpretationEn?: string;
    interpretationRu?: string;
    textFeatures?: string[];
    gapDescription?: { text: string; targetRange: { startSeconds: number; endSeconds: number }; sentAudioRange: { startSeconds: number; endSeconds: number; durationSeconds: number }; leftAnchorId: string; rightAnchorId: string };
    status: Record<string, "available" | "not_selected" | "unavailable">;
  };
}

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function segmentRecords(value: unknown, expectedAction: string): SegmentTextRecord[] {
  const root = object(value);
  if (root?.schema !== "am_stage_segment_text_v1" || root.actionId !== expectedAction || !Array.isArray(root.segments)) {
    throw new Error(`Expected the per-segment ${expectedAction} artifact.`);
  }
  return root.segments as SegmentTextRecord[];
}

export function buildSegmentBriefInputs(
  windows: Array<{ id: string; startSeconds: number; endSeconds: number }>,
  reverseValue: unknown,
  interpretationValue: unknown,
): SegmentBriefInput[] {
  if (!windows.length) throw new Error("Cannot assemble a Brief without audio fragments.");
  const reverse = segmentRecords(reverseValue, "text_features.reverse_query");
  const interpretations = segmentRecords(interpretationValue, "text_features.describe_llm");
  const toMap = (records: SegmentTextRecord[], label: string) => {
    const map = new Map<string, SegmentTextRecord>();
    for (const record of records) {
      if (!record || typeof record.id !== "string" || map.has(record.id)) throw new Error(`${label} contains a missing or duplicate fragment id.`);
      map.set(record.id, record);
    }
    return map;
  };
  const reverseById = toMap(reverse, "Reverse-query results");
  const interpretationById = toMap(interpretations, "Interpretations");
  const expectedIds = new Set(windows.map((window) => window.id));
  for (const [label, map] of [["Reverse-query results", reverseById], ["Interpretations", interpretationById]] as const) {
    if (map.size !== expectedIds.size || [...expectedIds].some((id) => !map.has(id)) || [...map.keys()].some((id) => !expectedIds.has(id))) {
      throw new Error(`${label} must contain exactly one result for every audio fragment.`);
    }
  }
  return windows.map((window) => {
    const reverseRecord = reverseById.get(window.id)!;
    const interpretationRecord = interpretationById.get(window.id)!;
    if (Math.abs(reverseRecord.startSeconds - window.startSeconds) > 0.001 || Math.abs(reverseRecord.endSeconds - window.endSeconds) > 0.001
      || Math.abs(interpretationRecord.startSeconds - window.startSeconds) > 0.001 || Math.abs(interpretationRecord.endSeconds - window.endSeconds) > 0.001) {
      throw new Error(`Fragment timing mismatch for ${window.id}; refusing to combine unrelated results.`);
    }
    const reverseResult = object(reverseRecord.result);
    const interpretationResult = object(interpretationRecord.result);
    const reversePayload = object(reverseResult?.reverse_query);
    const descriptionEn = interpretationResult?.description_natural_en;
    const descriptionRu = interpretationResult?.description_natural_ru;
    const reverseText = reversePayload?.query_en ?? reversePayload?.text ?? reversePayload?.query_ru;
    const reverseLanguage = reversePayload?.query_en ? "en" : reversePayload?.query_ru ? "ru" : "unknown";
    if (![descriptionEn, descriptionRu, reverseText].every((text) => typeof text === "string" && text.trim())) {
      throw new Error(`Fragment ${window.id} is missing its reverse query or EN/RU interpretation.`);
    }
    return {
      id: window.id,
      startSeconds: window.startSeconds,
      endSeconds: window.endSeconds,
      reverseQuery: (reverseText as string).trim(),
      reverseQueryLanguage: reverseLanguage,
      interpretationEn: (descriptionEn as string).trim(),
      interpretationRu: (descriptionRu as string).trim(),
    };
  });
}

export function buildSegmentBriefPrompt(segments: SegmentBriefInput[]): string {
  return JSON.stringify({
    task: "Create one concise English audio Brief representing the complete track by synthesizing all ordered fragment evidence. Preserve meaningful changes over time. Do not omit fragments, invent unsupported details, mention controls, or describe only the first fragment.",
    required_fragment_ids_in_order: segments.map((segment) => segment.id),
    fragments: segments.map((segment) => ({
      id: segment.id,
      time_seconds: { start: segment.startSeconds, end: segment.endSeconds },
      ...(segment.reverseQueryLanguage === "en"
        ? { reverse_query_en: segment.reverseQuery }
        : { reverse_query_text: segment.reverseQuery, reverse_query_language: segment.reverseQueryLanguage }),
      interpretation_en: segment.interpretationEn,
      interpretation_ru: segment.interpretationRu,
    })),
  });
}

export function buildSelectedSegmentBriefInputs(
  windows: Array<{ id: string; startSeconds: number; endSeconds: number }>,
  sources: Array<{ actionId?: string; data?: unknown }>,
  selection: { reverseQuery: boolean; interpretations: boolean; textFeatures: boolean; gapDescriptions?: boolean },
): SelectedSegmentBriefInput[] {
  if (!windows.length && (selection.reverseQuery || selection.interpretations || selection.textFeatures || selection.gapDescriptions)) throw new Error("Cannot assemble selected segment sources without audio fragments.");
  if (!windows.length) return [];
  const getMap = (actionId: string) => {
    const matching = sources.filter((source) => source.actionId === actionId);
    if (matching.length > 1) throw new Error(`${actionId} has multiple bound producers; select one source producer before Brief assembly.`);
    const artifact = matching[0]?.data;
    if (actionId === "text_features.build") {
      const root = object(artifact);
      const rows = root?.schema === "am_stage_segment_features_v1" && Array.isArray(root.segments) ? root.segments as Array<Record<string, unknown>> : [];
      return new Map(rows.flatMap((row) => typeof row.id === "string" ? [[row.id, row] as const] : []));
    }
    const root = object(artifact);
    const rows = root?.schema === "am_stage_segment_text_v1" && root.actionId === actionId && Array.isArray(root.segments) ? root.segments as Array<Record<string, unknown>> : [];
    return new Map(rows.flatMap((row) => typeof row.id === "string" ? [[row.id, row] as const] : []));
  };
  const reverse = selection.reverseQuery ? getMap("text_features.reverse_query") : new Map();
  const interpretations = selection.interpretations ? getMap("text_features.describe_llm") : new Map();
  const features = selection.textFeatures ? getMap("text_features.build") : new Map();
  const gapArtifacts = selection.gapDescriptions ? sources.filter((source) => source.actionId === "audio.describe_gaps.lfm3") : [];
  if (gapArtifacts.length > 1) throw new Error("audio.describe_gaps.lfm3 has multiple bound producers; select one before Brief assembly.");
  const gapRoot = object(gapArtifacts[0]?.data);
  const gapRows = selection.gapDescriptions && gapRoot?.schema === "am_stage_interstitial_gap_descriptions_v1" && Array.isArray(gapRoot.segments)
    ? gapRoot.segments as Array<Record<string, unknown>> : [];
  const gaps = new Map(gapRows.flatMap((row) => typeof row.id === "string" ? [[row.id, row] as const] : []));
  if (selection.reverseQuery && !reverse.size) throw new Error("Reverse Query was selected as a Brief source but has no saved node results.");
  if (selection.interpretations && !interpretations.size) throw new Error("Interpretations were selected as a Brief source but have no saved node results.");
  if (selection.textFeatures && !features.size) throw new Error("Text features were selected as a Brief source but have no saved segment snapshots.");
  if (selection.gapDescriptions && !gapArtifacts.length) throw new Error("Center gap descriptions were selected as a Brief source but no gap-description artifact is bound.");
  const ensureCoverage = (map: Map<string, Record<string, unknown>>, label: string) => {
    for (const window of windows) if (!map.has(window.id)) throw new Error(`${label} has no record for ${window.id}; the missing node is not identified as intentionally outside the sample.`);
  };
  if (selection.reverseQuery) ensureCoverage(reverse, "Reverse Query");
  if (selection.interpretations) ensureCoverage(interpretations, "Interpretations");
  if (selection.textFeatures) ensureCoverage(features, "Text features");
  return windows.flatMap((window) => {
    const reverseRow = reverse.get(window.id);
    const interpretationRow = interpretations.get(window.id);
    const featureRow = features.get(window.id);
    const gapRow = gaps.get(window.id);
    const reverseStatus = !selection.reverseQuery ? "unavailable" : reverseRow?.status === "not_selected" ? "not_selected" : reverseRow ? "available" : "unavailable";
    const interpretationStatus = !selection.interpretations ? "unavailable" : interpretationRow?.status === "not_selected" ? "not_selected" : interpretationRow ? "available" : "unavailable";
    const featureStatus = !selection.textFeatures ? "unavailable" : featureRow ? "available" : "unavailable";
    const gapStatus = !selection.gapDescriptions ? "unavailable" : gapRow?.status === "gap_described" ? "available" : gapRow ? "not_selected" : "unavailable";
    const reverseResult = object(reverseRow?.result);
    const reversePayload = object(reverseResult?.reverse_query);
    const reverseTextValue = reversePayload?.query_en ?? reversePayload?.text ?? reversePayload?.query_ru;
    const reverseTextLanguage = reversePayload?.query_en ? "en" as const : reversePayload?.query_ru ? "ru" as const : "unknown" as const;
    const interpretationResult = object(interpretationRow?.result);
    const snapshot = object(featureRow?.snapshot);
    const ranked = Array.isArray(snapshot?.ranked_fragments) ? snapshot.ranked_fragments : [];
    const textFeatures = ranked.flatMap((item) => { const fragment = object(item); return typeof fragment?.text === "string" && fragment.text.trim() ? [fragment.text.trim()] : []; });
    const start = Number(reverseRow?.startSeconds ?? interpretationRow?.startSeconds ?? featureRow?.startSeconds);
    const end = Number(reverseRow?.endSeconds ?? interpretationRow?.endSeconds ?? featureRow?.endSeconds);
    if (Number.isFinite(start) && Number.isFinite(end) && (Math.abs(start - window.startSeconds) > .001 || Math.abs(end - window.endSeconds) > .001)) throw new Error(`Fragment timing mismatch for ${window.id}; refusing to combine unrelated results.`);
    const input: SelectedSegmentBriefInput = {
      id: window.id, startSeconds: window.startSeconds, endSeconds: window.endSeconds,
      sources: {
        ...(typeof reverseTextValue === "string" && reverseTextValue.trim()
          ? { reverseQuery: reverseTextValue.trim(), reverseQueryLanguage: reverseTextLanguage }
          : {}),
        ...(typeof interpretationResult?.description_natural_en === "string" && interpretationResult.description_natural_en.trim() ? { interpretationEn: interpretationResult.description_natural_en.trim() } : {}),
        ...(typeof interpretationResult?.description_natural_ru === "string" && interpretationResult.description_natural_ru.trim() ? { interpretationRu: interpretationResult.description_natural_ru.trim() } : {}),
        ...(textFeatures.length ? { textFeatures } : {}),
        ...(gapStatus === "available" ? (() => {
          const result = object(gapRow?.result);
          const targetRange = object(gapRow?.targetRange);
          const sentAudioRange = object(gapRow?.sentAudioRange);
          const leftAnchor = object(gapRow?.leftAnchor);
          const rightAnchor = object(gapRow?.rightAnchor);
          const text = typeof result?.text === "string" ? result.text.trim() : "";
          if (!text || !targetRange || !sentAudioRange || !Number.isFinite(targetRange.startSeconds) || !Number.isFinite(targetRange.endSeconds) || !Number.isFinite(sentAudioRange.startSeconds) || !Number.isFinite(sentAudioRange.endSeconds)) throw new Error(`Gap description for ${window.id} is missing usable text or time provenance.`);
          if (Math.abs(Number(targetRange.startSeconds) - window.startSeconds) > .001 || Math.abs(Number(targetRange.endSeconds) - window.endSeconds) > .001) throw new Error(`Gap target timing mismatch for ${window.id}; refusing to combine an unrelated description.`);
          return { gapDescription: { text, targetRange: { startSeconds: Number(targetRange.startSeconds), endSeconds: Number(targetRange.endSeconds) }, sentAudioRange: { startSeconds: Number(sentAudioRange.startSeconds), endSeconds: Number(sentAudioRange.endSeconds), durationSeconds: Number(sentAudioRange.durationSeconds) }, leftAnchorId: String(leftAnchor?.id ?? ""), rightAnchorId: String(rightAnchor?.id ?? "") } };
        })() : {}),
        status: { reverseQuery: reverseStatus, interpretation: interpretationStatus, textFeatures: featureStatus, gapDescriptions: gapStatus },
      },
    };
    if (selection.reverseQuery && reverseStatus === "available" && !input.sources.reverseQuery) throw new Error(`Reverse Query result for ${window.id} is present but contains no usable text.`);
    if (selection.interpretations && interpretationStatus === "available" && !input.sources.interpretationEn && !input.sources.interpretationRu) throw new Error(`Interpretation result for ${window.id} is present but contains no usable EN/RU description.`);
    if (selection.textFeatures && featureStatus === "available" && !input.sources.textFeatures?.length) throw new Error(`Text-feature snapshot for ${window.id} contains no usable text fragments.`);
    return [input];
  });
}

export function buildSelectedSegmentBriefPrompt(segments: SelectedSegmentBriefInput[], trackDraft?: { sessionId: string; language: "en" | "ru"; text: string; snapshotUpdatedAt: string }): string {
  return JSON.stringify({
    task: "Create one concise English audio Brief from only the explicitly selected source categories. Preserve ordered changes over time. Treat fragment rows without selected evidence as coverage metadata only, not as sound evidence. A center gap description is audio evidence only for its sent_audio_range, while target_range is a wider node attribution; do not imply the full target node was heard. Do not invent unsupported details.",
    source_policy: "Source categories are separate evidence. The status field explains unavailable or intentionally not_selected node results; do not infer that not_selected means a lost result.",
    ...(trackDraft ? { saved_track_draft: { source: "AM-Stage natural description", session_id: trackDraft.sessionId, language: trackDraft.language.toUpperCase(), snapshot_updated_at: trackDraft.snapshotUpdatedAt, text: trackDraft.text } } : {}),
    fragments: segments.map((segment) => ({ id: segment.id, time_seconds: { start: segment.startSeconds, end: segment.endSeconds }, ...segment.sources })),
  });
}
