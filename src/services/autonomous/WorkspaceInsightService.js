/**
 * WorkspaceInsightService — detects trends, anomalies, and velocity changes
 * across the workspace data.
 *
 * Operates on capability results snapshots. Compares current state to
 * previous snapshot (stored in Redis) to produce insight items:
 *   - Trend: "PR merge velocity increased 40% this week"
 *   - Anomaly: "Incident count spiked 3× in the last 2 hours"
 *   - Alert: "No commits in the last 48 hours — engineering may be blocked"
 *
 * These insights appear in the WorkspaceFeed and daily brief.
 */

import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {});

const SNAPSHOT_KEY = wsId => `flow:workspace:${wsId}:snapshot`;
const INSIGHTS_KEY = wsId => `flow:workspace:${wsId}:insights`;
const SNAPSHOT_TTL = 48 * 3600; // 48h snapshot retention
const INSIGHTS_TTL = 12 * 3600; // 12h insights cache

// Anomaly thresholds
const SPIKE_RATIO     = 2.5;  // 2.5× increase = anomaly
const DROP_RATIO      = 0.4;  // 60% drop = anomaly
const STALE_HOURS_PR  = 48;
const STALE_HOURS_INC = 4;    // Incident open >4h without update = alert

/**
 * Analyse current capability results against the previous snapshot.
 * Persist insights to Redis. Return the insight list.
 *
 * @param {string} workspaceId
 * @param {import('../../ai/reasoning/CapabilityDispatcher.js').CapabilityResults} capResults
 * @returns {Promise<Insight[]>}
 */
export async function analyseWorkspace(workspaceId, capResults) {
  const wsId    = String(workspaceId);
  const prev    = await _loadSnapshot(wsId);
  const current = _summariseCapResults(capResults);

  const insights = [
    ..._detectAnomalies(current, prev),
    ..._detectStaleItems(capResults),
    ..._detectVelocityTrends(current, prev),
    ..._detectHealthAlerts(capResults),
  ].slice(0, 10);

  // Save current as new snapshot and persist insights
  await _saveSnapshot(wsId, current);
  await _saveInsights(wsId, insights);

  if (insights.length) {
    logger.rag(`[Insights] ${wsId} — ${insights.length} insight(s): ${insights.map(i => i.type).join(', ')}`);
  }

  return insights;
}

/**
 * Get the most recently computed insights for a workspace.
 *
 * @param {string} workspaceId
 * @returns {Promise<Insight[]>}
 */
