/**
 * EventNormalizer — converts every source's raw payload into a CompanyEvent.
 *
 * All connectors (GitHub, Slack, Jira, Gmail, Calendar, etc.) produce
 * different shapes. The normalizer is the single translation boundary.
 * Downstream systems only see CompanyEvent — never provider fields.
 *
 * Sources handled:
 *   github, slack, jira, gmail, calendar, notion, hubspot, salesforce,
 *   workday, bamboohr, ingestion_worker, connector_action, manual
 */

import { randomUUID } from 'crypto';

// ── Event type taxonomy ───────────────────────────────────────────────────────

export const EventType = Object.freeze({
  ENGINEERING:  'engineering',
  MEETING:      'meeting',
  DEPLOYMENT:   'deployment',
  INCIDENT:     'incident',
  APPROVAL:     'approval',
  CUSTOMER:     'customer',
  KNOWLEDGE:    'knowledge',
  AUTOMATION:   'automation',
  SECURITY:     'security',
  FINANCE:      'finance',
  HR:           'hr',
  COMMUNICATION:'communication',
  COMPLIANCE:   'compliance',
  CUSTOM:       'custom',
});

// ── Icon map ──────────────────────────────────────────────────────────────────

const EVENT_ICONS = {
  [EventType.ENGINEERING]:   '🟣',
  [EventType.MEETING]:       '🔵',
  [EventType.DEPLOYMENT]:    '🟢',
  [EventType.INCIDENT]:      '🔴',
  [EventType.APPROVAL]:      '🟡',
  [EventType.CUSTOMER]:      '🟠',
  [EventType.KNOWLEDGE]:     '📄',
  [EventType.AUTOMATION]:    '⚙️',
  [EventType.SECURITY]:      '🔐',
  [EventType.FINANCE]:       '💰',
  [EventType.HR]:            '👤',
  [EventType.COMMUNICATION]: '✉️',
  [EventType.COMPLIANCE]:    '✅',
  [EventType.CUSTOM]:        '⚡',
};

// ── CompanyEvent factory ──────────────────────────────────────────────────────

/**
 * Create a CompanyEvent — the canonical event representation inside FLOW.
 *
 * @param {Partial<CompanyEvent>} fields
 * @returns {CompanyEvent}
 */
export function createCompanyEvent({
  id              = randomUUID(),
  workspaceId,
  type            = EventType.CUSTOM,
  source          = 'unknown',
  sourceEventId   = null,
  title           = '',
  summary         = '',
  actors          = [],   // [{ type: 'USER|SYSTEM', id, name }]
  entities        = [],   // [{ type: string, id, name, url }]
  priority        = 'medium',
  severity        = 0.5,
  urgency         = 0.5,
  confidence      = 70,
  businessImpact  = 0.5,
  affectedTeams   = [],
  affectedCustomers = [],
  affectedProjects  = [],
  correlatedEventIds = [],
  correlationGroupId = null,
  metadata        = {},
  ts              = new Date().toISOString(),
  resolvedAt      = null,
} = {}) {
  return {
    id, workspaceId, type, source, sourceEventId,
    title, summary,
    icon: EVENT_ICONS[type] || '⚡',
    actors, entities, priority, severity, urgency, confidence,
    businessImpact, affectedTeams, affectedCustomers, affectedProjects,
    correlatedEventIds, correlationGroupId,
    metadata, ts, resolvedAt,
  };
}

// ── Normalize dispatch ────────────────────────────────────────────────────────

/**
 * Normalize any raw event payload into a CompanyEvent.
 *
 * @param {string} workspaceId
 * @param {string} source  — connector/source identifier
 * @param {string} rawType — source-native event type
 * @param {Object} payload — raw connector payload
 * @returns {CompanyEvent}
 */
export function normalizeEvent(workspaceId, source, rawType, payload = {}) {
  const base = { workspaceId, source, ts: payload.ts || payload.timestamp || new Date().toISOString() };

  switch (source.toLowerCase()) {
    case 'github':       return _normalizeGitHub(base, rawType, payload);
    case 'jira':         return _normalizeJira(base, rawType, payload);
    case 'slack':        return _normalizeSlack(base, rawType, payload);
    case 'gmail':        return _normalizeGmail(base, rawType, payload);
    case 'calendar':
    case 'google-calendar': return _normalizeCalendar(base, rawType, payload);
    case 'hubspot':
    case 'salesforce':   return _normalizeCRM(base, source, rawType, payload);
    case 'workday':
    case 'bamboohr':     return _normalizeHR(base, source, rawType, payload);
    case 'notion':
    case 'confluence':
    case 'googledrive':  return _normalizeKnowledge(base, source, rawType, payload);
    case 'ingestion_worker': return _normalizeIngestion(base, rawType, payload);
    case 'connector_action': return _normalizeConnectorAction(base, rawType, payload);
    default:             return _normalizeGeneric(base, rawType, payload);
  }
}

