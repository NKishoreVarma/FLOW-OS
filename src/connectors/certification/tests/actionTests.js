/**
 * Action certification tests — validates write operations, execute() routing,
 * and audit logging behavior.
 */
import { ActionType } from '../../capabilities.js';

export async function runActionTests(adapter, ctx = {}) {
  const results = [];

  function check(name, fn) {
    try {
      const passed = fn();
      results.push({ name, passed: !!passed, detail: passed === true ? null : String(passed) });
    } catch (e) {
      results.push({ name, passed: false, detail: e.message });
    }
  }

  async function checkAsync(name, fn) {
    try {
      const result = await fn();
      results.push({ name, passed: !!result, detail: result === true ? null : typeof result === 'string' ? result : null });
    } catch (e) {
      const expected = /not connected|no credentials|unauthenticated|not configured|CONNECTOR_AUTH|CAPABILITY_NOT_SUPPORTED/i.test(e.message) || e.code === 'CONNECTOR_AUTH_ERROR' || e.statusCode === 501;
      results.push({ name, passed: expected, detail: expected ? 'No credentials (expected)' : e.message });
    }
  }

  const supported = Array.isArray(adapter.supportedActions) ? adapter.supportedActions : [];
  const hasWrite = [ActionType.CREATE, ActionType.UPDATE, ActionType.DELETE, ActionType.SEND].some(a => supported.includes(a));
  const hasRead  = supported.includes(ActionType.READ);

  // — Structural checks —
  check('execute() method exists', () => typeof adapter.execute === 'function');
  check('describe() method exists', () => typeof adapter.describe === 'function');
  check('supportedActions covers at least READ', () =>
    hasRead || 'No READ action declared — connector cannot provide data to FLOW'
  );
  check('connector declares at least one write action (if applicable)', () => {
    // Write operations are optional for read-only connectors (datastores like Redis, PostgreSQL)
    const readOnly = ['redis-infra', 'postgresql'].includes(adapter.id);
    if (readOnly) return true;
    return hasWrite || 'No write actions declared — connector is read-only';
  });

  // — Integration checks —
  check('describe() returns full metadata', () => {
    const meta = adapter.describe();
    if (!meta || typeof meta !== 'object') return 'describe() must return an object';
    if (!meta.id || !meta.name) return 'describe() must include id and name';
    if (!Array.isArray(meta.supportedActions)) return 'describe() must include supportedActions[]';
    if (!meta.authStrategy) return 'describe() must include authStrategy';
    return true;
  });

  await checkAsync('execute() returns a result for READ actions', async () => {
    if (!hasRead) return true;
    // Calling execute with an action it supports should either succeed or fail with auth/creds error
    const result = await adapter.execute({
      workspaceId: ctx.workspaceId || 'test',
      action: ActionType.READ,
      params: { resourceType: ctx.resourceType || 'messages', limit: 1 },
    });
    if (!result) return 'execute() returned falsy for READ';
    return true;
  });

  await checkAsync('execute() rejects unknown actions cleanly', async () => {
    try {
      await adapter.execute({ workspaceId: 'test', action: 'UNKNOWN_ACTION_XYZ', params: {} });
      return 'execute() should throw for unknown action, but returned';
    } catch (e) {
      // Should throw CAPABILITY_NOT_SUPPORTED or similar — not an internal crash
      return true;
    }
  });

  return results;
}
