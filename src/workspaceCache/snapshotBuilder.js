/**
 * FLOW OS — Workspace Intelligence Cache · Snapshot Builder (Phase 16.1)
 *
 * Assembles ONE canonical snapshot of the company's current state from the existing
 * FAST, deterministic sources — never the ~90s Operational Brain / Executive Council.
 * This is the expensive-but-bounded work that runs in the BACKGROUND; the UI only ever
 * reads the finished snapshot.
 *
 * Reuses (does not duplicate): Prediction Engine (11.5, ~50ms deterministic),
 * Health Score, Operational Graph metrics (11.1), and durable counts (approvals,
 * notifications, executions) from PostgreSQL.
 */

import { calculateWorkspaceHealth } from '../services/healthScoreService.js';
import { predict } from '../predictions/PredictionEngine.js';
import { metrics as graphMetrics } from '../graph/GraphMetrics.js';
import { queryEvents } from '../events/index.js';
import { prisma } from '../core/config/prisma.js';
import { logger } from '../utils/logger.js';

// Connector → department, plus content overrides (the morning's activity bullets come
// from the Unified Event Platform, which holds real connector activity).
const CONN_DOMAIN = {
  github: 'engineering', gitlab: 'engineering', jira: 'engineering', bitbucket: 'engineering',
  hubspot: 'sales', salesforce: 'sales', crm: 'sales',
  slack: 'operations', calendar: 'operations', 'google-calendar': 'operations', gmail: 'operations', notion: 'operations',
};
function domainOfEvent(e) {
  const s = `${e.eventType || ''} ${e.title || ''} ${e.summary || ''}`.toLowerCase();
  if (/incident|security|breach|vuln|threat|\brisk\b|\balert\b|denied|unauthorized/.test(s)) return 'security';
  if (/cost|budget|invoice|spend|\bburn\b|revenue|forecast|vendor/.test(s)) return 'finance';
  if (/\bpto\b|hiring|attrition|burnout|onboarding|employee/.test(s)) return 'hr';
  if (/renewal|churn|\bdeal\b|pipeline|escalation|customer/.test(s)) return 'sales';
  return CONN_DOMAIN[(e.connector || '').toLowerCase()] || 'operations';
}
function eventTitle(e) {
  return e.title || e.summary || `${e.connector || 'workspace'}: ${(e.eventType || 'event').replace(/[._]/g, ' ')}`;
}

// Prediction domains → the six executive domains the UI shows.
const DOMAIN_OF = { engineering: 'engineering', people: 'hr', customers: 'sales', operations: 'operations' };
const ALL_DOMAINS = ['engineering', 'operations', 'sales', 'hr', 'finance', 'security'];

function statusFromRisk(maxRisk) {
  if (maxRisk >= 70) return 'at_risk';
  if (maxRisk >= 50) return 'watch';
  return 'healthy';
}

function domainCard(title, preds) {
  const risks = (preds || []).filter((p) => !p.insufficient).sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  const maxRisk = risks[0]?.riskScore ?? 0;
  const status = statusFromRisk(maxRisk);
  return {
    title,
    status,
    score: Math.max(0, Math.min(100, 100 - Math.round(maxRisk * 0.6))),
    topRisks: risks.slice(0, 3).map((p) => p.prediction),
    topOpportunities: risks.slice(0, 3).flatMap((p) => (p.businessImpact?.opportunity ? [p.businessImpact.opportunity] : [])).slice(0, 2),
    recommendedActions: [...new Set(risks.flatMap((p) => p.preventiveActions || []))].slice(0, 3),
    riskCount: risks.length,
    topRiskScore: maxRisk,
  };
}

/**
 * @returns {Promise<object>} the workspace intelligence snapshot
 */
