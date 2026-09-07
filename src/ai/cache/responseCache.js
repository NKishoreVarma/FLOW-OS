/**
 * Response Cache — Redis-backed semantic cache for deterministic AI operations.
 *
 * Only caches DETERMINISTIC tasks (classify, extract_entities, summarize when
 * temperature=0). Never caches reasoning, planning, or chat.
 *
 * Cache key = SHA-256 of (taskType + sorted-prompt-content + provider + model).
 * Workspace-aware: key is prefixed with workspaceId.
 */
import { createHash } from 'crypto';
import redis from '../../config/redis.js';

const CACHEABLE_TASKS = new Set([
  'classify', 'extract_entities', 'summarize', 'brief', 'embed',
]);

const DEFAULT_TTL_SEC = Number(process.env.AI_CACHE_TTL_SEC ?? 3600);

// ── Public API ─────────────────────────────────────────────────────────────────

export function isCacheable(taskType, temperature) {
  return CACHEABLE_TASKS.has(taskType) && (temperature ?? 0.3) <= 0.1;
}

export async function get(workspaceId, taskType, content, { provider, model } = {}) {
  if (!redis) return null;
  try {
    const key = _key(workspaceId, taskType, content, provider, model);
    const raw = await redis.get(key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return { ...cached, cached: true };
  } catch {
    return null;
  }
}

export async function set(workspaceId, taskType, content, response, { provider, model, ttl } = {}) {
  if (!redis) return;
  try {
    const key = _key(workspaceId, taskType, content, provider, model);
    await redis.setex(key, ttl ?? DEFAULT_TTL_SEC, JSON.stringify(response));
  } catch {}
}

export async function invalidate(workspaceId, taskType) {
  if (!redis) return;
  try {
    // Scan and delete matching keys (not for production hotpath — management use only)
    const pattern = `ai:cache:${workspaceId}:${taskType ?? '*'}:*`;
    const keys    = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

export async function stats(workspaceId) {
  if (!redis) return { hits: 0, keys: 0 };
  try {
    const keys = await redis.keys(`ai:cache:${workspaceId}:*`);
    return { keys: keys.length };
  } catch {
    return { keys: 0 };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _key(workspaceId, taskType, content, provider, model) {
  const hash = createHash('sha256')
    .update(`${taskType}:${provider ?? ''}:${model ?? ''}:${_normalizeContent(content)}`)
    .digest('hex')
    .slice(0, 32);
  return `ai:cache:${workspaceId ?? 'global'}:${taskType}:${hash}`;
}

function _normalizeContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content))      return content.map(m => `${m.role}:${m.content}`).join('|');
  return JSON.stringify(content);
}