// ── Source normalizers ────────────────────────────────────────────────────────

function _normalizeGitHub(base, rawType, p) {
  const isPR        = /pull_request|pr/i.test(rawType);
  const isCommit    = /commit|push/i.test(rawType);
  const isDeploy    = /deploy/i.test(rawType);
  const isIncident  = /incident|outage|alert/i.test(rawType);

  const type = isDeploy ? EventType.DEPLOYMENT
    : isIncident ? EventType.INCIDENT
    : EventType.ENGINEERING;

  return createCompanyEvent({
    ...base, type,
    sourceEventId: p.id || p.number ? String(p.number || p.id) : null,
    title:   p.title || (isCommit ? `Commit: ${(p.message || '').slice(0, 60)}` : `PR #${p.number}`),
    summary: p.summary || p.body?.slice(0, 200) || p.message || '',
    actors:  p.author ? [{ type: 'USER', id: p.author, name: p.author }] : [],
    entities: [{ type: isPR ? 'PR' : isCommit ? 'COMMIT' : 'REPO', id: String(p.number || p.sha || p.id || ''), name: p.title || p.repo || '' }],
    priority: isDeploy ? 'high' : 'medium',
    severity: isDeploy ? 0.7 : 0.5,
    urgency:  isDeploy ? 0.7 : 0.4,
    businessImpact: isDeploy ? 0.8 : 0.5,
    metadata: { repo: p.repo, number: p.number, sha: p.sha, state: p.state, ...p.metadata },
  });
}

function _normalizeJira(base, rawType, p) {
  const isIncident = /incident|outage|sev/i.test(`${p.priority || ''} ${rawType}`);
  return createCompanyEvent({
    ...base,
    type:     isIncident ? EventType.INCIDENT : EventType.ENGINEERING,
    sourceEventId: p.id || p.key,
    title:    p.title || p.summary || p.key,
    summary:  p.description?.slice(0, 200) || '',
    actors:   p.assignee ? [{ type: 'USER', id: p.assignee, name: p.assignee }] : [],
    entities: [{ type: 'ISSUE', id: String(p.key || p.id || ''), name: p.title || p.key }],
    priority: p.priority === 'Critical' ? 'critical' : p.priority === 'High' ? 'high' : 'medium',
    severity: isIncident ? 0.8 : 0.4,
    urgency:  isIncident ? 0.8 : 0.3,
    businessImpact: 0.5,
    metadata: p,
  });
}

function _normalizeSlack(base, rawType, p) {
  const isIncident = /incident|outage|down|broke/i.test(p.text || '');
  return createCompanyEvent({
    ...base,
    type:    isIncident ? EventType.INCIDENT : EventType.COMMUNICATION,
    sourceEventId: p.ts || p.id,
    title:   p.channel ? `#${p.channel}: ${(p.text || '').slice(0, 80)}` : (p.text || '').slice(0, 80),
    summary: p.text || '',
    actors:  p.sender ? [{ type: 'USER', id: p.sender, name: p.sender }] : [],
    entities:[{ type: 'CHANNEL', id: p.channel || '', name: `#${p.channel || 'general'}` }],
    priority: isIncident ? 'high' : 'low',
    severity: isIncident ? 0.8 : 0.2,
    urgency:  isIncident ? 0.7 : 0.2,
    businessImpact: 0.3,
    metadata: p,
  });
}

function _normalizeGmail(base, rawType, p) {
  const isEscalation = /urgent|escalat|critical|asap|follow.up/i.test(p.subject || p.title || '');
  return createCompanyEvent({
    ...base,
    type:    EventType.COMMUNICATION,
    sourceEventId: p.id || p.messageId,
    title:   p.subject || p.title || 'Email received',
    summary: p.snippet || p.summary || '',
    actors:  p.from ? [{ type: 'USER', id: p.from, name: p.from }] : [],
    entities:[],
    priority: isEscalation ? 'high' : 'low',
    severity: isEscalation ? 0.7 : 0.2,
    urgency:  isEscalation ? 0.7 : 0.2,
    businessImpact: 0.3,
    metadata: p,
  });
}

function _normalizeCalendar(base, rawType, p) {
  const now          = Date.now();
  const startMs      = p.start ? new Date(p.start).getTime() : now + 3600000;
  const hoursUntil   = (startMs - now) / 3_600_000;
  return createCompanyEvent({
    ...base,
    type:    EventType.MEETING,
    sourceEventId: p.id,
    title:   p.title || p.summary || 'Meeting',
    summary: p.description || '',
    actors:  (p.attendees || []).slice(0, 3).map(a => ({ type: 'USER', id: a.email || a, name: a.name || a.email || a })),
    entities:[{ type: 'EVENT', id: p.id || '', name: p.title || '' }],
    priority: hoursUntil < 1 ? 'high' : 'medium',
    severity: 0.4,
    urgency:  hoursUntil < 1 ? 0.9 : hoursUntil < 4 ? 0.6 : 0.3,
    businessImpact: 0.5,
    metadata: p,
  });
}

