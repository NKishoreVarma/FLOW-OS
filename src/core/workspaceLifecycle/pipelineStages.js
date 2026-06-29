import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ValidationError } from '../errors/index.js';
import { getDatasetHandler } from './datasetRegistry.js';
import { saveMemory } from '../../services/orgMemoryService.js';
import { upsertNode, upsertEdge } from '../../services/operationalGraphService.js';
import { registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';
import { upsertVector } from '../../services/retrievalService.js';
import { generateBriefing } from '../../services/briefingEngine.js';
import { answerCopilotQuery } from '../../services/copilotService.js';
import { generateExplainableRecommendations } from '../../services/operationalBrainService.js';

const MEMORY_TYPE_MAP = {
  incidents:        { memType: 'INCIDENT',          titleFn: r => r.title,       bodyFn: r => r.description ?? r.title },
  documents:        { memType: 'KNOWLEDGE_UPDATE',   titleFn: r => r.title,       bodyFn: r => r.content },
  projects:         { memType: 'PROJECT_EVENT',      titleFn: r => r.name,        bodyFn: r => r.description ?? r.name },
  timeline:         { memType: null,                 titleFn: r => r.title,       bodyFn: r => r.description ?? r.title },
  memory:           { memType: null,                 titleFn: r => r.title ?? r.id, bodyFn: r => r.content },
  executive_reports:{ memType: 'KNOWLEDGE_UPDATE',   titleFn: r => r.title,       bodyFn: r => r.content ?? r.summary },
  customers:        { memType: 'PROJECT_EVENT',      titleFn: r => r.name,        bodyFn: r => r.description ?? r.name },
};

const VALID_MEMORY_TYPES = new Set([
  'DECISION', 'INCIDENT', 'PROJECT_EVENT', 'CUSTOMER_EVENT', 'KNOWLEDGE_UPDATE',
]);

export async function stageValidate(ctx) {
  ctx.emit('stageValidate', 'started', 'Validating datasets against registered handlers');
  try {
    const allErrors = {};
    const unknownTypes = [];

    for (const { type } of ctx.manifest.datasets) {
      const handler = getDatasetHandler(type);
      if (!handler) {
        unknownTypes.push(type);
        continue;
      }
      const result = handler.validator(ctx.datasets[type] ?? []);
      if (!result.valid && result.errors.length > 0) {
        allErrors[type] = result.errors;
      }
    }

    if (Object.keys(allErrors).length > 0) {
      const summary = Object.entries(allErrors)
        .map(([t, errs]) => `${t}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(`Validation failed: ${summary}`);
    }

    ctx.emit('stageValidate', 'completed', 'All known datasets passed validation', {
      validatedTypes: ctx.manifest.datasets.filter(d => getDatasetHandler(d.type)).map(d => d.type),
      unknownTypes,
    });
  } catch (err) {
    ctx.emit('stageValidate', 'failed', err.message);
    throw err;
  }
}

export async function stageNormalize(ctx) {
  ctx.emit('stageNormalize', 'started', 'Normalizing raw dataset records');
  try {
    const skipped = [];

    for (const type of Object.keys(ctx.datasets)) {
      const handler = getDatasetHandler(type);
      if (!handler) {
        skipped.push(type);
        continue;
      }
      ctx.normalized[type] = handler.normalizer(ctx.datasets[type] ?? []);
    }

    ctx.emit('stageNormalize', 'completed', 'Normalization complete', {
      normalizedTypes: Object.keys(ctx.normalized),
      skipped,
    });
  } catch (err) {
    ctx.emit('stageNormalize', 'failed', err.message);
    throw err;
  }
}

export async function stageResolveRelationships(ctx) {
  ctx.emit('stageResolveRelationships', 'started', 'Building entity identity map and resolving cross-dataset relationships');
  try {
    ctx.globalIdMap = new Map();
    ctx.resolvedEdges = [];

    for (const type of Object.keys(ctx.normalized)) {
      const handler = getDatasetHandler(type);
      if (!handler) continue;

      const { nodes, edges } = handler.resolver(ctx.normalized[type] ?? [], ctx.globalIdMap);

      for (const node of nodes) {
        ctx.globalIdMap.set(String(node.id), { type: node.type, name: node.name });
      }
      for (const edge of edges) {
        ctx.resolvedEdges.push(edge);
      }
    }

    ctx.emit('stageResolveRelationships', 'completed', 'Entity map and edges resolved', {
      totalEntities: ctx.globalIdMap.size,
      totalEdges: ctx.resolvedEdges.length,
    });
  } catch (err) {
    ctx.emit('stageResolveRelationships', 'failed', err.message);
    throw err;
  }
}

export async function stageBootstrapWorkspace(ctx) {
  ctx.emit('stageBootstrapWorkspace', 'started', 'Upserting organization, workspace, and member accounts');
  try {
    const { name, slug, plan = 'free' } = ctx.manifest.organization;

    const org = await prisma.organization.upsert({
      where: { slug },
      create: { name, slug, plan },
      update: { name, plan },
    });

    const workspace = await prisma.workspace.upsert({
      where: { externalId: ctx.workspaceId },
      create: { name: `${org.name} Workspace`, orgId: org.id, externalId: ctx.workspaceId },
      update: { orgId: org.id },
    });

    ctx.orgId = org.id;
    ctx.workspace = workspace;

    const employees = ctx.normalized.employees ?? [];
    for (const rec of employees) {
      const email = rec.email ?? `${rec.id}@import.local`;
      const role = ['OWNER', 'ADMIN', 'MEMBER'].includes(rec.role?.toUpperCase())
        ? rec.role.toUpperCase()
        : 'MEMBER';
      const passwordHash = await bcrypt.hash('changeme', 10);

      const user = await prisma.user.upsert({
        where: { email },
        create: { email, fullName: rec.name, passwordHash, orgId: org.id, role },
        update: { fullName: rec.name, role },
      });

      await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
        create: { userId: user.id, workspaceId: workspace.id, role: user.role },
        update: { role: user.role },
      });
    }

    ctx.emit('stageBootstrapWorkspace', 'completed', 'Workspace identity bootstrapped', {
      orgId: org.id,
      workspaceDbId: workspace.id,
      usersUpserted: employees.length,
    });
  } catch (err) {
    ctx.emit('stageBootstrapWorkspace', 'failed', err.message);
    throw err;
  }
}

export async function stageGenerateGraphs(ctx) {
  ctx.emit('stageGenerateGraphs', 'started', 'Writing nodes and edges to operational and in-memory graphs');
  try {
    const skippedEdges = [];

    for (const type of Object.keys(ctx.normalized)) {
      const handler = getDatasetHandler(type);
      if (!handler) continue;

      const { nodes, edges } = handler.resolver(ctx.normalized[type] ?? [], ctx.globalIdMap);

      for (const node of nodes) {
        await upsertNode(ctx.workspaceId, ctx.orgId, node.id, node.type, node.name, node.metadata ?? {});
        registerEntity(node.id, node.type, node.name);
        ctx.graphMetrics.nodes++;
      }

      for (const edge of edges) {
        if (!ctx.globalIdMap.has(String(edge.sourceId)) || !ctx.globalIdMap.has(String(edge.targetId))) {
          skippedEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId, reason: 'missing endpoint' });
          continue;
        }
        await upsertEdge(ctx.workspaceId, ctx.orgId, edge.sourceId, edge.targetId, edge.type, edge.weight ?? 1);
        linkEntities(edge.sourceId, edge.targetId, edge.type);
        ctx.graphMetrics.edges++;
      }
    }

    // Pre-resolved cross-dataset edges from stageResolveRelationships — persist them with full context
    for (const edge of (ctx.resolvedEdges ?? [])) {
      if (!ctx.globalIdMap.has(String(edge.sourceId)) || !ctx.globalIdMap.has(String(edge.targetId))) {
        skippedEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId, reason: 'missing endpoint in resolved edges' });
        continue;
      }
      await upsertEdge(ctx.workspaceId, ctx.orgId, edge.sourceId, edge.targetId, edge.type, edge.weight ?? 1);
      linkEntities(edge.sourceId, edge.targetId, edge.type);
      ctx.graphMetrics.edges++;
    }

    ctx.emit('stageGenerateGraphs', 'completed', 'Graph generation complete', {
      nodes: ctx.graphMetrics.nodes,
      edges: ctx.graphMetrics.edges,
      skippedEdges: skippedEdges.length,
    });
  } catch (err) {
    ctx.emit('stageGenerateGraphs', 'failed', err.message);
    throw err;
  }
}

export async function stageIngestMemory(ctx) {
  ctx.emit('stageIngestMemory', 'started', 'Persisting operational memory records');
  try {
    for (const [datasetType, mapping] of Object.entries(MEMORY_TYPE_MAP)) {
      const records = ctx.normalized[datasetType];
      if (!records?.length) continue;

      for (const rec of records) {
        let memType = mapping.memType;
        if (!memType) {
          // timeline and memory types carry their own classification; fall back when unknown
          memType = VALID_MEMORY_TYPES.has(rec.type) ? rec.type : 'PROJECT_EVENT';
        }

        const title = mapping.titleFn(rec);
        const body = mapping.bodyFn(rec);
        if (!body) continue;

        await saveMemory(ctx.workspaceId, ctx.orgId, memType, {
          title,
          body,
          source: datasetType,
        });
        ctx.memoryCount++;
      }
    }

    ctx.emit('stageIngestMemory', 'completed', 'Memory ingestion complete', {
      memoryCount: ctx.memoryCount,
    });
  } catch (err) {
    ctx.emit('stageIngestMemory', 'failed', err.message);
    throw err;
  }
}

export async function stageVectorize(ctx) {
  ctx.emit('stageVectorize', 'started', 'Vectorizing normalized records into pgvector store');
  try {
    for (const type of Object.keys(ctx.normalized)) {
      const handler = getDatasetHandler(type);
      if (!handler) continue;

      const vectorItems = handler.vectorizer(ctx.normalized[type] ?? []);
      for (const { text, channel, metadata } of vectorItems) {
        if (!text?.trim()) continue;
        await upsertVector(ctx.workspaceId, text, channel ?? type, metadata ?? {});
        ctx.vectorCount++;
      }
    }

    ctx.emit('stageVectorize', 'completed', 'Vectorization complete', {
      vectorCount: ctx.vectorCount,
    });
  } catch (err) {
    ctx.emit('stageVectorize', 'failed', err.message);
    throw err;
  }
}

export async function stageRefreshRecommendations(ctx) {
  ctx.emit('stageRefreshRecommendations', 'started', 'Refreshing explainable recommendations');
  try {
    // Synchronous in-memory scoring — fire and ignore; stale recommendations are better than a blocked import
    try {
      generateExplainableRecommendations(ctx.workspaceId);
    } catch { /* non-fatal */ }

    ctx.emit('stageRefreshRecommendations', 'completed', 'Recommendations refreshed');
  } catch (err) {
    ctx.emit('stageRefreshRecommendations', 'failed', err.message);
  }
}

export async function stageRefreshBriefings(ctx) {
  ctx.emit('stageRefreshBriefings', 'started', 'Scheduling briefing generation');
  try {
    if (ctx.orgId) {
      // Fire-and-forget; LLM latency must not block the import response
      generateBriefing(ctx.workspaceId, ctx.orgId, 'EXECUTIVE').catch(() => {});
    }

    ctx.emit('stageRefreshBriefings', 'completed', 'Briefing generation scheduled');
  } catch (err) {
    ctx.emit('stageRefreshBriefings', 'failed', err.message);
  }
}

export async function stageWarmCopilot(ctx) {
  ctx.emit('stageWarmCopilot', 'started', 'Warming copilot context cache');
  try {
    // Single warmup question seeds the copilot context for new workspace sessions
    answerCopilotQuery(ctx.workspaceId, {
      pageContext: 'dashboard',
      question: 'What is the current operational state of this workspace?',
    }).catch(() => {});

    ctx.emit('stageWarmCopilot', 'completed', 'Copilot warmup dispatched');
  } catch (err) {
    ctx.emit('stageWarmCopilot', 'failed', err.message);
  }
}
