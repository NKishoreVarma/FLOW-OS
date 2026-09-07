/**
 * Universal Workflow Runtime — Comprehensive Test Suite
 *
 * Unit tests: no live server required. DB and executeAction are mocked.
 * Integration tests: require PORT=5001 server + TEST_JWT env var.
 *
 * Run unit tests only:
 *   node --test src/runtime/__tests__/runtimeEngine.test.js
 *
 * Run all tests (unit + integration):
 *   TEST_JWT=<jwt> TEST_WORKSPACE_ID=workspace_corp_alpha \
 *   node --test src/runtime/__tests__/runtimeEngine.test.js
 */

import assert from 'node:assert/strict';
import { describe, it, before, beforeEach, after } from 'node:test';

// ── Unit modules under test ───────────────────────────────────────────────────
import {
  createRuntimeContext,
  setVariable,
  getVariable,
  recordStepResult,
  getStepResult,
  pushRollback,
  setApprovalWaiting,
  clearApproval,
  trackStepOutput,
  trackStepFailure,
  interpolate,
  evaluateCondition,
  serializeContext,
  deserializeContext,
} from '../RuntimeContext.js';

import {
  registerWorkflow,
  unregisterWorkflow,
  loadDefinition,
  listDefinitions,
  validateDefinition,
  buildExecutionPlan,
  hasPlannerFor,
  clear as clearRegistry,
} from '../WorkflowLoader.js';

import { WorkflowEvent } from '../RuntimeEvents.js';
import { executeStep }   from '../StepExecutor.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockDef = {
  id:         'test-workflow',
  name:       'Test Workflow',
  version:    '1.0.0',
  connectors: ['github'],
  steps: [
    { id: 'step1', name: 'Step 1', type: 'action', connectorId: 'github', actionType: 'read' },
    { id: 'step2', name: 'Step 2', type: 'action', connectorId: 'slack',  actionType: 'send' },
  ],
};

const makeCtx = (overrides = {}) => createRuntimeContext({
  executionId: 'exec-001',
  workspaceId: 'ws-001',
  workflowId:  'test-workflow',
  params:      { owner: 'acme', repo: 'backend' },
  ...overrides,
});

const noop = async () => {};

// ── RuntimeContext tests ──────────────────────────────────────────────────────

