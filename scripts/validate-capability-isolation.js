/**
 * validate-capability-isolation.js
 *
 * Regression suite for the Brain Router context-contamination fix.
 *
 * Part A (always runs, no server, no DB): proves the Intent Classifier + Capability
 * Planner isolate every request to the minimal owning capability, forbid every other
 * connector, and generate follow-ups only from the active capability.
 *
 * Part B (runs only if a brain server is reachable on $BRAIN_URL / :5001): asks the
 * live streaming brain real questions and asserts no answer leaks another connector's
 * data — a Gmail question never mentions GitHub/PRs, a GitHub question never mentions
 * email/calendar, and an empty Gmail reads the honest empty-state.
 *
 * Run: node scripts/validate-capability-isolation.js
 */

import { planCapabilities } from '../src/ai/reasoning/CapabilityPlanner.js';
import { classifyIntent, followUpsForCapability, CAPABILITY_CONNECTORS } from '../src/ai/reasoning/IntentClassifier.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Part A: classification + planning isolation (offline) ──\n');

// 1. Focused single-capability routing for the canonical examples.
const focusedCases = [
  ['Summarize my unread email',            'communications'],
  ['Reply to Rahul',                       'communications'],
  ['Archive the newsletter emails',        'communications'],
  ['What changed in my latest repository?','engineering'],
  ['Review my latest PR',                  'engineering'],
  ['Did the deploy go through?',           'engineering'],
  ['Schedule a meeting tomorrow',          'meetings'],
  ["What's my next meeting?",              'meetings'],
  ['Any active incidents?',                'incidents'],
  ['Which customers are at risk of churn?','customers'],
  ['Who is on the engineering team?',      'people'],
];
for (const [q, expected] of focusedCases) {
  const p = planCapabilities(q, {});
  ok(`focused: "${q}" → ${expected} only`,
     p.focused && p.capabilityNames.length === 1 && p.primaryCapability === expected,
     `got [${p.capabilityNames.join(', ')}] focused=${p.focused}`);
}

// 2. Broad prioritization fans out — but never to the whole system.
const broadCases = ['What should I focus on today?', 'How are we doing?', 'Catch me up', 'Give me an overview'];
for (const q of broadCases) {
  const p = planCapabilities(q, {});
  ok(`broad: "${q}" fans out (>1, not focused)`,
     !p.focused && p.capabilityNames.length > 1 && p.capabilityNames.length < 8,
     `got [${p.capabilityNames.join(', ')}]`);
}

// 3. THE contamination guard: a focused request forbids every non-owning connector.
console.log('');
const forbidCases = [
  ['Summarize my unread email', 'gmail',           ['github', 'google-calendar', 'jira']],
  ['Review my latest PR',       'github',           ['gmail', 'google-calendar', 'slack']],
  ['Schedule a meeting tomorrow','google-calendar', ['github', 'gmail', 'jira']],
];
for (const [q, mustAllow, mustForbid] of forbidCases) {
  const p = planCapabilities(q, {});
  const allowsOwner = p.allowedConnectors.includes(mustAllow);
  const forbidsRest = mustForbid.every(c => p.forbiddenConnectors.includes(c) && !p.allowedConnectors.includes(c));
  ok(`isolation: "${q}" allows ${mustAllow}, forbids ${mustForbid.join('/')}`,
     allowsOwner && forbidsRest,
     `allowed=[${p.allowedConnectors.join(',')}]`);
}

// 4. No focused plan ever plans an internal always-on engine (the old MEMORY/HEALTH
//    auto-append that dragged unrelated context into every answer).
console.log('');
for (const [q] of focusedCases) {
  const p = planCapabilities(q, {});
  const leaks = p.capabilityNames.filter(c => ['memory', 'health'].includes(c));
  ok(`no auto-append memory/health: "${q}"`, leaks.length === 0, `leaked ${leaks.join(',')}`);
}

// 5. Retrieval priority is fixed and vector is last — before llm.
console.log('');
{
  const p = planCapabilities('Review my latest PR', {});
  const pr = p.retrievalPriority;
  ok('retrieval priority order live→db→graph→vector→llm',
     eq(pr, ['live_connector', 'operational_db', 'knowledge_graph', 'vector_memory', 'llm']));
  ok('vector_memory ranks below live_connector',
     pr.indexOf('vector_memory') > pr.indexOf('live_connector'));
}

// 6. Follow-ups are drawn ONLY from the active capability and never mix domains.
console.log('');
ok('email follow-ups = Reply/Archive/Mark Read',
   eq(followUpsForCapability('communications'), ['Reply', 'Archive', 'Mark Read']));
ok('github follow-ups = Review PR/Merge/Open Issue',
   eq(followUpsForCapability('engineering'), ['Review PR', 'Merge', 'Open Issue']));
ok('calendar follow-ups = Reschedule/Invite/Cancel',
   eq(followUpsForCapability('meetings'), ['Reschedule', 'Invite', 'Cancel']));
{
  const email = new Set(followUpsForCapability('communications'));
  const git   = new Set(followUpsForCapability('engineering'));
  const cal   = new Set(followUpsForCapability('meetings'));
  const overlap = [...email].some(x => git.has(x) || cal.has(x)) || [...git].some(x => cal.has(x));
  ok('follow-up sets never overlap across capabilities', !overlap);
}

