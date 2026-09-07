/**
 * ConsequenceEngine — FLOW's cross-tool consequence detector.
 *
 * Competitors answer questions about one tool. FLOW connects signals ACROSS tools
 * that touch the same entity (a customer, a person, a project) and surfaces the
 * consequence BEFORE it becomes a problem — with the evidence chain and a ready action.
 *
 * This is ORCHESTRATION, not a new intelligence engine. It consumes:
 *   • Prediction Engine (11.5)  → the consequence + probability + target + evidence  (Layer 3)
 *   • Event Platform (11.0)     → the real cross-tool signals that corroborate it     (Layer 2)
 *   • Operational Graph (11.1)  → who/what the entity is connected to                  (Layer 1)
 * Each detected consequence carries a recommended action (Layer 5) drawn from the
 * prediction's grounded preventive actions.
 *
 * Nothing is fabricated: every consequence traces to a real prediction whose
 * probability is a bounded function of real signals, plus real events from the store.
 */

import { predict }      from '../predictions/index.js';
import { query as queryEvents } from '../events/EventStore.js';
import { logger }       from '../utils/logger.js';

// Prediction type → consequence framing. Only these become proactive consequences;
// low-signal predictions stay in the prediction workspace, not the "FLOW DETECTED" feed.
// Prediction type → consequence framing + the ONE follow-up question that makes a
// CTO lean forward. Every consequence is grounded in a real prediction whose
// probability is a bounded function of real cross-tool signals — never a fabricated
// threshold match. Follow-ups map to what FLOW can actually do next.
const PATTERNS = {
  CHURN_RISK:      { id: 'client_churn_risk',    headline: 'renewal at risk',        severity: 'critical', action: { type: 'draft_recovery_email',      label: 'Send recovery draft' },        followUp: 'Want me to draft a recovery email to them?' },
  PR_BOTTLENECK:   { id: 'developer_blocked',    headline: 'is blocked',             severity: 'high',     action: { type: 'notify_manager',            label: "Notify their manager" },       followUp: 'Want me to nudge the reviewers or reassign it?' },
  REVIEW_DELAY:    { id: 'developer_blocked',    headline: 'is waiting on review',   severity: 'high',     action: { type: 'notify_manager',            label: 'Nudge reviewers' },            followUp: 'Want me to ping the reviewers on this?' },
  BUS_FACTOR:      { id: 'knowledge_loss_risk',  headline: 'is a key-person risk',   severity: 'high',     action: { type: 'schedule_knowledge_transfer', label: 'Schedule knowledge transfer' }, followUp: 'Want me to schedule a knowledge-transfer session?' },
  KNOWLEDGE_LOSS:  { id: 'knowledge_loss_risk',  headline: 'is a knowledge-loss risk', severity: 'high',   action: { type: 'schedule_knowledge_transfer', label: 'Schedule knowledge transfer' }, followUp: 'Want me to line up a second owner for this area?' },
  CODE_OWNERSHIP_RISK: { id: 'knowledge_loss_risk', headline: 'is a key-person risk',      severity: 'critical', action: { type: 'schedule_knowledge_transfer', label: 'Schedule knowledge transfer' }, followUp: 'Want me to propose a knowledge-transfer plan?' },
  EMPLOYEE_DEPENDENCY: { id: 'knowledge_loss_risk', headline: 'is a key-person dependency', severity: 'high',   action: { type: 'schedule_knowledge_transfer', label: 'Schedule knowledge transfer' }, followUp: 'Want me to suggest a second owner for this area?' },
  DEPLOYMENT_RISK: { id: 'deployment_risk',      headline: 'deployment at risk',     severity: 'critical', action: { type: 'notify_engineering_lead',   label: 'Alert engineering lead' },     followUp: 'Want me to alert the on-call and open an incident?' },
  SPRINT_DELAY:    { id: 'delivery_risk',        headline: 'delivery at risk',       severity: 'high',     action: { type: 'escalate_delivery',         label: 'Flag the slip' },              followUp: 'Want me to flag the slip and suggest what to move?' },
  BURNOUT_RISK:    { id: 'burnout_risk',         headline: 'is at burnout risk',     severity: 'high',     action: { type: 'rebalance_workload',        label: 'Rebalance workload' },         followUp: 'Want me to suggest which tickets to reassign?' },
  INCIDENT_RISK:   { id: 'incident_risk',        headline: 'operational risk rising', severity: 'high',    action: { type: 'review_incident',           label: 'Review the incident' },        followUp: 'Want me to pull the incident timeline?' },
  INCIDENT_PROBABILITY: { id: 'incident_risk',   headline: 'operational risk rising', severity: 'high',    action: { type: 'review_incident',           label: 'Review the risk' },            followUp: "Want me to review what's driving the risk?" },
  MEETING_OVERLOAD: { id: 'meeting_overload',    headline: 'is in back-to-back meetings', severity: 'high', action: { type: 'protect_focus_time',        label: 'Block focus time' },           followUp: 'Want me to block focus time on their calendar?' },
  SUPPORT_ESCALATION: { id: 'support_escalation', headline: 'support is escalating', severity: 'high',      action: { type: 'escalate_to_csm',           label: 'Escalate to CS lead' },        followUp: 'Want me to escalate this and draft a recovery note?' },
  RENEWAL_RISK:    { id: 'renewal_risk',         headline: 'renewal window is open', severity: 'high',      action: { type: 'draft_renewal_email',       label: 'Start renewal conversation' }, followUp: 'Want me to draft a renewal email and schedule a call?' },
  CUSTOMER_HEALTH: { id: 'customer_health_risk', headline: 'health is declining',    severity: 'high',      action: { type: 'review_account',            label: 'Review the account' },         followUp: "Want me to summarize what's driving the decline?" },
  CAPACITY_RISK:   { id: 'capacity_risk',        headline: 'team capacity is stretched', severity: 'high',  action: { type: 'rebalance_workload',        label: 'Review capacity' },            followUp: "Want me to show who's overloaded right now?" },
  SECURITY_DRIFT:  { id: 'security_risk',        headline: 'security posture is drifting', severity: 'critical', action: { type: 'notify_security_lead',  label: 'Alert security lead' },        followUp: 'Want me to open a security review ticket?' },
  INTEGRATION_FAILURE: { id: 'integration_failure', headline: 'an integration is failing', severity: 'high', action: { type: 'check_connector_health',   label: 'Check connector health' },     followUp: 'Want me to check which connector is failing?' },
};

