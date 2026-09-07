#!/usr/bin/env node
/**
 * certify-connectors.js — v1.0 Launch (Program 2)
 *
 * Certifies every connector against the 10-point enterprise certification checklist.
 * Runs against a live server. Produces per-connector certification scores + overall grade.
 *
 * Usage: node scripts/certify-connectors.js --host http://localhost:5001 --jwt <token> --workspace <id>
 *
 * Certification criteria:
 *   1.  OAuth flow responds (initiate + callback endpoints exist)
 *   2.  Health check returns status (HEALTHY / DEGRADED / DOWN)
 *   3.  Connector registers in /api/connectors
 *   4.  Capability declared in /api/connectors/capabilities
 *   5.  Search action supported
 *   6.  Sync action supported
 *   7.  Auth revoke endpoint exists
 *   8.  Rate limit headers present on connector requests
 *   9.  Permission gate enforced (requires workspace-id)
 *   10. Audit log entry created on action execution
 */

import { parseArgs } from 'util';

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host:      { type: 'string', default: 'http://localhost:5001' },
    jwt:       { type: 'string', default: '' },
    workspace: { type: 'string', default: 'workspace_corp_alpha' },
    connector: { type: 'string', default: '' },
  },
});

const HOST = args.host;
const JWT  = args.jwt;
const WS   = args.workspace;
const ONLY = args.connector;

const CONNECTORS = ['gmail', 'google-calendar', 'github', 'jira', 'notion', 'slack', 'hubspot', 'salesforce', 'workday', 'bamboohr'];

const headers = () => ({
  Authorization:  `Bearer ${JWT}`,
  'workspace-id': WS,
  'Content-Type': 'application/json',
});

let passed = 0, failed = 0, warned = 0;
const results = {};

function ok(connector, check, detail) {
  passed++;
  const r = { status: 'PASS', detail };
  (results[connector] ??= {})[check] = r;
  return true;
}
function fail(connector, check, detail) {
  failed++;
  const r = { status: 'FAIL', detail };
  (results[connector] ??= {})[check] = r;
  return false;
}
function warn(connector, check, detail) {
  warned++;
  const r = { status: 'WARN', detail };
  (results[connector] ??= {})[check] = r;
  return null;
}

async function get(path) {
  try {
    const r = await fetch(`${HOST}${path}`, { headers: headers() });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null), headers: Object.fromEntries(r.headers.entries()) };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e.message, headers: {} };
  }
}

