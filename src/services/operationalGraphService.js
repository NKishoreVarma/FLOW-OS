/**
 * Operational Graph Service — PostgreSQL-backed entity graph (Phase 7.0)
 *
 * Parallel to the in-memory knowledgeGraphService. Provides durable BFS traversal
 * and graph stats backed by GraphNode / GraphEdge Prisma models (Task 1).
 * Do NOT import or modify knowledgeGraphService from here.
 */

import { prisma } from '../core/config/prisma.js';

function nodeKey(workspaceId, rawId) {
  return `${String(workspaceId)}:${rawId}`;
}

export async function upsertNode(workspaceId, orgId, id, type, name, metadata = {}) {
  const nid = nodeKey(workspaceId, id);
  return prisma.graphNode.upsert({
    where: { id: nid },
    create: { id: nid, workspaceId: String(workspaceId), orgId, type, name, metadata },
    update: { name, metadata }
  });
}

export async function upsertEdge(workspaceId, orgId, sourceId, targetId, relationshipType, weight = 1.0) {
  const nsourceId = nodeKey(workspaceId, sourceId);
  const ntargetId = nodeKey(workspaceId, targetId);
  return prisma.graphEdge.upsert({
    where: { sourceId_targetId_relationshipType: { sourceId: nsourceId, targetId: ntargetId, relationshipType } },
    create: { sourceId: nsourceId, targetId: ntargetId, workspaceId: String(workspaceId), orgId, relationshipType, weight },
    update: { weight }
  });
}

export async function getRelatedContext(workspaceId, entityId, hops = 2) {
  const startId = nodeKey(workspaceId, entityId);
  const visited = new Set([startId]);
  const contextStrings = [];
  let frontier = [startId];

  for (let hop = 0; hop < hops; hop++) {
    if (frontier.length === 0) break;

    const edges = await prisma.graphEdge.findMany({
      where: {
        workspaceId: String(workspaceId),
        OR: [{ sourceId: { in: frontier } }, { targetId: { in: frontier } }]
      },
      include: { source: true, target: true },
      take: 500
    });

    const nextFrontier = [];
    for (const edge of edges) {
      const { source, target, relationshipType } = edge;
      if (!visited.has(target.id)) {
        visited.add(target.id);
        nextFrontier.push(target.id);
        contextStrings.push(`${source.type}:${source.name} --[${relationshipType}]--> ${target.type}:${target.name}`);
      }
      if (!visited.has(source.id)) {
        visited.add(source.id);
        nextFrontier.push(source.id);
        contextStrings.push(`${source.type}:${source.name} <--[${relationshipType}]-- ${target.type}:${target.name}`);
      }
    }
    frontier = nextFrontier;
  }

  return contextStrings;
}

export async function getGraphStats(workspaceId) {
  const [nodeCount, edgeCount] = await Promise.all([
    prisma.graphNode.count({ where: { workspaceId: String(workspaceId) } }),
    prisma.graphEdge.count({ where: { workspaceId: String(workspaceId) } })
  ]);
  return { nodeCount, edgeCount };
}

export async function getNeighbors(workspaceId, entityId) {
  const nid = nodeKey(workspaceId, entityId);
  const edges = await prisma.graphEdge.findMany({
    where: {
      workspaceId: String(workspaceId),
      OR: [{ sourceId: nid }, { targetId: nid }]
    },
    include: { source: true, target: true }
  });
  return edges.map(e => ({
    node: e.sourceId === nid ? e.target : e.source,
    relation: e.relationshipType,
    direction: e.sourceId === nid ? 'OUT' : 'IN'
  }));
}
