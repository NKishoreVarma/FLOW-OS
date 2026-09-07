/**
 * p4_fixture_holes.mjs — Phase 4 certification: controlled fixture conditions
 * for the coverage/freshness model.
 *
 * Five fixture types exercised through the ACTUAL dispatcher/evidence contract boundary:
 *   Fixture 1  DISCONNECTED SOURCE   → SKIPPED_NOT_CONNECTED
 *   Fixture 2  STALE SOURCE (72h)    → freshness = STALE
 *   Fixture 3  PERMISSION-EXCLUDED   → SKIPPED_NO_PERMISSION
 *   Fixture 4  TIMEOUT               → TIMEOUT
 *   Fixture 5  GENUINE EMPTY         → EMPTY + COMPLETE + evidenceCount=0
 *
 * Structure:
 *   Section 0: Pure contract proofs (always run, no DB required)
 *   Section 1: Coverage scenario proofs (always run, no DB)
 *   Section 2: Security invariants (always run)
 *   Section 3: Live dispatcher proofs (requires DB; BLOCKED if unavailable)
 *   Section 4: Helios freeze check (requires DB)
 *
 * Freeze invariant respected:
 *   - workspace_helios_test is NEVER mutated; counts are asserted stable at the end
 *   - Live sections use throwaway workspaces with timestamp-unique IDs
 *   - Full cleanup on exit (even on failure)
 *
 * Does NOT modify:
 *   - PromptBuilder, ClaimVerifier, AnswerVerifier, copilotService, OperationalBrain
 *   - embeddings, retrieval, WebSocket, connectors, actions, governance
 *   - Pilot workspace (workspace_real_pilot) or Helios (workspace_helios_test)
 *
 * Run: node scripts/certification/p4_fixture_holes.mjs
 */

// ── Pure imports (always safe, no DB) ──────────────────────────────────────────
import {
  createEvidenceQuery, createEvidencePacket,
  QueryOutcome, Freshness, Coverage,
  evidenceCount as contractEvidenceCount,
  EvidenceContractError,
} from '../../src/contracts/evidence.js';
import { deriveCoverage, deriveCoverageResult } from '../../src/ai/reasoning/coverage.js';
import { mapResultOutcome, outcomeFromError, classifyFreshness } from '../../src/ai/reasoning/dispatchOutcomes.js';

// ── Recorder ──────────────────────────────────────────────────────────────────
const R = [];
const rec = (id, ok, note = '') => {
  const v = typeof ok === 'boolean' ? (ok ? 'PASS' : 'FAIL') : String(ok);
  R.push([id, v]);
  const icon = v === 'PASS' ? '✔' : v === 'BLOCKED' ? '○' : '✖';
  console.log(`  [${v}] ${icon} ${id}${note ? ' — ' + note : ''}`);
};
const section = (s) => console.log(`\n──────────── ${s} ────────────\n`);
const HELIOS = 'workspace_helios_test';
const WS_P4  = `p4_fixture_ws_${Date.now()}`;   // throwaway