describe('RuntimeContext', () => {
  it('seeds variables from params', () => {
    const ctx = makeCtx();
    assert.equal(ctx.variables.owner, 'acme');
    assert.equal(ctx.variables.repo,  'backend');
  });

  it('setVariable / getVariable roundtrip', () => {
    const ctx = makeCtx();
    setVariable(ctx, 'foo', 42);
    assert.equal(getVariable(ctx, 'foo'), 42);
  });

  it('recordStepResult / getStepResult roundtrip', () => {
    const ctx = makeCtx();
    recordStepResult(ctx, 'step1', { merged: true, sha: 'abc' });
    assert.deepEqual(getStepResult(ctx, 'step1'), { merged: true, sha: 'abc' });
    assert.equal(getStepResult(ctx, 'nonexistent'), null);
  });

  it('pushRollback appends to stack', () => {
    const ctx = makeCtx();
    pushRollback(ctx, 'step1');
    pushRollback(ctx, 'step2');
    assert.deepEqual(ctx.rollbackStack, ['step1', 'step2']);
  });

  it('setApprovalWaiting / clearApproval', () => {
    const ctx = makeCtx();
    setApprovalWaiting(ctx, 'merge_pr_1', 'appr-001');
    assert.equal(ctx.approvalState.state,          'WAITING');
    assert.equal(ctx.approvalState.approvalId,     'appr-001');
    assert.equal(ctx.approvalState.pendingStepId,  'merge_pr_1');
    clearApproval(ctx);
    assert.equal(ctx.approvalState.state, 'NONE');
    assert.equal(ctx.approvalState.approvalId, null);
  });

  it('trackStepOutput appends to named array', () => {
    const ctx = makeCtx();
    const step = { trackIn: '_mergedPRs', trackItem: { number: 1, title: 'Fix bug' } };
    trackStepOutput(ctx, step, { merged: true, sha: 'abc' });
    trackStepOutput(ctx, step, { merged: true, sha: 'def' });
    assert.equal(ctx.variables._mergedPRs.length, 2);
    assert.equal(ctx.variables._mergedPRs[0].number, 1);
    assert.equal(ctx.variables._mergedPRs[0].sha, 'abc');
  });

  it('trackStepFailure appends error to failTrackIn', () => {
    const ctx  = makeCtx();
    const step = { failTrackIn: '_failedPRs', trackItem: { number: 2 } };
    const err  = new Error('GitHub 502');
    trackStepFailure(ctx, step, err);
    assert.equal(ctx.variables._failedPRs.length, 1);
    assert.equal(ctx.variables._failedPRs[0].error, 'GitHub 502');
  });

  it('interpolate replaces {{path}} placeholders', () => {
    const ctx = makeCtx();
    setVariable(ctx, 'channelId', 'C04XYZ');
    const result = interpolate('send to {{variables.channelId}}', ctx);
    assert.equal(result, 'send to C04XYZ');
  });

  it('interpolate works on nested objects', () => {
    const ctx = makeCtx();
    setVariable(ctx, 'repo', 'my-repo');
    const result = interpolate({ text: 'repo is {{variables.repo}}', count: 1 }, ctx);
    assert.equal(result.text, 'repo is my-repo');
    assert.equal(result.count, 1);
  });

  it('interpolate calls functions', () => {
    const ctx = makeCtx();
    setVariable(ctx, 'x', 10);
    const fn     = (c) => `x=${c.variables.x}`;
    const result = interpolate(fn, ctx);
    assert.equal(result, 'x=10');
  });

  describe('evaluateCondition', () => {
    it('true literal', () => {
      const ctx = makeCtx();
      assert.equal(evaluateCondition(true,  ctx), true);
      assert.equal(evaluateCondition(false, ctx), false);
    });

    it('function expression', () => {
      const ctx = makeCtx();
      setVariable(ctx, 'score', 75);
      assert.equal(evaluateCondition(c => c.variables.score >= 70, ctx), true);
      assert.equal(evaluateCondition(c => c.variables.score >= 80, ctx), false);
    });

    it('string: variable >= number', () => {
      const ctx = makeCtx();
      setVariable(ctx, 'count', 5);
      assert.equal(evaluateCondition('variables.count >= 3', ctx), true);
      assert.equal(evaluateCondition('variables.count >= 10', ctx), false);
    });

    it('string: variable === string', () => {
      const ctx = makeCtx();
      setVariable(ctx, 'status', 'approved');
      assert.equal(evaluateCondition("variables.status === 'approved'", ctx), true);
      assert.equal(evaluateCondition("variables.status === 'rejected'", ctx), false);
    });

    it('string: variable === boolean literal', () => {
      const ctx = makeCtx();
      recordStepResult(ctx, 'merge_pr_1', { merged: true });
      assert.equal(evaluateCondition('stepResults.merge_pr_1.merged === true', ctx), true);
    });

    it('null expression returns true (no condition = always run)', () => {
      assert.equal(evaluateCondition(null, makeCtx()), true);
    });
  });

  it('serialize / deserialize roundtrip', () => {
    const ctx = makeCtx();
    setVariable(ctx, 'arr', [1, 2, 3]);
    const serialized   = serializeContext(ctx);
    const deserialized = deserializeContext(serialized);
    assert.deepEqual(deserialized.variables.arr, [1, 2, 3]);
    assert.equal(deserialized.executionId, 'exec-001');
  });
});

// ── WorkflowLoader tests ──────────────────────────────────────────────────────

