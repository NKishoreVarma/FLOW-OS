import { prisma } from '../core/config/prisma.js';
import { getTimeline } from '../connectors/executionEngine.js';
import { getNeighbors } from './operationalGraphService.js';

export async function getOperationalTimeline(workspaceId, { hours = 168, limit = 50 } = {}) {
  const wsId = String(workspaceId);
  const since = new Date(Date.now() - hours * 3600 * 1000);

  const [memory, runs] = await Promise.all([
    prisma.orgMemoryRecord.findMany({
      where: { workspaceId: wsId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    prisma.automationRun.findMany({
      where: { workspaceId: wsId, startedAt: { gte: since } },
      include: { rule: { select: { name: true, trigger: true } } },
      orderBy: { startedAt: 'desc' },
      take: limit
    })
  ]);

  const memoryEvents = memory.map(r => ({
    id: `mem_${r.id}`,
    kind: 'MEMORY',
    category: r.type,
    title: r.title,
    summary: r.body ? String(r.body).slice(0, 200) : '',
    actor: r.author || null,
    source: r.source || null,
    status: null,
    timestamp: r.createdAt.toISOString(),
    metadata: r.metadata || {}
  }));

  const automationEvents = runs.map(run => ({
    id: `run_${run.id}`,
    kind: 'AUTOMATION',
    category: 'AUTOMATION',
    title: run.rule?.name || 'Automation run',
    summary: `Trigger ${run.rule?.trigger || 'unknown'} → ${run.status}`,
    actor: 'automation',
    source: run.rule?.trigger || null,
    status: run.status,
    timestamp: run.startedAt.toISOString(),
    metadata: { runId: run.id }
  }));

  let connectorEvents = [];
  try {
    connectorEvents = (getTimeline(wsId, { limit }) || []).map((e, i) => ({
      id: `conn_${e.timestamp || i}_${i}`,
      kind: 'CONNECTOR',
      category: e.capability || 'connector',
      title: e.summary || `${e.connectorId}.${e.actionType}`,
      summary: e.summary || '',
      actor: e.actor || null,
      source: e.connectorId || null,
      status: null,
      timestamp: e.timestamp || new Date().toISOString(),
      metadata: e.metadata || {}
    }));
  } catch {
    connectorEvents = [];
  }

  return [...memoryEvents, ...automationEvents, ...connectorEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

const TYPE_TO_GROUP = {
  USER: 'people',
  PERSON: 'people',
  PROJECT: 'projects',
  CUSTOMER: 'customers',
  ACCOUNT: 'customers',
  MEETING: 'meetings',
  EVENT: 'meetings',
  EMAIL: 'emails',
  MESSAGE: 'emails',
  DOCUMENT: 'documents',
  PAGE: 'documents',
  PR: 'pullRequests',
  PULL_REQUEST: 'pullRequests',
  ISSUE: 'issues',
  TICKET: 'issues'
};

export async function getEntityContext(workspaceId, entityId) {
  const wsId = String(workspaceId);

  const related = {
    people: [], projects: [], customers: [], meetings: [],
    emails: [], documents: [], pullRequests: [], issues: [], other: []
  };

  let neighbors = [];
  try {
    neighbors = await getNeighbors(wsId, entityId);
  } catch {
    neighbors = [];
  }

  for (const n of neighbors) {
    const node = n.node || {};
    const group = TYPE_TO_GROUP[String(node.type || '').toUpperCase()] || 'other';
    related[group].push({
      id: node.id,
      type: node.type,
      name: node.name,
      relation: n.relation,
      direction: n.direction
    });
  }

  const decisions = await prisma.orgMemoryRecord.findMany({
    where: { workspaceId: wsId, type: 'DECISION' },
    orderBy: { createdAt: 'desc' },
    take: 5
  }).catch(() => []);

  return {
    entityId,
    related,
    decisions: decisions.map(d => ({ id: d.id, title: d.title, createdAt: d.createdAt })),
    neighborCount: neighbors.length
  };
}