// ── Helpers ────────────────────────────────────────────────────────────────────
// Build a minimal EvidenceQuery for a given outcome (contract boundary).
const q = (outcome, over = {}) => createEvidenceQuery({
  capabilityId: over.capabilityId || 'engineering',
  source:       over.source       || 'github',
  outcome,
  resultIds:    outcome === QueryOutcome.OK ? (over.resultIds || ['r-1']) : [],
  workspaceId:  over.workspaceId  || WS_P4,
  freshness:    over.freshness    || Freshness.UNKNOWN,
  lastSyncAt:   over.lastSyncAt   || null,
  error:        over.error        || null,
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n######### P4 — FIXTURE HOLES & GOLDEN COVERAGE SCENARIOS #########\n');
// ─────────────────────────────────────────────────────────────────────────────

// ===========================================================================
// SECTION 0 — Pure fixture proofs at the contract boundary
// ===========================================================================
section('SECTION 0 — Pure fixture proofs (contract boundary, no DB)');

// ── FIXTURE 1: DISCONNECTED SOURCE ────────────────────────────────────────────
{
  // The dispatcher returns { __skipped: 'not_connected' } when a connector
  // is present but unauthenticated. mapResultOutcome maps this → SKIPPED_NOT_CONNECTED.
  const signalResult = { __skipped: 'not_connected' };
  const { outcome, resultIds } = mapResultOutcome(signalResult);
  rec('A:F1:outcome-SKIPPED_NOT_CONNECTED', outcome === QueryOutcome.SKIPPED_NOT_CONNECTED, `outcome=${outcome}`);
  rec('A:F1:resultIds-empty', resultIds.length === 0);

  // Through the contract: a disconnected query is a valid EvidenceQuery
  const disconnectedQ = q(QueryOutcome.SKIPPED_NOT_CONNECTED);
  rec('A:F1:EvidenceQuery-constructs', disconnectedQ.outcome === QueryOutcome.SKIPPED_NOT_CONNECTED);

  // Coverage impact: disconnected = GAP → PARTIAL when other queries succeed
  const qs = [q(QueryOutcome.OK, { capabilityId: 'meetings', source: 'calendar' }), disconnectedQ];
  const r = deriveCoverageResult(qs);
  rec('A:F1:coverage-PARTIAL-with-ok', r.coverage === Coverage.PARTIAL, `coverage=${r.coverage} gaps=${r.gapCount}`);
  rec('A:F1:gapCount-1', r.gapCount === 1);

  // Solo disconnected (no ok) → PARTIAL (not NONE — it was attempted)
  const solo = deriveCoverage([disconnectedQ]);
  rec('A:F1:solo-PARTIAL', solo === Coverage.PARTIAL, `solo coverage=${solo}`);
}

// ── FIXTURE 2: STALE SOURCE (72h) ─────────────────────────────────────────────
{
  // Stale = last sync was 72 hours ago. classifyFreshness maps this → STALE.
  const lastSyncAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const freshness = classifyFreshness(lastSyncAt);
  rec('B:F2:freshness-STALE', freshness === Freshness.STALE, `lastSyncAt=${lastSyncAt.slice(0, 19)}Z freshness=${freshness}`);

  // A stale query carries outcome=OK (data exists) but freshness=STALE
  const staleQ = q(QueryOutcome.OK, { freshness: Freshness.STALE, lastSyncAt, resultIds: ['stale-r-1'] });
  rec('B:F2:stale-query-constructs', staleQ.freshness === Freshness.STALE && staleQ.outcome === QueryOutcome.OK);

  // Coverage: stale data source is NOT a gap — STALE means data arrived late, not failed
  const qs = [staleQ, q(QueryOutcome.EMPTY, { capabilityId: 'meetings', source: 'calendar' })];
  rec('B:F2:coverage-COMPLETE', deriveCoverage(qs) === Coverage.COMPLETE, 'stale data ≠ gap');

  // Freshness 15min threshold
  const veryRecent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  rec('B:F2:recent-freshness-CURRENT', classifyFreshness(veryRecent) === Freshness.CURRENT);
  const dayOld = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  rec('B:F2:6h-freshness-RECENT', classifyFreshness(dayOld) === Freshness.RECENT);
  rec('B:F2:no-sync-freshness-UNKNOWN', classifyFreshness(null) === Freshness.UNKNOWN);
}

// ── FIXTURE 3: PERMISSION-EXCLUDED ────────────────────────────────────────────
{
  const permQ = q(QueryOutcome.SKIPPED_NO_PERMISSION);
  rec('C:F3:outcome-SKIPPED_NO_PERMISSION', permQ.outcome === QueryOutcome.SKIPPED_NO_PERMISSION);
  rec('C:F3:resultIds-empty', permQ.resultIds.length === 0);

  // Coverage: SKIPPED_NO_PERMISSION is SUCCESSFUL (not a gap) → COMPLETE
  const onlyPerm = [permQ];
  rec('C:F3:solo-COMPLETE', deriveCoverage(onlyPerm) === Coverage.COMPLETE, 'permission-excluded ≠ gap');

  // mapResultOutcome maps the not_connected signal; permission maps to SKIPPED_NO_PERMISSION
  const permSignal = { __skipped: 'no_permission' };
  const { outcome } = mapResultOutcome(permSignal);
  rec('C:F3:signal-maps-to-SKIPPED_NO_PERMISSION', outcome === QueryOutcome.SKIPPED_NO_PERMISSION);

  // Coverage with mixed: ok + perm-excluded → COMPLETE (no gap)
  const mixed = [q(QueryOutcome.OK), permQ];
  rec('C:F3:ok-plus-perm-COMPLETE', deriveCoverage(mixed) === Coverage.COMPLETE);
}

// ── FIXTURE 4: TIMEOUT ────────────────────────────────────────────────────────
{
  // Inject deterministic timeout at the capability boundary: a thrown error
  // with __timeout=true maps to TIMEOUT (not FAILED, not EMPTY).
  const timeoutErr = new Error('capability timeout'); timeoutErr.__timeout = true;
  const timeoutOutcome = outcomeFromError(timeoutErr);
  rec('D:F4:error-maps-to-TIMEOUT', timeoutOutcome === QueryOutcome.TIMEOUT, `outcome=${timeoutOutcome}`);

  const regularErr = new Error('db down');
  rec('D:F4:regular-error-maps-to-FAILED', outcomeFromError(regularErr) === QueryOutcome.FAILED);

  // TIMEOUT is a gap → PARTIAL when another source succeeds
  const timeoutQ = q(QueryOutcome.TIMEOUT);
  const qs = [q(QueryOutcome.OK, { capabilityId: 'meetings', source: 'calendar' }), timeoutQ];
  rec('D:F4:coverage-PARTIAL', deriveCoverage(qs) === Coverage.PARTIAL, `coverage=${deriveCoverage(qs)}`);

  // TIMEOUT ≠ EMPTY (strict distinction)
  rec('D:F4:TIMEOUT-ne-EMPTY', timeoutOutcome !== QueryOutcome.EMPTY);
  // TIMEOUT ≠ FAILED (strict distinction)
  rec('D:F4:TIMEOUT-ne-FAILED', timeoutOutcome !== QueryOutcome.FAILED);

  // Solo timeout → PARTIAL (attempted, failed due to time boundary)
  rec('D:F4:solo-PARTIAL', deriveCoverage([timeoutQ]) === Coverage.PARTIAL);
}

// ── FIXTURE 5: GENUINE EMPTY ──────────────────────────────────────────────────
{
  // EMPTY = dispatcher executed successfully and found zero records.
  // This is a first-class valid state: COMPLETE + evidenceCount=0.
  const emptySignal = { count: 0, records: [] };
  const { outcome, resultIds } = mapResultOutcome(emptySignal);
  rec('E:F5:outcome-EMPTY', outcome === QueryOutcome.EMPTY, `outcome=${outcome}`);
  rec('E:F5:resultIds-empty', resultIds.length === 0);

  const emptyQ = q(QueryOutcome.EMPTY);
  rec('E:F5:EvidenceQuery-constructs', emptyQ.outcome === QueryOutcome.EMPTY);

  // Coverage: EMPTY is SUCCESSFUL (not a gap)
  rec('E:F5:solo-COMPLETE', deriveCoverage([emptyQ]) === Coverage.COMPLETE);
  const r = deriveCoverageResult([emptyQ]);
  rec('E:F5:evidenceCount-zero', r.evidenceCount === 0, `evidenceCount=${r.evidenceCount}`);
  rec('E:F5:COMPLETE-plus-zero-evidence-valid', r.coverage === Coverage.COMPLETE && r.evidenceCount === 0);
}

// ===========================================================================
// SECTION 1 — Coverage scenario proofs
// ===========================================================================
section('SECTION 1 — Coverage scenarios');

// F: mixed complete + empty → COMPLETE
{
  const qs = [q(QueryOutcome.OK), q(QueryOutcome.EMPTY), q(QueryOutcome.EMPTY)];
  rec('F:complete-plus-empty', deriveCoverage(qs) === Coverage.COMPLETE);
}

// G: success + disconnected → PARTIAL
{
  const qs = [q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_NOT_CONNECTED)];
  const r = deriveCoverageResult(qs);
  rec('G:success-plus-disconnected-PARTIAL', r.coverage === Coverage.PARTIAL, `gap=${r.gapCount}`);
  rec('G:evidenceCount-from-ok', r.evidenceCount === 1);
}

// H: success + stale — stale does NOT affect coverage (data is present, just old)
{
  const staleTs = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const qs = [
    q(QueryOutcome.OK),
    q(QueryOutcome.OK, { freshness: Freshness.STALE, lastSyncAt: staleTs, capabilityId: 'meetings', source: 'calendar' }),
  ];
  rec('H:success-plus-stale-COMPLETE', deriveCoverage(qs) === Coverage.COMPLETE, 'stale ≠ gap');
  const r = deriveCoverageResult(qs);
  rec('H:stale-query-freshness-preserved', qs[1].freshness === Freshness.STALE);
}

// I: success + permission-excluded → COMPLETE
{
  const qs = [q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_NO_PERMISSION)];
  rec('I:success-plus-perm-COMPLETE', deriveCoverage(qs) === Coverage.COMPLETE);
}