// Only surface predictions above this probability — a consequence is a real risk,
// not a whisper. (probability is a 0-100 percent from the reporter.)
const MIN_PROBABILITY = 55;

const CONNECTOR_LABEL = {
  github: 'GitHub', gmail: 'Gmail', 'google-calendar': 'Calendar', slack: 'Slack',
  jira: 'Jira', notion: 'Notion', hubspot: 'HubSpot',
};

// Real tools only — the evidence chain must never cite plumbing events.
const REAL_CONNECTORS = new Set(['github', 'gmail', 'google-calendar', 'slack', 'jira', 'notion', 'hubspot']);
const NOISE_TEXT = /read via|connector[_\s-]?action|action executed|health score|#?undefined|prediction|bus_factor|org memory|cognitive routing/i;

function _isRealSignal(ev) {
  const connector = String(ev.connector || '').toLowerCase();
  if (!REAL_CONNECTORS.has(connector)) return false;
  const text = `${ev.title || ''} ${ev.summary || ''}`;
  if (NOISE_TEXT.test(text)) return false;
  return true;
}

// preventiveActions items may be strings or objects — extract readable text.
function _actionText(a) {
  if (!a) return null;
  if (typeof a === 'string') return a;
  return a.text || a.detail || a.title || a.label || a.action || null;
}

/**
 * Detect cross-tool consequences for a workspace.
 * @returns {Promise<Consequence[]>} sorted by severity then probability.
 */
