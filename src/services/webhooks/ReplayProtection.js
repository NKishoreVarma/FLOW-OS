/**
 * ReplayProtection — prevents the same webhook delivery from being processed twice.
 *
 * Two-layer guard:
 *   1. Redis SET NX with 24h TTL — fast, O(1), catches all duplicates within the window
 *   2. PostgreSQL UNIQUE constraint on (workspace_id, connector_id, delivery_id)
 *      — covers cases where Redis is flushed (cold start, flush)
 *
 * Delivery IDs per connector:
 *   GitHub   — X-GitHub-Delivery header (UUID)
 *   Slack    — event_id field in payload body
 *   Jira     — X-Atlassian-Event-Id header or generated from issue key + timestamp
 *   Google   — X-Goog-Message-Number header (incremental integer)
 *   Notion   — X-Notion-Webhook-Id or generated
 */

import redisConnection from '../../config/redis.js';

const TTL_SECONDS = 86_400; // 24 hours

/**
 * Attempt to claim a delivery ID.
 * Returns true if this is the first time this delivery ID is seen (process it).
 * Returns false if it's a duplicate (skip processing).
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} deliveryId
 * @returns {Promise<boolean>}  true = first-seen (safe to process)
 */
export async function claimDelivery(workspaceId, connectorId, deliveryId) {
  const key    = `wh:delivery:${workspaceId}:${connectorId}:${deliveryId}`;
  const result = await redisConnection.set(key, '1', 'EX', TTL_SECONDS, 'NX');
  return result === 'OK';
}

/**
 * Check if a delivery ID has already been seen, without claiming it.
 * Used for pre-flight checks before writing to DB.
 */
export async function isDuplicate(workspaceId, connectorId, deliveryId) {
  const key    = `wh:delivery:${workspaceId}:${connectorId}:${deliveryId}`;
  const exists = await redisConnection.exists(key);
  return exists === 1;
}

/**
 * Explicitly release a delivery claim (e.g., on processing failure, to allow retry).
 */
export async function releaseDelivery(workspaceId, connectorId, deliveryId) {
  const key = `wh:delivery:${workspaceId}:${connectorId}:${deliveryId}`;
  await redisConnection.del(key);
}

/**
 * Extract the delivery ID from provider-specific headers/body.
 * Returns a stable fallback if no native ID exists.
 */
export function extractDeliveryId(connectorId, headers, body) {
  switch (connectorId) {
    case 'github':
      return headers['x-github-delivery'] || null;
    case 'slack':
      // x-slack-retry-num means Slack is replaying — skip dedup claim so retries are re-processed
      return headers['x-slack-retry-num'] ? null : (body?.event_id || null);
    case 'jira':
      return headers['x-atlassian-event-id'] || headers['x-atlassian-delivery'] || null;
    case 'google':
    case 'gmail':
    case 'google-calendar': {
      const msgNum  = headers['x-goog-message-number'];
      const chanId  = headers['x-goog-channel-id'];
      return msgNum && chanId ? `${chanId}:${msgNum}` : null;
    }
    case 'notion':
      return headers['x-notion-webhook-id'] || null;
    default:
      return null;
  }
}