export async function getInsights(workspaceId) {
  const raw = await redis.get(INSIGHTS_KEY(String(workspaceId))).catch(() => null);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Detection functions ───────────────────────────────────────────────────────

function _detectAnomalies(current, prev) {
  if (!prev) return [];
  const insights = [];

  for (const [cap, cur] of Object.entries(current.counts)) {
    const old = prev.counts?.[cap];
    if (old === undefined || old === 0 || cur === 0) continue;

    const ratio = cur / old;
    if (ratio >= SPIKE_RATIO) {
      insights.push(_insight(
        'anomaly',
        `${_capLabel(cap)} count spiked ${Math.round(ratio)}×`,
        `Was ${old}, now ${cur}. Investigate if this is expected activity.`,
        'high',
      ));
    } else if (ratio <= DROP_RATIO && old >= 5) {
      insights.push(_insight(
        'anomaly',
        `${_capLabel(cap)} activity dropped ${Math.round((1 - ratio) * 100)}%`,
        `Was ${old}, now ${cur}. Team may be blocked or pipeline stalled.`,
        'medium',
      ));
    }
  }

  return insights;
}

function _detectStaleItems(capResults) {
  const insights = [];
  const now      = Date.now();

  // Stale PRs
  const prs = (capResults.engineering?.records || []).filter(r => r.type === 'PR');
  const stalePRs = prs.filter(pr => pr.ts && (now - new Date(pr.ts).getTime()) > STALE_HOURS_PR * 3_600_000);
  if (stalePRs.length >= 3) {
    insights.push(_insight(
      'stale',
      `${stalePRs.length} pull requests awaiting review for 48+ hours`,
      `Oldest: "${stalePRs[0]?.name}". Code review velocity is low.`,
      'high',
    ));
  }

  // Long-running incidents
  const incidents = capResults.incidents?.records || [];
  const staleInc  = incidents.filter(i =>
    (!i.status || i.status === 'open') && i.ts &&
    (now - new Date(i.ts).getTime()) > STALE_HOURS_INC * 3_600_000
  );
  if (staleInc.length > 0) {
    insights.push(_insight(
      'stale',
      `${staleInc.length} incident${staleInc.length > 1 ? 's' : ''} open for ${STALE_HOURS_INC}+ hours`,
      `"${staleInc[0]?.name}" may need escalation.`,
      'high',
    ));
  }

  return insights;
}

function _detectVelocityTrends(current, prev) {
  if (!prev) return [];
  const insights = [];

  // Engineering velocity
  const curEng  = current.counts.engineering || 0;
  const prevEng = prev.counts?.engineering || 0;
  if (prevEng > 0 && curEng > prevEng * 1.3) {
    insights.push(_insight(
      'trend',
      `Engineering activity up ${Math.round(((curEng / prevEng) - 1) * 100)}%`,
      `${curEng} items vs ${prevEng} in previous window. Team is shipping fast.`,
      'low',
    ));
  }

  // Customer activity
  const curCust  = current.counts.customers || 0;
  const prevCust = prev.counts?.customers || 0;
  if (prevCust > 0 && curCust > prevCust * 1.5) {
    insights.push(_insight(
      'trend',
      `Customer activity increased ${Math.round(((curCust / prevCust) - 1) * 100)}%`,
      `${curCust} customer interactions vs ${prevCust} previously.`,
      'medium',
    ));
  }

  return insights;
}

function _detectHealthAlerts(capResults) {
  const insights = [];
  const health   = capResults.health?.health;

  if (health) {
    if (typeof health.company_health === 'number' && health.company_health < 50) {
      insights.push(_insight(
        'alert',
        `Workspace health critical: ${health.company_health}/100`,
        `Health score is below 50. Multiple systems may be degraded.`,
        'high',
      ));
    }
    if (typeof health.sectors?.engineering === 'number' && health.sectors.engineering < 40) {
      insights.push(_insight(
        'alert',
        `Engineering health low: ${health.sectors.engineering}/100`,
        `Engineering systems are underperforming. Check incidents and PR queue.`,
        'high',
      ));
    }
  }

  return insights;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function _loadSnapshot(wsId) {
  const raw = await redis.get(SNAPSHOT_KEY(wsId)).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function _saveSnapshot(wsId, summary) {
  await redis.set(SNAPSHOT_KEY(wsId), JSON.stringify(summary), 'EX', SNAPSHOT_TTL).catch(() => {});
}

async function _saveInsights(wsId, insights) {
  await redis.set(INSIGHTS_KEY(wsId), JSON.stringify(insights), 'EX', INSIGHTS_TTL).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _summariseCapResults(capResults) {
  const counts = {};
  for (const [cap, result] of Object.entries(capResults)) {
    counts[cap] = result?.count ?? 0;
  }
  return { counts, ts: new Date().toISOString() };
}

function _insight(type, title, detail, severity) {
  return {
    id:       `ins_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type,     // 'anomaly' | 'stale' | 'trend' | 'alert'
    title,
    detail,
    severity, // 'high' | 'medium' | 'low'
    ts:       new Date().toISOString(),
  };
}

function _capLabel(cap) {
  const map = {
    engineering: 'Engineering', meetings: 'Meetings', customers: 'Customers',
    incidents: 'Incidents', knowledge: 'Knowledge', communications: 'Communications',
    people: 'People', memory: 'Memory', recommendations: 'Recommendations',
  };
  return map[cap] || cap;
}
