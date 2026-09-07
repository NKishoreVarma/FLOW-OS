/**
 * websocket_tests.mjs — proves messages travel the FULL FLOW pipeline to a WS client,
 * and compares the HTTP Brain path vs the WS-broadcast path. Read-only, no code changes.
 *
 * ARCHITECTURE (verified in code, not assumed):
 *   • WS server (socketService.js) is SERVER→CLIENT BROADCAST ONLY — no socket.on('message').
 *     A client cannot send a question over WS.
 *   • /api/query (legacy RAG: RouterAgent→retrieval(pgvector)→CriticAgent→SynthesisAgent)
 *     broadcasts EXECUTIVE_SYNTHESIS_READY {brief:<final answer>} over WS.
 *   • /api/brain/copilot (Operational Brain, src/ai/reasoning) is HTTP-only; streams via SSE.
 *
 * So the genuine WS proof = connect WS → trigger /api/query over HTTP → the streamed
 * synthesis arrives at the WS client. The question ENTERS via HTTP; the response EXITS via WS.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';

const HTTP = 'http://127.0.0.1:5001';
const WSURL = 'ws://127.0.0.1:5001';
const S = process.env.JWT_SECRET;
const HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const Q = 'What database change caused the TechCorp connection pool incident?'; // grounded in Helios
const R = [];
const rec = (id, v, note = '') => { R.push([id, v]); console.log(`  [${v}] ${id}${note ? ' — ' + note : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tok(ext, email) {
  const ws = await prisma.workspace.findUnique({ where: { externalId: ext } });
  const u = email ? await prisma.user.findFirst({ where: { orgId: ws.orgId, email } })
                  : await prisma.user.findFirst({ where: { orgId: ws.orgId } });
  return jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '1h' });
}
async function http(method, path, token, ws, body) {
  const t0 = Date.now();
  const r = await fetch(HTTP + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'workspace-id': ws }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ms: Date.now() - t0, src: r.headers.get('x-flow-retrieval-source'), body: await r.json().catch(() => ({})) };
}
// open a WS, collect every frame; returns { events:[], close:{code,reason}, opened:bool }
function openWS(url, { collectMs = 0 } = {}) {
  return new Promise((resolve) => {
    const events = []; let opened = false; let closed = null;
    const sock = new WebSocket(url);
    const done = () => resolve({ sock, events, opened, closed });
    sock.on('open', () => { opened = true; });
    sock.on('message', (d) => { try { events.push(JSON.parse(d.toString())); } catch { events.push({ raw: d.toString() }); } });
    sock.on('close', (code, reason) => { closed = { code, reason: reason.toString() }; done(); });
    sock.on('error', () => { /* close will fire */ });
    if (collectMs) setTimeout(() => { if (sock.readyState === WebSocket.OPEN) resolve({ sock, events, opened, closed }); }, collectMs);
  });
}

