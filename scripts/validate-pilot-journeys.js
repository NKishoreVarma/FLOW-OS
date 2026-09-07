/**
 * Phase 18 — Pilot Journey Validation
 *   PILOT_JWT=<jwt> PILOT_WS=<workspace-id> node scripts/validate-pilot-journeys.js
 *
 * Requires a live server at http://localhost:5001.
 */

const BASE  = process.env.PILOT_BASE || 'http://localhost:5001';
const JWT   = process.env.PILOT_JWT  || '';
const WS    = process.env.PILOT_WS   || 'workspace_corp_alpha';

if (!JWT) { console.error('❌  Set PILOT_JWT env var to a valid bearer token.'); process.exit(1); }

const H = { Authorization: `Bearer ${JWT}`, 'workspace-id': WS, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}
async function post(path, data) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: H, body: JSON.stringify(data) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function main() {
  console.log('\n🚀 Phase 18 — Pilot Journey Validation\n');
  console.log(`   Server: ${BASE}   Workspace: ${WS}\n`);

  // ── Journey 1: Morning Brief ──────────────────────────────────────────────────
  console.log('Journey 1: Morning Brief');
  const snap = await get('/api/workspace/snapshot');
  ok('snapshot returns 200', snap.status === 200, `got ${snap.status}`);
  ok('snapshot has overall.health', !!snap.body.overall?.health || snap.body.status === 'building', JSON.stringify(snap.body).slice(0, 80));

  // ── Journey 2: Inbox ─────────────────────────────────────────────────────────
  console.log('Journey 2: Inbox');
  const inbox = await get('/api/communication/inbox?limit=5');
  ok('inbox returns 200 or 503 with userMessage',
    inbox.status === 200 ||
    (inbox.status === 503 && !!inbox.body.error?.userMessage),
    `status=${inbox.status}`
  );
  if (inbox.status !== 200) ok('inbox 503 has recoverySteps', Array.isArray(inbox.body.error?.recoverySteps), JSON.stringify(inbox.body.error).slice(0, 100));

  // ── Journey 3: Meetings ───────────────────────────────────────────────────────
  console.log('Journey 3: Meetings');
  const meetings = await get('/api/meetings/upcoming?days=7&limit=5');
  ok('meetings returns 200 or 503 with userMessage',
    meetings.status === 200 ||
    (meetings.status === 503 && !!meetings.body.error?.userMessage),
    `status=${meetings.status}`
  );

  // ── Journey 4: Council Ask ────────────────────────────────────────────────────
  console.log('Journey 4: Council Ask');
  const council = await post('/api/council/ask', { question: 'What is the biggest engineering risk right now?' });
  ok('council returns 200', council.status === 200, `got ${council.status}`);
  ok('council answer.text present', typeof council.body.answer?.text === 'string', JSON.stringify(council.body).slice(0, 100));

  // ── Journey 5: Execution Plan ─────────────────────────────────────────────────
  console.log('Journey 5: Execution Plan');
  const plan = await post('/api/execution/plan', { intent: 'Send a status update email' });
  ok('plan returns 200', plan.status === 200, `got ${plan.status}`);
  ok('plan.steps present', Array.isArray(plan.body.steps) || Array.isArray(plan.body.plan?.steps), JSON.stringify(plan.body).slice(0, 100));

  // ── Journey 6: Error Recovery ─────────────────────────────────────────────────
  console.log('Journey 6: Error Recovery');
  const raw = await fetch(`${BASE}/api/workspace/snapshot`, { headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' } });
  const rawBody = await raw.json().catch(() => ({}));
  ok('missing workspace returns 400', raw.status === 400, `got ${raw.status}`);

  const badWs = await fetch(`${BASE}/api/workspace/snapshot`, {
    headers: { Authorization: `Bearer ${JWT}`, 'workspace-id': 'does-not-exist-xyz', 'Content-Type': 'application/json' },
  });
  const badBody = await badWs.json().catch(() => ({}));
  const hasRecovery = !!badBody.error?.userMessage || !!badBody.error?.recoverySteps;
  ok('error response has userMessage or recoverySteps when applicable',
    hasRecovery || badWs.status === 400 || badWs.status === 403,
    `status=${badWs.status} body=${JSON.stringify(badBody).slice(0, 80)}`
  );

  const track = await post('/api/analytics/event', { event: 'session.start', properties: { source: 'journey-test' } });
  ok('analytics event endpoint accepts events', track.status === 200, `got ${track.status}`);

  const fb = await post('/api/feedback', { thumbs: 'up', context: 'journey-test' });
  ok('feedback endpoint accepts submission', fb.status === 200, `got ${fb.status}`);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Journey Validation: ${pass} passed / ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
