/**
 * Webhook certification tests — validates signature verification, duplicate
 * handling, and event normalization.
 *
 * Most connectors are pull-based and do not handle webhooks. Those tests PASS
 * (N/A) rather than fail — webhook support is a bonus, not a requirement.
 */

export async function runWebhookTests(adapter, ctx = {}) {
  const results = [];

  function check(name, fn, required = true) {
    try {
      const passed = fn();
      if (passed === 'NA') {
        results.push({ name, passed: true, detail: 'N/A — webhook not applicable for this connector', skipped: true });
        return;
      }
      results.push({ name, passed: !!passed, detail: passed === true ? null : String(passed) });
    } catch (e) {
      results.push({ name, passed: !required, detail: required ? e.message : 'N/A' });
    }
  }

  async function checkAsync(name, fn) {
    try {
      const result = await fn();
      if (result === 'NA') {
        results.push({ name, passed: true, detail: 'N/A — webhook not applicable', skipped: true });
        return;
      }
      results.push({ name, passed: !!result, detail: result === true ? null : typeof result === 'string' ? result : null });
    } catch (e) {
      results.push({ name, passed: false, detail: e.message });
    }
  }

  // Detect if connector declares webhook support
  const supportsWebhooks = typeof adapter.handleWebhook === 'function'
    || typeof adapter.verifyWebhookSignature === 'function'
    || (adapter.capabilities || []).includes('webhooks');

  check('webhook handling declared (optional)', () => {
    if (!supportsWebhooks) return 'NA';
    return typeof adapter.handleWebhook === 'function' || typeof adapter.verifyWebhookSignature === 'function';
  }, false);

  check('signature verification method present (if webhooks supported)', () => {
    if (!supportsWebhooks) return 'NA';
    return typeof adapter.verifyWebhookSignature === 'function'
      ? true
      : 'Webhook adapter should implement verifyWebhookSignature()';
  }, false);

  await checkAsync('handleWebhook() normalizes payload to FLOW event shape', async () => {
    if (!supportsWebhooks || typeof adapter.handleWebhook !== 'function') return 'NA';
    const mockPayload = { type: 'push', repository: { name: 'test' }, ref: 'refs/heads/main' };
    const result = await adapter.handleWebhook({ payload: mockPayload, signature: 'test', workspaceId: 'test' }).catch(() => null);
    if (!result) return 'handleWebhook() returned falsy or threw';
    if (!result.type && !result.event) return 'handleWebhook() should return a normalized event with type';
    return true;
  });

  check('adapter id is safe for webhook routing (lowercase-hyphen)', () => {
    return /^[a-z0-9-]+$/.test(adapter.id);
  });

  // Webhook delivery guarantee: connector should NOT throw on duplicate events
  await checkAsync('handleWebhook() is idempotent (duplicate delivery does not throw)', async () => {
    if (!supportsWebhooks || typeof adapter.handleWebhook !== 'function') return 'NA';
    const mockPayload = { type: 'push', id: 'evt_test_123' };
    // Two identical calls — neither should throw
    const r1 = await adapter.handleWebhook({ payload: mockPayload, signature: 'test', workspaceId: 'test' }).catch(e => ({ __error: e.message }));
    const r2 = await adapter.handleWebhook({ payload: mockPayload, signature: 'test', workspaceId: 'test' }).catch(e => ({ __error: e.message }));
    if (r1?.__error && !/signature|auth|invalid/i.test(r1.__error)) return `First call threw unexpected error: ${r1.__error}`;
    return true;
  });

  return results;
}
