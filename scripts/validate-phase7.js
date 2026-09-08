#!/usr/bin/env node
/**
 * validate-phase7.js — Phase 7 Workflow Pack smoke-test (no live server)
 *
 * Tests:
 *   1.  ActionRegistry loads Gmail + Jira definitions from the filesystem
 *   2.  All 20 action IDs are present (10 gmail + 10 jira)
 *   3.  ActionValidator accepts all 20 definitions
 *   4.  Each required action passes input validation
 *   5.  CustomerComplaintPlanner generates a valid 8-step plan
 *   6.  EngineeringBugIntakePlanner generates a valid 7-step plan
 *   7.  WeeklyCustomerFollowUpPlanner generates a valid 7-step plan
 *   8.  Priority inference works correctly for keyword signals
 *   9.  buildPayload closures are executable functions
 *  10.  ActionSearch returns relevant results for 'email', 'issue', 'sprint'
 *
 * Run: node scripts/validate-phase7.js
 */

import { actionRegistry, loadRegistry, ActionValidator } from '../src/actionRegistry/index.js';
import { ActionSearch }                                  from '../src/actionRegistry/ActionSearch.js';
import { buildCustomerComplaintPlan }                    from '../src/workflows/planner/CustomerComplaintPlanner.js';
import { buildEngineeringBugIntakePlan }                 from '../src/workflows/planner/EngineeringBugIntakePlanner.js';
import { buildWeeklyCustomerFollowUpPlan }               from '../src/workflows/planner/WeeklyCustomerFollowUpPlanner.js';

let pass = 0;
let fail = 0;

function assert(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    pass++;
  } catch (err) {
    console.error(`  ❌  ${label}`);
    console.error(`      ${err.message}`);
    fail++;
  }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function gt(a, b, msg) {
  if (!(a > b)) throw new Error(`${msg} — expected > ${b}, got ${a}`);
}

function includes(arr, val, msg) {
  if (!arr.includes(val)) throw new Error(`${msg} — "${val}" not found in [${arr.join(', ')}]`);
}

// ── 1. Load registry ─────────────────────────────────────────────────────────

console.log('\n── Phase 7 Validation ─────────────────────────────────────────────────\n');

console.log('1. Registry load');
await loadRegistry();

assert('Registry loaded without errors', () => {
  const stats = actionRegistry.stats();
  gt(stats.total, 0, 'total actions');
});

// ── 2. All 20 action IDs present ─────────────────────────────────────────────

console.log('\n2. Action presence (20 actions)');

const GMAIL_ACTIONS = [
  'gmail.read_email', 'gmail.search_emails', 'gmail.send_email',
  'gmail.reply_email', 'gmail.forward_email', 'gmail.draft_email',
  'gmail.archive_email', 'gmail.label_email', 'gmail.schedule_email',
  'gmail.follow_up',
];

const JIRA_ACTIONS = [
  'jira.create_issue', 'jira.update_issue', 'jira.assign_issue',
  'jira.transition_issue', 'jira.comment_issue', 'jira.create_subtask',
  'jira.create_sprint', 'jira.close_issue', 'jira.prioritize_backlog',
  'jira.generate_report',
];

for (const id of [...GMAIL_ACTIONS, ...JIRA_ACTIONS]) {
  assert(`Registry has ${id}`, () => {
    const def = actionRegistry.resolve(id);
    eq(def.id, id, 'id matches');
  });
}

// ── 3. All definitions pass validation ───────────────────────────────────────

console.log('\n3. Definition validation');

assert('All gmail actions pass ActionValidator', () => {
  for (const id of GMAIL_ACTIONS) {
    ActionValidator.validateDefinition(actionRegistry.resolve(id));
  }
});

assert('All jira actions pass ActionValidator', () => {
  for (const id of JIRA_ACTIONS) {
    ActionValidator.validateDefinition(actionRegistry.resolve(id));
  }
});

// ── 4. Input validation ───────────────────────────────────────────────────────

console.log('\n4. Input validation');

assert('gmail.send_email accepts valid inputs', () => {
  const r = actionRegistry.validateInputs('gmail.send_email', { to: 'a@b.com', subject: 'Hi', body: 'Hello' });
  if (!r.valid) throw new Error(r.errors.join('; '));
});

assert('gmail.send_email rejects missing inputs', () => {
  const r = actionRegistry.validateInputs('gmail.send_email', {});
  if (r.valid) throw new Error('Expected validation to fail');
});

assert('jira.create_issue accepts valid inputs', () => {
  const r = actionRegistry.validateInputs('jira.create_issue', { projectKey: 'HPLT', title: 'Bug', issueType: 'Bug' });
  if (!r.valid) throw new Error(r.errors.join('; '));
});

assert('jira.transition_issue accepts valid inputs', () => {
  const r = actionRegistry.validateInputs('jira.transition_issue', { key: 'HPLT-1', status: 'In Progress' });
  if (!r.valid) throw new Error(r.errors.join('; '));
});

// ── 5. CustomerComplaintPlanner ───────────────────────────────────────────────

console.log('\n5. CustomerComplaintPlanner');

