/**
 * Phase 11.3 — Workspace Replay Engine validation.
 *
 * Seeds a 30-day operational history (100,000 events + curated incident,
 * customer, and engineering lifecycles) directly into the durable event store,
 * then exercises the DVR: 30-day replay, replay modes, snapshots, Monday-vs-Friday
 * diff, player logic, metrics, and export — with performance timings.
 *
 * Run: node scripts/validate-replay-engine.js [--count 100000]
 */

import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import { append } from '../src/events/EventStore.js';
import * as R from '../src/replay/index.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const COUNT = arg('--count', 100_000);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); ok ? pass++ : fail++; };
const timed = async (fn) => { const t = Date.now(); const r = await fn(); return [r, Date.now() - t]; };

const sfx = Math.random().toString(16).slice(2, 8);
const WS = `replay-${sfx}`;
let org;
const DAY = 86_400_000;
const now = Date.now();
const dayAgo = (d) => new Date(now - d * DAY).toISOString();

const TYPES = ['engineering', 'communication', 'meeting', 'knowledge', 'customer', 'deployment'];
const CONNECTORS = ['github', 'slack', 'jira', 'gmail', 'calendar', 'hubspot'];

function mkEvent(i, over = {}) {
  const type = over.eventType || TYPES[i % TYPES.length];
  const dayOffset = over.dayOffset ?? (i % 30);
  return {
    eventId: over.eventId || `${WS}-ev-${i}-${Math.random().toString(16).slice(2, 8)}`,
    eventType: type, connector: over.connector || CONNECTORS[i % CONNECTORS.length],
    workspaceId: WS, organizationId: org.id,
    actor: { id: `emp-${i % 40}`, name: `Person ${i % 40}` },
    entity: over.entity || { type: 'ITEM', id: `item-${i % 500}`, name: `Item ${i % 500}` },
    title: over.title || `${type} event ${i}`, summary: over.summary || '',
    timestamp: over.timestamp || dayAgo(dayOffset + Math.random()),
    payload: {}, metadata: {}, importance: over.importance ?? 0.4, confidence: 70,
    priority: over.priority || 'low', correlationId: over.correlationId || null,
    causationId: null, parentEvent: null, sourceEventId: over.eventId || null, version: '1.0',
  };
}

async function pool(items, worker, c = 100) {
  let idx = 0;
  await Promise.all(Array.from({ length: c }, async () => { while (idx < items.length) await worker(items[idx++]); }));
}

async function seed() {
  org = await prisma.organization.create({ data: { name: `Replay ${sfx}`, slug: `replay-${sfx}`, plan: 'enterprise' } });
  await prisma.workspace.create({ data: { name: 'Replay', externalId: WS, orgId: org.id } });

  // Bulk noise events across 30 days.
  await pool([...Array(COUNT).keys()], async (i) => { await append(mkEvent(i)); }, 120);

  // Curated incident lifecycle (correlation-linked, open day 6 → resolved day 4).
  const incCorr = `inc-corr-${sfx}`;
  await append(mkEvent(1e7, { eventType: 'incident', connector: 'slack', title: 'Payments API returning 500s', priority: 'critical', importance: 0.95, correlationId: incCorr, dayOffset: 6, timestamp: dayAgo(6) }));
  await append(mkEvent(1e7 + 1, { eventType: 'incident', connector: 'slack', title: 'Incident: investigating payments errors', priority: 'high', importance: 0.8, correlationId: incCorr, timestamp: dayAgo(5.5) }));
  await append(mkEvent(1e7 + 2, { eventType: 'incident', connector: 'slack', title: 'Payments incident resolved and recovered', priority: 'medium', importance: 0.6, correlationId: incCorr, timestamp: dayAgo(4) }));

  // Customer journey: Acme healthy → at risk → churn risk.
  await append(mkEvent(2e7, { eventType: 'customer', connector: 'hubspot', title: 'Acme Corp onboarding healthy', entity: { type: 'CUSTOMER', id: 'ACME', name: 'Acme Corp' }, timestamp: dayAgo(20) }));
  await append(mkEvent(2e7 + 1, { eventType: 'customer', connector: 'gmail', title: 'Acme Corp frustrated after payments outage', importance: 0.7, priority: 'high', entity: { type: 'CUSTOMER', id: 'ACME', name: 'Acme Corp' }, timestamp: dayAgo(5) }));
  await append(mkEvent(2e7 + 2, { eventType: 'customer', connector: 'hubspot', title: 'Acme Corp flagged churn risk', importance: 0.85, priority: 'high', entity: { type: 'CUSTOMER', id: 'ACME', name: 'Acme Corp' }, timestamp: dayAgo(3) }));

  // Engineering lifecycle: deployment day 7, then fixes.
  await append(mkEvent(3e7, { eventType: 'deployment', connector: 'github', title: 'Deployed payments v2.3', priority: 'high', importance: 0.7, timestamp: dayAgo(7) }));
  await append(mkEvent(3e7 + 1, { eventType: 'engineering', connector: 'github', title: 'PR #100 hotfix payments retry', timestamp: dayAgo(5) }));
  await append(mkEvent(3e7 + 2, { eventType: 'deployment', connector: 'github', title: 'Deployed payments v2.4 hotfix', priority: 'high', importance: 0.7, timestamp: dayAgo(4) }));

  return incCorr;
}

