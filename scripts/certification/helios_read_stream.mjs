/**
 * helios_read_stream.mjs — re-runs the READ + DISCOVERY groups (G1, G2–G6)
 * through the STREAM endpoint (the timeout-exempt production read path that
 * BrainHome uses). The non-stream /api/brain/copilot 503s under the 30s request
 * timeout because local-Ollama Brain calls take ~28–30s. Same fabrication /
 * grounding / leak checks. No retries — one shot per question, honest states.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const HELIOS_CUST = ['TechCorp','Globex','Initech','Vertex','NovaCorp','Apex Industries','DataStream','CloudBase','Meridian','Cascade Tech','Pinnacle Corp','Summit Systems'];
const ALPHA_CUST = ['Cormier Inc','Rempel','Cronin','Yundt','Stehr','Bashirian'];
let VALID_PR = new Set(), VALID_ISSUE = new Set();
const out = [];
const add = (g, k, state, note) => { out.push({ g, k, state }); console.log(`  [${state}] ${g} · ${k} — ${note}`); };

const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '40m' });
for (const r of await prisma.$queryRawUnsafe(`SELECT id,name,coalesce(metadata::text,'') m FROM graph_nodes WHERE workspace_id=$1`, HW)) {
  const b = `${r.id} ${r.name} ${r.m}`;
  for (const x of b.matchAll(/PR-\d+/g)) VALID_PR.add(x[0]);
  for (const x of b.matchAll(/HELIOS-\d+/g)) VALID_ISSUE.add(x[0]);
}
function fabricated(a) { const bad = []; for (const m of a.matchAll(/PR-\d+/g)) if (!VALID_PR.has(m[0])) bad.push(m[0]); for (const m of a.matchAll(/HELIOS-\d+/g)) if (!VALID_ISSUE.has(m[0])) bad.push(m[0]); return [...new Set(bad)]; }
const hits = (a, l) => l.filter(x => a.toLowerCase().includes(x.toLowerCase()));
async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  const src = r.headers.get('x-flow-retrieval-source'); let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { src, ans };
}

console.log('\n═══ READ + DISCOVERY via STREAM endpoint (timeout-exempt) ═══\n');
const G1 = [
  ['eng', 'What is happening across engineering right now?', []],
  ['prs', 'Which PRs are blocked and why?', ['PR-247']],
  ['sec', 'Which security issues require immediate attention?', ['HELIOS-448','SSRF','security']],
  ['load', 'Who is overloaded and what work could be reassigned?', ['Jordan']],
  ['cust', 'Which customers are currently at risk?', HELIOS_CUST],
  ['miss', 'What meetings or follow-ups have been missed?', []],
  ['prio', 'Prepare my top 5 priorities for today.', []],
];
for (const [k, q, expect] of G1) {
  const { src, ans } = await stream(q);
  const fab = fabricated(ans), leak = hits(ans, ALPHA_CUST), grounded = ans.length > 40;
  const hitExp = expect.length === 0 ? true : hits(ans, expect).length > 0;
  let st = 'PASS';
  if (fab.length || leak.length) st = 'FAIL';
  else if (!grounded) st = 'PARTIAL';
  else if (!hitExp) st = 'PARTIAL';
  add('G1', k, st, `src=${src} ${grounded ? ans.slice(0, 70).replace(/\n/g, ' ') : 'thin/empty'}${fab.length ? ' FAB=' + fab : ''}${leak.length ? ' LEAK=' + leak : ''}`);
}
const DISC = [
  ['G2', 'techcorp', 'Investigate the TechCorp situation and prepare everything needed to resolve it.', ['TechCorp'], ['PR-247','Dana','incident','deploy','connection pool']],
  ['G3', 'p0-sec', 'Take care of the unassigned P0 security vulnerability.', ['HELIOS-448'], ['SSRF','unassigned','PR-251','security','P0']],
  ['G4', 'globex', 'Handle the Globex renewal risk.', ['Globex'], ['renewal','800','August','email','CTO']],
  ['G5', 'initech', 'Fix the Initech onboarding situation.', ['Initech'], ['kickoff','onboarding','CAL-EVENT-007','invite','complaint']],
  ['G6', 'jordan', "Reduce Jordan Lee's workload without dropping important work.", ['Jordan'], ['HELIOS-445','HELIOS-451','HELIOS-452','PR-247','on-call']],
];
for (const [g, k, q, must, chain] of DISC) {
  const { src, ans } = await stream(q);
  const fab = fabricated(ans), leak = hits(ans, ALPHA_CUST);
  const anchor = hits(ans, must).length > 0, ch = hits(ans, chain);
  let st = 'PASS';
  if (fab.length || leak.length) st = 'FAIL';
  else if (ans.length < 40) st = 'PARTIAL';
  else if (!anchor) st = 'PARTIAL';
  else if (ch.length === 0) st = 'PARTIAL';
  add(g, k + ':discovery', st, `src=${src} anchor=${anchor} chain[${ch.length}/${chain.length}]=${ch.join('|')}${fab.length ? ' FAB=' + fab : ''}`);
}
const tally = out.reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {});
console.log(`\n  STREAM READ RESULTS: ${JSON.stringify(tally)}`);
await prisma.$disconnect(); process.exit(0);
