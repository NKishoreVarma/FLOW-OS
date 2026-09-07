import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/connectors/adapters/index.js';   // side-effect: register all adapters
import { createToolGateway } from '../../src/ai/agent/toolGateway.js';
import { getTool } from '../../src/ai/tools/toolRegistry.js';
import { buildActionRequest } from '../../src/ai/tools/toolExecutor.js';

/**
 * Stage 4A — the canonical external read-tool contract.
 *
 * Proves external read tools flow through the SAME governance + executeAction
 * pipeline as everything else, using the simulated (in-memory) connectors
 * (jira/workday/hubspot) so no OAuth or DB is required. Audit persistence
 * degrades gracefully offline (returns null, never throws).
 */
describe('External tool contract — canonical mapping', () => {
  it('maps a tool to the ActionType VERB + payload (not a bespoke action name)', () => {
    const req = buildActionRequest(getTool('list_jira_issues'), { query: 'auth', limit: 5 }, { workspaceId: 'w', actorId: 'u', workspaceRole: 'MEMBER', orgPlan: 'enterprise' });
    assert.equal(req.connectorId, 'jira');
    assert.equal(req.actionType, 'read', 'actionType is the canonical ActionType.READ verb');
    assert.equal(req.payload.resourceType, 'issues', 'FLOW-controlled resourceType from payloadTemplate');
    assert.equal(req.payload.query, 'auth', 'model input is preserved alongside the template');
  });

  it('payloadTemplate is FLOW-controlled and the model cannot override it', () => {
    // merge_pull_request carries a fixed resourceType/op the model must not change.
    const req = buildActionRequest(getTool('merge_pull_request'), { owner: 'o', repo: 'r', number: 1, resourceType: 'HACKED', op: 'HACKED' }, { workspaceId: 'w' });
    assert.equal(req.payload.resourceType, 'pull_request', 'template wins over model input');
    assert.equal(req.payload.op, 'merge');
  });
});

describe('External read — governed execution (simulated connectors, offline)', () => {
  const CTX = (over = {}) => ({ workspaceId: 'workspace_helios', userId: 'u1', role: 'MEMBER', orgId: 'org1', orgPlan: 'enterprise', ...over });

  it('1. authorized external read returns provenanced evidence', async () => {
    const gw = createToolGateway({ ctx: CTX(), allowedToolNames: ['list_jira_issues'] });
    const obs = await gw.run('list_jira_issues', { query: 'auth' });
    assert.equal(obs.ok, true, obs.error || obs.reason);
    assert.ok(Array.isArray(obs.data) && obs.data.length > 0, 'returns a result set');
    assert.equal(obs.provenance.connector, 'jira');
    assert.equal(obs.provenance.actionType, 'read');
    assert.equal(obs.provenance.workspaceId, 'workspace_helios');
  });

  it('2. unauthorized external read is denied by governance (plan gate)', async () => {
    // free plan does not include the HR capability → deny-by-default (before any adapter call).
    const gw = createToolGateway({ ctx: CTX({ orgPlan: 'free' }), allowedToolNames: ['list_people'] });
    const d = gw.authorize('list_people');
    assert.equal(d.ok, false);
    assert.match(d.reason, /^governance_DENY/);
    const obs = await gw.run('list_people', { query: 'engineer' });
    assert.equal(obs.ok, false);
    assert.equal(obs.denied, true);
  });

  it('3. incorrect workspace: a model-supplied workspaceId is stripped', async () => {
    let seen = null;
    const gw = createToolGateway({
      ctx: CTX(), allowedToolNames: ['list_jira_issues'],
      executeToolFn: async (tc, ec) => { seen = { tc, ec }; return { result: [] }; },
    });
    await gw.run('list_jira_issues', { query: 'x', workspaceId: 'workspace_evil' });
    assert.equal(seen.ec.workspaceId, 'workspace_helios');
    assert.ok(!('workspaceId' in seen.tc.input), 'model workspaceId stripped');
  });

  it('4. mutation attempt is refused (read-only agent)', () => {
    const gw = createToolGateway({ ctx: CTX(), allowedToolNames: ['send_email', 'create_meeting', 'merge_pull_request'] });
    for (const t of ['send_email', 'create_meeting', 'merge_pull_request']) {
      assert.equal(gw.authorize(t).ok, false, `${t} must be blocked`);
      assert.equal(gw.authorize(t).reason, 'read_only_poc_blocks_mutation');
    }
  });

  it('5. unknown action for a connector fails cleanly (not a crash)', async () => {
    // Directly exercise executeAction with a verb jira does not support.
    const { executeAction } = await import('../../src/connectors/executionEngine.js');
    await assert.rejects(
      () => executeAction({ workspaceId: 'w', connectorId: 'jira', actionType: 'send', payload: {}, actor: { role: 'OWNER', id: 'u' }, orgPlan: 'enterprise' }),
      (err) => /not support|UNSUPPORTED|CAPABILITY_NOT_SUPPORTED|501/i.test(`${err.code} ${err.message} ${err.statusCode}`),
    );
  });

  it('6. provenance + audit path complete for the external read', async () => {
    const gw = createToolGateway({ ctx: CTX(), allowedToolNames: ['list_jira_issues'] });
    const obs = await gw.run('list_jira_issues', { query: 'auth' });
    assert.equal(obs.ok, true, obs.error || obs.reason);
    assert.equal(obs.provenance.connector, 'jira');
    assert.equal(obs.provenance.capability, 'work_management');
    assert.ok(obs.provenance.sourceType.startsWith('tool:'));
  });

  it('7. representative read categories all execute through governance (people/customers/docs/projects)', async () => {
    const cases = [
      ['list_people',      'workday', 'hr'],
      ['list_customers',   'hubspot', 'crm'],
      ['list_docs',        'notion',  'knowledge'],
      ['list_jira_issues', 'jira',    'work_management'],
    ];
    for (const [tool, connector, capability] of cases) {
      const gw = createToolGateway({ ctx: CTX(), allowedToolNames: [tool] });
      const obs = await gw.run(tool, { query: 'x' });
      assert.equal(obs.ok, true, `${tool}: ${obs.error || obs.reason}`);
      assert.ok(Array.isArray(obs.data) && obs.data.length > 0, `${tool} returns data`);
      assert.equal(obs.provenance.connector, connector);
      assert.equal(obs.provenance.capability, capability);
    }
  });
});
