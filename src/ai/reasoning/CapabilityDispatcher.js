/**
 * CapabilityDispatcher — queries FLOW's actual data systems for each planned capability.
 *
 * Every capability maps to a real FLOW data source:
 *   engineering   → GraphNode (PR, COMMIT, ISSUE) + OrgMemoryRecord
 *   meetings      → GraphNode (MEETING, EVENT)
 *   customers     → GraphNode (CUSTOMER) + OrgMemoryRecord (PROJECT_EVENT)
 *   incidents     → GraphNode (INCIDENT) + OrgMemoryRecord (INCIDENT)
 *   knowledge     → GraphNode (DOCUMENT) + OrgMemoryRecord (KNOWLEDGE_UPDATE)
 *   communications→ GraphNode (EMAIL, COMMUNICATION)
 *   timeline      → AuditLog + OrgMemoryRecord (recent)
 *   memory        → OrgMemoryRecord (decisions, incidents, key records)
 *   recommendations→ operationalIntelligenceService
 *   health        → healthScoreService
 *   people        → GraphNode (USER)
 *   transcripts   → GraphNode (TRANSCRIPT)
 *
 * FLOW looks first. LLM synthesises second.
 */

import { prisma }                        from '../../core/config/prisma.js';
import { calculateWorkspaceHealth }      from '../../services/healthScoreService.js';
import { getProactiveRecommendations }   from '../../services/operationalIntelligenceService.js';
import { Capability, CAPABILITY_NODE_TYPES, CAPABILITY_MEMORY_TYPES } from './CapabilityPlanner.js';

/**
 * @param {string} workspaceId
 * @param {import('./CapabilityPlanner.js').CapabilityPlan} plan
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {Promise<CapabilityResults>}
 */
export async function dispatchCapabilities(workspaceId, plan, intent) {
  const wsId     = String(workspaceId);
  const results  = {};

  const dispatchers = plan.capabilities.map(async ({ capability, limit }) => {
    try {
      results[capability] = await _dispatch(wsId, capability, limit, intent);
    } catch {
      results[capability] = { capability, records: [], count: 0, error: true };
    }
  });

  await Promise.all(dispatchers);
  return results;
}

// ── Per-capability dispatch ───────────────────────────────────────────────────

async function _dispatch(wsId, capability, limit, intent) {
  switch (capability) {
    case Capability.ENGINEERING:    return _dispatchEngineering(wsId, limit, intent);
    case Capability.MEETINGS:       return _dispatchMeetings(wsId, limit, intent);
    case Capability.CUSTOMERS:      return _dispatchCustomers(wsId, limit, intent);
    case Capability.INCIDENTS:      return _dispatchIncidents(wsId, limit);
    case Capability.KNOWLEDGE:      return _dispatchKnowledge(wsId, limit, intent);
    case Capability.COMMUNICATIONS: return _dispatchCommunications(wsId, limit, intent);
    case Capability.TIMELINE:       return _dispatchTimeline(wsId, limit);
    case Capability.MEMORY:         return _dispatchMemory(wsId, limit);
    case Capability.RECOMMENDATIONS:return _dispatchRecommendations(wsId, limit);
    case Capability.HEALTH:         return _dispatchHealth(wsId);
    case Capability.PEOPLE:         return _dispatchPeople(wsId, limit, intent);
    case Capability.TRANSCRIPTS:    return _dispatchTranscripts(wsId, limit, intent);
    default:                        return { capability, records: [], count: 0 };
  }
}

// ── Engineering ───────────────────────────────────────────────────────────────

async function _dispatchEngineering(wsId, limit, intent) {
  const nodeTypes = CAPABILITY_NODE_TYPES[Capability.ENGINEERING];
  const q         = intent.question.toLowerCase();

  // Prioritise node type based on the specific question
  let priorityTypes = nodeTypes;
  if (/pr|pull request|merge|review/.test(q))          priorityTypes = ['PR', 'ISSUE', 'COMMIT'];
  else if (/commit|push|code change/.test(q))          priorityTypes = ['COMMIT', 'PR'];
  else if (/issue|ticket|jira|bug/.test(q))            priorityTypes = ['ISSUE', 'PR'];
  else if (/deploy|release|production/.test(q))        priorityTypes = ['COMMIT', 'PR'];

  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: wsId, type: { in: priorityTypes } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, name: true, metadata: true, createdAt: true },
  });

  return {
    capability: Capability.ENGINEERING,
    records: nodes.map(n => _formatNode(n)),
    count: nodes.length,
    nodeTypes: [...new Set(nodes.map(n => n.type))],
  };
}

