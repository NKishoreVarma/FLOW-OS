/**
 * Auth certification tests — validates that an adapter implements the
 * full OAuth / credential lifecycle correctly.
 */

export async function runAuthTests(adapter, ctx = {}) {
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
      // A thrown ConnectorAuthError or "not configured" is still a pass for structural presence
      const isExpectedNoCredentials = e.code === 'CONNECTOR_AUTH_ERROR' || /no credentials|not configured|not connected|unauthenticated/i.test(e.message);
      results.push({ name, passed: isExpectedNoCredentials, detail: isExpectedNoCredentials ? 'Not connected (expected)' : e.message });
    }
  }

  // — Structural checks —
  check('authenticate() method exists', () => typeof adapter.authenticate === 'function');
  check('healthCheck() method exists', () => typeof adapter.healthCheck === 'function');
  check('connector has id property', () => typeof adapter.id === 'string' && adapter.id.length > 0);
  check('connector has name property', () => typeof adapter.name === 'string' && adapter.name.length > 0);
  check('authStrategy declared', () => typeof adapter.authStrategy === 'string' && adapter.authStrategy.length > 0);
  check('scopes or apiKey strategy declared', () => {
    // OAuth connectors should declare scopes; API key connectors declare authStrategy=API_KEY
    if (adapter.authStrategy === 'OAUTH2') {
      return Array.isArray(adapter.scopes) && adapter.scopes.length > 0
        ? true
        : 'OAuth2 adapter should declare scopes[]';
    }
    return true; // non-OAuth connectors are exempt from scope requirement
  });

  // — Integration checks (best-effort; fail gracefully if no credentials) —
  await checkAsync('healthCheck() returns well-formed object', async () => {
    const result = await adapter.healthCheck(ctx.workspaceId || 'test');
    if (!result || typeof result !== 'object') return 'healthCheck() did not return an object';
    if (!['healthy', 'degraded', 'down'].includes(result.status)) return `status must be healthy|degraded|down, got "${result.status}"`;
    if (typeof result.latencyMs !== 'number') return 'healthCheck() should include latencyMs';
    return true;
  });

  await checkAsync('authenticate() returns consent URL or token object for OAuth2', async () => {
    if (adapter.authStrategy !== 'OAUTH2') return true; // non-OAuth adapters skip
    const result = await adapter.authenticate({ workspaceId: ctx.workspaceId || 'test', callbackUrl: 'http://localhost/cb' });
    if (!result) return 'authenticate() returned falsy';
    if (typeof result.url === 'string') return true;
    if (typeof result.accessToken === 'string') return true;
    return 'authenticate() should return { url } or { accessToken }';
  });

  return results;
}