const ccPlan = buildCustomerComplaintPlan({
  workspaceId:   'ws-test',
  messageId:     'msg-001',
  subject:       'Product broken',
  customerEmail: 'user@example.com',
  ownerName:     'Rahul Singh',
});

assert('Returns workflowId: customer-complaint-resolution', () => {
  eq(ccPlan.workflowId, 'customer-complaint-resolution', 'workflowId');
});

assert('Has 8 steps', () => eq(ccPlan.steps.length, 8, 'step count'));

assert('First step reads gmail', () => {
  eq(ccPlan.steps[0].connectorId, 'gmail', 'connectorId');
  eq(ccPlan.steps[0].actionType, 'read', 'actionType');
});

assert('Step 6 is an approval gate', () => {
  eq(ccPlan.steps[5].type, 'approval', 'step type');
});

assert('Last step closes Jira issue (critical:false)', () => {
  const last = ccPlan.steps[ccPlan.steps.length - 1];
  eq(last.connectorId, 'jira', 'connectorId');
  eq(last.critical, false, 'critical');
});

assert('buildPayload closures are callable', () => {
  const step = ccPlan.steps.find(s => typeof s.buildPayload === 'function');
  if (!step) throw new Error('No buildPayload step found');
  const ctx = { variables: { _jiraIssue: { key: 'HPLT-42' } } };
  const payload = step.buildPayload(ctx);
  if (!payload) throw new Error('buildPayload returned falsy');
});

// ── 6. EngineeringBugIntakePlanner ───────────────────────────────────────────

console.log('\n6. EngineeringBugIntakePlanner');

const ebPlan = buildEngineeringBugIntakePlan({
  workspaceId:   'ws-eng',
  messageId:     'msg-002',
  bugTitle:      'critical: payment service down',
  reporterEmail: 'reporter@acme.com',
});

assert('Returns workflowId: engineering-bug-intake', () => {
  eq(ebPlan.workflowId, 'engineering-bug-intake', 'workflowId');
});

assert('Has 7 steps', () => eq(ebPlan.steps.length, 7, 'step count'));

assert('Infers Highest priority for "critical" keyword', () => {
  eq(ebPlan.summary.inferredPriority, 'Highest', 'priority');
});

assert('Jira create step uses Bug issueType', () => {
  const step = ebPlan.steps.find(s => s.connectorId === 'jira' && s.actionType === 'create');
  eq(step.payload.issueType, 'Bug', 'issueType');
});

assert('Last step archives the email', () => {
  const last = ebPlan.steps[ebPlan.steps.length - 1];
  eq(last.id, 'archive_email', 'id');
  eq(last.critical, false, 'critical');
});

// ── 7. WeeklyCustomerFollowUpPlanner ─────────────────────────────────────────

console.log('\n7. WeeklyCustomerFollowUpPlanner');

const wfPlan = buildWeeklyCustomerFollowUpPlan({ workspaceId: 'ws-followup', waitDays: 10 });

assert('Returns workflowId: weekly-customer-followup', () => {
  eq(wfPlan.workflowId, 'weekly-customer-followup', 'workflowId');
});

assert('Has 7 steps', () => eq(wfPlan.steps.length, 7, 'step count'));

assert('Search query respects waitDays=10', () => {
  if (!wfPlan.summary.searchQuery.includes('older_than:10d'))
    throw new Error(`Query missing older_than:10d: ${wfPlan.summary.searchQuery}`);
});

assert('Conditional step has then + else branches', () => {
  const cond = wfPlan.steps.find(s => s.type === 'conditional');
  if (!cond.then || !cond.else) throw new Error('Missing then/else');
  eq(cond.else.type, 'skip', 'else.type');
});

assert('Approval gate is present', () => {
  const approval = wfPlan.steps.find(s => s.type === 'approval');
  if (!approval) throw new Error('No approval step found');
  eq(approval.id, 'approve_batch', 'approval.id');
});

// ── 8. ActionSearch ──────────────────────────────────────────────────────────

console.log('\n8. ActionSearch');

const allDefs = actionRegistry.list({});

assert('"email" query returns gmail actions', () => {
  const results = ActionSearch.search('email', allDefs);
  const hasGmail = results.some(r => r.connector === 'gmail');
  if (!hasGmail) throw new Error('No gmail actions in results');
});

assert('"issue" query returns jira actions', () => {
  const results = ActionSearch.search('issue', allDefs);
  const hasJira = results.some(r => r.connector === 'jira');
  if (!hasJira) throw new Error('No jira actions in results');
});

assert('"sprint" query returns jira.create_sprint', () => {
  const results = ActionSearch.search('sprint', allDefs);
  includes(results.map(r => r.id), 'jira.create_sprint', '"sprint" search');
});

assert('Result set for "email" is non-empty', () => {
  const results = ActionSearch.search('email', allDefs);
  gt(results.length, 0, 'email result count');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────────────────────────────────────────`);
console.log(`  Phase 7 Validation: ${pass} PASS / ${fail} FAIL`);
console.log(`──────────────────────────────────────────────────────────────────────\n`);

if (fail > 0) process.exit(1);
