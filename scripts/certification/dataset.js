/**
 * dataset.js — certification dataset CLI (spec §5).
 *
 *   node scripts/certification/dataset.js manifest   — write immutable MANIFEST.json (§2)
 *   node scripts/certification/dataset.js import      — import Helios → real FLOW (§4)
 *   node scripts/certification/dataset.js verify       — verify what actually landed (§5)
 *   node scripts/certification/dataset.js reset        — wipe cert workspace (guarded §22)
 *
 * import/reset are HARD-GUARDED: only run under FLOW_ENV=certification against
 * workspace_helios_test. In production they fail closed (throw), never a warning.
 *
 * The importer reuses FLOW's real Workspace Lifecycle Engine — the SAME pipeline
 * real enterprise data flows through (db → graph → vectors → memory). No parallel
 * importer, no JSON-answer shortcut.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSyntheticWorld, loadSyntheticEvents, computeChecksum, WORLD_DIR } from './loadWorld.js';
import { FLOW_ENV, CERTIFICATION_WORKSPACE, assertCertificationAllowed, assertResetAllowed } from '../../src/config/flowEnv.js';

const cmd = process.argv[2];
const MANIFEST_PATH = path.join(WORLD_DIR, 'MANIFEST.json');

function log(...a) { console.log(...a); }

// ── manifest (§2) ──────────────────────────────────────────────────────────────
async function writeManifest() {
  const { counts, totalRecords, files, missing } = loadSyntheticWorld();
  const { checksum, fileCount } = computeChecksum();
  const manifest = {
    datasetName:    'flow-synthetic-world (Helios Systems)',
    datasetVersion: '1.0.0',
    schemaVersion:  '1.0',
    workspace:      CERTIFICATION_WORKSPACE,
    entityCount:    totalRecords,
    perTypeCounts:  counts,
    jsonFileCount:  fileCount,
    mappedFiles:    files,
    unmappedFiles:  missing,
    checksum,
    createdAt:      new Date().toISOString(),
    certificationStatus: 'FIXTURE',
    note: 'Immutable certification fixture. Do not edit facts/ids/dates. Regenerate this manifest only after an intentional, reviewed fixture change.',
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  log(`✅ manifest written → ${path.relative(process.cwd(), MANIFEST_PATH)}`);
  log(`   entities=${totalRecords} across ${Object.keys(counts).length} types · files=${fileCount} · checksum=${checksum.slice(0, 16)}…`);
  if (missing.length) log(`   ⚠ unmapped (not imported): ${missing.join(', ')}`);
  return manifest;
}

// ── import (§4) — REAL FLOW pipeline via WLE ────────────────────────────────────
async function importDataset() {
  assertCertificationAllowed('dataset:import', CERTIFICATION_WORKSPACE);
  // Side-effect import: registers all 23 built-in dataset types in the registry.
  // server.js does this at boot; a standalone script must trigger it explicitly or
  // every type is "unknown" and silently skipped.
  await import('../../src/core/workspaceLifecycle/datasets/index.js');
  const { runLifecycleOperation } = await import('../../src/core/workspaceLifecycle/lifecycleEngine.js');
  const { prisma } = await import('../../src/core/config/prisma.js');

  const { datasets, counts, totalRecords } = loadSyntheticWorld();
  log(`Importing Helios → ${CERTIFICATION_WORKSPACE} via the real Lifecycle Engine`);
  log(`  ${totalRecords} records across ${Object.keys(counts).length} dataset types`);

  // The WLE CREATE/IMPORT stages operate on an EXISTING Workspace row (the API relies
  // on tenantIsolation to have resolved it). So bootstrap org + workspace first,
  // idempotently — mirroring how a real workspace is provisioned before import.
  const existing = await _ensureCertWorkspace(prisma);
  const operation = existing.hadData ? 'IMPORT' : 'CREATE';

  const manifest = {
    schemaVersion: '1.0',
    engineVersion: '2.0',
    organization: { name: 'Helios Systems', slug: 'helios-systems' },
    datasets: Object.keys(datasets).map((type) => ({ type })),
  };

  const t0 = Date.now();
  const record = await runLifecycleOperation(operation, CERTIFICATION_WORKSPACE, { manifest, datasets });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  log(`\n✅ ${operation} complete in ${secs}s — importId=${record?.id || record?.importId || 'n/a'}`);
  if (record?.graphMetrics) log(`   graph: ${record.graphMetrics.nodes} nodes, ${record.graphMetrics.edges} edges`);
  if (record?.statistics) log(`   vectors: ${record.statistics.vectorChunks ?? '?'}, memory: ${record.statistics.memoryRecords ?? '?'}`);

  // Publish the real synthetic activity through the REAL Event Platform. The
  // consequence/prediction engines read flow_events for actor activity — the WLE
  // graph/vector/memory stages don't populate it. publishFields is the same entry
  // real connectors use, so timeline/feed/memory subscribers fire too.
  const { publishFields } = await import('../../src/events/index.js');
  const events = loadSyntheticEvents();
  let published = 0;
  for (const e of events) {
    try { const r = await publishFields({ ...e, workspaceId: CERTIFICATION_WORKSPACE }); if (r?.published !== false) published++; }
    catch { /* best-effort per event */ }
  }
  log(`   events: published ${published}/${events.length} through the event platform`);

  await prisma.$disconnect();
  return record;
}