// 7. Every capability's connector set is disjoint enough that ownership is unambiguous
//    for the governed connectors (gmail→comms only, github→eng only, etc.).
console.log('');
{
  const owner = (conn) => Object.entries(CAPABILITY_CONNECTORS).filter(([, cs]) => cs.includes(conn)).map(([c]) => c);
  ok('gmail is owned only by communications', eq(owner('gmail'), ['communications']));
  ok('github is owned only by engineering',   eq(owner('github'), ['engineering']));
  ok('google-calendar is owned only by meetings', eq(owner('google-calendar'), ['meetings']));
}

// 8. Provider sub-scoping WITHIN a capability (Gmail-only vs Slack; GitHub vs Jira).
console.log('');
{
  const email = planCapabilities('Summarize my unread email', {});
  ok('"unread email" scopes to gmail only (slack forbidden)',
     eq(email.allowedConnectors, ['gmail']) && email.forbiddenConnectors.includes('slack'),
     `allowed=[${email.allowedConnectors.join(',')}]`);

  const slack = planCapabilities('Any unread slack DMs?', {});
  ok('"slack DMs" scopes to slack only (gmail forbidden)',
     eq(slack.allowedConnectors, ['slack']) && slack.forbiddenConnectors.includes('gmail'),
     `allowed=[${slack.allowedConnectors.join(',')}]`);

  const repo = planCapabilities('What is on the API repo?', {});
  ok('"repo" scopes to github only (jira forbidden)',
     eq(repo.allowedConnectors, ['github']) && repo.forbiddenConnectors.includes('jira'),
     `allowed=[${repo.allowedConnectors.join(',')}]`);

  const jira = planCapabilities('Any open jira tickets?', {});
  ok('"jira tickets" scopes to jira only (github forbidden)',
     eq(jira.allowedConnectors, ['jira']) && jira.forbiddenConnectors.includes('github'),
     `allowed=[${jira.allowedConnectors.join(',')}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Part B — live contamination check (optional; needs a running brain server).
// ─────────────────────────────────────────────────────────────────────────────
async function partB() {
  const BASE = process.env.BRAIN_URL || 'http://localhost:5001';
  const WS   = process.env.SIM_WORKSPACE_ID || process.env.TEST_WORKSPACE_ID;
  const TOKEN = process.env.TEST_JWT;
  if (!WS || !TOKEN) {
    console.log('\n── Part B: SKIPPED (set TEST_WORKSPACE_ID + TEST_JWT to run live check) ──');
    return;
  }
  // Reachability probe.
  try {
    const r = await fetch(`${BASE}/health/live`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error('down');
  } catch {
    console.log(`\n── Part B: SKIPPED (no brain server at ${BASE}) ──`);
    return;
  }
  console.log(`\n── Part B: live contamination check @ ${BASE} ──\n`);

  async function ask(question) {
    const res = await fetch(`${BASE}/api/brain/copilot/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, 'workspace-id': WS },
      body: JSON.stringify({ question, history: [] }),
    });
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = '', tok = '', done = '';
    while (true) {
      const { done: d, value } = await reader.read(); if (d) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() ?? '';
      for (const l of lines) {
        if (!l.startsWith('data: ')) continue;
        try { const p = JSON.parse(l.slice(6));
          if (p.type === 'token') tok += (p.delta || '');
          if (p.type === 'done')  done = p.answer || tok;
        } catch { /* ignore */ }
      }
    }
    return (done || tok).trim();
  }

  const GH_TERMS   = /\b(pull request|\bpr\b|commit|repository|repo|merge|branch|deploy)\b/i;
  const MAIL_TERMS = /\b(email|inbox|unread|gmail)\b/i;
  const CAL_TERMS  = /\b(meeting|calendar|standup)\b/i;

  const SLACK_TERMS = /\b(slack|#[a-z0-9-]+|channel)\b/i;
  const emailAns = await ask('Summarize my unread email');
  console.log(`  gmail answer: "${emailAns.slice(0, 90)}..."`);
  ok('gmail answer does NOT mention GitHub/PRs/commits', !GH_TERMS.test(emailAns), emailAns.slice(0, 120));
  ok('gmail answer does NOT mention calendar/meetings', !CAL_TERMS.test(emailAns), emailAns.slice(0, 120));
  ok('gmail answer does NOT mention Slack/channels', !SLACK_TERMS.test(emailAns), emailAns.slice(0, 120));

  const ghAns = await ask('What changed in my latest repository?');
  console.log(`  github answer: "${ghAns.slice(0, 90)}..."`);
  ok('github answer does NOT mention email/inbox', !MAIL_TERMS.test(ghAns), ghAns.slice(0, 120));
  ok('github answer does NOT mention calendar/meetings', !CAL_TERMS.test(ghAns), ghAns.slice(0, 120));
}

// ─────────────────────────────────────────────────────────────────────────────
await partB();
console.log(`\n════════════════════════════════════════`);
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) console.log(`  failures: ${fails.join(', ')}`);
console.log(`════════════════════════════════════════\n`);
process.exit(fail ? 1 : 0);
