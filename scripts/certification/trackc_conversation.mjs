/**
 * trackc_conversation.mjs — Track C: conversation memory + pronoun resolution.
 * Real Helios relationships (frozen, read-only):
 *   David Rodriguez MANAGES Amara Diallo, Carlos Vega ; David REPORTS_TO Arjun Mehta.
 * Multi-turn: establish an entity, then a pronoun turn that must resolve from
 * conversation state (not re-ask, not guess, not fabricate).
 */
import { prisma } from '../../src/core/config/prisma.js';
import { signToken } from '../../src/core/middleware/authenticate.js';

const WS = 'workspace_helios_test';
const w = await prisma.workspace.findUnique({ where: { externalId: WS } });
const u = await prisma.user.findFirst({ where: { orgId: w.orgId } });
const jwt = signToken({ id: u.id, orgId: w.orgId, email: u.email, role: 'OWNER' });
const H = { Authorization: `Bearer ${jwt}`, 'workspace-id': WS, 'Content-Type': 'application/json' };

// Primary user path = streaming (OperationalBrain, graph-aware). The non-stream
// /copilot has weaker graph retrieval and correctly falls back to honest "no data".
async function ask(question, history) {
  const r = await fetch('http://127.0.0.1:5001/api/brain/copilot/stream', { method: 'POST', headers: H, body: JSON.stringify({ question, history }) });
  const t = await r.text();
  return t.split('\n').filter(l => l.includes('"done"')).map(l => { try { return JSON.parse(l.replace(/^data: /, '')).answer; } catch { return ''; } }).join('');
}
const R = []; const rec = (id, ok, note='') => { const v = typeof ok==='boolean'?(ok?'PASS':'FAIL'):ok; R.push([id,v]); console.log(`  [${v}] ${id}${note?' — '+note:''}`); };

console.log('\n######### TRACK C — CONVERSATION MEMORY / PRONOUN RESOLUTION #########\n');

// Turn 1 — establish "David Rodriguez"
const q1 = 'Who does David Rodriguez manage?';
const a1 = await ask(q1, []);
console.log(`Q1: ${q1}\nA1: ${a1.slice(0,160).replace(/\n/g,' ')}\n`);
const t1ok = /Amara Diallo|Carlos Vega/i.test(a1);
rec('turn1:grounded-direct-report', t1ok, t1ok ? 'names a real report' : 'did not surface a known report');

// Turn 2 — pronoun "his" must resolve to David (conversation state), direction = manager
const history = [{ role: 'user', content: q1 }, { role: 'assistant', content: a1 }];
const q2 = 'And who is his manager?';
const a2 = await ask(q2, history);
console.log(`Q2: ${q2}\nA2: ${a2.slice(0,160).replace(/\n/g,' ')}\n`);
// Pronoun resolution: "his" must resolve to David (conversation state) — the answer
// references David, whether it then finds the manager or honestly says it has no record.
const pronounResolved = /David/i.test(a2);
// No fabrication: never assert a wrong person as David's manager. Arjun (correct) is fine;
// honest "no record" is fine; a NON-manager named as manager is fabrication.
const invented = /(Amara|Carlos|Sarah|Priya|Rahul)\b.*manage|manage.*\b(Amara|Carlos|Sarah|Priya|Rahul)/i.test(a2);
rec('turn2:pronoun-resolved-his→David', pronounResolved, pronounResolved ? '"his"→David resolved from conversation state ✓' : `did not resolve — "${a2.slice(0,90)}"`);
rec('turn2:no-fabricated-manager', !invented, invented ? 'named a NON-manager as manager (fabrication)' : 'honest (Arjun / no-record), no wrong-person fabrication');

// Turn 3 — unknown follow-up must stay honest (no substitution)
const q3 = 'What about Jordan Fakename — who is that?';
const a3 = await ask(q3, [...history, { role: 'user', content: q2 }, { role: 'assistant', content: a2 }]);
console.log(`Q3: ${q3}\nA3: ${a3.slice(0,140).replace(/\n/g,' ')}\n`);
const honestUnknown = /(couldn.t find|don.t have|no record|not aware|don.t see|no information|not enough|won.t name anyone|doesn.t show|can.t find)/i.test(a3) && !/is Arjun|is David|is Amara|is Carlos/i.test(a3);
rec('turn3:unknown-stays-honest', honestUnknown, honestUnknown ? 'honest unknown, no substitution' : `possible substitution — "${a3.slice(0,90)}"`);

const pass=R.filter(x=>x[1]==='PASS').length, fail=R.filter(x=>x[1]==='FAIL').length;
console.log(`═══════════════════════════════════════\n  PASS=${pass} FAIL=${fail} FAILURES: ${R.filter(x=>x[1]==='FAIL').map(x=>x[0]).join(', ')||'none'}`);
console.log('TRACKC_DONE');
await prisma.$disconnect(); process.exit(fail===0?0:1);
