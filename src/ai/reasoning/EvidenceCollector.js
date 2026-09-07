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

/**
 * RC-1 — collect graph evidence for entities that have ALREADY been resolved to real
 * node IDs by EntityResolver. Traverses by the actual node id (getNeighbors adds the
 * workspace prefix), so "PR-247" → AUTHORED_BY → Jordan Lee is reached deterministically
 * — instead of looking up a non-existent "workspace:Fatima" key. Returns high-authority
 * evidence items plus a plain-language facts block for the synthesis prompt.
 *
 * @param {string} workspaceId
 * @param {Array}  resolvedNodes  EntityResolver resolvedNodes (EXACT / EXACT_NAME)
 * @returns {Promise<{ evidence: object[], factsBlock: string, relationships: object[] }>}
 */
// Cached roster of real workspace person names (lowercased) — used to prevent + detect
// invented people in open-ended synthesis. 5-minute TTL; workspace-scoped.
const _peopleCache = new Map(); // workspaceId → { at, names:Set, list:[] }
export async function workspacePeople(workspaceId) {
  const ws = String(workspaceId);
  const hit = _peopleCache.get(ws);
  if (hit && Date.now() - hit.at < 300000) return hit;
  const rows = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: { in: ['USER', 'EMPLOYEE'] } },
    select: { name: true },
  }).catch(() => []);
  const list = [...new Set(rows.map(r => r.name).filter(Boolean))];
  const entry = { at: Date.now(), names: new Set(list.map(n => n.toLowerCase())), list };
  _peopleCache.set(ws, entry);
  return entry;
}

