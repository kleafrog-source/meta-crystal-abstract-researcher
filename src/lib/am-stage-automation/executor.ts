import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { buildAutomationPreview } from "./planning";
import { getAutomationScenario, listAutomationScenarios, seedBuiltInScenarios } from "./scenarios";
import { addAssetReference, ensureAutomationDirectories, moveRunToTrash, purgeTrashedRun, readRunArtifact, removeAssetReference, restoreRunDirectory, writeRunArtifact } from "./storage";
import { createArtifactId, executeAutomationAction } from "./adapters";
import { createSequencedEvent } from "./sequenced-event";
import { chooseBoundArtifact, filterStageOutputArtifacts } from "./artifact-binding";
import type { AutomationAdapterContext, AutomationArtifactPayload, AutomationExternalInputs, AutomationPlanDocument, AutomationScenarioDefinition } from "./contracts";
import { beginNodeRetryCycle, acceptSavedReverseQueryResponse } from "./reverse-query-checkpoint";
import { REVERSE_QUERY_PROMPT_VERSION } from "@/lib/cross-modal/reverse-query";

const runtime = globalThis as typeof globalThis & { __amStageAutomationInstanceId?: string };
const INSTANCE = runtime.__amStageAutomationInstanceId ?? (runtime.__amStageAutomationInstanceId = `${process.pid}:${randomUUID()}`);
const active = new Map<string, AbortController>();
const initState = globalThis as typeof globalThis & { __amStageAutomationInit?: Promise<void> };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: string | null | undefined) => { try { return value ? JSON.parse(value) as unknown : null; } catch { return null; } };

export async function initializeAutomation() {
  if (!initState.__amStageAutomationInit) initState.__amStageAutomationInit = initializeAutomationImpl().catch((error) => { initState.__amStageAutomationInit = undefined; throw error; });
  return initState.__amStageAutomationInit;
}

async function initializeAutomationImpl() {
  await ensureAutomationDirectories();
  await seedBuiltInScenarios();
  const lock = await db.automationExecutorLock.findUnique({ where: { id: "application" } });
  const ownerPid = Number(lock?.ownerInstanceId?.split(":", 1)[0]);
  let ownerAlive = false;
  if (Number.isInteger(ownerPid) && ownerPid > 0 && ownerPid !== process.pid) {
    try { process.kill(ownerPid, 0); ownerAlive = true; } catch { ownerAlive = false; }
  }
  const activeRuns = await db.automationRun.findMany({ where: { status: { in: ["preparing", "running", "stopping"] } } });
  for (const run of activeRuns) {
    const lockBelongsToRun = lock?.activeRunId === run.id;
    const executorStillOwnsRun = lockBelongsToRun && lock?.ownerInstanceId === INSTANCE;
    const otherOwnerAlive = lockBelongsToRun && lock?.ownerInstanceId !== INSTANCE && ownerAlive;
    if (!executorStillOwnsRun && !otherOwnerAlive) {
      const executions = await db.automationStageExecution.findMany({ where: { runId: run.id, status: "running" }, select: { id: true } });
      const executionIds = executions.map((execution) => execution.id);
      await db.$transaction([
        ...(executionIds.length ? [db.automationAttempt.updateMany({ where: { stageExecutionId: { in: executionIds }, status: "running" }, data: { status: "interrupted", finishedAt: new Date(), errorJson: JSON.stringify({ message: "The application restarted before this stage finished." }) } })] : []),
        db.automationStageExecution.updateMany({ where: { runId: run.id, status: "running" }, data: { status: "interrupted" } }),
        db.automationRun.update({ where: { id: run.id }, data: { status: "interrupted", finishedAt: new Date(), currentStageId: null, lastErrorSummary: "The application restarted before this run finished." } }),
      ]);
      await db.automationExecutorLock.updateMany({ where: { id: "application", activeRunId: run.id }, data: { activeRunId: null, ownerInstanceId: null } });
      await appendEvent(run.id, "run.interrupted", { reason: "server_restart" });
    }
  }
}

