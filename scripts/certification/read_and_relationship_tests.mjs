/**
 * read_and_relationship_tests.mjs — Batch 1 (Dataset→Brain reads) + Batch 2
 * (People/Relationship knowledge) against the ingested Helios world.
 *
 * Every question is grounded in a fact VERIFIED to exist (or verified ABSENT) in the
 * dataset/graph. Uses the real Brain (stream endpoint, timeout-exempt) with provenance
 * headers. Records the exact answer; checks fabrication, provenance, isolation, and —
 * for relationships — whether the answer matches what the graph actually contains vs.
 * fabricates. No code changes. Read-only.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';

const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const ALPHA_CUST = ['Cormier Inc', 'Rempel', 'Cronin', 'Yundt', 'Stehr', 'Bashirian'];
let VALID_PR = new Set(), VALID_ISSUE = new Set(), VALID_NAMES = new Set();

const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '2h' });

for (const r of await prisma.$queryRawUnsafe(`SELECT id,name,coalesce(metadata::text,'') m,type FROM graph_nodes WHERE workspace_id=$1`, HW)) {
  const b = `${r.id} ${r.name} ${r.m}`;
  for (const x of b.matchAll(/PR-\d+/g)) VALID_PR.add(x[0]);
  for (const x of b.matchAll(/HELIOS-\d+/g)) VALID_ISSUE.add(x[0]);
  if (r.type === 'USER' && r.name) VALID_NAMES.add(r.name.toLowerCase());
}
function fabricatedIds(a) { const bad = []; for (const m of a.matchAll(/PR-\d+/g)) if (!VALID_PR.has(m[0])) bad.push(m[0]); for (const m of a.matchAll(/HELIOS-\d+/g)) if (!VALID_ISSUE.has(m[0])) bad.push(m[0]); return [...new Set(bad)]; }
const has = (a, s) => a.toLowerCase().includes(s.toLowerCase());
const hasAny = (a, l) => l.filter(x => has(a, x));

async function ask(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  const src = r.headers.get('x-flow-retrieval-source'); let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { src, ans };
}

const READ = []; const REL = [];

async function runRead(cat, q, expect, forbid = []) {
  const { src, ans } = await ask(q);
  const fab = fabricatedIds(ans);
  const leak = hasAny(ans, ALPHA_CUST);
  const forbidHit = hasAny(ans, forbid);
  const expHit = expect.length === 0 ? true : hasAny(ans, expect).length > 0;
  let v = 'PASS';
  if (fab.length || leak.length || forbidHit.length) v = 'FAIL';
  else if (ans.length < 30) v = 'UNPROVEN';
  else if (!expHit) v = 'PARTIAL';
  READ.push({ cat, q, v, ans, src, fab, leak });
  console.log(`\n[${v}] ${cat}\n  Q: ${q}\n  A: ${ans.slice(0, 240).replace(/\n/g, ' ')}\n  src=${src} expect[${expHit}]${fab.length ? ' FAB=' + fab : ''}${leak.length ? ' LEAK=' + leak : ''}${forbidHit.length ? ' FORBID=' + forbidHit : ''}`);
}

async function runRel(q, klass, correct, mustNotSay = []) {
  const { src, ans } = await ask(q);
  const fab = fabricatedIds(ans);
  const saysCorrect = correct.length ? hasAny(ans, correct).length > 0 : false;
  const saysForbidden = hasAny(ans, mustNotSay);
  // honest "unknown" language
  const admitsUnknown = /don'?t (have|know|see)|no (information|data|record|explicit)|not (found|available|sure|in this workspace)|unclear|cannot find|isn'?t (any|clear)/i.test(ans);
  let v;
  if (fab.length || saysForbidden.length) v = 'FAIL';              // fabricated id or a wrong specific person
  else if (klass === 'EXPLICIT') v = saysCorrect ? 'PASS' : (admitsUnknown ? 'PARTIAL' : (ans.length < 30 ? 'UNPROVEN' : 'PARTIAL'));
  else if (klass === 'UNKNOWN-in-graph') v = saysCorrect ? 'PASS(vector)' : (admitsUnknown ? 'PASS(honest-unknown)' : 'FAIL(fabricated-or-evasive)');
  else v = saysCorrect ? 'PASS' : (admitsUnknown ? 'PASS(honest-unknown)' : 'PARTIAL');
  REL.push({ q, klass, v, ans, correct: correct.join('|'), saysCorrect, admitsUnknown });
  console.log(`\n[${v}] (${klass})\n  Q: ${q}\n  A: ${ans.slice(0, 240).replace(/\n/g, ' ')}\n  correct=[${correct.join(', ')}] saysCorrect=${saysCorrect} admitsUnknown=${admitsUnknown}${fab.length ? ' FAB=' + fab : ''}${saysForbidden.length ? ' WRONG-PERSON=' + saysForbidden : ''}`);
}

console.log(`\n═══════════ BATCH 1 — DATASET → BRAIN READ TESTS ═══════════`);
console.log(`  ground truth: ${VALID_PR.size} PRs, ${VALID_ISSUE.size} issues, ${VALID_NAMES.size} people ingested`);
await runRead('1.People',       'What is Kishore Varma\'s role at the company?', ['CTO', 'chief technology', 'technology']);
await runRead('2.Companies',    'What is the status of the customer TechCorp?', ['risk', 'incident', 'connection pool', 'timeout', 'churn', 'escalat']);
await runRead('3.Projects',     'What projects are active and what is their status?', ['project', 'blocked', 'progress', 'delayed', 'track']);
await runRead('4.Repositories', 'What GitHub repositories exist in this workspace?', ['helios', 'repo', 'platform', 'service']);
await runRead('5.PullRequests', 'What is pull request PR-247 about?', ['TechCorp', 'connection pool', 'timeout', 'circuit breaker', 'API']);
await runRead('6.Issues',       'What is issue HELIOS-448 and what is its priority?', ['SSRF', 'P0', 'security', 'validation', 'webhook']);
await runRead('7.Commits',      'What recent commits have been made to the codebase?', ['commit', 'fix', 'feat', 'merge', 'add']);
await runRead('8.Emails',       'What important emails are in the inbox?', ['email', 'techcorp', 'dana', 'renewal', 'escalat', 'from']);
await runRead('9.Slack',        'What is being discussed in the engineering Slack channel?', ['engineering', 'incident', 'PR', 'deploy', 'review', 'pool']);
await runRead('10.Calendar',    'What meetings are scheduled?', ['meeting', '1:1', 'sync', 'review', 'planning', 'standup']);
await runRead('11.Incidents',   'What is the status of INCIDENT-001?', ['TechCorp', 'connection pool', 'monitoring', 'PR-247', 'resolved', 'timeout']);
await runRead('12.Relationships','Who authored pull request PR-247?', ['Jordan'], ['Shubham', 'Kishore', 'Marcus']); // GT: Jordan Lee

console.log(`\n\n═══════════ BATCH 2 — PEOPLE / RELATIONSHIP KNOWLEDGE ═══════════`);
await runRel('Who is Kishore Varma\'s manager?',              'UNKNOWN-in-graph', ['Arjun Mehta', 'Arjun', 'CEO'], ['Sarah', 'Jordan', 'Dana', 'Nadia']);
await runRel('Who reports to Kishore Varma?',                 'UNKNOWN-in-graph', ['Sarah Chen', 'Nadia Osei', 'Sarah', 'Nadia'], ['Arjun']);
await runRel('Who is the manager of Fatima Al-Hassan?',       'UNKNOWN-in-graph', [], []); // reports_to not ingested → honest unknown expected
await runRel('Who works with Jordan Lee?',                    'INFERRED',         ['engineer', 'team', 'backend', 'Sarah', 'Kishore'], []);
await runRel('Who authored pull request PR-247?',             'EXPLICIT',         ['Jordan Lee', 'Jordan'], ['Shubham', 'Kishore', 'Marcus']);
await runRel('Who is assigned to issue HELIOS-444?',          'EXPLICIT',         ['Jordan Lee', 'Jordan'], []);
await runRel('Who is assigned to the P0 security issue HELIOS-448?', 'EXPLICIT',  ['unassigned', 'no one', 'nobody', 'not assigned', 'no assignee'], ['Jordan Lee', 'Kishore', 'Sarah']); // GT: UNASSIGNED
await runRel('Which people are connected to PROJECT-001?',    'INFERRED',         ['engineer', 'team', 'Kishore', 'Jordan', 'assigned'], []);
await runRel('Who is responsible for INCIDENT-001?',          'UNKNOWN-in-graph', ['Jordan Lee', 'Sarah Chen', 'Jordan', 'Sarah'], []); // in text, not edges
await runRel('What is the relationship between Kishore Varma and Sarah Chen?', 'INFERRED', ['1:1', 'manage', 'report', 'meeting', 'VP', 'weekly'], []);

// ── isolation spot-check: a Helios read must never surface corp-alpha customers ──
const iso = await ask('List the customers in this workspace.');
const isoLeak = hasAny(iso.ans, ALPHA_CUST);
console.log(`\n[${isoLeak.length ? 'FAIL' : 'PASS'}] ISOLATION — customers list, corp-alpha leak=${isoLeak.join(',') || 'none'} src=${iso.src}`);

// ── tallies ──
const rt = READ.reduce((a, r) => (a[r.v] = (a[r.v] || 0) + 1, a), {});
const lt = REL.reduce((a, r) => (a[r.v] = (a[r.v] || 0) + 1, a), {});
console.log(`\n═══════════════════════════════════════`);
console.log(`  DATASET READ TESTS: ${JSON.stringify(rt)}`);
console.log(`  RELATIONSHIP TESTS: ${JSON.stringify(lt)}`);
console.log(`  isolation: ${isoLeak.length ? 'FAIL' : 'PASS'}`);
await prisma.$disconnect(); process.exit(0);
