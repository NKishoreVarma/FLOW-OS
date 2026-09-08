/**
 * manual_test_setup.mjs — prints ready-to-use JWTs + curl commands so you can drive
 * the governed SANDBOX lifecycle by hand against the ingested Helios world.
 *
 * Run:  node scripts/certification/manual_test_setup.mjs
 * (server must be up on :5001 with SANDBOX_EXECUTION_ENABLED=true)
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';

const S = process.env.JWT_SECRET;
const HW = 'workspace_helios_test';
if (!S) { console.error('JWT_SECRET not set — run with the app env (dotenvx or `node -r`).'); process.exit(1); }

const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const requester = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const approver  = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'priya@helios.test' } });

// Ensure the approver is a workspace ADMIN (idempotent) so votes are accepted.
const wm = await prisma.workspaceMember.findFirst({ where: { userId: approver.id, workspaceId: ws.id } });
if (wm && wm.role !== 'ADMIN' && wm.role !== 'OWNER') await prisma.workspaceMember.update({ where: { id: wm.id }, data: { role: 'ADMIN' } });
else if (!wm) await prisma.workspaceMember.create({ data: { userId: approver.id, workspaceId: ws.id, role: 'ADMIN' } });

const REQ = jwt.sign({ userId: requester.id, email: requester.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '2h' });
const APP = jwt.sign({ userId: approver.id, email: approver.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '2h' });

console.log(`\n════════ MANUAL SANDBOX TEST — Helios ════════`);
console.log(`workspace-id: ${HW}`);
console.log(`\nREQUESTER (marcus)  export TOKEN=${REQ}`);
console.log(`\nAPPROVER  (priya, ADMIN)  export ATOKEN=${APP}`);
console.log(`
──────── 1) propose a governed sandbox action (grounded in PR-251 / HELIOS-448) ────────
curl -s -X POST http://127.0.0.1:5001/api/execution/execute \\
  -H "Authorization: Bearer $TOKEN" -H "workspace-id: ${HW}" -H "Content-Type: application/json" \\
  -d '{"recommendation":{"connector":"sandbox","actionType":"execute","payload":{"mergeMethod":"squash","number":251,"owner":"helios","repo":"helios-platform-api","relatesTo":"HELIOS-448"}},"confirmed":false}'
  →  expect: results[0].status = APPROVAL_REQUIRED, risk = HIGH, approvalId = <id>

──────── 2) approve as the ADMIN → executes through SANDBOX ────────
curl -s -X POST http://127.0.0.1:5001/api/execution/approvals/<approvalId>/vote \\
  -H "Authorization: Bearer $ATOKEN" -H "workspace-id: ${HW}" -H "Content-Type: application/json" -d '{}'
  →  expect: status = APPROVED_AND_EXECUTED, execution.result.result.provider = SANDBOX (external:false)

──────── 3) verify the chain in the DB ────────
psql "$DATABASE_URL" -c "select id,connector,status from execution_records order by created_at desc limit 1;"
psql "$DATABASE_URL" -c "select event_id,priority,source_event_id,metadata->>'executionMode' from flow_events where metadata->>'executionMode'='SANDBOX' order by created_at desc limit 1;"
psql "$DATABASE_URL" -c "select id,type,metadata->>'sourceEventId' from org_memory_records order by created_at desc limit 1;"

──────── governance gates to try ────────
• CRITICAL (two-person): add "base":"main" to the payload → APPROVAL_REQUIRED, requiredApprovals = 2
• fail-closed: same call with workspace-id of a DEV workspace → never EXECUTED
• false-success: connector "gmail"/"github" send/merge → APPROVAL_REQUIRED, never a real receipt
`);
await prisma.$disconnect();
process.exit(0);
