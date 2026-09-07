/**
 * Executive Timeline Engine — chronological operational timeline.
 *
 * Pulls events from:
 *   - flow_events (deployments, incidents, decisions, escalations, hiring)
 *   - execution_records (governed actions taken)
 *   - pending_approvals (governance decisions)
 *   - OrgMemoryRecord (DECISION type)
 *
 * Returns a structured timeline with entries grouped by day and typed for
 * rendering in an executive briefing or dashboard.
 */

import * as EventStore      from '../events/EventStore.js';
import { queryMemory }      from '../services/orgMemoryService.js';
import { listExecutionRecords } from '../execution/executionHistory.js';
import db                   from '../config/db.js';

const MS_PER_DAY = 86_400_000;
function since(days) { return new Date(Date.now() - days * MS_PER_DAY); }

// Event types surfaced on the executive timeline
const EXECUTIVE_EVENT_TYPES = [
  'deployment.completed',
  'deployment.failed',
  'incident.created',
  'incident.resolved',
  'customer.escalated',
  'customer.churned',
  'employee.onboarded',
  'employee.offboarded',
  'policy.created',
  'policy.updated',
  'security.alert',
  'security.breach',
  'sprint.completed',
  'release.published',
];

/**
 * Build the executive timeline.
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {number} [opts.windowDays=30]  - how far back to look
 * @param {number} [opts.limit=100]      - max entries
 * @param {string} [opts.category]       - filter: deployments|incidents|decisions|hr|customers|policy
 * @returns {Promise<TimelineReport>}
 */
export async function buildTimeline(workspaceId, { windowDays = 30, limit = 100, category } = {}) {
  const ws = String(workspaceId);

  const [eventsResult, decisionsResult, execResult, approvalsResult] = await Promise.allSettled([
    _fetchPlatformEvents(ws, windowDays, category),
    _fetchDecisions(ws, windowDays, category),
    _fetchExecutions(ws, windowDays, category),
    _fetchApprovalDecisions(ws, windowDays, category),
  ]);

  const entries = [
    ...(eventsResult.status   === 'fulfilled' ? eventsResult.value   : []),
    ...(decisionsResult.status === 'fulfilled' ? decisionsResult.value : []),
    ...(execResult.status     === 'fulfilled' ? execResult.value     : []),
    ...(approvalsResult.status === 'fulfilled' ? approvalsResult.value : []),
  ];

  // Sort newest first
  entries.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const trimmed = entries.slice(0, limit);

  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    windowDays,
    category:    category || 'all',
    totalEntries: trimmed.length,
    entries:     trimmed,
    grouped:     _groupByDay(trimmed),
  };
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function _fetchPlatformEvents(ws, windowDays, category) {
  const types = _filterEventTypes(category);
  if (!types.length) return [];

  const all = await Promise.allSettled(
    types.map(eventType =>
      EventStore.query({ workspaceId: ws, eventType, since: since(windowDays), limit: 50, order: 'DESC' })
    )
  );

  return all
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .map(ev => ({
      id:       ev.id,
      ts:       ev.ts,
      type:     _eventTypeToCategory(ev.eventType),
      subtype:  ev.eventType,
      title:    ev.title || _eventTypeToTitle(ev.eventType, ev.metadata),
      summary:  ev.summary || '',
      actor:    ev.actor?.name || ev.actor?.id || null,
      connector: ev.connector || null,
      metadata: ev.metadata || {},
      source:   'event_platform',
    }));
}

async function _fetchDecisions(ws, windowDays, category) {
  if (category && category !== 'decisions') return [];
  try {
    const decisions = await queryMemory(ws, 'DECISION', { hours: windowDays * 24, limit: 30 });
    return decisions.map(d => ({
      id:       d.id,
      ts:       d.createdAt,
      type:     'decision',
      subtype:  'major_decision',
      title:    d.title,
      summary:  d.body?.slice(0, 200) || '',
      actor:    d.author || null,
      connector: null,
      metadata: d.metadata || {},
      source:   'memory',
    }));
  } catch { return []; }
}

