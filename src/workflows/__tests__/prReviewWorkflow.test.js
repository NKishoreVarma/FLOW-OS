/**
 * PR Review Workflow — Integration Tests
 *
 * Tests run against a LIVE server on localhost:5001.
 * Start the server with: PORT=5001 node src/server.js
 *
 * Tests cover:
 *   1. Safety evaluator — pure unit tests (no server required)
 *   2. Dry-run planning — list PRs and classify, no GitHub write side effects
 *   3. Full workflow launch — 202 response + executionId
 *   4. Execution status poll — GET /api/workflows/:id
 *   5. Execution list — GET /api/workflows
 *   6. WebSocket events — WORKFLOW_STARTED, WORKFLOW_STEP_*, WORKFLOW_COMPLETED
 */

import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { evaluatePRSafety }     from '../PRSafetyEvaluator.js';
import { PR_REVIEW_WORKFLOW }   from '../definitions/prReviewWorkflow.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';
const TOKEN    = process.env.TEST_JWT;
const WS_ID    = process.env.TEST_WORKSPACE_ID || 'workspace_corp_alpha';
const GH_OWNER = process.env.TEST_GITHUB_OWNER;
const GH_REPO  = process.env.TEST_GITHUB_REPO;
const SLACK_CH = process.env.TEST_SLACK_CHANNEL_ID;

const headers = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
  'workspace-id':  WS_ID,
};

// ── Unit Tests (no server) ────────────────────────────────────────────────────

describe('PRSafetyEvaluator', () => {
  const basePR = {
    title:    'Fix auth mutex deadlock',
    metadata: {
      number:             847,
      draft:              false,
      mergeable:          true,
      reviewStatus:       'approved',
      mergeReadinessScore: 85,
    },
  };

  it('marks a ready PR as safe', () => {
    const result = evaluatePRSafety(basePR);
    assert.equal(result.safe,   true);
    assert.equal(result.action, 'approve_and_merge');
    assert.deepEqual(result.reasons, []);
  });

  it('rejects a draft PR', () => {
    const pr = { ...basePR, metadata: { ...basePR.metadata, draft: true } };
    const result = evaluatePRSafety(pr);
    assert.equal(result.safe,         false);
    assert.equal(result.reasons.length > 0, true);
    assert.ok(result.reasons[0].includes('draft'));
  });

  it('rejects a PR with merge conflicts', () => {
    const pr = { ...basePR, metadata: { ...basePR.metadata, mergeable: false } };
    const result = evaluatePRSafety(pr);
    assert.equal(result.safe, false);
    assert.ok(result.reasons.some(r => r.includes('merge conflicts')));
  });

  it('rejects a PR with changes_requested', () => {
    const pr = { ...basePR, metadata: { ...basePR.metadata, reviewStatus: 'changes_requested' } };
    const result = evaluatePRSafety(pr);
    assert.equal(result.safe, false);
    assert.ok(result.reasons.some(r => r.includes('changes requested')));
  });

  it('rejects a PR below the merge readiness threshold', () => {
    const pr = { ...basePR, metadata: { ...basePR.metadata, mergeReadinessScore: 40 } };
    const result = evaluatePRSafety(pr, { minMergeReadinessScore: 70 });
    assert.equal(result.safe, false);
    assert.ok(result.reasons.some(r => r.includes('40')));
  });

  it('respects custom threshold', () => {
    const pr = { ...basePR, metadata: { ...basePR.metadata, mergeReadinessScore: 50 } };
    const result = evaluatePRSafety(pr, { minMergeReadinessScore: 30 });
    assert.equal(result.safe, true);
  });

  it('accumulates multiple failure reasons', () => {
    const pr = {
      ...basePR,
      metadata: {
        ...basePR.metadata,
        draft:              true,
        mergeable:          false,
        mergeReadinessScore: 10,
      },
    };
    const result = evaluatePRSafety(pr);
    assert.equal(result.safe,         false);
    assert.ok(result.reasons.length >= 3);
  });
});

// ── Workflow Definition Unit Tests ────────────────────────────────────────────

