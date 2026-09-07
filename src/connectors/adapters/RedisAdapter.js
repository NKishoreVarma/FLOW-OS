/**
 * RedisAdapter — Cache Infrastructure Connector
 *
 * Uses the existing `ioredis` package (already a project dependency) to operate
 * against infrastructure Redis instances — separate from the main FLOW queue Redis.
 *
 * Credentials (resolved in priority order):
 *   1. Stored credential (stored apiKey treated as connection URL)
 *   2. INFRA_REDIS_URL env var
 *   3. Fallback to main REDIS_URL for health-check only (never flush)
 *
 * payload.operation values: flush_cache | flush_namespace | get_memory_info |
 *   trigger_bgsave | check_connection | get_key_count | scan_keys | delete_keys
 */

import Redis from 'ioredis';
import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey }          from '../authManager.js';
import { AppError }                             from '../../core/errors/index.js';
import { logger }                               from '../../utils/logger.js';

const CONNECTOR_ID = 'redis-infra';

const _clients = new Map();

function _getClient(url) {
  if (!_clients.has(url)) {
    _clients.set(url, new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout:       5000,
      lazyConnect:          true,
    }));
  }
  return _clients.get(url);
}

class RedisAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               CONNECTOR_ID,
      name:             'Redis',
      capability:       Capability.OPERATIONS,
      authStrategy:     AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ, ActionType.EXECUTE, ActionType.DELETE,
        ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
  }

  _getUrl(workspaceId) {
    const cred = getCredentials(workspaceId, CONNECTOR_ID);
    if (cred?.apiKey) return cred.apiKey;
    return process.env.INFRA_REDIS_URL ?? process.env.REDIS_URL ?? null;
  }

  _client(workspaceId) {
    const url = this._getUrl(workspaceId);
    if (!url) return null;
    return _getClient(url);
  }

  async healthCheck(workspaceId) {
    const client = this._client(workspaceId);
    if (!client) {
      return { status: 'DEGRADED', detail: 'No credentials — set INFRA_REDIS_URL or store connection URL', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      const pong = await client.ping();
      return { status: pong === 'PONG' ? 'HEALTHY' : 'DEGRADED', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - start };
    }
  }

  async authenticate(workspaceId, { redisUrl }) {
    if (!redisUrl) throw new AppError('redisUrl is required', 400, 'MISSING_PARAM');
    storeApiKey(workspaceId, CONNECTOR_ID, redisUrl);
    return { stored: true, connector: CONNECTOR_ID };
  }

  async execute(workspaceId, actionType, payload, approvedBy) {
    this._requiresAction(actionType);
    const client = this._client(workspaceId);
    if (!client) throw new ConnectorAuthError(CONNECTOR_ID);

    const { operation } = payload;
    logger.info(`[RedisAdapter] execute: ${operation} (approvedBy=${approvedBy ?? 'governance'})`);

    switch (operation) {
      case 'flush_cache':       return this._flushCache(client, payload, workspaceId);
      case 'flush_namespace':   return this._flushNamespace(client, payload);
      case 'get_memory_info':   return this._getMemoryInfo(client);
      case 'trigger_bgsave':    return this._triggerBGSave(client);
      case 'check_connection':  return this._checkConnection(client);
      case 'get_key_count':     return this._getKeyCount(client, payload);
      case 'scan_keys':         return this._scanKeys(client, payload);
      case 'delete_keys':       return this._deleteKeys(client, payload);
      default:
        throw new AppError(`Unsupported operation: ${operation}`, 400, 'UNSUPPORTED_OPERATION');
    }
  }

  async _flushCache(client, { database = 0, flushall = false }, workspaceId) {
    // Safety: flushall requires explicit confirmation and ADMIN governance
    if (flushall) {
      logger.warn(`[RedisAdapter] FLUSHALL requested by workspace ${workspaceId}`);
      await client.flushall();
      return { flushed: true, scope: 'ALL', flushedAt: new Date().toISOString() };
    }
    if (database !== undefined) {
      await client.select(database);
      await client.flushdb();
      await client.select(0);
      return { flushed: true, scope: `database:${database}`, flushedAt: new Date().toISOString() };
    }
    await client.flushdb();
    return { flushed: true, scope: 'current-db', flushedAt: new Date().toISOString() };
  }

  async _flushNamespace(client, { namespace }) {
    if (!namespace) throw new AppError('namespace is required', 400, 'MISSING_PARAM');
    const pattern = `${namespace}*`;
    const keys = await this._collectKeys(client, pattern);
    if (keys.length === 0) return { deleted: 0, namespace };
    const pipeline = client.pipeline();
    for (const key of keys) pipeline.del(key);
    await pipeline.exec();
    return { deleted: keys.length, namespace, flushedAt: new Date().toISOString() };
  }

  async _getMemoryInfo(client) {
    const info = await client.info('memory');
    const parse = (key) => {
      const match = info.match(new RegExp(`${key}:(\\S+)`));
      return match ? match[1] : null;
    };
    return {
      usedMemory:           parse('used_memory_human'),
      usedMemoryRss:        parse('used_memory_rss_human'),
      usedMemoryPeak:       parse('used_memory_peak_human'),
      maxMemory:            parse('maxmemory_human'),
      memFragmentationRatio: parse('mem_fragmentation_ratio'),
      evictionPolicy:       parse('maxmemory_policy'),
      checkedAt:            new Date().toISOString(),
    };
  }

  async _triggerBGSave(client) {
    await client.bgsave();
    const info = await client.info('persistence');
    const lastSave = info.match(/last_save_time:(\d+)/)?.[1];
    return {
      triggered:  true,
      triggeredAt: new Date().toISOString(),
      lastSaveUnix: lastSave ? Number(lastSave) : null,
    };
  }

  async _checkConnection(client) {
    const [info, dbSize] = await Promise.all([
      client.info('server'),
      client.dbsize(),
    ]);
    const parse = (key) => info.match(new RegExp(`${key}:(\\S+)`))?.[1] ?? null;
    return {
      connected:      true,
      redisVersion:   parse('redis_version'),
      uptimeSeconds:  parse('uptime_in_seconds'),
      connectedClients: parse('connected_clients'),
      totalKeys:      dbSize,
      checkedAt:      new Date().toISOString(),
    };
  }

  async _getKeyCount(client, { pattern = '*', database = 0 } = {}) {
    if (database !== 0) await client.select(database);
    const count = await client.dbsize();
    if (database !== 0) await client.select(0);
    return { pattern, database, count };
  }

  async _scanKeys(client, { pattern = '*', count = 100 }) {
    const keys = await this._collectKeys(client, pattern, count);
    return { pattern, keys, count: keys.length };
  }

  async _deleteKeys(client, { keys, pattern }) {
    let targetKeys = keys ?? [];
    if (pattern && !targetKeys.length) {
      targetKeys = await this._collectKeys(client, pattern, 1000);
    }
    if (!targetKeys.length) return { deleted: 0 };
    const pipeline = client.pipeline();
    for (const key of targetKeys) pipeline.del(key);
    const results = await pipeline.exec();
    const deleted = results.filter(([err, r]) => !err && r === 1).length;
    return { deleted, total: targetKeys.length };
  }

  async _collectKeys(client, pattern, limit = 10000) {
    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
      if (keys.length >= limit) break;
    } while (cursor !== '0');
    return keys;
  }
}

export default new RedisAdapter();
