/**
 * EventBroadcaster — DEPRECATED (Phase 11.0).
 *
 * Webhook fan-out is now handled by the single unified Event Platform. This shim
 * forwards to `publishWebhook`, which stores the event durably and routes it to
 * every subscriber through the one canonical pipeline. Kept signature-compatible
 * (returns a per-subscriber results array) for one release. New code MUST use
 * `src/events` (publishWebhook) directly.
 *
 * The per-connector webhook subscribers under ./subscribers are superseded by the
 * canonical built-in subscribers (src/events/builtinSubscribers.js) and are no
 * longer wired into any live path.
 */

import { logger } from '../../utils/logger.js';

let _warned = false;

export async function broadcast(event) {
  if (!_warned) {
    _warned = true;
    logger.rag('[EventBroadcaster] DEPRECATED — forward to src/events (publishWebhook)');
  }
  const { publishWebhook } = await import('../../events/index.js');
  const result = await publishWebhook(event);
  return (result.delivery || []).map((d) => ({
    subscriber: d.subscriber,
    status:     d.status === 'delivered' ? 'fulfilled' : 'rejected',
    error:      d.error,
  }));
}
