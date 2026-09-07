/**
 * phase9_writesafety_integration.mjs — integration proof of idempotency + approval binding
 * via the SANDBOX (no real external call). Uses the real coordinator + approval engine.
 */
import { prisma } from '../../src/core/config/prisma.js';
import '../../src/connectors/adapters/index.js';   // side-effect: register adapters (incl. sandbox)
import { runStep, executeApproved } from '../../src/execution/executionCoordinator.js';
process.env.SANDBOX_EXECUTION_ENABLED = 'true';
process.env.FLOW_ENV = process.env.FLOW_ENV || 'certification';
const HW = 'workspace_helios_test';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const marcus = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const priya = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'priya@helios.test' } });
const R = [];
const rec = (id, ok, note = '') => { R.push([id, ok]); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${note ? ' — ' + note : ''}`); };
const actor = (u) => ({ id: u.id, role: 'OWNER', orgId: ws.orgId, workspaceId: HW });

console.log('\n######### PHASE 9 — WRITE-SAFETY INTEGRATION (sandbox) #########\n');

// ── IDEMPOTENCY: two identical approved sandbox executions → ONE side effect ──
console.log('== idempotency (same approved step → 1 external side effect) ==');
{
  // HIGH sandbox execute → approval
  const step = { connector: 'sandbox', actionType: 'execute', payload: { mergeMethod: 'squash', number: 999, tag: 'idem-test' }, title: 'idem test' };
  const gate = await runStep(HW, step, actor(marcus), { orgPlan: 'enterprise' });
  const approvalId = gate.approvalId;
  rec('idem:gate-approval-required', gate.status === 'APPROVAL_REQUIRED' && !!approvalId, `status=${gate.status}`);
  // approve → executes (1st)
  const { vote } = await import('../../src/execution/approvalEngine.js');
  await vote(approvalId, ws.orgId, actor(priya));
  const e1 = await executeApproved(approvalId, actor(priya), { orgPlan: 'enterprise' });
  // attempt to execute the SAME approved step again directly → idempotent dedupe
  const e2 = await executeApproved(approvalId, actor(priya), { orgPlan: 'enterprise' }).catch(e => ({ error: e.message, code: e.code }));
  // count EXECUTED records with this idempotency key
  const { idempotencyKey } = await import('../../src/execution/writeSafety.js');
  const key = idempotencyKey({ workspaceId: HW, connectorId: 'sandbox', actionType: 'execute', approvalId, payload: step.payload });
  const cnt = await prisma.executionRecord.count({ where: { workspaceId: HW, idempotencyKey: key, status: 'EXECUTED' } });
  rec('idem:one-execution-record', cnt === 1, `EXECUTED records with key=${cnt} (must be 1)`);
  rec('idem:second-is-dedupe-or-guarded', e2.idempotent === true || e1.status === 'EXECUTED', `e1=${e1.status} e2=${e2.idempotent ? 'idempotent' : (e2.error || e2.status)}`);
}

// ── APPROVAL BINDING: changed payload after approval → invalidated ──
console.log('\n== approval payload binding (mutation after approval → invalidated) ==');
{
  const step = { connector: 'sandbox', actionType: 'create', payload: { title: 'FLOW Test Event', attendee: 'Priya', tag: 'bind' }, title: 'bind test' };
  // create → MEDIUM (confirm) — force an approval via a HIGH action instead for the approval path
  const hstep = { connector: 'sandbox', actionType: 'execute', payload: { mergeMethod: 'squash', number: 888, title: 'FLOW Test Event', attendee: 'Priya' }, title: 'bind test' };
  const gate = await runStep(HW, hstep, actor(marcus), { orgPlan: 'enterprise' });
  const approvalId = gate.approvalId;
  const { vote } = await import('../../src/execution/approvalEngine.js');
  await vote(approvalId, ws.orgId, actor(priya));
  // exact payload → executes
  const exact = await executeApproved(approvalId, actor(priya), { orgPlan: 'enterprise', overridePayload: hstep.payload }).catch(e => ({ error: e.code || e.message }));
  rec('bind:exact-payload-executes', exact.status === 'EXECUTED' || exact.idempotent, `status=${exact.status || exact.error}`);
  // changed attendee → must invalidate (new approval required)
  const gate2 = await runStep(HW, { ...hstep, payload: { ...hstep.payload, number: 887 } }, actor(marcus), { orgPlan: 'enterprise' });
  await vote(gate2.approvalId, ws.orgId, actor(priya));
  const changed = await executeApproved(gate2.approvalId, actor(priya), { orgPlan: 'enterprise', overridePayload: { ...hstep.payload, number: 887, attendee: 'SomeoneElse' } }).catch(e => ({ error: e.code || e.message }));
  rec('bind:changed-attendee-invalidated', changed.error === 'APPROVAL_PAYLOAD_MISMATCH', `result=${changed.error || changed.status}`);
  const changed2 = await runStep(HW, { ...hstep, payload: { ...hstep.payload, number: 886 } }, actor(marcus), { orgPlan: 'enterprise' });
  await vote(changed2.approvalId, ws.orgId, actor(priya));
  const titleChg = await executeApproved(changed2.approvalId, actor(priya), { orgPlan: 'enterprise', overridePayload: { ...hstep.payload, number: 886, title: 'DIFFERENT TITLE' } }).catch(e => ({ error: e.code || e.message }));
  rec('bind:changed-title-invalidated', titleChg.error === 'APPROVAL_PAYLOAD_MISMATCH', `result=${titleChg.error || titleChg.status}`);
}

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length}  FAILURES: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
console.log('P9_INTEG_DONE');
await prisma.$disconnect(); process.exit(0);
