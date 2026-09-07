/**
 * Validation harness — Sprint 5 Living Workspace Simulator.
 *   node scripts/validate-simulator.js         (leaves nothing behind)
 *   node scripts/validate-simulator.js --keep  (keeps the seeded workspace to explore)
 *
 * DB-backed (unlike the pure workday validator): it seeds a throwaway org + workspace
 * + owner, runs the real seedHistory through the Event Platform / Governance /
 * Notification engines, and asserts CAUSAL INTEGRITY — every event belongs to a
 * chain, chains connect (email→…→PR, deploy→incident), 6 months of spread, current
 * pending work exists, notifications are targeted, tick adds activity, reset is clean.
 */

import { randomUUID } from 'node:crypto';
import db from '../src/config/db.js';
import { prisma } from '../src/core/config/prisma.js';
import { seedHistory, tick } from '../src/simulator/simulatorEngine.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };
const DAY = 24 * 3600 * 1000;
const keep = process.argv.includes('--keep');

const suffix = randomUUID().slice(0, 8);
const orgId = `sim-org-${suffix}`;
const wsId = `sim-ws-${suffix}`;
const userId = `sim-user-${suffix}`;

async function main() {
  console.log('\n🌱 Sprint 5 — Living Workspace Simulator validation\n');

  // ── Setup: a real org + workspace + owner (approvals need real FKs) ─────────────
  await prisma.organization.create({ data: { id: orgId, name: `Sim ${suffix}`, slug: `sim-${suffix}`, plan: 'pro' } });
  await prisma.workspace.create({ data: { id: wsId, name: 'Simulated Co', orgId, externalId: wsId } });
  await prisma.user.create({ data: { id: userId, email: `owner-${suffix}@sim.test`, passwordHash: 'x', fullName: 'Rahul', role: 'OWNER', orgId } });

  const ctx = { ws: wsId, orgId, requesterId: userId, userEmail: `owner-${suffix}@sim.test` };

  // ── 1. Seed 6 months + current work ─────────────────────────────────────────────
  console.log('1. Seed history + current work');
  const totals = await seedHistory(ctx, { days: 180 });
  ok(`emitted events (${totals.events})`, totals.events > 20);
  ok(`created chains (${totals.chains})`, totals.chains > 5);
  ok(`planted current approvals (${totals.approvals})`, totals.approvals >= 2);
  ok(`planted current notifications (${totals.notifications})`, totals.notifications >= 3);

  // ── 2. Durable + no orphans (every event belongs to a chain) ────────────────────
  console.log('2. Causal integrity');
  const { rows: [cnt] } = await db.query('SELECT count(*)::int c, count(correlation_id)::int corr, min(ts) lo, max(ts) hi FROM flow_events WHERE workspace_id=$1', [wsId]);
  ok(`events persisted to flow_events (${cnt.c})`, cnt.c > 20);
  ok('every event has a correlationId (no orphans)', cnt.c === cnt.corr);
  const { rows: [chains] } = await db.query('SELECT count(*)::int c FROM (SELECT correlation_id FROM flow_events WHERE workspace_id=$1 GROUP BY correlation_id HAVING count(*)>1) t', [wsId]);
  ok(`multi-event chains exist (${chains.c}) — events connect to each other`, chains.c > 3);

  // ── 3. The chains are the RIGHT chains (email→…→PR, deploy→incident) ─────────────
  console.log('3. Chain shape');
  const { rows: [feat] } = await db.query(
    `SELECT count(*)::int c FROM (SELECT correlation_id FROM flow_events WHERE workspace_id=$1 GROUP BY correlation_id
     HAVING bool_or(metadata->>'kind'='email') AND bool_or(metadata->>'kind'='pull_request')) t`, [wsId]);
  ok(`a feature chain links email → pull_request (${feat.c})`, feat.c >= 1);
  const { rows: [inc] } = await db.query(
    `SELECT count(*)::int c FROM (SELECT correlation_id FROM flow_events WHERE workspace_id=$1 GROUP BY correlation_id
     HAVING bool_or(metadata->>'kind'='deployment') AND bool_or(metadata->>'kind'='incident')) t`, [wsId]);
  ok(`an incident chain links deployment → incident (${inc.c})`, inc.c >= 1);

  // ── 4. Six months of spread + current activity ──────────────────────────────────
  console.log('4. Time spread');
  const ageDays = (Date.now() - new Date(cnt.lo).getTime()) / DAY;
  const freshHrs = (Date.now() - new Date(cnt.hi).getTime()) / 3600000;
  ok(`history reaches back ~6 months (oldest ${Math.round(ageDays)}d)`, ageDays >= 120);
  ok(`newest activity is recent (${freshHrs.toFixed(1)}h old)`, freshHrs <= 6);

  // ── 5. Current work lights up the workday surfaces ──────────────────────────────
  console.log('5. Current work');
  const approvals = await prisma.pendingApproval.count({ where: { workspaceId: wsId, status: 'PENDING' } });
  ok(`pending approvals exist (${approvals})`, approvals >= 2);
  const notifs = await prisma.notification.findMany({ where: { workspaceId: wsId } });
  ok(`notifications exist (${notifs.length})`, notifs.length >= 3);
  ok('a merge-conflict notification is present', notifs.some((n) => n.type === 'MERGE_CONFLICT'));
  ok('an incident notification is present', notifs.some((n) => n.type === 'INCIDENT'));

  // ── 6. Notifications are TARGETED (only the owners), not broadcast ───────────────
  console.log('6. Targeting');
  const conflict = notifs.find((n) => n.type === 'MERGE_CONFLICT');
  const recips = conflict?.recipients || [];
  ok('merge conflict notified only the file owners (rahul, kishore)',
    recips.includes('rahul') && recips.includes('kishore') && recips.length <= 3);

  // ── 7. tick() adds fresh live activity ──────────────────────────────────────────
  console.log('7. Live heartbeat');
  const before = (await db.query('SELECT count(*)::int c FROM flow_events WHERE workspace_id=$1', [wsId])).rows[0].c;
  await tick(ctx);
  const after = (await db.query('SELECT count(*)::int c FROM flow_events WHERE workspace_id=$1', [wsId])).rows[0].c;
  ok(`tick added new events (${before} → ${after})`, after > before);

  // ── 8. reset clears everything ──────────────────────────────────────────────────
  if (!keep) {
    console.log('8. Reset');
    await db.query('DELETE FROM flow_events WHERE workspace_id=$1', [wsId]);
    await db.query('DELETE FROM flow_event_deliveries WHERE workspace_id=$1', [wsId]).catch(() => {});
    await prisma.notification.deleteMany({ where: { workspaceId: wsId } });
    await prisma.pendingApproval.deleteMany({ where: { workspaceId: wsId } });
    const left = (await db.query('SELECT count(*)::int c FROM flow_events WHERE workspace_id=$1', [wsId])).rows[0].c;
    ok('reset removed all simulated events', left === 0);
  }
}

async function cleanup() {
  if (keep) { console.log(`\n(kept workspace ${wsId} for exploration)`); return; }
  try {
    await db.query('DELETE FROM flow_events WHERE workspace_id=$1', [wsId]);
    await prisma.notification.deleteMany({ where: { workspaceId: wsId } });
    await prisma.pendingApproval.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.delete({ where: { id: wsId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  } catch (e) { console.log(`  (cleanup warning: ${e.message})`); }
}

main()
  .catch((e) => { fail++; console.error('\n💥', e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n${'─'.repeat(48)}\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ''}\n`);
    await prisma.$disconnect().catch(() => {});
    await db.end?.().catch(() => {});
    process.exit(fail === 0 ? 0 : 1);
  });
