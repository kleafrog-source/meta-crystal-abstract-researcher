-- CreateTable
CREATE TABLE "AutomationScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "origin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "currentVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AutomationScenarioVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definitionJson" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "sourceVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationScenarioVersion_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutomationScenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioVersionId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "documentJson" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationPlan_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "AutomationScenarioVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "parentRunId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "currentStageId" TEXT,
    "stopRequestedAt" DATETIME,
    "stopReason" TEXT,
    "lastErrorSummary" TEXT,
    "resultAssessmentJson" TEXT,
    "resultAssessmentVersion" TEXT,
    "ownerInstanceId" TEXT,
    CONSTRAINT "AutomationRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AutomationPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AutomationRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutomationScenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AutomationRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationStageExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "documentJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latestAttemptId" TEXT,
    "successfulAttemptId" TEXT,
    "resolvedInputRefsJson" TEXT,
    "outputArtifactRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationStageExecution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageExecutionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "effectiveConfigJson" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "outputArtifactRefsJson" TEXT,
    "partialArtifactRefsJson" TEXT,
    "errorJson" TEXT,
    "cancelReason" TEXT,
    "metricsJson" TEXT,
    CONSTRAINT "AutomationAttempt_stageExecutionId_fkey" FOREIGN KEY ("stageExecutionId") REFERENCES "AutomationStageExecution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stageExecutionId" TEXT,
    "attemptId" TEXT,
    "actionId" TEXT NOT NULL,
    "bankId" TEXT,
    "modality" TEXT,
    "pass" TEXT,
    "modelBindingJson" TEXT,
    "effectiveSettingsJson" TEXT NOT NULL,
    "inputRefsJson" TEXT NOT NULL,
    "sourceAssetRefsJson" TEXT NOT NULL,
    "audioRangeJson" TEXT,
    "segmentRefsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validity" TEXT NOT NULL,
    "warningsJson" TEXT NOT NULL,
    "payloadRef" TEXT NOT NULL,
    "checksum" TEXT,
    CONSTRAINT "AutomationArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutomationArtifact_stageExecutionId_fkey" FOREIGN KEY ("stageExecutionId") REFERENCES "AutomationStageExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationArtifact_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AutomationAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" REAL,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availabilityStatus" TEXT NOT NULL DEFAULT 'available'
);

-- CreateTable
CREATE TABLE "AutomationAssetReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationAssetReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AutomationAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationArtifactReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationArtifactReference_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AutomationArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "runId" TEXT,
    "responseJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AutomationRunEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "stageId" TEXT,
    "attemptId" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT NOT NULL,
    CONSTRAINT "AutomationRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationExecutorLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activeRunId" TEXT,
    "ownerInstanceId" TEXT,
    "fencingToken" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AutomationScenario_origin_archivedAt_idx" ON "AutomationScenario"("origin", "archivedAt");

-- CreateIndex
CREATE INDEX "AutomationScenario_updatedAt_idx" ON "AutomationScenario"("updatedAt");

-- CreateIndex
CREATE INDEX "AutomationScenarioVersion_definitionHash_idx" ON "AutomationScenarioVersion"("definitionHash");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationScenarioVersion_scenarioId_version_key" ON "AutomationScenarioVersion"("scenarioId", "version");

-- CreateIndex
CREATE INDEX "AutomationPlan_fingerprint_idx" ON "AutomationPlan"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_planId_key" ON "AutomationRun"("planId");

-- CreateIndex
CREATE INDEX "AutomationRun_status_updatedAt_idx" ON "AutomationRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_scenarioId_createdAt_idx" ON "AutomationRun"("scenarioId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_parentRunId_idx" ON "AutomationRun"("parentRunId");

-- CreateIndex
CREATE INDEX "AutomationStageExecution_runId_orderIndex_idx" ON "AutomationStageExecution"("runId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStageExecution_runId_stageId_key" ON "AutomationStageExecution"("runId", "stageId");

-- CreateIndex
CREATE INDEX "AutomationAttempt_status_startedAt_idx" ON "AutomationAttempt"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationAttempt_stageExecutionId_attemptNumber_key" ON "AutomationAttempt"("stageExecutionId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AutomationArtifact_runId_createdAt_idx" ON "AutomationArtifact"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationArtifact_stageExecutionId_idx" ON "AutomationArtifact"("stageExecutionId");

-- CreateIndex
CREATE INDEX "AutomationArtifact_attemptId_idx" ON "AutomationArtifact"("attemptId");

-- CreateIndex
CREATE INDEX "AutomationArtifact_kind_idx" ON "AutomationArtifact"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationAsset_contentHash_key" ON "AutomationAsset"("contentHash");

-- CreateIndex
CREATE INDEX "AutomationAsset_createdAt_idx" ON "AutomationAsset"("createdAt");

-- CreateIndex
CREATE INDEX "AutomationAsset_availabilityStatus_idx" ON "AutomationAsset"("availabilityStatus");

-- CreateIndex
CREATE INDEX "AutomationAssetReference_ownerType_ownerId_idx" ON "AutomationAssetReference"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationAssetReference_assetId_ownerType_ownerId_key" ON "AutomationAssetReference"("assetId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "AutomationArtifactReference_ownerType_ownerId_idx" ON "AutomationArtifactReference"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationArtifactReference_artifactId_ownerType_ownerId_key" ON "AutomationArtifactReference"("artifactId", "ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationCommand_commandId_key" ON "AutomationCommand"("commandId");

-- CreateIndex
CREATE INDEX "AutomationCommand_runId_kind_idx" ON "AutomationCommand"("runId", "kind");

-- CreateIndex
CREATE INDEX "AutomationCommand_createdAt_idx" ON "AutomationCommand"("createdAt");

-- CreateIndex
CREATE INDEX "AutomationRunEvent_runId_occurredAt_idx" ON "AutomationRunEvent"("runId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRunEvent_runId_sequence_key" ON "AutomationRunEvent"("runId", "sequence");
