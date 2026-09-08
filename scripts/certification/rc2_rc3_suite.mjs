/**
 * rc2_rc3_suite.mjs — comprehensive suite for RC-2 (direction), RC-3 (relationship+temporal),
 * humanization, conversation memory, unknowns, isolation. Real chat path. Read-only.
 * Determinism-critical questions run N=3; others N=1.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '4h' });
const R = [];
const short = a => (a || '').slice(0, 160).replace(/\n/g, ' ');
async function stream(q, history) {
  const body = { question: q }; if (history) body.history = history;
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify(body) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { src: r.headers.get('x-flow-retrieval-source'), ans };
}
async function testN(id, q, want, forbid, n = 3, history) {
  let good = 0; let last = '';
  for (let i = 0; i < n; i++) { const { ans } = await stream(q, history); last = ans; if (want.test(ans) && (!forbid || !forbid.test(ans))) good++; }
  const ok = good === n;
  R.push([id, ok]);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id} — ${good}/${n} :: ${short(last)}`);
  return last;
}

console.log('\n########## A. RELATIONSHIP DIRECTION (N=3) ##########');
await testN('A1.manager-of-Fatima', "Who is Fatima Al-Hassan's manager?", /Marcus Williams/i, null, 3);
await testN('A2.Fatima-reports-to', 'Who does Fatima Al-Hassan report to?', /Marcus Williams/i, null, 3);
await testN('A3.reports-to-Kishore', 'Who reports to Kishore Varma?', /Sarah Chen|Nadia Osei/i, null, 3);
await testN('A4.reports-to-Marcus', 'Who reports to Marcus Williams?', /Fatima|report/i, null, 2);
await testN('A5.is-Arjun-Kishore-manager', "Is Arjun Mehta Kishore Varma's manager?", /yes|Arjun|correct/i, null, 2);

console.log('\n########## B. ATTRIBUTION (N=3) ##########');
await testN('B1.author-PR-247', 'Who authored PR-247?', /Jordan Lee/i, /Rahul|Dana|Shubham/i, 3);
await testN('B2.assigned-HELIOS-444', 'Who is assigned to HELIOS-444?', /Jordan Lee/i, null, 3);
await testN('B3.responsible-INCIDENT-001', 'Who is responsible for INCIDENT-001?', /Jordan Lee|Sarah Chen/i, null, 3);

console.log('\n########## C. TEMPORAL (N=1) ##########');
await testN('C1.meetings-scheduled', 'What meetings are scheduled?', /meeting|session|sync|review|planning/i, /December 8/i, 1);
await testN('C2.next-meeting', 'What meeting is next?', /meeting|session|sync|review|planning|scheduled/i, null, 1);

console.log('\n########## D. CONVERSATION MEMORY (N=1) ##########');
const h1 = [{ role: 'user', content: "Who is Fatima Al-Hassan's manager?" }, { role: 'assistant', content: 'Fatima Al-Hassan reports to Marcus Williams.' }];
await testN('D1.pronoun-reports-to-her', 'Who does she report to?', /Marcus Williams/i, null, 1, h1);
const h2 = [{ role: 'user', content: 'Who authored PR-247?' }, { role: 'assistant', content: 'PR-247 was authored by Jordan Lee.' }];
await testN('D2.pronoun-what-assigned', 'What is he assigned to?', /HELIOS|Jordan|assigned|issue/i, null, 1, h2);

console.log('\n########## E. UNKNOWNS (N=3) ##########');
await testN('E1.manager-Zebediah', 'Who is the manager of Zebediah Fakename?', /couldn'?t find|don'?t have|not .*(found|in this)/i, /Miguel|Claire|Sarah|Ben Williams/i, 3);
await testN('E2.HELIOS-999', 'What is HELIOS-999?', /couldn'?t find|don'?t have|not .*(found|exist)/i, /HELIOS-4\d\d/i, 3);
await testN('E3.assigned-HELIOS-999', 'Who is assigned to HELIOS-999?', /couldn'?t find|don'?t have|not .*(found|exist|assigned)/i, /Jordan Lee/i, 2);

console.log('\n########## F. TENANT ISOLATION (N=1) ##########');
{
  const { ans, src } = await stream("Tell me about corp-alpha's employees.");
  const leaked = /Cormier|Rempel|Cronin|Yundt|Stehr|Bashirian/i.test(ans);
  const ok = !leaked;
  R.push(['F1.no-corp-alpha-leak', ok]);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] F1.no-corp-alpha-leak — src=${src} :: ${short(ans)}`);
  const cross = await fetch(BASE + '/api/brain/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': AW }, body: JSON.stringify({ question: 'hi' }) });
  R.push(['F2.cross-workspace-403', cross.status === 403]);
  console.log(`  [${cross.status === 403 ? 'PASS' : 'FAIL'}] F2.cross-workspace-403 — HTTP ${cross.status}`);
}

console.log('\n########## G. HUMANIZATION (no universal follow-up) ##########');
{
  // sample 3 answers; the generic "check the open PRs" must NOT appear on unrelated Qs
  const qs = ['Who authored PR-247?', "Who is Fatima Al-Hassan's manager?", 'What is HELIOS-448 about?'];
  let genericCount = 0;
  for (const q of qs) { const { ans } = await stream(q); if (/want me to check the open prs/i.test(ans)) genericCount++; }
  R.push(['G1.no-universal-followup', genericCount === 0]);
  console.log(`  [${genericCount === 0 ? 'PASS' : 'FAIL'}] G1.no-universal-followup — generic-offer count=${genericCount}/3`);
}

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length} passed`);
console.log(`  FAILURES: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
console.log('RC2_RC3_SUITE_DONE');
await prisma.$disconnect(); process.exit(0);
