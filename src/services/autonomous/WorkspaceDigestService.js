/**
 * WorkspaceDigestService — maintains a live event feed per workspace.
 *
 * Generates human-readable digest entries from capability data changes
 * and stores them in a Redis list (ring buffer, max 50 per workspace).
 *
 * Consumed by the frontend live feed panel.
 */

import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {}); // non-fatal

const DIGEST_KEY      = wsId => `flow:workspace:${wsId}:digest`;
const DIGEST_MAX      = 50;
const DIGEST_TTL_SECS = 86_400; // 24h

/**
 * Append new digest entries derived from capability results.
 *
 * @param {string} workspaceId
 * @param {import('../../ai/reasoning/CapabilityDispatcher.js').CapabilityResults} capResults
 * @param {Object} [prev] - Previous capability results for diff detection
 */
export async function updateDigest(workspaceId, capResults, prev = {}) {
  const wsId   = String(workspaceId);
  const entries = _generateEntries(capResults, prev);
  if (!entries.length) return;

  const key = DIGEST_KEY(wsId);
  const pipe = redis.pipeline();
  for (const entry of entries) {
    pipe.lpush(key, JSON.stringify(entry));
  }
  pipe.ltrim(key, 0, DIGEST_MAX - 1);
  pipe.expire(key, DIGEST_TTL_SECS);
  await pipe.exec().catch(() => {});

  logger.rag(`[Digest] ${wsId} — ${entries.length} new event(s)`);
}

/**
 * Get the current digest (most recent N entries).
 *
 * @param {string} workspaceId
 * @param {number} [limit]
 * @returns {Promise<DigestEntry[]>}
 */
export async function getDigest(workspaceId, limit = 30) {
  const key  = DIGEST_KEY(String(workspaceId));
  const raw  = await redis.lrange(key, 0, limit - 1).catch(() => []);
  return raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

/**
 * Manually append a single digest entry (e.g. from ingestion worker).
 */
export async function appendDigestEntry(workspaceId, entry) {
  const key = DIGEST_KEY(String(workspaceId));
  await redis.lpush(key, JSON.stringify({ ...entry, ts: entry.ts || new Date().toISOString() })).catch(() => {});
  await redis.ltrim(key, 0, DIGEST_MAX - 1).catch(() => {});
  await redis.expire(key, DIGEST_TTL_SECS).catch(() => {});
}

// ── Entry generation ──────────────────────────────────────────────────────────

function _generateEntries(capResults, prev) {
  const entries = [];
  const now     = new Date().toISOString();

  for (const [cap, result] of Object.entries(capResults)) {
    if (!result?.records?.length) continue;
    const prevResult = prev[cap];

    switch (cap) {
      case 'engineering': {
        const prs = result.records.filter(r => r.type === 'PR');
        if (prs.length) {
          entries.push(_entry('engineering', `${prs.length} pull request${prs.length > 1 ? 's' : ''} in the engineering pipeline`, prs[0].name, 'medium', now));
        }
        const incidents = result.records.filter(r => r.type === 'INCIDENT');
        if (incidents.length) {
          entries.push(_entry('incident', `${incidents.length} incident${incidents.length > 1 ? 's' : ''} detected in engineering`, incidents[0].name, 'high', now));
        }
        break;
      }
      case 'meetings': {
        if (result.count > 0) {
          entries.push(_entry('meetings', `${result.count} meeting${result.count > 1 ? 's' : ''} on your calendar`, result.records[0]?.name, 'medium', now));
        }
        break;
      }
      case 'incidents': {
        const active = result.records.filter(r => !r.status || r.status === 'open');
        if (active.length) {
          entries.push(_entry('incident', `${active.length} active incident${active.length > 1 ? 's' : ''} requiring attention`, active[0]?.name, 'high', now));
        }
        break;
      }
      case 'customers': {
        if (result.count > 0) {
          entries.push(_entry('customers', `${result.count} customer account${result.count > 1 ? 's' : ''} in workspace`, result.records[0]?.name, 'low', now));
        }
        break;
      }
      case 'knowledge': {
        if (result.count > 0) {
          entries.push(_entry('knowledge', `${result.count} document${result.count > 1 ? 's' : ''} in knowledge base`, result.records[0]?.name, 'low', now));
        }
        break;
      }
      case 'recommendations': {
        if (result.count > 0) {
          entries.push(_entry('recommendation', `${result.count} proactive recommendation${result.count > 1 ? 's' : ''} ready`, result.records[0]?.name, 'medium', now));
        }
        break;
      }
      case 'health': {
        const h = result.health;
        if (h?.company_health) {
          const level = h.company_health >= 70 ? 'low' : h.company_health >= 50 ? 'medium' : 'high';
          entries.push(_entry('health', `Workspace health: ${h.company_health}/100`, `Engineering ${h.sectors?.engineering ?? '?'} · Customer ${h.sectors?.customer ?? '?'}`, level, now));
        }
        break;
      }
    }
  }

  // Limit to most important entries per analysis cycle
  return entries.slice(0, 10);
}

function _entry(type, text, detail, importance, ts) {
  return {
    id:         `digest_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type,
    text,
    detail:     detail || '',
    importance, // 'high' | 'medium' | 'low'
    ts,
  };
}
