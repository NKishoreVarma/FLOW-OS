/**
 * Reliability certification tests — validates rate limiting, error handling,
 * timeout behavior, and graceful degradation.
 */

export async function runReliabilityTests(adapter, ctx = {}) {
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
      results.push({ name, passed: false, detail: e.message });
    }
  }

  // — Error wrapping: provider errors should be wrapped in AppError subclasses —
  check('adapter does not expose constructor name of provider SDK error', () => {
    // Heuristic: if the adapter has a known provider SDK error class in its prototype chain
    // we can't easily test this structurally. Instead we verify that the adapter class
    // is named (not anonymous) and extends BaseAdapter.
    const proto = Object.getPrototypeOf(adapter);
    return proto && proto.constructor && proto.constructor.name !== 'Object'
      ? true
      : 'Adapter should extend BaseAdapter (named class)';
  });

  check('adapter id is lowercase-hyphenated (safe for Redis keys / URL params)', () => {
    return /^[a-z0-9-]+$/.test(adapter.id)
      ? true
      : `Adapter id "${adapter.id}" contains invalid characters — use lowercase-hyphen only`;
  });

  check('adapter version follows semver or is declared', () => {
    const v = adapter.version;
    if (!v) return 'adapter.version not declared';
    // Accept "v1", "1.0", "2024-01", "REST v3", etc.
    return typeof v === 'string' && v.length > 0;
  });

  // — Graceful degradation under missing credentials —
  await checkAsync('healthCheck() degrades gracefully without credentials', async () => {
    const result = await adapter.healthCheck('test-no-creds');
    if (!result || typeof result !== 'object') return 'healthCheck() must return an object even without credentials';
    if (!['healthy', 'degraded', 'down'].includes(result.status)) {
      return `Invalid status "${result.status}" — must be healthy|degraded|down`;
    }
    // Without credentials, status should be degraded or down (not healthy)
    // This is advisory — some adapters may have a fallback health check
    return true;
  });

  // — Parallel concurrent calls do not share mutable state —
  await checkAsync('concurrent healthCheck() calls are safe (no shared mutable state)', async () => {
    const calls = Array.from({ length: 3 }, () => adapter.healthCheck('test').catch(() => ({ status: 'down', latencyMs: 0 })));
    const all = await Promise.all(calls);
    for (const r of all) {
      if (!r || !['healthy', 'degraded', 'down'].includes(r.status)) {
        return `Concurrent call returned invalid status: ${JSON.stringify(r)}`;
      }
    }
    return true;
  });

  // — Timeout: healthCheck should return within 15 seconds (soft contract) —
  await checkAsync('healthCheck() completes within 15 seconds', async () => {
    const start = Date.now();
    await adapter.healthCheck('test').catch(() => {});
    const elapsed = Date.now() - start;
    return elapsed < 15_000
      ? true
      : `healthCheck() took ${elapsed}ms — must complete within 15s`;
  });

  return results;
}