function _normalizeCRM(base, source, rawType, p) {
  const isAtRisk = /churn|at.risk|escalat|cancel|unhappy/i.test(JSON.stringify(p));
  return createCompanyEvent({
    ...base,
    type:    EventType.CUSTOMER,
    source,
    sourceEventId: p.id,
    title:   p.name || p.company || p.accountName || 'Customer update',
    summary: p.summary || p.description || '',
    actors:  p.owner ? [{ type: 'USER', id: p.owner, name: p.owner }] : [],
    entities:[{ type: 'CUSTOMER', id: String(p.id || ''), name: p.name || p.company || '' }],
    priority:       isAtRisk ? 'high' : 'medium',
    severity:       isAtRisk ? 0.8 : 0.4,
    urgency:        isAtRisk ? 0.8 : 0.3,
    businessImpact: isAtRisk ? 0.9 : 0.5,
    affectedCustomers: [p.name || p.company || ''].filter(Boolean),
    metadata: p,
  });
}

function _normalizeHR(base, source, rawType, p) {
  return createCompanyEvent({
    ...base,
    type:    EventType.HR,
    source,
    sourceEventId: p.id,
    title:   p.title || p.name || 'HR update',
    summary: p.summary || p.description || '',
    actors:  p.employeeName ? [{ type: 'USER', id: p.employeeId || p.employeeName, name: p.employeeName }] : [],
    entities:[{ type: 'EMPLOYEE', id: String(p.id || ''), name: p.employeeName || p.name || '' }],
    priority: 'low',
    severity: 0.3,
    urgency:  0.2,
    businessImpact: 0.3,
    metadata: p,
  });
}

function _normalizeKnowledge(base, source, rawType, p) {
  return createCompanyEvent({
    ...base,
    type:    EventType.KNOWLEDGE,
    source,
    sourceEventId: p.id,
    title:   p.title || p.name || 'Document updated',
    summary: p.summary || p.description || '',
    actors:  p.author ? [{ type: 'USER', id: p.author, name: p.author }] : [],
    entities:[{ type: 'DOCUMENT', id: String(p.id || ''), name: p.title || p.name || '' }],
    priority: 'low',
    severity: 0.2,
    urgency:  0.2,
    businessImpact: 0.3,
    metadata: p,
  });
}

function _normalizeIngestion(base, rawType, p) {
  const text = p.text || p.parsedText || '';
  const isIncident = /incident|outage|down|sev[0-3]|p[01]/i.test(text);
  const platform  = p.platform || p.source || 'internal';

  return createCompanyEvent({
    ...base,
    type:     isIncident ? EventType.INCIDENT : EventType.COMMUNICATION,
    source:   platform,
    sourceEventId: p.traceId || null,
    title:    `${p.sender || 'System'}: ${text.slice(0, 80)}`,
    summary:  text.slice(0, 300),
    actors:   p.sender ? [{ type: 'USER', id: p.sender, name: p.sender }] : [],
    entities: [],
    priority: isIncident ? 'high' : 'low',
    severity: isIncident ? 0.7 : 0.2,
    urgency:  isIncident ? 0.7 : 0.2,
    businessImpact: 0.3,
    metadata: { platform, channel: p.channel, sender: p.sender },
  });
}

function _normalizeConnectorAction(base, rawType, p) {
  const isDeploy  = /deploy/i.test(rawType + ' ' + (p.actionType || ''));
  const isApprove = /approv|approve/i.test(rawType + ' ' + (p.actionType || ''));
  const type = isDeploy ? EventType.DEPLOYMENT
    : isApprove ? EventType.APPROVAL
    : EventType.AUTOMATION;

  return createCompanyEvent({
    ...base,
    type,
    sourceEventId: p.auditId || p.actionId,
    title:   p.title || `${p.actionType || 'Action'} executed via ${p.connectorId || 'connector'}`,
    summary: p.summary || '',
    actors:  p.userId ? [{ type: 'USER', id: p.userId, name: p.userId }] : [{ type: 'SYSTEM', id: 'flow', name: 'FLOW' }],
    entities:[],
    priority:       isDeploy ? 'high' : 'medium',
    severity:       isDeploy ? 0.7 : 0.4,
    urgency:        0.5,
    businessImpact: isDeploy ? 0.8 : 0.4,
    metadata: p,
  });
}

function _normalizeGeneric(base, rawType, p) {
  return createCompanyEvent({
    ...base,
    type:     EventType.CUSTOM,
    sourceEventId: p.id,
    title:    p.title || p.name || rawType || 'Event',
    summary:  p.summary || p.description || p.text || '',
    actors:   p.actor ? [{ type: 'USER', id: p.actor, name: p.actor }] : [],
    entities: [],
    priority: 'low',
    severity: 0.3,
    urgency:  0.3,
    businessImpact: 0.3,
    metadata: p,
  });
}
