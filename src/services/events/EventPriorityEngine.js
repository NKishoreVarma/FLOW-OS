/**
 * EventPriorityEngine — scores every CompanyEvent with priority dimensions.
 *
 * Builds on the autonomous PriorityEngine but operates on CompanyEvent shapes.
 * Returns the event with all scoring fields populated in-place.
 */

import { EventType } from './EventNormalizer.js';

const INCIDENT_KEYWORDS = /outage|down|breach|sev.?[0-2]|p0|p1|critical|production.*fail|fail.*production/i;
const SECURITY_KEYWORDS = /breach|intrusion|vulnerab|exploit|leaked|exposed|unauthori/i;
const CUSTOMER_RISK     = /churn|at.risk|escalat|cancel|unhappy|sev|critical|renewal/i;

/**
 * Score a CompanyEvent and return it with populated priority fields.
 *
 * @param {import('./EventNormalizer.js').CompanyEvent} event
 * @returns {import('./EventNormalizer.js').CompanyEvent}
 */
export function scoreEvent(event) {
  const scores = _computeScores(event);

  event.priority       = scores.priority;
  event.severity       = scores.severity;
  event.urgency        = scores.urgency;
  event.confidence     = scores.confidence;
  event.businessImpact = scores.businessImpact;

  if (!event.affectedTeams?.length) {
    event.affectedTeams = _inferAffectedTeams(event);
  }

  return event;
}

// ── Scoring logic ─────────────────────────────────────────────────────────────

function _computeScores(event) {
  const { type, title = '', summary = '', metadata = {} } = event;
  const text = `${title} ${summary}`.toLowerCase();
  const now  = Date.now();

  let priority       = 'medium';
  let severity       = 0.4;
  let urgency        = 0.4;
  let confidence     = 75;
  let businessImpact = 0.4;

  switch (type) {
    case EventType.INCIDENT: {
      const isProduction = /prod|production/i.test(text);
      const matchSev     = INCIDENT_KEYWORDS.test(text);
      severity       = matchSev || isProduction ? 0.95 : 0.7;
      urgency        = matchSev || isProduction ? 1.0  : 0.75;
      businessImpact = isProduction ? 0.95 : 0.75;
      priority       = urgency >= 0.9 ? 'critical' : 'high';
      confidence     = 90;
      break;
    }
    case EventType.SECURITY: {
      const isSevere = SECURITY_KEYWORDS.test(text);
      severity       = isSevere ? 0.95 : 0.7;
      urgency        = isSevere ? 1.0  : 0.8;
      businessImpact = 0.9;
      priority       = 'critical';
      confidence     = 90;
      break;
    }
    case EventType.DEPLOYMENT: {
      const isFailed = /fail|error|rollback|revert/i.test(text);
      severity       = isFailed ? 0.85 : 0.5;
      urgency        = isFailed ? 0.9  : 0.6;
      businessImpact = 0.75;
      priority       = isFailed ? 'critical' : 'high';
      confidence     = 85;
      break;
    }
    case EventType.CUSTOMER: {
      const atRisk = CUSTOMER_RISK.test(text + JSON.stringify(metadata));
      severity       = atRisk ? 0.8 : 0.4;
      urgency        = atRisk ? 0.8 : 0.3;
      businessImpact = atRisk ? 0.9 : 0.5;
      priority       = atRisk ? 'high' : 'medium';
      confidence     = atRisk ? 85 : 70;
      break;
    }
    case EventType.APPROVAL: {
      severity       = 0.6;
      urgency        = 0.7;
      businessImpact = 0.6;
      priority       = 'high';
      confidence     = 90;
      break;
    }
    case EventType.MEETING: {
      const startMs    = event.ts ? new Date(event.ts).getTime() : now + 3600000;
      const hoursUntil = (startMs - now) / 3_600_000;
      urgency        = hoursUntil < 0.5 ? 1.0 : hoursUntil < 2 ? 0.8 : 0.3;
      severity       = 0.3;
      businessImpact = 0.5;
      priority       = hoursUntil < 1 ? 'high' : 'medium';
      confidence     = 95;
      break;
    }
    case EventType.ENGINEERING: {
      const isMerge  = /merge|merged/i.test(text);
      const isBlock  = /block|stuck|conflict/i.test(text);
      urgency        = isBlock ? 0.75 : isMerge ? 0.5 : 0.35;
      severity       = isBlock ? 0.6  : 0.3;
      businessImpact = isMerge ? 0.6 : 0.4;
      priority       = isBlock ? 'high' : 'medium';
      confidence     = 80;
      break;
    }
    case EventType.HR: {
      const isOffboard = /offboard|terminat|resign|left|departure/i.test(text);
      severity       = isOffboard ? 0.6 : 0.2;
      urgency        = isOffboard ? 0.5 : 0.2;
      businessImpact = isOffboard ? 0.5 : 0.2;
      priority       = isOffboard ? 'medium' : 'low';
      confidence     = 80;
      break;
    }
    case EventType.COMPLIANCE: {
      severity       = 0.8;
      urgency        = 0.7;
      businessImpact = 0.9;
      priority       = 'high';
      confidence     = 80;
      break;
    }
    default: {
      severity       = 0.3;
      urgency        = 0.3;
      businessImpact = 0.3;
      priority       = 'low';
      confidence     = 65;
    }
  }

  return { priority, severity, urgency, confidence, businessImpact };
}

function _inferAffectedTeams(event) {
  const type = event.type;
  const map = {
    [EventType.ENGINEERING]:   ['engineering'],
    [EventType.DEPLOYMENT]:    ['engineering', 'operations'],
    [EventType.INCIDENT]:      ['engineering', 'operations', 'support'],
    [EventType.CUSTOMER]:      ['sales', 'customer success', 'support'],
    [EventType.HR]:            ['hr', 'operations'],
    [EventType.SECURITY]:      ['security', 'engineering'],
    [EventType.COMPLIANCE]:    ['legal', 'operations'],
    [EventType.FINANCE]:       ['finance'],
    [EventType.MEETING]:       [],
    [EventType.COMMUNICATION]: [],
    [EventType.KNOWLEDGE]:     [],
    [EventType.AUTOMATION]:    ['operations'],
    [EventType.APPROVAL]:      ['operations'],
    [EventType.CUSTOM]:        [],
  };
  return map[type] || [];
}
