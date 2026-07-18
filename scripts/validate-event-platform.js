/**
 * Phase 11.0 — Unified Event Platform acceptance checks (Milestone 1).
 *
 * Exercises the platform's core guarantees against a real Postgres + Redis:
 *   publish → durable store → fan-out, dedup (both layers), workspace isolation,
 *   replay, search, retention (dry-run), and metrics.
 *
 * NOT the 100k-event load / recovery harness — that lands in Milestone 2.
 *
 * Run: node scripts/validate-event-platform.js
 * Exit 0 = all pass, 1 = one or more failures.
 */

import * as EP from '../src/events/index.js';
import db from '../src/config/db.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const wsA = 'test-ep-A-' + Math.random().toString(16).slice(2, 8);
const wsB = 'test-ep-B-' + Math.random().toString(16).slice(2, 8);

async function cleanup() {
  for (const ws of [wsA, wsB]) {
    await db.query('DELETE FROM flow_events WHERE workspace_id = $1', [ws]).catch(() => {});
    await db.query('DELETE FROM flow_event_deliveries WHERE workspace_id = $1', [ws]).catch(() => {});
  }
}

async function main() {
  await cleanup();

  // 1. publish → store + fan-out
  let probeHits = 0;
  EP.subscribe('acceptance-probe', { types: ['engineering'] }, () => { probeHits++; }, { priority: 0 });
  const r1 = await EP.publish('github', 'pull_request',
    { workspaceId: wsA, number: 1, title: 'Platform check', author: 'ann', repo: 'r', id: 'PR-A-1' },
    { workspaceId: wsA });
  check('publish stores durably', r1.published === true && !!r1.eventId);
  check('publish fans out to subscribers', probeHits === 1, `probe hits=${probeHits}`);
  check('all matching subscribers delivered', (r1.delivery || []).every(d => d.status === 'delivered'),
    (r1.delivery || []).map(d => d.subscriber).join(','));

  // 2. dedup by provider source id
  const r2 = await EP.publish('github', 'pull_request',
    { workspaceId: wsA, number: 1, title: 'Platform check', author: 'ann', repo: 'r', id: 'PR-A-1' },
    { workspaceId: wsA });
  check('dedup by source_event_id', r2.published === false && r2.duplicate === true);

  // 3. workspace isolation — B publishes, A must not see it
  await EP.publish('slack', 'message',
    { workspaceId: wsB, text: 'secret for B', sender: 'x', channel: 'c', id: 'M-B-1' },
    { workspaceId: wsB });
  const aEvents = await EP.queryEvents({ workspaceId: wsA, limit: 50 });
  const leak = aEvents.some(e => e.workspaceId !== wsA);
  check('workspace isolation on query', !leak, `wsA rows=${aEvents.length}`);
  const bSearchFromA = await EP.search({ workspaceId: wsA, text: 'secret for B' });
  check('workspace isolation on search', bSearchFromA.length === 0);

  // 4. search finds own events
  const found = await EP.search({ workspaceId: wsA, text: 'Platform check' });
  check('search returns own events', found.length === 1);

  // 5. getEvent by id (tenant-scoped)
  const byId = await EP.getEvent(wsA, r1.eventId);
  check('getEvent returns stored event', byId?.eventId === r1.eventId && byId?.eventType === 'engineering');

  // 6. replay re-delivers to subscribers without re-storing
  const beforeCount = await EP.countEvents({ workspaceId: wsA });
  const replayHitsBefore = probeHits;
  const rep = await EP.replay({ workspaceId: wsA, range: 'day' });
  const afterCount = await EP.countEvents({ workspaceId: wsA });
  check('replay re-delivers events', rep.replayed >= 1 && probeHits > replayHitsBefore, `replayed=${rep.replayed}`);
  check('replay does not duplicate storage', beforeCount === afterCount, `${beforeCount}→${afterCount}`);

  // 7. retention dry-run is safe and reports
  const prune = await EP.pruneEvents({ dryRun: true });
  check('retention dry-run runs', typeof prune.totalDeleted === 'number' && prune.dryRun === true);

  // 8. metrics reflect activity
  const m = EP.getMetrics();
  check('metrics track publishes', m.counters.published >= 2 && m.counters.stored >= 2);
  check('metrics track duplicates', m.counters.duplicates >= 1);

  await cleanup();

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
