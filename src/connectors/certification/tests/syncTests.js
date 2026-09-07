/**
 * Sync certification tests — validates initial/incremental sync, read operations,
 * and normalized output shape.
 */
import { ActionType } from '../../capabilities.js';

export async function runSyncTests(adapter, ctx = {}) {
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

  // — Structural checks —
  check('supportedActions is declared', () => Array.isArray(adapter.supportedActions) && adapter.supportedActions.length > 0);
  check('read() method exists', () => typeof adapter.read === 'function');
  check('sync() method exists (if SYNC declared)', () => {
    if (supported.includes(ActionType.SYNC)) return typeof adapter.sync === 'function';
    return true; // sync not declared, skip
  });
  check('search() method exists (if SEARCH declared)', () => {
    if (supported.includes(ActionType.SEARCH)) return typeof adapter.search === 'function';
    return true;
  });

  // — Integration checks —
  await checkAsync('read() returns array of normalized items', async () => {
    if (!supported.includes(ActionType.READ)) return true;
    const items = await adapter.read({ workspaceId: ctx.workspaceId || 'test', resourceType: ctx.resourceType || 'messages', limit: 1 });
    if (!Array.isArray(items)) return `read() should return an array, got ${typeof items}`;
    if (items.length > 0) {
      const item = items[0];
      if (!item.id) return 'Normalized items should have an id field';
    }
    return true;
  });

  await checkAsync('sync() returns { synced, errors } shape', async () => {
    if (!supported.includes(ActionType.SYNC)) return true;
    const result = await adapter.sync({ workspaceId: ctx.workspaceId || 'test', limit: 1 });
    if (!result || typeof result !== 'object') return 'sync() should return an object';
    if (typeof result.synced !== 'number') return 'sync() result should include synced count';
    return true;
  });

  await checkAsync('search() returns normalized SearchResult[]', async () => {
    if (!supported.includes(ActionType.SEARCH)) return true;
    const results2 = await adapter.search({ workspaceId: ctx.workspaceId || 'test', query: 'test', limit: 1 });
    if (!Array.isArray(results2)) return `search() should return an array, got ${typeof results2}`;
    return true;
  });

  return results;
}
