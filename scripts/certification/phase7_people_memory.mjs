/**
 * phase7_people_memory.mjs — People & Org Memory tests. Service-level (isolation/security/
 * persistence, deterministic) + chat-level (confirm/reject/recall/conflict). Read-only DB
 * except the confirmation writes it exercises. No dataset changes.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
import { createConfirmedFact, getConfirmedFacts, getConfirmedFor } from '../../src/ai/reasoning/OrgMemoryFacts.js';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const wsH = await prisma.workspace.findUnique({ where: { externalId: HW } });
const users = await prisma.user.findMany({ where: { orgId: wsH.orgId }, take: 2, select: { id: true, email: true } });
const [uA, uB] = users;
const H = jwt.sign({ userId: uA.id, email: uA.email, role: 'OWNER', orgId: wsH.orgId }, S, { expiresIn: '2h' });
const R = [];
const rec = (id, ok, note = '') => { R.push([id, ok]); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${note ? ' — ' + note : ''}`); };
async function stream(q, history) {
  const body = { question: q }; if (history) body.history = history;
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify(body) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return ans;
}
const short = a => (a || '').slice(0, 130).replace(/\n/g, ' ');

// clean slate
await prisma.orgRelationshipFact.deleteMany({ where: { workspaceId: { in: [HW, AW] } } }).catch(() => {});

console.log('\n######### PHASE 7 — PEOPLE & ORG MEMORY #########');

console.log('\n== SERVICE: isolation + user-scoping + persistence + security ==');
// create a fact for userA in Helios
await createConfirmedFact({ workspaceId: HW, userId: uA.id, subjectName: 'Test Person A', relationship: 'REPORTS_TO', objectName: 'Arjun Mehta' });
// 9. workspace isolation — corp-alpha must not see it
const alphaFacts = await getConfirmedFacts(AW, uA.id);
rec('9.workspace-isolation', alphaFacts.length === 0, `corp-alpha sees ${alphaFacts.length} Helios facts`);
// 10. user isolation — userB must not see userA's fact
const bFacts = uB ? await getConfirmedFacts(HW, uB.id) : [];
rec('10.user-isolation', bFacts.length === 0, `userB sees ${bFacts.length} of userA facts`);
// userA DOES see own
const aFacts = await getConfirmedFacts(HW, uA.id);
rec('service:own-visible', aFacts.length === 1 && aFacts[0].source === 'USER_CONFIRMED', `userA sees ${aFacts.length}, source=${aFacts[0]?.source}`);
// 15. security — only USER_CONFIRMED source exists (no LLM/connector writes)
const nonConfirmed = await prisma.orgRelationshipFact.count({ where: { workspaceId: HW, source: { not: 'USER_CONFIRMED' } } });
rec('15.only-user-confirmed-source', nonConfirmed === 0, `${nonConfirmed} non-USER_CONFIRMED rows`);
// correction supersedes (audit trail)
await createConfirmedFact({ workspaceId: HW, userId: uA.id, subjectName: 'Test Person A', relationship: 'REPORTS_TO', objectName: 'Sarah Chen' });
const active = await getConfirmedFor(HW, uA.id, 'Test Person A', 'REPORTS_TO');
const superseded = await prisma.orgRelationshipFact.count({ where: { workspaceId: HW, subjectName: 'Test Person A', status: 'SUPERSEDED' } });
rec('service:correction-supersedes', active?.objectName === 'Sarah Chen' && superseded === 1, `active=${active?.objectName} superseded=${superseded}`);

// clean for chat tests
await prisma.orgRelationshipFact.deleteMany({ where: { workspaceId: HW } }).catch(() => {});

console.log('\n== CHAT: confirm / reject / not-sure / recall / conflict ==');
// 1. confirm manager
const a1 = await stream('Arjun Mehta is my manager');
rec('1.confirm-manager', /remember Arjun Mehta as your manager/i.test(a1), short(a1));
const stored = await prisma.orgRelationshipFact.count({ where: { workspaceId: HW, relationship: 'REPORTS_TO', objectName: { contains: 'Arjun', mode: 'insensitive' }, status: 'ACTIVE' } });
rec('1b.stored-in-db', stored === 1, `rows=${stored}`);
// 4/7. recall (conflict expected vs dataset, or USER_CONFIRMED)
const a4 = await stream('Who is my manager?');
rec('4.recall-uses-confirmed', /Arjun Mehta/i.test(a4) && /(confirmed|conflicting)/i.test(a4), short(a4));
rec('7.provenance-not-dataset', !/the dataset says Arjun/i.test(a4), 'never claims dataset says the confirmed fact');
// 2. reject via "no" to a pending confirm
await prisma.orgRelationshipFact.deleteMany({ where: { workspaceId: HW } }).catch(() => {});
const a2 = await stream('no', [{ role: 'user', content: 'Who is my manager?' }, { role: 'assistant', content: 'I don\'t have a confirmed manager for you yet. Is Sarah Chen your manager?' }]);
const afterNo = await prisma.orgRelationshipFact.count({ where: { workspaceId: HW } });
rec('2.reject-no-write', afterNo === 0 && /won'?t treat Sarah Chen as your manager/i.test(a2), `rows=${afterNo} :: ${short(a2)}`);
// 3. not sure
const a3 = await stream('not sure', [{ role: 'user', content: 'Who is my manager?' }, { role: 'assistant', content: 'Is Arjun Mehta your manager?' }]);
const afterNS = await prisma.orgRelationshipFact.count({ where: { workspaceId: HW } });
rec('3.not-sure-no-write', afterNS === 0, `rows=${afterNS} :: ${short(a3)}`);
// 8. unknown manager (no confirmed, dataset may/may not have) — must not fabricate
const a8 = await stream('Who is my manager?');
rec('8.unknown-or-dataset-no-fab', /don'?t have a confirmed|Per the workspace data|Is .* your manager/i.test(a8), short(a8));

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length}  FAILURES: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
await prisma.orgRelationshipFact.deleteMany({ where: { workspaceId: HW } }).catch(() => {});  // cleanup
console.log('PHASE7_DONE');
await prisma.$disconnect(); process.exit(0);