export async function detectConsequences(workspaceId, { minProbability = MIN_PROBABILITY } = {}) {
  const wsId = String(workspaceId);

  // 1. Predictions carry the consequence, probability, target entity, and evidence.
  let predictions = [];
  try {
    const out = await predict(wsId, { persist: false });
    predictions = out?.predictions || [];
  } catch (err) {
    logger.rag?.(`[Consequence] prediction fetch failed: ${err.message}`);
    return [];
  }

  // 2. Recent events (last 14d) — the raw cross-tool signal pool for corroboration.
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  let recentEvents = [];
  try {
    recentEvents = await queryEvents({ workspaceId: wsId, since, limit: 300, order: 'DESC' });
  } catch (err) {
    logger.rag?.(`[Consequence] event fetch failed: ${err.message}`);
  }

  const consequences = [];
  for (const p of predictions) {
    const pattern = PATTERNS[p.type];
    if (!pattern) continue;
    if ((p.probability ?? 0) < minProbability) continue;

    const targetName = p.target?.name || null;
    const chain = _buildEvidenceChain(p, recentEvents, targetName);
    // Cross-tool is measured by DISTINCT real connectors in the chain — that's the
    // whole claim ("connected Gmail to Jira to Slack"). Domain-analysis evidence
    // corroborates but does not count as a "tool".
    const sources = [...new Set(chain.map(e => e.source).filter(s => REAL_CONNECTORS.has(s)))];

    consequences.push({
      id:            `consequence_${pattern.id}_${(targetName || p.type).replace(/\W+/g, '_')}`.toLowerCase(),
      pattern:       pattern.id,
      severity:      pattern.severity,
      entity:        targetName,
      title:         _headline(pattern, targetName, p),
      probability:   p.probability,
      timeHorizon:   p.timeHorizon || null,
      // The cross-tool proof — "here is what FLOW connected".
      evidenceChain: chain,
      sources:       sources.map(s => CONNECTOR_LABEL[s] || s),
      crossTool:     sources.length >= 2,
      businessImpact: p.businessImpact?.note || null,
      recommendedAction: {
        ...pattern.action,
        // Prefer the prediction's grounded preventive action wording when present.
        detail: _actionText(p.preventiveActions && p.preventiveActions[0]),
        entity: targetName,
      },
      actionLabel:   pattern.action.label,
      // The one question that turns a detection into a decision — the CTO clicks it.
      followUp:      pattern.followUp ? (targetName ? pattern.followUp.replace(/\bthem\b/g, targetName) : pattern.followUp) : null,
      detectedAt:    new Date().toISOString(),
    });
  }

  // Cross-tool consequences first (the flagship), then severity, then probability.
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
  consequences.sort((a, b) =>
    (Number(b.crossTool) - Number(a.crossTool)) ||
    ((sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)) ||
    ((b.probability ?? 0) - (a.probability ?? 0)),
  );

  return consequences;
}

// Build the "what FLOW connected" chain: the prediction's own grounded evidence,
// plus real recent events across tools that mention the target entity.
function _buildEvidenceChain(prediction, recentEvents, targetName) {
  const chain = [];

  // (a) Real events touching the target entity, grouped implicitly by tool.
  // System/plumbing events are excluded — the chain is human/business signal only.
  if (targetName) {
    const needle = targetName.toLowerCase();
    for (const ev of recentEvents) {
      if (!_isRealSignal(ev)) continue;
      const hay = `${ev.title || ''} ${ev.summary || ''} ${ev.actor?.name || ''} ${ev.entity?.name || ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
      chain.push({
        source:    ev.connector,
        text:      ev.title || ev.summary || ev.eventType,
        timestamp: ev.timestamp || ev.ts || null,
      });
      if (chain.length >= 6) break;
    }
  }

  // (b) The prediction's grounded supporting evidence (already traces to real inputs).
  for (const e of (prediction.supportingEvidence || []).slice(0, 4)) {
    const text = typeof e === 'string' ? e : (e.text || e.detail || '');
    if (text) chain.push({ source: prediction.domain || 'analysis', text, timestamp: null });
  }

  return chain.slice(0, 8);
}

function _headline(pattern, targetName, p) {
  if (pattern.id === 'deployment_risk') return 'Deployment at risk';
  if (targetName) return `${targetName} — ${pattern.headline}`;
  return `${p.label || pattern.headline}`;
}

export default { detectConsequences };
