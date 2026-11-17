import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readRunArtifact } from "@/lib/am-stage-automation/storage";
import { isSupportedParameterBankIntersectionPlan, isSupportedParameterBankTransformPlan, isSupportedRMergePlan, isSupportedServerStage2Plan } from "@/lib/am-stage-automation/scenario-editor";
import { applyMergeBank, buildMergePreview, mergeOperationIdempotencyKey, restoreMergeImportState, validateBankSetDifferenceData, validateBankSetIntersectionData, validateDataSplitParameterBankData, validateFilteredParameterBankData, validateJoinedParameterBankData, validateMergeArtifactData, validateSelectedParameterBankData, validateServerStage2ParameterBankData, validateVocalAllocationParameterBank, type MergeInput, type MergeSource, type ParameterBankInput, type Stage2ServerInput } from "@/lib/am-stage-automation/merge-stage-apply";
import { nextSessionRevision, readStageSnapshot, withStageSessionLock, writeStageSnapshot } from "@/lib/am-stage-session-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const previewGlobals = globalThis as typeof globalThis & { __amStageMergePreviewSecret?: string };
const previewSecret = previewGlobals.__amStageMergePreviewSecret ??= randomUUID();
const target = "v3.active_parameters" as const;
const sign = (value: string) => createHmac("sha256", previewSecret).update(value).digest("hex");
const seal = (payload: unknown) => { const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); return body + "." + sign(body); };
const unseal = (token: unknown) => {
  if (typeof token !== "string") throw new Error("preview_token_invalid");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || sign(body) !== signature) throw new Error("preview_token_invalid");
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sessionId: string; revision: string; artifactId: string; source: MergeSource; operationId: string; preview: ReturnType<typeof buildMergePreview> };
};

function stagePayload(value: unknown): { metadata: Record<string, unknown>; data: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("artifact_payload_invalid");
  const payload = value as Record<string, unknown>;
  return { metadata: payload, data: payload.data };
}

