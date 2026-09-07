import crypto from 'crypto';
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
    const { name: manifestName } = ctx.manifest.organization ?? {};

    // Resolve org from the workspace's own authoritative orgId — do not trust manifest slug or plan
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { externalId: ctx.workspaceId },
    });
    if (!existingWorkspace) throw new Error(`Workspace "${ctx.workspaceId}" not found`);

    const org = manifestName
      ? await prisma.organization.update({
          where: { id: existingWorkspace.orgId },
          data: { name: manifestName },
          // Never update plan from manifest — plan is platform-controlled
        })
      : await prisma.organization.findUnique({ where: { id: existingWorkspace.orgId } });
    if (!org) throw new Error('Workspace organization not found');

    const workspace = await prisma.workspace.upsert({
      where: { externalId: ctx.workspaceId },
      create: { name: `${org.name} Workspace`, orgId: org.id, externalId: ctx.workspaceId },
      update: {},
    });

    ctx.orgId = org.id;
    ctx.workspace = workspace;

    const employees = ctx.normalized.employees ?? [];
    for (const rec of employees) {
      const email = rec.email ?? `${rec.id}@import.local`;
      // Clamp role — imported records cannot self-escalate to OWNER/ADMIN
      const role = 'MEMBER';
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const user = await prisma.user.upsert({
        where: { email },
        create: { email, fullName: rec.name, passwordHash, orgId: org.id, role },
        update: { fullName: rec.name },
      });

      await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
        create: { userId: user.id, workspaceId: workspace.id, role },
        update: {},
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
    const allEdges = [];

    // PASS 1 — write EVERY node across EVERY type first. An edge can point to a node
    // in a different dataset type (PR → USER, USER → DEPARTMENT); writing nodes and
    // edges interleaved per-type meant an edge could hit a not-yet-written endpoint
    // and violate the FK, aborting the whole import. Write all nodes, collect edges.
    for (const type of Object.keys(ctx.normalized)) {
      const handler = getDatasetHandler(type);
      if (!handler) continue;

      const { nodes, edges } = handler.resolver(ctx.normalized[type] ?? [], ctx.globalIdMap);

      for (const node of nodes) {
        await upsertNode(ctx.workspaceId, ctx.orgId, node.id, node.type, node.name, node.metadata ?? {});
        registerEntity(node.id, node.type, node.name);
        ctx.graphMetrics.nodes++;
      }
      for (const edge of edges) allEdges.push(edge);
    }
    // Pre-resolved cross-dataset edges from stageResolveRelationships.
    for (const edge of (ctx.resolvedEdges ?? [])) allEdges.push(edge);

    // PASS 2 — now that all nodes exist, write edges. Skip any whose endpoint isn't a
    // known node; a stray FK on one edge must NOT abort the whole import (fault-isolated).
    for (const edge of allEdges) {
      if (!ctx.globalIdMap.has(String(edge.sourceId)) || !ctx.globalIdMap.has(String(edge.targetId))) {
        skippedEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId, reason: 'missing endpoint' });
        continue;
      }
      try {
        await upsertEdge(ctx.workspaceId, ctx.orgId, edge.sourceId, edge.targetId, edge.type, edge.weight ?? 1);
        linkEntities(edge.sourceId, edge.targetId, edge.type);
        ctx.graphMetrics.edges++;
      } catch (edgeErr) {
        skippedEdges.push({ sourceId: edge.sourceId, targetId: edge.targetId, reason: `write failed: ${edgeErr.message?.slice(0, 60)}` });
      }
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
    for (const type of Object.keys(ctx.normalized)) {
      const handler = getDatasetHandler(type);
      if (!handler?.memoryMapper) continue; // skip types without a memory mapper

      const records = ctx.normalized[type];
      if (!records?.length) continue;

      for (const rec of records) {
        const mapped = handler.memoryMapper(rec);
        if (!mapped) continue;
        const { memoryType, content } = mapped;
        if (!content) continue;

        await saveMemory(ctx.workspaceId, ctx.orgId, memoryType, {
          title: content.slice(0, 120),
          body: content,
          source: type,
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

// Max records vectorized per dataset type per import run.
// Prevents runaway sequential Gemini API calls on large imports (e.g. 1,957 emails × 300ms = 10min).
const MAX_VECTORS_PER_TYPE = 100;

export async function stageVectorize(ctx) {
  ctx.emit('stageVectorize', 'started', 'Vectorizing normalized records into pgvector store');
  try {
    // Imported records bypass the real-time privacy gate — they are pre-classified operational
    // intel from trusted export files. Do NOT use this stage for streaming/live input.
    for (const type of Object.keys(ctx.normalized)) {
      const handler = getDatasetHandler(type);
      if (!handler) continue;

      const vectorItems = handler.vectorizer(ctx.normalized[type] ?? []);
      const capped = vectorItems.slice(0, MAX_VECTORS_PER_TYPE);
      for (const { text, channel, metadata } of capped) {
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