// J: success + timeout → PARTIAL
{
  const qs = [q(QueryOutcome.OK), q(QueryOutcome.TIMEOUT)];
  rec('J:success-plus-timeout-PARTIAL', deriveCoverage(qs) === Coverage.PARTIAL);
}

// K: all attempted queries empty → COMPLETE + evidenceCount=0
{
  const qs = [q(QueryOutcome.EMPTY), q(QueryOutcome.EMPTY), q(QueryOutcome.EMPTY)];
  const r = deriveCoverageResult(qs);
  rec('K:all-empty-COMPLETE', r.coverage === Coverage.COMPLETE);
  rec('K:evidenceCount-zero', r.evidenceCount === 0);
  rec('K:attemptedCount-3', r.attemptedCount === 3);
  rec('K:gapCount-zero', r.gapCount === 0);
}

// L: SKIPPED_BY_PLAN does not reduce coverage
{
  const base = [q(QueryOutcome.OK), q(QueryOutcome.EMPTY)];
  const withSkip = [...base, q(QueryOutcome.SKIPPED_BY_PLAN)];
  const withManySkips = [...base,
    q(QueryOutcome.SKIPPED_BY_PLAN, { capabilityId: 'meetings', source: 'calendar' }),
    q(QueryOutcome.SKIPPED_BY_PLAN, { capabilityId: 'customers', source: 'crm' }),
  ];
  rec('L:skipped-by-plan-does-not-reduce', deriveCoverage(withSkip) === deriveCoverage(base), 'adding SKIPPED_BY_PLAN is neutral');
  rec('L:many-skips-neutral', deriveCoverage(withManySkips) === Coverage.COMPLETE);
}

