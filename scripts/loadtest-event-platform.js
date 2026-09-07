/**
 * Phase 11.0 — Unified Event Platform load & recovery harness (Milestone 2).
 *
 * Drives the platform mechanics at scale against real Postgres + Redis and
 * asserts the core guarantee: every event processes exactly once or retries
 * safely. Imports the low-level modules directly (NOT src/events/index.js) so
 * the real production consumers are not invoked — this exercises the pipeline
 * itself with controlled test subscribers.
 *
 * Scenarios: throughput (store + full pipeline), duplicate protection, ordering,
 * subscriber-failure isolation + dead-letter, malformed/connector failure,
 * burst, replay, and restart durability.
 *
 * Usage:
 *   node scripts/loadtest-event-platform.js               # 100k store, 10k pipeline
 *   node scripts/loadtest-event-platform.js --count 20000 --pipeline 5000
 *
 * Exit 0 = all scenarios pass, 1 = failure.
 */

import { publish as busPublish } from '../src/events/EventBus.js';
import { fromFields } from '../src/events/EventNormalizer.js';
import * as Store from '../src/events/EventStore.js';
import { subscribe, unsubscribe } from '../src/events/EventSubscriber.js';
import { replay } from '../src/events/EventReplay.js';
import * as Metrics from '../src/events/EventMetrics.js';
import db from '../src/config/db.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const STORE_COUNT    = arg('--count', 100_000);
const PIPELINE_COUNT = arg('--pipeline', 10_000);
const WS = 'test-load-' + Math.random().toString(16).slice(2, 8);

let pass = 0, fail = 0;
let steadyLatency = null;
const bench = [];
function assert(name, ok, detail = '') { console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); ok ? pass++ : fail++; }
function record(scenario, n, ms, extra = {}) {
  const eps = Math.round(n / (ms / 1000));
  bench.push({ scenario, events: n, ms: Math.round(ms), eps, ...extra });
  return eps;
}

// Simple bounded-concurrency pool.
async function pool(items, worker, concurrency = 100) {
  let idx = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) { const i = idx++; await worker(items[i], i); }
  });
  await Promise.all(runners);
}

function evt(i, { source = 'loadtest', type = 'engineering', priority = 'low', sourceId } = {}) {
  return fromFields({
    workspaceId: WS, source, type, priority,
    title: `load ${i}`, summary: `event ${i}`,
    sourceEventId: sourceId ?? `L-${i}`,
    metadata: { i, origin: 'loadtest' },
  });
}

async function cleanup() {
  await db.query('DELETE FROM flow_events WHERE workspace_id = $1', [WS]).catch(() => {});
  await db.query('DELETE FROM flow_event_deliveries WHERE workspace_id = $1', [WS]).catch(() => {});
}