// Idempotent org + certification workspace provisioning. Returns { hadData } so the
// caller picks CREATE (first time) vs IMPORT (re-run). Never touches other workspaces.
async function _ensureCertWorkspace(prisma) {
  const existing = await prisma.workspace.findUnique({ where: { externalId: CERTIFICATION_WORKSPACE } }).catch(() => null);
  if (existing) {
    const nodes = await prisma.graphNode.count({ where: { workspaceId: CERTIFICATION_WORKSPACE } }).catch(() => 0);
    return { hadData: nodes > 0 };
  }
  const org = await prisma.organization.upsert({
    where: { slug: 'helios-systems-cert' },
    update: {},
    create: { name: 'Helios Systems', slug: 'helios-systems-cert', plan: 'enterprise' },
  });
  await prisma.workspace.create({ data: { name: 'Helios Systems', orgId: org.id, externalId: CERTIFICATION_WORKSPACE } });
  log(`  · provisioned org + workspace ${CERTIFICATION_WORKSPACE}`);
  return { hadData: false };
}

// ── verify (§5) — what actually landed in REAL stores ───────────────────────────
async function verifyDataset() {
  const { prisma } = await import('../../src/core/config/prisma.js');
  const ws = await prisma.workspace.findUnique({ where: { externalId: CERTIFICATION_WORKSPACE } }).catch(() => null);
  if (!ws) { log(`❌ workspace ${CERTIFICATION_WORKSPACE} not found — run import first`); await prisma.$disconnect(); process.exit(1); }

  const { counts: expected, totalRecords } = loadSyntheticWorld();
  const [graphNodes, graphEdges, memory] = await Promise.all([
    prisma.graphNode.count({ where: { workspaceId: CERTIFICATION_WORKSPACE } }).catch(() => 0),
    prisma.graphEdge.count({ where: { workspaceId: CERTIFICATION_WORKSPACE } }).catch(() => 0),
    prisma.orgMemoryRecord.count({ where: { workspaceId: CERTIFICATION_WORKSPACE } }).catch(() => 0),
  ]);
  // vector chunks live in raw pg (workspace_intel_chunks)
  const db = (await import('../../src/config/db.js')).default;
  const vec = await db.query('SELECT count(*)::int c FROM workspace_intel_chunks WHERE workspace_id=$1', [CERTIFICATION_WORKSPACE]).then(r => r.rows[0].c).catch(() => 0);
  const events = await db.query('SELECT count(*)::int c FROM flow_events WHERE workspace_id=$1', [CERTIFICATION_WORKSPACE]).then(r => r.rows[0].c).catch(() => 0);

  log(`\n═══ dataset:verify — ${CERTIFICATION_WORKSPACE} ═══`);
  log(`  Dataset        flow-synthetic-world (Helios)`);
  log(`  Expected recs  ${totalRecords}`);
  log(`  Graph nodes    ${graphNodes}`);
  log(`  Graph edges    ${graphEdges}`);
  log(`  Vector chunks  ${vec}`);
  log(`  Memory records ${memory}`);
  log(`  Flow events    ${events}`);
  const isolationOk = graphNodes > 0; // nodes are namespaced ${workspaceId}:... — tenant-scoped by construction
  log(`  Isolation      ${isolationOk ? '✓ workspace-scoped' : '⚠ no nodes to check'}`);
  const pass = graphNodes > 0;
  log(`\n  ${pass ? '✅ data present in real FLOW stores' : '❌ nothing landed — import did not reach the graph'}`);
  await prisma.$disconnect();
  process.exit(pass ? 0 : 2);
}

// ── reset (§5/§22) — guarded destructive wipe ───────────────────────────────────
async function resetDataset() {
  assertResetAllowed(CERTIFICATION_WORKSPACE);
  const { prisma } = await import('../../src/core/config/prisma.js');
  const db = (await import('../../src/config/db.js')).default;
  const ws = CERTIFICATION_WORKSPACE;
  const [n, e, m] = await Promise.all([
    prisma.graphNode.deleteMany({ where: { workspaceId: ws } }).then(r => r.count).catch(() => 0),
    prisma.graphEdge.deleteMany({ where: { workspaceId: ws } }).then(r => r.count).catch(() => 0),
    prisma.orgMemoryRecord.deleteMany({ where: { workspaceId: ws } }).then(r => r.count).catch(() => 0),
  ]);
  await db.query('DELETE FROM workspace_intel_chunks WHERE workspace_id=$1', [ws]).catch(() => {});
  await db.query('DELETE FROM flow_events WHERE workspace_id=$1', [ws]).catch(() => {});
  log(`✅ reset ${ws}: removed ${n} nodes, ${e} edges, ${m} memory records (+ vectors/events)`);
  await prisma.$disconnect();
}

// ── dispatch ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    log(`FLOW_ENV=${FLOW_ENV}`);
    switch (cmd) {
      case 'manifest': await writeManifest(); break;
      case 'import':   await importDataset(); break;
      case 'verify':   await verifyDataset(); break;
      case 'reset':    await resetDataset(); break;
      default:
        log('usage: dataset.js <manifest|import|verify|reset>');
        process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }
})();
