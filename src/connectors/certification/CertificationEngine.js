/**
 * FLOW OS — Enterprise Connector Certification Engine
 *
 * Runs a six-domain test suite against every registered connector and produces
 * a CertificationReport. Architecture is unchanged — this is an inspector, not
 * a new execution layer.
 *
 * Certification levels:
 *   CERTIFIED              ≥ 90% of applicable tests pass
 *   PROVISIONALLY_CERTIFIED ≥ 70%
 *   PENDING                ≥ 50%
 *   NOT_CERTIFIED          < 50%
 */

import { getConnector, listConnectors } from '../registry.js';
import { runAuthTests }          from './tests/authTests.js';
import { runSyncTests }          from './tests/syncTests.js';
import { runActionTests }        from './tests/actionTests.js';
import { runReliabilityTests }   from './tests/reliabilityTests.js';
import { runWebhookTests }       from './tests/webhookTests.js';
import { runObservabilityTests } from './tests/observabilityTests.js';
import { saveResult, getResult } from './certificationStore.js';

// Tier classification for the dashboard
const TIER = {
  gmail:           1, 'google-calendar': 1, github: 1, slack: 1, jira: 1,
  notion:          2, confluence: 2, 'google-drive': 2, linear: 2, gitlab: 2,
  kubernetes:      2, aws: 2, postgresql: 2, 'redis-infra': 2, datadog: 2, pagerduty: 2,
  hubspot:         3, salesforce: 3, workday: 3, bamboohr: 3,
  'microsoft-365': 3, teams: 3, zendesk: 3, servicenow: 3,
};

function certificationStatus(score) {
  if (score >= 90) return 'CERTIFIED';
  if (score >= 70) return 'PROVISIONALLY_CERTIFIED';
  if (score >= 50) return 'PENDING';
  return 'NOT_CERTIFIED';
}

function domainScore(checks) {
  const applicable = checks.filter(c => !c.skipped);
  if (applicable.length === 0) return 100; // fully N/A domains are considered passing
  const passed = applicable.filter(c => c.passed).length;
  return Math.round((passed / applicable.length) * 100);
}

function overallScore(domains) {
  const weights = { auth: 25, sync: 20, actions: 20, reliability: 15, webhooks: 10, observability: 10 };
  let total = 0;
  let totalWeight = 0;
  for (const [domain, score] of Object.entries(domains)) {
    const w = weights[domain] ?? 10;
    total += score * w;
    totalWeight += w;
  }
  return Math.round(total / totalWeight);
}

async function runDomain(name, fn, adapter, ctx) {
  const start = Date.now();
  let checks;
  try {
    checks = await fn(adapter, ctx);
  } catch (e) {
    checks = [{ name: 'domain_runner', passed: false, detail: e.message }];
  }
  return {
    score: domainScore(checks),
    durationMs: Date.now() - start,
    checks,
  };
}

export async function certifyConnector(connectorId, ctx = {}) {
  let adapter;
  try { adapter = getConnector(connectorId); } catch {
    throw new Error(`Connector "${connectorId}" not found in registry`);
  }

  const started = new Date().toISOString();
  const [auth, sync, actions, reliability, webhooks, observability] = await Promise.all([
    runDomain('auth',          runAuthTests,          adapter, ctx),
    runDomain('sync',          runSyncTests,          adapter, ctx),
    runDomain('actions',       runActionTests,        adapter, ctx),
    runDomain('reliability',   runReliabilityTests,   adapter, ctx),
    runDomain('webhooks',      runWebhookTests,       adapter, ctx),
    runDomain('observability', runObservabilityTests, adapter, ctx),
  ]);

  const domainScores = {
    auth:          auth.score,
    sync:          sync.score,
    actions:       actions.score,
    reliability:   reliability.score,
    webhooks:      webhooks.score,
    observability: observability.score,
  };

  const score = overallScore(domainScores);
  const status = certificationStatus(score);

  // Pull live health
  let healthStatus = 'unknown';
  let latencyMs = null;
  try {
    const h = await adapter.healthCheck(ctx.workspaceId || 'test');
    healthStatus = h.status || 'unknown';
    latencyMs = h.latencyMs ?? null;
  } catch {
    healthStatus = 'down';
  }

  // Pull connector metadata (describe() is synchronous in BaseAdapter)
  let meta = {};
  try { meta = adapter.describe(); } catch {}

  const report = {
    connectorId,
    connectorName:     adapter.name || connectorId,
    tier:              TIER[connectorId] ?? 3,
    certificationStatus: status,
    certificationScore: score,
    healthStatus,
    latencyMs,
    oauthStatus:       healthStatus === 'healthy' ? 'connected' : 'not_connected',
    authStrategy:      adapter.authStrategy || meta.authStrategy || 'UNKNOWN',
    version:           adapter.version || meta.version || 'unknown',
    capability:        adapter.capability || meta.capability || 'UNKNOWN',
    supportedActions:  adapter.supportedActions || meta.supportedActions || [],
    domains: {
      auth:          { score: auth.score,          durationMs: auth.durationMs,          checks: auth.checks },
      sync:          { score: sync.score,           durationMs: sync.durationMs,           checks: sync.checks },
      actions:       { score: actions.score,        durationMs: actions.durationMs,        checks: actions.checks },
      reliability:   { score: reliability.score,    durationMs: reliability.durationMs,    checks: reliability.checks },
      webhooks:      { score: webhooks.score,       durationMs: webhooks.durationMs,       checks: webhooks.checks },
      observability: { score: observability.score,  durationMs: observability.durationMs,  checks: observability.checks },
    },
    certifiedAt: started,
    testedAt:    new Date().toISOString(),
  };

  await saveResult(connectorId, report);
  return report;
}

export async function certifyAll(ctx = {}) {
  // listConnectors returns describe() shapes which include id
  const connectors = listConnectors();
  const results = await Promise.allSettled(
    connectors.map(c => certifyConnector(c.id, ctx))
  );
  return results.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { connectorId: connectors[i]?.id || 'unknown', certificationStatus: 'ERROR', error: r.reason?.message }
  );
}

export async function getCertificationReport(connectorId) {
  return getResult(connectorId);
}

export async function getAllCertificationReports() {
  const { getAllResults } = await import('./certificationStore.js');
  return getAllResults();
}
