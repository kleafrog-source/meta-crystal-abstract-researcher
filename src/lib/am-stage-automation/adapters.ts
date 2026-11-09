import { createHash, randomUUID } from "node:crypto";
import { readAudioAsset } from "./storage";
import type { AutomationActionId, AutomationAdapterContext, AutomationAdapterResult, AutomationAudioRange, AutomationStageDefinition } from "./contracts";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { POST as audioSegmentPost } from "@/app/api/audio-to-parameter/segment/route";
import { POST as gemmaAudioPost } from "@/app/api/rag-v3/gemma-audio-search/route";
import { POST as stage2Post } from "@/app/api/rag-v3/stage2-retrieval/route";
import { POST as proposeParametersPost } from "@/app/api/rag-v3/propose-parameters/route";
import { POST as resolveValuesPost } from "@/app/api/am-stage/resolve-values/route";
import { POST as acousticFeaturesPost } from "@/app/api/am-stage/acoustic-features/route";
import { POST as sideMetadataPost } from "@/app/api/am-stage/side-metadata/route";
import { POST as lfm3AudioPost } from "@/app/api/am-stage/lfm3-audio/route";
import { POST as vocalAllocationPost } from "@/app/api/vocal-allocation/search/route";
import { POST as textRankPost } from "@/app/api/am-stage/param-to-text/rank/route";
import { POST as textDescribePost } from "@/app/api/am-stage/param-to-text/describe/route";
import { POST as textReversePost } from "@/app/api/am-stage/param-to-text/reverse-query/route";
import { buildParamToTextSnapshot } from "@/lib/param-to-text";
import { smoothAutomationFrames } from "./client-stage2";
import { planUniformWindows, selectOrderedEvents, AUTOMATION_POLICY, parseBriefTemplateVariables, resolveBriefTemplate } from "./policies";
import { readSegmentWindows } from "./segment-plan";
import { buildSelectedSegmentBriefInputs, buildSelectedSegmentBriefPrompt } from "./combine-segment-texts";
import { loadProviderForModelListing } from "@/lib/llm/factory";
import { NodeRequestError, providerFailure, withNodeRetries } from "./node-retry";
import { executeSegmentTextNodes } from "./segment-text-execution";
import { buildInterstitialGapSamples } from "./interstitial-gaps";
import { REVERSE_QUERY_PROMPT_VERSION } from "@/lib/cross-modal/reverse-query";

