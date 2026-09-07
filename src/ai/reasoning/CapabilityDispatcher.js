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
import { query as dbQuery }              from '../../config/db.js';
import { calculateWorkspaceHealth }      from '../../services/healthScoreService.js';
import { getProactiveRecommendations }   from '../../services/operationalIntelligenceService.js';
import { Capability, CAPABILITY_NODE_TYPES, CAPABILITY_MEMORY_TYPES } from './CapabilityPlanner.js';
import { fetchLiveEngineering, fetchLiveMeetings, fetchLiveCommunications, fetchLiveJira, fetchLiveSlack } from './LiveConnectorLayer.js';
import { query as queryEvents } from '../../events/EventStore.js';
import { createEvidenceQuery, QueryOutcome, Freshness } from '../../contracts/evidence.js';
import { mapResultOutcome, outcomeFromError, classifyFreshness, safeErrorCategory } from './dispatchOutcomes.js';
// Re-export the pure mappers so callers/tests can import them from either module.
export { mapResultOutcome, outcomeFromError, classifyFreshness } from './dispatchOutcomes.js';

// Per-capability provenance metadata (Phase 2). `source` = the canonical source label
// for EvidenceQuery; `connectors` = the sync-tracked connectors used for freshness.
const CAPABILITY_SOURCE = {
  engineering: 'github', meetings: 'calendar', customers: 'crm', incidents: 'incidents',
  knowledge: 'documents', communications: 'gmail', timeline: 'activity', memory: 'memory',
  recommendations: 'recommendations', health: 'health', people: 'directory', transcripts: 'transcripts', graph: 'graph',
};
const CAPABILITY_CONNECTORS = {
  engineering: ['github', 'jira'], meetings: ['google-calendar'], communications: ['gmail', 'slack'],
  knowledge: ['notion', 'jira'], customers: ['hubspot'], incidents: ['pagerduty'],
  // internal-store capabilities have no sync-tracked connector → freshness UNKNOWN
  timeline: [], memory: [], recommendations: [], health: [], people: [], transcripts: [], graph: [],
};
const CAP_TIMEOUT_MS = Number(process.env.CAPABILITY_TIMEOUT_MS) || 12_000;

const _sourceLabel = (cap) => CAPABILITY_SOURCE[cap] || String(cap);

// One query → connector → most-recent last_sync_at (real sync state, never invented).
async function _buildFreshnessMap(wsId) {
  try {
    const { rows } = await dbQuery(
      `SELECT connector_id, MAX(last_sync_at) AS last FROM sync_state WHERE workspace_id = $1 GROUP BY connector_id`,
      [wsId],
    );
    return Object.fromEntries(rows.map(r => [r.connector_id, r.last ? new Date(r.last).toISOString() : null]));
  } catch { return {}; }
}

function _freshnessFor(cap, freshnessMap, now) {
  const conns = CAPABILITY_CONNECTORS[cap] || [];
  let lastSyncAt = null;
  for (const c of conns) {
    const v = freshnessMap[c];
    if (v && (!lastSyncAt || v > lastSyncAt)) lastSyncAt = v;
  }
  return { lastSyncAt, freshness: classifyFreshness(lastSyncAt, now) };
}

// Timeout wrapper that tags timeouts distinctly from other failures.
function _withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => { const e = new Error('capability timeout'); e.__timeout = true; rej(e); }, ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}


// Event-store fallback: the Unified Event Platform (flow_events) is the durable source
// of truth for every connector. When a workspace has no LIVE connector and the derived
// graph doesn't carry the queried node types (e.g. a seeded/imported workspace), the
// capability data still lives here. This is what lets the brain answer engineering /
// meeting / communication questions from real event history, not just live APIs.
// Generic titles a re-normalization can stamp on an event, dropping the real subject.
// These plumbing duplicates (empty summary + template title) must not be shown as the
// user's actual work — skip them so the real, richly-titled event wins.
const _GENERIC_TITLE = /^(email received|customer update|hr update|document updated|meeting|event|action executed)$/i;
function _isRealEventRow(ev) {
  const title = String(ev.title || '').trim();
  if (!title) return false;
  if (_GENERIC_TITLE.test(title) && !String(ev.summary || '').trim()) return false;
  return true;
}

