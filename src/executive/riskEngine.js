/**
 * Executive Risk Engine — continuously detect 9 categories of operational risk.
 *
 * Risk categories:
 *   1. release_risk          — deploys with no review, failing CI, high-risk window
 *   2. customer_churn        — NPS signals, escalations, ARR anomalies
 *   3. security_risk         — CVE events, policy violations, unreviewed access
 *   4. operational_bottleneck — approval delays, stuck executions, queue depth
 *   5. burnout               — after-hours events, overload signals, attrition
 *   6. approval_delay        — pending approvals over SLA
 *   7. infrastructure_risk   — open incidents, high MTTR, SLA breaches
 *   8. knowledge_silo        — isolated graph nodes, departing key contributors
 *   9. compliance_risk       — policy violations, audit gaps
 *
 * Each risk returns: { category, level, score (0-100), title, description, evidence[], affectedEntities[], recommendations[], detectedAt }
 */

import * as EventStore  from '../events/EventStore.js';
import { predict }      from '../predictions/index.js';
import db               from '../config/db.js';
import { searchNodes }  from '../graph/GraphSearch.js';
import { analyzeImpact } from '../graph/ImpactAnalyzer.js';

const MS_PER_HOUR = 3600_000;
const MS_PER_DAY  = 86_400_000;

function since(days) { return new Date(Date.now() - days * MS_PER_DAY); }
function hoursAgo(h) { return new Date(Date.now() - h * MS_PER_HOUR); }

/**
 * Detect all active risks for a workspace.
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {number} [opts.windowDays=30]
 * @param {boolean} [opts.includePredictions=true]
 * @returns {Promise<RiskReport>}
 */
export async function detectRisks(workspaceId, { windowDays = 30, includePredictions = true } = {}) {
  const ws = String(workspaceId);

  const detectors = [
    detectReleaseRisk,
    detectCustomerChurnRisk,
    detectSecurityRisk,
    detectOperationalBottleneck,
    detectBurnoutRisk,
    detectApprovalDelay,
    detectInfrastructureRisk,
    detectKnowledgeSiloRisk,
    detectComplianceRisk,
  ];

  const settled = await Promise.allSettled(
    detectors.map(fn => fn(ws, windowDays))
  );

  const risks   = [];
  const errors  = [];

  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      const arr = Array.isArray(r.value) ? r.value : [r.value];
      risks.push(...arr.filter(Boolean));
    } else if (r.status === 'rejected') {
      errors.push({ detector: detectors[i].name, error: r.reason?.message });
    }
  });

  // Augment with prediction-based risks
  if (includePredictions) {
    try {
      const predResult = await predict(ws, { persist: false });
      const highPreds = predResult.predictions.filter(p => p.riskScore >= 65 && !p.insufficient);
      for (const p of highPreds) {
        risks.push(_predictionToRisk(p));
      }
    } catch { /* non-fatal */ }
  }

  // Deduplicate by category+title, keep highest score
  const deduped = _deduplicate(risks);
  deduped.sort((a, b) => b.score - a.score);

  const critical = deduped.filter(r => r.level === 'critical');
  const high     = deduped.filter(r => r.level === 'high');

  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    windowDays,
    totalRisks:    deduped.length,
    criticalCount: critical.length,
    highCount:     high.length,
    risks:         deduped,
    errors,
    summary:       _summarizeRisks(deduped),
  };
}

/**
 * Detect a single risk category.
 */
export async function detectCategoryRisk(workspaceId, category) {
  const ws = String(workspaceId);
  const fn = CATEGORY_DETECTORS[category];
  if (!fn) throw new Error(`Unknown risk category: ${category}`);
  const result = await fn(ws, 30);
  return Array.isArray(result) ? result : result ? [result] : [];
}

export const RISK_CATEGORIES = [
  'release_risk', 'customer_churn', 'security_risk', 'operational_bottleneck',
  'burnout', 'approval_delay', 'infrastructure_risk', 'knowledge_silo', 'compliance_risk',
];

// ── Detectors ─────────────────────────────────────────────────────────────────