type StageExecution = AutomationStageDefinition;
const parametersOf = (value: unknown): ActiveParameter[] => {
  if (Array.isArray(value)) return value as ActiveParameter[];
  if (value && typeof value === "object" && Array.isArray((value as { results?: unknown }).results)) return (value as { results: ActiveParameter[] }).results;
  if (value && typeof value === "object" && Array.isArray((value as { segments?: unknown }).segments)) {
    return (value as { segments: Array<{ parameters?: unknown }> }).segments.flatMap((segment) => Array.isArray(segment.parameters) ? segment.parameters as ActiveParameter[] : []);
  }
  return [];
};
const getRange = (context: AutomationAdapterContext): AutomationAudioRange | undefined => context.inputs.audioRange;
const inputArtifact = (context: AutomationAdapterContext, name: string) => context.resolvedInputs[name] as { data?: unknown } | undefined;
async function jsonRoute<T>(handler: (request: Request) => Promise<Response>, url: string, payload: unknown, signal: AbortSignal): Promise<T> {
  const response = await handler(new Request(`http://automation.local${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal }));
  const value = await response.json().catch(() => ({})) as T & { error?: string; error_category?: string; upstreamStatus?: number; retry_after_ms?: number; raw_response?: string; provider?: string; requestedModel?: string; request_diagnostics?: Record<string, unknown> };
  if (!response.ok) {
    const message = value.error || `${url} failed with HTTP ${response.status}.`;
    const embeddedStatus = /(?:HTTP|status)\s+(\d{3})/iu.exec(message)?.[1];
    const status = value.upstreamStatus ?? (embeddedStatus ? Number(embeddedStatus) : response.status);
    const retryAfter = response.headers.get("retry-after");
    const retryAfterDate = retryAfter && !/^\d+(?:\.\d+)?$/u.test(retryAfter) ? Date.parse(retryAfter) : Number.NaN;
    const headerRetryMs = retryAfter ? (/^\d+(?:\.\d+)?$/u.test(retryAfter) ? Number(retryAfter) * 1000 : Number.isFinite(retryAfterDate) ? Math.max(0, retryAfterDate - Date.now()) : undefined) : undefined;
    const category = value.error_category === "format" ? "format" : value.error_category === "invalid" ? "invalid" : /JSON|parse|usable (?:EN|RU)|missing .*description|three key concepts/iu.test(message) ? "format" : status === 499 ? "network" : response.status >= 500 || status === 408 || status === 425 || status === 429 || status >= 500 ? "http" : "invalid";
    const responseDiagnostics = { ...(value.request_diagnostics ? { modelRequest: value.request_diagnostics } : {}), ...(value.provider ? { provider: value.provider } : {}), ...(value.requestedModel ? { requestedModel: value.requestedModel } : {}), ...(typeof value.raw_response === "string" ? { rawResponse: value.raw_response, rawResponseSha256: createHash("sha256").update(value.raw_response).digest("hex"), rawResponseBytes: Buffer.byteLength(value.raw_response, "utf8") } : {}) };
    throw new NodeRequestError(message, status, value.retry_after_ms ?? headerRetryMs, category, Object.keys(responseDiagnostics).length ? responseDiagnostics : undefined);
  }
  return value;
}
async function formRoute<T>(handler: (request: Request) => Promise<Response>, url: string, form: FormData, signal: AbortSignal): Promise<T> {
  const response = await handler(new Request(`http://automation.local${url}`, { method: "POST", body: form, signal }));
  const value = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || `${url} failed with HTTP ${response.status}.`);
  return value;
}

export async function executeAutomationAction(stage: StageExecution, context: AutomationAdapterContext): Promise<AutomationAdapterResult> {
  const action = stage.actionId;
  const briefInput = context.resolvedInputs.brief as { data?: unknown } | undefined;
  const priorData = briefInput?.data;
  const nestedQuery = priorData && typeof priorData === "object" ? (priorData as { reverse_query?: { query_en?: unknown }; text?: unknown; query_en?: unknown }) : undefined;
  const derivedBrief = typeof nestedQuery?.text === "string" ? nestedQuery.text
    : typeof nestedQuery?.query_en === "string" ? nestedQuery.query_en
      : typeof nestedQuery?.reverse_query?.query_en === "string" ? nestedQuery.reverse_query.query_en : "";
  const brief = context.inputs.brief?.trim() || derivedBrief;
  const topK = Math.max(1, Math.min(100, Number(context.settings.topK ?? context.inputs.workspaceSnapshot?.topK ?? 50)));
  const range = getRange(context);
  const segmentPlanArtifact = inputArtifact(context, "segmentPlan");
  const segmentPlan = segmentPlanArtifact ? readSegmentWindows(segmentPlanArtifact.data) : undefined;
  const asset = context.inputs.assetId ? await readAudioAsset(context.inputs.assetId) : null;

  if (action === "audio.segment") {
    if (!range) throw new Error("Choose a bounded audio range before creating windows.");
    const requested = stage.settings.effective;
    const max = Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(Number(requested.maximumCount ?? AUTOMATION_POLICY.defaultSegmentMaximum))));
    const countMode = requested.countMode === "exact" ? "exact" : requested.countMode === "automatic" ? "automatic" : "at_most";
    const requestedCount = Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(Number(requested.requestedCount ?? max))));
    const interval = Math.max(0.1, Number(requested.intervalSeconds ?? AUTOMATION_POLICY.defaultSegmentIntervalSeconds));
    const desiredCount = countMode === "exact" ? requestedCount : Math.min(max, Math.max(1, Math.ceil(range.durationSeconds / interval)));
    let plan: Omit<ReturnType<typeof planUniformWindows>, "boundaryMode"> & { boundaryMode: "uniform" | "beat" | "transient"; sourceEventCount?: number; selectedEventCount?: number } = planUniformWindows(range.startSeconds, range.endSeconds, { mode: countMode, requestedCount, maximumCount: max, intervalSeconds: interval });
    let fallbackReason: string | null = null; let sourceEvents: number[] = [];
    const boundaryMode = requested.boundaryMode === "beat" || requested.boundaryMode === "transient" ? requested.boundaryMode : "uniform";
    if (boundaryMode !== "uniform") {
      if (!asset) throw new Error("Beat/onset alignment needs a saved audio asset.");
      const featureEvents: number[] = [];
      const chunkSize = 30;
      for (let offset = range.startSeconds; offset < range.endSeconds; offset += chunkSize) {
        if (context.signal.aborted) throw new DOMException("Automation stopped", "AbortError");
        const chunkDuration = Math.min(chunkSize, range.endSeconds - offset);
        if (chunkDuration < 0.25) continue;
        await context.onProgress({ phase: "rhythm_analysis", current: Math.floor((offset - range.startSeconds) / chunkSize) + 1, total: Math.ceil(range.durationSeconds / chunkSize), boundaryMode });
        const form = new FormData(); form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" })); form.set("offset", String(offset)); form.set("duration", String(chunkDuration));
        const result = await formRoute<{ side_meta?: { acoustic_features?: { beat_times_seconds?: number[]; onset_times_seconds?: number[] } } }>(acousticFeaturesPost, "/api/am-stage/acoustic-features", form, context.signal);
        const meta = result.side_meta?.acoustic_features;
        const local = boundaryMode === "beat" ? meta?.beat_times_seconds : meta?.onset_times_seconds;
        for (const event of local ?? []) featureEvents.push(offset + event);
      }
      sourceEvents = [...new Set(featureEvents.filter((event) => event > range.startSeconds && event < range.endSeconds).map((event) => Math.round(event * 1000) / 1000))].sort((a, b) => a - b);
      const chosen = selectOrderedEvents(sourceEvents, range.startSeconds, range.endSeconds, desiredCount);
      const exact = countMode === "exact";
      if (chosen.selected.length < Math.max(0, desiredCount - 1) && exact) fallbackReason = `Only ${sourceEvents.length} usable ${boundaryMode} events were found for ${desiredCount - 1} boundaries; uniform full-coverage fallback was used.`;
      else if (chosen.selected.length === 0) fallbackReason = `No usable ${boundaryMode} events were found; uniform full-coverage fallback was used.`;
      else {
        const boundaries = [range.startSeconds, ...chosen.selected, range.endSeconds];
        const windows = boundaries.slice(1).map((endSeconds, index) => ({ id: `segment-${index + 1}`, startSeconds: boundaries[index], endSeconds, durationSeconds: endSeconds - boundaries[index], startSource: index === 0 ? "range-boundary" : boundaryMode, endSource: index === boundaries.length - 2 ? "range-boundary" : boundaryMode }));
        plan = { ...plan, windows, effectiveCount: windows.length, boundaryMode, sourceEventCount: sourceEvents.length, selectedEventCount: chosen.selected.length, coverageMode: "full-range-no-overlap" };
      }
    }
    if (requested.requireBeatAlignment === true && fallbackReason) {
      throw new Error(`Beat-aligned segmentation could not be completed: ${fallbackReason}`);
    }
    const windows = fallbackReason ? plan.windows : plan.windows;
    if (!windows.length || windows.some((window) => window.durationSeconds < 0.1)) throw new Error("Segment plan contains an empty or too-short interval.");
    const data = { schemaVersion: 1, id: randomUUID(), assetId: range.assetId, audioRange: range, ...plan, boundaryMode, countMode, requestedCount, maximumCount: max, fallbackPolicy: "uniform_full_coverage_for_exact_or_empty_events", fallbackApplied: Boolean(fallbackReason), fallbackReason, sourceEventCount: boundaryMode === "uniform" ? null : sourceEvents.length, selectedEventCount: boundaryMode === "uniform" ? null : plan.windows.length - 1, constraints: { minimumWindowSeconds: 0.1 }, fingerprint: randomUUID() };
    return { artifacts: [{ kind: "segment-plan", validity: fallbackReason ? "partial" : "valid", warnings: fallbackReason ? [fallbackReason] : [], segmentRefs: windows, data }] };
  }

  if (["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved"].includes(action)) {
    if (!brief) throw new Error("This stage needs a Brief.");
    const index = action === "text.gemma.awtd" || action === "text.gemma.resolved" ? "embeddinggemma2" : "qwen3";
    const snapshot = context.inputs.workspaceSnapshot;
    const sources = snapshot?.sources ?? { library: true, frozen: false, atoms: true, generated: true };
    const search = async (query: string) => {
      if (snapshot?.vocalMatrixMode) return jsonRoute<{ results?: ActiveParameter[] }>(vocalAllocationPost, "/api/vocal-allocation/search", { query, top_k: topK, domain_layers: snapshot.domainLayers }, context.signal);
      return jsonRoute<{ results?: ActiveParameter[] }>(proposeParametersPost, "/api/rag-v3/propose-parameters", { query, top_k: topK, current_values: {}, instruction_context: snapshot?.instructionContext ?? [], sources, scopes: snapshot?.scopes, domain_layers: snapshot?.domainLayers, text_index: index }, context.signal);
    };
    const result = action === "text.gemma.resolved" ? null : await search(brief);
    let values: unknown = action === "text.gemma.resolved" ? inputArtifact(context, "identityBank")?.data : result?.results ?? [];
    if (action === "text.gemma.resolved" && !parametersOf(values).length) throw new Error("Gemma Resolved needs the explicit AWTD identity-bank artifact from an earlier stage.");
    if (action === "text.gemma.resolved") {
      const identities = parametersOf(values);
      const resolved = await jsonRoute<{ results?: ActiveParameter[] }>(resolveValuesPost, "/api/am-stage/resolve-values", { query: brief, parameters: identities }, context.signal);
      values = resolved.results ?? [];
    }
    const artifacts = [{ kind: "parameter-bank", bankId: action.includes("gemma") ? "gemma-text" : "qwen-text", modality: "text", pass: action.endsWith("resolved") ? "resolved" : "awtd", modelBinding: { textIndex: index }, data: values }];
    if (snapshot?.searchMode === "transition") {
      const secondQuery = String(snapshot.queryB ?? "").trim();
      if (!secondQuery) throw new Error("Transition mode needs Query B. Both independent states are required; no Single query fallback was run.");
      const second = action === "text.gemma.resolved" ? null : await search(secondQuery);
      let secondary: ActiveParameter[] = action === "text.gemma.resolved"
        ? parametersOf(inputArtifact(context, "identityBankB")?.data)
        : second?.results ?? [];
      if (action === "text.gemma.resolved") {
        if (!secondary.length) throw new Error("Gemma Transition Resolved needs the explicit Query B AWTD artifact.");
        const resolved = await jsonRoute<{ results?: ActiveParameter[] }>(resolveValuesPost, "/api/am-stage/resolve-values", { query: secondQuery, parameters: secondary }, context.signal);
        secondary = resolved.results ?? [];
      }
      const ratio = Math.max(0, Math.min(100, Number(snapshot.transitionRatio ?? 50))) / 100;
      const primaryMap = new Map(parametersOf(values).map((item) => [item.technical_name, item]));
      const secondaryMap = new Map(secondary.map((item) => [item.technical_name, item]));
      const names = [...new Set([...primaryMap.keys(), ...secondaryMap.keys()])];
      const blended = names.map((name) => {
        const a = primaryMap.get(name); const b = secondaryMap.get(name); const chosen = ratio < 0.5 ? a ?? b : b ?? a;
        if (!chosen) return null;
        if (!a || !b) return { ...chosen, detail: `${chosen.detail} | ${a ? "Query A only" : "Query B only"}`, similarity: chosen.similarity * (a ? 1 - ratio : ratio) };
        const aNum = Number(a.suggested_value); const bNum = Number(b.suggested_value);
        const numeric = Number.isFinite(aNum) && Number.isFinite(bNum) && a.ui_element !== "Toggle";
        const value = numeric ? Math.max(typeof a.min_value === "number" ? a.min_value : -Infinity, Math.min(typeof a.max_value === "number" ? a.max_value : Infinity, aNum + (bNum - aNum) * ratio)) : ratio < 0.5 ? a.suggested_value : b.suggested_value;
        return { ...chosen, suggested_value: value, current_value: value, before: a.current_value, similarity: a.similarity * (1 - ratio) + b.similarity * ratio, detail: `Transition ${Math.round(ratio * 100)}% from Query A to Query B` };
      }).filter((item): item is ActiveParameter => item !== null).sort((a, b) => b.similarity - a.similarity).slice(0, topK);
      return { artifacts: [
        { ...artifacts[0], bankId: `${artifacts[0].bankId}-transition`, pass: "transition", data: blended },
        { ...artifacts[0], bankId: `${artifacts[0].bankId}-query-a`, pass: "query-a", data: values },
        { ...artifacts[0], bankId: `${artifacts[0].bankId}-query-b`, pass: "query-b", data: secondary },
      ] };
    }
    return { artifacts };
  }

  if (["audio.clap.resolved", "spec.siglip.resolved"].includes(action)) {
    if (!asset || !range) throw new Error("This stage needs the saved session audio and a bounded range.");
    const nodes = segmentPlan?.length ? segmentPlan : [{ id: "segment-1", startSeconds: range.startSeconds, endSeconds: range.endSeconds }];
    const all: ActiveParameter[] = [];
    const perSegmentResults: Array<{ id: string; startSeconds: number; endSeconds: number; parameters: ActiveParameter[]; warnings?: string[] }> = [];
    const segmentErrors: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (context.signal.aborted) throw new DOMException("Automation stopped", "AbortError");
      const node = nodes[i];
      await context.onProgress({ current: i + 1, total: nodes.length, segmentId: node.id });
      const form = new FormData();
      form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" }));
      form.set("engine", action.startsWith("spec.") ? "siglip" : "clap");
      form.set("offset", String(node.startSeconds)); form.set("duration", String(Math.max(0.1, node.endSeconds - node.startSeconds)));
      form.set("top_k", String(topK)); form.set("spectrogram_detail", String(context.settings.spectrogramDetail ?? "medium"));
      try {
        const response = await audioSegmentPost(new Request("http://automation.local/api/audio-to-parameter/segment", { method: "POST", body: form, signal: context.signal }));
        const json = await response.json() as { parameters?: ActiveParameter[]; error?: string };
        if (!response.ok) throw new Error(json.error || `${action} failed with HTTP ${response.status}.`);
        const parameters = (json.parameters ?? []).map((parameter) => ({ ...parameter, automation_segment: node.id } as ActiveParameter));
        all.push(...parameters);
        if (context.settings.perSegmentResults === true) perSegmentResults.push({ id: node.id, startSeconds: node.startSeconds, endSeconds: node.endSeconds, parameters });
      } catch (error) {
        if (context.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        if (context.settings.perSegmentResults !== true) throw error;
        const message = error instanceof Error ? error.message : String(error);
        segmentErrors.push(`${node.id}: ${message}`);
        perSegmentResults.push({ id: node.id, startSeconds: node.startSeconds, endSeconds: node.endSeconds, parameters: [], warnings: [message] });
        await context.onProgress({ phase: "segment_failed", current: i + 1, total: nodes.length, segmentId: node.id, error: message });
      }
    }
    if (context.settings.perSegmentResults === true) {
      return { artifacts: [{ kind: "parameter-bank", bankId: action.startsWith("spec.") ? "siglip" : "clap", modality: action.startsWith("spec.") ? "spectrogram" : "audio", pass: "resolved", segmentRefs: nodes, validity: segmentErrors.length ? "partial" : "valid", warnings: segmentErrors, data: { schema: "am_stage_segment_bank_v1", segments: perSegmentResults } }] };
    }
    const merged = [...new Map(all.map((item) => [item.technical_name, item])).values()].sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    return { artifacts: [{ kind: "parameter-bank", bankId: action.startsWith("spec.") ? "siglip" : "clap", modality: action.startsWith("spec.") ? "spectrogram" : "audio", pass: "resolved", segmentRefs: nodes, data: merged }] };
  }

  if (action === "audio.gemma.awtd" || action === "audio.gemma.resolved") {
    if (!asset || !range) throw new Error("Gemma audio needs saved session audio and a bounded range.");
    let values: ActiveParameter[];
    let completed: Record<string, unknown> = {};
    if (action === "audio.gemma.resolved") {
      values = parametersOf(inputArtifact(context, "identityBank")?.data);
      if (!values.length) throw new Error("Gemma Audio Resolved needs the explicit AWTD identity-bank artifact from an earlier stage.");
    } else {
      const perSegment = context.settings.perSegmentResults === true;
      const nodes = perSegment && segmentPlan?.length ? segmentPlan : [{ id: "segment-1", startSeconds: range.startSeconds, endSeconds: range.endSeconds }];
      const segmentResults: Array<{ id: string; startSeconds: number; endSeconds: number; parameters: ActiveParameter[] }> = [];
      const failedSegments: Array<{ id: string; error: string }> = [];
      const combined: ActiveParameter[] = [];
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (context.signal.aborted) throw new DOMException("Automation stopped", "AbortError");
        await context.onProgress({ phase: "segment", current: index + 1, total: nodes.length, segmentId: node.id, source: "session_asset" });
        const form = new FormData();
        form.set("modality", "audio"); form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" }));
        form.set("top_k", String(topK)); form.set("chunk_seconds", "20"); form.set("range_start", String(node.startSeconds)); form.set("range_duration", String(node.endSeconds - node.startSeconds)); form.set("domain_layers", JSON.stringify(context.inputs.workspaceSnapshot?.domainLayers ?? []));
        try {
          const response = await gemmaAudioPost(new Request("http://automation.local/api/rag-v3/gemma-audio-search", { method: "POST", body: form, signal: context.signal }));
          if (!response.ok) { const detail = await response.json().catch(() => ({})) as { error?: string }; throw new Error(detail.error || `Gemma audio search failed with HTTP ${response.status}.`); }
          const events: Array<Record<string, unknown>> = [];
          if (!response.body) throw new Error("Gemma audio search returned an empty stream.");
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
          while (true) {
            if (context.signal.aborted) { await reader.cancel(); throw new DOMException("Automation stopped", "AbortError"); }
            const { done, value } = await reader.read(); pending += decoder.decode(value, { stream: !done });
            const lines = pending.split(/\r?\n/u); pending = lines.pop() ?? "";
            for (const line of lines.filter(Boolean)) { const event = JSON.parse(line) as Record<string, unknown>; events.push(event); if (event.type === "progress") await context.onProgress({ ...event, segmentId: node.id }); }
            if (done) break;
          }
          if (pending.trim()) events.push(JSON.parse(pending) as Record<string, unknown>);
          const result = [...events].reverse().find((item) => item.type === "complete");
          const failed = [...events].reverse().find((item) => item.type === "error");
          if (!result || !Array.isArray(result.results) || !result.results.length) throw new Error(String(failed?.error ?? "Gemma audio search returned no successful chunks."));
          completed = result;
          const parameters = (result.results as ActiveParameter[]).map((parameter) => ({ ...parameter, automation_segment: node.id } as ActiveParameter));
          combined.push(...parameters);
          segmentResults.push({ id: node.id, startSeconds: node.startSeconds, endSeconds: node.endSeconds, parameters });
        } catch (error) {
          if (context.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
          failedSegments.push({ id: node.id, error: error instanceof Error ? error.message : String(error) });
          await context.onProgress({ phase: "segment_failed", current: index + 1, total: nodes.length, segmentId: node.id, error: failedSegments.at(-1)?.error });
        }
      }
      if (!combined.length) throw new Error(failedSegments[0]?.error ?? "Gemma audio search returned no successful segment results.");
      values = perSegment ? combined : [...new Map(combined.map((item) => [item.technical_name, item])).values()].sort((a, b) => b.similarity - a.similarity).slice(0, topK);
      if (perSegment) {
        return { artifacts: [{ kind: "parameter-bank", bankId: "gemma-audio", modality: "audio", pass: "awtd", modelBinding: { model: completed.model, dimensions: completed.dimensions }, segmentRefs: nodes, validity: failedSegments.length ? "partial" : "valid", warnings: failedSegments.map((item) => `${item.id}: ${item.error}`), data: { schema: "am_stage_segment_bank_v1", segments: segmentResults } }] };
      }
    }
    if (action === "audio.gemma.resolved") {
      const resolved = await jsonRoute<{ results?: ActiveParameter[] }>(resolveValuesPost, "/api/am-stage/resolve-values", { query: brief, parameters: values }, context.signal);
      values = resolved.results ?? [];
    }
    return { artifacts: [{ kind: "parameter-bank", bankId: "gemma-audio", modality: "audio", pass: action.endsWith("resolved") ? "resolved" : "awtd", modelBinding: { model: completed.model, dimensions: completed.dimensions }, data: values, warnings: Array.isArray(completed.failed_chunks) && completed.failed_chunks.length ? [`${completed.failed_chunks.length} audio chunk(s) failed.`] : [] }] };
  }

  if (action === "stage2.server") {
    const stage1 = inputArtifact(context, "stage1")?.data ?? context.resolvedInputs.parameterBank;
    if (!Array.isArray(stage1) || !stage1.length) throw new Error("Server Stage-2 needs a completed Stage-1 parameter bank.");
    const payload = await jsonRoute<unknown>(stage2Post, "/api/rag-v3/stage2-retrieval", { stage1_hits: parametersOf(stage1).map((item) => ({ technical_name: item.technical_name, similarity: item.similarity })), source_query: brief, top_k: Number(context.settings.stage2TopK ?? 10), text_index: context.inputs.workspaceSnapshot?.textIndex ?? "qwen3" }, context.signal);
    return { artifacts: [{ kind: "parameter-bank", bankId: "server-stage2", modality: "text", pass: "stage2", data: payload }] };
  }

  if (action === "brief.from_template") {
    const template = String(context.inputs.workspaceSnapshot?.templateBrief ?? context.settings.templateBrief ?? "").trim();
    if (!template) throw new Error("Choose a Brief template or enter a Brief before running this scenario.");
    const variables = context.inputs.workspaceSnapshot?.templateVariables ?? parseBriefTemplateVariables(String(context.inputs.workspaceSnapshot?.templateVariablesText ?? ""));
    const resolved = resolveBriefTemplate(template, variables);
    if (resolved.unresolved.length) throw new Error(`Template variables need explicit values: ${resolved.unresolved.join(", ")}.`);
    return { artifacts: [{ kind: "brief", data: { text: resolved.text, source: "template", template, substitutions: variables } }] };
  }
  if (action === "brief.from_crystal") {
    const crystalId = String(context.inputs.crystalId ?? "");
    const text = context.inputs.brief?.trim();
    if (!crystalId || !text) throw new Error("Select an existing crystal in Brief preparation before starting this route.");
    return { artifacts: [{ kind: "brief", data: { text, source: "crystal", crystalId } }] };
  }
  if (action === "result.bundle") return { artifacts: [{ kind: "run-bundle", data: { created_at: new Date().toISOString(), note: "Summary artifact; stage artifacts are exported individually." } }] };
  if (action === "audio.describe.lfm3" || action === "audio.transcribe.lfm3") {
    if (!asset || !range) throw new Error("LFM3 needs the saved session audio and a bounded range.");
    if (range.durationSeconds > 30) throw new Error("LFM3 accepts at most 30 seconds per call. Reduce the selected range; this adapter does not silently truncate or claim a full-range result.");
    const form = new FormData(); form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" })); form.set("offset", String(range.startSeconds)); form.set("duration", String(range.durationSeconds)); form.set("mode", action.endsWith("transcribe.lfm3") ? "asr" : "describe"); form.set("runtime", "ollama");
    const result = await formRoute<{ text?: string; model?: string; runtime?: string }>(lfm3AudioPost, "/api/am-stage/lfm3-audio", form, context.signal);
    return { artifacts: [{ kind: action.endsWith("transcribe.lfm3") ? "transcription" : "description", modality: "audio", modelBinding: { model: result.model, runtime: result.runtime }, data: result }] };
  }
  if (action === "audio.describe_gaps.lfm3") {
    if (!asset) throw new Error("Center gap descriptions need the saved session audio asset.");
    if (!segmentPlan?.length) throw new Error("Center gap descriptions need the bound SegmentPlan.");
    const anchorsArtifact = inputArtifact(context, "anchors");
    const anchors = anchorsArtifact?.data as { schema?: unknown; actionId?: unknown; segments?: unknown } | undefined;
    if (anchors?.schema !== "am_stage_segment_text_v1" || anchors.actionId !== "text_features.describe_llm" || !Array.isArray(anchors.segments)) {
      throw new Error("Center gap descriptions need a bound per-node Describe features artifact.");
    }
    const requestedClipSeconds = Number(stage.settings.effective.gapClipSeconds ?? 8);
    const samples = buildInterstitialGapSamples(segmentPlan, anchors.segments as Array<{ id: string; status: string; result?: unknown }>, requestedClipSeconds);
    const selected = samples.map((sample) => ({
      id: sample.target.id,
      startSeconds: sample.target.startSeconds,
      endSeconds: sample.target.endSeconds,
      ...sample,
    }));
    const result = await executeSegmentTextNodes({
      actionId: action,
      segments: selected,
      sampleLimit: selected.length || 1,
      priorCheckpoints: context.priorNodeCheckpoints,
      inputArtifactId: (anchorsArtifact as { artifactId?: string } | undefined)?.artifactId ?? null,
      promptRouteVersion: "interstitial-gap-center-context-v1",
      payloadFor: (sample) => ({
        target: sample.target,
        sentAudio: sample.sentAudio,
        context: sample.context,
        sourceAssetId: context.inputs.assetId,
      }),
      request: async (_sample, payloadValue, signal) => {
        const payload = payloadValue as typeof selected[number] & { target: typeof selected[number]["target"]; sentAudio: typeof selected[number]["sentAudio"]; context: typeof selected[number]["context"] };
        const form = new FormData();
        form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" }));
        form.set("offset", String(payload.sentAudio.startSeconds));
        form.set("duration", String(payload.sentAudio.durationSeconds));
        form.set("mode", "describe");
        form.set("runtime", "ollama");
        form.set("context_left", `${payload.context.left.language.toUpperCase()} · ${payload.context.left.text}`);
        form.set("context_right", `${payload.context.right.language.toUpperCase()} · ${payload.context.right.text}`);
        return formRoute<{ text: string; model?: string; runtime?: string; duration_seconds?: number }>(lfm3AudioPost, "/api/am-stage/lfm3-audio", form, signal);
      },
      signal: context.signal,
      persist: context.persistNodeCheckpoint,
      progress: context.onProgress,
    });
    const byId = new Map(result.results.filter((row) => row.status === "succeeded").map((row) => [row.id, row]));
    const anchorRows = new Map((anchors.segments as Array<{ id: string; status: string }>).map((row) => [row.id, row]));
    const segments = segmentPlan.map((window) => {
      const sample = samples.find((item) => item.target.id === window.id);
      const described = byId.get(window.id);
      if (sample && described?.status === "succeeded") return {
        id: window.id, startSeconds: window.startSeconds, endSeconds: window.endSeconds,
        status: "gap_described", targetRange: sample.target, sentAudioRange: sample.sentAudio,
        leftAnchor: sample.context.left, rightAnchor: sample.context.right, result: described.result,
      };
      if (anchorRows.get(window.id)?.status === "succeeded") return { id: window.id, startSeconds: window.startSeconds, endSeconds: window.endSeconds, status: "anchor_already_described" };
      return { id: window.id, startSeconds: window.startSeconds, endSeconds: window.endSeconds, status: "not_bracketed_by_successful_anchors" };
    });
    return { artifacts: [{ kind: "gap-descriptions", modality: "audio", segmentRefs: segmentPlan, effectiveSettings: { requestedClipSeconds, maximumClipSeconds: 30, selectionRule: "undescribed nodes strictly between consecutive successful Describe features anchors", anchorArtifactId: (anchorsArtifact as { artifactId?: string } | undefined)?.artifactId ?? null, gapNodes: samples.map((sample) => ({ target: sample.target, sentAudio: sample.sentAudio, leftAnchorId: sample.context.left.id, rightAnchorId: sample.context.right.id })), describedCount: [...byId.values()].length, notBracketedCount: segments.filter((item) => item.status === "not_bracketed_by_successful_anchors").length }, validity: samples.length && byId.size === samples.length ? "valid" : "partial", warnings: samples.length ? [] : ["No undescribed interior nodes were bracketed by two successful text-description anchors; no audio requests were sent."], data: { schema: "am_stage_interstitial_gap_descriptions_v1", actionId: action, promptVersion: "interstitial-gap-center-context-v1", semantics: "The LFM3 audio evidence covers sentAudioRange only; targetRange is the wider node to which the contextual description is attached.", requestedClipSeconds, segments } }] };
  }
  if (action === "audio.extract_acoustics" || action === "audio.analyze") {
    if (!asset || !range) throw new Error("Librosa analysis needs saved session audio and a bounded range.");
    const windows = segmentPlan?.length ? segmentPlan : [{ id: "segment-1", startSeconds: range.startSeconds, endSeconds: range.endSeconds }];
    const results: Array<{ id: string; startSeconds: number; endSeconds: number; acousticFeatures: unknown }> = [];
    for (let i = 0; i < windows.length; i++) {
      if (context.signal.aborted) throw new DOMException("Automation stopped", "AbortError");
      const segment = windows[i]; await context.onProgress({ current: i + 1, total: windows.length, segmentId: segment.id });
      const segmentDuration = segment.endSeconds - segment.startSeconds;
      if (segmentDuration > 30) throw new Error(`Librosa accepts at most 30 seconds per analysis window; ${segment.id} is ${segmentDuration.toFixed(2)} seconds. The window was not truncated.`);
      const form = new FormData(); form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" })); form.set("offset", String(segment.startSeconds)); form.set("duration", String(segmentDuration));
      const features = await formRoute<{ side_meta?: unknown }>(acousticFeaturesPost, "/api/am-stage/acoustic-features", form, context.signal);
      results.push({ ...segment, acousticFeatures: features.side_meta });
    }
    return { artifacts: [{ kind: "acoustic-analysis", modality: "audio", segmentRefs: windows, data: results }] };
  }
  if (action === "audio.detect_indic_language" || action === "audio.assess_vocal_timbre" || action === "audio.analyze_helm") {
    if (!asset || !range) throw new Error("Audio side-metadata needs saved session audio and a bounded range.");
    const specialist = action === "audio.detect_indic_language" ? "language" : action === "audio.assess_vocal_timbre" ? "gender" : "helm";
    const maxDuration = specialist === "helm" ? 10 : 30;
    if (range.durationSeconds > maxDuration) throw new Error(`${specialist} accepts at most ${maxDuration} seconds per call. Choose a shorter range; no partial-range result is reported as full-range.`);
    const form = new FormData(); form.set("specialist", specialist); form.set("audio", new File([asset.bytes], asset.asset.originalFilename || "audio.bin", { type: asset.asset.mimeType || "application/octet-stream" })); form.set("offset", String(range.startSeconds)); form.set("duration", String(range.durationSeconds)); if (context.settings.helmHasVocals === true) form.set("helm_has_vocals", "true");
    const result = await formRoute<Record<string, unknown>>(sideMetadataPost, "/api/am-stage/side-metadata", form, context.signal);
    return { artifacts: [{ kind: specialist === "language" ? "language-analysis" : specialist === "gender" ? "voice-analysis" : "helm-analysis", modality: "audio", data: result }] };
  }
  if (action === "vocal_allocation.search") {
    if (!brief) throw new Error("Vocal Allocation needs a Brief with an explicit vocal target.");
    const result = await jsonRoute<unknown>(vocalAllocationPost, "/api/vocal-allocation/search", { query: brief, top_k: topK, domain_layers: context.inputs.workspaceSnapshot?.domainLayers }, context.signal);
    return { artifacts: [{ kind: "vocal-allocation", modality: "text", data: result }] };
  }
  if (action === "text_features.build") {
    if (context.settings.perSegmentResults === true) {
      if (!segmentPlan?.length) throw new Error("Per-segment text features need the bound SegmentPlan with every audio window.");
      const bankArtifacts = Object.entries(context.resolvedInputs).flatMap(([name, value]) => {
        if (!name.startsWith("parameterBank") || !value || typeof value !== "object") return [];
        const artifact = value as { actionId?: string; bankId?: string; data?: unknown };
        if (!artifact.actionId || !artifact.data) return [];
        const modality = artifact.actionId === "audio.clap.resolved" ? "clap"
          : artifact.actionId === "spec.siglip.resolved" ? "siglip"
            : artifact.actionId === "audio.gemma.awtd" ? "gemma_audio_awtd"
              : artifact.actionId === "audio.gemma.resolved" ? "gemma_audio_resolved" : null;
        return modality ? [{ modality, data: artifact.data, bankId: artifact.bankId ?? modality }] : [];
      });
      if (!bankArtifacts.length) throw new Error("Per-segment text features need at least one bound Gemma, CLAP or SigLIP result bank.");
      const segments = segmentPlan.map((window) => {
        const point = { time: window.startSeconds, offset: window.startSeconds, duration: window.endSeconds - window.startSeconds, clap: [] as ActiveParameter[], siglip: [] as ActiveParameter[], gemmaAudioAwtd: [] as ActiveParameter[], gemmaAudioResolved: [] as ActiveParameter[] };
        for (const bank of bankArtifacts) {
          const data = bank.data as { segments?: Array<{ id?: string; parameters?: unknown }> };
          const node = Array.isArray(data?.segments) ? data.segments.find((item) => item.id === window.id) : null;
          const parameters = node && Array.isArray(node.parameters)
            ? node.parameters as ActiveParameter[]
            : Array.isArray(bank.data) ? (bank.data as ActiveParameter[]).filter((item) => (item as ActiveParameter & { automation_segment?: string }).automation_segment === window.id) : [];
          const key = bank.modality === "clap" ? "clap" : bank.modality === "siglip" ? "siglip" : bank.modality === "gemma_audio_awtd" ? "gemmaAudioAwtd" : "gemmaAudioResolved";
          if (!parameters.length) throw new Error(`${bank.modality} has no parameter results for ${window.id}; refusing to build an incomplete fragment snapshot.`);
          point[key].push(...parameters);
        }
        const modalities = [
          ...(point.clap.length ? ["clap" as const] : []),
          ...(point.siglip.length ? ["siglip" as const] : []),
          ...(point.gemmaAudioAwtd.length ? ["gemma_audio_awtd" as const] : []),
          ...(point.gemmaAudioResolved.length ? ["gemma_audio_resolved" as const] : []),
        ];
        if (!modalities.length) throw new Error(`No bank results were preserved for ${window.id}; refusing to omit this fragment from text evidence.`);
        const snapshot = buildParamToTextSnapshot([point], {
          audioName: context.inputs.audioName ?? "Automation audio",
          audioDurationSeconds: context.inputs.audioDurationSeconds ?? range?.endSeconds ?? window.endSeconds,
          limit: topK,
          modalities,
          analysisRangeStartSeconds: range?.startSeconds ?? 0,
          analysisRangeDurationSeconds: range?.durationSeconds ?? (context.inputs.audioDurationSeconds ?? window.endSeconds),
        });
        if (!snapshot.parameters.length) throw new Error(`No text features were produced for ${window.id}; refusing to omit this fragment.`);
        return { id: window.id, startSeconds: window.startSeconds, endSeconds: window.endSeconds, snapshot };
      });
      await context.onProgress({ phase: "segment_features", current: segments.length, total: segments.length, segmentIds: segments.map((item) => item.id) });
      return { artifacts: [{ kind: "text-feature-snapshot", segmentRefs: segmentPlan, data: { schema: "am_stage_segment_features_v1", segments } }] };
    }
    const banks = [context.inputs.workspaceSnapshot?.parameters, inputArtifact(context, "parameterBank")?.data, ...Object.values(context.resolvedInputs).map((value) => (value as { data?: unknown })?.data)].flatMap(parametersOf);
    const unique = [...new Map(banks.map((item) => [item.technical_name, item])).values()].slice(0, 100);
    if (!unique.length) throw new Error("Select completed parameter-bank artifacts before building text features.");
    const rows = [{ time: range?.startSeconds ?? 0, offset: range?.startSeconds ?? 0, duration: range?.durationSeconds ?? (context.inputs.audioDurationSeconds ?? 1), clap: unique, siglip: [], gemmaAudioAwtd: [], gemmaAudioResolved: [] }];
    const snapshot = buildParamToTextSnapshot(rows, { audioName: context.inputs.audioName ?? "Automation result", audioDurationSeconds: context.inputs.audioDurationSeconds ?? 1, limit: topK, modalities: ["clap"] });
    return { artifacts: [{ kind: "text-feature-snapshot", data: snapshot }] };
  }
  if (["text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query"].includes(action)) {
    const snapshot = inputArtifact(context, "snapshot")?.data ?? Object.values(context.resolvedInputs).map((value) => (value as { data?: unknown })?.data).find((item) => item && typeof item === "object" && (item as { schema?: string }).schema === "param_to_text_snapshot_v1");
    if (!snapshot) throw new Error("This stage needs a text-feature snapshot from an earlier stage.");
    const handler = action.endsWith("compare_rankings") ? textRankPost : action.endsWith("describe_llm") ? textDescribePost : textReversePost;
    if (snapshot && typeof snapshot === "object" && (snapshot as { schema?: unknown }).schema === "am_stage_segment_features_v1" && Array.isArray((snapshot as { segments?: unknown }).segments)) {
      const sourceSegments = (snapshot as { segments: Array<{ id: string; startSeconds: number; endSeconds: number; snapshot: unknown }> }).segments;
      const sampleLimit = Number(context.settings.textLlmSampleLimit);
      const result = await executeSegmentTextNodes({
        actionId: action,
        segments: sourceSegments,
        sampleLimit: action === "text_features.compare_rankings" ? sourceSegments.length : Number.isFinite(sampleLimit) && sampleLimit > 0 ? sampleLimit : sourceSegments.length,
        priorCheckpoints: context.priorNodeCheckpoints,
        inputArtifactId: (inputArtifact(context, "snapshot") as { artifactId?: string } | undefined)?.artifactId ?? null,
        promptRouteVersion: action === "text_features.reverse_query" ? REVERSE_QUERY_PROMPT_VERSION : action === "text_features.describe_llm" ? "segment-description-v1" : "feature-ranking-v1",
        payloadFor: (segment) => ({ snapshot: segment.snapshot, brief }),
        request: (_segment, payload, signal) => jsonRoute<unknown>(handler, `/api/am-stage/param-to-text/${action.endsWith("compare_rankings") ? "rank" : action.endsWith("describe_llm") ? "describe" : "reverse-query"}`, payload, signal),
        signal: context.signal,
        persist: context.persistNodeCheckpoint,
        progress: context.onProgress,
      });
      const numbered = (items: typeof result.selected) => items.map((item) => ({ number: sourceSegments.findIndex((source) => source.id === item.id) + 1, id: item.id, startSeconds: item.startSeconds, endSeconds: item.endSeconds }));
      return { artifacts: [{ kind: action.endsWith("compare_rankings") ? "ranking-variants" : action.endsWith("describe_llm") ? "natural-description" : "reverse-query", modality: "text", segmentRefs: sourceSegments, effectiveSettings: { textLlmSampleLimit: result.limit, totalNodes: sourceSegments.length, selectedNodeIds: result.selected.map((item) => item.id), skippedNodeIds: result.skipped.map((item) => item.id), selectedNodeNumbers: numbered(result.selected).map((item) => item.number), skippedNodeNumbers: numbered(result.skipped).map((item) => item.number) }, data: { schema: "am_stage_segment_text_v1", actionId: action, sampling: { total: sourceSegments.length, limit: result.limit, selected: numbered(result.selected), skipped: numbered(result.skipped).map((item) => ({ ...item, status: "not_selected" })) }, segments: result.results } }] };
    }
    const result = await jsonRoute<unknown>(handler, `/api/am-stage/param-to-text/${action.endsWith("compare_rankings") ? "rank" : action.endsWith("describe_llm") ? "describe" : "reverse-query"}`, { snapshot, brief }, context.signal);
    return { artifacts: [{ kind: action.endsWith("compare_rankings") ? "ranking-variants" : action.endsWith("describe_llm") ? "natural-description" : "reverse-query", modality: "text", data: result }] };
  }
  if (action === "brief.combine_segment_texts") {
    const sources = Object.values(context.resolvedInputs).filter((value): value is { actionId?: string; data?: unknown } => Boolean(value && typeof value === "object"));
    const assembly = context.inputs.briefAssembly ?? { sources: { reverseQuery: true, interpretations: true, textFeatures: false, trackDraft: false }, executor: "freellmapi" as const };
    const segmentSourcesSelected = assembly.sources.reverseQuery || assembly.sources.interpretations || assembly.sources.textFeatures || assembly.sources.gapDescriptions === true;
    if (segmentSourcesSelected && !segmentPlan?.length) throw new Error("Selected per-segment Brief sources require a saved SegmentPlan and node results.");
    const draft = assembly.sources.trackDraft ? assembly.trackDraft : undefined;
    if (assembly.sources.trackDraft && (!draft?.sessionId || !draft.text.trim() || !["en", "ru"].includes(draft.language))) throw new Error("Saved track-description source is selected but no matching EN/RU text snapshot is attached to this Run.");
    const fragmentInputs = buildSelectedSegmentBriefInputs(segmentPlan ?? [], sources, assembly.sources);
    if (!fragmentInputs.length && !draft) throw new Error("The selected Brief sources contain no usable segment evidence or saved track description.");
    if (!draft && !fragmentInputs.some((item) => Object.values(item.sources.status).some((status) => status === "available"))) throw new Error("The selected sources have no completed evidence for any node. Brief synthesis was not called.");
    const prompt = buildSelectedSegmentBriefPrompt(fragmentInputs, draft);
    const system = "Synthesize the explicitly selected, ordered audio-fragment evidence into one concise English track Brief. Use only supplied sources, preserve meaningful changes over time, and do not invent unsupported genre, instruments, mood or production details. Do not mention parameters, software or absent evidence. Return plain text only.";
    const { provider, settings } = await loadProviderForModelListing(assembly.executor === "freellmapi" ? "freellmapi" : "ollama");
    let requestedModel: string;
    let contextLimit: number;
    let contextBasis: string;
    if (assembly.executor === "freellmapi") {
      requestedModel = settings.freeLLMApiModel;
      contextLimit = 8192;
      contextBasis = "conservative estimate; FreeLLMAPI model-specific context metadata is unavailable";
    } else {
      requestedModel = assembly.executor === "ollama_model" ? String(assembly.model ?? "").trim() : settings.chatModel;
      if (!requestedModel) throw new Error("Choose an Ollama model explicitly for Brief assembly.");
      const available = await provider.listModels();
      if (!available.some((model) => model.id === requestedModel || model.id.replace(/:latest$/u, "") === requestedModel.replace(/:latest$/u, ""))) throw new Error(`Ollama model '${requestedModel}' is not installed; no fallback was used.`);
      const show = await fetch(`${settings.ollamaUrl.replace(/\/+$/u, "")}/api/show`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: requestedModel }), signal: context.signal }).catch(() => null);
      const details = show?.ok ? await show.json().catch(() => ({})) as { model_info?: Record<string, unknown>; capabilities?: string[] } : {};
      if (Array.isArray(details.capabilities) && !details.capabilities.includes("completion")) throw new Error(`Ollama model '${requestedModel}' does not declare text completion capability; no fallback was used.`);
      const declared = Object.entries(details.model_info ?? {}).find(([key, value]) => /context_length$/u.test(key) && typeof value === "number")?.[1];
      contextLimit = typeof declared === "number" ? Math.min(4096, declared) : 4096;
      contextBasis = typeof declared === "number" ? `model metadata ${declared} tokens; conservatively capped at 4096 because runtime num_ctx is not explicitly set` : "conservative 4096-token estimate; local model context metadata was unavailable";
    }
      const inputChars = system.length + prompt.length;
    const estimatedInputTokens = Math.ceil(inputChars / 4);
    const requestedOutputTokens = Math.max(512, Math.min(2048, settings.maxTokens));
    if (estimatedInputTokens + requestedOutputTokens > contextLimit) throw new Error(`Brief input is too large for the selected executor estimate (${estimatedInputTokens} input + ${requestedOutputTokens} output tokens; budget ${contextLimit}; ${contextBasis}). Reduce selected sources or node count and preview again. No text was truncated.`);
    await context.onProgress({ phase: "brief_preflight", inputCharacters: inputChars, estimatedInputTokens, requestedOutputTokens, contextBudgetTokens: contextLimit, contextBasis, selectedNodes: fragmentInputs.map((item) => item.id), selectedSources: assembly.sources });
    const nodeKey = "brief.combine_segment_texts:brief";
    const inputFingerprint = createHash("sha256").update(JSON.stringify({ prompt, system, promptRouteVersion: "brief-assembly-v1", executor: assembly.executor, requestedModel })).digest("hex");
    const previous = context.priorNodeCheckpoints.find((item) => item.nodeKey === nodeKey && item.inputFingerprint === inputFingerprint);
    let result = previous?.status === "succeeded" ? previous.result as Awaited<ReturnType<typeof provider.chat>> : null;
    if (!result) {
      let latestAttempt = Math.max(0, Number(previous?.attemptsUsed ?? 0));
      const priorElapsed = Math.max(0, Number(previous?.elapsedMs ?? 0));
      if (latestAttempt >= 4 || priorElapsed >= 180_000) throw new NodeRequestError("Brief synthesis node exhausted its persisted retry budget.", undefined, undefined, "invalid");
      const nodeStartedAt = Date.now();
      const requestDiagnostics = { nodeId: "brief", inputArtifactIds: sources.map((item) => (item as { artifactId?: string }).artifactId).filter((id): id is string => Boolean(id)), promptRouteVersion: "brief-assembly-v1", provider: provider.id, requestedModel, payloadSha256: createHash("sha256").update(JSON.stringify({ system, prompt })).digest("hex"), payloadBytes: Buffer.byteLength(JSON.stringify({ system, prompt }), "utf8"), credentialsPersisted: false };
      const persist = (patch: Record<string, unknown>) => context.persistNodeCheckpoint({ schema: "automation_node_checkpoint_v1", nodeKey, segmentId: "brief", inputFingerprint, requestDiagnostics, ...previous, ...patch, elapsedMs: priorElapsed + Date.now() - nodeStartedAt });
      const messages = [{ role: "system" as const, content: system }, { role: "user" as const, content: prompt }];
      try {
        result = await withNodeRetries(async (signal) => {
          try {
            const response = await provider.chat(messages, { model: requestedModel, temperature: 0.2, topP: 0.8, maxTokens: requestedOutputTokens, signal });
            if (!response.text.trim()) throw new NodeRequestError(`${response.provider} returned an empty assembled Brief.`, undefined, undefined, "format");
            return response;
          } catch (error) { throw providerFailure(error); }
        }, {
          signal: context.signal, maxAttempts: 4, initialAttempts: latestAttempt, initialElapsedMs: priorElapsed, maxElapsedMs: 180_000, perAttemptTimeoutMs: 60_000,
          onAttempt: async (attempt) => { latestAttempt = attempt; await persist({ status: "retrying", attemptsUsed: attempt }); await context.onProgress({ phase: "brief_synthesis", nodeId: "brief", attempt, retryLimit: 4 }); },
          onRetry: async ({ nextAttempt, waitMs, message }) => { await persist({ status: "retrying", attemptsUsed: nextAttempt - 1, lastError: message, waitMs }); await context.onProgress({ phase: "retry_wait", nodeId: "brief", attempt: nextAttempt, retryLimit: 4, waitMs, lastError: message }); },
        });
        await persist({ status: "succeeded", attemptsUsed: latestAttempt, result, lastError: null, waitMs: null });
      } catch (error) {
        await persist({ status: context.signal.aborted ? "stopped" : "failed", attemptsUsed: latestAttempt, lastError: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    const text = result.text.trim();
    if (!text) throw new Error(`${result.provider} returned an empty assembled Brief.`);
    const nodesWithSelectedEvidence = fragmentInputs.filter((item) => Object.values(item.sources.status).some((status) => status === "available")).map((item) => item.id);
    const nodesWithoutSelectedEvidence = fragmentInputs.filter((item) => !Object.values(item.sources.status).some((status) => status === "available")).map((item) => item.id);
    return { artifacts: [{ kind: "brief", modality: "text", segmentRefs: segmentPlan, modelBinding: { provider: result.provider, model: result.model, requestedModel: result.requestedModel, executorSelection: assembly.executor }, effectiveSettings: { selectedSources: assembly.sources, nodesWithSelectedEvidence, nodesWithoutSelectedEvidence, inputCharacters: inputChars, estimatedInputTokens, contextBudgetTokens: contextLimit, contextBasis }, data: { text, source: "audio-segment-aggregation", provider: result.provider, model: result.model, requestedModel: result.requestedModel, executorSelection: assembly.executor, selectedSources: assembly.sources, selectedTrackDraft: draft ? { sessionId: draft.sessionId, language: draft.language, snapshotUpdatedAt: draft.snapshotUpdatedAt, text: draft.text } : null, segmentInputs: fragmentInputs, segmentIds: fragmentInputs.map((item) => item.id), nodesWithSelectedEvidence, nodesWithoutSelectedEvidence, totalSegmentCount: segmentPlan?.length ?? 0 } }] };
  }
  if (action === "stage2.client") {
    const sourceArtifacts = Object.entries(context.resolvedInputs)
      .filter(([name]) => name.startsWith("source"))
      .map(([, value]) => value as { actionId?: string; data?: unknown; segmentRefs?: Array<{ id: string; startSeconds: number; endSeconds: number }> })
      .filter((value): value is { actionId: AutomationActionId; data: unknown; segmentRefs: Array<{ id: string; startSeconds: number; endSeconds: number }> } => typeof value.actionId === "string" && Array.isArray(value.segmentRefs));
    const parameters = smoothAutomationFrames(sourceArtifacts, {
      domainLayers: context.inputs.workspaceSnapshot?.domainLayers,
      topK: Number(context.settings.consensusTopK ?? 64),
      centroidPercent: Number(context.settings.consensusCentroidPercent ?? 50),
    });
    return { artifacts: [{ kind: "parameter-bank", bankId: "client-stage2", modality: "consensus", pass: "client-smooth", segmentRefs: [...new Map(sourceArtifacts.flatMap((artifact) => artifact.segmentRefs).map((segment) => [segment.id, segment])).values()], data: parameters }] };
  }
  throw new Error(`No Automation adapter is registered for ${action}.`);
}

export function createArtifactId() { return randomUUID(); }
