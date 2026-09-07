/**
 * knowledge_cert_measure.mjs — READ-ONLY knowledge certification measurement.
 * Tests 1,2,3,4,6 (Brain-call tests). Tests 5/7/8/9/10 are analysis over these outputs + code.
 *
 * No code/data/prompt changes. Uses the real stream copilot (production path, timeout-exempt),
 * the /api/brain/reason edge-traversing path, and the /api/brain/context direct-graph path.
 * Every result printed immediately (append-safe). Per-call resilient (records ERROR, continues).
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET;
const HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const ALPHA_CUST = ['Cormier Inc', 'Rempel', 'Cronin', 'Yundt', 'Stehr', 'Bashirian'];
let VALID_PR = new Set(), VALID_ISSUE = new Set(), USER_NAMES = new Set();

const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '4h' });
const wsA = await prisma.workspace.findUnique({ where: { externalId: AW } });
const uA = await prisma.user.findFirst({ where: { orgId: wsA.orgId } });
const A = jwt.sign({ userId: uA.id, email: uA.email, role: 'OWNER', orgId: wsA.orgId }, S, { expiresIn: '4h' });

for (const r of await prisma.$queryRawUnsafe(`SELECT id,name,coalesce(metadata::text,'') m,type FROM graph_nodes WHERE workspace_id=$1`, HW)) {
  const b = `${r.id} ${r.name} ${r.m}`;
  for (const x of b.matchAll(/PR-\d+/g)) VALID_PR.add(x[0]);
  for (const x of b.matchAll(/HELIOS-\d+/g)) VALID_ISSUE.add(x[0]);
  if (r.type === 'USER' && r.name) USER_NAMES.add(r.name.toLowerCase());
}
// names that exist as ANY node (people incl. external contacts) — for "real but maybe wrong" vs "invented"
const ALL_PERSON_NAMES = new Set([...USER_NAMES]);
for (const r of await prisma.$queryRawUnsafe(`SELECT name FROM graph_nodes WHERE workspace_id=$1 AND type IN ('USER','EMPLOYEE')`, HW)) if (r.name) ALL_PERSON_NAMES.add(r.name.toLowerCase());

const UNKNOWN_RE = /don'?t (have|see|know)|no (information|data|record|manager|explicit|direct|one|pull request|issue|assignee)|not (found|available|assigned|listed|in this|sure|clear)|unclear|isn'?t (any|clear|listed)|couldn'?t find|do not have enough|no evidence/i;
function invented(ans) {
  // capitalized First Last tokens the answer asserts, that are NOT any known person node
  const names = [...ans.matchAll(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g)].map(m => m[1]);
  return [...new Set(names)].filter(n => !ALL_PERSON_NAMES.has(n.toLowerCase()) && !/^(Pull Request|Data Stream|Working Session|Connection Pool|Circuit Breaker|Enterprise Account|Root Cause)$/i.test(n));
}
async function copilot(q, ws = HW, tok = H) {
  try {
    const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'workspace-id': ws }, body: JSON.stringify({ question: q }) });
    const src = r.headers.get('x-flow-retrieval-source'); let ans = ''; const t = await r.text();
    for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
    return { src, ans };
  } catch (e) { return { src: 'ERROR', ans: 'ERROR:' + e.message }; }
}
async function reason(q) {
  try {
    const ctl = AbortSignal.timeout(180000);
    const r = await fetch(BASE + '/api/brain/reason', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }), signal: ctl });
    const b = await r.json().catch(() => ({}));
    return { status: r.status, blob: JSON.stringify(b.result || b).slice(0, 4000) };
  } catch (e) { return { status: 'ERR', blob: 'ERROR:' + e.message }; }
}
async function context(entityId) {
  try {
    const r = await fetch(BASE + `/api/brain/context/${encodeURIComponent(entityId)}`, { headers: { Authorization: `Bearer ${H}`, 'workspace-id': HW } });
    return { status: r.status, blob: JSON.stringify(await r.json().catch(() => ({}))).slice(0, 2000) };
  } catch (e) { return { status: 'ERR', blob: 'ERROR:' + e.message }; }
}
const short = a => a.slice(0, 200).replace(/\n/g, ' ');

// ══════════ TEST 1 — UNKNOWN / FABRICATION RATE (3 × 10) ══════════
console.log('\n########## TEST 1 — FABRICATION RATE (N=10 each) ##########');
const T1Q = [
  ['Who is the manager of Fatima Al-Hassan?', 'Marcus Williams (not ingested)'],
  ['Who works with Jordan Lee?', 'collaborators (inferred)'],
  ["Who is Kishore Varma's manager?", 'Arjun Mehta (not ingested)'],
];
const t1 = [];
for (const [q, gt] of T1Q) {
  for (let i = 1; i <= 10; i++) {
    const { src, ans } = await copilot(q);
    const inv = invented(ans);
    const isUnknown = UNKNOWN_RE.test(ans);
    let verdict;
    if (ans.startsWith('ERROR')) verdict = 'ERROR';
    else if (inv.length) verdict = 'FABRICATED';                        // invented a non-existent person
    else if (isUnknown) verdict = 'UNKNOWN';                            // honest
    else if (/manager|works with|reports to|collaborat/i.test(ans) && /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(ans)) verdict = 'ASSERTS-PERSON'; // named a real person as the answer (maybe wrong)
    else verdict = 'EVASIVE';
    t1.push({ q, i, verdict, inv, ans });
    console.log(`T1 [${verdict}] run${i} q="${q.slice(0,32)}" inv=${inv.join(',')||'-'} :: ${short(ans)}`);
  }
}

// ══════════ TEST 2 — GRAPH EDGE TRAVERSAL (copilot vs reason vs context) ══════════
console.log('\n########## TEST 2 — GRAPH TRAVERSAL ##########');
for (const [id, expect] of [['PR-247', 'Jordan Lee'], ['HELIOS-444', 'Jordan Lee']]) {
  const cp = await copilot(`Who ${id.startsWith('PR') ? 'authored' : 'is assigned to'} ${id}?`);
  const rs = await reason(`Who ${id.startsWith('PR') ? 'authored' : 'is assigned to'} ${id}?`);
  const cx = await context(id);
  console.log(`T2 ${id} expect=${expect}`);
  console.log(`   A.copilot: found=${new RegExp(expect,'i').test(cp.ans)} :: ${short(cp.ans)}`);
  console.log(`   B.reason : status=${rs.status} found=${new RegExp(expect,'i').test(rs.blob)} :: ${rs.blob.slice(0,220)}`);
  console.log(`   C.context: status=${cx.status} found=${new RegExp(expect,'i').test(cx.blob)} edgeSeen=${/AUTHORED_BY|ASSIGNED_TO|relation/i.test(cx.blob)} :: ${cx.blob.slice(0,240)}`);
}

// ══════════ TEST 3 — EXACT-ID RECALL ══════════
console.log('\n########## TEST 3 — EXACT-ID RECALL ##########');
const T3 = [
  ['PR-247', 'What is pull request PR-247 about?', /connection pool|TechCorp|timeout|circuit breaker/i],
  ['HELIOS-444', 'What is issue HELIOS-444?', /HELIOS-444|Jordan|bug|fix|backend/i],
  ['HELIOS-448', 'What is the P0 security issue HELIOS-448?', /SSRF|security|validation|webhook|P0/i],
  ['INCIDENT-001', 'What is the status of INCIDENT-001?', /TechCorp|connection pool|monitoring|timeout/i],
  ['USER-002', "What is Kishore Varma's role?", /CTO|chief technology/i],
];
for (const [id, q, ok] of T3) {
  const { ans } = await copilot(q);
  const found = ok.test(ans);
  console.log(`T3 [${found ? 'CORRECT' : 'MISS'}] ${id} :: ${short(ans)}`);
}

// ══════════ TEST 4 — CONSISTENCY (category questions × 3; relationship reuse T1) ══════════
console.log('\n########## TEST 4 — CONSISTENCY (×3) ##########');
const T4 = [
  ['factual', "What is Kishore Varma's role?"],
  ['PR', 'What is PR-247 about?'],
  ['incident', 'What is the status of INCIDENT-001?'],
  ['project', 'What projects are active and their status?'],
  ['meeting', 'What meetings are scheduled?'],
  ['2-hop', 'Which people are connected to PROJECT-001?'],
  ['operational', 'What is happening in engineering right now?'],
];
for (const [cat, q] of T4) {
  const runs = [];
  for (let i = 0; i < 3; i++) { const { ans } = await copilot(q); runs.push(ans); }
  const uniq = new Set(runs.map(a => a.slice(0, 80))).size;
  console.log(`T4 [${cat}] distinctOpenings=${uniq}/3`);
  runs.forEach((a, i) => console.log(`   run${i+1}: ${short(a)}`));
}

// ══════════ TEST 6 — CROSS-WORKSPACE ISOLATION ══════════
console.log('\n########## TEST 6 — ISOLATION ##########');
const isoA = await copilot('Why is TechCorp at risk and what is PR-247 about?', AW, A);
const leakA = /dana whitfield/i.test(isoA.ans) || isoA.ans.includes('connection pool');
console.log(`T6 on=corp-alpha q=TechCorp/PR-247 src=${isoA.src} leak(realHeliosFacts)=${leakA} :: ${short(isoA.ans)}`);
const isoH = await copilot('What is the status of Cormier Inc and Rempel - Hand?', HW, H);
const leakH = ALPHA_CUST.filter(c => isoH.ans.toLowerCase().includes(c.toLowerCase()) && !isoH.ans.toLowerCase().includes('no ') );
console.log(`T6 on=helios q=Cormier/Rempel src=${isoH.src} leak=${leakH.join(',')||'none(echo-only-ok)'} :: ${short(isoH.ans)}`);

// ── TEST 1 TALLY ──
const tally = t1.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
console.log(`\n########## SUMMARY ##########`);
console.log(`TEST1 verdicts: ${JSON.stringify(tally)} over ${t1.length} runs`);
const fabs = t1.filter(r => r.verdict === 'FABRICATED' || (r.verdict === 'ASSERTS-PERSON'));
console.log(`TEST1 fabricated/asserts-person examples:`);
for (const f of fabs.slice(0, 8)) console.log(`  [${f.verdict}] "${f.q.slice(0,32)}" inv=${f.inv.join(',')||'-'} :: ${short(f.ans)}`);
console.log('KNOWLEDGE_CERT_DONE');
await prisma.$disconnect(); process.exit(0);
