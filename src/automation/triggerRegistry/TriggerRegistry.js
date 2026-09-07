/**
 * TriggerRegistry — in-memory cache of enabled triggers keyed by eventId.
 *
 * Cache TTL: 60 seconds (same pattern as policyStore).
 * On miss or expiry the registry re-fetches from the DB.
 * Cache is invalidated on create/update/delete via invalidate().
 */

import { getEnabledTriggersForEvent } from './TriggerStore.js';
import { logger }                     from '../../utils/logger.js';

const CACHE_TTL_MS = Number(process.env.TRIGGER_CACHE_TTL_MS ?? 60_000);

/** eventId → { triggers: TriggerDefinition[], loadedAt: number } */
const _cache = new Map();

export async function getTriggersForEvent(eventId) {
  const cached = _cache.get(eventId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.triggers;
  }

  let triggers;
  try {
    triggers = await getEnabledTriggersForEvent(eventId);
  } catch (err) {
    logger.warn(`[TriggerRegistry] DB error loading triggers for ${eventId}: ${err.message}`);
    return cached?.triggers ?? [];
  }

  _cache.set(eventId, { triggers, loadedAt: Date.now() });
  return triggers;
}

export function invalidate(eventId) {
  if (eventId) _cache.delete(eventId);
  else         _cache.clear();
}

export function cacheStats() {
  return { entries: _cache.size, ttlMs: CACHE_TTL_MS };
}
