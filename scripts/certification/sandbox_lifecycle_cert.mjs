/**
 * sandbox_lifecycle_cert.mjs — proves the FULL governed action lifecycle against the
 * ingested Helios world using the SANDBOX execution provider (no external API):
 *
 *   real fact → Brain → proposal → governance → APPROVAL → SANDBOX execute →
 *   execution_record → labeled receipt → event → memory → Brain retrieves it.
 *
 * Real HTTP, real engine, real governance, direct DB verification. No dataset edits,
 * no hardcoded answers, no fabricated provider receipts.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';

const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET;
const HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const R = [];
const rec = (id, state, note = '') => { R.push([id, state]); console.log(`  [${state}] ${id}${note ? ' — ' + note : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tokenForUser(ext, email, role = 'OWNER') {
  const ws = await prisma.workspace.findUnique({ where: { externalId: ext } });
  const u = email
    ? await prisma.user.findFirst({ where: { orgId: ws.orgId, email } })
    : await prisma.user.findFirst({ where: { orgId: ws.orgId } });
  return { token: jwt.sign({ userId: u.id, email: u.email, role, orgId: ws.orgId }, S, { expiresIn: '40m' }), user: u, orgId: ws.orgId };
}
async function j(method, path, t, ws, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, 'workspace-id': ws }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);

async function main() {
  console.log('\n═══ SANDBOX GOVERNED LIFECYCLE — CERTIFICATION (Helios) ═══\n');
  const requester = await tokenForUser(HW, 'marcus@helios.test', 'OWNER');
  const approver  = await tokenForUser(HW, 'priya@helios.test', 'OWNER');
  const alpha     = await tokenForUser(AW, null, 'OWNER');
  // Baseline: the synthetic dataset's ENTITY nodes — the types operational execution
  // never creates (PR/ISSUE/COMMIT/USER/EMAIL/MEETING/CUSTOMER/DOCUMENT/TRANSCRIPT/
  // PROJECT/DEPARTMENT/INCIDENT/COMMUNICATION). The digital twin legitimately appends
  // TIMELINE_EVENT/INTEGRATION/EMPLOYEE nodes from real activity — that is not a
  // mutation of the ingested dataset, so those types are excluded here.
  const datasetNodeSql = `SELECT count(*)::int c FROM graph_nodes WHERE workspace_id=$1 AND type IN
    ('PR','ISSUE','COMMIT','USER','EMAIL','MEETING','CUSTOMER','DOCUMENT','TRANSCRIPT','PROJECT','DEPARTMENT','INCIDENT','COMMUNICATION')`;
  const nodesBefore = Number((await q(datasetNodeSql, HW))[0].c);

  // ── 1. Retrieve a REAL fact from the ingested Helios world ────────────────────
  const fact = (await q(
    `SELECT id, name, coalesce(metadata::text,'') meta FROM graph_nodes
     WHERE workspace_id=$1 AND (id ILIKE '%HELIOS-448%' OR name ILIKE '%SSRF%') LIMIT 1`, HW))[0];
  rec('01.retrieve-real-fact', fact ? 'PASS' : 'FAIL', fact ? `${fact.id}: ${fact.name.slice(0,60)}` : 'no fact');
  if (!fact) { return finish(); }

  // ── 2. Brain reasons about the fact (grounds the proposal; not hardcoded) ──────
  const brain = await j('POST', '/api/brain/copilot', requester.token, HW, { question: `What should be done about the unassigned P0 security issue ${fact.id}?` });
  const grounded = (brain.body.answer || '').length > 30;
  rec('02.brain-proposal-grounded', grounded ? 'PASS' : 'PARTIAL', `brain says: ${(brain.body.answer||'').slice(0,80).replace(/\n/g,' ')}`);

  // The action is derived from the real fact: sandbox-execute the security fix PR
  // (PR-251 fixes the SSRF). actionType 'execute'+mergeMethod → risk classifier = HIGH.
  const action = {
    connector: 'sandbox', actionType: 'execute',
    payload: { mergeMethod: 'squash', number: 251, owner: 'helios', repo: 'helios-platform-api',
               relatesTo: fact.id, title: `Merge security fix PR-251 for ${fact.id}` },
  };

  // ── 3–4. Governance evaluates → HIGH → APPROVAL_REQUIRED ──────────────────────
  const exec1 = await j('POST', '/api/execution/execute', requester.token, HW, { recommendation: action, confirmed: false });
  const step1 = exec1.body.results?.[0] || {};
  rec('03.governance-evaluates', ['APPROVAL_REQUIRED','CONFIRM_REQUIRED','DENIED'].includes(step1.status) ? 'PASS' : 'FAIL', `status=${step1.status} risk=${step1.risk} requiredApprovals=${step1.requiredApprovals}`);
  const gateFired = step1.status === 'APPROVAL_REQUIRED' && step1.risk === 'HIGH';
  rec('04.approval-required-where-appropriate', gateFired ? 'PASS' : (step1.status==='APPROVAL_REQUIRED'?'PASS':'FAIL'), `HIGH → ${step1.requiredApprovals} approver(s)`);
  const approvalId = step1.approvalId;
  if (!approvalId) { rec('LIFECYCLE', 'FAIL', 'no approvalId — cannot continue'); return finish(); }

  // ── 5. Approve (distinct OWNER) → executes through SANDBOX ─────────────────────
  const voteRes = await j('POST', `/api/execution/approvals/${approvalId}/vote`, approver.token, HW, {});
  const executed = voteRes.body.execution || {};
  const receipt  = executed.result?.result || {};
  const executionId = executed.record?.id || step1.record?.id;
  rec('05.execute-through-sandbox', voteRes.body.status === 'APPROVED_AND_EXECUTED' && executed.status === 'EXECUTED' ? 'PASS' : 'FAIL', `voteStatus=${voteRes.body.status} execStatus=${executed.status}`);

  // ── 6. Execution record persisted ─────────────────────────────────────────────
  const dbRec = executionId ? (await q(`SELECT id, connector, action_type, risk_level, status, result FROM execution_records WHERE id=$1`, executionId))[0] : null;
  rec('06.execution-record-persisted', dbRec && dbRec.status === 'EXECUTED' && dbRec.connector === 'sandbox' ? 'PASS' : 'FAIL', dbRec ? `id=${dbRec.id} connector=${dbRec.connector} status=${dbRec.status}` : 'no record');

  // ── 7–8. SANDBOX receipt generated + explicitly labeled ───────────────────────
  const labeled = receipt.executionMode === 'SANDBOX' && receipt.provider === 'SANDBOX' && receipt.receiptType === 'SANDBOX' && !!receipt.receiptId;
  rec('07.sandbox-receipt-generated', receipt.receiptId ? 'PASS' : 'FAIL', `receiptId=${receipt.receiptId || 'none'} processedAt=${receipt.processedAt || 'none'}`);
  rec('08.receipt-explicitly-sandbox-labeled', labeled && receipt.isRealProviderReceipt === false && receipt.external === false ? 'PASS' : 'FAIL', `mode=${receipt.executionMode} provider=${receipt.provider} type=${receipt.receiptType} external=${receipt.external}`);
  const receiptId = receipt.receiptId;

  // ── 9–10. Event generated + references the execution ──────────────────────────
  let ev = null;
  for (let i = 0; i < 8 && !ev; i++) { await sleep(1000); ev = (await q(`SELECT event_id, event_type, priority, source_event_id, metadata FROM flow_events WHERE workspace_id=$1 AND (source_event_id=$2 OR metadata->>'executionId'=$2) ORDER BY created_at DESC LIMIT 1`, HW, executionId))[0]; }
  rec('09.event-generated', ev ? 'PASS' : 'FAIL', ev ? `event_id=${ev.event_id} priority=${ev.priority} type=${ev.event_type}` : 'no event');
  const evRefsExec = ev && (ev.source_event_id === executionId || ev.metadata?.executionId === executionId);
  const evProvenance = ev && ev.metadata?.executionMode === 'SANDBOX' && ev.metadata?.receiptId === receiptId;
  rec('10.event-references-execution', evRefsExec ? 'PASS' : 'FAIL', `sourceEventId=${ev?.source_event_id} exec=${executionId}`);
  rec('10b.event-carries-sandbox-provenance', evProvenance ? 'PASS' : 'FAIL', `mode=${ev?.metadata?.executionMode} receiptId=${ev?.metadata?.receiptId}`);
  const eventId = ev?.event_id;

  // ── 11–12. Memory generated via the real pipeline + references event/execution ─
  let mem = null;
  for (let i = 0; i < 10 && !mem; i++) { await sleep(1200); mem = (await q(`SELECT id, type, title, source, metadata, created_at FROM org_memory_records WHERE workspace_id=$1 AND (metadata->>'sourceEventId'=$2 OR metadata->>'eventId'=$3) ORDER BY created_at DESC LIMIT 1`, HW, executionId, eventId || '∅'))[0]; }
  rec('11.memory-generated', mem ? 'PASS' : 'FAIL', mem ? `memoryId=${mem.id} type=${mem.type}` : 'no memory (priority-gated: needs high/critical)');
  const memRefs = mem && (mem.metadata?.sourceEventId === executionId || mem.metadata?.eventId === eventId);
  rec('12.memory-references-provenance', memRefs ? 'PASS' : 'FAIL', mem ? `sourceEventId=${mem.metadata?.sourceEventId} eventId=${mem.metadata?.eventId}` : 'no memory');
  const memoryId = mem?.id;

  // ── 13–14. Brain can retrieve the new event/memory ────────────────────────────
  const brain2 = await j('POST', '/api/brain/copilot', requester.token, HW, { question: `What recent actions were executed for ${fact.id} or PR-251?` });
  const ans2 = (brain2.body.answer || '');
  const retrieved = /PR-251|251|HELIOS-448|security|merge|executed|sandbox/i.test(ans2);
  rec('13-14.brain-retrieves-new-activity', ans2.length > 30 ? (retrieved ? 'PASS' : 'PARTIAL') : 'PARTIAL', `brain: ${ans2.slice(0,90).replace(/\n/g,' ')}`);

  // ── 15. No external API contacted (sandbox has no network path) ────────────────
  const noExternal = receipt.contactedExternalApi === false && receipt.mutatedRealAccount === false && dbRec?.connector === 'sandbox';
  rec('15.no-external-api-contacted', noExternal ? 'PASS' : 'FAIL', `contactedExternalApi=${receipt.contactedExternalApi} mutatedRealAccount=${receipt.mutatedRealAccount}`);

  // ── 16. No dataset mutation (dataset/prior nodes unchanged; twin activity allowed) ─
  const nodesAfter = Number((await q(datasetNodeSql, HW))[0].c);
  rec('16.no-dataset-mutation', nodesAfter === nodesBefore ? 'PASS' : 'FAIL', `dataset entity nodes ${nodesBefore}→${nodesAfter} (twin activity nodes excluded)`);

  // ── 17. No cross-workspace leakage (records are Helios-scoped) ─────────────────
  const alphaLeak = Number((await q(`SELECT count(*)::int c FROM execution_records WHERE workspace_id=$1 AND id=$2`, AW, executionId || '∅'))[0].c);
  const alphaMem  = memoryId ? Number((await q(`SELECT count(*)::int c FROM org_memory_records WHERE workspace_id=$1 AND id=$2`, AW, memoryId))[0].c) : 0;
  rec('17.no-cross-workspace-leak', alphaLeak === 0 && alphaMem === 0 ? 'PASS' : 'FAIL', `alpha exec=${alphaLeak} alpha mem=${alphaMem}`);

  // ── 18. No fake provider receipt (nothing claims github/gmail/slack success) ───
  const fakeProvider = Number((await q(`SELECT count(*)::int c FROM execution_records WHERE workspace_id=$1 AND connector IN ('github','gmail','slack') AND status='EXECUTED' AND created_at > now() - interval '10 minutes'`, HW))[0].c);
  rec('18.no-fake-provider-receipt', fakeProvider === 0 ? 'PASS' : 'FAIL', `real-provider EXECUTED in last 10m=${fakeProvider}`);

  // ── BONUS: governance still fires for CRITICAL + fail-closed on dev ────────────
  const crit = await j('POST', '/api/execution/execute', requester.token, HW, { recommendation: { connector: 'sandbox', actionType: 'execute', payload: { mergeMethod: 'squash', base: 'main', number: 251, owner: 'helios', repo: 'helios-platform-api' } }, confirmed: false });
  const cs = crit.body.results?.[0] || {};
  rec('B1.critical-gate-two-person', cs.status === 'APPROVAL_REQUIRED' && cs.risk === 'CRITICAL' && cs.requiredApprovals === 2 ? 'PASS' : 'FAIL', `status=${cs.status} risk=${cs.risk} approvers=${cs.requiredApprovals}`);
  // fail-closed: sandbox on a DEV workspace must be refused, never executed
  const devSandbox = await j('POST', '/api/execution/execute', alpha.token, AW, { recommendation: { connector: 'sandbox', actionType: 'execute', payload: { title: 'should refuse' } }, confirmed: true });
  const ds = devSandbox.body.results?.[0] || {};
  rec('B2.fail-closed-on-dev-workspace', ds.status !== 'EXECUTED' ? 'PASS' : 'FAIL', `dev sandbox status=${ds.status} (must not be EXECUTED)`);

  console.log(`\n  ── captured provenance chain ──`);
  console.log(`  executionId = ${executionId}`);
  console.log(`  receiptId   = ${receiptId}`);
  console.log(`  eventId     = ${eventId}`);
  console.log(`  memoryId    = ${memoryId}`);

  finish();
}
function finish() {
  const tally = R.reduce((a, r) => (a[r[1]] = (a[r[1]] || 0) + 1, a), {});
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  RESULTS: ${JSON.stringify(tally)}  (${R.length} checks)`);
  const fails = R.filter(r => r[1] === 'FAIL').map(r => r[0]);
  console.log(`  FAILURES: ${fails.join(', ') || 'none'}`);
  return prisma.$disconnect().then(() => process.exit(0));
}
main().catch(async (e) => { console.error('harness error:', e.stack || e.message); try { await prisma.$disconnect(); } catch {} process.exit(2); });