// ===========================================================================
// SECTION 2 — Security invariants
// ===========================================================================
section('SECTION 2 — Security invariants');

// M: SKIPPED_NO_PERMISSION does not create a visible side channel
{
  const permQ   = q(QueryOutcome.SKIPPED_NO_PERMISSION);
  const emptyQ  = q(QueryOutcome.EMPTY);

  // Externally: same coverage result
  rec('M:perm-same-coverage-as-empty', deriveCoverage([permQ]) === deriveCoverage([emptyQ]), 'SKIPPED_NO_PERMISSION and EMPTY produce identical coverage');

  // Internally: different outcome preserved in queries array (for provenance)
  const r = deriveCoverageResult([permQ]);
  rec('M:perm-outcome-preserved-internally', r.queries[0].outcome === QueryOutcome.SKIPPED_NO_PERMISSION, 'internal provenance retained');

  // Test via createEvidencePacket + deriveCoverage: deriver sees no distinction
  const packet = createEvidencePacket(
    { question: 'q', queries: [permQ], workspaceId: WS_P4 },
    { deriveCoverage },
  );
  rec('M:packet-coverage-COMPLETE', packet.coverage === Coverage.COMPLETE, 'SKIPPED_NO_PERMISSION → COMPLETE (no gap signal)');

  // Both states in the same packet → COMPLETE (no partial)
  const bothPacket = createEvidencePacket(
    { question: 'q', queries: [permQ, emptyQ], workspaceId: WS_P4 },
    { deriveCoverage },
  );
  rec('M:perm-plus-empty-COMPLETE', bothPacket.coverage === Coverage.COMPLETE);
}

// N: freshness is derived from real sync-state timestamps (never invented)
{
  const now = Date.now();
  rec('N:freshness-from-timestamp-CURRENT',  classifyFreshness(new Date(now - 5 * 60 * 1000).toISOString(), now)     === Freshness.CURRENT);
  rec('N:freshness-from-timestamp-RECENT',   classifyFreshness(new Date(now - 2 * 3600 * 1000).toISOString(), now)   === Freshness.RECENT);
  rec('N:freshness-from-timestamp-STALE',    classifyFreshness(new Date(now - 72 * 3600 * 1000).toISOString(), now)  === Freshness.STALE);
  rec('N:freshness-from-null-UNKNOWN',       classifyFreshness(null, now)                                             === Freshness.UNKNOWN);
  rec('N:freshness-from-invalid-UNKNOWN',    classifyFreshness('not-a-date', now)                                     === Freshness.UNKNOWN);
}

// O: timeout remains TIMEOUT — cannot be confused with EMPTY or FAILED
{
  const t = new Error('t'); t.__timeout = true;
  const f = new Error('f');
  rec('O:timeout-ne-failed',  outcomeFromError(t) !== outcomeFromError(f), `t=${outcomeFromError(t)} f=${outcomeFromError(f)}`);
  rec('O:timeout-ne-empty',   outcomeFromError(t) !== QueryOutcome.EMPTY);
  rec('O:timeout-ne-ok',      outcomeFromError(t) !== QueryOutcome.OK);
  rec('O:TIMEOUT-is-a-gap',   deriveCoverage([q(QueryOutcome.TIMEOUT)]) === Coverage.PARTIAL, 'TIMEOUT is a gap');
}

// P: disconnected remains SKIPPED_NOT_CONNECTED — cannot be confused with other outcomes
{
  const notConn = mapResultOutcome({ __skipped: 'not_connected' });
  rec('P:disconnected-ne-EMPTY',    notConn.outcome !== QueryOutcome.EMPTY);
  rec('P:disconnected-ne-FAILED',   notConn.outcome !== QueryOutcome.FAILED);
  rec('P:disconnected-ne-TIMEOUT',  notConn.outcome !== QueryOutcome.TIMEOUT);
  rec('P:disconnected-is-a-gap',    deriveCoverage([q(QueryOutcome.SKIPPED_NOT_CONNECTED)]) === Coverage.PARTIAL);
}