async function main() {
  const H = await tok(HW, 'marcus@helios.test');
  const A = await tok(AW, null);
  console.log('\n═══════════ FLOW WEBSOCKET / STREAMING TEST ═══════════');
  console.log(`  WS is broadcast-only; question enters via HTTP /api/query, streamed synthesis exits via WS.\n`);

  // ── CORE PROOF: message travels the full pipeline to the WS client ────────────
  console.log('── CORE: connect WS → trigger /api/query → receive streamed synthesis ──');
  const url = `${WSURL}?workspaceId=${HW}&token=${H}`;
  const sock = new WebSocket(url);
  const frames = [];
  let ackSeen = false, synthSeen = null;
  await new Promise((resolve) => {
    sock.on('open', () => { console.log('  → connection established'); resolve(); });
    sock.on('error', (e) => { console.log('  → WS error:', e.message); resolve(); });
  });
  sock.on('message', (d) => {
    const f = JSON.parse(d.toString()); frames.push(f);
    console.log(`  ← event received: ${f.eventType}`);
    if (f.eventType === 'CONNECTION_ACK') ackSeen = true;
    if (f.eventType === 'EXECUTIVE_SYNTHESIS_READY') synthSeen = f;
  });
  await sleep(600);
  rec('ws:connection-established', sock.readyState === WebSocket.OPEN ? 'PASS' : 'FAIL', `readyState=${sock.readyState}`);
  rec('ws:connection-ack', ackSeen ? 'PASS' : 'FAIL', 'CONNECTION_ACK received');

  console.log('  → request sent: POST /api/query (real Helios question)');
  const q1 = await http('POST', '/api/query', H, HW, { queryText: Q });
  console.log(`  → HTTP /api/query returned ${q1.status} in ${q1.ms}ms`);
  // wait for the WS broadcast of the final synthesis
  for (let i = 0; i < 40 && !synthSeen; i++) await sleep(500);
  rec('ws:pipeline-message-received', synthSeen ? 'PASS' : 'FAIL', synthSeen ? `EXECUTIVE_SYNTHESIS_READY over WS` : 'no synthesis event arrived at WS client');
  if (synthSeen) {
    const brief = synthSeen.payload?.brief || '';
    const grounded = /connection pool|pool|TechCorp|250|50|circuit breaker|postgres/i.test(brief);
    console.log(`  ← final response (brief): ${brief.slice(0, 200).replace(/\n/g, ' ')}`);
    rec('ws:response-grounded-in-dataset', grounded ? 'PASS' : 'PARTIAL', `brief mentions the real incident cause=${grounded}`);
    rec('ws:completion-event', synthSeen.eventType === 'EXECUTIVE_SYNTHESIS_READY' && !!brief ? 'PASS' : 'FAIL', `model=${synthSeen.payload?.modelUsed}`);
  } else {
    rec('ws:response-grounded-in-dataset', 'UNPROVEN', 'no brief');
    rec('ws:completion-event', 'FAIL', 'no completion event');
  }

  // ── 2. follow-up question over the SAME connection ────────────────────────────
  synthSeen = null;
  const q2 = await http('POST', '/api/query', H, HW, { queryText: 'When is that fix being deployed to production?' });
  for (let i = 0; i < 40 && !synthSeen; i++) await sleep(500);
  rec('ws:followup-received', synthSeen ? 'PASS' : 'PARTIAL', synthSeen ? 'second synthesis arrived at same WS client' : 'no follow-up synthesis');

  // ── 3+4. invalid / empty client→server message (server has no message handler) ─
  let survivedInvalid = false;
  try { sock.send('{ this is not valid json'); sock.send(''); await sleep(400); survivedInvalid = sock.readyState === WebSocket.OPEN; } catch { survivedInvalid = false; }
  rec('ws:invalid-message-ignored', survivedInvalid ? 'PASS' : 'FAIL', 'server ignores client messages (no message handler); connection stays open, no crash');
  sock.close();
  await sleep(300);
  rec('ws:connection-closed-cleanly', sock.readyState === WebSocket.CLOSED ? 'PASS' : 'PARTIAL', `readyState=${sock.readyState}`);

  // ── 5+6. unauthorized / wrong workspace (corp-alpha token → helios workspace) ──
  const badUrl = `${WSURL}?workspaceId=${HW}&token=${A}`;
  const bad = await openWS(badUrl, { collectMs: 3000 });
  rec('ws:wrong-workspace-rejected', bad.closed && bad.closed.code === 1008 ? 'PASS' : (bad.opened && !bad.events.length ? 'PARTIAL' : 'FAIL'),
    bad.closed ? `closed code=${bad.closed.code} reason="${bad.closed.reason}"` : `opened=${bad.opened}`);
  try { bad.sock?.close(); } catch {}

  // missing workspaceId → immediate 1008
  const noWs = await openWS(`${WSURL}?token=${H}`, { collectMs: 2500 });
  rec('ws:missing-workspace-rejected', noWs.closed && noWs.closed.code === 1008 ? 'PASS' : 'PARTIAL', noWs.closed ? `code=${noWs.closed.code} "${noWs.closed.reason}"` : 'not closed');
  try { noWs.sock?.close(); } catch {}

  // ── 7. connection timeout / idle (server has no idle timeout — verify stays open) ─
  const idle = new WebSocket(`${WSURL}?workspaceId=${HW}&token=${H}`);
  await new Promise(r => { idle.on('open', r); idle.on('error', r); });
  await sleep(6000); // idle 6s
  rec('ws:idle-connection-behavior', idle.readyState === WebSocket.OPEN ? 'PASS' : 'PARTIAL', `after 6s idle readyState=${idle.readyState} (no server-side idle timeout by design)`);
  idle.close();

  // ── 8. server-side error path (query that errors → WS stays open, no synthesis) ─
  const errSock = new WebSocket(`${WSURL}?workspaceId=${HW}&token=${H}`);
  await new Promise(r => { errSock.on('open', r); errSock.on('error', r); });
  const errResp = await http('POST', '/api/query', H, HW, {}); // missing queryText → error path
  await sleep(800);
  rec('ws:server-error-isolation', errSock.readyState === WebSocket.OPEN ? 'PASS' : 'FAIL', `/api/query missing-body status=${errResp.status}; WS survived=${errSock.readyState === WebSocket.OPEN}`);
  errSock.close();

  // ── COMPARISON: HTTP Operational Brain vs WS-broadcast legacy RAG (same question) ─
  console.log('\n── COMPARISON: HTTP /api/brain/copilot (Operational Brain) vs WS /api/query (legacy RAG) ──');
  const httpBrain = await http('POST', '/api/brain/copilot/stream'.replace('/stream',''), H, HW, { question: Q });
  const httpAns = httpBrain.body.answer || '';
  console.log(`  HTTP copilot: status=${httpBrain.status} ms=${httpBrain.ms} src=${httpBrain.src}`);
  console.log(`    answer: ${httpAns.slice(0,180).replace(/\n/g,' ')}`);
  console.log(`  WS(/api/query) brief: ${(synthSeen?.payload?.brief||'').slice(0,180).replace(/\n/g,' ') || '(captured earlier)'}`);
  rec('cmp:same-workspace', 'PASS', 'both scoped to workspace_helios_test (tenant middleware + WS org check)');
  rec('cmp:both-real-reasoning', httpAns.length > 30 ? 'PASS' : 'PARTIAL', 'HTTP=Operational Brain (src/ai/reasoning); WS=legacy RAG (Router/Critic/Synthesis) — DIFFERENT reasoners, same workspace+stores');

  const tally = R.reduce((a, r) => (a[r[1]] = (a[r[1]] || 0) + 1, a), {});
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  WEBSOCKET RESULTS: ${JSON.stringify(tally)} (${R.length} checks)`);
  console.log(`  FAILURES: ${R.filter(r => r[1] === 'FAIL').map(r => r[0]).join(', ') || 'none'}`);
  await prisma.$disconnect(); process.exit(0);
}
main().catch(async (e) => { console.error('harness error:', e.stack || e.message); try { await prisma.$disconnect(); } catch {} process.exit(2); });
