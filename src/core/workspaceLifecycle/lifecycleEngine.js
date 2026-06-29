import { parseManifest, ENGINE_VERSION } from './manifestParser.js';
import { getDatasetHandler } from './datasetRegistry.js';
import { prisma } from '../config/prisma.js';
import { broadcastToWorkspace } from '../../services/socketService.js';
import { ValidationError } from '../errors/index.js';
import {
  stageValidate, stageNormalize, stageResolveRelationships,
  stageBootstrapWorkspace, stageGenerateGraphs, stageIngestMemory,
  stageVectorize, stageRefreshRecommendations, stageRefreshBriefings, stageWarmCopilot,
} from './pipelineStages.js';

const OPERATION_STAGES = {
  CREATE:   [stageValidate, stageNormalize, stageResolveRelationships, stageBootstrapWorkspace, stageGenerateGraphs, stageIngestMemory, stageVectorize, stageRefreshRecommendations, stageRefreshBriefings, stageWarmCopilot],
  IMPORT:   [stageValidate, stageNormalize, stageResolveRelationships, stageBootstrapWorkspace, stageGenerateGraphs, stageIngestMemory, stageVectorize, stageRefreshRecommendations, stageRefreshBriefings],
  SYNC:     [stageValidate, stageNormalize, stageResolveRelationships, stageGenerateGraphs, stageIngestMemory, stageVectorize, stageRefreshRecommendations],
  REFRESH:  [stageGenerateGraphs, stageRefreshRecommendations, stageRefreshBriefings, stageWarmCopilot],
  VALIDATE: [stageValidate],
};

export async function runLifecycleOperation(operation, workspaceId, { manifest: rawManifest, datasets } = {}) {
  if (!OPERATION_STAGES[operation]) throw new ValidationError(`Unknown lifecycle operation "${operation}"`);
  if (!workspaceId) throw new ValidationError('workspaceId is required');

  const importId = `IMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  // REFRESH has no manifest requirement
  const parsedManifest = operation === 'REFRESH'
    ? { valid: true, errors: [], warnings: [], schemaVersion: '1.0', engineVersion: null, organization: { name: 'workspace', slug: workspaceId }, datasets: [], rawManifest: {} }
    : parseManifest(rawManifest);

  if (!parsedManifest.valid) {
    throw new ValidationError(`Invalid manifest: ${parsedManifest.errors.join('; ')}`);
  }

  // Create durable record before any stage runs
  const record = await prisma.importRecord.create({
    data: {
      importId,
      workspaceId: String(workspaceId),
      operation,
      status: 'RUNNING',
      schemaVersion: parsedManifest.schemaVersion ?? null,
      engineVersion: ENGINE_VERSION,
      startedAt: new Date(),
    },
  });

  broadcastToWorkspace(workspaceId, 'LIFECYCLE_STARTED', { importId, operation });

  const ctx = {
    workspaceId: String(workspaceId),
    orgId: null,
    manifest: parsedManifest,
    datasets: datasets ?? {},
    normalized: {},
    globalIdMap: new Map(),
    resolvedEdges: [],
    workspace: null,
    graphMetrics: { nodes: 0, edges: 0 },
    memoryCount: 0,
    vectorCount: 0,
    operation,
    importId,
    emit(stage, status, message, data = {}) {
      const evType = status === 'started'   ? 'LIFECYCLE_STAGE_STARTED'
                   : status === 'completed' ? 'LIFECYCLE_STAGE_COMPLETED'
                   : 'LIFECYCLE_STAGE_FAILED';
      broadcastToWorkspace(String(workspaceId), evType, { stage, status, message, importId, ...data });
    },
  };

  const stageErrors = [];
  const FATAL_STAGES = new Set(['stageValidate', 'stageBootstrapWorkspace']);

  for (const stageFn of OPERATION_STAGES[operation]) {
    try {
      await stageFn(ctx);
    } catch (err) {
      stageErrors.push({ stage: stageFn.name, error: err.message });
      if (FATAL_STAGES.has(stageFn.name)) break;
    }
  }

  const status = stageErrors.length === 0 ? 'COMPLETED' : 'FAILED';
  const statistics = {
    datasets: Object.entries(datasets ?? {}).map(([type, records]) => ({ type, count: Array.isArray(records) ? records.length : 0 })),
    memoryRecords: ctx.memoryCount,
    vectorChunks: ctx.vectorCount,
  };

  const updated = await prisma.importRecord.update({
    where: { id: record.id },
    data: {
      status,
      orgId: ctx.orgId ?? null,
      statistics,
      errors: stageErrors.length > 0 ? stageErrors : null,
      warnings: parsedManifest.warnings?.length ? parsedManifest.warnings : null,
      graphMetrics: ctx.graphMetrics,
      completedAt: new Date(),
    },
  });

  broadcastToWorkspace(String(workspaceId), status === 'COMPLETED' ? 'LIFECYCLE_COMPLETED' : 'LIFECYCLE_FAILED', {
    importId, operation, status, graphMetrics: ctx.graphMetrics, statistics, errors: stageErrors,
  });

  return updated;
}

export async function validateOnly(workspaceId, { manifest: rawManifest, datasets = {} } = {}) {
  const parsed = parseManifest(rawManifest);
  if (!parsed.valid) {
    return { valid: false, manifestErrors: parsed.errors, perType: {}, brokenReferences: [], warnings: parsed.warnings ?? [] };
  }

  const perType = {};
  const allIds = new Set();

  for (const entry of parsed.datasets) {
    const { type } = entry;
    const handler = getDatasetHandler(type);
    if (!handler) {
      perType[type] = { valid: true, errors: [], warnings: [`Unknown type "${type}" — skipped`] };
      continue;
    }
    const records = datasets[type] ?? [];
    const result = handler.validator(records);
    perType[type] = result;
    for (const rec of records) {
      if (rec.id) allIds.add(String(rec.id));
    }
  }

  // Cross-dataset broken reference check on relationships array
  const brokenRefs = [];
  for (const rel of (datasets.relationships ?? [])) {
    if (rel.sourceId && !allIds.has(String(rel.sourceId))) brokenRefs.push(`Broken ref: sourceId "${rel.sourceId}"`);
    if (rel.targetId && !allIds.has(String(rel.targetId))) brokenRefs.push(`Broken ref: targetId "${rel.targetId}"`);
  }

  const allValid = Object.values(perType).every(r => r.valid) && brokenRefs.length === 0;
  return { valid: allValid, manifestErrors: [], perType, brokenReferences: brokenRefs, warnings: parsed.warnings ?? [] };
}
