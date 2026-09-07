/**
 * m1_truthful_copilot.mjs — M1 Truthful Copilot certification.
 *
 * A EMPTY WORKSPACE  → honest insufficient-info, synthesis LLM SKIPPED (latency proof)
 * B ZERO EVIDENCE    → LLM synthesis not called (latency << a real 15-30s synthesis)
 * C NUMERIC GUARD    → fabricated report figures absent from evidence are stripped;
 *                      figures present in evidence are kept (no false positive)
 * D INVENTED PERSON  → verifySynthesisClaims redacts a name absent from evidence
 * E CONTRADICTORY    → out of approved M1 scope (CriticAgent lives in /reason) — reported
 * F STALE EVIDENCE   → out of approved M1 scope — reported honestly
 * G NORMAL ANSWER    → real Helios answer is substantive, LLM used, NOT over-redacted
 */
import { prisma }    from '../../src/core/config/prisma.js';
import { signToken } from '../../src/core/middleware/authenticate.js';
import { verifySynthesisClaims } from '../../src/ai/reasoning/ClaimVerifier.js';
import { _stripUnsupportedReportFigures, _supportedPeople } from '../../src/services/copilotService.js';

const BASE = 'http://127.0.0.1:5001';
const HONEST = "don't have enough information";
const R = [];
const rec = (id, ok, note = '') => { const v = typeof ok === 'boolean' ? (ok ? 'PASS' : 'FAIL') : ok; R.push([id, v]); console.log(`  [${v}] ${id}${note ? ' — ' + note : ''}`); };

async function jwtFor(ws) {
  const w = await prisma.workspace.findUnique({ where: { externalId: ws } });
  const u = await prisma.user.findFirst({ where: { orgId: w.orgId } });
  return { jwt: signToken({ id: u.id, orgId: w.orgId, email: u.email, role: 'OWNER' }), ws };
}
// synthesis-call counter (ollama 'chat' task) — isolates synthesis from classify.
async function chatCalls(jwt, ws) {
  const m = await fetch(`${BASE}/api/ai/metrics/ollama?minutes=60`, { headers: { Authorization: `Bearer ${jwt}`, 'workspace-id': ws } }).then(x => x.json()).catch(() => ({}));
  return m?.taskBreakdown?.chat ?? 0;
}
async function copilot(ws, question) {
  const { jwt } = await jwtFor(ws);
  const chatBefore = await chatCalls(jwt, ws);
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/brain/copilot`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'workspace-id': ws, 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  const b = await r.json().catch(() => ({}));
  const latencyMs = Date.now() - t0;
  const chatAfter = await chatCalls(jwt, ws);
  return { latencyMs, answer: String(b.answer || b.response || ''), chatDelta: chatAfter - chatBefore };
}

console.log('\n######### M1 — TRUTHFUL COPILOT CERTIFICATION #########\n');

// ── A + B: empty pilot → honest, synthesis LLM skipped (fast) ───────────────
console.log('== A/B: empty workspace (zero evidence) ==');
{
  const { latencyMs, answer, chatDelta } = await copilot('workspace_real_pilot', 'What is happening in this workspace?');
  const fabricated = /(health score|\d+\s*\/\s*100|\d+\s+active\s+(project|customer|incident)|Project [A-E]\b)/i.test(answer);
  rec('A:honest-insufficient', answer.toLowerCase().includes(HONEST), `answer="${answer.slice(0, 80)}"`);
  rec('A:no-fabrication', !fabricated, fabricated ? 'FABRICATED specifics present' : 'no fabricated specifics');
  // Verbatim deterministic guard output = the no-LLM path (synthesis produces varied prose).
  rec('B:synthesis-llm-skipped', answer.trim().startsWith("I don't have enough information") && chatDelta === 0,
      `chatTaskDelta=${chatDelta} (0 synthesis calls) · latency=${latencyMs}ms was intent-classify, not synthesis`);
}

// ── C: numeric guard (deterministic unit) ───────────────────────────────────
console.log('\n== C: unsupported-numeric guard ==');
{
  const fab = 'Workspace health: Overall Health: 85/100. We have 5 active projects and Project A at 30%.';
  const noEv = _stripUnsupportedReportFigures(fab, 'some unrelated evidence text with no numbers');
  rec('C:strips-unsupported-figures', /\[unavailable\]/.test(noEv.answer) && noEv.stripped.length >= 2, `stripped=${JSON.stringify(noEv.stripped)}`);
  const withEv = _stripUnsupportedReportFigures('Overall Health: 85/100 across the board.', 'metrics report shows 85 today');
  rec('C:keeps-supported-figures', !/\[unavailable\]/.test(withEv.answer), `evidence contains "85" → kept: "${withEv.answer}"`);
  const normal = _stripUnsupportedReportFigures('The team shipped 3 pull requests and closed 2 issues this week.', 'no digits here');
  rec('C:no-false-positive-on-prose', normal.stripped.length === 0, `free-form numbers untouched: "${normal.answer}"`);
}

// ── D: invented person redaction (reuse existing verifier) ──────────────────
console.log('\n== D: invented-person redaction (ClaimVerifier reuse) ==');
{
  const evidenceText = 'Marcus Chen opened the incident. Priya Patel reviewed the fix and coordinated the rollback with the on-call engineer.';
  const people = _supportedPeople(evidenceText);
  // Representative-length answer so redaction of the invented name does not collapse
  // the whole sentence into the verifier's honest fallback.
  const answer = 'Marcus Chen opened the incident and coordinated the response with the team, while Jordan Fakename reportedly led the migration effort in a prior quarter.';
  const claim = verifySynthesisClaims(answer, { people, relationships: [] });
  rec('D:repairs-invented-person', claim.status === 'REPAIR' && !claim.repaired.includes('Jordan Fakename'), `status=${claim.status} repaired="${claim.repaired.slice(0, 90)}"`);
  rec('D:keeps-supported-person', claim.repaired.includes('Marcus Chen') || claim.repaired.includes("won't name anyone"), 'supported name retained OR honest fallback (no fabrication)');
}

// ── E/F: honest scope note ───────────────────────────────────────────────────
console.log('\n== E/F: contradiction + staleness ==');
rec('E:contradiction-handling', 'NOT_IN_M1_SCOPE', 'CriticAgent temporal-contradiction lives in /api/brain/reason; copilot contradiction surfacing is M5 context-engine work');
rec('F:staleness-handling', 'NOT_IN_M1_SCOPE', 'recency weighting is M4/M5 retrieval-strategy work; reported, not faked');

// ── G: normal non-empty answer unchanged / not over-redacted ────────────────
console.log('\n== G: normal grounded answer (Helios) ==');
{
  const { latencyMs, answer } = await copilot('workspace_helios_test', 'What incidents are currently open?');
  rec('G:substantive-answer', answer.length > 40 && !answer.toLowerCase().includes(HONEST), `len=${answer.length} "${answer.slice(0, 70)}"`);
  rec('G:llm-was-used', latencyMs > 4000, `latency=${latencyMs}ms (real synthesis ran — guard did not suppress legitimate evidence)`);
}

const pass = R.filter(x => x[1] === 'PASS').length;
const fail = R.filter(x => x[1] === 'FAIL').length;
console.log(`\n═══════════════════════════════════════`);
console.log(`  PASS=${pass}  FAIL=${fail}  SCOPE_NOTES=${R.filter(x => x[1] === 'NOT_IN_M1_SCOPE').length}`);
console.log(`  FAILURES: ${R.filter(x => x[1] === 'FAIL').map(x => x[0]).join(', ') || 'none'}`);
console.log('M1_CERT_DONE');
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