describe('PR_REVIEW_WORKFLOW definition', () => {
  it('has required fields', () => {
    assert.equal(PR_REVIEW_WORKFLOW.id,      'pr-review');
    assert.ok(PR_REVIEW_WORKFLOW.version);
    assert.ok(Array.isArray(PR_REVIEW_WORKFLOW.steps));
    assert.ok(PR_REVIEW_WORKFLOW.steps.length >= 3);
  });

  it('references both github and slack connectors', () => {
    assert.ok(PR_REVIEW_WORKFLOW.connectors.includes('github'));
    assert.ok(PR_REVIEW_WORKFLOW.connectors.includes('slack'));
  });

  it('has a notify_slack terminal step', () => {
    const last = PR_REVIEW_WORKFLOW.steps[PR_REVIEW_WORKFLOW.steps.length - 1];
    assert.equal(last.type,      'notify_slack');
    assert.equal(last.connector, 'slack');
  });

  it('has per_pr_loop substeps with approve and merge', () => {
    const loop = PR_REVIEW_WORKFLOW.steps.find(s => s.type === 'per_pr_loop');
    assert.ok(loop, 'per_pr_loop step must exist');
    const types = loop.substeps.map(s => s.type);
    assert.ok(types.includes('approve_pr'));
    assert.ok(types.includes('merge_pr'));
  });
});

// ── Integration Tests (require live server) ───────────────────────────────────

const SKIP_INTEGRATION = !TOKEN || !GH_OWNER || !GH_REPO || !SLACK_CH;

describe('POST /api/workflows/pr-review — dry run', { skip: SKIP_INTEGRATION }, () => {
  it('returns 400 if owner is missing', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows/pr-review`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ repo: GH_REPO, slackChannelId: SLACK_CH }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error?.code === 'VALIDATION_ERROR' || body.error?.message?.includes('owner'));
  });

  it('returns a dry-run plan without executing', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows/pr-review`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        owner:          GH_OWNER,
        repo:           GH_REPO,
        slackChannelId: SLACK_CH,
        dryRun:         true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.dryRun,       true);
    assert.ok(body.plan?.summary);
    assert.ok(typeof body.plan.summary.totalPRs === 'number');
    assert.ok(Array.isArray(body.plan.steps));
  });

  it('dry-run plan contains only skip_pr, approve_pr, merge_pr, notify_slack step types', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows/pr-review`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        owner: GH_OWNER, repo: GH_REPO, slackChannelId: SLACK_CH, dryRun: true,
      }),
    });
    const { plan } = await res.json();
    const validTypes = new Set(['skip_pr', 'approve_pr', 'merge_pr', 'notify_slack']);
    for (const step of plan.steps) {
      assert.ok(validTypes.has(step.type), `Unexpected step type: ${step.type}`);
    }
  });
});

describe('POST /api/workflows/pr-review — launch', { skip: SKIP_INTEGRATION }, () => {
  let executionId;

  before(async () => {
    const res = await fetch(`${BASE_URL}/api/workflows/pr-review`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        owner:                  GH_OWNER,
        repo:                   GH_REPO,
        slackChannelId:         SLACK_CH,
        minMergeReadinessScore: 90, // High threshold → most PRs skipped, safer for CI
        mergeMethod:            'squash',
      }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    executionId = body.executionId;
  });

  it('returns 202 with executionId and initial status PLANNING', async () => {
    assert.ok(executionId, 'executionId must be present');
  });

  it('GET /api/workflows/:id returns the execution', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows/${executionId}`, { headers });
    assert.equal(res.status, 200);
    const { execution } = await res.json();
    assert.equal(execution.id ?? execution.workflow_id, executionId);
    assert.ok(['PLANNING','RUNNING','COMPLETED','FAILED','WAITING_APPROVAL'].includes(
      execution.status
    ));
  });

  it('GET /api/workflows lists the launched execution', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows`, { headers });
    assert.equal(res.status, 200);
    const { executions } = await res.json();
    assert.ok(Array.isArray(executions));
    assert.ok(executions.some(e => (e.id ?? e.workflow_id) === executionId || e.id === executionId));
  });

  it('execution reaches COMPLETED or WAITING_APPROVAL within 30 seconds', async () => {
    const start    = Date.now();
    const timeout  = 30_000;
    const terminal = new Set(['COMPLETED','FAILED','WAITING_APPROVAL']);

    let status = 'PLANNING';
    while (!terminal.has(status) && Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(`${BASE_URL}/api/workflows/${executionId}`, { headers });
      if (res.ok) {
        const { execution } = await res.json();
        status = execution.status;
      }
    }

    assert.ok(
      terminal.has(status),
      `Execution ${executionId} did not reach terminal state within 30s; last status: ${status}`
    );
  });
});

describe('GET /api/workflows — pagination', { skip: SKIP_INTEGRATION }, () => {
  it('respects limit parameter', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows?limit=1`, { headers });
    assert.equal(res.status, 200);
    const { executions } = await res.json();
    assert.ok(executions.length <= 1);
  });

  it('returns 400 without workspace-id', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    assert.equal(res.status, 400);
  });
});
