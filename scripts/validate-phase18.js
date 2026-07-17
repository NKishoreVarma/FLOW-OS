/**
 * Phase 18 — Full validation harness
 *   node scripts/validate-phase18.js
 *
 * Runs the analytics M1 suite + static structural checks (no live server needed).
 * Run validate-pilot-journeys.js separately with a live server.
 */

import { randomUUID } from 'node:crypto';
import { query } from '../src/config/db.js';
import { trackEvent } from '../src/analytics/pilotTracker.js';
import { getMetrics } from '../src/analytics/pilotMetrics.js';
import { buildDigest } from '../src/analytics/digestService.js';
import { submitFeedback, getFeedback } from '../src/feedback/feedbackStore.js';
import { getRecovery } from '../src/core/errors/recoveryMap.js';
import { broadcast, addClient, removeClient } from '../src/analytics/sseClients.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = fileURLToPath(new URL('..', import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

const wsId = `phase18-test-${randomUUID().slice(0, 8)}`;
const userId = `user-${randomUUID().slice(0, 8)}`;

async function main() {
  console.log('\n🚀 Phase 18 — Full Validation\n');

  // ── 1. pilotTracker ──────────────────────────────────────────────────────────
  console.log('1. pilotTracker');
  await trackEvent(wsId, userId, 'session.start', {});
  await trackEvent(wsId, userId, 'morning_brief.loaded', { loadTimeMs: 320 });
  await trackEvent(wsId, null,   'morning_brief.failed', { errorCode: 'WIC_BUILD_FAILED' });
  await trackEvent(wsId, userId, 'feature.visited', { route: '/meetings' });
  await trackEvent(wsId, userId, 'action.completed', { actionType: 'create_pr' });
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM pilot_events WHERE workspace_id = $1', [wsId]);
  ok('5 events tracked', rows[0].n === 5);

  // ── 2. pilotMetrics ──────────────────────────────────────────────────────────
  console.log('2. pilotMetrics');
  const m = await getMetrics(wsId, 7);
  ok('dau array', Array.isArray(m.dau));
  ok('featureEngagement /meetings', m.featureEngagement.some(f => f.route === '/meetings'));
  ok('errors object has morning_brief.failed', m.errors['morning_brief.failed'] === 1);

  // ── 3. feedbackStore ─────────────────────────────────────────────────────────
  console.log('3. feedbackStore');
  const fb = await submitFeedback(wsId, userId, { thumbs: 'down', text: null, context: 'phase18-test' });
  ok('feedback stored with id', typeof fb.id !== 'undefined');
  const list = await getFeedback(wsId);
  ok('getFeedback retrieves row', list.length >= 1 && list[0].thumbs === 'down');

  // ── 4. buildDigest ───────────────────────────────────────────────────────────
  console.log('4. buildDigest');
  const d = await buildDigest(wsId);
  ok('digest.date valid', /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  ok('digest.sessions >= 1', d.sessions >= 1);
  ok('digest.feedback.total >= 1', d.feedback.total >= 1);

  // ── 5. recoveryMap completeness ───────────────────────────────────────────────
  console.log('5. recoveryMap');
  const required = ['CONNECTOR_AUTH_EXPIRED','WIC_BUILD_FAILED','APPROVAL_REQUIRED','RATE_LIMITED',
    'AUTHENTICATION_REQUIRED','FORBIDDEN','NOT_FOUND','CONNECTOR_UNAVAILABLE','WORKSPACE_NOT_FOUND','INTERNAL_ERROR'];
  for (const code of required) {
    const r = getRecovery(code);
    ok(`${code} has userMessage + recoverySteps`, !!r?.userMessage && Array.isArray(r.recoverySteps) && r.recoverySteps.length > 0);
  }
  ok('unknown code returns null', getRecovery('MADE_UP') === null);

  // ── 6. sseClients ────────────────────────────────────────────────────────────
  console.log('6. sseClients');
  const frames = [];
  const fakeRes = { write: s => frames.push(s) };
  addClient(wsId, fakeRes);
  broadcast(wsId, { type: 'ping' });
  ok('SSE broadcast reaches client', frames.length === 1);
  removeClient(wsId, fakeRes);
  broadcast(wsId, { type: 'ping2' });
  ok('SSE stops after removeClient', frames.length === 1);

  // ── 7. File presence check ────────────────────────────────────────────────────
  console.log('7. File presence');
  const files = [
    'src/analytics/pilotTracker.js',
    'src/analytics/pilotMetrics.js',
    'src/analytics/digestService.js',
    'src/analytics/sseClients.js',
    'src/analytics/analyticsSubscriber.js',
    'src/feedback/feedbackStore.js',
    'src/core/errors/recoveryMap.js',
    'src/routes/analyticsRoutes.js',
    'src/routes/feedbackRoutes.js',
    'flow-os-frontend/src/components/ui/RecoveryToast.jsx',
    'flow-os-frontend/src/components/pilot/PilotDashboard.jsx',
    'flow-os-frontend/src/components/admin/AdminOps.jsx',
    'docs/PILOT_RUNBOOK.md',
    'scripts/validate-pilot-journeys.js',
  ];
  for (const f of files) {
    ok(`${f} exists`, existsSync(join(__dir, f)));
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  await query('DELETE FROM pilot_events WHERE workspace_id = $1', [wsId]);
  await query('DELETE FROM pilot_feedback WHERE workspace_id = $1', [wsId]);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Phase 18 Full: ${pass} passed / ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
