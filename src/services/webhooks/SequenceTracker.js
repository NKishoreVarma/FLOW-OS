/**
 * SequenceTracker — assigns monotonically increasing sequence numbers to webhook events.
 *
 * Guarantees ordering within (workspaceId, connectorId, resourceId).
 * Uses Redis INCR for atomic, lock-free sequence generation.
 *
 * The sequence number is stored on the webhook_events row and can be used
 * by consumers to detect out-of-order delivery and re-order if needed.
 *
 * Keys: wh:seq:{workspaceId}:{connectorId}:{resourceId}
 * TTL:  7 days (sequences reset after a week of inactivity)
 */

import redisConnection from '../../config/redis.js';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Get the next sequence number for a resource stream.
 * Resets naturally after TTL_SECONDS of inactivity.
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} resourceId   — provider's resource ID (issue number, PR id, channel id, etc.)
 * @returns {Promise<number>}
 */
export async function nextSequence(workspaceId, connectorId, resourceId) {
  const key = `wh:seq:${workspaceId}:${connectorId}:${resourceId}`;
  const seq = await redisConnection.incr(key);
  // Refresh TTL on each write to keep active streams alive
  if (seq === 1) {
    await redisConnection.expire(key, TTL_SECONDS);
  } else if (seq % 100 === 0) {
    await redisConnection.expire(key, TTL_SECONDS);
  }
  return seq;
}

/**
 * Peek at the current sequence number without incrementing.
 * Returns 0 if the stream has not yet received any events.
 */
export async function currentSequence(workspaceId, connectorId, resourceId) {
  const key = `wh:seq:${workspaceId}:${connectorId}:${resourceId}`;
  const val = await redisConnection.get(key);
  return val ? parseInt(val, 10) : 0;
}

/**
 * Detect if an event is out of order.
 * Returns true if the incoming sequenceNumber is lower than the current max
 * (i.e., a late-arriving duplicate or genuinely out-of-order event).
 */
export async function isOutOfOrder(workspaceId, connectorId, resourceId, sequenceNumber) {
  const current = await currentSequence(workspaceId, connectorId, resourceId);
  return current > 0 && sequenceNumber < current;
}