// ── Meetings ──────────────────────────────────────────────────────────────────

async function _dispatchMeetings(wsId, limit, intent) {
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: wsId, type: { in: ['MEETING', 'EVENT'] } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, name: true, metadata: true, createdAt: true },
  });

  return {
    capability: Capability.MEETINGS,
    records: nodes.map(n => _formatNode(n)),
    count: nodes.length,
  };
}

// ── Customers ─────────────────────────────────────────────────────────────────

async function _dispatchCustomers(wsId, limit, intent) {
  const q = intent.question.toLowerCase();

  const [nodes, memRecords] = await Promise.all([
    prisma.graphNode.findMany({
      where: { workspaceId: wsId, type: 'CUSTOMER' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, name: true, metadata: true, createdAt: true },
    }),
    prisma.orgMemoryRecord.findMany({
      where: { workspaceId: wsId, type: { in: ['PROJECT_EVENT', 'CUSTOMER_EVENT'] } },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: Math.ceil(limit / 2),
      select: { type: true, title: true, body: true, importance: true, createdAt: true, tags: true, source: true },
    }),
  ]);

  // Filter for "at risk" queries
  let filtered = nodes;
  if (/at risk|churn|risk/.test(q)) {
    filtered = nodes.filter(n => {
      const meta = n.metadata || {};
      return meta.health === 'at_risk' || meta.churnRisk > 0.6 || meta.status === 'at_risk';
    });
    if (!filtered.length) filtered = nodes; // fallback to all if no risk filter hits
  }

  return {
    capability: Capability.CUSTOMERS,
    records: [
      ...filtered.map(n => _formatNode(n)),
      ...memRecords.map(r => ({ type: r.type, name: r.title, summary: r.body?.slice(0, 200), importance: r.importance, ts: r.createdAt })),
    ],
    count: filtered.length + memRecords.length,
    totalCustomers: nodes.length,
  };
}

// ── Incidents ─────────────────────────────────────────────────────────────────

async function _dispatchIncidents(wsId, limit) {
  const [nodes, memRecords] = await Promise.all([
    prisma.graphNode.findMany({
      where: { workspaceId: wsId, type: 'INCIDENT' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, name: true, metadata: true, createdAt: true },
    }),
    prisma.orgMemoryRecord.findMany({
      where: { workspaceId: wsId, type: 'INCIDENT' },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: Math.ceil(limit / 2),
      select: { type: true, title: true, body: true, importance: true, createdAt: true, tags: true },
    }),
  ]);

  return {
    capability: Capability.INCIDENTS,
    records: [
      ...nodes.map(n => _formatNode(n)),
      ...memRecords.map(r => ({
        type: 'INCIDENT',
        name: r.title,
        summary: r.body?.slice(0, 300),
        importance: r.importance,
        ts: r.createdAt,
        tags: r.tags,
      })),
    ],
    count: nodes.length + memRecords.length,
    activeCount: nodes.filter(n => (n.metadata?.status || 'open') === 'open').length,
  };
}

// ── Knowledge ─────────────────────────────────────────────────────────────────

async function _dispatchKnowledge(wsId, limit, intent) {
  const [nodes, memRecords] = await Promise.all([
    prisma.graphNode.findMany({
      where: { workspaceId: wsId, type: 'DOCUMENT' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, name: true, metadata: true, createdAt: true },
    }),
    prisma.orgMemoryRecord.findMany({
      where: { workspaceId: wsId, type: 'KNOWLEDGE_UPDATE' },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 2),
      select: { type: true, title: true, body: true, importance: true, createdAt: true, tags: true },
    }),
  ]);

  return {
    capability: Capability.KNOWLEDGE,
    records: [
      ...nodes.map(n => _formatNode(n)),
      ...memRecords.map(r => ({ type: 'KNOWLEDGE_UPDATE', name: r.title, summary: r.body?.slice(0, 200), ts: r.createdAt })),
    ],
    count: nodes.length + memRecords.length,
  };
}

