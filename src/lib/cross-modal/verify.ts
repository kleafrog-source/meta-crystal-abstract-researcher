import { loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";
import { getActiveProvider } from "@/lib/llm/factory";
import { readV3ParameterUnion } from "@/lib/meta-crystal-v3-lab";
import { searchV3 } from "@/lib/rag-v3/search";
import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";
import { generateReverseQuery } from "./reverse-query";

import { CYCLE_CONFIG, cycleMetrics, cycleStatus } from "./cycle";
import { getJournalRecord, saveJournalVerification } from "./journal";
import type { ConsensusParameter, JournalReverseQuery, JournalVerification } from "./types";

function compactReplay(results: Awaited<ReturnType<typeof searchV3>>["results"]): ConsensusParameter[] {
  const scores = results.map((item) => item.similarity).filter(Number.isFinite); const minimum = scores.length ? Math.min(...scores) : 0; const maximum = scores.length ? Math.max(...scores) : 0;
  return results.map((item, index) => ({ technical_name: item.technical_name, rank: index + 1, retrieval_score: item.similarity, normalized_score: maximum > minimum ? Number(((item.similarity - minimum) / (maximum - minimum)).toFixed(8)) : 1 - index / Math.max(1, results.length), default_value: typeof item.default === "number" ? item.default : String(item.default), selected_value: item.current_value, ui_element: item.ui_element, min_value: item.min_value, max_value: item.max_value, value_source: item.source, retrieval_scope: item.retrieval_scope }));
}

export async function verifyJournalCycle(recordId: string, signal?: AbortSignal): Promise<JournalVerification> {
  const record = await getJournalRecord(recordId); if (!record) throw new Error("Journal record was not found");
  const [{ provider, settings }, { records }, embedding, identity] = await Promise.all([getActiveProvider(), readV3ParameterUnion(), loadEmbeddingRuntimeSettings(), getV3SnapshotIdentity()]);
  const context = record.snapshot.parameters.slice(0, 12).map((item) => {
    const metadata = records.get(item.technical_name);
    return { rank: item.rank, selected_value: item.selected_value, name_ru: metadata?.name_ru ?? "", acoustic_description_en: metadata?.description_en ?? "", acoustic_description_ru: metadata?.description_ru ?? "" };
  });
  let raw = ""; let reverse: JournalReverseQuery | null = null;
  try {
    const response = await generateReverseQuery({ provider, settings }, { source_modality: record.snapshot.modality, primary_original_request: record.query, ranked_acoustic_evidence: context }, signal);
    raw = response.raw_response; reverse = response.reverse_query;
    if (signal?.aborted) throw new DOMException("Cycle verification cancelled", "AbortError");
    const replayQuery = record.query && /[А-Яа-яЁё]/u.test(record.query) ? reverse.query_ru : reverse.query_en;
    const replayResponse = await searchV3({ query: replayQuery, topK: record.snapshot.parameters.length, currentValues: {}, instructionContext: [], sources: { library: true, frozen: true, atoms: true, generated: true }, scopes: { sound: true, structure: true, metadata: false, provenance: false, administrative: false } });
    if (signal?.aborted) throw new DOMException("Cycle verification cancelled", "AbortError");
    const replayParameters = compactReplay(replayResponse.results); const metrics = cycleMetrics(record.snapshot.parameters, replayParameters); const status = cycleStatus(metrics.verification_score);
    return saveJournalVerification({ schema_version: 1, source_record_id: record.id, status, reverse_query: reverse, raw_response: raw, error: null, replay_query: replayQuery, replay_parameters: replayParameters, metrics, chat: { provider: response.provider, model: response.model }, replay: { dataset_version: identity.dataset_version, dataset_sha256: identity.content_sha256, embedding_model: embedding.model, top_k: replayParameters.length }, config: CYCLE_CONFIG });
  } catch (error) {
    const cancelled = signal?.aborted || (error instanceof Error && error.name === "AbortError");
    return saveJournalVerification({ schema_version: 1, source_record_id: record.id, status: cancelled ? "cancelled" : "error", reverse_query: reverse, raw_response: raw, error: error instanceof Error ? error.message : String(error), replay_query: null, replay_parameters: [], metrics: null, chat: { provider: settings.provider, model: settings.chatModel }, replay: null, config: CYCLE_CONFIG });
  }
}
