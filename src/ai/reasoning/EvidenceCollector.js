/**
 * EvidenceCollector — gathers evidence from all available FLOW data sources
 * in parallel based on the intent analysis result.
 *
 * Sources:
 *   - Vector store (pgvector semantic search)
 *   - Knowledge Graph (2-hop entity expansion)
 *   - Org memory (decisions, incidents, project events)
 *   - Health metrics
 *   - Timeline (recent connector actions)
 */

import { retrieveContext }              from '../../services/retrievalService.js';
import { getNeighbors }                 from '../../services/operationalGraphService.js';
import { prisma }                       from '../../core/config/prisma.js';
import { calculateWorkspaceHealth }     from '../../services/healthScoreService.js';

/**
 * @param {string} workspaceId
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {Promise<EvidenceSet>}
 */
export async function collectEvidence(workspaceId, intent) {
  const query = intent.searchTerms?.join(' ') || intent.question;

  const [ragResult, memoryResult, healthResult, timelineResult, entityResult] = await Promise.allSettled([
    _collectRAG(workspaceId, query),
    _collectMemory(workspaceId, intent),
    _collectHealth(workspaceId),
    _collectTimeline(workspaceId),
    _collectEntityGraph(workspaceId, intent),
  ]);

  const unwrap = (r, fallback = []) => r.status === 'fulfilled' ? r.value : fallback;

  return {
    rag:      unwrap(ragResult,      []),
    memory:   unwrap(memoryResult,   []),
    health:   unwrap(healthResult,   null),
    timeline: unwrap(timelineResult, []),
    entities: unwrap(entityResult,   []),
    _sources: ['rag', 'memory', 'health', 'timeline', 'entities'],
  };
}

// ── Source collectors ─────────────────────────────────────────────────────────

async function _collectRAG(workspaceId, query) {
  try {
    const traceId = `reason_${Date.now()}`;
    const chunks  = await retrieveContext(workspaceId, query, traceId);
    return (chunks || []).slice(0, 10).map(c => ({
      type:      'rag',
      content:   c.text || c.markdown || c.content || '',
      score:     c.finalScore ?? c.weightedScore ?? c.similarity ?? 0,
      source:    c.platform || c.source || 'vault',
      authority: c.authorityCoeff ?? 1.0,
      ts:        c.created_at || c.timestamp || null,
      metadata:  { channel: c.channel, sender: c.sender },
    }));
  } catch {
    return [];
  }
}

async function _collectMemory(workspaceId, intent) {
  try {
    const where = { workspaceId: String(workspaceId) };

    // Filter by domain-relevant memory types
    const domainTypeMap = {
      incidents: ['INCIDENT'],
      customers: ['CUSTOMER_EVENT'],
      projects:  ['PROJECT_EVENT', 'DECISION'],
      people:    ['PROJECT_EVENT'],
      general:   ['DECISION', 'INCIDENT', 'KNOWLEDGE_UPDATE'],
    };
    const types = domainTypeMap[intent.domain] || Object.values({ DECISION: 1, INCIDENT: 1, PROJECT_EVENT: 1, CUSTOMER_EVENT: 1, KNOWLEDGE_UPDATE: 1 }).map((_, i) => ['DECISION', 'INCIDENT', 'PROJECT_EVENT', 'CUSTOMER_EVENT', 'KNOWLEDGE_UPDATE'][i]);

    where.type = { in: types };

    const records = await prisma.orgMemoryRecord.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: 15,
      select: { id: true, type: true, title: true, body: true, importance: true, tags: true, createdAt: true, source: true },
    });

    return records.map(r => ({
      type:      'memory',
      memType:   r.type,
      content:   `[${r.type}] ${r.title}: ${r.body || ''}`,
      score:     (r.importance || 50) / 100,
      source:    r.source || 'org_memory',
      authority: r.type === 'INCIDENT' ? 1.4 : r.type === 'DECISION' ? 1.3 : 1.0,
      ts:        r.createdAt,
      metadata:  { tags: r.tags || [] },
    }));
  } catch {
    return [];
  }
}

async function _collectHealth(workspaceId) {
  try {
    return await calculateWorkspaceHealth(workspaceId);
  } catch {
    return null;
  }
}

async function _collectTimeline(workspaceId) {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId: String(workspaceId) },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { action: true, resource: true, outcome: true, createdAt: true, metadata: true },
    });

    return logs.map(l => ({
      type:      'timeline',
      content:   `${l.action} on ${l.resource}: ${l.outcome}`,
      score:     0.5,
      source:    'audit_log',
      authority: 0.9,
      ts:        l.createdAt,
      metadata:  l.metadata || {},
    }));
  } catch {
    return [];
  }
}

async function _collectEntityGraph(workspaceId, intent) {
  if (!intent.entities?.length) return [];

  const results = [];
  for (const entity of intent.entities.slice(0, 3)) {
    try {
      const neighbors = await getNeighbors(workspaceId, entity.name);
      if (neighbors?.length) {
        results.push({
          type:      'entity',
          content:   `Entity "${entity.name}" is connected to: ${neighbors.map(n => n.node?.name || n.node?.id || n.node?.entityId || '?').join(', ')}`,
          score:     0.7,
          source:    'knowledge_graph',
          authority: 1.0,
          ts:        null,
          metadata:  { entity: entity.name, neighbors: neighbors.length },
        });
      }
    } catch {
      // Entity not in graph — skip
    }
  }
  return results;
}