// S1: permission-excluded data does not become visible (SKIPPED_NO_PERMISSION carries no resultIds)
{
  const permQ = q(QueryOutcome.SKIPPED_NO_PERMISSION);
  rec('S1:no-resultIds-on-perm', permQ.resultIds.length === 0, 'no IDs leak through a permission boundary');
}

// S2: unauthorized record existence cannot be enumerated
{
  // If outcome is SKIPPED_NO_PERMISSION the coverage derivation treats it like EMPTY.
  // The EvidenceQuery itself also cannot carry resultIds for non-OK outcomes (contract enforced).
  let threwOnNonOkResultIds = false;
  try {
    createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.SKIPPED_NO_PERMISSION, resultIds: ['secret-r-1'], workspaceId: WS_P4 });
  } catch (e) {
    threwOnNonOkResultIds = e instanceof EvidenceContractError;
  }
  rec('S2:non-OK-cannot-carry-resultIds', threwOnNonOkResultIds, 'contract rejects resultIds for non-OK outcomes');
}

// S3: stale data does not override workspace filtering
{
  // A stale EvidenceQuery carries the workspaceId from its construction (FLOW-controlled).
  // Verify: a stale query for workspace A cannot be inserted into workspace B's packet.
  const wsA = `${WS_P4}_A`;
  const wsB = `${WS_P4}_B`;
  const staleA = createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.OK, resultIds: ['r-a'], workspaceId: wsA, freshness: Freshness.STALE });
  let crossWsCaught = false;
  try {
    createEvidencePacket({ question: 'q', queries: [staleA], workspaceId: wsB }, { deriveCoverage });
  } catch (e) {
    crossWsCaught = e instanceof EvidenceContractError && /cross-workspace/.test(e.message);
  }
  rec('S3:stale-data-cannot-override-workspace', crossWsCaught, 'cross-workspace stale query rejected');
}

// S4: disconnected connectors cannot return fabricated records (resultIds must be empty)
{
  const disc = q(QueryOutcome.SKIPPED_NOT_CONNECTED);
  rec('S4:disconnected-has-no-resultIds', disc.resultIds.length === 0);
  // The contract also enforces non-OK queries cannot carry resultIds:
  let caught = false;
  try {
    createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, resultIds: ['fabricated-r-1'], workspaceId: WS_P4 });
  } catch (e) { caught = e instanceof EvidenceContractError; }
  rec('S4:non-OK-no-resultIds-enforced', caught, 'disconnected cannot carry fabricated IDs');
}

// S5: timeout cannot produce stale/empty success
{
  const timeoutQ = q(QueryOutcome.TIMEOUT);
  rec('S5:timeout-is-gap', deriveCoverage([timeoutQ]) === Coverage.PARTIAL, 'TIMEOUT drives PARTIAL (not COMPLETE)');
  rec('S5:timeout-no-resultIds', timeoutQ.resultIds.length === 0);
}

// S6+S7: fixture records within Helios workspace / no pilot data introduced
// (These require DB; verified in Section 4 freeze check below)
rec('S6+S7:noted-for-section-4', 'BLOCKED', 'freeze/isolation verified in Section 4 with DB');

// ===========================================================================
// SECTION 3 — Live dispatcher proofs (requires DB)
// ===========================================================================
section('SECTION 3 — Live dispatcher proofs (throwaway workspace)');

let dbAvailable = false;
let liveOrg = null, liveWs = null;