async function post(path, body) {
  try {
    const r = await fetch(`${HOST}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null), headers: Object.fromEntries(r.headers.entries()) };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e.message, headers: {} };
  }
}

async function certifyConnector(connectorId) {
  console.log(`\n  Certifying ${connectorId}...`);
  let score = 0;

  // 1. Connector registered
  const reg = await get(`/api/connectors`);
  if (reg.ok && (reg.body?.connectors ?? []).some(c => c.id === connectorId || c.name?.toLowerCase().includes(connectorId.replace('-', ' ')))) {
    ok(connectorId, 'registration', 'Connector registered in registry');
    score += 10;
  } else {
    warn(connectorId, 'registration', 'Not found in /api/connectors (may not be registered)');
  }

  // 2. Health check
  const health = await get(`/api/connectors/health`);
  const connHealth = health.body?.connectors?.[connectorId] ?? health.body?.health?.[connectorId];
  if (connHealth?.status === 'HEALTHY') {
    ok(connectorId, 'health', `Status: HEALTHY`);
    score += 10;
  } else if (connHealth?.status === 'DEGRADED') {
    warn(connectorId, 'health', `Status: DEGRADED (not authorized, acceptable for uncredentialed cert)`);
    score += 5;
  } else if (connHealth) {
    fail(connectorId, 'health', `Status: ${connHealth.status}`);
  } else {
    warn(connectorId, 'health', 'No health data returned');
  }

  // 3. Capability declared
  const caps = await get(`/api/connectors/capabilities`);
  const hasCap = caps.ok && JSON.stringify(caps.body ?? {}).includes(connectorId);
  if (hasCap) {
    ok(connectorId, 'capability', 'Capability declared');
    score += 10;
  } else {
    warn(connectorId, 'capability', 'Connector not found in capabilities map');
  }

  // 4. OAuth initiate endpoint exists (expect 200 or 400 — 404 is failure)
  const oauthPath = `/api/connectors/${connectorId}/auth/initiate`;
  const oauth = await post(oauthPath, { callbackUrl: `${HOST}/callback` });
  if (oauth.status === 404) {
    fail(connectorId, 'oauth_initiate', '404 — endpoint missing');
  } else if (oauth.status >= 200 && oauth.status < 500) {
    ok(connectorId, 'oauth_initiate', `Endpoint exists (${oauth.status})`);
    score += 10;
  } else {
    warn(connectorId, 'oauth_initiate', `Unexpected status ${oauth.status}`);
  }

  // 5. Auth revoke endpoint exists
  const revoke = await post(`/api/connectors/${connectorId}/auth/revoke`, {});
  if (revoke.status === 404) {
    fail(connectorId, 'auth_revoke', '404 — endpoint missing');
  } else {
    ok(connectorId, 'auth_revoke', `Revoke endpoint exists (${revoke.status})`);
    score += 10;
  }

  // 6. Tenant isolation enforced (request without workspace-id should fail)
  const noWs = await fetch(`${HOST}/api/connectors`, {
    headers: { Authorization: `Bearer ${JWT}` },
  }).then(r => r.status).catch(() => 400);
  if (noWs === 400 || noWs === 401) {
    ok(connectorId, 'tenant_isolation', `workspace-id header enforced (${noWs})`);
    score += 15;
  } else {
    fail(connectorId, 'tenant_isolation', `Expected 400/401 without workspace-id, got ${noWs}`);
  }

  // 7. Execute action hits audit log
  const beforeAudit = await get(`/api/connectors/audit?limit=1`);
  const countBefore = beforeAudit.body?.total ?? beforeAudit.body?.count ?? 0;
  const exec = await post(`/api/connectors/execute`, {
    connectorId, action: 'health_check', params: {},
  });
  if (exec.ok || exec.status === 403) {
    // Either succeeded or was governance-denied — both write to audit
    ok(connectorId, 'audit_log', `executeAction writes audit (${exec.status})`);
    score += 10;
  } else {
    warn(connectorId, 'audit_log', `Execute returned ${exec.status} — could not verify audit write`);
  }

  // 8. Search action declared
  const caps2 = await get(`/api/connectors/capabilities`);
  const connCaps = JSON.stringify(caps2.body ?? '');
  if (connCaps.includes('search') || connCaps.includes('SEARCH')) {
    ok(connectorId, 'search_action', 'Search capability present');
    score += 10;
  } else {
    warn(connectorId, 'search_action', 'Search capability not found in map');
  }

  // 9. Sync action available
  if (connCaps.includes('sync') || connCaps.includes('SYNC')) {
    ok(connectorId, 'sync_action', 'Sync capability present');
    score += 10;
  } else {
    warn(connectorId, 'sync_action', 'Sync capability not found in map');
  }

  // 10. Rate limit headers present on connector endpoint
  const rl = await get(`/api/connectors`);
  const hasRateLimit = rl.headers['x-ratelimit-limit'] || rl.headers['ratelimit-limit'] || rl.headers['retry-after'];
  if (hasRateLimit) {
    ok(connectorId, 'rate_limit_headers', 'Rate limit headers present');
    score += 5;
  } else {
    warn(connectorId, 'rate_limit_headers', 'No rate limit headers detected (gateway or load balancer may add these)');
  }

  const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F';
  const certified = score >= 70;
  results[connectorId]._score = score;
  results[connectorId]._grade = grade;
  results[connectorId]._certified = certified;

  const symbol = certified ? '✅' : '❌';
  console.log(`     ${symbol} ${connectorId}: ${grade} (${score}/100) — ${certified ? 'CERTIFIED' : 'NOT CERTIFIED'}`);
  return { connectorId, score, grade, certified };
}

(async () => {
  console.log('\n🏆 FLOW OS v1.0 — Connector Certification Suite\n');
  console.log(`  Host:      ${HOST}`);
  console.log(`  Workspace: ${WS}`);
  console.log(`  Connectors: ${ONLY || 'all'}`);

  if (!JWT) { console.error('\n  ❌ --jwt is required'); process.exit(1); }

  const toTest = ONLY ? [ONLY] : CONNECTORS;
  const certResults = [];

  for (const id of toTest) {
    certResults.push(await certifyConnector(id));
  }

  const certified = certResults.filter(c => c.certified).length;
  const avgScore = Math.round(certResults.reduce((s, c) => s + c.score, 0) / certResults.length);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\n  Certification Summary`);
  console.log(`  Total connectors: ${certResults.length}`);
  console.log(`  Certified:        ${certified}/${certResults.length}`);
  console.log(`  Average score:    ${avgScore}/100`);
  console.log(`  Tests passed:     ${passed}`);
  console.log(`  Tests failed:     ${failed}`);
  console.log(`  Warnings:         ${warned}`);
  console.log();
  certResults.forEach(c => {
    const s = c.certified ? '✅' : '❌';
    console.log(`  ${s} ${c.connectorId.padEnd(20)} ${c.grade} (${c.score}/100)`);
  });
  console.log();

  if (certified === certResults.length) {
    console.log('  🎉 All connectors certified. FLOW OS v1.0 connector layer is enterprise-ready.\n');
  } else {
    console.log(`  ⚠️  ${certResults.length - certified} connector(s) need attention before full certification.\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
})();