async function loadMergeArtifact(artifactId: string) {
  const row = await db.automationArtifact.findUnique({ where: { id: artifactId }, include: { run: true, stage: { include: { attempts: true } }, attempt: true } });
  if (!row || !row.attemptId || !row.stageExecutionId || !row.stage || !row.attempt) throw new Error("artifact_not_found_or_detached");
  const planRow = await db.automationPlan.findUnique({ where: { id: row.run.planId }, select: { documentJson: true } });
  const plan = planRow ? JSON.parse(planRow.documentJson) as import("@/lib/am-stage-automation/contracts").AutomationPlanDocument : null;
  if (row.actionId === "vocal_allocation.search") {
    const plannedStage = plan?.stages.find((stage) => stage.stageId === row.stage?.stageId);
    if (!plan || plan.scenarioRef.id !== row.run.scenarioId || !plannedStage || plannedStage.actionId !== "vocal_allocation.search" || row.stage.runId !== row.runId || row.stage.actionId !== row.actionId
      || row.stage.successfulAttemptId !== row.attemptId || row.stage.status !== "succeeded" || row.attempt.stageExecutionId !== row.stageExecutionId || row.attempt.status !== "succeeded"
      || row.schemaVersion !== 1 || row.kind !== "parameter-bank" || row.bankId !== "vocal-allocation" || row.pass !== "explicit-assignments" || row.validity !== "valid") throw new Error("artifact_run_stage_attempt_invalid");
    const raw = await readRunArtifact(row.payloadRef);
    const { metadata, data } = stagePayload(raw);
    if (metadata.schemaVersion !== row.schemaVersion || metadata.kind !== row.kind || metadata.actionId !== row.actionId || metadata.bankId !== row.bankId || metadata.pass !== row.pass || metadata.validity !== row.validity) throw new Error("artifact_payload_metadata_mismatch");
    const refs = JSON.parse(row.inputRefsJson) as unknown;
    if (!Array.isArray(refs) || !refs.every((item) => typeof item === "string") || JSON.stringify(metadata.inputRefs ?? []) !== JSON.stringify(refs)) throw new Error("artifact_input_refs_invalid");
    const companion = await db.automationArtifact.findFirst({ where: { runId: row.runId, stageExecutionId: row.stageExecutionId, attemptId: row.attemptId, actionId: "vocal_allocation.search", kind: "vocal-allocation", schemaVersion: 1, validity: "valid" } });
    if (!companion) throw new Error("vocal_allocation_companion_artifact_missing");
    const companionPayload = stagePayload(await readRunArtifact(companion.payloadRef));
    const companionData = companionPayload.data as { results?: unknown } | null;
    if (companionPayload.metadata.actionId !== row.actionId || companionPayload.metadata.kind !== companion.kind || companionPayload.metadata.schemaVersion !== companion.schemaVersion || companionPayload.metadata.validity !== companion.validity || companion.validity !== "valid" || companion.inputRefsJson !== row.inputRefsJson || JSON.stringify(companionPayload.metadata.inputRefs ?? []) !== JSON.stringify(refs) || !Array.isArray(companionData?.results) || JSON.stringify(companionData.results) !== JSON.stringify(data)) throw new Error("vocal_allocation_companion_artifact_mismatch");
    if (refs.length) {
      const inputRows = await db.automationArtifact.findMany({ where: { id: { in: refs as string[] } }, include: { stage: true, attempt: true } });
      if (inputRows.length !== refs.length) throw new Error("artifact_input_missing");
      for (const ref of refs as string[]) {
        const inputRow = inputRows.find((item) => item.id === ref);
        if (!inputRow || inputRow.runId !== row.runId || !inputRow.attemptId || !inputRow.stageExecutionId || !inputRow.stage || !inputRow.attempt || inputRow.stage.runId !== row.runId || inputRow.stage.successfulAttemptId !== inputRow.attemptId || inputRow.stage.status !== "succeeded" || inputRow.attempt.status !== "succeeded" || inputRow.attempt.stageExecutionId !== inputRow.stageExecutionId || inputRow.schemaVersion !== 1 || inputRow.validity !== "valid") throw new Error("artifact_input_identity_or_validity_invalid");
      }
    }
    const validated = validateVocalAllocationParameterBank({ artifactId: row.id, actionId: row.actionId, bankId: row.bankId, pass: row.pass, validity: row.validity, inputRefs: refs, data });
    if (!validated.ok) throw new Error("vocal_assignment_artifact_invalid:" + validated.reason);
    const source: MergeSource = { runId: row.runId, stageId: row.stage.stageId, attemptId: row.attemptId, artifactId: row.id, actionId: "vocal_allocation.search", schemaVersion: 1, kind: "parameter-bank", bankId: "vocal-allocation", pass: "explicit-assignments", relatedArtifactIds: [companion.id] };
    return { source, bank: validated.bank };
  }
  if (row.actionId === "stage2.server" && row.run.scenarioId && plan) {
    const stage = plan.stages.find((item) => item.stageId === row.stage?.stageId);
    if (!isSupportedServerStage2Plan(plan, row.run.scenarioId, row.stage.stageId)
      || row.stage.runId !== row.runId || row.stage.actionId !== row.actionId || row.stage.successfulAttemptId !== row.attemptId || row.stage.status !== "succeeded" || row.attempt.stageExecutionId !== row.stageExecutionId || row.attempt.status !== "succeeded"
      || row.schemaVersion !== 1 || row.kind !== "parameter-bank" || row.bankId !== "server-stage2" || row.pass !== "stage2" || row.validity !== "valid") throw new Error("stage2_artifact_run_stage_attempt_invalid");
    const raw = await readRunArtifact(row.payloadRef);
    const { metadata, data } = stagePayload(raw);
    if (metadata.schemaVersion !== row.schemaVersion || metadata.kind !== row.kind || metadata.actionId !== row.actionId || metadata.bankId !== row.bankId || metadata.pass !== row.pass || metadata.validity !== row.validity) throw new Error("stage2_artifact_payload_metadata_mismatch");
    const refs = JSON.parse(row.inputRefsJson) as unknown;
    const bindings = stage?.inputBindings.filter((binding) => binding.port !== "order") ?? [];
    if (!Array.isArray(refs) || refs.length !== bindings.length || refs.some((item) => typeof item !== "string") || JSON.stringify(metadata.inputRefs ?? []) !== JSON.stringify(refs)) throw new Error("stage2_artifact_input_refs_invalid");
    const inputRows = await db.automationArtifact.findMany({ where: { id: { in: refs as string[] } }, include: { stage: true, attempt: true } });
    if (inputRows.length !== refs.length) throw new Error("stage2_artifact_input_missing");
    const orderedInputs: Stage2ServerInput[] = [];
    for (const [index, ref] of refs.entries()) {
      const inputRow = inputRows.find((item) => item.id === ref);
      const binding = bindings[index];
      if (!inputRow || !binding || !inputRow.attemptId || !inputRow.stageExecutionId || inputRow.runId !== row.runId || !inputRow.stage || !inputRow.attempt || inputRow.stage.runId !== row.runId || inputRow.stage.successfulAttemptId !== inputRow.attemptId || inputRow.stage.status !== "succeeded" || inputRow.attempt.stageExecutionId !== inputRow.stageExecutionId || inputRow.attempt.status !== "succeeded" || inputRow.schemaVersion !== 1 || inputRow.validity !== "valid" || inputRow.stage.actionId !== inputRow.actionId || binding.from !== `stage:${inputRow.stage.stageId}` || (binding.port ?? "result") !== "result") throw new Error("stage2_artifact_input_identity_or_binding_invalid");
      const inputPayload = stagePayload(await readRunArtifact(inputRow.payloadRef));
      if (inputPayload.metadata.schemaVersion !== inputRow.schemaVersion || inputPayload.metadata.kind !== inputRow.kind || inputPayload.metadata.actionId !== inputRow.actionId || (inputPayload.metadata.bankId ?? null) !== inputRow.bankId || (inputPayload.metadata.pass ?? null) !== inputRow.pass || inputPayload.metadata.validity !== inputRow.validity || JSON.stringify(inputPayload.metadata.inputRefs ?? []) !== inputRow.inputRefsJson) throw new Error("stage2_artifact_input_payload_metadata_mismatch");
      if (binding.name === "brief" && inputRow.kind !== "brief" || binding.name === "stage1" && inputRow.kind !== "parameter-bank") throw new Error("stage2_artifact_input_kind_mismatch");
      orderedInputs.push({ artifactId: inputRow.id, actionId: inputRow.actionId, kind: inputRow.kind, validity: inputRow.validity, data: inputPayload.data });
    }
    const validated = validateServerStage2ParameterBankData({ artifactId: row.id, actionId: row.actionId, bankId: row.bankId, pass: row.pass, validity: row.validity, inputRefs: refs, data }, orderedInputs);
    if (!validated.ok) throw new Error("stage2_artifact_invalid:" + validated.reason);
    const source: MergeSource = { runId: row.runId, stageId: row.stage.stageId, attemptId: row.attemptId, artifactId: row.id, actionId: "stage2.server", schemaVersion: 1, kind: "parameter-bank", bankId: "server-stage2", pass: "stage2", relatedArtifactIds: refs as string[] };
    return { source, bank: validated.bank };
  }
  if ((row.actionId === "data.filter" || row.actionId === "data.split" || row.actionId === "data.select" || row.actionId === "flow.join") && row.run.scenarioId && plan) {
    const transformStage = plan.stages.find((item) => item.stageId === row.stage?.stageId);
    if (!isSupportedParameterBankTransformPlan(plan, row.run.scenarioId, row.stage.stageId)
      || row.stage.runId !== row.runId || row.stage.actionId !== row.actionId || row.stage.successfulAttemptId !== row.attemptId || row.stage.status !== "succeeded" || row.attempt.stageExecutionId !== row.stageExecutionId || row.attempt.status !== "succeeded"
      || row.schemaVersion !== 1 || row.kind !== "parameter-bank" || row.validity !== "valid") throw new Error("artifact_run_stage_attempt_invalid");
    const raw = await readRunArtifact(row.payloadRef);
    const { metadata, data } = stagePayload(raw);
    if (metadata.schemaVersion !== row.schemaVersion || metadata.kind !== row.kind || metadata.actionId !== row.actionId || (metadata.bankId ?? null) !== row.bankId || (metadata.pass ?? null) !== row.pass || metadata.validity !== row.validity) throw new Error("artifact_payload_metadata_mismatch");
    const outputPort = typeof metadata.outputPort === "string" ? metadata.outputPort : undefined;
    const source: MergeSource = { runId: row.runId, stageId: row.stage.stageId, attemptId: row.attemptId, artifactId: row.id, actionId: row.actionId, schemaVersion: 1, kind: "parameter-bank", bankId: row.bankId, pass: row.pass, ...(row.actionId === "data.split" && outputPort ? { outputPort } : {}) };
    const refs = JSON.parse(row.inputRefsJson) as unknown;
    if (!Array.isArray(refs) || refs.length === 0 || refs.some((item) => typeof item !== "string") || JSON.stringify(metadata.inputRefs ?? []) !== JSON.stringify(refs)) throw new Error("artifact_input_refs_invalid");
    const bindings = transformStage?.inputBindings.filter((binding) => binding.port !== "order") ?? [];
    const inputRows = await db.automationArtifact.findMany({ where: { id: { in: refs as string[] } }, include: { stage: true, attempt: true } });
    if (inputRows.length !== refs.length) throw new Error("artifact_input_missing");
    const orderedInputs: ParameterBankInput[] = [];
    let previousBindingIndex = -1;
    for (const [index, ref] of refs.entries()) {
      const inputRow = inputRows.find((item) => item.id === ref);
      if (!inputRow || !inputRow.attemptId || !inputRow.stageExecutionId || inputRow.runId !== row.runId || !inputRow.stage || !inputRow.attempt || inputRow.stage.runId !== row.runId || inputRow.stage.successfulAttemptId !== inputRow.attemptId || inputRow.stage.status !== "succeeded" || inputRow.attempt.status !== "succeeded" || inputRow.attempt.stageExecutionId !== inputRow.stageExecutionId || inputRow.schemaVersion !== 1 || inputRow.validity !== "valid" || inputRow.kind !== "parameter-bank" || inputRow.stage.actionId !== inputRow.actionId) throw new Error("artifact_input_identity_or_validity_invalid");
      const inputRaw = stagePayload(await readRunArtifact(inputRow.payloadRef));
      if (inputRaw.metadata.schemaVersion !== inputRow.schemaVersion || inputRaw.metadata.kind !== inputRow.kind || inputRaw.metadata.actionId !== inputRow.actionId || (inputRaw.metadata.bankId ?? null) !== inputRow.bankId || (inputRaw.metadata.pass ?? null) !== inputRow.pass || inputRaw.metadata.validity !== inputRow.validity || JSON.stringify(inputRaw.metadata.inputRefs ?? []) !== inputRow.inputRefsJson) throw new Error("artifact_input_payload_metadata_mismatch");
      const inputPort = typeof inputRaw.metadata.outputPort === "string" ? inputRaw.metadata.outputPort : "result";
      const bindingIndex = bindings.findIndex((binding, candidateIndex) => candidateIndex > previousBindingIndex && binding.from === `stage:${inputRow.stage!.stageId}` && (binding.port ?? "result") === inputPort);
      if (bindingIndex < 0 || (transformStage?.actionId === "data.filter" || transformStage?.actionId === "data.split" || transformStage?.actionId === "data.select") && bindingIndex !== 0) throw new Error("artifact_input_binding_mismatch");
      previousBindingIndex = bindingIndex;
      orderedInputs.push({ artifactId: inputRow.id, actionId: inputRow.actionId, data: inputRaw.data, kind: inputRow.kind, validity: inputRow.validity, bankId: inputRow.bankId, pass: inputRow.pass });
      if (index > 0 && orderedInputs[index - 1]?.artifactId === inputRow.id) throw new Error("artifact_input_duplicate");
    }
    const validated = transformStage?.actionId === "data.filter"
      ? validateFilteredParameterBankData({ artifactId: row.id, actionId: row.actionId, validity: row.validity, inputRefs: refs, data }, orderedInputs[0]!, transformStage.settings.effective.rules as Array<{ field: string; op: string; value?: unknown }>)
      : transformStage?.actionId === "data.split"
        ? validateDataSplitParameterBankData({ artifactId: row.id, actionId: row.actionId, outputPort, kind: row.kind, bankId: row.bankId, pass: row.pass, validity: row.validity, inputRefs: refs, data }, orderedInputs[0]!, transformStage.settings.effective.channels)
      : transformStage?.actionId === "data.select"
        ? validateSelectedParameterBankData({ artifactId: row.id, actionId: row.actionId, validity: row.validity, inputRefs: refs, data }, orderedInputs[0]!, { mode: transformStage.settings.effective.mode, fields: transformStage.settings.effective.fields })
        : validateJoinedParameterBankData({ artifactId: row.id, actionId: row.actionId, validity: row.validity, inputRefs: refs, data }, orderedInputs);
    source.relatedArtifactIds = refs as string[];
    if (!validated.ok) throw new Error("automation_bank_artifact_invalid:" + validated.reason);
    return { source, bank: validated.bank };
  }
  const isMergePlan = Boolean(row.run.scenarioId && plan && isSupportedRMergePlan(plan, row.run.scenarioId, row.stage.stageId));
  const isIntersectionPlan = Boolean(row.run.scenarioId && plan && row.stage.actionId === "data.intersection" && isSupportedParameterBankIntersectionPlan(plan, row.run.scenarioId, row.stage.stageId));
  const isDifferencePlan = Boolean(row.run.scenarioId && plan && row.stage.actionId === "data.difference" && isSupportedParameterBankIntersectionPlan(plan, row.run.scenarioId, row.stage.stageId));
  if (!row.run.scenarioId || !plan || (!isMergePlan && !isIntersectionPlan && !isDifferencePlan)
    || row.stage.runId !== row.runId || !["data.merge", "data.intersection", "data.difference"].includes(row.stage.actionId) || row.stage.successfulAttemptId !== row.attemptId || row.stage.status !== "succeeded" || row.attempt.stageExecutionId !== row.stageExecutionId || row.attempt.status !== "succeeded") throw new Error("artifact_run_stage_attempt_invalid");
  const raw = await readRunArtifact(row.payloadRef);
  const { metadata, data } = stagePayload(raw);
  if (metadata.schemaVersion !== row.schemaVersion || metadata.kind !== row.kind || metadata.actionId !== row.actionId || metadata.bankId !== row.bankId || metadata.pass !== row.pass || metadata.validity !== row.validity) throw new Error("artifact_payload_metadata_mismatch");
  const isIntersection = row.actionId === "data.intersection";
  const isDifference = row.actionId === "data.difference";
  const source: MergeSource = isIntersection
    ? { runId: row.runId, stageId: row.stage.stageId, attemptId: row.attemptId, artifactId: row.id, actionId: "data.intersection", schemaVersion: 1, kind: "parameter-bank", bankId: "intersection", pass: "intersection" }
    : isDifference
      ? { runId: row.runId, stageId: row.stage.stageId, attemptId: row.attemptId, artifactId: row.id, actionId: "data.difference", schemaVersion: 1, kind: "parameter-bank", bankId: "difference", pass: "difference" }
      : { runId: row.runId, stageId: row.stage.stageId, attemptId: row.attemptId, artifactId: row.id, actionId: "data.merge", schemaVersion: 1, kind: "parameter-bank", bankId: "merged", pass: "merge" };
  if (row.actionId !== source.actionId || row.schemaVersion !== 1 || row.kind !== source.kind || row.bankId !== source.bankId || row.pass !== source.pass || row.validity !== "valid") throw new Error("artifact_contract_invalid");
  const refs = JSON.parse(row.inputRefsJson) as unknown;
  if (!Array.isArray(refs) || refs.length !== 2 || refs.some((id) => typeof id !== "string")) throw new Error("artifact_input_refs_invalid");
  const mergeStage = plan.stages.find((item) => item.stageId === row.stage?.stageId);
  const mergeBindings = mergeStage?.inputBindings.filter((binding) => binding.port !== "order") ?? [];
  if (mergeBindings.length !== 2 || (isIntersection || isDifference ? mergeBindings[0]?.name !== "a" || mergeBindings[1]?.name !== "b" : !mergeBindings.some((binding) => binding.name === "qwenBank") || !mergeBindings.some((binding) => binding.name === "gemmaBank"))) throw new Error("artifact_input_bindings_invalid");
  const inputRows = await db.automationArtifact.findMany({ where: { id: { in: refs as string[] } }, include: { stage: { include: { attempts: true } }, attempt: true } });
  if (inputRows.length !== 2) throw new Error("artifact_input_missing");
  const inputs: MergeInput[] = [];
  for (let index = 0; index < refs.length; index += 1) {
    const inputRow = inputRows.find((item) => item.id === refs[index]);
    if (!inputRow || !inputRow.attemptId || !inputRow.stageExecutionId || inputRow.runId !== row.runId || !inputRow.stage || !inputRow.attempt || inputRow.stage.runId !== row.runId || inputRow.stage.successfulAttemptId !== inputRow.attemptId || inputRow.stage.status !== "succeeded" || inputRow.attempt.status !== "succeeded" || inputRow.attempt.stageExecutionId !== inputRow.stageExecutionId || inputRow.schemaVersion !== 1 || inputRow.validity !== "valid" || inputRow.kind !== "parameter-bank") throw new Error("artifact_input_identity_or_validity_invalid");
    const binding = mergeBindings[index];
    const inputContract = binding.name === "qwenBank" || (isIntersection || isDifference) && inputRow?.actionId === "text.qwen.resolved"
      ? { actionId: "text.qwen.resolved" as const, bankId: "qwen-text" as const, pass: "resolved" as const }
      : binding.name === "gemmaBank" || (isIntersection || isDifference) && inputRow?.actionId === "text.gemma.awtd"
        ? { actionId: "text.gemma.awtd" as const, bankId: "gemma-text" as const, pass: "awtd" as const }
        : null;
    if (!inputContract || binding.from !== `stage:${inputRow.stage.stageId}` || inputRow.actionId !== inputContract.actionId || inputRow.stage.actionId !== inputContract.actionId || inputRow.bankId !== inputContract.bankId || inputRow.pass !== inputContract.pass) throw new Error("artifact_input_contract_invalid");
    const inputPayload = stagePayload(await readRunArtifact(inputRow.payloadRef));
    if (inputPayload.metadata.schemaVersion !== inputRow.schemaVersion || inputPayload.metadata.kind !== inputRow.kind || inputPayload.metadata.actionId !== inputRow.actionId || inputPayload.metadata.bankId !== inputRow.bankId || inputPayload.metadata.pass !== inputRow.pass || inputPayload.metadata.validity !== inputRow.validity) throw new Error("artifact_input_payload_metadata_mismatch");
    if (JSON.stringify(inputPayload.metadata.inputRefs ?? []) !== inputRow.inputRefsJson) throw new Error("artifact_input_payload_refs_mismatch");
    const inputData = inputPayload.data;
    const parameters = Array.isArray(inputData) ? inputData : inputData && typeof inputData === "object" && Array.isArray((inputData as { parameters?: unknown }).parameters) ? (inputData as { parameters: unknown[] }).parameters : null;
    if (!parameters) throw new Error("artifact_input_data_invalid");
    inputs.push({ artifactId: inputRow.id, ...inputContract, data: parameters });
  }
  const validated = isIntersection
    ? validateBankSetIntersectionData({ ...source, validity: row.validity, inputRefs: refs, data }, inputs)
    : isDifference
      ? validateBankSetDifferenceData({ ...source, validity: row.validity, inputRefs: refs, data }, inputs)
      : validateMergeArtifactData({ ...source, validity: row.validity, inputRefs: refs, data }, inputs);
  if (!validated.ok) throw new Error("merge_artifact_invalid:" + validated.reason);
  if (JSON.stringify(metadata.inputRefs) !== JSON.stringify(refs)) throw new Error("artifact_payload_input_refs_mismatch");
  return { source, bank: validated.bank };
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { action?: string; artifactId?: string; expectedRevision?: string; previewToken?: string };
    if (body.action !== "preview" && body.action !== "apply") return NextResponse.json({ error: "action must be preview or apply." }, { status: 400 });
    if (!body.artifactId) return NextResponse.json({ error: "artifactId is required." }, { status: 400 });
    const snapshot = await readStageSnapshot(id);
    if (!snapshot) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (body.action === "preview" && (!body.expectedRevision || snapshot.meta.updated_at !== body.expectedRevision)) return NextResponse.json({ error: "Session changed; refresh preview.", code: "STALE_SESSION_REVISION", latestRevision: snapshot.meta.updated_at }, { status: 409 });
    let sealed: ReturnType<typeof unseal> | null = null;
    if (body.action === "apply") {
      sealed = unseal(body.previewToken);
      if (sealed.sessionId !== id || sealed.artifactId !== body.artifactId || sealed.revision !== body.expectedRevision) return NextResponse.json({ error: "Preview no longer matches this session or artifact.", code: "STALE_PREVIEW" }, { status: 409 });
      const replayKey = mergeOperationIdempotencyKey({ sessionId: id, source: sealed.source, target, policy: sealed.preview.policy, operationId: sealed.operationId });
      const replay = await withStageSessionLock(id, async () => {
        const latest = await readStageSnapshot(id);
        if (!latest) return NextResponse.json({ error: "Session not found." }, { status: 404 });
        const receipt = restoreMergeImportState(latest.data.v3.merge_import)?.operation_receipts[sealed!.operationId];
        if (!receipt) return null;
        if (receipt.idempotencyKey !== replayKey) return NextResponse.json({ error: "operation_id_reused" }, { status: 409 });
        return NextResponse.json({ receipt, replayed: true, revision: latest.meta.updated_at });
      });
      if (replay) return replay;
    }
    const { source, bank } = await loadMergeArtifact(body.artifactId);
    const state = restoreMergeImportState(snapshot.data.v3.merge_import);
    const preview = buildMergePreview(snapshot.data.v3.active_parameters ?? [], state, bank);
    if (body.action === "preview") {
      const operationId = randomUUID();
      const token = seal({ sessionId: id, revision: snapshot.meta.updated_at, artifactId: body.artifactId, source, operationId, preview });
      return NextResponse.json({ preview, source, target, operationId, previewToken: token });
    }
    if (!sealed || sealed.sessionId !== id || sealed.artifactId !== body.artifactId || sealed.source.runId !== source.runId || sealed.source.stageId !== source.stageId || sealed.source.attemptId !== source.attemptId || sealed.source.artifactId !== source.artifactId || sealed.source.outputPort !== source.outputPort) return NextResponse.json({ error: "Preview no longer matches the artifact or target state.", code: "STALE_PREVIEW" }, { status: 409 });
    const key = mergeOperationIdempotencyKey({ sessionId: id, source, target, policy: sealed.preview.policy, operationId: sealed.operationId });
    return await withStageSessionLock(id, async () => {
      const latest = await readStageSnapshot(id);
      if (!latest) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      const currentState = restoreMergeImportState(latest.data.v3.merge_import);
      const prior = currentState?.operation_receipts[sealed.operationId];
      if (prior) {
        if (prior.idempotencyKey !== key) return NextResponse.json({ error: "operation_id_reused" }, { status: 409 });
        return NextResponse.json({ receipt: prior, replayed: true, revision: latest.meta.updated_at });
      }
      if (latest.meta.updated_at !== body.expectedRevision) return NextResponse.json({ error: "Session changed; refresh preview.", code: "STALE_PREVIEW", latestRevision: latest.meta.updated_at }, { status: 409 });
      const latestPreview = buildMergePreview(latest.data.v3.active_parameters ?? [], currentState, bank);
      if (JSON.stringify(latestPreview) !== JSON.stringify(sealed.preview)) return NextResponse.json({ error: "Preview no longer matches session state.", code: "STALE_PREVIEW" }, { status: 409 });
      const revision = nextSessionRevision(latest.meta.updated_at);
      const result = applyMergeBank(latest.data.v3.active_parameters ?? [], currentState, bank, { sessionId: id, source, operationId: sealed.operationId, idempotencyKey: key, requestedRevision: latest.meta.updated_at, resultingRevision: revision });
      latest.data.v3.active_parameters = result.parameters;
      latest.data.v3.merge_import = result.state;
      latest.meta.updated_at = revision;
      await writeStageSnapshot(latest);
      return NextResponse.json({ receipt: result.receipt, replayed: false, revision, snapshot: latest });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound = message.includes("not_found");
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 400 });
  }
}
