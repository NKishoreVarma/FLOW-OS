/**
 * phase6_5_briefing.mjs — briefing composer regression. Real chat path (Ollama available).
 * Ollama-failure path was validated separately on a disposable instance. Read-only.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
import { workspacePeople } from '../../src/ai/reasoning/EvidenceCollector.js';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '5h' });
const roster = await workspacePeople(HW);
const NON_PERSON = /Connection Pool|Circuit Breaker|Pull Request|Working Session|Root Cause|Auth Service|Core Platform|System Outage|Bad Gateway|Data Stream|Dead Letter/;
const short = a => (a || '').slice(0, 130).replace(/\n/g, ' ');
async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return ans;
}
function fab(a) {
  const names = [...new Set([...a.matchAll(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g)].map(m => m[1]))].filter(n => !NON_PERSON.test(n));
  return names.filter(n => !roster.names.has(n.toLowerCase()));
}
let tests = 0, pass = 0, fabCount = 0, deflect = 0;
// a good briefing is grounded (mentions a real signal) + no fabricated people + no generic deflection
const GROUNDED = /incident|P0|P1|pull request|PR|open|risk|blocked|merged|critical|delivery|TechCorp|SSRF|connection pool/i;
const DEFLECT = /most recent of \d+ active items|Want me to summarize its recent commits/i;
async function chk(id, q) {
  tests++;
  const a = await stream(q);
  const f = fab(a); if (f.length) fabCount += f.length;
  const d = DEFLECT.test(a); if (d) deflect++;
  const ok = GROUNDED.test(a) && !f.length && !d && a.length > 40;
  if (ok) pass++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${f.length ? ' FAB=' + f : ''}${d ? ' DEFLECT' : ''} :: ${short(a)}`);
}

console.log('\n######### PHASE 6.5 — BRIEFING COMPOSER (real chat) #########\n');
console.log('== Section-8 briefing questions (1 each) ==');
const Q = ['Give me a CEO briefing.', 'Give me an engineering briefing.', "What's happening across the company?",
  'What are the biggest operational risks?', 'Why is engineering at risk?', 'What should I pay attention to today?',
  "What's happening with current incidents?", "What's the current delivery situation?", 'Give me a short executive summary.',
  "Give me the engineering team's priorities."];
for (let i = 0; i < Q.length; i++) await chk('S8.' + (i + 1), Q[i]);

console.log('\n== N=5 on the two flagship briefings ==');
for (let i = 0; i < 5; i++) await chk('CEO#' + (i + 1), 'Give me a CEO briefing.');
for (let i = 0; i < 5; i++) await chk('ENG#' + (i + 1), 'Give me an engineering briefing.');

console.log('\n═══════════════════════════════════════');
console.log(`  tests=${tests} pass=${pass}  FABRICATION=${fabCount}  DEFLECTIONS=${deflect}`);
console.log('BRIEFING_DONE');
await prisma.$disconnect(); process.exit(0);