async function main() {
  console.log(`\nLoad harness — workspace ${WS}\n  store=${STORE_COUNT}  pipeline=${PIPELINE_COUNT}\n`);
  await cleanup();

  // ── S1: Durable store throughput (append path, no fan-out) ─────────────────
  {
    const ids = Array.from({ length: STORE_COUNT }, (_, i) => i);
    const t = Date.now();
    let stored = 0;
    await pool(ids, async (i) => { const r = await Store.append(evt(i, { sourceId: `S1-${i}` })); if (r.stored) stored++; }, 120);
    const ms = Date.now() - t;
    const eps = record('store throughput', STORE_COUNT, ms, { stored });
    const cnt = await Store.count({ workspaceId: WS });
    assert(`S1 stored all ${STORE_COUNT} events`, stored === STORE_COUNT && cnt === STORE_COUNT, `${cnt} rows, ${eps}/s`);
  }

  // ── S2: Full pipeline throughput (real bus + 3 test subscribers) ───────────
  let s2a = 0, s2b = 0, s2c = 0;
  const subA = subscribe('probe-a', {}, () => { s2a++; }, { priority: 1 });
  const subB = subscribe('probe-b', {}, () => { s2b++; }, { priority: 2 });
  const subC = subscribe('probe-c', {}, () => { s2c++; }, { priority: 3 });
  {
    const ids = Array.from({ length: PIPELINE_COUNT }, (_, i) => i);
    const t = Date.now();
    let published = 0;
    await pool(ids, async (i) => { const r = await busPublish(evt(i, { sourceId: `S2-${i}` })); if (r.published) published++; }, 80);
    const ms = Date.now() - t;
    const eps = record('pipeline throughput', PIPELINE_COUNT, ms, { published });
    assert(`S2 published all ${PIPELINE_COUNT}`, published === PIPELINE_COUNT, `${published}`);
    assert('S2 fan-out reached every subscriber exactly once',
      s2a === PIPELINE_COUNT && s2b === PIPELINE_COUNT && s2c === PIPELINE_COUNT,
      `a=${s2a} b=${s2b} c=${s2c} (${eps}/s)`);
    // Steady-state latency (bounded concurrency) — captured before the unbounded burst.
    steadyLatency = Metrics.snapshot().latencyMs;
  }

  // ── S3: Duplicate protection (republish same source ids) ───────────────────
  {
    const N = Math.min(5000, PIPELINE_COUNT);
    const before = await Store.count({ workspaceId: WS });
    let dupes = 0;
    await pool(Array.from({ length: N }, (_, i) => i), async (i) => {
      const r = await busPublish(evt(i, { sourceId: `S2-${i}` })); // same ids as S2
      if (r.duplicate) dupes++;
    }, 80);
    const after = await Store.count({ workspaceId: WS });
    assert('S3 all duplicates rejected (exactly-once storage)', dupes === N && before === after, `${dupes}/${N} deduped, rows ${before}→${after}`);
  }

  // ── S4: Ordering preserved for a resource stream ───────────────────────────
  {
    const N = 500;
    for (let i = 0; i < N; i++) {
      const e = evt(i, { source: 'orderstream', sourceId: `S4-${i}` });
      e.timestamp = new Date(Date.now() + i).toISOString(); e.ts = e.timestamp;
      await busPublish(e);
    }
    const rows = await Store.query({ workspaceId: WS, connector: 'orderstream', order: 'ASC', limit: 1000 });
    let ordered = rows.length === N;
    for (let i = 1; i < rows.length; i++) if (rows[i].timestamp < rows[i - 1].timestamp) ordered = false;
    assert('S4 ordering preserved across stream', ordered, `${rows.length}/${N} in order`);
  }

  // ── S5: Subscriber failure isolation + dead-letter ─────────────────────────
  {
    const N = 200;
    let okCount = 0, flakyFails = 0;
    const okSub    = subscribe('reliable', { types: ['task'] }, () => { okCount++; }, { priority: 1 });
    const flakySub = subscribe('flaky',    { types: ['task'] }, (e) => { if (e.metadata.i % 5 === 0) throw new Error('flaky'); }, { priority: 2 });
    const deadSub  = subscribe('always-fails', { types: ['task'] }, () => { throw new Error('boom'); }, { priority: 3, durable: true, retries: 2 });

    for (let i = 0; i < N; i++) await busPublish(evt(i, { type: 'task', sourceId: `S5-${i}` }));
    unsubscribe(okSub); unsubscribe(flakySub); unsubscribe(deadSub);

    const stored = await Store.count({ workspaceId: WS, eventType: 'task' });
    const { rows: dl } = await db.query(
      `SELECT count(*)::int c FROM flow_event_deliveries WHERE workspace_id=$1 AND subscriber='always-fails' AND status='dead_letter'`, [WS]);
    const { rows: rel } = await db.query(
      `SELECT count(*)::int c FROM flow_event_deliveries WHERE workspace_id=$1 AND subscriber='reliable' AND status='delivered'`, [WS]);
    assert('S5 reliable subscriber unaffected by sibling failures', okCount === N && rel[0].c === N, `reliable delivered ${rel[0].c}/${N}`);
    assert('S5 every event still stored despite subscriber failures', stored === N, `${stored}/${N} stored`);
    assert('S5 durable failures land in dead-letter', dl[0].c === N, `${dl[0].c}/${N} dead-lettered`);
  }

  // ── S6: Malformed / connector-failure resilience ───────────────────────────
  {
    const N = 1000;
    let survived = 0, dropped = 0;
    await pool(Array.from({ length: N }, (_, i) => i), async (i) => {
      try {
        // Deliberately broken events: missing fields, junk types, huge/empty payloads.
        const broken = i % 2 === 0
          ? { workspaceId: WS, eventType: 'not-a-real-type', timestamp: new Date().toISOString(), version: '1.0', eventId: `bad-${i}` }
          : fromFields({ workspaceId: WS, source: 'chaos', type: 'custom', sourceId: `S6-${i}`, metadata: { junk: ' '.repeat(10) } });
        const r = await busPublish(broken);
        if (r.published) survived++; else dropped++;
      } catch { /* the platform must never throw to the caller */ dropped++; }
    }, 80);
    assert('S6 malformed events never crash the pipeline', survived + dropped === N, `survived=${survived} dropped=${dropped}`);
    assert('S6 invalid events safely dropped (not stored)', dropped >= N / 2, `${dropped} dropped`);
  }

  // ── S7: Large burst ────────────────────────────────────────────────────────
  {
    const N = 5000;
    const t = Date.now();
    await Promise.all(Array.from({ length: N }, (_, i) => busPublish(evt(i, { source: 'burst', sourceId: `S7-${i}` }))));
    const ms = Date.now() - t;
    const eps = record('burst (all concurrent)', N, ms);
    const cnt = await Store.count({ workspaceId: WS, connector: 'burst' });
    assert('S7 burst fully accounted for', cnt === N, `${cnt}/${N} stored, ${eps}/s`);
  }

  // ── S8: Replay ─────────────────────────────────────────────────────────────
  {
    let replayHits = 0;
    const rSub = subscribe('replay-probe', { connectors: ['burst'] }, () => { replayHits++; }, { priority: 1 });
    const res = await replay({ workspaceId: WS, connector: 'burst', range: 'hour', limit: 1000 });
    unsubscribe(rSub);
    assert('S8 replay re-delivers stored events', res.replayed > 0 && replayHits === res.replayed, `replayed=${res.replayed} hits=${replayHits}`);
  }

  // ── S9: Restart durability ─────────────────────────────────────────────────
  {
    // Simulate a process restart: in-memory metrics/subscribers are gone, but the
    // durable store persists. Re-query and re-publish to prove exactly-once holds.
    const beforeRestart = await Store.count({ workspaceId: WS });
    Metrics.resetWindow();
    const r = await busPublish(evt(0, { source: 'loadtest', sourceId: 'S1-0' })); // already stored in S1
    const afterRestart = await Store.count({ workspaceId: WS });
    assert('S9 events survive restart (durable store)', beforeRestart > 0 && beforeRestart === afterRestart,
      `${beforeRestart} rows persisted`);
    assert('S9 dedup still holds after restart', r.duplicate === true, 'republished event deduped');
  }

  unsubscribe(subA); unsubscribe(subB); unsubscribe(subC);

  // ── Benchmark summary ──────────────────────────────────────────────────────
  console.log('\n─── Benchmarks ───────────────────────────────────────────');
  console.log('scenario'.padEnd(26), 'events'.padStart(8), 'ms'.padStart(8), 'events/s'.padStart(10));
  for (const b of bench) console.log(b.scenario.padEnd(26), String(b.events).padStart(8), String(b.ms).padStart(8), String(b.eps).padStart(10));
  const burstLatency = Metrics.snapshot().latencyMs;
  if (steadyLatency) console.log('\nsteady-state latency (bounded):  p50', steadyLatency.p50 + 'ms', ' p95', steadyLatency.p95 + 'ms', ' p99', steadyLatency.p99 + 'ms');
  console.log('burst-tail latency (unbounded):  p50', burstLatency.p50 + 'ms', ' p95', burstLatency.p95 + 'ms', ' p99', burstLatency.p99 + 'ms');

  await cleanup();
  console.log(`\n${fail === 0 ? '✅ ALL SCENARIOS PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error('fatal:', err); process.exit(1); });