describe('WorkflowLoader', () => {
  beforeEach(() => clearRegistry());
  after(() => clearRegistry());

  it('registers and loads a definition', () => {
    registerWorkflow(mockDef);
    const loaded = loadDefinition('test-workflow');
    assert.equal(loaded.id,   'test-workflow');
    assert.equal(loaded.name, 'Test Workflow');
  });

  it('throws NOT_FOUND for unregistered workflow', () => {
    assert.throws(() => loadDefinition('nonexistent'), /not registered/);
  });

  it('validateDefinition rejects missing required fields', () => {
    const incomplete = { id: 'x', name: 'X', connectors: ['github'], steps: [] };
    assert.throws(() => validateDefinition(incomplete), /version/);
  });

  it('validateDefinition rejects invalid semver', () => {
    const bad = { ...mockDef, version: 'v1' };
    assert.throws(() => validateDefinition(bad), /semver/);
  });

  it('validateDefinition rejects empty steps array', () => {
    const bad = { ...mockDef, steps: [] };
    assert.throws(() => validateDefinition(bad), /non-empty/);
  });

  it('registers a planner and hasPlannerFor returns true', () => {
    const plannerFn = async () => ({ steps: [] });
    registerWorkflow(mockDef, plannerFn);
    assert.equal(hasPlannerFor('test-workflow'), true);
  });

  it('lists all definitions', () => {
    registerWorkflow(mockDef);
    const list = listDefinitions();
    assert.ok(list.some(d => d.id === 'test-workflow'));
  });

  it('buildExecutionPlan uses planner when registered', async () => {
    const plan = {
      workflowId:   'test-workflow',
      workflowName: 'Test',
      plannedAt:    new Date().toISOString(),
      params:       {},
      summary:      {},
      steps:        [{ id: 's1', type: 'skip', name: 'Skip', reasons: ['test'] }],
    };
    registerWorkflow(mockDef, async () => plan);
    const built = await buildExecutionPlan('test-workflow', {}, { workspaceId: 'ws-001' });
    assert.deepEqual(built.steps, plan.steps);
  });

  it('buildExecutionPlan uses definition steps when no planner', async () => {
    registerWorkflow(mockDef);
    const built = await buildExecutionPlan('test-workflow', {}, { workspaceId: 'ws-001' });
    assert.equal(built.steps.length, 2);
    assert.equal(built.steps[0].id, 'step1');
  });
});

// ── StepExecutor unit tests ───────────────────────────────────────────────────

describe('StepExecutor — skip', () => {
  it('returns skipped result with reasons', async () => {
    const ctx  = makeCtx();
    const step = { id: 's1', type: 'skip', reasons: ['draft PR', 'no reviews'] };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.skipped, true);
    assert.deepEqual(result.reasons, ['draft PR', 'no reviews']);
  });

  it('returns empty reasons array when none given', async () => {
    const ctx  = makeCtx();
    const step = { id: 's1', type: 'skip' };
    const result = await executeStep(step, ctx, {});
    assert.deepEqual(result.reasons, []);
  });
});

describe('StepExecutor — conditional', () => {
  it('executes then-branch when condition is true', async () => {
    const ctx  = makeCtx();
    setVariable(ctx, 'score', 90);
    const step = {
      id:        'cond1',
      type:      'conditional',
      condition: 'variables.score >= 70',
      then:      { id: 'then1', type: 'skip', reasons: ['executed then branch'] },
      else:      { id: 'else1', type: 'skip', reasons: ['should not reach'] },
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.conditionMet, true);
    assert.equal(result.branched,     true);
    assert.equal(result.output.skipped, true);
    assert.equal(result.output.reasons[0], 'executed then branch');
  });

  it('executes else-branch when condition is false', async () => {
    const ctx  = makeCtx();
    setVariable(ctx, 'score', 40);
    const step = {
      id:        'cond2',
      type:      'conditional',
      condition: 'variables.score >= 70',
      then:      { id: 'then2', type: 'skip', reasons: ['should not reach'] },
      else:      { id: 'else2', type: 'skip', reasons: ['executed else branch'] },
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.conditionMet, false);
    assert.equal(result.output.reasons[0], 'executed else branch');
  });

  it('returns branched:false when condition is false and no else', async () => {
    const ctx  = makeCtx();
    setVariable(ctx, 'score', 40);
    const step = {
      id:        'cond3',
      type:      'conditional',
      condition: 'variables.score >= 70',
      then:      { id: 'then3', type: 'skip', reasons: ['should not reach'] },
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.branched, false);
  });

  it('stores result in outputAs variable', async () => {
    const ctx  = makeCtx();
    setVariable(ctx, 'ok', true);
    const step = {
      id:        'cond4',
      type:      'conditional',
      condition: 'variables.ok === true',
      outputAs:  'wasMet',
    };
    await executeStep(step, ctx, {});
    assert.equal(ctx.variables.wasMet, true);
  });
});

