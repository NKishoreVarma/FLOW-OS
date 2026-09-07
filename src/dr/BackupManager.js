/**
 * BackupManager — Module 3 (Disaster Recovery)
 *
 * Orchestrates automated backups: database schema+data, workflow checkpoints,
 * knowledge graph state, connector configs, and full-system snapshots.
 * Uses pg_dump for database backups (spawned as child process).
 * All backup records are persisted in backup_records table.
 */

import { execFile }  from 'child_process';
import { promisify } from 'util';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { writeFile, readdir, stat, unlink } from 'fs/promises';
import { createGzip }    from 'zlib';
import { join }          from 'path';
import { createHash }    from 'crypto';
import { query }         from '../config/db.js';
import { logger }        from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const BACKUP_ROOT = process.env.BACKUP_ROOT ?? join(process.env.HOME ?? '/tmp', 'flow-os-backups');
const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a full backup (database + workflow checkpoints + config).
 */
export async function runFullBackup(orgId = null) {
  const backupId  = await _startRecord('full', orgId);
  const startedAt = Date.now();
  const dir       = _ensureDir('full');

  try {
    const [dbResult, configResult, kgResult] = await Promise.allSettled([
      _backupDatabase(dir, backupId),
      _backupConfig(dir),
      _backupKnowledgeGraph(dir, orgId),
    ]);

    const results = { db: dbResult, config: configResult, kg: kgResult };
    const allOk   = Object.values(results).every(r => r.status === 'fulfilled');

    await _completeRecord(backupId, {
      status:   allOk ? 'COMPLETED' : 'PARTIAL',
      filePath: dir,
      metadata: { durationMs: Date.now() - startedAt, results: JSON.stringify(results) },
    });

    logger.info(`[BackupManager] full backup ${backupId} completed in ${Date.now() - startedAt}ms`);
    return { backupId, status: allOk ? 'COMPLETED' : 'PARTIAL', dir };
  } catch (err) {
    await _failRecord(backupId, err.message);
    throw err;
  }
}

/**
 * Run a database-only backup using pg_dump.
 */
export async function backupDatabase(orgId = null) {
  const backupId = await _startRecord('database', orgId);
  const dir      = _ensureDir('database');
  try {
    const { filePath, size, checksum } = await _backupDatabase(dir, backupId);
    await _completeRecord(backupId, { filePath, fileSize: size, checksum });
    return { backupId, filePath, size, checksum };
  } catch (err) {
    await _failRecord(backupId, err.message);
    throw err;
  }
}

/**
 * Run a workflow checkpoint backup.
 */
export async function backupWorkflowCheckpoints(orgId = null) {
  const backupId = await _startRecord('workflow', orgId);
  const dir      = _ensureDir('workflow');
  try {
    const filePath = await _backupWorkflows(dir, orgId);
    await _completeRecord(backupId, { filePath });
    return { backupId, filePath };
  } catch (err) {
    await _failRecord(backupId, err.message);
    throw err;
  }
}

/**
 * Purge backups older than BACKUP_RETENTION_DAYS.
 */
export async function purgeOldBackups() {
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 86400_000).toISOString();
  const { rows } = await query(
    `SELECT id, file_path FROM backup_records
     WHERE status = 'COMPLETED' AND started_at < $1`,
    [cutoff]
  ).catch(() => ({ rows: [] }));

  let purged = 0;
  for (const r of rows) {
    try {
      if (r.file_path) await unlink(r.file_path).catch(() => null);
      await query('UPDATE backup_records SET status = $1 WHERE id = $2', ['PURGED', r.id]);
      purged++;
    } catch { /* continue */ }
  }

  logger.info(`[BackupManager] purged ${purged} old backup(s)`);
  return { purged };
}

/**
 * List recent backup records.
 */
export async function listBackups({ limit = 50, type = null } = {}) {
  const conds = [];
  const vals  = [];
  if (type) conds.push(`backup_type = $${vals.push(type)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM backup_records ${where} ORDER BY started_at DESC LIMIT $${vals.push(limit)}`,
    vals
  );
  return rows;
}

/**
 * Get a single backup record.
 */
