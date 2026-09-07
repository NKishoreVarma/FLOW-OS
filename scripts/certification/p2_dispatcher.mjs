/**
 * p2_dispatcher.mjs — live proof that dispatchWithEvidence emits correct EvidenceQuery
 * outcomes, on a throwaway workspace (Helios/pilot untouched). Shows RAW EvidenceQuery
 * structures. Covers: OK, EMPTY, SKIPPED_BY_PLAN live; P/Q (nothing disappears);
 * M/N (workspace authority); live freshness. FAILED/TIMEOUT/SKIPPED_* mapping is unit-tested.
 */
import { prisma } from '../../src/core/config/prisma.js';
import { query } from '../../src/config/db.js';
import { dispatchWithEvidence } from '../../src/ai/reasoning/CapabilityDispatcher.js';
import { Capability } from '../../src/ai/reasoning/CapabilityPlanner.js';
import { createEvidenceQuery, QueryOutcome, Freshness } from '../../src/contracts/evidence.js';

const R = []; const rec = (id, ok, note='') => { const v = typeof ok==='boolean'?(ok?'PASS':'FAIL'):ok; R.push([id,v]); console.log(`  [${v}] ${id}${note?' — '+note:''}`); };

const org = await prisma.organization.create({ data:{ name:'p2 disp', slug:`p2-disp-${Date.now()}`, plan:'enterprise' }});
const WS = `p2_disp_ws_${Date.now()}`;
const dws = await prisma.workspace.create({ data:{ name:'p2 disp ws', orgId:org.id, externalId:WS }});
// Seed: one USER node (people → OK) ; no INCIDENT (→ EMPTY) ; a recent github sync (freshness CURRENT)
const userNodeId = `${WS}:user:seed:alice`;
await query(`INSERT INTO graph_nodes (id, workspace_id, org_id, type, name, metadata, created_at, updated_at, last_observed_at) VALUES ($1,$2,$3,'USER','Alice Seed','{}',NOW(),NOW(),NOW())`, [userNodeId, WS, org.id]).catch(e=>console.log('seed node err', e.message));
await query(`INSERT INTO sync_state (id, workspace_id, connector_id, resource_type, cursor, last_sync_at, status) VALUES (gen_random_uuid()::text,$1,'github','default',null,NOW(),'ok')`, [WS]).catch(e=>console.log('seed sync err', e.message));

console.log('\n######### P2 — DISPATCHER OUTCOMES (live) #########\n');

const plan = { capabilities: [ {capability:'people',limit:10}, {capability:'incidents',limit:10}, {capability:'engineering',limit:10} ], allowedConnectors: [], forbiddenConnectors: [] };
const intent = { question: 'who is on the team', domain: 'people', timeframe: 'all' };

const { results, queries } = await dispatchWithEvidence(WS, plan, intent);
const byCap = Object.fromEntries(queries.map(q => [q.capabilityId, q]));

// P: every planned capability emits exactly one query
rec('P:planned-each-one-query', ['people','incidents','engineering'].every(c => queries.filter(q=>q.capabilityId===c).length===1));
// Q: nothing disappears — union of planned + skipped == all capabilities
const allCaps = new Set(Object.values(Capability));
const emitted = new Set(queries.map(q=>q.capabilityId));
rec('Q:no-capability-disappears', [...allCaps].every(c => emitted.has(c)), `emitted ${emitted.size}/${allCaps.size}`);
// OK + EMPTY distinct + resultIds
rec('OK:people-has-resultIds', byCap.people?.outcome===QueryOutcome.OK && byCap.people.resultIds.includes(userNodeId), `people outcome=${byCap.people?.outcome} ids=${JSON.stringify(byCap.people?.resultIds)}`);
rec('EMPTY:incidents', byCap.incidents?.outcome===QueryOutcome.EMPTY && byCap.incidents.resultIds.length===0, `incidents outcome=${byCap.incidents?.outcome}`);
rec('SKIPPED_BY_PLAN:unplanned', byCap.customers?.outcome===QueryOutcome.SKIPPED_BY_PLAN, `customers outcome=${byCap.customers?.outcome}`);
// freshness: engineering (github synced now) → CURRENT ; internal people → UNKNOWN
rec('freshness:engineering-CURRENT', byCap.engineering?.freshness===Freshness.CURRENT, `engineering freshness=${byCap.engineering?.freshness}`);
rec('freshness:people-UNKNOWN', byCap.people?.freshness===Freshness.UNKNOWN, `people freshness=${byCap.people?.freshness}`);
// M: every query carries the trusted workspace
rec('M:workspace-authority', queries.every(q => q.workspaceId===WS));

