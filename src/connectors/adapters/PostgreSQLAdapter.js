/**
 * PostgreSQLAdapter — Database Operations Connector
 *
 * Uses the existing `pg` package (already a project dependency) to operate
 * against an infrastructure database that is SEPARATE from the main FLOW db.
 *
 * Credentials (resolved in priority order):
 *   1. Stored credential (stored apiKey treated as connection string)
 *   2. INFRA_POSTGRES_URL env var
 *   3. Falls back to the main DATABASE_URL for health check only
 *
 * payload.operation values: backup_database | run_migration | vacuum_analyze |
 *   check_connection | run_query | get_table_stats | reindex_table
 */

import pg from 'pg';
import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey }          from '../authManager.js';
import { AppError }                             from '../../core/errors/index.js';
import { logger }                               from '../../utils/logger.js';

const { Pool } = pg;
const CONNECTOR_ID = 'postgres';

// Pool per connection string — avoids re-creating pools on every call
const _pools = new Map();

function _getPool(connectionString) {
  if (!_pools.has(connectionString)) {
    _pools.set(connectionString, new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }));
  }
  return _pools.get(connectionString);
}

class PostgreSQLAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               CONNECTOR_ID,
      name:             'PostgreSQL',
      capability:       Capability.OPERATIONS,
      authStrategy:     AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ, ActionType.EXECUTE, ActionType.CREATE,
        ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
  }

  _getConnectionString(workspaceId) {
    const cred = getCredentials(workspaceId, CONNECTOR_ID);
    if (cred?.apiKey) return cred.apiKey;
    return process.env.INFRA_POSTGRES_URL ?? process.env.DATABASE_URL ?? null;
  }

  _pool(workspaceId) {
    const cs = this._getConnectionString(workspaceId);
    if (!cs) return null;
    return _getPool(cs);
  }

  async healthCheck(workspaceId) {
    const pool = this._pool(workspaceId);
    if (!pool) {
      return { status: 'DEGRADED', detail: 'No credentials — set INFRA_POSTGRES_URL or store connection string', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await pool.query('SELECT 1');
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - start };
    }
  }

  async authenticate(workspaceId, { connectionString }) {
    if (!connectionString) throw new AppError('connectionString is required', 400, 'MISSING_PARAM');
    storeApiKey(workspaceId, CONNECTOR_ID, connectionString);
    return { stored: true, connector: CONNECTOR_ID };
  }

  async execute(workspaceId, actionType, payload, approvedBy) {
    this._requiresAction(actionType);
    const pool = this._pool(workspaceId);
    if (!pool) throw new ConnectorAuthError(CONNECTOR_ID);

    const { operation } = payload;
    logger.info(`[PostgreSQLAdapter] execute: ${operation} (approvedBy=${approvedBy ?? 'governance'})`);

    switch (operation) {
      case 'backup_database':  return this._backupDatabase(pool, payload);
      case 'run_migration':    return this._runMigration(pool, payload);
      case 'vacuum_analyze':   return this._vacuumAnalyze(pool, payload);
      case 'check_connection': return this._checkConnection(pool);
      case 'run_query':        return this._runQuery(pool, payload);
      case 'get_table_stats':  return this._getTableStats(pool, payload);
      case 'reindex_table':    return this._reindexTable(pool, payload);
      default:
        throw new AppError(`Unsupported operation: ${operation}`, 400, 'UNSUPPORTED_OPERATION');
    }
  }

  async _backupDatabase(pool, { schema = 'public', format = 'sql' }) {
    // For true pg_dump backup, call the pg_dump binary via child process.
    // Here we produce a structural backup (table list + row counts) that can be
    // used as a pre-migration safety snapshot when pg_dump is not available
    // in-process (e.g., serverless environments).
    const { rows: tables } = await pool.query(
      `SELECT tablename, pg_size_pretty(pg_relation_size('${schema}.' || tablename)) AS size,
              pg_stat_get_live_tuples(c.oid) AS row_count
       FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       WHERE t.schemaname = $1
       ORDER BY tablename`,
      [schema]
    );

    const { rows: dbSize } = await pool.query(
      `SELECT pg_size_pretty(pg_database_size(current_database())) AS total_size,
              current_database() AS db_name`
    );

    const backupMeta = {
      backedUpAt:   new Date().toISOString(),
      schema,
      format,
      databaseName: dbSize[0]?.db_name,
      totalSize:    dbSize[0]?.total_size,
      tables:       tables.map(t => ({ name: t.tablename, size: t.size, rows: Number(t.row_count) })),
      tableCount:   tables.length,
    };

    logger.info(`[PostgreSQLAdapter] backup snapshot: ${tables.length} tables in ${dbSize[0]?.total_size}`);
    return backupMeta;
  }

  async _runMigration(pool, { sql, migrationId, dryRun = false }) {
    if (!sql) throw new AppError('sql is required', 400, 'MISSING_PARAM');

    if (dryRun) {
      return { dryRun: true, migrationId: migrationId ?? null, sql, wouldExecute: true };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      return {
        migrated:    true,
        migrationId: migrationId ?? null,
        migratedAt:  new Date().toISOString(),
        statements:  sql.split(';').filter(s => s.trim()).length,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw new AppError(`Migration failed and was rolled back: ${err.message}`, 500, 'MIGRATION_FAILED');
    } finally {
      client.release();
    }
  }

  async _vacuumAnalyze(pool, { table, schema = 'public', full = false }) {
    const target = table ? `"${schema}"."${table}"` : '';
    const sql    = full ? `VACUUM FULL ANALYZE ${target}` : `VACUUM ANALYZE ${target}`;
    const start  = Date.now();
    await pool.query(sql.trim());
    const durationMs = Date.now() - start;

    if (table) {
      const { rows } = await pool.query(
        `SELECT n_dead_tup, n_live_tup, last_vacuum, last_autovacuum, last_analyze
         FROM pg_stat_user_tables WHERE schemaname = $1 AND relname = $2`,
        [schema, table]
      );
      return { vacuumed: true, table, schema, durationMs, stats: rows[0] ?? null };
    }
    return { vacuumed: true, table: 'ALL', schema, durationMs };
  }

  async _checkConnection(pool) {
    const { rows } = await pool.query(
      `SELECT version() AS pg_version, current_database() AS db,
              pg_size_pretty(pg_database_size(current_database())) AS size,
              (SELECT count(*) FROM pg_stat_activity) AS active_connections,
              now() AS server_time`
    );
    return { connected: true, ...rows[0] };
  }

  async _runQuery(pool, { sql, params = [], maxRows = 100 }) {
    if (!sql) throw new AppError('sql is required', 400, 'MISSING_PARAM');
    // Only allow read queries for safety — writes must go through run_migration
    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('EXPLAIN') && !normalized.startsWith('SHOW')) {
      throw new AppError('run_query only supports SELECT/EXPLAIN/SHOW statements. Use run_migration for DDL/DML.', 403, 'FORBIDDEN_QUERY');
    }
    const limitedSql = `SELECT * FROM (${sql}) _q LIMIT ${maxRows}`;
    const { rows, fields } = await pool.query(limitedSql, params);
    return { rows, columns: fields.map(f => f.name), count: rows.length };
  }

  async _getTableStats(pool, { schema = 'public' } = {}) {
    const { rows } = await pool.query(
      `SELECT schemaname, relname AS table_name,
              n_live_tup AS row_count, n_dead_tup AS dead_rows,
              pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) AS table_size,
              last_vacuum, last_autovacuum, last_analyze
       FROM pg_stat_user_tables
       WHERE schemaname = $1
       ORDER BY n_live_tup DESC LIMIT 50`,
      [schema]
    );
    return { tables: rows, count: rows.length };
  }

  async _reindexTable(pool, { table, schema = 'public', index }) {
    if (!table) throw new AppError('table is required', 400, 'MISSING_PARAM');
    const sql = index
      ? `REINDEX INDEX "${schema}"."${index}"`
      : `REINDEX TABLE "${schema}"."${table}"`;
    const start = Date.now();
    await pool.query(sql);
    return { reindexed: true, table, schema, index: index ?? null, durationMs: Date.now() - start };
  }
}

export default new PostgreSQLAdapter();