async function _fetchExecutions(ws, windowDays, category) {
  if (category && !['deployments', 'decisions'].includes(category)) return [];
  try {
    const records = await listExecutionRecords(ws, { limit: 50, status: 'EXECUTED' });
    const cutoff  = since(windowDays);
    return records
      .filter(r => new Date(r.createdAt) >= cutoff)
      .map(r => ({
        id:       r.id,
        ts:       r.updatedAt || r.createdAt,
        type:     'execution',
        subtype:  r.actionType || 'action',
        title:    `Executed: ${r.actionType || 'workflow action'}`,
        summary:  r.description || '',
        actor:    r.requestedBy || null,
        connector: r.connectorId || null,
        metadata: { riskLevel: r.riskLevel, status: r.status },
        source:   'execution_records',
      }));
  } catch { return []; }
}

async function _fetchApprovalDecisions(ws, windowDays, category) {
  if (category && category !== 'decisions') return [];
  try {
    const { rows } = await db.query(
      `SELECT id, action_type, status, risk_level, requested_by, resolved_by, resolved_at, created_at, metadata
         FROM pending_approvals
        WHERE workspace_id = $1
          AND status IN ('APPROVED','REJECTED')
          AND resolved_at >= $2
        ORDER BY resolved_at DESC
        LIMIT 30`,
      [ws, since(windowDays)],
    );
    return rows.map(r => ({
      id:       r.id,
      ts:       r.resolved_at,
      type:     'approval',
      subtype:  r.status === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
      title:    `${r.status}: ${r.action_type || 'governance action'}`,
      summary:  `Risk level: ${r.risk_level || 'unknown'}. Resolved by ${r.resolved_by || 'unknown'}.`,
      actor:    r.resolved_by || null,
      connector: null,
      metadata: { riskLevel: r.risk_level, requestedBy: r.requested_by, ...(r.metadata || {}) },
      source:   'approvals',
    }));
  } catch { return []; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _filterEventTypes(category) {
  if (!category || category === 'all') return EXECUTIVE_EVENT_TYPES;
  const categoryMap = {
    deployments: ['deployment.completed', 'deployment.failed', 'release.published'],
    incidents:   ['incident.created', 'incident.resolved', 'security.alert', 'security.breach'],
    customers:   ['customer.escalated', 'customer.churned'],
    hr:          ['employee.onboarded', 'employee.offboarded'],
    policy:      ['policy.created', 'policy.updated'],
    engineering: ['deployment.completed', 'deployment.failed', 'sprint.completed', 'release.published'],
  };
  return categoryMap[category] || EXECUTIVE_EVENT_TYPES;
}

function _eventTypeToCategory(eventType) {
  if (eventType.startsWith('deployment') || eventType.startsWith('release') || eventType === 'sprint.completed') return 'deployment';
  if (eventType.startsWith('incident') || eventType.startsWith('security')) return 'incident';
  if (eventType.startsWith('customer')) return 'customer';
  if (eventType.startsWith('employee')) return 'hr';
  if (eventType.startsWith('policy')) return 'policy';
  return 'event';
}

function _eventTypeToTitle(eventType, metadata = {}) {
  const titles = {
    'deployment.completed': `Deployment completed${metadata.environment ? ` to ${metadata.environment}` : ''}`,
    'deployment.failed':    `Deployment failed${metadata.environment ? ` in ${metadata.environment}` : ''}`,
    'incident.created':     `Incident created: ${metadata.title || 'unknown'}`,
    'incident.resolved':    `Incident resolved: ${metadata.title || 'unknown'}`,
    'customer.escalated':   `Customer escalation: ${metadata.customerName || 'unknown account'}`,
    'customer.churned':     `Customer churned: ${metadata.customerName || 'unknown account'}`,
    'employee.onboarded':   `New hire onboarded: ${metadata.name || 'team member'}`,
    'employee.offboarded':  `Employee departure: ${metadata.name || 'team member'}`,
    'policy.created':       `New policy: ${metadata.name || 'governance policy'}`,
    'policy.updated':       `Policy updated: ${metadata.name || 'governance policy'}`,
    'security.alert':       `Security alert: ${metadata.title || 'security event'}`,
    'security.breach':      `Security breach detected`,
    'sprint.completed':     `Sprint completed: ${metadata.sprintName || 'sprint'}`,
    'release.published':    `Release published: ${metadata.version || 'new version'}`,
  };
  return titles[eventType] || eventType;
}

function _groupByDay(entries) {
  const groups = {};
  for (const entry of entries) {
    const day = new Date(entry.ts).toISOString().slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(entry);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, count: items.length, entries: items }));
}
