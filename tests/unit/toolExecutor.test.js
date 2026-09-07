import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionRequest } from '../../src/ai/tools/toolExecutor.js';
import { getTool } from '../../src/ai/tools/toolRegistry.js';

/**
 * Regression guard for the toolExecutor → executeAction wiring.
 *
 * The original code passed { connector, action, params, actorId, role } — none of
 * which executeAction() reads. Governance (evaluateWithPolicies) inspects
 * actor.role / actor.id / actor.orgId, so the flat shape silently collapsed every
 * governed tool call to a default VIEWER. These assertions fail if that regresses.
 */
describe('toolExecutor.buildActionRequest — governed wiring', () => {
  const ctx = {
    workspaceId:   'workspace_helios',
    actorId:       'user_42',
    workspaceRole: 'ADMIN',
    orgId:         'org_7',
    orgPlan:       'enterprise',
  };

  it('maps registry tool → executeAction argument names', () => {
    const tool = getTool('send_email');
    const req  = buildActionRequest(tool, { to: 'a@b.com', subject: 'x', body: 'y' }, ctx);

    // executeAction() destructures exactly these keys:
    assert.equal(req.workspaceId, 'workspace_helios');
    assert.equal(req.connectorId, tool.connector,  'connectorId must come from tool.connector');
    assert.equal(req.actionType,  tool.actionType, 'actionType must come from the canonical tool.actionType verb');
    assert.equal(req.actionType,  'send',           'send_email maps to the ActionType.SEND verb');
    assert.deepEqual(req.payload, { to: 'a@b.com', subject: 'x', body: 'y' }, 'payload carries the tool input');

    // Legacy (broken) field names must NOT be present.
    assert.ok(!('connector' in req), 'must not emit legacy "connector"');
    assert.ok(!('action' in req),    'must not emit legacy "action"');
    assert.ok(!('params' in req),    'must not emit legacy "params"');
  });

  it('actor is an OBJECT carrying id/role/orgId (governance reads these)', () => {
    const req = buildActionRequest(getTool('search_emails'), { query: 'q' }, ctx);
    assert.equal(typeof req.actor, 'object');
    assert.equal(req.actor.id,   'user_42');
    assert.equal(req.actor.role, 'ADMIN');
    assert.equal(req.actor.orgId, 'org_7');
    assert.equal(req.orgPlan, 'enterprise');

    // The pre-fix flat fields must not leak.
    assert.ok(!('actorId' in req), 'must not emit flat actorId');
    assert.ok(!('role' in req),    'must not emit flat role');
  });

  it('defaults are safe when context omits identity fields', () => {
    const req = buildActionRequest(getTool('search_workspace'), { query: 'q' }, { workspaceId: 'w' });
    assert.equal(req.actor.id,   'ai_platform');
    assert.equal(req.actor.role, 'MEMBER');   // NOT VIEWER — the loop runs as a real MEMBER actor
    assert.equal(req.orgPlan,    'free');
  });
});