export async function collectEntityGraphEvidence(workspaceId, resolvedNodes = [], relationIntent = null) {
  const evidence = [];
  const relationships = [];
  const blockLines = [];
  const patterns = relationIntent?.patterns || [];

  for (const r of resolvedNodes.slice(0, 4)) {
    const rawId = r.rawId || r.nodeId;
    let neighbors = [];
    try { neighbors = await getNeighbors(workspaceId, rawId); } catch { neighbors = []; }
    for (const n of neighbors) {
      relationships.push({ subject: r.name || rawId, subjectId: rawId, relation: n.relation, direction: n.direction, object: n.node?.name || n.node?.id || '?', objectType: n.node?.type || '' });
    }

    // ── WHO_CONNECTED: list only ACTUAL person neighbors of X (any edge/direction). If
    // none, say so — never let the LLM invent execs as "connected". Verifier-gated.
    if (relationIntent?.relIntent === 'WHO_CONNECTED') {
      const people = neighbors.filter(n => /^(USER|EMPLOYEE)$/i.test(n.node?.type || '')).map(n => n.node?.name).filter(Boolean);
      const uniq = [...new Set(people)];
      if (uniq.length) {
        blockLines.push(`- EXPLICIT: the people directly connected to ${r.name || rawId} in the workspace graph are: ${uniq.join(', ')}. Do NOT add anyone else.`);
        evidence.push({ type: 'entity', content: `EXPLICIT — people connected to ${r.name || rawId}: ${uniq.join(', ')}`, score: 0.99, source: 'knowledge_graph', authority: 1.0, ts: null, metadata: { entity: r.name || rawId, relIntent: 'WHO_CONNECTED', evidenceState: 'EXPLICIT', people: uniq } });
      } else {
        blockLines.push(`- NO RECORDED RELATIONSHIP: no people are directly connected to ${r.name || rawId} in the workspace graph. Say that plainly — do NOT name any person.`);
        evidence.push({ type: 'entity', content: `NO RECORD — no people connected to ${r.name || rawId}`, score: 0.98, source: 'knowledge_graph', authority: 1.0, ts: null, metadata: { entity: r.name || rawId, relIntent: 'WHO_CONNECTED', evidenceState: 'NO_RECORD' } });
      }
      continue;
    }

    // ── RC-2: DIRECTIONAL intent — answer with the SPECIFIC relationship + direction.
    if (relationIntent?.relIntent && patterns.length) {
      const matches = [];
      for (const p of patterns) {
        for (const n of neighbors) {
          if (n.relation === p.rel && n.direction === p.dir) matches.push({ name: n.node?.name || n.node?.id, rel: n.relation });
        }
      }
      const uniq = [...new Map(matches.map(m => [m.name, m])).values()];
      const verb = _relVerb(relationIntent.relIntent);
      if (uniq.length) {
        const names = uniq.map(m => m.name).join(', ');
        blockLines.push(`- EXPLICIT: ${verb.answer(r.name || rawId, names)} (from the workspace graph)`);
        evidence.push({ type: 'entity', content: `EXPLICIT — ${verb.answer(r.name || rawId, names)}`, score: 0.99, source: 'knowledge_graph', authority: 1.0, ts: null, metadata: { entity: r.name || rawId, relIntent: relationIntent.relIntent, evidenceState: 'EXPLICIT' } });
      } else {
        // Resolved entity, but the SPECIFIC relationship is not recorded → honest no-record.
        blockLines.push(`- NO RECORDED RELATIONSHIP: there is no ${verb.noun} recorded for ${r.name || rawId} in the workspace graph. Do NOT guess one.`);
        evidence.push({ type: 'entity', content: `NO RECORD — no ${verb.noun} for ${r.name || rawId} in the graph`, score: 0.97, source: 'knowledge_graph', authority: 1.0, ts: null, metadata: { entity: r.name || rawId, relIntent: relationIntent.relIntent, evidenceState: 'NO_RECORD' } });
      }
      continue; // directional intent handled — don't also dump the generic neighbor list
    }

    // ── Non-directional: full neighbor context (RC-1 behavior). ──
    if (!neighbors.length) {
      blockLines.push(`- ${r.name || rawId} [${r.entityType}] exists (id ${rawId}) but has no recorded relationships in the graph.`);
      continue;
    }
    const relStrs = neighbors.map(n => {
      const other = n.node?.name || n.node?.id || '?';
      const otherType = n.node?.type || '';
      return n.direction === 'OUT'
        ? `${n.relation} → ${other}${otherType ? ` [${otherType}]` : ''}`
        : `${other}${otherType ? ` [${otherType}]` : ''} → ${n.relation}`;
    });
    blockLines.push(`- ${r.name || rawId} [${r.entityType}] (id ${rawId}) relationships: ${relStrs.join('; ')}`);
    evidence.push({ type: 'entity', content: `${r.name || rawId} [${r.entityType}] — ${relStrs.join('; ')}`, score: 0.98, source: 'knowledge_graph', authority: 1.0, ts: null, metadata: { entity: r.name || rawId, nodeId: r.nodeId, resolution: r.resolution, neighbors: neighbors.length } });
  }

  const factsBlock = blockLines.length
    ? `RESOLVED ENTITIES & RELATIONSHIPS (from the workspace graph — authoritative; EXPLICIT = recorded fact, NO RECORDED RELATIONSHIP = do not invent one):\n${blockLines.join('\n')}`
    : '';
  return { evidence, factsBlock, relationships };
}

// Natural verb/noun for each directional relationship intent.
function _relVerb(relIntent) {
  switch (relIntent) {
    case 'WHO_IS_MANAGER':  return { noun: 'manager', answer: (t, m) => `${t} reports to ${m}` };
    case 'WHO_REPORTS_TO':  return { noun: 'direct reports', answer: (t, m) => `${m} report(s) to ${t}` };
    case 'WHO_AUTHORED':    return { noun: 'author', answer: (t, m) => `${t} was authored by ${m}` };
    case 'WHO_IS_ASSIGNED': return { noun: 'assignee', answer: (t, m) => `${m} is assigned to ${t}` };
    case 'WHO_IS_INVOLVED': return { noun: 'responsible owner', answer: (t, m) => `${t} is handled by ${m}` };
    default:                return { noun: 'relationship', answer: (t, m) => `${t}: ${m}` };
  }
}
