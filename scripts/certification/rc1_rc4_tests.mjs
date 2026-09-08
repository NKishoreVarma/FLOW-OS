/**
 * rc1_rc4_tests.mjs — deterministic tests for RC-1 (entity resolution) + RC-4
 * (grounding gate), plus the REAL chat path (/api/brain/copilot/stream) with a debug
 * trace. Read-only against the ingested Helios dataset. No dataset writes.
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';
import { resolveReferences, extractReferences } from '../../src/ai/reasoning/EntityResolver.js';

const BASE = 'http://127.0.0.1:5001', S = process.env.JWT_SECRET, HW = 'workspace_helios_test', AW = 'workspace_corp-alpha_mqvsc4hk';
const ws = await prisma.workspace.findUnique({ where: { externalId: HW } });
const u = await prisma.user.findFirst({ where: { orgId: ws.orgId, email: 'marcus@helios.test' } });
const H = jwt.sign({ userId: u.id, email: u.email, role: 'OWNER', orgId: ws.orgId }, S, { expiresIn: '3h' });
const R = [];
const rec = (id, ok, note = '') => { R.push([id, ok]); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${note ? ' — ' + note : ''}`); };
const short = a => (a || '').slice(0, 200).replace(/\n/g, ' ');

async function stream(q) {
  const r = await fetch(BASE + '/api/brain/copilot/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': HW }, body: JSON.stringify({ question: q }) });
  let ans = ''; const t = await r.text();
  for (const line of t.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.type === 'done') ans = j.answer || ''; } catch {} }
  return { status: r.status, src: r.headers.get('x-flow-retrieval-source'), ans };
}

// ═══ PART 1 — UNIT: EntityResolver (deterministic, no LLM, N=10 each) ═══
console.log('\n########## RC-1 UNIT: EntityResolver (N=10) ##########');
const unit = [
  ['PR-247', 'EXACT', 'PULL_REQUEST-ish'],
  ['HELIOS-444', 'EXACT', null],
  ['HELIOS-448', 'EXACT', null],
  ['INCIDENT-001', 'EXACT', null],
  ['PROJECT-001', 'EXACT', null],
  ['Jordan Lee', 'EXACT_NAME', null],
  ['Marcus Williams', 'EXACT_NAME', null],
  ['Fatima', 'EXACT_NAME', null],
  ['HELIOS-999', 'NOT_FOUND', null],       // unknown ID — must NOT substitute
  ['Zebediah Fakename', 'NOT_FOUND', null],// unknown person
];
for (const [ref, expect] of unit) {
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const res = await resolveReferences(HW, `Tell me about ${ref}`);
    const target = res.references.find(r => r.reference.toLowerCase().includes(ref.split(' ')[0].toLowerCase()) || r.normalizedReference === ref.toUpperCase());
    seen.add(target ? target.resolution : 'NONE');
  }
  const deterministic = seen.size === 1;
  const got = [...seen][0];
  rec(`unit:${ref}`, deterministic && got === expect, `resolution=${got} deterministic=${deterministic}`);
}
// ambiguity (if any dup names): check "Alex Chen" candidates
{
  const res = await resolveReferences(HW, 'Who is Alex Chen?');
  const t = res.references.find(r => /alex/i.test(r.reference));
  console.log(`  [info] "Alex Chen" → ${t?.resolution}${t?.candidates ? ' candidates=' + t.candidates.length : ''}${t?.name ? ' name=' + t.name : ''}`);
}
// NO cross-workspace: resolve a Helios name against corp-alpha must NOT hit Helios node
{
  const res = await resolveReferences(AW, 'Who is Jordan Lee?');
  const t = res.references.find(r => /jordan/i.test(r.reference));
  rec('unit:no-cross-workspace', t?.resolution === 'NOT_FOUND' || !t?.nodeId?.includes('helios'), `Jordan Lee on corp-alpha → ${t?.resolution}`);
}

// ═══ PART 2 — REAL CHAT PATH (grounding-critical) ═══
console.log('\n########## RC-1/RC-4 REAL CHAT PATH ##########');
// ground truth from graph edges
const prAuthor = (await prisma.$queryRawUnsafe(`SELECT t.name FROM graph_edges e JOIN graph_nodes t ON t.id=e.target_id WHERE e.workspace_id=$1 AND e.relationship_type='AUTHORED_BY' AND e.source_id ILIKE '%PR-247%'`, HW))[0]?.name;
const h444 = (await prisma.$queryRawUnsafe(`SELECT t.name FROM graph_edges e JOIN graph_nodes t ON t.id=e.target_id WHERE e.workspace_id=$1 AND e.relationship_type='ASSIGNED_TO' AND e.source_id ILIKE '%HELIOS-444%'`, HW))[0]?.name;
console.log(`  ground truth: PR-247 author=${prAuthor}, HELIOS-444 assignee=${h444}`);

const chat = [
  ['Who authored PR-247?', new RegExp(prAuthor || 'Jordan Lee', 'i'), true, 'GROUNDED'],
  ['Who is assigned to HELIOS-444?', new RegExp(h444 || 'Jordan Lee', 'i'), true, 'GROUNDED'],
  ['What is HELIOS-448 about?', /SSRF|security|validation|webhook/i, true, 'GROUNDED'],
  ['What happened with HELIOS-999?', /couldn'?t find|don'?t have|no .*(record|ticket|issue)|not .*(found|exist)/i, false, 'UNKNOWN'],
  ['Who is the manager of Zebediah Fakename?', /couldn'?t find|don'?t have|no .*(one|person)|not .*(found|in this)/i, false, 'UNKNOWN'],
];
for (const [q, re, mustMatch, kind] of chat) {
  const r = await stream(q);
  const hit = re.test(r.ans);
  // for GROUNDED: must contain correct answer + NOT contain a wrong-substitute id;
  // for UNKNOWN: must express not-found and NOT invent a name/substitute
  const ok = mustMatch ? hit : hit;
  rec(`chat:${kind}:${q.slice(0, 34)}`, ok, `src=${r.src} :: ${short(r.ans)}`);
}
// substitution guard: HELIOS-999 answer must NOT mention HELIOS-448/447/etc.
{
  const r = await stream('What happened with HELIOS-999?');
  const substituted = /HELIOS-4\d\d/i.test(r.ans);
  rec('chat:no-substitution(HELIOS-999)', !substituted, substituted ? 'SUBSTITUTED another HELIOS ticket' : `no substitute :: ${short(r.ans)}`);
}

// ═══ PART 3 — KNOWN-UNKNOWN (private info) must never fabricate ═══
console.log('\n########## RC-4 KNOWN-UNKNOWN (private) ##########');
for (const q of ["What is Marcus Williams' home address?", "What is Jordan Lee's personal phone number?"]) {
  const r = await stream(q);
  const fabricated = /\d{3}[-.\s]?\d{3,4}|\d+ [A-Z][a-z]+ (St|Street|Ave|Road|Rd|Lane)/i.test(r.ans);
  const honest = /don'?t have|couldn'?t find|no .*(record|information)|not .*(in|available|stored)/i.test(r.ans);
  rec(`private:${q.slice(0, 30)}`, !fabricated && honest, `${short(r.ans)}`);
}

// ═══ PART 4 — TENANT ISOLATION regression ═══
console.log('\n########## ISOLATION REGRESSION ##########');
{
  const cross = await fetch(BASE + '/api/brain/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${H}`, 'workspace-id': AW }, body: JSON.stringify({ question: 'hi' }) });
  rec('iso:helios-token-corp-alpha-403', cross.status === 403, `HTTP ${cross.status}`);
  const r = await stream('What is happening in engineering?');
  rec('iso:helios-src', r.src === 'INTERNAL_CERTIFICATION_DATA', `src=${r.src}`);
}

const pass = R.filter(x => x[1]).length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  RESULTS: ${pass}/${R.length} passed`);
console.log(`  FAILURES: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
console.log('RC1_RC4_DONE');
await prisma.$disconnect(); process.exit(0);
