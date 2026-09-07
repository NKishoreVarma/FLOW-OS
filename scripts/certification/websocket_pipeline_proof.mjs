/**
 * websocket_pipeline_proof.mjs — proves a REAL pipeline message travels end-to-end to
 * a WS client, using an UNGATED pipeline: a governed sandbox execution, whose
 * executeAction() calls broadcastToWorkspace(ws, 'ACTION_EXECUTED', …).
 *
 * (The /api/query synthesis broadcast is blocked for the ingested cert workspace by the
 * ≥3-live-connector readiness gate — documented separately. This proof does not need it.)
 *
 * Flow proven:  WS client connects → HTTP triggers governed execution → executeAction
 * runs → broadcastToWorkspace('ACTION_EXECUTED') → the WS client receives the event.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';

const HTTP = 'http://127.0.0.1:5001', WSURL = 'ws://127.0.0.1:5001', S = process.env.JWT_SECRET;
const HW = 'workspace_helios_test';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const req = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const app = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'priya@helios.test' } });
const REQ = jwt.sign({ userId: req.id, email: req.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '1h' });
const APP = jwt.sign({ userId: app.id, email: app.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '1h' });
const H = (m, p, t, b) => fetch(HTTP + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, 'workspace-id': HW }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

console.log('\n═══ WS PIPELINE PROOF — real message → WS client (via governed execution) ═══\n');
const sock = new WebSocket(`${WSURL}?workspaceId=${HW}&token=${REQ}`);
const frames = [];
await new Promise(r => { sock.on('open', r); sock.on('error', r); });
console.log('  → WS connection established');
sock.on('message', d => { const f = JSON.parse(d.toString()); frames.push(f); console.log(`  ← WS event: ${f.eventType}${f.eventType === 'ACTION_EXECUTED' ? '  payload=' + JSON.stringify(f.payload).slice(0, 160) : ''}`); });
await sleep(500);

// Trigger the governed sandbox lifecycle (LOW-risk read auto-executes and broadcasts;
// but sandbox read returns []; use a MEDIUM 'create' confirmed, which executes and broadcasts).
console.log('  → HTTP: propose sandbox action (execute) …');
const e = await H('POST', '/api/execution/execute', REQ, { recommendation: { connector: 'sandbox', actionType: 'execute', payload: { mergeMethod: 'squash', number: 251, owner: 'helios', repo: 'helios-platform-api' } }, confirmed: false });
const step = e.body.results?.[0] || {};
console.log(`  → status=${step.status} approvalId=${step.approvalId}`);
let executed = false;
if (step.approvalId) {
  console.log('  → HTTP: approve as ADMIN → executes through SANDBOX (broadcasts ACTION_EXECUTED) …');
  const v = await H('POST', `/api/execution/approvals/${step.approvalId}/vote`, APP, {});
  executed = v.body.status === 'APPROVED_AND_EXECUTED';
  console.log(`  → vote=${v.body.status}`);
}
// wait for the ACTION_EXECUTED broadcast to arrive at the WS client
let got = null;
for (let i = 0; i < 20 && !got; i++) { await sleep(400); got = frames.find(f => f.eventType === 'ACTION_EXECUTED'); }

console.log(`\n─────────────────────────────────────`);
console.log(`  [${sock.readyState === WebSocket.OPEN ? 'PASS' : 'FAIL'}] ws:connected`);
console.log(`  [${frames.some(f => f.eventType === 'CONNECTION_ACK') ? 'PASS' : 'FAIL'}] ws:connection-ack`);
console.log(`  [${executed ? 'PASS' : 'FAIL'}] pipeline:sandbox-executed (governed)`);
console.log(`  [${got ? 'PASS' : 'FAIL'}] ws:ACTION_EXECUTED-reached-client  ← the real pipeline message travelled to the WS client`);
if (got) console.log(`  proof frame: ${JSON.stringify(got).slice(0, 220)}`);
sock.close();
await prisma.$disconnect();
process.exit(0);