// N: a rogue workspaceId in plan/intent CANNOT override the trusted arg
const evilPlan = { ...plan, workspaceId: 'workspace_EVIL' };
const evilIntent = { ...intent, workspaceId: 'workspace_EVIL' };
const evil = await dispatchWithEvidence(WS, evilPlan, evilIntent);
rec('N:llm-payload-cannot-override-workspace', evil.queries.every(q => q.workspaceId===WS), 'trusted arg wins over payload workspaceId');

// ── RAW EvidenceQuery examples (requirement) ────────────────────────────────
console.log('\n── RAW EvidenceQuery examples ──');
console.log('OK           :', JSON.stringify(byCap.people));
console.log('EMPTY        :', JSON.stringify(byCap.incidents));
console.log('SKIPPED_BY_PLAN:', JSON.stringify(byCap.customers));
// constructed (unit-tested mappings) for the states not reproducible on a clean throwaway
console.log('FAILED       :', JSON.stringify(createEvidenceQuery({ capabilityId:'engineering', source:'github', outcome:QueryOutcome.FAILED, freshness:Freshness.UNKNOWN, workspaceId:WS, error:'capability_error' })));
console.log('TIMEOUT      :', JSON.stringify(createEvidenceQuery({ capabilityId:'engineering', source:'github', outcome:QueryOutcome.TIMEOUT, freshness:Freshness.UNKNOWN, workspaceId:WS, error:'capability_timeout' })));
console.log('SKIPPED_NOT_CONNECTED:', JSON.stringify(createEvidenceQuery({ capabilityId:'communications', source:'gmail', outcome:QueryOutcome.SKIPPED_NOT_CONNECTED, freshness:Freshness.UNKNOWN, workspaceId:WS })));
console.log('SKIPPED_NO_PERMISSION:', JSON.stringify(createEvidenceQuery({ capabilityId:'communications', source:'slack', outcome:QueryOutcome.SKIPPED_NO_PERMISSION, freshness:Freshness.UNKNOWN, workspaceId:WS })));

// cleanup + isolation
await query(`DELETE FROM graph_nodes WHERE workspace_id=$1`, [WS]).catch(()=>{});
await query(`DELETE FROM sync_state WHERE workspace_id=$1`, [WS]).catch(()=>{});
await prisma.workspace.delete({ where:{ id:dws.id }}).catch(()=>{});
await prisma.organization.delete({ where:{ id:org.id }}).catch(()=>{});
const helios = await query(`SELECT count(*)::int c FROM flow_events WHERE workspace_id='workspace_helios_test'`).then(r=>r.rows[0].c);
rec('isolation:helios-untouched', helios===169, `helios flow_events=${helios}`);

const pass=R.filter(x=>x[1]==='PASS').length, fail=R.filter(x=>x[1]==='FAIL').length;
console.log(`\n═══ PASS=${pass} FAIL=${fail} FAILURES: ${R.filter(x=>x[1]==='FAIL').map(x=>x[0]).join(', ')||'none'} ═══`);
console.log('P2_DISPATCHER_DONE');
await prisma.$disconnect(); process.exit(fail===0?0:1);
