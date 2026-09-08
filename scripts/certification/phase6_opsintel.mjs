/**
 * phase6_opsintel.mjs — operational-intelligence / multi-hop reasoning test. Real chat
 * path, read-only. Captures FULL answers for manual FACT/INFERENCE/RISK/UNKNOWN grading.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '4h' });
async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return ans;
}
const Q = [
  "What's happening in engineering?",
  'What are the biggest engineering risks?',
  'Why is engineering at risk?',
  'Which issues are connected to the current incident?',
  'Which people are involved in the current engineering risks?',
  'Which PRs are related to security?',
  'Who is overloaded?',
  'What work is blocking delivery?',
  'What should I pay attention to today?',
  'Give me a CEO briefing.',
  'Give me an engineering manager briefing.',
  'Give me a 30-second summary.',
  'Explain the biggest risk and the evidence behind it.',
  'What evidence supports your conclusion?',
  'What are you uncertain about?',
];
console.log('\n######### PHASE 6 — OPERATIONAL INTELLIGENCE #########\n');
for (let i = 0; i < Q.length; i++) {
  const a = await stream(Q[i]);
  console.log(`\n───────── Q${i + 1}: ${Q[i]}`);
  console.log(a.replace(/\n{2,}/g, '\n').trim());
}
console.log('\nPHASE6_DONE');
await prisma.$disconnect(); process.exit(0);