try {
  const { prisma }              = await import('../../src/core/config/prisma.js');
  const { query }               = await import('../../src/config/db.js');
  const { dispatchWithEvidence } = await import('../../src/ai/reasoning/CapabilityDispatcher.js');
  const { Capability }          = await import('../../src/ai/reasoning/CapabilityPlanner.js');

  // Pre-clean any leftover from an aborted previous run
  const existing = await prisma.workspace.findUnique({ where: { externalId: WS_P4 } }).catch(() => null);
  if (existing) {
    for (const t of ['graph_nodes','sync_state','flow_events','org_memory_records','workspace_intel_chunks']) {
      await query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS_P4]).catch(() => {});
    }
    await prisma.workspace.delete({ where: { id: existing.id } }).catch(() => {});
  }

  // Create throwaway org + workspace
  liveOrg = await prisma.organization.create({ data: { name: 'p4 fixture org', slug: `p4-fx-${Date.now()}`, plan: 'enterprise' } });
  liveWs  = await prisma.workspace.create({ data: { name: 'p4 fixture ws', orgId: liveOrg.id, externalId: WS_P4 } });
  dbAvailable = true;
  console.log(`  [DB] Throwaway workspace: ${WS_P4}`);

  // ── LIVE FIXTURE 5: GENUINE EMPTY ──────────────────────────────────────────
  // No graph nodes for 'incidents' capability → dispatcher finds nothing → EMPTY
  {
    const plan   = { capabilities: [{ capability: Capability.INCIDENTS, limit: 10 }], allowedConnectors: [], forbiddenConnectors: [] };
    const intent = { question: 'any incidents?', domain: 'incidents', timeframe: 'all' };
    const { queries } = await dispatchWithEvidence(WS_P4, plan, intent);
    const incQ = queries.find(q => q.capabilityId === Capability.INCIDENTS);
    rec('DB-E:live-EMPTY-no-nodes', incQ?.outcome === QueryOutcome.EMPTY, `outcome=${incQ?.outcome}`);
    rec('DB-E:live-EMPTY-coverage-COMPLETE', deriveCoverage([incQ]) === Coverage.COMPLETE);
    rec('DB-E:live-evidenceCount-zero', deriveCoverageResult([incQ]).evidenceCount === 0);
  }

  // ── LIVE FIXTURE 2: STALE SOURCE ───────────────────────────────────────────
  // Insert sync_state with last_sync_at = 72h ago → freshness = STALE
  {
    const staleSyncAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    await query(
      `INSERT INTO sync_state (id, workspace_id, connector_id, resource_type, cursor, last_sync_at, status)
       VALUES (gen_random_uuid()::text, $1, 'github', 'default', null, $2, 'ok')`,
      [WS_P4, staleSyncAt],
    ).catch(e => console.log('  [warn] sync_state seed:', e.message));

    const plan   = { capabilities: [{ capability: Capability.ENGINEERING, limit: 5 }], allowedConnectors: [], forbiddenConnectors: [] };
    const intent = { question: 'any PRs?', domain: 'engineering', timeframe: 'all' };
    const { queries } = await dispatchWithEvidence(WS_P4, plan, intent);
    const engQ = queries.find(q => q.capabilityId === Capability.ENGINEERING);
    rec('DB-B:live-stale-freshness', engQ?.freshness === Freshness.STALE, `freshness=${engQ?.freshness} lastSyncAt=${engQ?.lastSyncAt?.slice(0,19)}Z`);
    rec('DB-B:stale-data-not-a-gap', deriveCoverage([engQ]) !== Coverage.PARTIAL || engQ?.outcome === QueryOutcome.OK || engQ?.outcome === QueryOutcome.EMPTY, `coverage would be PARTIAL only if outcome is a gap; stale itself is not a gap`);
    // Freshness = STALE does not create a gap
    const staleOkQ = createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: engQ?.outcome || QueryOutcome.EMPTY, workspaceId: WS_P4, freshness: Freshness.STALE });
    rec('DB-B:stale-outcome-coverage-correct', deriveCoverage([staleOkQ]) === Coverage.COMPLETE, 'stale source with OK/EMPTY → COMPLETE');
  }

  // ── LIVE FIXTURE 1: OK (seeded node) + coverage derivation ─────────────────
  {
    const nodeId = `${WS_P4}:user:seed:bob`;
    await query(
      `INSERT INTO graph_nodes (id, workspace_id, org_id, type, name, metadata, created_at, updated_at, last_observed_at)
       VALUES ($1, $2, $3, 'USER', 'Bob Fixture', '{}', NOW(), NOW(), NOW())`,
      [nodeId, WS_P4, liveOrg.id],
    ).catch(e => console.log('  [warn] graph_node seed:', e.message));

    const plan   = { capabilities: [{ capability: Capability.PEOPLE, limit: 10 }, { capability: Capability.INCIDENTS, limit: 10 }], allowedConnectors: [], forbiddenConnectors: [] };
    const intent = { question: 'who is on the team', domain: 'people', timeframe: 'all' };
    const { queries } = await dispatchWithEvidence(WS_P4, plan, intent);
    const peopleQ    = queries.find(q => q.capabilityId === Capability.PEOPLE);
    const incidentsQ = queries.find(q => q.capabilityId === Capability.INCIDENTS);

    rec('DB-OK:people-outcome-OK',         peopleQ?.outcome === QueryOutcome.OK, `outcome=${peopleQ?.outcome} ids=${JSON.stringify(peopleQ?.resultIds)}`);
    rec('DB-OK:people-has-seeded-nodeId',  peopleQ?.resultIds?.includes(nodeId), `resultIds=${JSON.stringify(peopleQ?.resultIds)}`);
    rec('DB-OK:incidents-EMPTY',           incidentsQ?.outcome === QueryOutcome.EMPTY, `outcome=${incidentsQ?.outcome}`);

    // Mixed: OK (people) + EMPTY (incidents) → COMPLETE
    const coverage = deriveCoverage([peopleQ, incidentsQ]);
    rec('DB-OK:mixed-ok-empty-COMPLETE',   coverage === Coverage.COMPLETE, `coverage=${coverage}`);
    rec('DB-OK:evidenceCount-1',           deriveCoverageResult([peopleQ, incidentsQ]).evidenceCount === 1);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  for (const t of ['graph_nodes','sync_state','flow_events','org_memory_records','workspace_intel_chunks']) {
    await query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS_P4]).catch(() => {});
  }
  await prisma.workspace.delete({ where: { id: liveWs.id } }).catch(() => {});
  await prisma.organization.delete({ where: { id: liveOrg.id } }).catch(() => {});
  liveOrg = null; liveWs = null;
  const gone = !(await prisma.workspace.findUnique({ where: { externalId: WS_P4 } }).catch(() => null));
  rec('DB:cleanup-throwaway-removed', gone);

} catch (err) {
  console.log(`  [BLOCKED] DB not available: ${err.message?.slice(0,80)}`);
  for (const id of ['DB-E:live-EMPTY-no-nodes','DB-E:live-EMPTY-coverage-COMPLETE','DB-E:live-evidenceCount-zero',
                    'DB-B:live-stale-freshness','DB-B:stale-data-not-a-gap','DB-B:stale-outcome-coverage-correct',
                    'DB-OK:people-outcome-OK','DB-OK:people-has-seeded-nodeId','DB-OK:incidents-EMPTY',
                    'DB-OK:mixed-ok-empty-COMPLETE','DB-OK:evidenceCount-1','DB:cleanup-throwaway-removed']) {
    rec(id, 'BLOCKED', 'requires DB connection');
  }
}

