type ParameterRecord = Record<string, unknown> & { technical_name?: unknown };
type BankInput = { artifactId?: string; data?: unknown } | undefined;
type Segment = { id: string; startSeconds?: number; endSeconds?: number; parameters: ParameterRecord[]; [key: string]: unknown };

function records(data: unknown): ParameterRecord[] {
  if (Array.isArray(data)) return data.filter((item): item is ParameterRecord => Boolean(item && typeof item === "object"));
  if (data && typeof data === "object" && Array.isArray((data as { parameters?: unknown }).parameters)) return records((data as { parameters: unknown }).parameters);
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) return records((data as { results: unknown }).results);
  return [];
}

function segments(data: unknown): Segment[] | null {
  if (!data || typeof data !== "object" || !Array.isArray((data as { segments?: unknown }).segments)) return null;
  return (data as { segments: unknown[] }).segments.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") return [];
    const segment = item as Record<string, unknown>;
    return [{ ...segment, id: segment.id as string, parameters: records(segment.parameters) } as Segment];
  });
}

function valueOf(record: ParameterRecord): number | string | undefined {
  const value = record.current_value ?? record.default;
  return typeof value === "number" && Number.isFinite(value) || typeof value === "string" ? value : undefined;
}

function resolveRecords(identities: ParameterRecord[], clap: ParameterRecord[], qwen: ParameterRecord[], sourceArtifactIds: { clap?: string; qwen?: string; identity?: string }) {
  const clapByName = new Map(clap.filter((item) => typeof item.technical_name === "string").map((item) => [item.technical_name as string, item]));
  const qwenByName = new Map(qwen.filter((item) => typeof item.technical_name === "string").map((item) => [item.technical_name as string, item]));
  return identities.map((identity) => {
    const name = typeof identity.technical_name === "string" ? identity.technical_name : "";
    const clapRecord = clapByName.get(name);
    const qwenRecord = qwenByName.get(name);
    const choices = [
      clapRecord && { record: clapRecord, source: "audio_similarity", label: "CLAP same-window value", artifactId: sourceArtifactIds.clap },
      qwenRecord && { record: qwenRecord, source: "text_anchor", label: "Qwen value anchor", artifactId: sourceArtifactIds.qwen },
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const winner = choices.find((item) => valueOf(item.record) !== undefined);
    const fallback = valueOf(identity) ?? 0;
    return {
      ...identity,
      current_value: winner ? valueOf(winner.record) : fallback,
      suggested_value: winner ? valueOf(winner.record) : fallback,
      source: winner?.source ?? "default",
      detail: winner?.label ?? "Gemma identity · catalogue default fallback",
      valueProvenance: {
        sourceArtifactId: winner?.artifactId ?? sourceArtifactIds.identity ?? null,
        sourceTechnicalName: name,
        sourceAction: winner?.source === "audio_similarity" ? "audio.clap.resolved" : winner?.source === "text_anchor" ? "text.qwen.resolved" : "audio.gemma.awtd",
      },
    };
  });
}

function segmentById(bank: BankInput, id: string): Segment | undefined {
  return segments(bank?.data)?.find((item) => item.id === id);
}

/** Resolve Audio Gemma identities deterministically with window-scoped CLAP > Qwen > identity default. */
export function resolveAudioGemmaValues(identity: BankInput, clap?: BankInput, qwen?: BankInput): { data: unknown; count: number } {
  const identitySegments = segments(identity?.data);
  const clapSegments = segments(clap?.data);
  const qwenSegments = segments(qwen?.data);
  const refs = { identity: identity?.artifactId, clap: clap?.artifactId, qwen: qwen?.artifactId };
  if (identitySegments) {
    const output = identitySegments.map((segment) => {
      const clapSegment = segmentById(clap, segment.id);
      const qwenSegment = segmentById(qwen, segment.id);
      return {
        ...segment,
        parameters: resolveRecords(segment.parameters, clapSegment?.parameters ?? (clapSegments ? [] : records(clap?.data)), qwenSegment?.parameters ?? (qwenSegments ? [] : records(qwen?.data)), refs),
      };
    });
    return { data: { schema: "am_stage_segment_bank_v1", segments: output }, count: output.reduce((sum, item) => sum + item.parameters.length, 0) };
  }
  return { data: resolveRecords(records(identity?.data), clapSegments ? [] : records(clap?.data), qwenSegments ? [] : records(qwen?.data), refs), count: records(identity?.data).length };
}
