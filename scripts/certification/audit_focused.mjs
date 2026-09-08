/**
 * audit_focused.mjs — confirmatory batch for the NEW audit scenarios (reverse-direction,
 * pronoun/conversation memory, tenant isolation phrasing, incident responsibility,
 * temporal). Read-only. Combines with prior session data for the full matrix.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '2h' });

async function stream(q, history) {
  const body = { question: q }; if (history) body.history = history;
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify(body) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { src: r.headers.get('x-flow-retrieval-source'), ans };
}
const short = a => (a || '').slice(0, 240).replace(/\n/g, ' ');

console.log('\n═══ FOCUSED AUDIT BATCH ═══');

// Reverse-direction: reports-to vs manager-of (GT: Sarah Chen + Nadia Osei report to Kishore; NOT ingested)
let r = await stream('Who reports to Kishore Varma?');
console.log(`\n[reverse-rel] Who reports to Kishore Varma?\n  src=${r.src}\n  A: ${short(r.ans)}`);

// Pronoun / conversation memory (2-turn via history)
const t1 = await stream("Who is Fatima Al-Hassan's manager?");
console.log(`\n[pronoun t1] Who is Fatima's manager?\n  A: ${short(t1.ans)}`);
const t2 = await stream('Who reports to him?', [
  { role: 'user', content: "Who is Fatima Al-Hassan's manager?" },
  { role: 'assistant', content: t1.ans },
]);
console.log(`[pronoun t2] "Who reports to him?" (him=?)\n  A: ${short(t2.ans)}`);

// Tenant isolation phrasing
r = await stream("Tell me about corp-alpha's employees.");
console.log(`\n[isolation] Tell me about corp-alpha's employees.\n  src=${r.src}\n  A: ${short(r.ans)}`);

// Incident responsibility (GT in dataset: Jordan Lee/Sarah Chen; NOT ingested to graph)
r = await stream('Who is responsible for INCIDENT-001?');
console.log(`\n[incident-resp] Who is responsible for INCIDENT-001?\n  src=${r.src}\n  A: ${short(r.ans)}`);

// Temporal (meeting nodes have NO start_time)
r = await stream('What is my next meeting?');
console.log(`\n[temporal] What is my next meeting?\n  src=${r.src}\n  A: ${short(r.ans)}`);

// Exact-ID substitution guard
r = await stream('What happened with PR-247?');
console.log(`\n[exact-id-sub] What happened with PR-247? (real: TechCorp connection pool fix)\n  A: ${short(r.ans)}`);

console.log('\n═══ FOCUSED_AUDIT_DONE ═══');
await prisma.$disconnect(); process.exit(0);
