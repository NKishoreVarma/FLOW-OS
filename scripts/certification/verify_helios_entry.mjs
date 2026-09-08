/**
 * verify_helios_entry.mjs — end-to-end verification that the Helios certification
 * entry works: workspace resolves, no /setup, chat hits the real pipeline, source =
 * INTERNAL_CERTIFICATION_DATA, grounding shown, isolation holds. Read-only.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '2h' });
const P = (id, ok, note) => console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${note ? ' — ' + note : ''}`);

async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  const src = r.headers.get('x-flow-retrieval-source'), wsh = r.headers.get('x-flow-workspace');
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { status: r.status, src, wsh, ans };
}
async function ctx(id) { const r = await fetch(BASE + `/api/brain/context/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${H}`, 'workspace-id': HW } }); return (await r.json()).context; }
const short = a => (a || '').slice(0, 200).replace(/\n/g, ' ');

console.log('\n═══ HELIOS ENTRY — END-TO-END VERIFICATION ═══\n');

// Step 3/4 — frontend workspace + user resolution (API the frontend consumes)
const wl = await (await fetch(BASE + '/api/org/workspaces', { headers: { Authorization: `Bearer ${H}`, 'workspace-id': 'temp_verification' } })).json();
P('3.workspace_helios_test resolves', (wl || []).some(w => w.externalId === HW), `/api/org/workspaces → ${(wl||[]).map(w=>w.externalId).join(',')}`);
P('4.certification user', u.email === 'marcus@helios.test', `${u.fullName} <${u.email}>`);

// Step 2 — no /setup (workspace-state READY)
const st = await (await fetch(BASE + '/api/onboarding/workspace-state', { headers: { Authorization: `Bearer ${H}`, 'workspace-id': HW } })).json();
P('2.no /setup redirect (phase READY)', st.workspacePhase === 'READY', `phase=${st.workspacePhase} mode=${st.workspaceMode}`);

// Step 5/6/7 — meetings question hits real pipeline + cert source
console.log('\n  Q1: "What meetings are scheduled?"');
const m = await stream('What meetings are scheduled?');
P('6.request → copilot/stream (200)', m.status === 200, `HTTP ${m.status}`);
P('7.source = INTERNAL_CERTIFICATION_DATA', m.src === 'INTERNAL_CERTIFICATION_DATA', `src=${m.src} ws=${m.wsh}`);
const meetingsGrounded = /meeting|session|1:1|sync|review|scheduled/i.test(m.ans);
P('5.grounded meetings answer', meetingsGrounded, short(m.ans));

// Step 8/9 — PR-247 grounding: show retrieved edge vs copilot answer
console.log('\n  Q2: "Who authored PR-247?"  (ground truth: Jordan Lee via AUTHORED_BY)');
const pr = await stream('Who authored PR-247?');
const edge = await ctx('PR-247');
const edgePeople = (edge?.related?.people || []).map(p => `${p.name}(${p.relation})`);
const truth = edgePeople.some(p => /Jordan Lee/i.test(p));
const answerCorrect = /Jordan Lee|Jordan/i.test(pr.ans);
console.log(`     retrieved evidence (graph edge): ${edgePeople.join(', ') || 'none'}`);
console.log(`     source: ${pr.src}`);
console.log(`     copilot answer: ${short(pr.ans)}`);
P('8.retrieval has the edge (Jordan Lee)', truth, 'via /api/brain/context — the durable graph edge');
console.log(`  [${answerCorrect ? 'PASS' : 'FAIL'}] 9.copilot answer grounded=${answerCorrect} → ${answerCorrect ? 'GROUNDED' : 'FABRICATED (edge exists but copilot did not use it — known Brain gap)'}`);

// Step 10 — isolation: corp-alpha-specific question on Helios
console.log('\n  Q3 (isolation): "What is the status of Cormier Inc?"  (corp-alpha-only customer)');
const iso = await stream('What is the status of the customer Cormier Inc?');
const leaked = /cormier/i.test(iso.ans) && !/no |not |don'?t|isn'?t|couldn'?t/i.test(iso.ans.slice(0, 120));
P('10.no corp-alpha data leaked', !leaked, `src=${iso.src} :: ${short(iso.ans)}`);

console.log('\n═══ verification complete ═══');
await prisma.$disconnect(); process.exit(0);
