#!/usr/bin/env node
/**
 * stress-test.js — Module 15 (Enterprise Testing)
 *
 * Load tests FLOW OS against a running server.
 * Usage: node scripts/stress-test.js [--host http://localhost:5001] [--concurrency 50] [--duration 60]
 *
 * Does NOT require any external load testing library — uses Node.js fetch.
 * Simulates: auth, ingest, query, connector list, metrics — all workspace-scoped.
 */

import { parseArgs } from 'util';
import { createHash } from 'crypto';

const { values: args } = parseArgs({
  args:    process.argv.slice(2),
  options: {
    host:        { type: 'string',  default: 'http://localhost:5001' },
    concurrency: { type: 'string',  default: '20' },
    duration:    { type: 'string',  default: '30' },
    warmup:      { type: 'string',  default: '5' },
    email:       { type: 'string',  default: `stress-${Date.now()}@test.com` },
    password:    { type: 'string',  default: 'StressTest123!' },
    workspace:   { type: 'string',  default: '' },
  },
});

const HOST        = args.host;
const CONCURRENCY = Number(args.concurrency);
const DURATION_S  = Number(args.duration);
const WARMUP_S    = Number(args.warmup);

const stats = {
  total: 0, success: 0, failed: 0,
  totalMs: 0, minMs: Infinity, maxMs: 0,
  byEndpoint: {},
};

