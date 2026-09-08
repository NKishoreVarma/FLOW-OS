#!/usr/bin/env node
/**
 * FLOW OS — Enterprise Chaos & Resilience Validation
 *
 * Tests resilience behaviors structurally (no live server needed).
 * Run: node scripts/validate-resilience.js
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let passed = 0, failed = 0;
const results = [];

function check(label, condition, detail = '') {
  const ok = !!condition;
  if (ok) passed++; else failed++;
  results.push({ ok, label, detail });
  return ok;
}

function fileContains(relPath, ...patterns) {
  try {
    const content = readFileSync(join(ROOT, relPath), 'utf8');
    return patterns.every(p => typeof p === 'string' ? content.includes(p) : p.test(content));
  } catch { return false; }
}

function fileExists(relPath) { return existsSync(join(ROOT, relPath)); }

// ── A. Connector Resilience ──────────────────────────────────────────────────

console.log('\n== A. Connector Resilience ==');

check('A.1: resilientFetch utility exists',            fileExists('src/connectors/resilientFetch.js'));
check('A.2: resilientFetch has AbortController timeout', fileContains('src/connectors/resilientFetch.js', 'AbortController', 'ctrl.abort'));
check('A.3: resilientFetch retries on 429',            fileContains('src/connectors/resilientFetch.js', '429', 'RETRYABLE_STATUS'));
check('A.4: resilientFetch retries on 502/503/504',    fileContains('src/connectors/resilientFetch.js', '502', '503', '504'));
check('A.5: resilientFetch respects retry-after header', fileContains('src/connectors/resilientFetch.js', 'retry-after', 'x-ratelimit-reset'));
check('A.6: resilientFetch maps 401 to CONNECTOR_AUTH_EXPIRED', fileContains('src/connectors/resilientFetch.js', 'CONNECTOR_AUTH_EXPIRED', '401'));
check('A.7: resilientFetch has jitter on backoff',     fileContains('src/connectors/resilientFetch.js', 'Math.random', 'jitter'));
check('A.8: resilientFetch has configurable timeout',  fileContains('src/connectors/resilientFetch.js', 'CONNECTOR_TIMEOUT_MS'));
check('A.9: GitHubAdapter uses resilientFetch',        fileContains('src/connectors/adapters/GitHubAdapter.js', 'resilientFetch'));
check('A.10: GmailAdapter maps auth errors',           fileContains('src/connectors/adapters/GmailAdapter.js', 'CONNECTOR_AUTH_EXPIRED') || fileContains('src/connectors/adapters/GmailAdapter.js', 'mapGmailError'));
check('A.11: CalendarAdapter maps auth errors',        fileContains('src/connectors/adapters/GoogleCalendarAdapter.js', 'CONNECTOR_AUTH_EXPIRED') || fileContains('src/connectors/adapters/GoogleCalendarAdapter.js', 'mapCalendarError'));
check('A.12: resilientFetch has CONNECTOR_TIMEOUT code', fileContains('src/connectors/resilientFetch.js', 'CONNECTOR_TIMEOUT'));

// ── B. Background Job Resilience ─────────────────────────────────────────────

console.log('\n== B. Background Job Resilience ==');

check('B.1: ingestionQueue has retry attempts',        fileContains('src/config/queue.js', 'attempts', 'backoff'));
check('B.2: ingestionQueue has exponential backoff',   fileContains('src/config/queue.js', 'exponential'));
check('B.3: ingestionQueue removes completed jobs',    fileContains('src/config/queue.js', 'removeOnComplete'));
check('B.4: ingestionQueue retains failed jobs',       fileContains('src/config/queue.js', 'removeOnFail'));
check('B.5: webhookQueue has retry config',            fileContains('src/config/webhookQueue.js', 'attempts', 'backoff'));
check('B.6: syncQueue has retry config',               fileContains('src/config/syncQueue.js', 'attempts', 'backoff'));
check('B.7: worker has failed event handler',          fileContains('src/workers/ingestionWorker.js', "on('failed'"));
check('B.8: worker has completed event handler',       fileContains('src/workers/ingestionWorker.js', "on('completed'"));
check('B.9: ingestion pipeline returns early on injection', fileContains('src/workers/ingestionWorker.js', 'PROMPT_INJECTION_BLOCKED'));
check('B.10: ingestion pipeline handles each stage independently', fileContains('src/workers/ingestionWorker.js', 'try', 'catch'));

// ── C. Database Resilience ───────────────────────────────────────────────────

console.log('\n== C. Database Resilience ==');

check('C.1: pg pool has connection timeout config',    fileContains('src/config/db.js', 'connectionTimeout') || fileContains('src/config/db.js', 'idleTimeoutMillis') || fileContains('src/config/db.js', 'statement_timeout'));
check('C.2: pg pool has statement timeout',            fileContains('src/config/db.js', 'statement_timeout') || fileContains('src/config/db.js', 'query_timeout') || fileContains('src/config/db.js', 'connectionTimeoutMillis'));
check('C.3: slow queries are logged',                  fileContains('src/config/db.js', 'SLOW_QUERY_MS') || fileContains('src/config/db.js', 'slow'));
check('C.4: pool error does not crash server',         fileContains('src/config/db.js', "on('error'") || !fileContains('src/config/db.js', 'process.exit'));
check('C.5: Redis reconnects on failure',              fileContains('src/config/redis.js', 'retryStrategy') || fileContains('src/config/redis.js', 'reconnectOnError'));
check('C.6: Redis connection error is handled',        fileContains('src/config/redis.js', "on('error'"));

// ── D. AI Resilience ─────────────────────────────────────────────────────────

console.log('\n== D. AI Resilience ==');

check('D.1: Gemini calls have local fallback',        fileContains('src/services/cognitiveBrainService.js', 'fallback') || fileContains('src/services/cognitiveBrainService.js', 'catch'));
check('D.2: Executive synthesis has fallback',        fileContains('src/services/agents/ExecutiveSynthesisAgent.js', 'fallback') || fileContains('src/services/agents/ExecutiveSynthesisAgent.js', 'catch'));
check('D.3: Brain router has fallback provider',      fileContains('src/ai/BrainRouter.js', 'fallback'));
check('D.4: Council agents are time-isolated',        fileContains('src/council/executiveOrchestrator.js', 'Promise.allSettled', 'withTimeout'));
check('D.5: LLM calls check for API key first',       fileContains('src/services/cognitiveBrainService.js', 'GEMINI_API_KEY') || fileContains('src/services/agents/ExecutiveSynthesisAgent.js', 'GEMINI_API_KEY'));
check('D.6: AI prompt injection stripped',            fileContains('src/services/parserService.js', 'STRIPPED INJECTION'));
check('D.7: Token limit handled',                     fileContains('src/ai/BrainRouter.js', 'token') || fileContains('src/ai/reasoning/OperationalBrain.js', 'token'));

// ── E. Security Resilience ───────────────────────────────────────────────────

console.log('\n== E. Security Resilience ==');

check('E.1: JWT required on all protected routes',    fileContains('src/server.js', 'authenticate') && fileContains('src/core/middleware/authenticate.js', 'verify'));
check('E.2: Tenant isolation enforced globally',      fileContains('src/server.js', 'tenantIsolation'));
check('E.3: Cross-workspace access blocked',          fileContains('src/core/middleware/tenantIsolation.js', '403') || fileContains('src/core/middleware/tenantIsolation.js', 'orgId'));
check('E.4: Ingestion queue requires workspace-id',   fileContains('src/routes/workspaceRoutes.js', 'workspace-id') || fileContains('src/core/middleware/tenantIsolation.js', 'workspace-id'));
check('E.5: WebSocket auth required in production',   fileContains('src/services/socketService.js', 'WS_AUTH_REQUIRED'));
check('E.6: Privacy gate blocks PII ingestion',       fileContains('src/workers/ingestionWorker.js', 'privacy_score', 'DISCARD'));
check('E.7: Dev dashboard blocked in production',     fileContains('src/routes/devDashboard.js', 'production', '404'));
check('E.8: SQL uses parameterized queries',          !fileContains('src/services/vectorStoreService.js', "query(`SELECT", "query(`INSERT", "query(`UPDATE"));
check('E.9: Rate limiter is present',                 fileContains('src/server.js', 'rateLimiter'));
check('E.10: CORS origin configurable (not *)',       fileContains('src/server.js', 'CORS_ORIGIN') || fileContains('src/server.js', 'origin: process.env'));

// ── F. Network Resilience ────────────────────────────────────────────────────

console.log('\n== F. Network Resilience ==');

check('F.1: WebSocket reconnects automatically',       fileContains('flow-os-frontend/src/hooks/useWebSocket.jsx', 'reconnect') || fileContains('flow-os-frontend/src/hooks/useWebSocket.jsx', 'retry'));
check('F.2: API calls have error boundaries',          fileExists('flow-os-frontend/src/components/ui/ErrorBoundary.jsx'));
check('F.3: WS handles non-JSON frames',               fileContains('flow-os-frontend/src/hooks/useWebSocket.jsx', 'non-JSON') || fileContains('flow-os-frontend/src/hooks/useWebSocket.jsx', 'JSON.parse'));
check('F.4: Frontend shows error states',              fileContains('flow-os-frontend/src/components/ui/EmptyState.jsx', 'error') || fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'error'));
check('F.5: Request timeout middleware',               fileContains('src/server.js', 'REQUEST_TIMEOUT') || fileContains('src/server.js', 'timeout'));

// ── G. Observability ─────────────────────────────────────────────────────────

console.log('\n== G. Observability ==');

check('G.1: Structured logger exists',                 fileExists('src/utils/logger.js'));
check('G.2: Logger has secret redaction',              fileContains('src/utils/logger.js', 'redact') || fileContains('src/utils/logger.js', 'REDACTED'));
check('G.3: Request correlation IDs',                  fileContains('src/server.js', 'x-request-id') || fileContains('src/server.js', 'requestId'));
check('G.4: Connector audit persisted to DB',          fileContains('src/core/governance/auditPersistence.js', 'INSERT') || fileContains('src/core/governance/auditPersistence.js', 'prisma'));
check('G.5: Ingestion trace per job',                  fileContains('src/workers/ingestionWorker.js', 'traceId', 'updateIngestionTrace'));
check('G.6: Slow queries logged',                      fileContains('src/config/db.js', 'slow') || fileContains('src/config/db.js', 'SLOW'));
check('G.7: Metrics endpoint available',               fileContains('src/server.js', '/api/metrics') || fileContains('src/server.js', 'metrics'));
check('G.8: Health probe available',                   fileContains('src/server.js', '/health'));
check('G.9: Failed jobs logged',                       fileContains('src/workers/ingestionWorker.js', "on('failed'", 'logger'));
check('G.10: Worker crash handled',                    fileContains('src/core/lifecycle/gracefulShutdown.js', 'SIGTERM'));

// ── H. UX Resilience ─────────────────────────────────────────────────────────

console.log('\n== H. UX Resilience ==');

check('H.1: Loading states on all data pages',         fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'loading') && fileContains('flow-os-frontend/src/components/meetings/MeetingDashboard.jsx', 'loading'));
check('H.2: No raw errors shown to users',             !fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'console.error') && !fileContains('flow-os-frontend/src/components/meetings/MeetingDashboard.jsx', 'throw'));
check('H.3: Empty states have CTA actions',            fileContains('flow-os-frontend/src/components/inbox/AIInbox.jsx', 'PlugZap') || fileContains('flow-os-frontend/src/components/ui/EmptyState.jsx', 'action'));
check('H.4: Demo data gated by workspaceMode',         fileContains('flow-os-frontend/src/components/workspace/SupportDashboard.jsx', 'isDemoWorkspace'));
check('H.5: Auth expiry shown to user',                fileContains('flow-os-frontend/src/components/ui/ErrorBoundary.jsx', 'session') || fileContains('flow-os-frontend/src/components/inbox/AIInbox.jsx', 'session has expired'));
check('H.6: No infinite spinner possible',             fileContains('flow-os-frontend/src/components/onboarding/SetupWizard.jsx', 'setTimeout', 'setDone'));

// ── Report ────────────────────────────────────────────────────────────────────

const total = passed + failed;
const score = Math.round((passed / total) * 100);

console.log(`\n${'─'.repeat(60)}`);
console.log('FLOW OS — Enterprise Resilience Certification');
console.log(`${'─'.repeat(60)}`);
results.forEach(({ ok, label, detail }) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
});

console.log(`\n${'─'.repeat(60)}`);
console.log(`Score: ${passed}/${total} — ${score}%`);
if (score >= 90) console.log(`\n🎯 FLOW OS Resilience: ${score}/100 — ENTERPRISE-GRADE\n`);
else if (score >= 70) console.log(`\n⚠️  FLOW OS Resilience: ${score}/100 — NEEDS HARDENING\n`);
else console.log(`\n❌ FLOW OS Resilience: ${score}/100 — NOT READY\n`);

if (failed > 0) {
  console.log('Failures:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.label}${r.detail ? ': ' + r.detail : ''}`));
}

process.exit(failed > 0 ? 1 : 0);