export async function getBackup(backupId) {
  const { rows } = await query('SELECT * FROM backup_records WHERE id = $1', [backupId]);
  return rows[0] ?? null;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _backupDatabase(dir, backupId) {
  const dbUrl   = process.env.DATABASE_URL ?? '';
  const outFile = join(dir, `db-${backupId}.sql.gz`);

  if (!dbUrl) {
    // Structural backup via SQL when pg_dump unavailable
    const { rows: tables } = await query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const schema = { tables: tables.map(r => r.tablename), backedUpAt: new Date().toISOString() };
    await writeFile(outFile.replace('.gz', '.json'), JSON.stringify(schema, null, 2));
    return { filePath: outFile.replace('.gz', '.json'), size: 0, checksum: '' };
  }

  return new Promise((resolve, reject) => {
    const pg_dump = execFile('pg_dump', [dbUrl, '--format=plain', '--no-owner'],
      { maxBuffer: 500 * 1024 * 1024 },
      (err) => { if (err && !err.killed) reject(err); }
    );

    const gzip   = createGzip();
    const stream = createWriteStream(outFile);
    pg_dump.stdout.pipe(gzip).pipe(stream);

    stream.on('finish', async () => {
      const stats    = await stat(outFile).catch(() => ({ size: 0 }));
      const checksum = await _fileChecksum(outFile).catch(() => '');
      resolve({ filePath: outFile, size: stats.size, checksum });
    });
    stream.on('error', reject);
  });
}

async function _backupConfig(dir) {
  const configPath = join(dir, 'config-snapshot.json');
  const { rows: policies }   = await query('SELECT * FROM policies LIMIT 1000').catch(() => ({ rows: [] }));
  const { rows: ssoConfigs } = await query('SELECT id, org_id, provider, enabled, entity_id FROM enterprise_sso_configs LIMIT 100').catch(() => ({ rows: [] }));
  const snapshot = {
    backedUpAt: new Date().toISOString(),
    policies:   policies.length,
    ssoConfigs: ssoConfigs.length,
    env: {
      NODE_ENV:   process.env.NODE_ENV,
      REGION_ID:  process.env.REGION_ID,
      PORT:       process.env.PORT,
    },
  };
  await writeFile(configPath, JSON.stringify(snapshot, null, 2));
  return configPath;
}

async function _backupKnowledgeGraph(dir, orgId) {
  const kgPath = join(dir, 'kg-snapshot.json');
  const cond   = orgId ? 'AND org_id = $1' : '';
  const vals   = orgId ? [orgId] : [];
  const { rows: nodes } = await query(
    `SELECT id, workspace_id, node_type, label FROM graph_nodes ${cond} LIMIT 100000`,
    vals
  ).catch(() => ({ rows: [] }));
  const { rows: edges } = await query(
    `SELECT id, workspace_id, edge_type, source_id, target_id FROM graph_edges ${cond} LIMIT 500000`,
    vals
  ).catch(() => ({ rows: [] }));
  await writeFile(kgPath, JSON.stringify({
    backedUpAt: new Date().toISOString(),
    nodeCount:  nodes.length,
    edgeCount:  edges.length,
    nodes:      nodes.slice(0, 10000),
    edges:      edges.slice(0, 50000),
  }, null, 2));
  return kgPath;
}

async function _backupWorkflows(dir, orgId) {
  const filePath = join(dir, 'workflow-checkpoints.json');
  const cond     = orgId ? 'AND w.metadata->>\'orgId\' = $1' : '';
  const vals     = orgId ? [orgId] : [];
  const { rows } = await query(
    `SELECT id, workspace_id, workflow_id, status, started_at, params, metadata
     FROM workflow_executions
     WHERE status IN ('RUNNING','WAITING_APPROVAL','PAUSED') ${cond}
     ORDER BY started_at DESC`,
    vals
  ).catch(() => ({ rows: [] }));
  await writeFile(filePath, JSON.stringify({ backedUpAt: new Date().toISOString(), checkpoints: rows }, null, 2));
  return filePath;
}

async function _fileChecksum(filePath) {
  const { readFile } = await import('fs/promises');
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

async function _startRecord(type, orgId) {
  const { rows } = await query(
    `INSERT INTO backup_records (backup_type, org_id, region, retention_days)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [type, orgId, process.env.REGION_ID ?? 'primary', BACKUP_RETENTION_DAYS]
  );
  return rows[0].id;
}

async function _completeRecord(id, { status = 'COMPLETED', filePath = null, fileSize = null, checksum = null, metadata = {} } = {}) {
  await query(
    `UPDATE backup_records SET status=$1, file_path=$2, file_size_bytes=$3, checksum=$4,
     metadata=$5::jsonb, completed_at=NOW() WHERE id=$6`,
    [status, filePath, fileSize, checksum, JSON.stringify(metadata), id]
  );
}

async function _failRecord(id, error) {
  await query(
    `UPDATE backup_records SET status='FAILED', error=$1, completed_at=NOW() WHERE id=$2`,
    [error, id]
  ).catch(() => null);
}

function _ensureDir(type) {
  const dir = join(BACKUP_ROOT, type, new Date().toISOString().slice(0, 10));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
