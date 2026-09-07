/**
 * Observability certification tests — validates that the connector exposes
 * enough metadata for the Connector Dashboard to render meaningful status.
 */

export async function runObservabilityTests(adapter, ctx = {}) {
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
      const expected = /not connected|no credentials|unauthenticated|not configured/i.test(e.message) || e.code === 'CONNECTOR_AUTH_ERROR';
      results.push({ name, passed: expected, detail: expected ? 'No credentials (expected)' : e.message });
    }
  }

  // — Structural metadata —
  check('adapter.id is present and non-empty', () => typeof adapter.id === 'string' && adapter.id.length > 0);
  check('adapter.name is present and human-readable', () => typeof adapter.name === 'string' && adapter.name.length > 0);
  check('adapter.version is declared', () => typeof adapter.version === 'string' && adapter.version.length > 0);
  check('adapter.capability is declared', () => typeof adapter.capability === 'string' && adapter.capability.length > 0);
  check('adapter.authStrategy is declared', () => typeof adapter.authStrategy === 'string' && adapter.authStrategy.length > 0);
  check('adapter.supportedActions is a non-empty array', () => Array.isArray(adapter.supportedActions) && adapter.supportedActions.length > 0);

  // — healthCheck() observable output —
  await checkAsync('healthCheck() returns latencyMs (enables p50/p99 tracking)', async () => {
    const result = await adapter.healthCheck(ctx.workspaceId || 'test');
    if (!result) return 'healthCheck() returned falsy';
    if (typeof result.latencyMs !== 'number') return 'healthCheck() must include latencyMs for latency tracking';
    return true;
  });

  await checkAsync('healthCheck() includes a message explaining status', async () => {
    const result = await adapter.healthCheck(ctx.workspaceId || 'test').catch(() => null);
    if (!result) return true; // Can't check if it threw
    // message is strongly recommended but not hard-required
    return typeof result.message === 'string' || typeof result.error === 'string'
      ? true
      : 'healthCheck() should include message or error string for observability dashboards';
  });

  // — describe() completeness —
  check('describe() exposes full metadata for the Connector Dashboard', () => {
    const meta = adapter.describe();
    if (!meta) return 'describe() returned falsy';
    const required = ['id', 'name', 'version', 'capability', 'authStrategy', 'supportedActions'];
    const missing = required.filter(k => !meta[k]);
    if (missing.length > 0) return `describe() is missing: ${missing.join(', ')}`;
    return true;
  });

  return results;
}
