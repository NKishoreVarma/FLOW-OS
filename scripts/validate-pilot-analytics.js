/**
 * Phase 18 M1 Validation — Pilot Analytics
 *   node scripts/validate-pilot-analytics.js
 */
import { randomUUID } from 'node:crypto';
import { query } from '../src/config/db.js';
import { trackEvent } from '../src/analytics/pilotTracker.js';
import { getMetrics } from '../src/analytics/pilotMetrics.js';
import { buildDigest } from '../src/analytics/digestService.js';
import { submitFeedback, getFeedback } from '../src/feedback/feedbackStore.js';
import { getRecovery } from '../src/core/errors/recoveryMap.js';
import { broadcast, addClient, removeClient } from '../src/analytics/sseClients.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

const wsId = `pilot-test-${randomUUID().slice(0, 8)}`;
const userId = `user-test-${randomUUID().slice(0, 8)}`;

async function main() {
  console.log('\n🚀 Phase 18 — Pilot Analytics M1 Validation\n');

  // ── 1. pilotTracker ──────────────────────────────────────────────────────────
  console.log('1. pilotTracker');
  await trackEvent(wsId, userId, 'session.start', { source: 'test' });
  await trackEvent(wsId, userId, 'morning_brief.loaded', { loadTimeMs: 450 });
  await trackEvent(wsId, userId, 'feature.visited', { route: '/inbox' });
  await trackEvent(wsId, userId, 'feature.visited', { route: '/meetings' });
  await trackEvent(wsId, userId, 'action.completed', { actionType: 'send_email', connector: 'gmail' });
  await trackEvent(wsId, null, 'morning_brief.failed', { errorCode: 'WIC_BUILD_FAILED' });

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM pilot_events WHERE workspace_id = $1', [wsId]);
  ok('tracks 6 events', rows[0].n === 6);

  const { rows: r2 } = await query(
    "SELECT * FROM pilot_events WHERE workspace_id = $1 AND event = 'morning_brief.loaded'",
    [wsId]
  );
  ok('properties stored as jsonb', r2[0]?.properties?.loadTimeMs === 450);
  ok('null userId accepted', true); // no error thrown above

  // ── 2. pilotMetrics ──────────────────────────────────────────────────────────
  console.log('2. pilotMetrics');
  const metrics = await getMetrics(wsId, 30);
  ok('dau array present', Array.isArray(metrics.dau));
  ok('dau shows 1 user today', metrics.dau.length >= 1 && metrics.dau.some(d => d.users >= 1));
  ok('featureEngagement has /inbox', metrics.featureEngagement.some(f => f.route === '/inbox'));
  ok('errors.morning_brief.failed is 1', metrics.errors['morning_brief.failed'] === 1);
  ok('timeToFirstValueMs is a number or null', metrics.timeToFirstValueMs === null || typeof metrics.timeToFirstValueMs === 'number');

  // ── 3. feedbackStore ─────────────────────────────────────────────────────────
  console.log('3. feedbackStore');
  const fb = await submitFeedback(wsId, userId, { thumbs: 'down', text: null, context: 'test-error' });
  ok('submitFeedback returns id', typeof fb.id === 'number' || typeof fb.id === 'bigint');
  ok('thumbs stored correctly', fb.thumbs === 'down');

  const list = await getFeedback(wsId, { limit: 10 });
  ok('getFeedback returns array', Array.isArray(list));
  ok('returned feedback has thumbs field', list[0]?.thumbs === 'down');

  // ── 4. buildDigest ───────────────────────────────────────────────────────────
  console.log('4. buildDigest');
  const digest = await buildDigest(wsId);
  ok('digest has date string', /^\d{4}-\d{2}-\d{2}$/.test(digest.date));
  ok('digest.sessions >= 1', digest.sessions >= 1);
  ok('digest.errors >= 1', digest.errors >= 1);
  ok('digest.feedback is object', typeof digest.feedback === 'object');

  // ── 5. recoveryMap ───────────────────────────────────────────────────────────
  console.log('5. recoveryMap');
  const r = getRecovery('INTERNAL_ERROR');
  ok('getRecovery returns object for known code', r !== null && typeof r.userMessage === 'string');
  ok('recoverySteps is non-empty array', Array.isArray(r.recoverySteps) && r.recoverySteps.length > 0);
  ok('getRecovery returns null for unknown code', getRecovery('NOT_A_REAL_CODE') === null);

  // ── 6. SSE client registry ───────────────────────────────────────────────────
  console.log('6. sseClients');
  const frames = [];
  const fakeRes = { write: (s) => frames.push(s) };
  addClient(wsId, fakeRes);
  broadcast(wsId, { type: 'test', payload: 42 });
  ok('broadcast delivers frame to registered client', frames.length === 1 && frames[0].includes('"type":"test"'));
  removeClient(wsId, fakeRes);
  broadcast(wsId, { type: 'after-remove' });
  ok('broadcast skips removed client', frames.length === 1);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  await query('DELETE FROM pilot_events WHERE workspace_id = $1', [wsId]);
  await query('DELETE FROM pilot_feedback WHERE workspace_id = $1', [wsId]);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Phase 18 M1: ${pass} passed / ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