let jwt         = null;
let workspaceId = args.workspace || null;
let running     = true;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  console.log(`\n🔧 FLOW OS Stress Test`);
  console.log(`   Host:        ${HOST}`);
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Duration:    ${DURATION_S}s`);
  console.log(`   Warmup:      ${WARMUP_S}s\n`);

  // Sign up or log in
  const signupRes = await fetch(`${HOST}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName:     'Stress User',
      email:        args.email,
      password:     args.password,
      orgName:      'Stress Test Org',
      workspaceName: 'stress',
    }),
  }).catch(() => null);

  if (signupRes?.ok) {
    const data  = await signupRes.json();
    jwt         = data.token;
    workspaceId = data.workspace?.id ?? workspaceId;
    console.log(`✅ Signed up — workspace: ${workspaceId}`);
  } else {
    const loginRes = await fetch(`${HOST}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: args.email, password: args.password }),
    });
    if (!loginRes.ok) throw new Error('Auth failed');
    const data  = await loginRes.json();
    jwt         = data.token;
    workspaceId = workspaceId || data.workspaceId;
    console.log(`✅ Logged in — workspace: ${workspaceId}`);
  }
  if (!workspaceId) throw new Error('No workspaceId. Pass --workspace <id>');
}

// ── Request scenarios ─────────────────────────────────────────────────────────

const scenarios = [
  {
    name: 'GET /health',
    weight: 2,
    run: async () => fetch(`${HOST}/health`),
  },
  {
    name: 'GET /api/intelligence/health-score',
    weight: 3,
    run: async () => fetch(`${HOST}/api/intelligence/health-score`, {
      headers: { Authorization: `Bearer ${jwt}`, 'workspace-id': workspaceId },
    }),
  },
  {
    name: 'POST /api/webhook/ingest',
    weight: 4,
    run: async () => fetch(`${HOST}/api/webhook/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'workspace-id': workspaceId },
      body: JSON.stringify({
        platform: 'slack', sender: 'stress-bot',
        channel: 'general',
        text: `Stress test message ${Math.random().toString(36).slice(2)}`,
      }),
    }),
  },
  {
    name: 'POST /api/query',
    weight: 2,
    run: async () => fetch(`${HOST}/api/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'workspace-id': workspaceId },
      body: JSON.stringify({ queryText: 'What is the current system status?' }),
    }),
  },
  {
    name: 'GET /api/connectors',
    weight: 2,
    run: async () => fetch(`${HOST}/api/connectors`, {
      headers: { Authorization: `Bearer ${jwt}`, 'workspace-id': workspaceId },
    }),
  },
  {
    name: 'GET /metrics/infra',
    weight: 1,
    run: async () => fetch(`${HOST}/metrics/infra`),
  },
];

const totalWeight = scenarios.reduce((s, sc) => s + sc.weight, 0);

function pickScenario() {
  let r = Math.random() * totalWeight;
  for (const sc of scenarios) { r -= sc.weight; if (r <= 0) return sc; }
  return scenarios[0];
}

// ── Worker ────────────────────────────────────────────────────────────────────

async function worker() {
  while (running) {
    const sc    = pickScenario();
    const start = Date.now();
    try {
      const res = await sc.run();
      const ms  = Date.now() - start;
      const ok  = res.status < 500;
      _record(sc.name, ms, ok);
    } catch {
      const ms = Date.now() - start;
      _record(sc.name, ms, false);
    }
  }
}

function _record(name, ms, ok) {
  stats.total++;
  if (ok) stats.success++; else stats.failed++;
  stats.totalMs += ms;
  if (ms < stats.minMs) stats.minMs = ms;
  if (ms > stats.maxMs) stats.maxMs = ms;
  if (!stats.byEndpoint[name]) stats.byEndpoint[name] = { count: 0, ok: 0, totalMs: 0 };
  stats.byEndpoint[name].count++;
  stats.byEndpoint[name].totalMs += ms;
  if (ok) stats.byEndpoint[name].ok++;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  await bootstrap();

  // Warmup
  console.log(`\n⏳ Warming up for ${WARMUP_S}s...`);
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await new Promise(r => setTimeout(r, WARMUP_S * 1000));
  const warmupStats = { ...stats };

  // Reset counters
  Object.assign(stats, { total: 0, success: 0, failed: 0, totalMs: 0, minMs: Infinity, maxMs: 0, byEndpoint: {} });

  // Main run
  console.log(`\n🚀 Running ${CONCURRENCY} concurrent workers for ${DURATION_S}s...\n`);
  const startTs = Date.now();
  const ticker  = setInterval(() => {
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
    const rps     = stats.total / ((Date.now() - startTs) / 1000);
    process.stdout.write(`\r  ${elapsed}s | reqs: ${stats.total} | rps: ${rps.toFixed(0)} | ok: ${stats.success} | err: ${stats.failed}`);
  }, 1000);

  await new Promise(r => setTimeout(r, DURATION_S * 1000));
  running = false;
  clearInterval(ticker);
  await Promise.allSettled(workers);

  // Report
  const elapsed = (Date.now() - startTs) / 1000;
  const rps     = stats.total / elapsed;
  const avgMs   = stats.total ? stats.totalMs / stats.total : 0;
  const errorPct = stats.total ? (stats.failed / stats.total * 100) : 0;

  console.log(`\n\n📊 Results (${elapsed.toFixed(1)}s)`);
  console.log(`  Total Requests:  ${stats.total}`);
  console.log(`  RPS:             ${rps.toFixed(1)}`);
  console.log(`  Success Rate:    ${(100 - errorPct).toFixed(1)}%`);
  console.log(`  Error Rate:      ${errorPct.toFixed(1)}%`);
  console.log(`  Avg Latency:     ${avgMs.toFixed(0)}ms`);
  console.log(`  Min Latency:     ${stats.minMs}ms`);
  console.log(`  Max Latency:     ${stats.maxMs}ms\n`);

  console.log('  By Endpoint:');
  for (const [name, s] of Object.entries(stats.byEndpoint)) {
    const avg = (s.totalMs / s.count).toFixed(0);
    const pct = (s.ok / s.count * 100).toFixed(0);
    console.log(`    ${name.padEnd(45)} count=${String(s.count).padStart(5)}  avg=${String(avg).padStart(6)}ms  ok=${pct}%`);
  }

  const passed = errorPct < 5 && avgMs < 2000;
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'} — error rate ${errorPct.toFixed(1)}% (threshold 5%), avg ${avgMs.toFixed(0)}ms (threshold 2000ms)\n`);
  process.exit(passed ? 0 : 1);
})();