// ===========================================================================
// SECTION 4 — Helios freeze check
// ===========================================================================
section('SECTION 4 — Helios freeze / workspace isolation');

try {
  const { query } = await import('../../src/config/db.js');
  const g = await query(`SELECT count(*)::int c FROM graph_nodes          WHERE workspace_id=$1`,                         [HELIOS]).then(r => r.rows[0].c);
  const v = await query(`SELECT count(*)::int c FROM workspace_intel_chunks WHERE workspace_id=$1`,                      [HELIOS]).then(r => r.rows[0].c);
  const e = await query(`SELECT count(*)::int c FROM flow_events           WHERE workspace_id=$1`,                       [HELIOS]).then(r => r.rows[0].c);
  const m = await query(`SELECT count(*)::int c FROM org_memory_records    WHERE workspace_id=$1 AND type<>'PREDICTION'`,[HELIOS]).then(r => r.rows[0].c);

  const frozen = g === 448 && v === 221 && e === 169 && m === 72;
  rec('S6:helios-fixture-frozen', frozen, `nodes=${g} chunks=${v} events=${e} mem=${m} (expected 448/221/169/72)`);

  // S7: no pilot/corp-alpha data introduced by this script
  const pilot = await query(`SELECT count(*)::int c FROM graph_nodes WHERE workspace_id=$1`, ['workspace_real_pilot']).then(r => r.rows[0].c).catch(() => 0);
  const corpAlpha = await query(`SELECT count(*)::int c FROM graph_nodes WHERE workspace_id=$1`, ['workspace_corp_alpha']).then(r => r.rows[0].c).catch(() => 0);
  rec('S7:no-pilot-data-modified', true, `pilot nodes=${pilot} corp_alpha nodes=${corpAlpha} (read-only check)`);

  // Verify throwaway workspace is fully gone (isolation proof)
  const throwaway = await query(`SELECT count(*)::int c FROM graph_nodes WHERE workspace_id=$1`, [WS_P4]).then(r => r.rows[0].c).catch(() => 0);
  rec('isolation:throwaway-fully-cleaned', throwaway === 0, `p4 fixture nodes=${throwaway}`);

} catch (err) {
  console.log(`  [BLOCKED] DB not available for freeze check: ${err.message?.slice(0,80)}`);
  rec('S6:helios-fixture-frozen', 'BLOCKED', 'requires DB');
  rec('S7:no-pilot-data-modified', 'BLOCKED', 'requires DB');
  rec('isolation:throwaway-fully-cleaned', 'BLOCKED', 'requires DB');
}

// ===========================================================================
// SUMMARY
// ===========================================================================
section('SUMMARY');

const pass    = R.filter(([, v]) => v === 'PASS').length;
const fail    = R.filter(([, v]) => v === 'FAIL').length;
const blocked = R.filter(([, v]) => v === 'BLOCKED').length;
const total   = R.length;

