/**
 * Unit tests — Phase 7 Workflow Planners
 *
 * Validates that each planner:
 *   - Throws on missing required params
 *   - Returns a valid plan shape (workflowId, steps[], summary)
 *   - Emits the correct sequence of step types/connectorIds
 *   - Honours overrides (jiraProjectKey, slackChannelId, etc.)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerComplaintPlan }      from '../../src/workflows/planner/CustomerComplaintPlanner.js';
import { buildEngineeringBugIntakePlan }   from '../../src/workflows/planner/EngineeringBugIntakePlanner.js';
import { buildWeeklyCustomerFollowUpPlan } from '../../src/workflows/planner/WeeklyCustomerFollowUpPlanner.js';

function expect(actual) {
  return {
    toBe(expected) { assert.strictEqual(actual, expected); },
    toEqual(expected) { assert.deepStrictEqual(actual, expected); },
    toBeDefined() { assert.notStrictEqual(actual, undefined); },
    toBeGreaterThan(val) { assert.ok(actual > val, `expected ${actual} > ${val}`); },
    toContain(val) { assert.ok(actual?.includes ? actual.includes(val) : false, `expected to contain ${val}`); },
    toHaveLength(len) { assert.strictEqual(actual.length, len); },
    toThrow(expectedError) {
      if (typeof actual === 'function') {
        if (expectedError) assert.throws(actual, expectedError);
        else assert.throws(actual);
      }
    },
    not: {
      toThrow() { if (typeof actual === 'function') assert.doesNotThrow(actual); },
      toBe(val) { assert.notStrictEqual(actual, val); },
      toContain(val) { assert.ok(!actual?.includes(val)); }
    }
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function assertPlanShape(plan) {
  expect(typeof plan.workflowId).toBe('string');
  expect(typeof plan.workflowName).toBe('string');
  expect(Array.isArray(plan.steps)).toBe(true);
  expect(plan.steps.length).toBeGreaterThan(0);
  expect(plan.summary).toBeDefined();
}

// ── CustomerComplaintPlanner ──────────────────────────────────────────────────

describe('buildCustomerComplaintPlan', () => {
  const BASE = {
    workspaceId:   'ws-test',
    messageId:     'gmail-msg-001',
    subject:       'Product broken',
    customerEmail: 'user@example.com',
  };

  test('throws when workspaceId is missing', () => {
    expect(() => buildCustomerComplaintPlan({ ...BASE, workspaceId: undefined })).toThrow();
  });

  test('throws when messageId is missing', () => {
    expect(() => buildCustomerComplaintPlan({ ...BASE, messageId: undefined })).toThrow();
  });

  test('throws when subject is missing', () => {
    expect(() => buildCustomerComplaintPlan({ ...BASE, subject: undefined })).toThrow();
  });

  test('throws when customerEmail is missing', () => {
    expect(() => buildCustomerComplaintPlan({ ...BASE, customerEmail: undefined })).toThrow();
  });

  test('returns a valid plan for minimal params', () => {
    const plan = buildCustomerComplaintPlan(BASE);
    assertPlanShape(plan);
    expect(plan.workflowId).toBe('customer-complaint-resolution');
  });

  test('plan has 8 steps in correct order', () => {
    const plan = buildCustomerComplaintPlan(BASE);
    expect(plan.steps).toHaveLength(8);
    const ids = plan.steps.map(s => s.id);
    expect(ids[0]).toBe('read_complaint');
    expect(ids[4]).toBe('draft_reply');
    expect(ids[5]).toBe('approve_reply');       // approval gate
    expect(ids[6]).toBe('send_reply');
    expect(ids[7]).toBe('close_jira_issue');
  });

  test('approval step has type approval', () => {
    const plan = buildCustomerComplaintPlan(BASE);
    const approval = plan.steps.find(s => s.type === 'approval');
    expect(approval).toBeDefined();
    expect(approval.id).toBe('approve_reply');
  });

  test('gmail read step targets the provided messageId', () => {
    const plan = buildCustomerComplaintPlan(BASE);
    expect(plan.steps[0].payload.messageId).toBe('gmail-msg-001');
  });

  test('jira create step uses custom projectKey', () => {
    const plan = buildCustomerComplaintPlan({ ...BASE, jiraProjectKey: 'CUSTOM' });
    const jiraCreate = plan.steps.find(s => s.connectorId === 'jira' && s.actionType === 'create');
    expect(jiraCreate.payload.projectKey).toBe('CUSTOM');
  });

  test('subject is included in Jira title', () => {
    const plan = buildCustomerComplaintPlan(BASE);
    const jiraCreate = plan.steps.find(s => s.connectorId === 'jira' && s.actionType === 'create');
    expect(jiraCreate.payload.title).toContain('Product broken');
  });

  test('summary carries customerEmail and ownerName', () => {
    const plan = buildCustomerComplaintPlan({ ...BASE, ownerName: 'Alice' });
    expect(plan.summary.customerEmail).toBe('user@example.com');
    expect(plan.summary.ownerName).toBe('Alice');
  });
});

// ── EngineeringBugIntakePlanner ───────────────────────────────────────────────

describe('buildEngineeringBugIntakePlan', () => {
  const BASE = {
    workspaceId:   'ws-eng',
    messageId:     'gmail-msg-002',
    bugTitle:      'Login page crashes on Safari',
    reporterEmail: 'reporter@acme.com',
  };

  test('throws when workspaceId is missing', () => {
    expect(() => buildEngineeringBugIntakePlan({ ...BASE, workspaceId: undefined })).toThrow();
  });

  test('throws when bugTitle is missing', () => {
    expect(() => buildEngineeringBugIntakePlan({ ...BASE, bugTitle: undefined })).toThrow();
  });

  test('returns a valid plan', () => {
    const plan = buildEngineeringBugIntakePlan(BASE);
    assertPlanShape(plan);
    expect(plan.workflowId).toBe('engineering-bug-intake');
  });

  test('plan has 7 steps', () => {
    const plan = buildEngineeringBugIntakePlan(BASE);
    expect(plan.steps).toHaveLength(7);
  });

  test('first step reads the email', () => {
    const plan = buildEngineeringBugIntakePlan(BASE);
    expect(plan.steps[0].connectorId).toBe('gmail');
    expect(plan.steps[0].actionType).toBe('read');
    expect(plan.steps[0].payload.messageId).toBe('gmail-msg-002');
  });

  test('last step archives the email (critical:false)', () => {
    const plan = buildEngineeringBugIntakePlan(BASE);
    const last = plan.steps[plan.steps.length - 1];
    expect(last.id).toBe('archive_email');
    expect(last.critical).toBe(false);
  });

  test('infers High priority for urgent keyword', () => {
    const plan = buildEngineeringBugIntakePlan({ ...BASE, bugTitle: 'URGENT: crash on login' });
    expect(plan.summary.inferredPriority).toBe('High');
  });

  test('infers Highest priority for production keyword', () => {
    const plan = buildEngineeringBugIntakePlan({ ...BASE, bugTitle: 'production outage' });
    expect(plan.summary.inferredPriority).toBe('Highest');
  });

  test('accepts explicit priority override', () => {
    const plan = buildEngineeringBugIntakePlan({ ...BASE, priority: 'Low' });
    expect(plan.summary.inferredPriority).toBe('Low');
  });

  test('jira create step uses correct issueType Bug', () => {
    const plan = buildEngineeringBugIntakePlan(BASE);
    const jiraCreate = plan.steps.find(s => s.connectorId === 'jira' && s.actionType === 'create');
    expect(jiraCreate.payload.issueType).toBe('Bug');
  });

  test('add_source_comment step uses jira:execute with resourceType comment', () => {
    const plan = buildEngineeringBugIntakePlan(BASE);
    const commentStep = plan.steps.find(s => s.id === 'add_source_comment');
    expect(commentStep.connectorId).toBe('jira');
    expect(commentStep.actionType).toBe('execute');
    expect(commentStep.critical).toBe(false);
  });
});

// ── WeeklyCustomerFollowUpPlanner ─────────────────────────────────────────────

describe('buildWeeklyCustomerFollowUpPlan', () => {
  const BASE = { workspaceId: 'ws-followup' };

  test('throws when workspaceId is missing', () => {
    expect(() => buildWeeklyCustomerFollowUpPlan({ workspaceId: undefined })).toThrow();
  });

  test('returns a valid plan', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    assertPlanShape(plan);
    expect(plan.workflowId).toBe('weekly-customer-followup');
  });

  test('plan has 7 steps', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    expect(plan.steps).toHaveLength(7);
  });

  test('first step is gmail search', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    expect(plan.steps[0].connectorId).toBe('gmail');
    expect(plan.steps[0].actionType).toBe('search');
  });

  test('second step is a conditional', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    expect(plan.steps[1].type).toBe('conditional');
  });

  test('conditional has then/else branches', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    const cond = plan.steps[1];
    expect(cond.then).toBeDefined();
    expect(cond.else).toBeDefined();
    expect(cond.else.type).toBe('skip');
  });

  test('approval gate is present', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    const approval = plan.steps.find(s => s.type === 'approval');
    expect(approval).toBeDefined();
    expect(approval.id).toBe('approve_batch');
  });

  test('send_loop is a loop step over waiting threads', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    const sendLoop = plan.steps.find(s => s.id === 'send_loop');
    expect(sendLoop.type).toBe('loop');
    expect(sendLoop.over).toBe('_waitingThreads.items');
  });

  test('default search query respects waitDays param', () => {
    const plan = buildWeeklyCustomerFollowUpPlan({ ...BASE, waitDays: 14 });
    expect(plan.summary.searchQuery).toContain('older_than:14d');
  });

  test('custom searchQuery overrides default', () => {
    const plan = buildWeeklyCustomerFollowUpPlan({ ...BASE, searchQuery: 'label:vip is:unread' });
    expect(plan.summary.searchQuery).toBe('label:vip is:unread');
  });

  test('last step notifies slack', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    const last = plan.steps[plan.steps.length - 1];
    expect(last.id).toBe('notify_completion');
    expect(last.connectorId).toBe('slack');
    expect(last.critical).toBe(false);
  });

  test('buildPayload closures are functions', () => {
    const plan = buildWeeklyCustomerFollowUpPlan(BASE);
    const withPayload = plan.steps.filter(s => typeof s.buildPayload === 'function'
      || (s.body && typeof s.body.buildPayload === 'function'));
    expect(withPayload.length).toBeGreaterThan(0);
  });
});