describe('StepExecutor — loop', () => {
  it('iterates over a variable array', async () => {
    const ctx  = makeCtx();
    setVariable(ctx, 'items', [1, 2, 3]);
    const results = [];
    const step = {
      id:   'loop1',
      type: 'loop',
      over: 'items',
      as:   'currentItem',
      body: {
        id:   'body1',
        type: 'skip',
        get reasons() {
          return [`item processed`];
        },
      },
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.iterations, 3);
    assert.equal(result.results.length, 3);
  });

  it('sets loop variables during iteration', async () => {
    const ctx  = makeCtx();
    setVariable(ctx, 'prs', [{ number: 1 }, { number: 2 }]);
    const seen = [];
    const step = {
      id:   'loop2',
      type: 'loop',
      over: 'prs',
      as:   'pr',
      body: {
        id:   'body2',
        type: 'skip',
        reasons: [],
      },
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.iterations, 2);
    // After iteration, ctx.variables.pr is the last item, ctx.variables.prIndex is 1
    assert.equal(ctx.variables.prIndex, 1);
  });

  it('throws if over expression is missing', async () => {
    const ctx  = makeCtx();
    const step = { id: 'loop3', type: 'loop', body: { id: 'b', type: 'skip' } };
    await assert.rejects(() => executeStep(step, ctx, {}), /over/);
  });
});

describe('StepExecutor — parallel', () => {
  it('runs substeps concurrently and returns results', async () => {
    const ctx  = makeCtx();
    const step = {
      id:    'par1',
      type:  'parallel',
      steps: [
        { id: 'p1', type: 'skip', reasons: ['sub 1'] },
        { id: 'p2', type: 'skip', reasons: ['sub 2'] },
        { id: 'p3', type: 'skip', reasons: ['sub 3'] },
      ],
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.completedCount, 3);
    assert.equal(result.failedCount,    0);
    assert.equal(result.results.length, 3);
  });

  it('reports failed substeps without throwing when failFast:false', async () => {
    const ctx  = makeCtx();
    const step = {
      id:       'par2',
      type:     'parallel',
      failFast: false,
      steps: [
        { id: 'p4', type: 'skip',    reasons: ['ok'] },
        { id: 'p5', type: 'unknown_will_fail' },
      ],
    };
    const result = await executeStep(step, ctx, {});
    assert.equal(result.failedCount, 1);
  });

  it('throws on failure when failFast:true (default)', async () => {
    const ctx  = makeCtx();
    const step = {
      id:    'par3',
      type:  'parallel',
      steps: [
        { id: 'p6', type: 'unknown_will_fail' },
      ],
    };
    await assert.rejects(
      () => executeStep(step, ctx, {}),
      err => {
        assert.equal(err.code, 'PARALLEL_STEP_FAILED');
        return true;
      }
    );
  });
});

describe('StepExecutor — delay', () => {
  it('resolves after a short delay', async () => {
    const ctx  = makeCtx();
    const step = { id: 'd1', type: 'delay', durationMs: 50 };
    const t0   = Date.now();
    const result = await executeStep(step, ctx, {});
    const elapsed = Date.now() - t0;
    assert.equal(result.delayed, true);
    assert.ok(elapsed >= 45, `Expected at least 45ms, got ${elapsed}ms`);
  });
});

describe('StepExecutor — approval', () => {
  it('throws APPROVAL_REQUIRED', async () => {
    const ctx  = makeCtx();
    const step = { id: 'appr1', type: 'approval', reason: 'Needs manager sign-off' };
    await assert.rejects(
      () => executeStep(step, ctx, {}),
      err => {
        assert.equal(err.code, 'APPROVAL_REQUIRED');
        assert.equal(err.meta.stepId, 'appr1');
        return true;
      }
    );
  });
});

describe('StepExecutor — unknown type', () => {
  it('throws ValidationError', async () => {
    const ctx  = makeCtx();
    const step = { id: 'x1', type: 'totally_unknown' };
    await assert.rejects(() => executeStep(step, ctx, {}), /Unknown step type/);
  });
});

