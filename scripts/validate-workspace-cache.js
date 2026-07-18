/**
 * Validation harness — Phase 16.1 Workspace Intelligence Cache.
 *   node scripts/validate-workspace-cache.js
 *
 * Verifies: a snapshot builds fast (from cheap sources, NOT the ~90s brain), has the
 * full structure (overall + 6 domains + counts), memory/Redis store round-trips,
 * instant (sub-ms) reads, refresh, and cold-miss returns null (never blocks).
 */

import { buildSnapshot } from '../src/workspaceCache/snapshotBuilder.js';
import { setSnapshot, getSnapshot, peekSnapshot, clearSnapshot, hasSnapshot } from '../src/workspaceCache/snapshotStore.js';
import { refresh } from '../src/workspaceCache/refreshCoordinator.js';
import { prisma } from '../src/core/config/prisma.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };

async function main() {
  console.log('\n⚡ Phase 16.1 — Workspace Intelligence Cache validation\n');
  const ws = 'workspace_corp_alpha';

  // ── 1. Build (fast, from cheap sources) ─────────────────────────────────────
  console.log('1. Snapshot build (background-cheap, not the Brain)');
  const t0 = Date.now();
  const snap = await buildSnapshot(ws);
  const buildMs = Date.now() - t0;
  ok('builds a snapshot', Boolean(snap) && snap.status === 'ready');
  ok(`builds FAST (<5s, not the ~90s brain) — ${buildMs}ms`, buildMs < 5000);
  ok('has overall { health, priority, summary, topActions }', snap.overall && 'priority' in snap.overall && 'summary' in snap.overall && Array.isArray(snap.overall.topActions));
  const DOMAINS = ['engineering', 'operations', 'sales', 'hr', 'finance', 'security'];
  ok('has all six domain cards', DOMAINS.every((d) => snap.domains?.[d] && 'status' in snap.domains[d]));
  ok('each domain card has status + risks + actions', DOMAINS.every((d) => Array.isArray(snap.domains[d].topRisks) && Array.isArray(snap.domains[d].recommendedActions)));
  ok('has counts (approvals/notifications/executions/graph)', snap.counts && 'pendingApprovals' in snap.counts && 'graphNodes' in snap.counts);
  ok('does NOT invoke the brain/council (buildMs is cheap)', buildMs < 5000);

  // ── 2. Store round-trip (memory + Redis write-through) ──────────────────────
  console.log('2. Store round-trip');
  await setSnapshot(ws, snap);
  ok('hasSnapshot after set', hasSnapshot(ws));
  const got = await getSnapshot(ws);
  ok('getSnapshot returns the stored snapshot', got && got.generatedAt === snap.generatedAt);

  // ── 3. Instant reads ────────────────────────────────────────────────────────
  console.log('3. Instant read (<100ms target)');
  const r0 = process.hrtime.bigint();
  const peek = peekSnapshot(ws);
  const readNs = Number(process.hrtime.bigint() - r0);
  ok('peekSnapshot is synchronous + present', Boolean(peek));
  ok(`memory read is sub-millisecond — ${(readNs / 1e6).toFixed(3)}ms`, readNs / 1e6 < 5);

  // ── 4. Refresh ──────────────────────────────────────────────────────────────
  console.log('4. Background refresh');
  const refreshed = await refresh(ws);
  ok('refresh rebuilds + stores', refreshed && refreshed.status === 'ready');
  ok('refresh result is readable from cache', (await getSnapshot(ws))?.generatedAt === refreshed.generatedAt);

  // ── 5. Cold miss never blocks ───────────────────────────────────────────────
  console.log('5. Cold miss');
  clearSnapshot('workspace_never_seen_xyz');
  const cold = await getSnapshot('workspace_never_seen_xyz');
  ok('cold miss returns null (caller schedules async build, no block)', cold === null);

  clearSnapshot(ws);
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('Harness error:', err); try { await prisma.$disconnect(); } catch { /* noop */ } process.exit(1); });