export async function buildSnapshot(workspaceId) {
  const startMs = Date.now();

  const [healthR, predR, graphR, apprR, notifR, execR, timelineR] = await Promise.allSettled([
    calculateWorkspaceHealth(workspaceId),
    predict(workspaceId),
    graphMetrics(workspaceId),
    prisma.pendingApproval.count({ where: { workspaceId, status: 'PENDING' } }),
    prisma.notification.count({ where: { workspaceId } }),
    prisma.executionRecord.count({ where: { workspaceId } }),
    queryEvents({ workspaceId, order: 'DESC', limit: 80 }).catch(() => []),
  ]);

  // Recent activity bucketed by department, from the Unified Event Platform (real
  // connector activity — the morning's "PR merged / CI passed" bullets).
  const rawEvents = timelineR.status === 'fulfilled' ? (timelineR.value?.events || timelineR.value || []) : [];
  const activity = { engineering: [], operations: [], sales: [], hr: [], finance: [], security: [] };
  const seenPerDomain = { engineering: new Set(), operations: new Set(), sales: new Set(), hr: new Set(), finance: new Set(), security: new Set() };
  for (const e of rawEvents) {
    const d = domainOfEvent(e);
    const title = eventTitle(e);
    if (activity[d].length < 3 && !seenPerDomain[d].has(title)) {
      seenPerDomain[d].add(title);
      activity[d].push({ title, actor: e.actor?.name || e.actor || null, source: e.connector || null, at: e.ts || e.timestamp || null });
    }
  }
  const seenAll = new Set();
  const recentAll = [];
  for (const e of rawEvents) {
    const title = eventTitle(e);
    if (seenAll.has(title)) continue; seenAll.add(title);
    recentAll.push({ title, actor: e.actor?.name || e.actor || null, source: e.connector || null, at: e.ts || e.timestamp || null });
    if (recentAll.length >= 8) break;
  }

  const health = healthR.status === 'fulfilled' ? healthR.value : null;
  const healthScore = typeof health === 'number' ? health : (health?.score ?? health?.healthScore ?? null);
  const pred = predR.status === 'fulfilled' ? predR.value : { predictions: [], topRisks: [] };
  const preds = pred.predictions || [];
  const graph = graphR.status === 'fulfilled' ? graphR.value : {};

  // Group predictions into the six domains.
  const byDomain = { engineering: [], operations: [], sales: [], hr: [], finance: [], security: [] };
  for (const p of preds) {
    const d = DOMAIN_OF[p.domain] || 'operations';
    (byDomain[d] || byDomain.operations).push(p);
    // Security-relevant predictions also feed the Security card.
    if (/security|breach|vuln|access|permission|incident/i.test(`${p.type} ${p.prediction}`)) byDomain.security.push(p);
    if (/cost|budget|spend|burn|revenue|forecast|churn/i.test(`${p.type} ${p.prediction}`)) byDomain.finance.push(p);
  }

  const domains = {
    engineering: domainCard('Engineering', byDomain.engineering),
    operations:  domainCard('Operations',  byDomain.operations),
    sales:       domainCard('Sales',        byDomain.sales),
    hr:          domainCard('HR',           byDomain.hr),
    finance:     domainCard('Finance',      byDomain.finance),
    security:    domainCard('Security',     byDomain.security),
  };
  for (const d of ALL_DOMAINS) domains[d].recentActivity = activity[d] || [];

  // Overall = worst-of the known domains + a plain-language summary + top cross-domain actions.
  const known = ALL_DOMAINS.map((d) => domains[d]).filter((c) => c.status !== 'unknown');
  const priority = known.some((c) => c.status === 'at_risk') ? 'critical'
    : known.some((c) => c.status === 'watch') ? 'high' : 'normal';
  const atRisk = ALL_DOMAINS.filter((d) => domains[d].status === 'at_risk').map((d) => domains[d].title);
  const topActions = pred.topRisks?.slice(0, 4).map((r) => r.prediction) || [];

  const summary = atRisk.length
    ? `${atRisk.join(', ')} need${atRisk.length === 1 ? 's' : ''} attention. ${pred.topRisks?.[0]?.prediction || ''}`.trim()
    : `All domains healthy. ${preds.length} signals tracked.`;

  const snapshot = {
    workspaceId,
    generatedAt: new Date().toISOString(),
    buildMs: Date.now() - startMs,
    status: 'ready',
    overall: {
      health: healthScore,
      priority,
      summary,
      topActions,
    },
    domains,
    recent: recentAll,
    counts: {
      pendingApprovals:    apprR.status === 'fulfilled' ? apprR.value : 0,
      notifications:       notifR.status === 'fulfilled' ? notifR.value : 0,
      executions:          execR.status === 'fulfilled' ? execR.value : 0,
      graphNodes:          graph?.nodes ?? graph?.nodeCount ?? 0,
      predictionsTracked:  preds.length,
    },
    sources: {
      health:      healthR.status === 'fulfilled',
      predictions: predR.status === 'fulfilled',
      graph:       graphR.status === 'fulfilled',
    },
  };

  logger.rag?.(`[WIC] built snapshot for ${workspaceId} in ${snapshot.buildMs}ms (priority=${priority})`);
  return snapshot;
}

export default { buildSnapshot };