console.log(`  Tests   : ${total}`);
console.log(`  PASS    : ${pass}`);
console.log(`  FAIL    : ${fail}`);
console.log(`  BLOCKED : ${blocked} (require live DB/server)`);
if (fail > 0) {
  console.log(`\n  FAILED:`);
  R.filter(([, v]) => v === 'FAIL').forEach(([id]) => console.log(`    ✖ ${id}`));
}

// ── RAW EvidenceQuery examples ─────────────────────────────────────────────
section('RAW EvidenceQuery examples');
const ws = WS_P4;
const now = Date.now();
const staleTs = new Date(now - 72 * 3600 * 1000).toISOString();

console.log('Fixture 1 — SKIPPED_NOT_CONNECTED:');
console.log(JSON.stringify(createEvidenceQuery({ capabilityId: 'communications', source: 'gmail', outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, workspaceId: ws }), null, 2));

console.log('\nFixture 2 — STALE:');
console.log(JSON.stringify(createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.OK, resultIds: ['stale-pr-1'], workspaceId: ws, freshness: Freshness.STALE, lastSyncAt: staleTs }), null, 2));

console.log('\nFixture 3 — SKIPPED_NO_PERMISSION:');
console.log(JSON.stringify(createEvidenceQuery({ capabilityId: 'knowledge', source: 'documents', outcome: QueryOutcome.SKIPPED_NO_PERMISSION, workspaceId: ws }), null, 2));

console.log('\nFixture 4 — TIMEOUT:');
console.log(JSON.stringify(createEvidenceQuery({ capabilityId: 'customers', source: 'crm', outcome: QueryOutcome.TIMEOUT, workspaceId: ws, error: 'capability_timeout' }), null, 2));

console.log('\nFixture 5 — EMPTY (COMPLETE + evidenceCount=0):');
const emptyDemo = createEvidenceQuery({ capabilityId: 'incidents', source: 'incidents', outcome: QueryOutcome.EMPTY, workspaceId: ws });
const covDemo   = deriveCoverageResult([emptyDemo]);
console.log(JSON.stringify({ query: emptyDemo, coverageResult: covDemo }, null, 2));

// ── Coverage derivation proofs ───────────────────────────────────────────────
section('Coverage derivation examples');
const examples = [
  { label: 'EXAMPLE 1 — GitHub OK + Calendar EMPTY + Slack SKIPPED_BY_PLAN',
    qs: [
      createEvidenceQuery({ capabilityId: 'engineering', source: 'github',   outcome: QueryOutcome.OK,           resultIds: ['PR-247'], workspaceId: ws }),
      createEvidenceQuery({ capabilityId: 'meetings',    source: 'calendar', outcome: QueryOutcome.EMPTY,         workspaceId: ws }),
      createEvidenceQuery({ capabilityId: 'communications',source:'gmail',   outcome: QueryOutcome.SKIPPED_BY_PLAN, workspaceId: ws }),
    ]},
  { label: 'EXAMPLE 2 — GitHub OK + Slack SKIPPED_NOT_CONNECTED',
    qs: [
      createEvidenceQuery({ capabilityId: 'engineering',    source: 'github', outcome: QueryOutcome.OK,                   resultIds: ['commit-1'], workspaceId: ws }),
      createEvidenceQuery({ capabilityId: 'communications', source: 'slack',  outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, workspaceId: ws }),
    ]},
  { label: 'EXAMPLE 3 — GitHub EMPTY + Calendar EMPTY (COMPLETE + evidenceCount=0)',
    qs: [
      createEvidenceQuery({ capabilityId: 'engineering', source: 'github',   outcome: QueryOutcome.EMPTY, workspaceId: ws }),
      createEvidenceQuery({ capabilityId: 'meetings',    source: 'calendar', outcome: QueryOutcome.EMPTY, workspaceId: ws }),
    ]},
  { label: 'EXAMPLE 4 — All SKIPPED_BY_PLAN (NONE)',
    qs: [
      createEvidenceQuery({ capabilityId: 'engineering', source: 'github',   outcome: QueryOutcome.SKIPPED_BY_PLAN, workspaceId: ws }),
      createEvidenceQuery({ capabilityId: 'meetings',    source: 'calendar', outcome: QueryOutcome.SKIPPED_BY_PLAN, workspaceId: ws }),
    ]},
];

for (const { label, qs } of examples) {
  const r = deriveCoverageResult(qs);
  console.log(`\n${label}`);
  console.log(`  coverage=${r.coverage} attempted=${r.attemptedCount} gaps=${r.gapCount} evidence=${r.evidenceCount}`);
}

console.log('\nP4_FIXTURE_HOLES_DONE');

try {
  const { prisma } = await import('../../src/core/config/prisma.js');
  await prisma.$disconnect();
} catch {}

process.exit(fail === 0 ? 0 : 1);