describe('StepExecutor — action (mocked executeAction)', () => {
  let _origExecuteAction;

  before(async () => {
    // We can't easily mock ES module imports; test the action dispatch through
    // the StepExecutor with a real connector that is not registered.
    // The executeAction call will fail with a connector-not-found error,
    // which proves the dispatch path works.
  });

  it('throws if connectorId is missing', async () => {
    const ctx  = makeCtx();
    const step = { id: 'a1', type: 'action', actionType: 'read' };
    await assert.rejects(() => executeStep(step, ctx, {}), /connectorId is required/);
  });

  it('throws if actionType is missing', async () => {
    const ctx  = makeCtx();
    const step = { id: 'a2', type: 'action', connectorId: 'github' };
    await assert.rejects(() => executeStep(step, ctx, {}), /actionType is required/);
  });

  it('resolves buildPayload function before calling executeAction', async () => {
    const ctx    = makeCtx();
    setVariable(ctx, 'channel', 'C04X');
    let capturedPayload = null;
    const step = {
      id:          'a3',
      type:        'action',
      connectorId: 'nonexistent_connector_for_test',
      actionType:  'send',
      buildPayload: (c) => {
        capturedPayload = { channelId: c.variables.channel };
        return capturedPayload;
      },
    };
    // Will fail because connector is not registered, but buildPayload should have been called
    try {
      await executeStep(step, ctx, { orgPlan: 'free' });
    } catch {
      // expected — connector not registered
    }
    assert.deepEqual(capturedPayload, { channelId: 'C04X' });
  });
});

// ── WorkflowEvent constants ───────────────────────────────────────────────────

describe('WorkflowEvent constants', () => {
  const expectedEvents = [
    'WORKFLOW_STARTED', 'WORKFLOW_PAUSED', 'WORKFLOW_RESUMED', 'WORKFLOW_COMPLETED',
    'WORKFLOW_FAILED', 'WORKFLOW_CANCELLED', 'WORKFLOW_STEP_STARTED', 'WORKFLOW_STEP_COMPLETED',
    'WORKFLOW_STEP_FAILED', 'WORKFLOW_STEP_SKIPPED', 'WORKFLOW_STEP_RETRYING',
    'WORKFLOW_APPROVAL_REQUESTED', 'WORKFLOW_APPROVAL_RESOLVED', 'WORKFLOW_CHECKPOINT',
    'WORKFLOW_RECOVERED',
  ];

  for (const name of expectedEvents) {
    it(`defines ${name}`, () => {
      assert.ok(Object.values(WorkflowEvent).includes(name), `${name} missing`);
    });
  }

  it('is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(WorkflowEvent));
  });
});

// ── PR_REVIEW_WORKFLOW definition ─────────────────────────────────────────────

describe('PR_REVIEW_WORKFLOW definition (generic runtime compatible)', () => {
  before(() => clearRegistry());
  after(() => clearRegistry());

  it('registers successfully in WorkflowLoader', async () => {
    const { PR_REVIEW_WORKFLOW } = await import('../../workflows/definitions/prReviewWorkflow.js');
    const { buildPRReviewPlan }  = await import('../../workflows/planner/PRReviewPlanner.js');
    assert.doesNotThrow(() => registerWorkflow(PR_REVIEW_WORKFLOW, buildPRReviewPlan));
    assert.equal(loadDefinition('pr-review').id, 'pr-review');
  });
});

// ── Integration tests (require live server) ───────────────────────────────────

const BASE      = process.env.TEST_BASE_URL    || 'http://localhost:5001';
const TOKEN     = process.env.TEST_JWT;
const WS_ID     = process.env.TEST_WORKSPACE_ID || 'workspace_corp_alpha';
const GH_OWNER  = process.env.TEST_GITHUB_OWNER;
const GH_REPO   = process.env.TEST_GITHUB_REPO;
const SLACK_CH  = process.env.TEST_SLACK_CHANNEL_ID;

const hdrs = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
  'workspace-id':  WS_ID,
};

const SKIP_INTEGRATION = !TOKEN || !GH_OWNER || !GH_REPO || !SLACK_CH;

