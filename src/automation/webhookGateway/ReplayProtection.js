/**
 * ReplayProtection — Redis-based deduplication for webhook deliveries.
 *
 * Key:  automation:wh:nonce:{connector}:{deliveryId}
 * TTL:  24 hours (most providers retry within this window)
 *
 * Returns { duplicate: true } if we've seen this delivery ID before.
 * Returns { duplicate: false } on first sight (also marks it in Redis).
 */

import redis from '../../config/redis.js';

const TTL_SEC   = 86_400;  // 24 hours
const KEY_PREFIX = 'automation:wh:nonce';

export async function checkAndMark(connector, deliveryId) {
  if (!deliveryId) return { duplicate: false }; // can't dedup without ID

  const key = `${KEY_PREFIX}:${connector}:${deliveryId}`;

  // SET NX (set only if not exists) — atomic check-and-set
  const result = await redis.set(key, '1', 'EX', TTL_SEC, 'NX');
  if (result === null) return { duplicate: true };   // key already existed

  return { duplicate: false };
}

export async function isDuplicate(connector, deliveryId) {
  if (!deliveryId) return false;
  const key = `${KEY_PREFIX}:${connector}:${deliveryId}`;
  return (await redis.exists(key)) === 1;
}
