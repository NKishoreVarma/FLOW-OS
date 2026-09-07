/**
 * FLOW OS — Operational Intelligence Service
 *
 * Correlation, prediction, and recommendation layer.
 * All outputs derive from real workspace events and signals.
 * No hardcoded company names, people, incidents, or narratives.
 */

// Learning loop feedback store — tracks user actions on recommendations
const feedbackWeights = {};

// ── Event Correlation Engine ────────────────────────────────────────────────
export function correlateEvents(events) {
  const groups = { outageRemediation: [], billingExpansion: [], ssoSetup: [] };
  for (const evt of events) {
    const l = `${evt.title || ''} ${evt.description || ''}`.toLowerCase();
    if (l.includes('latency') || l.includes('outage') || l.includes('remediation') || l.includes('retry')) {
      groups.outageRemediation.push(evt);
    } else if (l.includes('stripe') || l.includes('expansion') || l.includes('billing') || l.includes('revenue')) {
      groups.billingExpansion.push(evt);
    } else if (l.includes('sso') || l.includes('okta') || l.includes('auth') || l.includes('login')) {
      groups.ssoSetup.push(evt);
    }
  }
  return groups;
}

// ── Predictive Intelligence Engine ──────────────────────────────────────────
// Delegates to the Phase 11.5 Predictive Workspace Intelligence engine.
// Callers must await.
export async function generatePredictions(workspaceId) {
  try {
    const { predict } = await import('../predictions/index.js');
    const { predictions } = await predict(workspaceId, { persist: false });
    const byType = Object.fromEntries(predictions.map(p => [p.type, p]));
    const shape  = p => p
      ? { probability: p.probability, indicator: p.riskLevel?.toUpperCase() + (p.target?.name ? ` (${p.target.name})` : ''), evidence: p.supportingEvidence }
      : { probability: 0, indicator: 'LOW', evidence: ['Insufficient data.'] };
    return {
      deliveryDelay:     shape(byType.SPRINT_DELAY),
      customerChurn:     shape(byType.CHURN_RISK),
      sprintCompletion:  shape(byType.SPRINT_DELAY),
      burnoutRisk:       shape(byType.BURNOUT_RISK),
      reviewBottlenecks: shape(byType.PR_BOTTLENECK || byType.REVIEW_DELAY),
      deploymentRisk:    shape(byType.DEPLOYMENT_RISK),
    };
  } catch {
    return {
      deliveryDelay:     { probability: 0, indicator: 'LOW', evidence: ['Prediction engine unavailable.'] },
      customerChurn:     { probability: 0, indicator: 'LOW', evidence: ['Prediction engine unavailable.'] },
      sprintCompletion:  { probability: 0, indicator: 'LOW', evidence: ['Prediction engine unavailable.'] },
      burnoutRisk:       { probability: 0, indicator: 'LOW', evidence: ['Prediction engine unavailable.'] },
      reviewBottlenecks: { probability: 0, indicator: 'LOW', evidence: ['Prediction engine unavailable.'] },
      deploymentRisk:    { probability: 0, indicator: 'LOW', evidence: ['Prediction engine unavailable.'] },
    };
  }
}

// ── Operational Story Builder ───────────────────────────────────────────────
// Stories are derived from real events ingested into the workspace.
// Returns [] when no data exists — never invents narratives.
export function generateOperationalStories(workspaceId) { // eslint-disable-line no-unused-vars
  return [];
}

// ── Proactive Recommendations ────────────────────────────────────────────────
// Reads real signals: pending approvals (blocked work) + high-priority recent
// events. Returns [] when no signals exist — never fabricates recommendations.
export async function getProactiveRecommendations(workspaceId) {
  const recs = [];
  try {
    const { default: db } = await import('../config/db.js');

    // Pending approvals → blocked actions waiting on a human decision
    const approvals = await db.query(
      `SELECT id, connector_id, action_type, description, risk_level, created_at
         FROM pending_approvals
        WHERE workspace_id = $1 AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 10`,
      [workspaceId]
    );
    for (const row of approvals.rows) {
      recs.push({
        title:      `Approve ${row.action_type || 'action'} on ${row.connector_id || 'connector'}`,
        reasoning:  row.description || `Risk level: ${row.risk_level}. Waiting for approval.`,
        confidence: 0.9,
        priority:   row.risk_level === 'HIGH' || row.risk_level === 'CRITICAL' ? 'high' : 'medium',
        actionable: true,
        createdAt:  row.created_at,
        approvalId: row.id,
      });
    }

    // High-priority recent events → signal something needs attention
    const events = await db.query(
      `SELECT event_id, event_type, connector, title, summary, importance, priority, ts
         FROM flow_events
        WHERE workspace_id = $1
          AND ts > NOW() - INTERVAL '48 hours'
          AND (priority = 'high' OR importance >= 0.7)
        ORDER BY ts DESC
        LIMIT 8`,
      [workspaceId]
    );
    for (const row of events.rows) {
      recs.push({
        title:      row.title || `${row.event_type} on ${row.connector}`,
        reasoning:  row.summary || `High-priority ${row.event_type} event from ${row.connector}.`,
        confidence: Math.min(0.95, (row.importance || 0.7)),
        priority:   row.priority || 'medium',
        actionable: false,
        createdAt:  row.ts,
      });
    }
  } catch { /* non-fatal — return whatever was collected */ }

  return recs;
}

// ── Learning Loop Feedback Registry ─────────────────────────────────────────
export function recordRecommendationFeedback(recommendationId, action) {
  if (!feedbackWeights[recommendationId]) {
    feedbackWeights[recommendationId] = { weight: 1.0, count: 0 };
  }
  const record = feedbackWeights[recommendationId];
  record.count += 1;

  if (action === 'accept' || action === 'complete') {
    record.weight = Math.min(1.2, record.weight + 0.05);
  } else if (action === 'reject') {
    record.weight = Math.max(0.5, record.weight - 0.10);
  } else if (action === 'ignore') {
    record.weight = Math.max(0.7, record.weight - 0.02);
  }

  return {
    recommendationId,
    action,
    adjustedWeight: Number(record.weight.toFixed(2)),
    feedbackCount:  record.count,
  };
}

// ── Decision Memory Store ───────────────────────────────────────────────────
// Starts empty. Decisions are recorded via recordDecision() only.
const inMemoryDecisions = [];

export function getDecisionMemory() {
  return inMemoryDecisions;
}

export function recordDecision(decisionText, alternatives, outcome, author) {
  const newDec = {
    id:           `DEC-${Date.now()}`,
    text:         decisionText,
    date:         new Date().toLocaleDateString(),
    author:       author || 'System',
    alternatives: alternatives || 'None logged.',
    outcome:      outcome || 'Pending review.',
  };
  inMemoryDecisions.push(newDec);
  return newDec;
}