async function _eventRecords(wsId, connectors, mapKind, limit = 20) {
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const batches = await Promise.all(
    connectors.map(c => queryEvents({ workspaceId: wsId, connector: c, since, limit: limit * 2, order: 'DESC' }).catch(() => [])),
  );
  const rows = batches.flat()
    .filter(_isRealEventRow)
    .sort((a, b) => new Date(b.ts || b.timestamp || 0) - new Date(a.ts || a.timestamp || 0));
  return rows.slice(0, limit).map(mapKind).filter(Boolean);
}

/**
 * @param {string} workspaceId
 * @param {import('./CapabilityPlanner.js').CapabilityPlan} plan
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {Promise<CapabilityResults>}
 */
/**
 * dispatchWithEvidence — the authoritative provenance executor (Phase 2).
 *
 * Runs each PLANNED capability once (with a timeout) and produces:
 *   - results: the legacy { capability: { records, count, … } } map (compatibility)
 *   - queries: EvidenceQuery[] — ONE per relevant capability, nothing silently omitted:
 *       planned → OK | EMPTY | FAILED | TIMEOUT   (+ SKIPPED_* when signalled)
 *       not planned → SKIPPED_BY_PLAN
 * workspaceId is FLOW-controlled (the trusted execution argument) — never taken from
 * intent/plan/LLM payload. Coverage is NOT assigned here (Phase 3 derives it).
 * @returns {Promise<{results: object, queries: object[]}>}
 */
export async function dispatchWithEvidence(workspaceId, plan, intent) {
  const wsId    = String(workspaceId);   // trusted execution context — authoritative
  const results = {};
  const allowed = Array.isArray(plan.allowedConnectors) ? plan.allowedConnectors : [];
  const isAllowed = (conn) => allowed.length === 0 || allowed.includes(conn);
  const plannedSet   = new Set((plan.capabilities || []).map(c => c.capability));
  const freshnessMap = await _buildFreshnessMap(wsId);
  const now = Date.now();

  const plannedQueries = await Promise.all((plan.capabilities || []).map(async ({ capability, limit }) => {
    const executedAt = new Date().toISOString();
    let outcome, resultIds = [], error = null;
    try {
      const result = await _withTimeout(_dispatch(wsId, capability, limit, intent, isAllowed), CAP_TIMEOUT_MS);
      results[capability] = result;
      ({ outcome, resultIds } = mapResultOutcome(result));
    } catch (e) {
      results[capability] = { capability, records: [], count: 0, error: true };   // legacy compat shape
      outcome = outcomeFromError(e);
      error   = safeErrorCategory(outcome);
    }
    const { lastSyncAt, freshness } = _freshnessFor(capability, freshnessMap, now);
    return createEvidenceQuery({ capabilityId: capability, source: _sourceLabel(capability), outcome, freshness, timeScope: null, executedAt, lastSyncAt, resultIds, workspaceId: wsId, error });
  }));

  // Every relevant capability NOT selected by the plan is recorded as SKIPPED_BY_PLAN —
  // provenance never drops a source. (Phase 3 excludes SKIPPED_BY_PLAN from "attempted".)
  const skippedQueries = Object.values(Capability)
    .filter(c => !plannedSet.has(c))
    .map(c => createEvidenceQuery({ capabilityId: c, source: _sourceLabel(c), outcome: QueryOutcome.SKIPPED_BY_PLAN, freshness: Freshness.UNKNOWN, timeScope: null, executedAt: new Date().toISOString(), lastSyncAt: null, resultIds: [], workspaceId: wsId, error: null }));

  return { results, queries: [...plannedQueries, ...skippedQueries] };
}

