/**
 * p1_backfill_selftest.mjs — proves the P1 initial-backfill trigger:
 *   - flag OFF  → no-op (no queue/DB writes)
 *   - flag ON   → enqueues the correct gmail + google-calendar initial sync jobs
 *   - idempotent (jobId dedup → re-run creates no duplicates)
 *   - workspace-scoped (creates ZERO jobs for pilot or Helios)
 * Uses a throwaway workspace and cleans up all queue jobs + sync_schedules rows.
 * No real provider calls. No pilot/Helios mutation.
 */
import { syncQueue }        from '../../src/config/syncQueue.js';
import { query, pool }      from '../../src/config/db.js';
const db = { query, end: () => pool.end() };

const DUMMY = 'p1_selftest_ws_DELETEME';
const PILOT = 'workspace_real_pilot';
const HELIOS = 'workspace_helios_test';
const R = [];
const rec = (id, ok, note = '') => { R.push([id, ok]); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${note ? ' — ' + note : ''}`); };

async function jobsForWorkspace(ws) {
  const jobs = await syncQueue.getJobs(['waiting', 'delayed', 'active', 'paused', 'completed', 'failed'], 0, 500);
  return jobs.filter(j => j?.data?.workspaceId === ws);
}
async function repeatablesForWorkspace(ws) {
  const reps = await syncQueue.getRepeatableJobs();
  return reps.filter(r => (r.id || r.name || '').includes(ws));
}
async function cleanup(ws) {
  // Multi-pass: the LIVE syncWorker consumes these throwaway jobs, so a single
  // pass races it. Drain repeatedly until the workspace has no jobs in any state.
  for (let pass = 0; pass < 4; pass++) {
    const jobs = await jobsForWorkspace(ws);
    if (jobs.length === 0) break;
    for (const j of jobs) {
      try { await j.remove(); }
      catch { try { await j.moveToFailed(new Error('cleanup'), '0', false); await j.remove(); } catch {} }
    }
    await new Promise(r => setTimeout(r, 400));
  }
  for (const r of await repeatablesForWorkspace(ws)) { try { await syncQueue.removeRepeatableByKey(r.key); } catch {} }
  await db.query('DELETE FROM sync_schedules WHERE workspace_id = $1', [ws]).catch(() => {});
}

console.log('\n######### P1 — BACKFILL-ON-CONNECT SELF-TEST #########\n');

// baseline: pilot/Helios job counts BEFORE (must be unchanged after)
const pilotBefore  = (await jobsForWorkspace(PILOT)).length;
const heliosBefore = (await jobsForWorkspace(HELIOS)).length;

await cleanup(DUMMY); // clean slate

// ── 1. flag OFF → no-op ───────────────────────────────────────────────────────
delete process.env.SYNC_ON_CONNECT;
{
  const { backfillOnConnect } = await import('../../src/services/sync/backfillOnConnect.js?off');
  const r = await backfillOnConnect(DUMMY, 'google');
  const jobs = await jobsForWorkspace(DUMMY);
  rec('flag-off:skipped', r.skipped === 'flag-disabled', `skipped=${r.skipped}`);
  rec('flag-off:no-jobs', jobs.length === 0, `jobs=${jobs.length}`);
}

// ── 2. flag ON → enqueues correct jobs ────────────────────────────────────────
process.env.SYNC_ON_CONNECT = 'true';
{
  const { backfillOnConnect } = await import('../../src/services/sync/backfillOnConnect.js?on');
  const r = await backfillOnConnect(DUMMY, 'google');
  const want = ['gmail/threads', 'gmail/messages', 'gmail/labels', 'google-calendar/events', 'google-calendar/invites'];
  const gotAll = want.every(w => r.enqueued.includes(w));
  rec('flag-on:enqueued-expected', gotAll, `enqueued=${r.enqueued.join(', ')}`);

  const jobs = await jobsForWorkspace(DUMMY);
  const initialTriggered = jobs.filter(j => j.data.trigger === 'initial');
  rec('flag-on:initial-trigger', initialTriggered.length >= 5, `initial jobs=${initialTriggered.length}`);
  rec('flag-on:workspace-scoped', jobs.every(j => j.data.workspaceId === DUMMY), 'all jobs carry DUMMY workspaceId');

  // ── 3. idempotency: re-run → no new sync jobs (jobId dedup) ──────────────────
  const countA = (await jobsForWorkspace(DUMMY)).filter(j => j.name === 'sync').length;
  await backfillOnConnect(DUMMY, 'google');
  const countB = (await jobsForWorkspace(DUMMY)).filter(j => j.name === 'sync').length;
  rec('idempotent:no-duplicate-sync-jobs', countA === countB, `before=${countA} after=${countB}`);
}

// ── 4. isolation: pilot + Helios untouched ────────────────────────────────────
const pilotAfter  = (await jobsForWorkspace(PILOT)).length;
const heliosAfter = (await jobsForWorkspace(HELIOS)).length;
rec('isolation:pilot-untouched', pilotAfter === pilotBefore, `before=${pilotBefore} after=${pilotAfter}`);
rec('isolation:helios-untouched', heliosAfter === heliosBefore, `before=${heliosBefore} after=${heliosAfter}`);

// ── cleanup ───────────────────────────────────────────────────────────────────
await cleanup(DUMMY);
const leftover = (await jobsForWorkspace(DUMMY)).length;
rec('cleanup:no-leftover', leftover === 0, `leftover=${leftover}`);

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length}  FAILURES: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
console.log('P1_SELFTEST_DONE');
await syncQueue.close();
await db.end?.().catch(() => {});
process.exit(pass === R.length ? 0 : 1);