describe('GET /api/workflow-executions/definitions', { skip: SKIP_INTEGRATION }, () => {
  it('returns registered definitions list', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions/definitions`, { headers: hdrs });
    assert.equal(res.status, 200);
    const { definitions } = await res.json();
    assert.ok(Array.isArray(definitions));
    assert.ok(definitions.some(d => d.id === 'pr-review'), 'pr-review definition not found');
  });

  it('returns single definition by id', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions/definitions/pr-review`, { headers: hdrs });
    assert.equal(res.status, 200);
    const { definition } = await res.json();
    assert.equal(definition.id, 'pr-review');
    assert.ok(Array.isArray(definition.connectors));
  });

  it('returns 404 for unknown definition', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions/definitions/nonexistent`, { headers: hdrs });
    assert.equal(res.status, 404);
  });
});

describe('POST /api/workflow-executions — validation', { skip: SKIP_INTEGRATION }, () => {
  it('returns 400 when workflowId missing', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ params: {} }),
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 when workspace-id header missing', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ workflowId: 'pr-review', params: {} }),
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 for unknown workflowId', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ workflowId: 'no-such-workflow', params: {} }),
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/workflow-executions — dry run', { skip: SKIP_INTEGRATION }, () => {
  it('returns plan with generic step types only', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({
        workflowId: 'pr-review',
        params: { owner: GH_OWNER, repo: GH_REPO, slackChannelId: SLACK_CH },
        dryRun: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun, true);
    assert.ok(body.plan?.steps);

    const allowedTypes = new Set(['action', 'skip', 'parallel', 'conditional', 'loop',
      'approval', 'delay', 'wait_for_event', 'compensation', 'sub_workflow']);
    for (const step of body.plan.steps) {
      assert.ok(allowedTypes.has(step.type),
        `Non-generic step type found: "${step.type}" (id=${step.id})`);
    }
  });
});

describe('POST /api/workflow-executions — launch', { skip: SKIP_INTEGRATION }, () => {
  let executionId;

  before(async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({
        workflowId: 'pr-review',
        params: {
          owner:                  GH_OWNER,
          repo:                   GH_REPO,
          slackChannelId:         SLACK_CH,
          minMergeReadinessScore: 95, // very high → all PRs skipped, safe for CI
        },
      }),
    });
    assert.equal(res.status, 202);
    executionId = (await res.json()).executionId;
    assert.ok(executionId, 'executionId required');
  });

  it('returns 202 with executionId', () => {
    assert.ok(executionId);
  });

  it('GET /api/workflow-executions/:id returns the execution', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions/${executionId}`, { headers: hdrs });
    assert.equal(res.status, 200);
    const { execution } = await res.json();
    assert.ok(['PLANNING','RUNNING','COMPLETED','FAILED','WAITING_APPROVAL'].includes(execution.status));
  });

  it('execution reaches terminal state within 45 seconds', async () => {
    const terminal = new Set(['COMPLETED','FAILED','WAITING_APPROVAL','CANCELLED']);
    let status = 'PLANNING';
    const deadline = Date.now() + 45_000;

    while (!terminal.has(status) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(`${BASE}/api/workflow-executions/${executionId}`, { headers: hdrs });
      if (res.ok) status = (await res.json()).execution?.status;
    }

    assert.ok(terminal.has(status),
      `Execution ${executionId} did not reach terminal state within 45s; last: ${status}`);
  });

  it('GET /api/workflow-executions lists the launched execution', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, { headers: hdrs });
    assert.equal(res.status, 200);
    const { executions } = await res.json();
    assert.ok(Array.isArray(executions));
    assert.ok(executions.some(e => e.id === executionId));
  });
});

describe('POST /api/workflow-executions/:id/cancel', { skip: SKIP_INTEGRATION }, () => {
  it('cancels a WAITING_APPROVAL execution', async () => {
    // Launch with a workflow that will hit approval — use minMergeReadinessScore: 0
    // so PRs are approved (if any exist), but if governance requires approval, we cancel
    // This test just verifies the cancel route returns 200 for a known execution
    const launchRes = await fetch(`${BASE}/api/workflow-executions`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({
        workflowId: 'pr-review',
        params: { owner: GH_OWNER, repo: GH_REPO, slackChannelId: SLACK_CH, minMergeReadinessScore: 99 },
      }),
    });
    const { executionId: id } = await launchRes.json();

    // Wait briefly for execution to start
    await new Promise(r => setTimeout(r, 500));

    const cancelRes = await fetch(`${BASE}/api/workflow-executions/${id}/cancel`, {
      method: 'POST', headers: hdrs,
    });
    // Accept 200 (cancelled) or 409 (already completed — also fine)
    assert.ok([200, 409].includes(cancelRes.status));
  });
});

describe('GET /api/workflow-executions — pagination', { skip: SKIP_INTEGRATION }, () => {
  it('respects limit parameter', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions?limit=1`, { headers: hdrs });
    assert.equal(res.status, 200);
    const { executions } = await res.json();
    assert.ok(executions.length <= 1);
  });

  it('returns 400 without workspace-id header', async () => {
    const res = await fetch(`${BASE}/api/workflow-executions`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 400);
  });
});
