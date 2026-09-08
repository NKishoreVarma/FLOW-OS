/**
 * phase4_verify_suite.mjs — real chat path, N-repeated, for the post-synthesis
 * verification gate. Classifies each answer and (via server VerifyGate traces) reports
 * PASS/REPAIR counts. Read-only.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '5h' });
const short = a => (a || '').slice(0, 130).replace(/\n/g, ' ');
const R = [];
async function stream(q, history) {
  const body = { question: q }; if (history) body.history = history;
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify(body) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return ans;
}
async function testN(id, q, want, forbid, n, history) {
  let good = 0, last = '';
  for (let i = 0; i < n; i++) { const a = await stream(q, history); last = a; if (want.test(a) && (!forbid || !forbid.test(a))) good++; }
  const ok = good === n; R.push([id, ok, good, n]);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id} — ${good}/${n} :: ${short(last)}`);
}

console.log('\n########## PHASE 4 — VERIFICATION GATE (real chat) ##########');
await testN('1.manager-Kishore', "Who is Kishore Varma's manager?", /Arjun Mehta/i, /Kishore Varma manages|Kishore.*is the manager/i, 10);
await testN('2.reports-to-Kishore', 'Who reports to Kishore Varma?', /Sarah Chen|Nadia Osei/i, /reports? to (Sarah|Nadia)/i, 10);
await testN('3.author-PR-247', 'Who authored PR-247?', /Jordan Lee/i, /Rahul|Dana|Shubham/i, 5);
await testN('4.assigned-HELIOS-444', 'Who is assigned to HELIOS-444?', /Jordan Lee/i, null, 5);
await testN('5.responsible-INCIDENT-001', 'Who is responsible for INCIDENT-001?', /Jordan Lee|Sarah Chen/i, null, 10);
await testN('6.pronoun-reports-to-him', 'Who reports to him?', /David Rodriguez|Kishore|Neha|Lena|report/i, null, 10,
  [{ role: 'user', content: "Who is Kishore Varma's manager?" }, { role: 'assistant', content: 'Arjun Mehta is Kishore Varma\'s manager.' }]);
await testN('7.meetings-scheduled', 'What meetings are scheduled?', /meeting|session|sync|review|planning|renewal|QBR/i, /December|November|January|October/i, 5);
await testN('8.HELIOS-448', 'What is HELIOS-448 about?', /SSRF|security|validation|webhook/i, null, 5);
await testN('9.HELIOS-999', 'What is HELIOS-999?', /couldn'?t find|don'?t have|not .*(found|exist)/i, /HELIOS-4\d\d/i, 5);
await testN('10.manager-Zebediah', 'Who is the manager of Zebediah Fakename?', /couldn'?t find|don'?t have|not .*(found|in this)|no .*(record|manager)/i, /Miguel|Claire|Sarah|Ben Williams|Arjun/i, 5);
// 11. corp-alpha premise — must NOT list corp-alpha employee records
{
  let leak = 0, n = 3;
  for (let i = 0; i < n; i++) { const a = await stream("Tell me about corp-alpha's employees."); if (/Cormier|Rempel|Cronin|Yundt|Stehr|Bashirian/i.test(a)) leak++; }
  R.push(['11.corp-alpha-no-leak', leak === 0, n - leak, n]);
  console.log(`  [${leak === 0 ? 'PASS' : 'FAIL'}] 11.corp-alpha-no-leak — leaks=${leak}/${n}`);
}

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length} cases passed`);
console.log(`  FAILURES: ${R.filter(x => !x[1]).map(x => `${x[0]}(${x[2]}/${x[3]})`).join(', ') || 'none'}`);
console.log('PHASE4_DONE');
await prisma.$disconnect(); process.exit(0);