// ── Communications ────────────────────────────────────────────────────────────

async function _dispatchCommunications(wsId, limit, intent) {
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: wsId, type: { in: ['EMAIL', 'COMMUNICATION'] } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, name: true, metadata: true, createdAt: true },
  });

  return {
    capability: Capability.COMMUNICATIONS,
    records: nodes.map(n => _formatNode(n)),
    count: nodes.length,
  };
}

// ── Timeline ──────────────────────────────────────────────────────────────────

async function _dispatchTimeline(wsId, limit) {
  const [auditLogs, memRecords] = await Promise.all([
    prisma.auditLog.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 2),
      select: { action: true, resource: true, outcome: true, createdAt: true },
    }),
    prisma.orgMemoryRecord.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 2),
      select: { type: true, title: true, body: true, importance: true, createdAt: true },
    }),
  ]);

  return {
    capability: Capability.TIMELINE,
    records: [
      ...auditLogs.map(l => ({ type: 'AUDIT', name: `${l.action} on ${l.resource}`, summary: l.outcome, ts: l.createdAt })),
      ...memRecords.map(r => ({ type: r.type, name: r.title, summary: r.body?.slice(0, 150), importance: r.importance, ts: r.createdAt })),
    ].sort((a, b) => new Date(b.ts) - new Date(a.ts)),
    count: auditLogs.length + memRecords.length,
  };
}

// ── Memory ────────────────────────────────────────────────────────────────────

async function _dispatchMemory(wsId, limit) {
  const records = await prisma.orgMemoryRecord.findMany({
    where: { workspaceId: wsId },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: { type: true, title: true, body: true, importance: true, createdAt: true, tags: true, source: true },
  });

  return {
    capability: Capability.MEMORY,
    records: records.map(r => ({
      type: r.type,
      name: r.title,
      summary: r.body?.slice(0, 250),
      importance: r.importance,
      ts: r.createdAt,
      tags: r.tags,
    })),
    count: records.length,
    byType: records.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {}),
  };
}

// ── Recommendations ───────────────────────────────────────────────────────────

async function _dispatchRecommendations(wsId, limit) {
  try {
    const recs = await getProactiveRecommendations(wsId);
    return {
      capability: Capability.RECOMMENDATIONS,
      records: (recs || []).slice(0, limit).map(r => ({
        type: 'RECOMMENDATION',
        name: r.title || r.recommendation,
        summary: r.reasoning || r.description,
        confidence: r.confidence,
        priority: r.priority,
        actionable: r.actionable,
        ts: r.createdAt,
      })),
      count: (recs || []).length,
    };
  } catch {
    return { capability: Capability.RECOMMENDATIONS, records: [], count: 0 };
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

async function _dispatchHealth(wsId) {
  try {
    const health = await calculateWorkspaceHealth(wsId);
    return {
      capability: Capability.HEALTH,
      records: [{ type: 'HEALTH', name: 'Workspace Health', summary: `Overall: ${health.company_health}/100`, data: health }],
      count: 1,
      health,
    };
  } catch {
    return { capability: Capability.HEALTH, records: [], count: 0 };
  }
}

// ── People ────────────────────────────────────────────────────────────────────

async function _dispatchPeople(wsId, limit, intent) {
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: wsId, type: 'USER' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, name: true, metadata: true, createdAt: true },
  });

  return {
    capability: Capability.PEOPLE,
    records: nodes.map(n => _formatNode(n)),
    count: nodes.length,
  };
}

// ── Transcripts ───────────────────────────────────────────────────────────────

async function _dispatchTranscripts(wsId, limit, intent) {
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: wsId, type: 'TRANSCRIPT' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, name: true, metadata: true, createdAt: true },
  });

  return {
    capability: Capability.TRANSCRIPTS,
    records: nodes.map(n => _formatNode(n)),
    count: nodes.length,
  };
}

// ── Shared formatter ──────────────────────────────────────────────────────────

function _formatNode(n) {
  const meta = n.metadata || {};
  return {
    type:     n.type,
    id:       n.id,
    name:     n.name || meta.title || meta.name || `[${n.type}]`,
    summary:  meta.summary || meta.description || meta.body || meta.title || '',
    status:   meta.status || meta.state || null,
    ts:       meta.createdAt || n.createdAt || null,
    metadata: meta,
  };
}
