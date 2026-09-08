/**
 * Phase 8 Validation — Event-Driven Automation Platform
 *
 * Standalone: no live server, no PostgreSQL, no Redis.
 * Tests all pure-logic modules. RegistryLoader uses the filesystem only.
 *
 * Run:  node scripts/validate-phase8.js
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { createHmac }                        from 'crypto';
import { fileURLToPath }                     from 'url';
import { join, dirname }                     from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function assertThrows(label, fn, expectedCode) {
  try {
    fn();
    console.error(`  ✗  ${label} — expected throw but did not`);
    failed++;
  } catch (err) {
    if (!expectedCode || err.code === expectedCode || err.message.includes(expectedCode)) {
      console.log(`  ✓  ${label}`);
      passed++;
    } else {
      console.error(`  ✗  ${label} — threw ${err.code}: ${err.message}`);
      failed++;
    }
  }
}

async function section(name, fn) {
  console.log(`\n▸ ${name}`);
  await fn();
}

// ── 1. File structure ─────────────────────────────────────────────────────────

await section('File structure — automation modules', () => {
  const required = [
    'src/automation/AutomationEngine.js',
    'src/automation/index.js',
    'src/automation/executionStore.js',
    'src/automation/eventRegistry/EventRegistry.js',
    'src/automation/eventRegistry/RegistryLoader.js',
    'src/automation/eventRegistry/index.js',
    'src/automation/eventRouter/ConditionEvaluator.js',
    'src/automation/eventRouter/PayloadTransformer.js',
    'src/automation/eventRouter/RateLimiter.js',
    'src/automation/eventRouter/EventRouter.js',
    'src/automation/triggerRegistry/TriggerStore.js',
    'src/automation/triggerRegistry/TriggerRegistry.js',
    'src/automation/triggerRegistry/index.js',
    'src/automation/scheduler/BusinessHours.js',
    'src/automation/scheduler/ScheduledJobStore.js',
    'src/automation/scheduler/Scheduler.js',
    'src/automation/webhookGateway/WebhookGateway.js',
    'src/automation/webhookGateway/ReplayProtection.js',
    'src/automation/webhookGateway/verifiers/GitHubVerifier.js',
    'src/automation/webhookGateway/verifiers/SlackVerifier.js',
    'src/automation/webhookGateway/verifiers/StripeVerifier.js',
    'src/automation/webhookGateway/verifiers/JiraVerifier.js',
    'src/automation/webhookGateway/verifiers/GoogleVerifier.js',
    'src/automation/webhookGateway/verifiers/CustomVerifier.js',
    'src/routes/automationRoutes.js',
    'scripts/migrate-automation-platform.sql',
  ];
  for (const rel of required) {
    assert(`${rel} exists`, existsSync(join(ROOT, rel)));
  }
});

// ── 2. Event definition files ─────────────────────────────────────────────────

await section('Event definition files', () => {
  const eventsDir = join(ROOT, 'src/automation/eventRegistry/events');

  const connectorDirs = readdirSync(eventsDir).filter(name =>
    statSync(join(eventsDir, name)).isDirectory()
  );

  let total = 0;
  for (const c of connectorDirs) {
    const files = readdirSync(join(eventsDir, c)).filter(f => f.endsWith('.js'));
    total += files.length;
  }
  assert(`19 event definition files registered`, total === 19, `found ${total}`);

  const expectedConnectors = ['github', 'gmail', 'jira', 'calendar', 'slack', 'stripe', 'pagerduty', 'datadog', 'system'];
  for (const c of expectedConnectors) {
    assert(`events/${c}/ directory exists`, connectorDirs.includes(c));
  }

  assert(`system/scheduler.fired.js exists`,
    existsSync(join(eventsDir, 'system/scheduler.fired.js')));
  assert(`pagerduty/incident.created.js exists`,
    existsSync(join(eventsDir, 'pagerduty/incident.created.js')));
  assert(`stripe/payment.failed.js exists`,
    existsSync(join(eventsDir, 'stripe/payment.failed.js')));
});

// ── 3. EventRegistry (pure in-memory, no deps) ───────────────────────────────

await section('EventRegistry — load / resolve / list / search / stats', async () => {
  // EventRegistry class is internal — test via the exported singleton
  const { eventRegistry: reg, EventNotFoundError } = await import(join(ROOT, 'src/automation/eventRegistry/EventRegistry.js'));

  reg.clear(); // start fresh

  const defs = [
    { id: 'github.pr.opened', connector: 'github', category: 'engineering', source: 'webhook',
      displayName: 'PR Opened', description: 'Pull request opened', priority: 'NORMAL',
      deduplication: { enabled: true, windowMs: 60000 }, security: { signatureRequired: true }, schema: {} },
    { id: 'gmail.email.received', connector: 'gmail', category: 'communication', source: 'connector',
      displayName: 'Email Received', description: 'New email received', priority: 'NORMAL',
      deduplication: { enabled: true, windowMs: 60000 }, security: { signatureRequired: false }, schema: {} },
    { id: 'jira.issue.created', connector: 'jira', category: 'work', source: 'webhook',
      displayName: 'Issue Created', description: 'Jira issue created', priority: 'NORMAL',
      deduplication: { enabled: true, windowMs: 60000 }, security: { signatureRequired: true }, schema: {} },
  ];

  const count = reg.load(defs);
  assert('load() returns number of loaded definitions', count === 3, `got ${count}`);

  const pr = reg.resolve('github.pr.opened');
  assert('resolve() returns the correct definition', pr.id === 'github.pr.opened');
  assert('resolve() returns a frozen object', Object.isFrozen(pr));

  assert('has() true for known id', reg.has('gmail.email.received'));
  assert('has() false for unknown id', !reg.has('github.pr.merged'));

  assertThrows('resolve() throws EventNotFoundError for unknown id',
    () => reg.resolve('nonexistent.event'), 'EVENT_NOT_FOUND');

  const githubEvents = reg.list({ connector: 'github' });
  assert('list({ connector }) filters correctly', githubEvents.length === 1 && githubEvents[0].id === 'github.pr.opened');

  const webhookEvents = reg.list({ source: 'webhook' });
  assert('list({ source }) returns all webhook events', webhookEvents.length === 2);

  const results = reg.search('email');
  assert('search() finds by keyword in id/description', results.length >= 1 && results.some(e => e.id === 'gmail.email.received'));

  const stats = reg.stats();
  assert('stats() reports correct total', stats.total === 3);
  assert('stats() groups byConnector', stats.byConnector.github === 1 && stats.byConnector.gmail === 1);
  assert('stats() groups bySource', stats.bySource.webhook === 2 && stats.bySource.connector === 1);

  reg.clear();
  assert('clear() empties the registry', reg.stats().total === 0);
});

// ── 4. RegistryLoader — filesystem scan ───────────────────────────────────────

await section('RegistryLoader — scan and load all 19 event definitions', async () => {
  const { loadEventRegistry } = await import(join(ROOT, 'src/automation/eventRegistry/RegistryLoader.js'));
  const { eventRegistry }     = await import(join(ROOT, 'src/automation/eventRegistry/EventRegistry.js'));

  // Clear first in case any prior import already loaded it
  eventRegistry.clear();
  await loadEventRegistry();

  const stats = eventRegistry.stats();
  assert(`loadEventRegistry() loads all 19 definitions`, stats.total === 19, `got ${stats.total}`);
  assert(`github connector loaded`, (stats.byConnector.github ?? 0) >= 4);
  assert(`gmail connector loaded`,  (stats.byConnector.gmail  ?? 0) >= 1);
  assert(`jira connector loaded`,   (stats.byConnector.jira   ?? 0) >= 2);
  assert(`system connector loaded`, (stats.byConnector.system ?? 0) >= 2);

  const prDef = eventRegistry.resolve('github.pr.opened');
  assert(`resolve('github.pr.opened') returns valid def`, prDef?.id === 'github.pr.opened');
  assert(`github.pr.opened has schema`,  typeof prDef.schema === 'object');
  assert(`github.pr.opened has security`, typeof prDef.security === 'object');

  const sched = eventRegistry.resolve('system.scheduler.fired');
  assert(`resolve('system.scheduler.fired') works`, sched?.source === 'scheduler');

  // Idempotency: calling again should not double-load
  const statsBefore = eventRegistry.stats().total;
  await loadEventRegistry();
  assert('loadEventRegistry() is idempotent', eventRegistry.stats().total === statsBefore);
});

// ── 5. ConditionEvaluator ─────────────────────────────────────────────────────

await section('ConditionEvaluator — all operators and combinators', async () => {
  const { evaluate } = await import(join(ROOT, 'src/automation/eventRouter/ConditionEvaluator.js'));

  const event = {
    workspaceId: 'ws_test',
    connector:   'github',
    eventType:   'pr_opened',
    payload: {
      pr: { number: 42, draft: false, title: 'feat: new thing' },
      action: 'opened',
      labels: ['bug', 'priority-high'],
    },
    metadata: { sender: 'alice@co.com' },
  };

  assert('empty condition (null) → true',        evaluate(null, event));
  assert('empty condition ({}) → true',           evaluate({}, event));
  assert('eq op: matching',                       evaluate({ field: 'payload.pr.number', op: 'eq', value: 42 }, event));
  assert('eq op: not matching',                   !evaluate({ field: 'payload.pr.number', op: 'eq', value: 99 }, event));
  assert('ne op',                                 evaluate({ field: 'payload.pr.draft', op: 'ne', value: true }, event));
  assert('gt op',                                 evaluate({ field: 'payload.pr.number', op: 'gt', value: 10 }, event));
  assert('lt op',                                 evaluate({ field: 'payload.pr.number', op: 'lt', value: 100 }, event));
  assert('gte op (equal case)',                   evaluate({ field: 'payload.pr.number', op: 'gte', value: 42 }, event));
  assert('lte op (less case)',                    evaluate({ field: 'payload.pr.number', op: 'lte', value: 50 }, event));
  assert('in op',                                 evaluate({ field: 'payload.action', op: 'in', value: ['opened', 'reopened'] }, event));
  assert('nin op',                                evaluate({ field: 'payload.action', op: 'nin', value: ['closed', 'merged'] }, event));
  assert('contains op (array)',                   evaluate({ field: 'payload.labels', op: 'contains', value: 'bug' }, event));
  assert('contains op (string)',                  evaluate({ field: 'payload.pr.title', op: 'contains', value: 'new thing' }, event));
  assert('startsWith op',                         evaluate({ field: 'payload.pr.title', op: 'startsWith', value: 'feat:' }, event));
  assert('endsWith op',                           evaluate({ field: 'payload.pr.title', op: 'endsWith', value: 'thing' }, event));
  assert('exists op: field present → true',       evaluate({ field: 'payload.pr.number', op: 'exists', value: true }, event));
  assert('exists op: field missing → true (absent)', evaluate({ field: 'payload.pr.missing', op: 'exists', value: false }, event));
  assert('isEmpty op: empty string',              evaluate({ field: 'nonexistent', op: 'isEmpty' }, event));
  assert('regex op',                              evaluate({ field: 'payload.pr.title', op: 'regex', value: '^feat:' }, event));
  assert('dot-path resolution: metadata.sender', evaluate({ field: 'metadata.sender', op: 'eq', value: 'alice@co.com' }, event));
  assert('top-level field: workspaceId',          evaluate({ field: 'workspaceId', op: 'eq', value: 'ws_test' }, event));

  // Logical combinators
  assert('{all: [...]} combinator (AND — all true)',
    evaluate({ all: [
      { field: 'payload.action', op: 'eq', value: 'opened' },
      { field: 'payload.pr.draft', op: 'eq', value: false },
    ]}, event));
  assert('{all: [...]} combinator (AND — one false)',
    !evaluate({ all: [
      { field: 'payload.action', op: 'eq', value: 'opened' },
      { field: 'payload.pr.draft', op: 'eq', value: true },
    ]}, event));
  assert('{any: [...]} combinator (OR — one true)',
    evaluate({ any: [
      { field: 'payload.action', op: 'eq', value: 'closed' },
      { field: 'payload.pr.draft', op: 'eq', value: false },
    ]}, event));
  assert('{not: ...} combinator',
    evaluate({ not: { field: 'payload.pr.draft', op: 'eq', value: true } }, event));
  assert('nested combinators: {all: [{any: [...]}]}',
    evaluate({ all: [
      { any: [
        { field: 'payload.action', op: 'eq', value: 'opened' },
        { field: 'payload.action', op: 'eq', value: 'reopened' },
      ]},
      { field: 'payload.pr.draft', op: 'eq', value: false },
    ]}, event));
});

// ── 6. PayloadTransformer ─────────────────────────────────────────────────────

await section('PayloadTransformer — param mapping', async () => {
  const { transform } = await import(join(ROOT, 'src/automation/eventRouter/PayloadTransformer.js'));

  const event = {
    workspaceId:   'ws_transform',
    connector:     'github',
    eventType:     'pr_opened',
    sourceEventId: 'gh-delivery-123',
    correlationId: 'corr-abc',
    payload: {
      pr: { number: 7, title: 'fix: crash' },
      repo: { name: 'myapp', full_name: 'org/myapp' },
    },
    metadata: { sender: 'bob@co.com' },
  };

  const result = transform({
    prNumber:      'payload.pr.number',
    repoFullName:  'payload.repo.full_name',
    sender:        'metadata.sender',
    workspace:     'workspaceId',
    sourceId:      'sourceEventId',
    staticLabel:   '"needs-review"',
    numericLit:    42,
    missing:       'payload.nonexistent.field',
  }, event);

  assert('dot-path: payload.pr.number',       result.prNumber === 7);
  assert('dot-path: payload.repo.full_name',  result.repoFullName === 'org/myapp');
  assert('dot-path: metadata.sender',         result.sender === 'bob@co.com');
  assert('top-level: workspaceId',            result.workspace === 'ws_transform');
  assert('top-level: sourceEventId',          result.sourceId === 'gh-delivery-123');
  assert('literal string (quoted)',           result.staticLabel === 'needs-review');
  assert('pass-through numeric literal',      result.numericLit === 42);
  assert('missing path → undefined',          result.missing === undefined);

  const emptyResult = transform(null, event);
  assert('null paramMapping → empty object',  typeof emptyResult === 'object' && Object.keys(emptyResult).length === 0);
});

// ── 7. GitHub Verifier ────────────────────────────────────────────────────────

await section('GitHubVerifier — HMAC-SHA256 + event type extraction', async () => {
  const GH = await import(join(ROOT, 'src/automation/webhookGateway/verifiers/GitHubVerifier.js'));

  const secret  = 'my-github-webhook-secret';
  const body    = Buffer.from(JSON.stringify({ action: 'opened', pull_request: { number: 5 } }));
  const sig     = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  const validReq = {
    headers: { 'x-hub-signature-256': sig, 'x-github-event': 'pull_request', 'x-github-delivery': 'abc-123' },
  };
  assert('verify(): valid HMAC → ok:true',         GH.verify(validReq, body, secret).ok);
  assert('verify(): wrong secret → ok:false',       !GH.verify(validReq, body, 'wrong').ok);
  assert('verify(): missing header → ok:false',     !GH.verify({ headers: {} }, body, secret).ok);

  const withAction = { headers: { 'x-github-event': 'pull_request' } };
  assert("extractEventType() with action → 'github.pull_request.opened'",
    GH.extractEventType(withAction, { action: 'opened' }) === 'github.pull_request.opened');
  assert("extractEventType() without action → 'github.push'",
    GH.extractEventType({ headers: { 'x-github-event': 'push' } }, {}) === 'github.push');

  assert('extractDeliveryId() returns header value',
    GH.extractDeliveryId(validReq) === 'abc-123');
});

// ── 8. Slack Verifier ─────────────────────────────────────────────────────────

await section('SlackVerifier — timestamp-bounded HMAC', async () => {
  const SL = await import(join(ROOT, 'src/automation/webhookGateway/verifiers/SlackVerifier.js'));

  const secret  = 'slack-signing-secret';
  const body    = Buffer.from('{"type":"event_callback"}');
  const ts      = String(Math.floor(Date.now() / 1000));   // fresh timestamp within window
  const base    = `v0:${ts}:${body.toString()}`;
  const sig     = 'v0=' + createHmac('sha256', secret).update(base).digest('hex');

  const freshReq = {
    headers: { 'x-slack-request-timestamp': ts, 'x-slack-signature': sig },
  };
  assert('verify(): valid fresh HMAC → ok:true', SL.verify(freshReq, body, secret).ok);
  assert('verify(): wrong secret → ok:false',     !SL.verify(freshReq, body, 'wrong').ok);
  assert('verify(): missing headers → ok:false',  !SL.verify({ headers: {} }, body, secret).ok);

  const oldTs = String(Math.floor(Date.now() / 1000) - 400);
  const staleReq = {
    headers: { 'x-slack-request-timestamp': oldTs, 'x-slack-signature': sig },
  };
  assert('verify(): stale timestamp (>300s) → ok:false', !SL.verify(staleReq, body, secret).ok);

  assert("extractEventType(): url_verification → 'slack.url_verification'",
    SL.extractEventType({}, { type: 'url_verification' }) === 'slack.url_verification');
  assert("extractEventType(): event.type present → 'slack.app_mention'",
    SL.extractEventType({}, { type: 'event_callback', event: { type: 'app_mention' } }) === 'slack.app_mention');
});

// ── 9. Stripe Verifier ────────────────────────────────────────────────────────

await section('StripeVerifier — t/v1 format multi-sig', async () => {
  const ST = await import(join(ROOT, 'src/automation/webhookGateway/verifiers/StripeVerifier.js'));

  const secret  = 'whsec_test_secret';
  const body    = Buffer.from('{"type":"payment_intent.succeeded"}');
  const ts      = String(Math.floor(Date.now() / 1000));
  const expected = createHmac('sha256', secret).update(`${ts}.${body.toString()}`).digest('hex');

  const stripeReq = {
    headers: { 'stripe-signature': `t=${ts},v1=${expected}` },
  };
  assert('verify(): valid Stripe sig → ok:true', ST.verify(stripeReq, body, secret).ok);
  assert('verify(): wrong secret → ok:false',     !ST.verify(stripeReq, body, 'wrong').ok);
  assert('verify(): missing header → ok:false',   !ST.verify({ headers: {} }, body, secret).ok);

  // Multi-sig format (OR logic: second sig matches)
  const wrongSig = 'aaaa';
  const multiReq = { headers: { 'stripe-signature': `t=${ts},v1=${wrongSig},v1=${expected}` } };
  assert('verify(): multi-sig: any match → ok:true', ST.verify(multiReq, body, secret).ok);

  assert("extractEventType(): payment_intent.succeeded → 'stripe.payment_intent_succeeded'",
    ST.extractEventType({}, { type: 'payment_intent.succeeded' }) === 'stripe.payment_intent_succeeded');
  assert('extractDeliveryId(): returns payload.id',
    ST.extractDeliveryId({}, { id: 'evt_abc123' }) === 'evt_abc123');
});

// ── 10. BusinessHours ─────────────────────────────────────────────────────────

await section('BusinessHours — weekday/hour range detection', async () => {
  const { isBusinessHours, nextBusinessHoursStart } =
    await import(join(ROOT, 'src/automation/scheduler/BusinessHours.js'));

  // Monday 2026-07-20 10:00 UTC  (definitely a weekday at 10:00 → should be IN hours)
  const monAm  = new Date('2026-07-20T10:00:00Z'); // Monday
  const satAm  = new Date('2026-07-18T10:00:00Z'); // Saturday
  const monEarly = new Date('2026-07-20T07:00:00Z'); // Monday 07:00 UTC
  const monLate  = new Date('2026-07-20T18:00:00Z'); // Monday 18:00 UTC — end hour is exclusive

  assert('Mon 10:00 UTC → in business hours',        isBusinessHours('UTC', monAm));
  assert('Sat 10:00 UTC → NOT business hours',       !isBusinessHours('UTC', satAm));
  assert('Mon 07:00 UTC → NOT in hours (before 09)', !isBusinessHours('UTC', monEarly));
  assert('Mon 18:00 UTC → NOT in hours (at end)',    !isBusinessHours('UTC', monLate));

  const next = nextBusinessHoursStart('UTC', satAm);
  assert('nextBusinessHoursStart() returns ISO string', typeof next === 'string' && !isNaN(Date.parse(next)));
  assert('nextBusinessHoursStart() is after the input time', new Date(next) > satAm);
});

// ── 11. AutomationEngine source shape ─────────────────────────────────────────
// (Not imported: its transitive deps require the full Runtime; verified via source text)

await section('AutomationEngine — source exports and guard pattern', async () => {
  const { readFileSync } = await import('fs');
  const src = readFileSync(join(ROOT, 'src/automation/AutomationEngine.js'), 'utf8');

  assert('exports startAutomationEngine',  src.includes('export function startAutomationEngine'));
  assert('exports stopAutomationEngine',   src.includes('export function stopAutomationEngine'));
  assert('exports isRunning',              src.includes('export function isRunning'));
  assert('has idempotency guard (_started)', src.includes('_started'));
  assert('subscribes to event bus',        src.includes('subscribe('));
  assert('calls routeEvent()',             src.includes('routeEvent(event)'));
  assert('never emits events (no publish calls)', !src.includes('publish(') && !src.includes('publishFields('));
});

// ── 12. SQL migration ─────────────────────────────────────────────────────────

await section('SQL migration file content', async () => {
  const { readFileSync } = await import('fs');
  const sql = readFileSync(join(ROOT, 'scripts/migrate-automation-platform.sql'), 'utf8');

  assert('migration creates automation_triggers',  sql.includes('automation_triggers'));
  assert('migration creates automation_executions', sql.includes('automation_executions'));
  assert('migration creates webhook_deliveries',   sql.includes('webhook_deliveries'));
  assert('migration creates scheduled_jobs',       sql.includes('scheduled_jobs'));
  assert('migration uses IF NOT EXISTS',           sql.includes('IF NOT EXISTS'));
  assert('migration creates updated_at trigger',   sql.includes('automation_set_updated_at'));
});

// ── 13. Automation routes file shape (source inspection) ─────────────────────
// (Not imported: transitive deps require Runtime + Redis; verified via source text)

await section('automationRoutes.js — declared routes and exports', async () => {
  const { readFileSync } = await import('fs');
  const src = readFileSync(join(ROOT, 'src/routes/automationRoutes.js'), 'utf8');

  assert('default export (router)',                  src.includes('export default router'));
  assert('GET /events route',                        src.includes("router.get('/events'"));
  assert('GET /events/search route',                 src.includes("router.get('/events/search'"));
  assert('GET /events/:id route',                    src.includes("router.get('/events/:id'"));
  assert('GET /triggers route',                      src.includes("router.get('/triggers'"));
  assert('POST /triggers route',                     src.includes("router.post('/triggers'"));
  assert('PATCH /triggers/:id route',                src.includes("router.patch('/triggers/:id'"));
  assert('DELETE /triggers/:id route',               src.includes("router.delete('/triggers/:id'"));
  assert('POST /triggers/:id/enable route',          src.includes('/triggers/:id/enable'));
  assert('POST /triggers/:id/disable route',         src.includes('/triggers/:id/disable'));
  assert('GET /history route',                       src.includes("router.get('/history'"));
  assert('GET /scheduled route',                     src.includes("router.get('/scheduled'"));
  assert('POST /scheduled route',                    src.includes("router.post('/scheduled'"));
  assert('DELETE /scheduled/:id route',              src.includes("router.delete('/scheduled/:id'"));
  assert('GET /status route',                        src.includes("router.get('/status'"));
  assert('uses req.tenantId for workspace isolation', src.includes('req.tenantId'));
});

// ── 14. automation/index.js public API (source inspection) ───────────────────

await section('automation/index.js — startAutomationPlatform and re-exports', async () => {
  const { readFileSync } = await import('fs');
  const src = readFileSync(join(ROOT, 'src/automation/index.js'), 'utf8');

  assert('exports startAutomationPlatform',   src.includes('export async function startAutomationPlatform'));
  assert('re-exports isRunning',              src.includes("isRunning }") || src.includes("isRunning}"));
  assert('re-exports webhookRouter',          src.includes('webhookRouter'));
  assert('re-exports startScheduler',         src.includes('startScheduler'));
  assert('re-exports createTrigger',          src.includes('createTrigger'));
  assert('re-exports listExecutions',         src.includes('listExecutions'));
  assert('startAutomationPlatform calls loadEventRegistry()', src.includes('loadEventRegistry()'));
  assert('startAutomationPlatform calls startAutomationEngine()', src.includes('startAutomationEngine()'));
  assert('startAutomationPlatform calls startScheduler()', src.includes('startScheduler()'));
});

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`Phase 8 Validation: ${passed}/${total} PASS  ${failed > 0 ? `(${failed} FAIL)` : ''}`);

if (failed > 0) {
  console.error('\nFAILED — fix the issues above before deploying Phase 8.');
  process.exit(1);
} else {
  console.log('\nAll assertions pass. Event-Driven Automation Platform ready.');
  process.exit(0);
}
