/**
 * phase8_action_cert.mjs — CONNECTOR/ACTION certification via the governed SANDBOX on
 * Helios. Strict governance: no write auto-executes; every side-effect hits its risk-tier
 * gate; approvals go through the real Approval Engine (distinct approvers for CRITICAL).
 * Verifies the full lifecycle in the DB. No external API is ever contacted.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
async function tok(email, ext = HW) { const w = await prisma.workspace.findUnique({ where: { externalId: ext } }); const u = await prisma.user.findFirst({ where: { orgId: w.orgId, email } }); return jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: w.orgId }, S, { expiresIn: '1h' }); }
const requester = await tok('marcus@helios.test');
const approver1 = await tok('priya@helios.test');
const approver2 = await tok('aditya@helios.test');
const alphaTok  = await tok((await prisma.user.findFirst({ where: { orgId: (await prisma.workspace.findUnique({ where: { externalId: AW } })).orgId } })).email, AW);
const R = [];
const rec = (id, ok, note = '') => { R.push([id, ok]); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${note ? ' — ' + note : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(method, path, t, wsid, body) { const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, 'workspace-id': wsid }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; }
const exec = (rec_, t, wsid = HW, confirmed = false) => j('POST', '/api/execution/execute', t, wsid, { recommendation: rec_, confirmed });
const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);

console.log('\n######### PHASE 8 — SANDBOX ACTION CERTIFICATION (Helios, strict) #########\n');

// ── 1. RISK TIERS: each side-effect hits its correct gate; nothing auto-executes ──
console.log('== risk-tier gates (strict: no write auto-executes) ==');
const tiers = [
  ['LOW read', { connector: 'sandbox', actionType: 'read', payload: {} }, ['EXECUTED', 'FAILED']],          // read is LOW → may auto (no side effect)
  ['MEDIUM create', { connector: 'sandbox', actionType: 'create', payload: { title: 'x' } }, ['CONFIRM_REQUIRED']],
  ['HIGH execute', { connector: 'sandbox', actionType: 'execute', payload: { mergeMethod: 'squash', number: 251 } }, ['APPROVAL_REQUIRED']],
  ['CRITICAL merge-main', { connector: 'sandbox', actionType: 'execute', payload: { mergeMethod: 'squash', base: 'main', number: 251 } }, ['APPROVAL_REQUIRED']],
];
let highApprovalId = null, critApprovalId = null;
for (const [label, rec_, allowed] of tiers) {
  const r = await exec(rec_, requester);
  const st = r.body.results?.[0] || {};
  const ok = allowed.includes(st.status) && st.status !== 'EXECUTED' || (label.startsWith('LOW') && ['EXECUTED', 'FAILED'].includes(st.status));
  rec(`tier:${label}`, allowed.includes(st.status), `status=${st.status} risk=${st.risk} approvals=${st.requiredApprovals || '-'}`);
  if (label.startsWith('HIGH')) highApprovalId = st.approvalId;
  if (label.startsWith('CRITICAL')) { critApprovalId = st.approvalId; rec('tier:CRITICAL-two-person', st.requiredApprovals === 2, `requiredApprovals=${st.requiredApprovals}`); }
}

// ── 2. FULL LIFECYCLE: HIGH action → 1 approver → execute → receipt → event → memory ──
console.log('\n== full lifecycle (HIGH, 1 approver) ==');
let execId = null, receiptId = null, eventId = null, memoryId = null;
if (highApprovalId) {
  const vote = await j('POST', `/api/execution/approvals/${highApprovalId}/vote`, approver1, HW, {});
  const executed = vote.body.execution || {};
  const receipt = executed.result?.result || {};
  execId = executed.record?.id; receiptId = receipt.receiptId;
  rec('life:approved-executed', vote.body.status === 'APPROVED_AND_EXECUTED' && executed.status === 'EXECUTED', `voteStatus=${vote.body.status}`);
  rec('life:sandbox-receipt-labeled', receipt.executionMode === 'SANDBOX' && receipt.provider === 'SANDBOX' && receipt.receiptType === 'SANDBOX' && receipt.external === false, `mode=${receipt.executionMode} external=${receipt.external}`);
  rec('life:no-real-provider-receipt', receipt.isRealProviderReceipt === false && receipt.contactedExternalApi === false, `contactedExternalApi=${receipt.contactedExternalApi}`);
  // execution_record
  const dbRec = execId ? (await q(`SELECT status, connector FROM execution_records WHERE id=$1`, execId))[0] : null;
  rec('life:execution-record', dbRec?.status === 'EXECUTED' && dbRec?.connector === 'sandbox', `db.status=${dbRec?.status}`);
  // event
  for (let i = 0; i < 8 && !eventId; i++) { await sleep(1000); const ev = (await q(`SELECT event_id, priority, metadata FROM flow_events WHERE workspace_id=$1 AND (source_event_id=$2 OR metadata->>'executionId'=$2) ORDER BY created_at DESC LIMIT 1`, HW, execId))[0]; if (ev) { eventId = ev.event_id; rec('life:event-generated', ev.metadata?.executionMode === 'SANDBOX', `priority=${ev.priority} mode=${ev.metadata?.executionMode}`); } }
  if (!eventId) rec('life:event-generated', false, 'no event');
  // memory
  for (let i = 0; i < 10 && !memoryId; i++) { await sleep(1200); const m = (await q(`SELECT id, metadata FROM org_memory_records WHERE workspace_id=$1 AND (metadata->>'sourceEventId'=$2 OR metadata->>'eventId'=$3) ORDER BY created_at DESC LIMIT 1`, HW, execId, eventId || '∅'))[0]; if (m) { memoryId = m.id; rec('life:memory-generated', true, `memoryId=${m.id}`); } }
  if (!memoryId) rec('life:memory-generated', false, 'no memory (priority-gated)');
}

// ── 3. CRITICAL two-person: 1 vote insufficient, 2 distinct votes execute; self-approval blocked ──
console.log('\n== CRITICAL two-person + self-approval guard ==');
if (critApprovalId) {
  const self = await j('POST', `/api/execution/approvals/${critApprovalId}/vote`, requester, HW, {});   // requester self-approve → blocked
  rec('crit:self-approval-blocked', self.status >= 400 || self.body.status === 'PENDING', `status=${self.status} ${self.body.error?.message || self.body.status || ''}`.slice(0, 80));
  const v1 = await j('POST', `/api/execution/approvals/${critApprovalId}/vote`, approver1, HW, {});
  rec('crit:one-vote-insufficient', v1.body.status === 'PENDING', `after 1 vote: ${v1.body.status} remaining=${v1.body.remaining}`);
  const v2 = await j('POST', `/api/execution/approvals/${critApprovalId}/vote`, approver2, HW, {});
  rec('crit:two-distinct-executes', v2.body.status === 'APPROVED_AND_EXECUTED', `after 2 distinct votes: ${v2.body.status}`);
}

// ── 4. GOVERNANCE INVARIANTS: no write EXECUTED without approval; fail-closed on dev ──
console.log('\n== governance invariants ==');
const noBypass = Number((await q(`SELECT count(*)::int c FROM execution_records WHERE workspace_id=$1 AND connector IN ('github','gmail','slack','jira') AND status='EXECUTED' AND created_at > now() - interval '10 minutes'`, HW))[0].c);
rec('gov:no-real-provider-executed', noBypass === 0, `real-provider EXECUTED in 10m=${noBypass}`);
const devSandbox = await exec({ connector: 'sandbox', actionType: 'execute', payload: { title: 'x' } }, alphaTok, AW, true);
const ds = devSandbox.body.results?.[0] || {};
rec('gov:sandbox-fail-closed-on-dev', ds.status !== 'EXECUTED', `dev sandbox status=${ds.status} (must not EXECUTE)`);

// ── 5. NO EXTERNAL API: sandbox receipts only; zero real-provider receipts this run ──
console.log('\n== provider honesty ==');
const sandboxExecs = Number((await q(`SELECT count(*)::int c FROM execution_records WHERE workspace_id=$1 AND connector='sandbox' AND status='EXECUTED' AND created_at > now() - interval '10 minutes'`, HW))[0].c);
rec('honesty:sandbox-executions-exist', sandboxExecs >= 2, `sandbox EXECUTED=${sandboxExecs}`);

console.log(`\n─── provenance chain (HIGH lifecycle) ───`);
console.log(`  executionId=${execId}\n  receiptId=${receiptId}\n  eventId=${eventId}\n  memoryId=${memoryId}`);

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length}  FAILURES: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
console.log('PHASE8_DONE');
await prisma.$disconnect(); process.exit(0);
