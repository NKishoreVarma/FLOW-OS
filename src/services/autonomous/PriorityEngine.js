/**
 * PriorityEngine — assigns priority, urgency, and impact scores to every work item.
 *
 * Operates on normalized WorkItems — any record can be scored regardless of source.
 * Pure scoring: no external calls, no I/O.
 */

export const Priority = Object.freeze({
  CRITICAL: 'critical',
  HIGH:     'high',
  MEDIUM:   'medium',
  LOW:      'low',
});

const INCIDENT_KEYWORDS  = /outage|down|breach|sev.?[0-2]|p0|p1|critical|production|failed/i;
const STALE_PR_DAYS      = 2;
const BLOCKED_KEYWORDS   = /block|stuck|waiting|hold|escalat/i;
const CUSTOMER_RISK      = /churn|at.risk|escalat|cancel|unhappy|sev|critical/i;

/**
 * Score an array of work items and return them sorted by composite score descending.
 *
 * @param {WorkItem[]} items
 * @returns {ScoredWorkItem[]}
 */
export function prioritize(items) {
  return items
    .map(item => ({ ...item, scores: _score(item) }))
    .sort((a, b) => b.scores.composite - a.scores.composite);
}

/**
 * Score a single item and return its priority envelope.
 */
export function scoreItem(item) {
  return { ...item, scores: _score(item) };
}

// ── Core scoring ──────────────────────────────────────────────────────────────

function _score(item) {
  const type    = (item.type   || '').toUpperCase();
  const name    = (item.name   || '');
  const status  = (item.status || '').toLowerCase();
  const meta    = item.metadata || {};
  const now     = Date.now();
  const ageMs   = item.ts ? now - new Date(item.ts).getTime() : 0;
  const ageDays = ageMs / 86_400_000;

  let urgency         = 0.3;
  let businessImpact  = 0.3;
  let deadlineRisk    = 0.2;
  let customerImpact  = 0.2;
  let engineeringImpact = 0.2;
  let priority        = Priority.LOW;

  // ── Incident ──────────────────────────────────────────────────────────────
  if (type === 'INCIDENT' || INCIDENT_KEYWORDS.test(name)) {
    urgency          = status === 'resolved' ? 0.4 : 1.0;
    businessImpact   = 0.9;
    deadlineRisk     = 0.8;
    customerImpact   = 0.85;
    engineeringImpact = 0.75;
    priority         = status === 'resolved' ? Priority.MEDIUM : Priority.CRITICAL;
  }

  // ── Pull Request ──────────────────────────────────────────────────────────
  else if (type === 'PR') {
    const stale   = ageDays > STALE_PR_DAYS;
    const blocked = BLOCKED_KEYWORDS.test(name + JSON.stringify(meta));
    urgency          = stale ? 0.75 : 0.5;
    businessImpact   = meta.mergeReadinessScore > 80 ? 0.7 : 0.5;
    deadlineRisk     = stale ? 0.7 : 0.3;
    engineeringImpact = 0.7;
    if (blocked)     { urgency = 0.85; deadlineRisk = 0.8; }
    priority = stale || blocked ? Priority.HIGH : Priority.MEDIUM;
  }

  // ── Issue / Ticket ────────────────────────────────────────────────────────
  else if (type === 'ISSUE') {
    const blocked = BLOCKED_KEYWORDS.test(name);
    urgency          = blocked ? 0.8 : 0.4;
    businessImpact   = 0.5;
    deadlineRisk     = ageDays > 7 ? 0.7 : 0.3;
    engineeringImpact = 0.6;
    priority = blocked ? Priority.HIGH : Priority.MEDIUM;
  }

  // ── Customer / CRM ────────────────────────────────────────────────────────
  else if (type === 'CUSTOMER' || type === 'CUSTOMER_EVENT' || type === 'PROJECT_EVENT') {
    const atRisk = CUSTOMER_RISK.test(name + JSON.stringify(meta));
    urgency          = atRisk ? 0.85 : 0.4;
    businessImpact   = atRisk ? 0.9 : 0.5;
    deadlineRisk     = atRisk ? 0.8 : 0.3;
    customerImpact   = atRisk ? 0.95 : 0.5;
    priority = atRisk ? Priority.HIGH : Priority.MEDIUM;
  }

  // ── Meeting ───────────────────────────────────────────────────────────────
  else if (type === 'MEETING' || type === 'EVENT') {
    const hoursUntil = item.ts ? (new Date(item.ts).getTime() - now) / 3_600_000 : 24;
    urgency          = hoursUntil < 1 ? 1.0 : hoursUntil < 4 ? 0.8 : 0.4;
    businessImpact   = 0.6;
    deadlineRisk     = urgency;
    priority = hoursUntil < 2 ? Priority.HIGH : Priority.MEDIUM;
  }

  // ── Recommendation ────────────────────────────────────────────────────────
  else if (type === 'RECOMMENDATION') {
    urgency          = item.confidence ? item.confidence / 100 : 0.6;
    businessImpact   = item.priority === 'critical' ? 0.9 : 0.6;
    priority = item.priority === 'critical' ? Priority.HIGH : Priority.MEDIUM;
  }

  // ── Default ───────────────────────────────────────────────────────────────
  else {
    urgency          = 0.3;
    businessImpact   = 0.3;
    priority         = Priority.LOW;
  }

  const composite = (urgency * 0.35) + (businessImpact * 0.30) + (deadlineRisk * 0.20) +
                    (customerImpact * 0.08) + (engineeringImpact * 0.07);

  return {
    priority,
    urgency:          parseFloat(urgency.toFixed(2)),
    businessImpact:   parseFloat(businessImpact.toFixed(2)),
    deadlineRisk:     parseFloat(deadlineRisk.toFixed(2)),
    customerImpact:   parseFloat(customerImpact.toFixed(2)),
    engineeringImpact:parseFloat(engineeringImpact.toFixed(2)),
    composite:        parseFloat(composite.toFixed(3)),
    owner:            item.metadata?.owner || item.metadata?.assignee || item.metadata?.author || null,
    confidence:       Math.round(Math.min(100, composite * 120)),
  };
}
