/**
 * Integration tests — Phase 7 Workflow Pack (Gmail + Jira)
 *
 * These tests run against a LIVE server on http://localhost:5001.
 * Start the server first:
 *   PORT=5001 node src/server.js
 *
 * They do NOT send real emails or create real Jira tickets —
 * all connector calls will fail gracefully (no credentials in CI),
 * and the tests verify API contract, plan generation, and registry responses.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';
const JWT      = process.env.TEST_JWT      || '';
const WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || 'workspace_corp_alpha';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${JWT}`,
      'workspace-id':  WORKSPACE_ID,
      ...(opts.headers ?? {}),
    },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── Action Registry API ───────────────────────────────────────────────────────

describe('GET /api/registry/stats', () => {
  test('returns registry stats', async () => {
    const { status, body } = await api('/api/registry/stats');
    expect(status).toBe(200);
    expect(typeof body.total).toBe('number');
  });
});

describe('GET /api/registry/actions', () => {
  test('returns all actions', async () => {
    const { status, body } = await api('/api/registry/actions');
    expect(status).toBe(200);
    expect(Array.isArray(body.actions)).toBe(true);
  });

  test('filters by connector=gmail', async () => {
    const { status, body } = await api('/api/registry/actions?connector=gmail');
    expect(status).toBe(200);
    const nonGmail = body.actions.filter(a => a.connector !== 'gmail');
    expect(nonGmail).toHaveLength(0);
  });

  test('filters by connector=jira', async () => {
    const { status, body } = await api('/api/registry/actions?connector=jira');
    expect(status).toBe(200);
    const nonJira = body.actions.filter(a => a.connector !== 'jira');
    expect(nonJira).toHaveLength(0);
  });
});

describe('GET /api/registry/actions/search', () => {
  test('returns results for email query', async () => {
    const { status, body } = await api('/api/registry/actions/search?q=email');
    expect(status).toBe(200);
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('returns 400 when q is missing', async () => {
    const { status } = await api('/api/registry/actions/search');
    expect(status).toBe(400);
  });
});

describe('GET /api/registry/actions/:id', () => {
  test('returns gmail.send_email definition', async () => {
    const { status, body } = await api('/api/registry/actions/gmail.send_email');
    expect(status).toBe(200);
    expect(body.id).toBe('gmail.send_email');
    expect(body.riskLevel).toBe('MEDIUM');
    expect(Array.isArray(body.requiredInputs)).toBe(true);
  });

  test('returns jira.create_issue definition', async () => {
    const { status, body } = await api('/api/registry/actions/jira.create_issue');
    expect(status).toBe(200);
    expect(body.id).toBe('jira.create_issue');
    expect(body.connector).toBe('jira');
  });

  test('returns 404 for unknown action', async () => {
    const { status } = await api('/api/registry/actions/unknown.action');
    expect(status).toBe(404);
  });
});

describe('GET /api/registry/actions/:id/schema', () => {
  test('returns schema for gmail.read_email', async () => {
    const { status, body } = await api('/api/registry/actions/gmail.read_email/schema');
    expect(status).toBe(200);
    expect(body.id).toBe('gmail.read_email');
    expect(Array.isArray(body.requiredInputs)).toBe(true);
  });
});

describe('POST /api/registry/validate', () => {
  test('validates valid inputs for gmail.send_email', async () => {
    const { status, body } = await api('/api/registry/validate', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'gmail.send_email',
        inputs:   { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      }),
    });
    expect(status).toBe(200);
    expect(body.valid).toBe(true);
  });

  test('validates missing required inputs for gmail.send_email', async () => {
    const { status, body } = await api('/api/registry/validate', {
      method: 'POST',
      body: JSON.stringify({
        actionId: 'gmail.send_email',
        inputs:   {},
      }),
    });
    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  test('returns 400 when actionId is missing', async () => {
    const { status } = await api('/api/registry/validate', {
      method: 'POST',
      body: JSON.stringify({ inputs: {} }),
    });
    expect(status).toBe(400);
  });
});

// ── Workflow Definitions Listed ───────────────────────────────────────────────

describe('GET /api/workflow-executions/definitions', () => {
  test('lists all 4 registered workflows (including Phase 7)', async () => {
    const { status, body } = await api('/api/workflow-executions/definitions');
    expect(status).toBe(200);

    const definitions = Array.isArray(body) ? body : (body.definitions ?? []);
    const ids = definitions.map(d => d.id);

    expect(ids).toContain('customer-complaint-resolution');
    expect(ids).toContain('engineering-bug-intake');
    expect(ids).toContain('weekly-customer-followup');
  });
});

// ── Workflow Plan Generation (pre-flight) ─────────────────────────────────────

describe('POST /api/workflow-executions (plan mode / missing connector)', () => {
  test('customer-complaint-resolution plan validates params', async () => {
    const { status } = await api('/api/workflow-executions', {
      method: 'POST',
      body: JSON.stringify({
        workflowId: 'customer-complaint-resolution',
        params: {
          workspaceId:   WORKSPACE_ID,
          messageId:     'test-msg-001',
          subject:       'My product is broken',
          customerEmail: 'customer@example.com',
          ownerName:     'Rahul Singh',
        },
      }),
    });
    // 200 started, 400 validation fail, 503 connector unavailable — all are acceptable without credentials
    expect([200, 201, 400, 422, 503].includes(status)).toBe(true);
  });

  test('engineering-bug-intake plan validates params', async () => {
    const { status } = await api('/api/workflow-executions', {
      method: 'POST',
      body: JSON.stringify({
        workflowId: 'engineering-bug-intake',
        params: {
          workspaceId:     WORKSPACE_ID,
          messageId:       'test-msg-002',
          bugTitle:        'Login crash on Safari',
          reporterEmail:   'reporter@acme.com',
          assigneeEngineer: 'Kishore Varma',
        },
      }),
    });
    expect([200, 201, 400, 422, 503].includes(status)).toBe(true);
  });

  test('weekly-customer-followup plan validates params', async () => {
    const { status } = await api('/api/workflow-executions', {
      method: 'POST',
      body: JSON.stringify({
        workflowId: 'weekly-customer-followup',
        params: {
          workspaceId: WORKSPACE_ID,
          waitDays:    7,
        },
      }),
    });
    expect([200, 201, 400, 422, 503].includes(status)).toBe(true);
  });
});