async function detectReleaseRisk(ws, window) {
  const results = [];
  try {
    // Failed deployments in window
    const { rows: deployRows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'deployment.completed')::int AS success,
         COUNT(*) FILTER (WHERE event_type = 'deployment.failed')::int AS failures,
         COUNT(*) FILTER (WHERE event_type = 'deployment.started')::int AS started
        FROM flow_events WHERE workspace_id = $1 AND ts >= $2`,
      [ws, since(window)],
    );
    const { success = 0, failures = 0 } = deployRows[0] ?? {};
    const total = success + failures;
    if (failures > 0 && total > 0) {
      const failRate = failures / total;
      if (failRate >= 0.2) {
        const score = Math.min(100, Math.round(failRate * 100) + 20);
        results.push(_risk('release_risk', score, 'High deployment failure rate',
          `${failures}/${total} deployments failed (${Math.round(failRate * 100)}% failure rate)`,
          [`${failures} failed deployments in past ${window} days`, `${success} successful deployments`],
          [],
          ['Enable pre-deploy smoke tests', 'Add rollback automation for failed deploys'],
        ));
      }
    }

    // PRs merged without review
    const { rows: prRows } = await db.query(
      `SELECT COUNT(*)::int c FROM flow_events
        WHERE workspace_id = $1
          AND event_type = 'pull_request.merged'
          AND (metadata->>'reviewCount')::int = 0
          AND ts >= $2`,
      [ws, since(window)],
    );
    const unreviewed = prRows[0]?.c ?? 0;
    if (unreviewed > 0) {
      results.push(_risk('release_risk', Math.min(90, unreviewed * 15),
        'PRs merged without review',
        `${unreviewed} pull requests were merged without any code review`,
        [`${unreviewed} zero-review merges in past ${window} days`],
        [],
        ['Enforce required reviewers in branch protection', 'Review bypass policy'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectCustomerChurnRisk(ws, window) {
  const results = [];
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'customer.escalated')::int AS escalations,
         COUNT(*) FILTER (WHERE event_type = 'customer.churned')::int AS churned,
         COUNT(*) FILTER (WHERE event_type = 'customer.complaint')::int AS complaints
        FROM flow_events WHERE workspace_id = $1 AND ts >= $2`,
      [ws, since(window)],
    );
    const { escalations = 0, churned = 0, complaints = 0 } = rows[0] ?? {};

    if (churned > 0) {
      results.push(_risk('customer_churn', Math.min(100, churned * 25),
        'Customer churn detected',
        `${churned} customer churn events in the past ${window} days`,
        [`${churned} churn events`, `${escalations} escalations`, `${complaints} complaints`],
        [],
        ['Conduct exit interviews', 'Activate customer success playbook', 'Review NPS trends'],
      ));
    } else if (escalations > 2 || complaints > 3) {
      const score = Math.min(70, escalations * 10 + complaints * 5);
      results.push(_risk('customer_churn', score,
        'Customer satisfaction signals degrading',
        `${escalations} escalations and ${complaints} complaints in past ${window} days`,
        [`${escalations} escalations`, `${complaints} complaints`],
        [],
        ['Proactive outreach to at-risk accounts', 'Review support response times'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectSecurityRisk(ws, window) {
  const results = [];
  try {
    const { rows } = await db.query(
      `SELECT event_type, COUNT(*)::int c, MAX(ts) AS last_seen
         FROM flow_events
        WHERE workspace_id = $1
          AND (event_type LIKE 'security.%' OR event_type = 'access.denied' OR event_type = 'policy.violated')
          AND ts >= $2
        GROUP BY event_type`,
      [ws, since(window)],
    );
    if (rows.length > 0) {
      const totalAlerts = rows.reduce((s, r) => s + r.c, 0);
      const hasViolations = rows.some(r => r.event_type === 'policy.violated');
      const score = Math.min(100, totalAlerts * 10 + (hasViolations ? 20 : 0));
      const evidence = rows.map(r => `${r.event_type}: ${r.c} events (last: ${new Date(r.last_seen).toLocaleDateString()})`);
      results.push(_risk('security_risk', score,
        `${totalAlerts} security events detected`,
        `Security monitoring detected ${totalAlerts} events across ${rows.length} categories`,
        evidence,
        [],
        ['Conduct security review', 'Audit access controls', 'Patch identified vulnerabilities'],
      ));
    }

    // Pending approvals past SLA (governance bypass risk)
    const { rows: stale } = await db.query(
      `SELECT COUNT(*)::int c FROM pending_approvals
        WHERE workspace_id = $1 AND status = 'PENDING' AND created_at < $2`,
      [ws, hoursAgo(48)],
    );
    const stalePending = stale[0]?.c ?? 0;
    if (stalePending > 0) {
      results.push(_risk('security_risk', Math.min(60, stalePending * 15),
        `${stalePending} approvals pending >48h`,
        'Long-pending approvals create governance gaps',
        [`${stalePending} approvals waiting over 48 hours`],
        [],
        ['Escalate stale approvals to managers', 'Review approval chain configuration'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectOperationalBottleneck(ws, window) {
  const results = [];
  try {
    // Stuck executions (PENDING > 2h)
    const { rows } = await db.query(
      `SELECT COUNT(*)::int c FROM execution_records
        WHERE workspace_id = $1 AND status = 'PENDING' AND created_at < $2`,
      [ws, hoursAgo(2)],
    );
    const stuck = rows[0]?.c ?? 0;
    if (stuck > 0) {
      results.push(_risk('operational_bottleneck', Math.min(80, stuck * 20),
        `${stuck} executions stuck`,
        `${stuck} execution records have been PENDING for over 2 hours`,
        [`${stuck} stuck executions detected`],
        [],
        ['Review execution queue', 'Check connector health', 'Escalate if system-wide'],
      ));
    }

    // Pending approvals that are blocking work
    const { rows: pending } = await db.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE risk_level IN ('HIGH','CRITICAL'))::int AS high_risk
         FROM pending_approvals WHERE workspace_id = $1 AND status = 'PENDING'`,
      [ws],
    );
    const total    = pending[0]?.total ?? 0;
    const highRisk = pending[0]?.high_risk ?? 0;
    if (total > 3) {
      results.push(_risk('operational_bottleneck', Math.min(60, total * 8),
        `${total} pending approvals blocking work`,
        `${total} approvals pending (${highRisk} high/critical risk)`,
        [`${total} pending approvals`, `${highRisk} are high or critical risk`],
        [],
        ['Prioritize high-risk approval reviews', 'Consider auto-approve for low-risk actions'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectBurnoutRisk(ws, window) {
  const results = [];
  try {
    // After-hours events (before 7am or after 8pm)
    const { rows } = await db.query(
      `SELECT COUNT(*)::int c,
              COUNT(DISTINCT actor->>'id')::int AS affected_people
         FROM flow_events
        WHERE workspace_id = $1
          AND ts >= $2
          AND (EXTRACT(HOUR FROM ts) < 7 OR EXTRACT(HOUR FROM ts) >= 20)
          AND actor->>'id' IS NOT NULL`,
      [ws, since(window)],
    );
    const afterHours = rows[0]?.c ?? 0;
    const people     = rows[0]?.affected_people ?? 0;

    if (afterHours > 20 && people > 0) {
      const score = Math.min(75, Math.round(afterHours / people));
      results.push(_risk('burnout', score,
        `After-hours activity from ${people} team members`,
        `${afterHours} events outside business hours detected from ${people} people`,
        [`${afterHours} after-hours events in past ${window} days`, `${people} people affected`],
        [],
        ['Review on-call rotation equity', 'Conduct team wellness check-in', 'Evaluate workload distribution'],
      ));
    }

    // Recent departures
    const { rows: dep } = await db.query(
      `SELECT COUNT(*)::int c FROM flow_events
        WHERE workspace_id = $1 AND event_type = 'employee.offboarded' AND ts >= $2`,
      [ws, since(window)],
    );
    const departures = dep[0]?.c ?? 0;
    if (departures >= 2) {
      results.push(_risk('burnout', Math.min(70, departures * 15),
        `${departures} employee departures in ${window} days`,
        'Recent attrition may indicate morale or burnout issues',
        [`${departures} employees left in past ${window} days`],
        [],
        ['Conduct stay interviews', 'Review compensation benchmarks', 'Assess workload balance'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectApprovalDelay(ws) {
  const results = [];
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > 24)::int AS over_24h,
              COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > 72)::int AS over_72h
         FROM pending_approvals WHERE workspace_id = $1 AND status = 'PENDING'`,
      [ws],
    );
    const { total = 0, over_24h = 0, over_72h = 0 } = rows[0] ?? {};

    if (over_72h > 0) {
      results.push(_risk('approval_delay', Math.min(90, over_72h * 20),
        `${over_72h} approvals blocked >72h`,
        'Critical approvals are significantly delayed',
        [`${over_72h} approvals waiting over 72 hours`, `${over_24h} over 24 hours`, `${total} total pending`],
        [],
        ['Escalate to senior leadership', 'Review approver availability', 'Consider temporary delegation'],
      ));
    } else if (over_24h > 0) {
      results.push(_risk('approval_delay', Math.min(50, over_24h * 10),
        `${over_24h} approvals pending >24h`,
        'Approvals are taking longer than expected',
        [`${over_24h} approvals waiting over 24 hours`, `${total} total pending`],
        [],
        ['Send reminders to approvers', 'Check approver availability'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectInfrastructureRisk(ws, window) {
  const results = [];
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'incident.created')::int AS created,
         COUNT(*) FILTER (WHERE event_type = 'incident.resolved')::int AS resolved,
         AVG(CASE WHEN e2.ts IS NOT NULL THEN EXTRACT(EPOCH FROM (e2.ts - e1.ts)) / 3600 END)::float AS avg_mttr
        FROM flow_events e1
        LEFT JOIN flow_events e2 ON e2.correlation_id = e1.correlation_id
           AND e2.workspace_id = e1.workspace_id AND e2.event_type = 'incident.resolved'
       WHERE e1.workspace_id = $1 AND e1.event_type = 'incident.created' AND e1.ts >= $2`,
      [ws, since(window)],
    );
    const created  = rows[0]?.created ?? 0;
    const resolved = rows[0]?.resolved ?? 0;
    const mttr     = rows[0]?.avg_mttr ?? null;
    const open     = Math.max(0, created - resolved);

    if (open > 0) {
      results.push(_risk('infrastructure_risk', Math.min(100, open * 20),
        `${open} unresolved incidents`,
        'Infrastructure incidents are not being resolved promptly',
        [`${open} open incidents`, mttr ? `Avg MTTR: ${mttr.toFixed(1)}h` : 'MTTR data unavailable'],
        [],
        ['Assign on-call for open incidents', 'Activate incident command structure'],
      ));
    }

    if (mttr !== null && mttr > 8) {
      results.push(_risk('infrastructure_risk', Math.min(70, Math.round(mttr * 4)),
        `High MTTR: avg ${mttr.toFixed(1)}h`,
        'Mean time to recover from incidents is elevated',
        [`Average MTTR ${mttr.toFixed(1)}h in past ${window} days`, 'Target: <2h for P1/P2 incidents'],
        [],
        ['Review incident response runbooks', 'Add automated detection and alerting'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectKnowledgeSiloRisk(ws) {
  const results = [];
  try {
    // Bus factor: nodes with single contributor
    const { rows } = await db.query(
      `SELECT target_id, COUNT(DISTINCT source_id)::int AS contributor_count
         FROM graph_edges
        WHERE workspace_id = $1
          AND relationship_type IN ('CREATED','AUTHORED','OWNS')
        GROUP BY target_id
        HAVING COUNT(DISTINCT source_id) = 1`,
      [ws],
    );
    const singleContributor = rows.length;
    if (singleContributor > 3) {
      results.push(_risk('knowledge_silo', Math.min(80, singleContributor * 5),
        `${singleContributor} assets with single contributor`,
        'Critical knowledge is concentrated in single individuals (bus factor 1)',
        [`${singleContributor} repos/docs/projects with only one known contributor`],
        rows.slice(0, 5).map(r => r.target_id),
        ['Pair on critical knowledge domains', 'Create documentation sprints', 'Cross-train team members'],
      ));
    }

    // Isolated documentation nodes
    const { rows: isoRows } = await db.query(
      `SELECT COUNT(*)::int c FROM graph_nodes n
        WHERE n.workspace_id = $1
          AND n.type IN ('DOCUMENT','KNOWLEDGE_BASE')
          AND NOT EXISTS (
            SELECT 1 FROM graph_edges e WHERE e.workspace_id = $1
              AND (e.source_id = n.id OR e.target_id = n.id)
          )`,
      [ws],
    );
    const isolated = isoRows[0]?.c ?? 0;
    if (isolated > 0) {
      results.push(_risk('knowledge_silo', Math.min(40, isolated * 5),
        `${isolated} orphaned knowledge assets`,
        'Documents and knowledge bases with no team connections',
        [`${isolated} isolated knowledge nodes in the graph`],
        [],
        ['Link documentation to teams and projects', 'Archive or update stale content'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

async function detectComplianceRisk(ws, window) {
  const results = [];
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int c FROM flow_events
        WHERE workspace_id = $1
          AND event_type = 'policy.violated'
          AND ts >= $2`,
      [ws, since(window)],
    );
    const violations = rows[0]?.c ?? 0;
    if (violations > 0) {
      results.push(_risk('compliance_risk', Math.min(95, violations * 20),
        `${violations} policy violations`,
        `${violations} governance policy violations detected in the past ${window} days`,
        [`${violations} policy.violated events in past ${window} days`],
        [],
        ['Audit which policies are being violated', 'Retrain on compliance requirements', 'Review policy thresholds'],
      ));
    }

    // Check for rejected approvals (may indicate policy evasion attempts)
    const { rows: rejRows } = await db.query(
      `SELECT COUNT(*)::int c FROM pending_approvals
        WHERE workspace_id = $1 AND status = 'REJECTED' AND created_at >= $2`,
      [ws, since(window)],
    );
    const rejected = rejRows[0]?.c ?? 0;
    if (rejected > 5) {
      results.push(_risk('compliance_risk', Math.min(50, rejected * 5),
        `${rejected} rejected approvals in ${window} days`,
        'High rejection rate may indicate governance policy misalignment',
        [`${rejected} rejected approvals in past ${window} days`],
        [],
        ['Review rejected approval patterns', 'Update action policies if overly restrictive'],
      ));
    }
  } catch { /* best-effort */ }
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_DETECTORS = {
  release_risk:            detectReleaseRisk,
  customer_churn:          detectCustomerChurnRisk,
  security_risk:           detectSecurityRisk,
  operational_bottleneck:  detectOperationalBottleneck,
  burnout:                 detectBurnoutRisk,
  approval_delay:          detectApprovalDelay,
  infrastructure_risk:     detectInfrastructureRisk,
  knowledge_silo:          detectKnowledgeSiloRisk,
  compliance_risk:         detectComplianceRisk,
};

function _risk(category, score, title, description, evidence, affectedEntities, recommendations) {
  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  return {
    category,
    level,
    score,
    title,
    description,
    evidence:         evidence || [],
    affectedEntities: affectedEntities || [],
    recommendations:  recommendations || [],
    detectedAt:       new Date().toISOString(),
  };
}

function _predictionToRisk(pred) {
  const level = pred.riskScore >= 80 ? 'critical' : pred.riskScore >= 65 ? 'high' : 'medium';
  const catMap = {
    engineering: 'release_risk', infrastructure: 'infrastructure_risk',
    customers: 'customer_churn', security: 'security_risk',
    people: 'burnout', knowledge: 'knowledge_silo',
    operations: 'operational_bottleneck',
  };
  return {
    category:         catMap[pred.domain] || 'operational_bottleneck',
    level,
    score:            pred.riskScore,
    title:            pred.prediction,
    description:      pred.explanation?.executiveSummary || pred.prediction,
    evidence:         pred.evidence?.slice(0, 3).map(e => e.content || String(e)) || [],
    affectedEntities: [],
    recommendations:  pred.preventiveActions?.slice(0, 2) || [],
    detectedAt:       new Date().toISOString(),
    fromPrediction:   true,
    predictionType:   pred.type,
  };
}

function _deduplicate(risks) {
  const seen = new Map();
  for (const r of risks) {
    const key = `${r.category}:${r.title}`;
    if (!seen.has(key) || seen.get(key).score < r.score) seen.set(key, r);
  }
  return Array.from(seen.values());
}

function _summarizeRisks(risks) {
  if (risks.length === 0) return 'No significant risks detected.';
  const critical = risks.filter(r => r.level === 'critical');
  const high     = risks.filter(r => r.level === 'high');
  const parts    = [];
  if (critical.length) parts.push(`${critical.length} critical risk${critical.length > 1 ? 's' : ''}`);
  if (high.length)     parts.push(`${high.length} high risk${high.length > 1 ? 's' : ''}`);
  const rest = risks.length - critical.length - high.length;
  if (rest > 0)        parts.push(`${rest} medium/low`);
  return `${risks.length} active risk${risks.length > 1 ? 's' : ''}: ${parts.join(', ')}.`;
}