async function appendEvent(runId: string, type: string, payload: unknown, stageId?: string, attemptId?: string) {
  return createSequencedEvent({
    readNextSequence: async () => {
      const latest = await db.automationRunEvent.findFirst({ where: { runId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      return (latest?.sequence ?? 0) + 1;
    },
    create: (sequence) => db.automationRunEvent.create({ data: { id: randomUUID(), runId, sequence, type, payloadJson: JSON.stringify(payload), ...(stageId ? { stageId } : {}), ...(attemptId ? { attemptId } : {}) } }),
    isUniqueConflict: (error) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"),
  });
}

export async function createPreview(input: { scenarioId: string; inputs: AutomationExternalInputs; overrides?: Record<string, unknown>; draftDefinition?: AutomationScenarioDefinition }) {
  await initializeAutomation();
  const stored = await getAutomationScenario(input.scenarioId);
  return buildAutomationPreview(stored ? { ...input, draftDefinition: stored.definition } : input);
}

export async function startAutomation(input: { commandId: string; scenarioId: string; inputs: AutomationExternalInputs; overrides?: Record<string, unknown>; draftDefinition?: AutomationScenarioDefinition; title?: string; parentRunId?: string }) {
  await initializeAutomation();
  if (!/^[\w:-]{8,160}$/u.test(input.commandId)) throw new Error("A stable commandId is required.");
  const stored = await getAutomationScenario(input.scenarioId);
  const resolvedInput = stored ? { ...input, draftDefinition: stored.definition } : input;
  const preview = await buildAutomationPreview(resolvedInput);
  if (preview.blockers.length) throw new Error(`Automation is blocked: ${preview.blockers.map((item) => item.message).join("; ")}`);
  const payloadHash = hash({ scenarioId: input.scenarioId, inputs: input.inputs, overrides: input.overrides, draftDefinition: input.draftDefinition });
  const prior = await db.automationCommand.findUnique({ where: { commandId: input.commandId } });
  if (prior) {
    if (prior.payloadHash !== payloadHash) throw new Error("COMMAND_ID_PAYLOAD_MISMATCH");
    if (prior.runId) {
      const existingRun = await getAutomationRun(prior.runId);
      if (!existingRun) throw new Error("RUN_WAS_DELETED");
      return existingRun;
    }
  }
  const scenario = (await listAutomationScenarios()).find((item) => item.id === input.scenarioId);
  if (input.parentRunId && !await db.automationRun.findUnique({ where: { id: input.parentRunId }, select: { id: true } })) throw new Error("The source run for this new run no longer exists.");
  const plan = preview.plan;
  const planId = randomUUID(), runId = randomUUID(), now = new Date();
  const version = await db.automationScenarioVersion.findFirst({ where: { scenarioId: input.scenarioId, version: plan.scenarioRef.version } });
  await db.$transaction(async (tx) => {
    const lock = await tx.automationExecutorLock.findUnique({ where: { id: "application" } });
    if (lock?.activeRunId) throw new Error(`EXECUTOR_BUSY:${lock.activeRunId}`);
    const acquired = await tx.automationExecutorLock.updateMany({ where: { id: "application", activeRunId: null }, data: { activeRunId: runId, ownerInstanceId: INSTANCE, acquiredAt: now, fencingToken: { increment: 1 } } });
    if (!acquired.count) throw new Error("EXECUTOR_BUSY");
    await tx.automationPlan.create({ data: { id: planId, scenarioVersionId: version?.id ?? null, schemaVersion: plan.schemaVersion, documentJson: JSON.stringify(plan), fingerprint: plan.fingerprint } });
    await tx.automationRun.create({ data: { id: runId, planId, scenarioId: input.scenarioId, ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}), title: input.title?.trim().slice(0, 160) || scenario?.title || input.scenarioId, status: "running", startedAt: now, ownerInstanceId: INSTANCE, stages: { create: plan.stages.map((stage, orderIndex) => ({ id: randomUUID(), stageId: stage.stageId, actionId: stage.actionId, orderIndex, documentJson: JSON.stringify(stage), status: "pending" })) } } });
    await tx.automationCommand.upsert({ where: { commandId: input.commandId }, create: { id: randomUUID(), commandId: input.commandId, kind: "start", payloadHash, runId }, update: { runId } });
    await tx.automationRunEvent.create({ data: { id: randomUUID(), runId, sequence: 1, type: "run.started", payloadJson: JSON.stringify({ scenarioId: input.scenarioId, planFingerprint: plan.fingerprint }) } });
  }, { maxWait: 15_000, timeout: 30_000 });
  if (input.inputs.assetId) await addAssetReference(input.inputs.assetId, "run", runId);
  const controller = new AbortController(); active.set(runId, controller);
  void executeRun(runId, plan, input.inputs, controller).catch((error) => console.error("[automation] executor escaped its error boundary", error));
  return getAutomationRun(runId);
}

async function resolveBindings(runId: string, stageIndex: number, plan: AutomationPlanDocument) {
  const stage = plan.stages[stageIndex];
  const resolved: Record<string, unknown> = {};
  for (const binding of stage.inputBindings) {
    if (binding.port === "order") continue;
    if (binding.from.startsWith("external:")) {
      const key = binding.from.slice("external:".length);
      resolved[binding.name] = key === "audioRange" ? plan.externalInputs.audioRange : plan.externalInputs[key as keyof AutomationExternalInputs];
      continue;
    }
    const priorStageId = binding.from.slice("stage:".length);
    const prior = await db.automationStageExecution.findUnique({ where: { runId_stageId: { runId, stageId: priorStageId } } });
    if (!prior?.successfulAttemptId) continue;
    const source = plan.stages.find((item) => item.stageId === priorStageId);
    const outputPort = binding.port ?? "result";
    const outputDefinitions = source?.outputDefinitions ?? [];
    const candidates = filterStageOutputArtifacts(
      await db.automationArtifact.findMany({ where: { stageExecutionId: prior.id, attemptId: prior.successfulAttemptId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      outputDefinitions,
      outputPort,
    );
    const transition = plan.searchContext.searchMode === "transition";
    const artifact = source ? chooseBoundArtifact(candidates.map((item) => ({ id: item.id, pass: item.pass, createdAt: item.createdAt, value: item })), binding.name, source.actionId, transition)?.value : candidates[0];
    if (artifact) {
      const payload = await readRunArtifact(artifact.payloadRef);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || (payload as { schemaVersion?: unknown }).schemaVersion !== 1 || !("data" in payload)) {
        throw new Error(`Input artifact ${artifact.id} failed Automation artifact schema validation.`);
      }
      resolved[binding.name] = { ...(payload as Record<string, unknown>), artifactId: artifact.id };
    }
  }
  return resolved;
}

async function executeRun(runId: string, plan: AutomationPlanDocument, inputs: AutomationExternalInputs, controller: AbortController) {
  try {
    for (let index = 0; index < plan.stages.length; index++) {
      if (controller.signal.aborted) break;
      const runState = await db.automationRun.findUnique({ where: { id: runId }, select: { stopRequestedAt: true } });
      if (runState?.stopRequestedAt) break;
      const definition = plan.stages[index];
      const execution = await db.automationStageExecution.findUnique({ where: { runId_stageId: { runId, stageId: definition.stageId } } });
      if (!execution || execution.status === "succeeded") continue;
      const attemptNumber = await db.automationAttempt.count({ where: { stageExecutionId: execution.id } }) + 1;
      const attemptId = randomUUID();
      const executionStartedAt = Date.now();
      const resolvedInputs = await resolveBindings(runId, index, plan);
      const priorCheckpointRows = await db.automationArtifact.findMany({ where: { stageExecutionId: execution.id, kind: "automation-node-checkpoint" }, orderBy: { createdAt: "asc" } });
      const checkpointPairs = (await Promise.all(priorCheckpointRows.map(async (row) => ({ row, payload: await readRunArtifact(row.payloadRef) as AutomationArtifactPayload | null }))));
      const priorNodeCheckpoints = checkpointPairs.map((pair) => pair.payload?.data).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
      const checkpointByNode = new Map(checkpointPairs.flatMap((pair) => pair.payload?.data && typeof pair.payload.data === "object" && typeof (pair.payload.data as Record<string, unknown>).nodeKey === "string" ? [[(pair.payload.data as Record<string, unknown>).nodeKey as string, pair.row] as const] : []));
      const started = await db.$transaction(async (tx) => {
        const currentRun = await tx.automationRun.findUnique({ where: { id: runId }, select: { stopRequestedAt: true } });
        if (currentRun?.stopRequestedAt) return false;
        await tx.automationStageExecution.update({ where: { id: execution.id }, data: { status: "running", latestAttemptId: attemptId, resolvedInputRefsJson: JSON.stringify([]) } });
        await tx.automationRun.update({ where: { id: runId }, data: { currentStageId: definition.stageId, status: "running" } });
        await tx.automationAttempt.create({ data: { id: attemptId, stageExecutionId: execution.id, attemptNumber, status: "running", effectiveConfigJson: JSON.stringify(definition.settings.effective), inputFingerprint: hash({ resolvedInputs, inputs, actionId: definition.actionId }) } });
        return true;
      }, { maxWait: 10_000, timeout: 15_000 });
      if (!started) break;
      await appendEvent(runId, "stage.started", { actionId: definition.actionId }, definition.stageId, attemptId);
      try {
        const result = await executeAutomationAction(definition, { runId, stageId: definition.stageId, attemptId, signal: controller.signal, inputs, settings: { ...plan.searchContext, ...definition.settings.effective }, resolvedInputs, priorNodeCheckpoints, persistNodeCheckpoint: async (checkpoint) => {
          const checkpointId = typeof checkpoint.nodeKey === "string" ? checkpoint.nodeKey : "unknown";
          const existing = checkpointByNode.get(checkpointId);
          const id = existing?.id ?? createArtifactId();
          const payload: AutomationArtifactPayload = { schemaVersion: 1, kind: "automation-node-checkpoint", actionId: definition.actionId, effectiveSettings: definition.settings.effective, inputRefs: [], sourceAssetRefs: inputs.assetId ? [inputs.assetId] : [], segmentRefs: [], validity: checkpoint.status === "succeeded" ? "valid" : "partial", warnings: [], data: checkpoint };
          const file = await writeRunArtifact(runId, id, payload);
          if (existing) await db.automationArtifact.update({ where: { id }, data: { payloadRef: file.storageRef, checksum: file.checksum, validity: payload.validity, warningsJson: "[]", attemptId } });
          else {
            await db.automationArtifact.create({ data: { id, schemaVersion: 1, kind: payload.kind, runId, stageExecutionId: execution.id, attemptId, actionId: definition.actionId, modelBindingJson: "{}", effectiveSettingsJson: JSON.stringify(payload.effectiveSettings), inputRefsJson: "[]", sourceAssetRefsJson: JSON.stringify(payload.sourceAssetRefs), segmentRefsJson: "[]", validity: payload.validity, warningsJson: "[]", payloadRef: file.storageRef, checksum: file.checksum } });
            const row = await db.automationArtifact.findUniqueOrThrow({ where: { id } });
            checkpointByNode.set(checkpointId, row);
          }
          const currentAttempt = await db.automationAttempt.findUnique({ where: { id: attemptId }, select: { partialArtifactRefsJson: true } });
          const partialRefs = json(currentAttempt?.partialArtifactRefsJson);
          const refs = Array.isArray(partialRefs) ? partialRefs.filter((item): item is string => typeof item === "string") : [];
          if (!refs.includes(id)) await db.automationAttempt.update({ where: { id: attemptId }, data: { partialArtifactRefsJson: JSON.stringify([...refs, id]) } });
        }, onProgress: async (progress) => { await appendEvent(runId, "stage.progress", progress, definition.stageId, attemptId); } });
        if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
        const refs: string[] = [];
        for (const item of result.artifacts) {
          const artifactId = createArtifactId();
          const inputRefs = [...new Set(Object.values(resolvedInputs).flatMap((value) => value && typeof value === "object" && typeof (value as { artifactId?: unknown }).artifactId === "string" ? [(value as { artifactId: string }).artifactId] : []))];
          const payload: AutomationArtifactPayload = { schemaVersion: 1, kind: item.kind, actionId: definition.actionId, ...(item.bankId ? { bankId: item.bankId } : {}), ...(item.modality ? { modality: item.modality } : {}), ...(item.pass ? { pass: item.pass } : {}), ...(item.modelBinding ? { modelBinding: item.modelBinding } : {}), effectiveSettings: item.effectiveSettings ?? definition.settings.effective, inputRefs, sourceAssetRefs: inputs.assetId ? [inputs.assetId] : [], ...(inputs.audioRange ? { audioRange: inputs.audioRange } : {}), segmentRefs: item.segmentRefs ?? [], validity: item.validity ?? "valid", warnings: item.warnings ?? result.warnings ?? [], data: item.data };
          const file = await writeRunArtifact(runId, artifactId, payload);
          await db.automationArtifact.create({ data: { id: artifactId, schemaVersion: 1, kind: payload.kind, runId, stageExecutionId: execution.id, attemptId, actionId: definition.actionId, bankId: payload.bankId ?? null, modality: payload.modality ?? null, pass: payload.pass ?? null, modelBindingJson: JSON.stringify(payload.modelBinding ?? {}), effectiveSettingsJson: JSON.stringify(payload.effectiveSettings), inputRefsJson: JSON.stringify(payload.inputRefs), sourceAssetRefsJson: JSON.stringify(payload.sourceAssetRefs), audioRangeJson: payload.audioRange ? JSON.stringify(payload.audioRange) : null, segmentRefsJson: JSON.stringify(payload.segmentRefs), validity: payload.validity, warningsJson: JSON.stringify(payload.warnings), payloadRef: file.storageRef, checksum: file.checksum } });
          refs.push(artifactId);
        }
        await db.$transaction([
          db.automationAttempt.update({ where: { id: attemptId }, data: { status: "succeeded", finishedAt: new Date(), outputArtifactRefsJson: JSON.stringify(refs), metricsJson: JSON.stringify({ ...(result.metrics ?? {}), metricClass: definition.settings.effective.metricClass ?? null, wallDurationMs: Date.now() - executionStartedAt, workUnits: ["audio.clap.resolved", "spec.siglip.resolved", "audio.extract_acoustics", "audio.analyze"].includes(definition.actionId) ? Math.max(1, Number(plan.previewEstimates.segmentCount ?? 1)) : definition.actionId === "audio.gemma.awtd" || definition.actionId === "audio.gemma.resolved" ? Math.max(1, Math.ceil((inputs.audioRange?.durationSeconds ?? 1) / 20)) : definition.actionId.startsWith("text.") && plan.searchContext.searchMode === "transition" ? 2 : 1, inputDurationSeconds: inputs.audioRange?.durationSeconds ?? null, effectiveTopK: plan.budgetPolicies.topK ?? null, segmentCount: inputs.audioRange ? plan.previewEstimates.segmentCount ?? null : null }) } }),
          db.automationStageExecution.update({ where: { id: execution.id }, data: { status: "succeeded", successfulAttemptId: attemptId, outputArtifactRefsJson: JSON.stringify(refs) } }),
        ]);
        await appendEvent(runId, "stage.succeeded", { artifactIds: refs, completionSource: result.completionSource ?? "computed" }, definition.stageId, attemptId);
      } catch (error) {
        const stopState = await db.automationRun.findUnique({ where: { id: runId }, select: { stopRequestedAt: true } });
        const stopped = controller.signal.aborted || Boolean(stopState?.stopRequestedAt) || (error instanceof Error && error.name === "AbortError");
        const continueAfterFailure = !stopped && definition.failurePolicy === "continue";
        const message = error instanceof Error ? error.message : String(error);
        await db.$transaction([
          db.automationAttempt.update({ where: { id: attemptId }, data: { status: stopped ? "cancelled" : "failed", finishedAt: new Date(), errorJson: JSON.stringify({ message }), cancelReason: stopped ? "user_stop" : null, metricsJson: JSON.stringify({ metricClass: definition.settings.effective.metricClass ?? null, wallDurationMs: Date.now() - executionStartedAt, workUnits: ["audio.clap.resolved", "spec.siglip.resolved", "audio.extract_acoustics", "audio.analyze"].includes(definition.actionId) ? Math.max(1, Number(plan.previewEstimates.segmentCount ?? 1)) : definition.actionId === "audio.gemma.awtd" || definition.actionId === "audio.gemma.resolved" ? Math.max(1, Math.ceil((inputs.audioRange?.durationSeconds ?? 1) / 20)) : definition.actionId.startsWith("text.") && plan.searchContext.searchMode === "transition" ? 2 : 1, inputDurationSeconds: inputs.audioRange?.durationSeconds ?? null, segmentCount: inputs.audioRange ? plan.previewEstimates.segmentCount ?? null : null }) } }),
          db.automationStageExecution.update({ where: { id: execution.id }, data: { status: stopped ? "cancelled" : "failed" } }),
          db.automationRun.update({ where: { id: runId }, data: { status: stopped ? "stopped" : continueAfterFailure ? "running" : "failed", finishedAt: stopped || !continueAfterFailure ? new Date() : null, currentStageId: null, lastErrorSummary: continueAfterFailure ? null : message } }),
        ]);
        await appendEvent(runId, stopped ? "stage.cancelled" : "stage.failed", { message }, definition.stageId, attemptId);
        if (!stopped && !continueAfterFailure) await appendEvent(runId, "run.failed", { message, failedStageId: definition.stageId }, definition.stageId, attemptId);
        if (!stopped && definition.failurePolicy === "continue") continue;
        return;
      }
    }
    const run = await db.automationRun.findUnique({ where: { id: runId } });
    const stopped = controller.signal.aborted || Boolean(run?.stopRequestedAt);
    if (run?.status !== "failed") await db.automationRun.update({ where: { id: runId }, data: { status: stopped ? "stopped" : "finished", finishedAt: new Date(), currentStageId: null } });
    await appendEvent(runId, stopped ? "run.stopped" : "run.finished", {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const run = await db.automationRun.findUnique({ where: { id: runId }, select: { stopRequestedAt: true } }).catch(() => null);
    const stopped = controller.signal.aborted || Boolean(run?.stopRequestedAt) || (error instanceof Error && error.name === "AbortError");
    const executions = await db.automationStageExecution.findMany({ where: { runId, status: "running" }, select: { id: true, stageId: true, latestAttemptId: true } }).catch(() => []);
    try {
      const executionIds = executions.map((execution) => execution.id);
      await db.$transaction([
        ...(executionIds.length ? [db.automationAttempt.updateMany({ where: { stageExecutionId: { in: executionIds }, status: "running" }, data: { status: stopped ? "cancelled" : "failed", finishedAt: new Date(), errorJson: JSON.stringify({ message }), cancelReason: stopped ? "user_stop" : null } })] : []),
        db.automationStageExecution.updateMany({ where: { runId, status: "running" }, data: { status: stopped ? "cancelled" : "failed" } }),
        db.automationRun.update({ where: { id: runId }, data: { status: stopped ? "stopped" : "failed", finishedAt: new Date(), currentStageId: null, lastErrorSummary: message } }),
      ]);
      for (const execution of executions) await appendEvent(runId, stopped ? "stage.cancelled" : "stage.failed", { message, source: "executor_boundary" }, execution.stageId, execution.latestAttemptId ?? undefined);
      await appendEvent(runId, stopped ? "run.stopped" : "run.failed", { message, source: "executor_boundary" });
    } catch (recoveryError) {
      console.error("[automation] failed to persist executor error state", recoveryError);
    }
  } finally {
    active.delete(runId);
    await db.automationExecutorLock.updateMany({ where: { id: "application", activeRunId: runId }, data: { activeRunId: null, ownerInstanceId: null } });
  }
}

export async function stopAutomation(runId: string, commandId: string) {
  await initializeAutomation();
  const run = await db.automationRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("Run not found.");
  if (["finished", "failed", "stopped", "interrupted"].includes(run.status)) return getAutomationRun(runId);
  await db.automationRun.update({ where: { id: runId }, data: { status: "stopping", stopRequestedAt: new Date(), stopReason: "user_request" } });
  await appendEvent(runId, "run.stop_requested", { commandId });
  active.get(runId)?.abort();
  return getAutomationRun(runId);
}

export async function deleteAutomationRun(runId: string, commandId: string) {
  await initializeAutomation();
  if (!/^[\w:-]{8,160}$/u.test(commandId)) throw new Error("A stable commandId is required.");
  const payloadHash = hash({ runId });
  const previousCommand = await db.automationCommand.findUnique({ where: { commandId } });
  if (previousCommand) {
    if (previousCommand.kind !== "delete" || previousCommand.payloadHash !== payloadHash) throw new Error("COMMAND_ID_PAYLOAD_MISMATCH");
    return (json(previousCommand.responseJson) as { deleted: boolean; alreadyDeleted?: boolean } | null) ?? { deleted: true, alreadyDeleted: true };
  }
  const run = await db.automationRun.findUnique({ where: { id: runId }, select: { id: true, planId: true, status: true } });
  if (!run) throw new Error("Run not found.");
  if (["preparing", "running", "stopping", "deleting"].includes(run.status)) throw new Error("Stop and refresh this run before deleting it.");
  const artifactIds = (await db.automationArtifact.findMany({ where: { runId }, select: { id: true } })).map((artifact) => artifact.id);
  if (artifactIds.length) {
    const sharedReferences = await db.automationArtifactReference.findMany({ where: { artifactId: { in: artifactIds }, NOT: { ownerType: "run", ownerId: runId } }, select: { ownerType: true, ownerId: true }, take: 1 });
    if (sharedReferences.length) throw new Error("This run has artifacts referenced by another owner. Remove or transfer those references before deleting the run.");
  }
  const marked = await db.automationRun.updateMany({ where: { id: runId, status: run.status }, data: { status: "deleting" } });
  if (!marked.count) throw new Error("Run changed while deletion was starting. Refresh and retry.");
  let trashPath: string | null = null;
  try {
    trashPath = await moveRunToTrash(runId);
    const result = { deleted: true };
    await db.$transaction(async (tx) => {
      const artifacts = await tx.automationArtifact.findMany({ where: { runId }, select: { id: true } });
      if (artifacts.length) await tx.automationArtifactReference.deleteMany({ where: { artifactId: { in: artifacts.map((artifact) => artifact.id) }, ownerType: "run", ownerId: runId } });
      await tx.automationAssetReference.deleteMany({ where: { ownerType: "run", ownerId: runId } });
      await tx.automationRun.delete({ where: { id: runId } });
      await tx.automationPlan.delete({ where: { id: run.planId } });
      await tx.automationExecutorLock.updateMany({ where: { id: "application", activeRunId: runId }, data: { activeRunId: null, ownerInstanceId: null } });
      await tx.automationCommand.create({ data: { id: randomUUID(), commandId, kind: "delete", payloadHash, runId, responseJson: JSON.stringify(result) } });
    }, { maxWait: 15_000, timeout: 30_000 });
    if (trashPath) await purgeTrashedRun(trashPath).catch(() => undefined);
    return result;
  } catch (error) {
    if (trashPath) await restoreRunDirectory(runId, trashPath).catch(() => undefined);
    await db.automationRun.updateMany({ where: { id: runId, status: "deleting" }, data: { status: "deletion-failed", lastErrorSummary: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
    throw error;
  }
}

export type FailedNodeAction =
  | { kind: "reuse_saved_response"; nodeId: string }
  | { kind: "retry_failed_node"; nodeId: string; reason: string };

async function prepareFailedNodeAction(runId: string, run: { stages: Array<{ id: string; stageId: string; status: string }> }, plan: AutomationPlanDocument, action: FailedNodeAction) {
  const failedExecution = run.stages.find((stage) => stage.status === "failed");
  if (!failedExecution) throw new Error("This Run has no failed stage to recover.");
  const definition = plan.stages.find((stage) => stage.stageId === failedExecution.stageId);
  if (definition?.actionId !== "text_features.reverse_query") throw new Error("The explicit node recovery action is limited to a failed Reverse Query stage.");
  const checkpointRows = await db.automationArtifact.findMany({ where: { runId, stageExecutionId: failedExecution.id, kind: "automation-node-checkpoint" }, orderBy: { createdAt: "asc" } });
  const checkpointPairs = await Promise.all(checkpointRows.map(async (row) => ({ row, payload: await readRunArtifact(row.payloadRef) as AutomationArtifactPayload })));
  const match = checkpointPairs.filter(({ payload }) => {
    const data = payload?.data as Record<string, unknown> | undefined;
    return data?.segmentId === action.nodeId && data?.status === "failed" && data?.nodeKey === `text_features.reverse_query:${action.nodeId}`;
  }).slice(-1)[0];
  if (!match) throw new Error(`Failed Reverse Query node '${action.nodeId}' was not found in the saved stage checkpoints.`);
  const checkpoint = match.payload.data as Record<string, unknown>;
  const diagnostics = checkpoint.requestDiagnostics as Record<string, unknown> | undefined;
  const inputArtifactId = typeof diagnostics?.inputArtifactId === "string" ? diagnostics.inputArtifactId : "";
  if (!inputArtifactId) throw new Error(`Saved input snapshot reference is missing for ${action.nodeId}; cannot verify the node inputs.`);
  const inputArtifact = await db.automationArtifact.findUnique({ where: { id: inputArtifactId } });
  if (!inputArtifact || inputArtifact.runId !== runId) throw new Error(`Saved input snapshot ${inputArtifactId} is missing or belongs to another Run.`);
  const inputPayload = await readRunArtifact(inputArtifact.payloadRef) as AutomationArtifactPayload;
  const snapshot = (inputPayload.data as { segments?: Array<{ id: string; snapshot: unknown }> } | undefined)?.segments?.find((item) => item.id === action.nodeId)?.snapshot;
  if (!snapshot) throw new Error(`Saved node-specific input snapshot for ${action.nodeId} is missing.`);
  const resolvedInputs = await resolveBindings(runId, plan.stages.indexOf(definition), plan);
  const boundBrief = resolvedInputs.brief as { data?: unknown } | undefined;
  const briefData = boundBrief?.data as { text?: unknown; query_en?: unknown; reverse_query?: { query_en?: unknown } } | undefined;
  const derivedBrief = typeof briefData?.text === "string" ? briefData.text : typeof briefData?.query_en === "string" ? briefData.query_en : typeof briefData?.reverse_query?.query_en === "string" ? briefData.reverse_query.query_en : "";
  const payload = { snapshot, brief: plan.externalInputs.brief?.trim() || derivedBrief };
  const inputFingerprint = hash({ actionId: "text_features.reverse_query", payload, promptRouteVersion: REVERSE_QUERY_PROMPT_VERSION });
  const data = action.kind === "reuse_saved_response"
    ? acceptSavedReverseQueryResponse(checkpoint as Parameters<typeof acceptSavedReverseQueryResponse>[0], inputFingerprint)
    : beginNodeRetryCycle(checkpoint as Parameters<typeof beginNodeRetryCycle>[0], inputFingerprint, action.reason);
  const dataRecord = data as Record<string, unknown>;
  const savedResult = dataRecord.result as { reverse_query?: { warnings?: string[] } } | undefined;
  const id = createArtifactId();
  const artifactPayload: AutomationArtifactPayload = {
    ...match.payload,
    validity: dataRecord.status === "succeeded" ? "valid" : "partial",
    warnings: dataRecord.status === "succeeded" ? savedResult?.reverse_query?.warnings ?? [] : [],
    data,
  };
  return { id, executionId: failedExecution.id, definition, sourceRow: match.row, artifactPayload, data };
}

export async function continueAutomation(runId: string, commandId: string, nodeAction?: FailedNodeAction) {
  await initializeAutomation();
  const run = await db.automationRun.findUnique({ where: { id: runId }, include: { plan: true, stages: { orderBy: { orderIndex: "asc" } } } });
  if (!run || !["failed", "stopped", "interrupted"].includes(run.status)) throw new Error("Only a stopped, failed, or interrupted run can continue.");
  if (!/^[\w:-]{8,160}$/u.test(commandId)) throw new Error("A stable commandId is required.");
  const payloadHash = hash({ runId, nodeAction: nodeAction ?? null });
  const prior = await db.automationCommand.findUnique({ where: { commandId } });
  if (prior) { if (prior.payloadHash !== payloadHash) throw new Error("COMMAND_ID_PAYLOAD_MISMATCH"); return getAutomationRun(runId); }
  const plan = JSON.parse(run.plan.documentJson) as AutomationPlanDocument;
  const preparedNodeAction = nodeAction ? await prepareFailedNodeAction(runId, run, plan, nodeAction) : null;
  if (!nodeAction) {
    const failedExecution = run.stages.find((stage) => stage.status === "failed");
    const definition = failedExecution && plan.stages.find((stage) => stage.stageId === failedExecution.stageId);
    if (failedExecution && definition?.actionId === "text_features.reverse_query") {
      const checkpoints = await db.automationArtifact.findMany({ where: { runId, stageExecutionId: failedExecution.id, kind: "automation-node-checkpoint" }, orderBy: { createdAt: "asc" } });
      for (const artifact of checkpoints) {
        const saved = await readRunArtifact(artifact.payloadRef) as AutomationArtifactPayload;
        const data = saved.data as Record<string, unknown> | undefined;
        const cycleAttempts = Number(data?.cycleAttemptsUsed ?? data?.attemptsUsed ?? 0);
        if (data?.status === "failed" && cycleAttempts >= 4) {
          throw new Error(`Continue will reuse saved nodes, but ${String(data.segmentId)} exhausted its 4-attempt cycle. Choose “Use saved response” (no model call) if its saved answer is useful, or “Retry failed node” to confirm a new 4-attempt cycle.`);
        }
      }
    }
  }
  await db.$transaction(async (tx) => {
    const lock = await tx.automationExecutorLock.findUnique({ where: { id: "application" } });
    if (lock?.activeRunId) throw new Error(`EXECUTOR_BUSY:${lock.activeRunId}`);
    const acquired = await tx.automationExecutorLock.updateMany({ where: { id: "application", activeRunId: null }, data: { activeRunId: runId, ownerInstanceId: INSTANCE, acquiredAt: new Date(), fencingToken: { increment: 1 } } });
    if (!acquired.count) throw new Error("EXECUTOR_BUSY");
    await tx.automationRun.update({ where: { id: runId }, data: { status: "running", finishedAt: null, lastErrorSummary: null, stopRequestedAt: null, ownerInstanceId: INSTANCE } });
    const staleExecutions = run.stages.filter((stage) => stage.status === "running").map((stage) => stage.id);
    if (staleExecutions.length) await tx.automationAttempt.updateMany({ where: { stageExecutionId: { in: staleExecutions }, status: "running" }, data: { status: "interrupted", finishedAt: new Date(), errorJson: JSON.stringify({ message: "Attempt resumed after its executor stopped." }) } });
    await tx.automationStageExecution.updateMany({ where: { runId, status: { in: ["failed", "cancelled", "interrupted", "running"] } }, data: { status: "pending" } });
    if (preparedNodeAction) {
      const file = await writeRunArtifact(runId, preparedNodeAction.id, preparedNodeAction.artifactPayload);
      await tx.automationArtifact.create({ data: {
        id: preparedNodeAction.id, schemaVersion: 1, kind: "automation-node-checkpoint", runId,
        stageExecutionId: preparedNodeAction.executionId, attemptId: null, actionId: preparedNodeAction.definition.actionId,
        modelBindingJson: "{}", effectiveSettingsJson: JSON.stringify(preparedNodeAction.definition.settings.effective),
        inputRefsJson: preparedNodeAction.sourceRow.inputRefsJson, sourceAssetRefsJson: preparedNodeAction.sourceRow.sourceAssetRefsJson,
        audioRangeJson: preparedNodeAction.sourceRow.audioRangeJson, segmentRefsJson: preparedNodeAction.sourceRow.segmentRefsJson,
        validity: preparedNodeAction.artifactPayload.validity, warningsJson: JSON.stringify(preparedNodeAction.artifactPayload.warnings),
        payloadRef: file.storageRef, checksum: file.checksum,
      } });
    }
    await tx.automationCommand.create({ data: { id: randomUUID(), commandId, kind: "continue", payloadHash, runId } });
  }, { maxWait: 15_000, timeout: 30_000 });
  const controller = new AbortController(); active.set(runId, controller);
  void executeRun(runId, plan, plan.externalInputs, controller).catch((error) => console.error("[automation] executor escaped its error boundary", error));
  if (preparedNodeAction) {
    const recoveryData = preparedNodeAction.data as Record<string, unknown>;
    await appendEvent(runId, nodeAction?.kind === "reuse_saved_response" ? "node.saved_response_reused" : "node.retry_cycle_started", {
      nodeId: nodeAction?.nodeId,
      retryReason: nodeAction?.kind === "retry_failed_node" ? nodeAction.reason : undefined,
      metadata: recoveryData.acceptedSavedResponse ?? recoveryData.currentRetryCycle,
    }, preparedNodeAction.definition.stageId);
  }
  await appendEvent(runId, "run.continued", { commandId });
  return getAutomationRun(runId);
}

export async function getAutomationRun(runId: string) {
  const run = await db.automationRun.findUnique({ where: { id: runId }, include: { plan: true, stages: { orderBy: { orderIndex: "asc" }, include: { attempts: { orderBy: { attemptNumber: "desc" } }, artifacts: { orderBy: { createdAt: "desc" } } } }, events: { orderBy: { sequence: "asc" } } } });
  if (!run) return null;
  const plan = JSON.parse(run.plan.documentJson) as AutomationPlanDocument;
  return { id: run.id, title: run.title, status: run.status, scenarioId: run.scenarioId, plan, createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt, currentStageId: run.currentStageId, lastErrorSummary: run.lastErrorSummary, stages: await Promise.all(run.stages.map(async (stage) => ({ id: stage.id, stageId: stage.stageId, actionId: stage.actionId, status: stage.status, successfulAttemptId: stage.successfulAttemptId, orderIndex: stage.orderIndex, definition: json(stage.documentJson), attempts: stage.attempts.map((attempt) => ({ id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status, startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, error: json(attempt.errorJson), metrics: json(attempt.metricsJson) })), nodeCheckpoints: await Promise.all(stage.artifacts.filter((artifact) => artifact.kind === "automation-node-checkpoint").map(async (artifact) => ({ id: artifact.id, payload: await readRunArtifact(artifact.payloadRef) }))), artifacts: await Promise.all(stage.artifacts.filter((artifact) => artifact.kind !== "automation-node-checkpoint").map(async (artifact) => ({ id: artifact.id, attemptId: artifact.attemptId, kind: artifact.kind, bankId: artifact.bankId, modality: artifact.modality, pass: artifact.pass, createdAt: artifact.createdAt, validity: artifact.validity, warnings: json(artifact.warningsJson), payload: await readRunArtifact(artifact.payloadRef) }))) }))), events: run.events.map((event) => ({ sequence: event.sequence, type: event.type, stageId: event.stageId, attemptId: event.attemptId, occurredAt: event.occurredAt, payload: json(event.payloadJson) })) };
}

export async function listAutomationRuns(filters: { status?: string; scenarioId?: string; query?: string; createdAfter?: string; createdBefore?: string; limit?: number } = {}) {
  await initializeAutomation();
  const createdAt = { ...(filters.createdAfter && Number.isFinite(Date.parse(filters.createdAfter)) ? { gte: new Date(filters.createdAfter) } : {}), ...(filters.createdBefore && Number.isFinite(Date.parse(filters.createdBefore)) ? { lte: new Date(filters.createdBefore) } : {}) };
  const rows = await db.automationRun.findMany({ where: { ...(filters.status ? { status: filters.status } : {}), ...(filters.scenarioId ? { scenarioId: filters.scenarioId } : {}), ...(filters.query?.trim() ? { title: { contains: filters.query.trim().slice(0, 120) } } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) }, orderBy: { createdAt: "desc" }, take: Math.max(1, Math.min(100, filters.limit ?? 30)), include: { _count: { select: { stages: true } }, stages: { select: { stageId: true, actionId: true, orderIndex: true } } } });
  return rows.map(({ _count, stages, id, title, status, scenarioId, createdAt, finishedAt, lastErrorSummary, currentStageId }) => { const current = stages.find((stage) => stage.stageId === currentStageId); return { id, title, status, scenarioId, createdAt, finishedAt, lastErrorSummary, currentStageId, currentActionId: current?.actionId ?? null, currentStageNumber: current ? current.orderIndex + 1 : null, stageCount: _count.stages }; });
}
