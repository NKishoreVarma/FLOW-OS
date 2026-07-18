/**
 * Phase 12 M3 — Performance benchmark suite.
 *
 * Seeds a representative workspace (via the event platform, so the graph builds),
 * then measures per-operation latency across the engines plus a concurrency test.
 * Numbers are single-process, local Postgres+Redis — indicative of engine cost,
 * not a tuned production cluster.
 *
 * Run: node scripts/benchmark-suite.js
 */

import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import * as EP from '../src/events/index.js';
import '../src/graph/index.js';
import * as G from '../src/graph/index.js';
import { replay } from '../src/replay/index.js';
import { simulate } from '../src/simulation/index.js';
import { predict } from '../src/predictions/index.js';
import { queryAllMemory } from '../src/services/orgMemoryService.js';

const sfx = Math.random().toString(16).slice(2, 8);
const WS = `bench-${sfx}`;
let org;
const now = Date.now(), DAY = 86_400_000, ago = (d) => new Date(now - d * DAY).toISOString();

async function seed() {
  org = await prisma.organization.create({ data: { name: `Bench ${sfx}`, slug: `bench-${sfx}`, plan: 'enterprise' } });
  await prisma.workspace.create({ data: { name: 'Bench', externalId: WS, orgId: org.id } });
  const pub = (s, t, p) => EP.publish(s, t, { workspaceId: WS, ...p }, { workspaceId: WS });
  for (let i = 0; i < 120; i++) await pub('github', 'pull_request', { number: i, title: `PR ${i}`, author: ['Alice', 'Bob', 'Carol'][i % 3], repo: ['payments-svc', 'auth-svc'][i % 2], id: `pr-${i}`, ts: ago(i % 40) });
  for (let i = 0; i < 20; i++) await pub('slack', 'message', { text: `incident sev1 ${i}`, sender: 'Bob', channel: 'incidents', id: `inc-${i}`, ts: ago(i % 14) });
  for (let i = 0; i < 15; i++) await pub('hubspot', 'customer', { id: `cust-${i}`, name: `Customer ${i}`, summary: i % 3 ? 'healthy' : 'churn risk escalation', ts: ago(i) });
  for (let i = 0; i < 12; i++) await pub('calendar', 'event', { id: `m-${i}`, title: `sync ${i}`, attendees: ['Alice', 'Bob'], ts: ago(i) });
}
async function cleanup() {
  for (const t of ['graph_edges', 'graph_nodes', 'flow_events', 'flow_event_deliveries', 'org_memory_records']) await db.query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS]).catch(() => {});
  await prisma.workspace.deleteMany({ where: { externalId: WS } }).catch(() => {});
  if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
}

async function bench(name, fn, iters = 20) {
  await fn().catch(() => {}); // warm up
  const times = [];
  for (let i = 0; i < iters; i++) { const t = Date.now(); await fn().catch(() => {}); times.push(Date.now() - t); }
  times.sort((a, b) => a - b);
  return { name, iters, avg: Math.round(times.reduce((s, n) => s + n, 0) / times.length), p50: times[Math.floor(0.5 * iters)], p95: times[Math.floor(0.95 * (iters - 1))], min: times[0], max: times[iters - 1] };
}

async function main() {
  console.log(`\nSeeding benchmark workspace "${WS}"…`);
  await seed();
  const m = await G.metrics(WS);
  console.log(`ready: ${m.nodeCount} graph nodes / ${m.edgeCount} edges, ~167 events\n`);

  const empId = (await G.searchNodes(WS, { type: 'EMPLOYEE', limit: 1 }))[0]?.id;
  const repoId = (await G.searchNodes(WS, { type: 'REPOSITORY', limit: 1 }))[0]?.id;

  const results = [];
  results.push(await bench('Event Bus — publish', () => EP.publish('slack', 'message', { workspaceId: WS, text: 'bench', sender: 'x', channel: 'c', id: `b-${Math.random()}` }, { workspaceId: WS }), 30));
  results.push(await bench('Event Platform — query (windowed)', () => EP.queryEvents({ workspaceId: WS, limit: 200, order: 'DESC' })));
  results.push(await bench('Search — full-text', () => EP.search({ workspaceId: WS, text: 'incident', limit: 50 })));
  results.push(await bench('Graph — metrics', () => G.metrics(WS)));
  results.push(await bench('Graph — neighbors', () => G.neighbors(WS, empId)));
  results.push(await bench('Graph — 2-hop traverse', () => G.traverse(WS, empId, { hops: 2 })));
  results.push(await bench('Graph — impact analysis', () => G.analyzeImpact(WS, repoId, 3)));
  results.push(await bench('Memory — query all', () => queryAllMemory(WS, { hours: 24 * 90, limit: 100 })));
  results.push(await bench('Timeline — replay 30d', () => replay(WS, { mode: 'TIMELINE', scope: { range: '30d', limit: 1000 } }), 10));
  results.push(await bench('Prediction — full run (~22 models)', () => predict(WS, { persist: false }), 10));
  results.push(await bench('Simulation — one scenario', () => simulate(WS, { type: 'CUSTOMER_CHURN', targetName: 'Customer 0' }, { persist: false }), 10));

  console.log('── Per-operation latency (ms) ' + '─'.repeat(40));
  console.log('operation'.padEnd(38), 'avg'.padStart(6), 'p50'.padStart(6), 'p95'.padStart(6), 'max'.padStart(6));
  for (const r of results) console.log(r.name.padEnd(38), String(r.avg).padStart(6), String(r.p50).padStart(6), String(r.p95).padStart(6), String(r.max).padStart(6));

  // Concurrency: N simultaneous read requests (simulating concurrent users).
  console.log('\n── Concurrency (simultaneous graph reads) ' + '─'.repeat(28));
  for (const users of [100, 1000]) {
    const t = Date.now();
    await Promise.all(Array.from({ length: users }, () => G.metrics(WS).catch(() => {})));
    const ms = Date.now() - t;
    console.log(`${String(users).padStart(5)} concurrent → ${String(ms).padStart(6)}ms total · ${Math.round(users / (ms / 1000))} req/s`);
  }

  await cleanup();
  console.log('\n✅ Benchmark complete.');
  process.exit(0);
}

main().catch(async (err) => { console.error('fatal:', err); await cleanup(); process.exit(1); });
