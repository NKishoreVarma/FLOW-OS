/**
 * verify_cert_entry_final.mjs — verifies the backend pipeline the cert frontend will hit.
 * 4 questions + grounding evidence + isolation. Read-only.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '2h' });

async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { status: r.status, src: r.headers.get('x-flow-retrieval-source'), wsh: r.headers.get('x-flow-workspace'), ans };
}
async function ctx(id) { const r = await fetch(BASE + `/api/brain/context/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${H}`, 'workspace-id': HW } }); return (await r.json().catch(()=>({}))).context; }
const short = a => (a || '').slice(0, 220).replace(/\n/g, ' ');

console.log('\n═══ CERT ENTRY — BACKEND PIPELINE VERIFICATION ═══');
// resolution checks
const wl = await (await fetch(BASE + '/api/org/workspaces', { headers: { Authorization: `Bearer ${H}`, 'workspace-id': 'temp' } })).json();
console.log(`org/workspaces → ${(wl||[]).map(w=>w.externalId).join(',')}`);
const st = await (await fetch(BASE + '/api/onboarding/workspace-state', { headers: { Authorization: `Bearer ${H}`, 'workspace-id': HW } })).json();
console.log(`workspace-state → phase=${st.workspacePhase} mode=${st.workspaceMode}`);

const Q = [
  ['1. What meetings are scheduled?', null, /meeting|session|1:1|sync|scheduled/i],
  ['2. What is happening in engineering?', null, /engineering|PR|pull request|deploy|incident|feat|fix/i],
  ['3. Who authored PR-247?', 'PR-247', /Jordan Lee|Jordan/i],
  ['4. Who is assigned to HELIOS-444?', 'HELIOS-444', /Jordan Lee|Jordan/i],
];
for (const [q, id, correctRe] of Q) {
  const r = await stream(q.replace(/^\d+\. /, ''));
  let evidence = '';
  if (id) { const c = await ctx(id); evidence = (c?.related?.people || []).map(p => `${p.name}(${p.relation})`).join(', ') || 'none'; }
  const correct = correctRe.test(r.ans);
  const verdict = id
    ? (correct ? 'GROUNDED' : (/not (found|listed|assigned)|don'?t|no /i.test(r.ans) ? 'RETRIEVAL MISS' : 'FABRICATION'))
    : (r.ans.length > 40 && correctRe.test(r.ans) ? 'GROUNDED' : 'PARTIAL');
  console.log(`\n─ ${q}`);
  console.log(`  HTTP ${r.status} | workspace=${r.wsh} | source=${r.src}`);
  if (id) console.log(`  retrieved evidence (graph edge via /context): ${evidence}`);
  console.log(`  answer: ${short(r.ans)}`);
  console.log(`  VERDICT: ${verdict}`);
}

// isolation: Helios token → corp-alpha workspace must be 403
const cross = await fetch(BASE + '/api/brain/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': AW }, body: JSON.stringify({ question: 'hi' }) });
console.log(`\n─ ISOLATION: Helios token → corp-alpha workspace-id`);
console.log(`  HTTP ${cross.status}  (expect 403)  → ${cross.status === 403 ? 'PASS (blocked)' : 'FAIL'}`);

console.log('\n═══ done ═══');
await prisma.$disconnect(); process.exit(0);