/**
 * Legacy compatibility wrapper — returns ONLY the results map, byte-compatible with the
 * previous behavior (planned capabilities only; {records:[],count:0,error:true} on failure).
 * All existing callers keep working unchanged; the answer path migrates to queries in a later phase.
 */
export async function dispatchCapabilities(workspaceId, plan, intent) {
  const { results } = await dispatchWithEvidence(workspaceId, plan, intent);
  return results;
}

// ── Per-capability dispatch ───────────────────────────────────────────────────

async function _dispatch(wsId, capability, limit, intent, isAllowed = () => true) {
  switch (capability) {
    case Capability.ENGINEERING:    return _dispatchEngineering(wsId, limit, intent, isAllowed);
    case Capability.MEETINGS:       return _dispatchMeetings(wsId, limit, intent);
    case Capability.CUSTOMERS:      return _dispatchCustomers(wsId, limit, intent);
    case Capability.INCIDENTS:      return _dispatchIncidents(wsId, limit);
    case Capability.KNOWLEDGE:      return _dispatchKnowledge(wsId, limit, intent);
    case Capability.COMMUNICATIONS: return _dispatchCommunications(wsId, limit, intent, isAllowed);
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

async function _dispatchEngineering(wsId, limit, intent, isAllowed = () => true) {
  const nodeTypes = CAPABILITY_NODE_TYPES[Capability.ENGINEERING];
  const q         = intent.question.toLowerCase();

  // Fetch live connector data in parallel with graph query — but only the providers
  // the plan allows (an explicit Jira question won't hit GitHub, and vice-versa).
  const [liveGithub, liveJira, nodes] = await Promise.all([
    isAllowed('github') ? fetchLiveEngineering(wsId, intent.question).catch(() => null) : Promise.resolve(null),
    isAllowed('jira')   ? fetchLiveJira(wsId, intent.question).catch(() => null)        : Promise.resolve(null),
    (async () => {
      let priorityTypes = nodeTypes;
      if (/pr|pull request|merge|review/.test(q))  priorityTypes = ['PR', 'ISSUE', 'COMMIT'];
      else if (/commit|push|code change/.test(q))  priorityTypes = ['COMMIT', 'PR'];
      else if (/issue|ticket|jira|bug/.test(q))    priorityTypes = ['ISSUE', 'PR'];
      else if (/deploy|release|production/.test(q)) priorityTypes = ['COMMIT', 'PR'];

      // Fetch a QUOTA per type so the focused type (priorityTypes[0]) is guaranteed
      // representation. A single `type IN (...)` + `take: limit` lets whichever type has
      // the most recent rows crowd out the others — a PR-focused query would return 20
      // ISSUEs and zero PRs. The first (focused) type gets the largest share.
      const perType = Math.max(4, Math.ceil(limit / priorityTypes.length));
      const batches = await Promise.all(priorityTypes.map((t, i) =>
        prisma.graphNode.findMany({
          where:   { workspaceId: wsId, type: t },
          orderBy: { createdAt: 'desc' },
          take:    i === 0 ? Math.max(perType, Math.ceil(limit / 2)) : perType,
          select:  { id: true, type: true, name: true, metadata: true, createdAt: true },
        }),
      ));
      // Interleave (focused type first) and cap at limit.
      return batches.flat().slice(0, Math.max(limit, priorityTypes.length * 4));
    })(),
  ]);

  // When a real connector answers, it is AUTHORITATIVE — use only live records so
  // seeded/demo graph data never mixes into (or overrides) the user's real repos.
  // Fall back to graph data, then to the durable event store, when no live data exists.
  const graphRecords = nodes.map(n => _formatNode(n));
  const liveRecords  = [...(liveGithub || []), ...(liveJira || [])];
  const connectors   = [];
  if (isAllowed('github')) connectors.push('github');
  if (isAllowed('jira'))   connectors.push('jira');
  const eventRecords = liveRecords.length || graphRecords.length ? [] : await _eventRecords(wsId, connectors, _engEventToRecord, limit);
  const allRecords   = liveRecords.length ? liveRecords : (graphRecords.length ? graphRecords : eventRecords);

  return {
    capability: Capability.ENGINEERING,
    records:    allRecords,
    count:      allRecords.length,
    liveCount:  liveRecords.length,
    nodeTypes:  [...new Set(allRecords.map(r => r.type))],
  };
}

// ── Meetings ──────────────────────────────────────────────────────────────────

async function _dispatchMeetings(wsId, limit, intent) {
  const [liveRecords, nodes] = await Promise.all([
    fetchLiveMeetings(wsId, intent.question).catch(() => null),
    // 'MEETING' is a real calendar meeting. 'EVENT' is a generic timeline bucket the
    // event platform also fills with incidents/customer/security events — so we only
    // accept an EVENT node when its metadata is actually calendar-shaped (has a
    // start/end/attendees). Otherwise "next meeting" would surface an incident.
    prisma.graphNode.findMany({
      where:   { workspaceId: wsId, type: { in: ['MEETING', 'EVENT'] } },
      orderBy: { createdAt: 'desc' },
      take:    limit * 2,
      select:  { id: true, type: true, name: true, metadata: true, createdAt: true },
    }),
  ]);

  const calendarShaped = (n) => {
    if (n.type === 'MEETING') return true;
    const m = n.metadata || {};
    return !!(m.start || m.startTime || m.start_time || m.attendees || m.location || m.videoUrl || m.calendarId);
  };
  // RC-3 temporal: sort by the REAL meeting start_time (most recent first) and surface it
  // as the record timestamp + `when`, so the Brain cites the actual date from the data
  // instead of inventing one. Nodes without a start time sort last.
  const _startOf = (n) => { const m = n.metadata || {}; const s = m.start_time || m.start || m.startTime; const t = s ? Date.parse(s) : NaN; return Number.isNaN(t) ? null : t; };
  const graphRecords = nodes.filter(calendarShaped)
    .sort((a, b) => (_startOf(b) ?? -Infinity) - (_startOf(a) ?? -Infinity))
    .slice(0, limit)
    .map(n => {
      const r = _formatNode(n);
      const st = n.metadata?.start_time || n.metadata?.start || n.metadata?.startTime || null;
      if (st) { r.ts = st; r.when = st; r.metadata = { ...r.metadata, when: st }; }
      return r;
    });
  const eventRecords = (liveRecords?.length || graphRecords.length) ? [] : await _eventRecords(wsId, ['google-calendar'], _meetingEventToRecord, limit);
  const allRecords   = liveRecords?.length ? liveRecords : (graphRecords.length ? graphRecords : eventRecords);

  return {
    capability: Capability.MEETINGS,
    records:    allRecords,
    count:      allRecords.length,
    liveCount:  liveRecords?.length ?? 0,
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
  const [liveJira, nodes, memRecords] = await Promise.all([
    fetchLiveJira(wsId, intent.question).catch(() => null),
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

  const allRecords = [
    ...(liveJira || []),
    ...nodes.map(n => _formatNode(n)),
    ...memRecords.map(r => ({ type: 'KNOWLEDGE_UPDATE', name: r.title, summary: r.body?.slice(0, 200), ts: r.createdAt })),
  ];

  return {
    capability: Capability.KNOWLEDGE,
    records:   allRecords,
    count:     allRecords.length,
    liveCount: liveJira?.length ?? 0,
  };
}

// ── Communications ────────────────────────────────────────────────────────────

async function _dispatchCommunications(wsId, limit, intent, isAllowed = () => true) {
  // Only fetch the provider(s) the plan allows. "Summarize my unread email" scopes to
  // Gmail only — Slack is never queried, so it can't leak into an email answer.
  const gmailOK = isAllowed('gmail');
  const slackOK = isAllowed('slack');
  // 'COMMUNICATION' is a provider-agnostic bucket that can hold Slack-origin messages,
  // so it's only included when BOTH providers are allowed. A Gmail-only scope reads
  // strictly 'EMAIL' nodes — Slack content can never reach an email answer.
  const graphTypes = [
    ...(gmailOK ? ['EMAIL'] : []),
    ...(slackOK ? ['SLACK_MESSAGE'] : []),
    ...(gmailOK && slackOK ? ['COMMUNICATION'] : []),
  ];
  const [liveGmail, liveSlack, nodes] = await Promise.all([
    gmailOK ? fetchLiveCommunications(wsId, intent.question).catch(() => null) : Promise.resolve(null),
    slackOK ? fetchLiveSlack(wsId, intent.question).catch(() => null)          : Promise.resolve(null),
    graphTypes.length
      ? prisma.graphNode.findMany({
          where:   { workspaceId: wsId, type: { in: graphTypes } },
          orderBy: { createdAt: 'desc' },
          take:    limit,
          select:  { id: true, type: true, name: true, metadata: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Drop generically-named graph nodes (a re-normalized "Email received" with no
  // subject) so they don't shadow the real, richly-titled emails in the event store.
  const graphRecords = nodes.map(n => _formatNode(n)).filter(r => r.name && !_GENERIC_TITLE.test(r.name.trim()));
  const liveRecords  = [...(liveGmail || []), ...(liveSlack || [])];
  const commConnectors = [...(gmailOK ? ['gmail'] : []), ...(slackOK ? ['slack'] : [])];
  const eventRecords = (liveRecords.length || graphRecords.length) ? [] : await _eventRecords(wsId, commConnectors, _commEventToRecord, limit);
  const allRecords   = liveRecords.length ? liveRecords : (graphRecords.length ? graphRecords : eventRecords);

  return {
    capability: Capability.COMMUNICATIONS,
    records:    allRecords,
    count:      allRecords.length,
    liveCount:  liveRecords.length,
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

// ── Event-store → capability record mappers ─────────────────────────────────────
// Map a durable flow_events row into the record shape ContextBuilder expects. Used
// only as the no-live, no-graph fallback (seeded / event-sourced workspaces).

function _engEventToRecord(ev) {
  const m = ev.metadata || {};
  const kind = m.kind || '';
  const actor = ev.actor?.name || ev.actor?.login || null;
  const base = { ts: ev.ts || ev.timestamp || null, actor, metadata: m };
  if (kind === 'commit') {
    return { ...base, type: 'COMMIT', name: m.message || ev.summary || ev.title, sha: m.sha || null, summary: m.message || ev.summary };
  }
  if (kind === 'pull_request') {
    return { ...base, type: 'PR', name: ev.summary || ev.title, status: m.state || 'open', summary: ev.summary };
  }
  if (kind === 'review_requested') {
    return { ...base, type: 'PR', name: ev.title, status: 'review_requested', summary: ev.summary };
  }
  if (kind === 'jira_issue' || kind === 'issue') {
    return { ...base, type: 'ISSUE', name: ev.title, status: m.severity || m.status || null, summary: ev.summary };
  }
  return { ...base, type: 'ENGINEERING', name: ev.title, summary: ev.summary };
}

function _meetingEventToRecord(ev) {
  const m = ev.metadata || {};
  return { type: 'MEETING', name: ev.title, status: null, ts: m.start || ev.ts || ev.timestamp || null, summary: ev.summary || '', metadata: m };
}

function _commEventToRecord(ev) {
  const m = ev.metadata || {};
  const connector = String(ev.connector || ev.source || '').toLowerCase();
  return {
    type: connector === 'slack' ? 'SLACK_MESSAGE' : 'EMAIL',
    name: ev.title, status: null, ts: ev.ts || ev.timestamp || null,
    liveSource: connector,   // grouping label only (Gmail/Slack) — not a "live API" claim
    actor: ev.actor?.name || null, summary: ev.summary || '', metadata: m,
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