async function cleanup() {
  await db.query('DELETE FROM flow_events WHERE workspace_id=$1', [WS]).catch(() => {});
  await db.query('DELETE FROM flow_event_deliveries WHERE workspace_id=$1', [WS]).catch(() => {});
  await prisma.workspace.deleteMany({ where: { externalId: WS } }).catch(() => {});
  if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
}

async function main() {
  console.log(`\nSeeding ${COUNT} events + lifecycles → workspace "${WS}"\n`);
  const [incCorr, seedMs] = await timed(seed);
  console.log(`seeded in ${seedMs}ms\n`);

  // 1. 30-day full replay of 100k events.
  const [full, tFull] = await timed(() => R.replay(WS, { mode: 'TIMELINE', scope: { range: '30d', limit: COUNT + 100 } }));
  check('30-day / 100k replay', full.totalEvents >= COUNT, `${full.totalEvents} events, ${full.timeline.frames.length} day-frames in ${tFull}ms`);
  check('  timeline has navigation markers', full.navigation.markerCount > 0, `${full.navigation.markerCount} markers`);
  check('  metrics computed (velocity + top actors)', full.metrics.velocity.length > 0 && full.metrics.topActors.length > 0, `peak ${full.metrics.peakPeriod?.count}/day`);

  // 2. Snapshot performance at 100k (SQL aggregate).
  const [snap, tSnap] = await timed(() => R.snapshotAt(WS, dayAgo(0)));
  check('snapshot as-of-T (aggregate, 100k)', snap.totalEvents >= COUNT && tSnap < 1000, `${snap.totalEvents} events in ${tSnap}ms`);

  // 3. Monday-vs-Friday diff (day 7 vs day 2).
  const [cmp, tCmp] = await timed(() => R.snapshotCompare(WS, dayAgo(7), dayAgo(2)));
  check('Monday-vs-Friday snapshot diff', typeof cmp.diff.added.events === 'number' && cmp.diff.summary, `+${cmp.diff.added.events} events, ${cmp.diff.resolved.incidents} incident(s) resolved in ${tCmp}ms`);
  check('  diff surfaces resolved incidents', cmp.diff.resolved.incidents >= 1, cmp.diff.summary);

  // 4. Incident evolution (INCIDENT mode by correlation).
  const inc = await R.replay(WS, { mode: 'INCIDENT', scope: { correlationId: incCorr, range: '30d' } });
  check('incident evolution replay', inc.totalEvents === 3 && inc.metrics.incident?.count === 3, `${inc.totalEvents} events, MTTR ${inc.metrics.incident?.mttrHours}h`);
  check('  incident MTTR computed', inc.metrics.incident?.mttrHours != null && inc.metrics.incident.resolved >= 1, `${inc.metrics.incident?.mttrHours}h`);

  // 5. Customer journey (text focus).
  const cust = await R.replay(WS, { mode: 'CUSTOMER_JOURNEY', scope: { customer: 'Acme', range: '30d' } });
  check('customer lifecycle replay (Acme)', cust.totalEvents >= 3 && cust.timeline.frames.length >= 2, `${cust.totalEvents} Acme events across ${cust.timeline.frames.length} frames`);

  // 6. Engineering lifecycle.
  const eng = await R.replay(WS, { mode: 'ENGINEERING', scope: { range: '30d', limit: 50000 } });
  check('engineering lifecycle replay', (eng.metrics.byType.deployment || 0) >= 2 && (eng.metrics.byType.engineering || 0) >= 1, `${eng.metrics.deployment.count} deploys (${eng.metrics.deployment.perWeek}/wk)`);

  // 7. Player logic + export.
  const plan = R.playbackPlan(full.timeline, { speed: 3600 });
  const view = R.cursorView(full.timeline, 0.5);
  check('player: playback plan + cursor view', plan.steps.length > 0 && view.frame && view.progress > 0, `${plan.steps.length} steps, cursor@${view.progress}`);
  const md = R.narrative(inc);
  check('markdown narrative export', md.includes('# Workspace Replay') && md.includes('Timeline'), `${md.length} chars`);

  await cleanup();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('fatal:', err); await cleanup(); process.exit(1); });
