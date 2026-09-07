/**
 * Certification result store — in-memory Map with optional Redis write-through.
 * Results are keyed by connectorId.
 */

import redis from '../../config/redis.js';

const REDIS_KEY_PREFIX = 'cert:result:';
const REDIS_TTL = 86_400; // 24h

const store = new Map();

export async function saveResult(connectorId, report) {
  store.set(connectorId, report);
  try {
    await redis.set(REDIS_KEY_PREFIX + connectorId, JSON.stringify(report), 'EX', REDIS_TTL);
  } catch {
    // Redis unavailable — in-memory only
  }
}

export async function getResult(connectorId) {
  if (store.has(connectorId)) return store.get(connectorId);
  try {
    const raw = await redis.get(REDIS_KEY_PREFIX + connectorId);
    if (raw) {
      const parsed = JSON.parse(raw);
      store.set(connectorId, parsed);
      return parsed;
    }
  } catch {
    // Redis unavailable
  }
  return null;
}

export async function getAllResults() {
  // Merge in-memory + Redis (in-memory wins for freshness)
  const results = {};
  for (const [id, report] of store.entries()) {
    results[id] = report;
  }
  try {
    const keys = await redis.keys(REDIS_KEY_PREFIX + '*');
    for (const key of keys) {
      const id = key.slice(REDIS_KEY_PREFIX.length);
      if (!results[id]) {
        const raw = await redis.get(key);
        if (raw) results[id] = JSON.parse(raw);
      }
    }
  } catch {
    // Redis unavailable
  }
  return Object.values(results);
}

export async function clearResult(connectorId) {
  store.delete(connectorId);
  try {
    await redis.del(REDIS_KEY_PREFIX + connectorId);
  } catch {}
}
