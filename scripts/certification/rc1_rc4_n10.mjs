/**
 * rc1_rc4_n10.mjs — N=10 determinism on the REAL chat path for the grounding-critical
 * questions (spec: exact-ID 100%, no substitution 100%, unknown-fabrication 0%).
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '3h' });
async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return ans;
}
const cases = [
  ['Who authored PR-247?', /Jordan Lee/i, null, 'author=Jordan Lee'],
  ['Who is assigned to HELIOS-444?', /Jordan Lee/i, null, 'assignee=Jordan Lee'],
  ['What happened with HELIOS-999?', /couldn'?t find|don'?t have|not .*(found|exist)/i, /HELIOS-4\d\d/i, 'UNKNOWN, no substitute'],
  ['Who is the manager of Zebediah Fakename?', /couldn'?t find|don'?t have|not .*(found|in this)/i, /Miguel|Claire|Sarah|Ben Williams/i, 'UNKNOWN, no invented person'],
];
console.log('\n########## N=10 REAL CHAT PATH ##########');
for (const [q, want, forbid, label] of cases) {
  let good = 0, bad = 0;
  for (let i = 0; i < 10; i++) {
    const a = await stream(q);
    const ok = want.test(a) && (!forbid || !forbid.test(a));
    ok ? good++ : bad++;
    if (!ok) console.log(`    ✗ run${i + 1}: ${a.slice(0, 110).replace(/\n/g, ' ')}`);
  }
  console.log(`  [${good === 10 ? 'PASS' : 'FAIL'}] ${q.slice(0, 40)} — ${good}/10 correct (${label})`);
}
console.log('N10_DONE');
await prisma.$disconnect(); process.exit(0);
