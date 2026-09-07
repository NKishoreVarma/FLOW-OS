/**
 * RestoreWizard — Module 3 (DR)
 *
 * Guided restore operations: database restore, workflow replay,
 * knowledge graph restore, and point-in-time recovery.
 */

import { execFile }  from 'child_process';
import { promisify } from 'util';
import { readFile }  from 'fs/promises';
import { query }     from '../config/db.js';
import { logger }    from '../utils/logger.js';
import { getBackup } from './BackupManager.js';

const execFileAsync = promisify(execFile);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Restore a database from a backup record.
 * Safety: checks backup integrity before proceeding.
 */
export async function restoreDatabase(backupId, { dryRun = true } = {}) {
  const backup = await getBackup(backupId);
  if (!backup) throw new Error(`Backup ${backupId} not found`);
  if (backup.status !== 'COMPLETED') throw new Error(`Backup ${backupId} is not in COMPLETED state`);
  if (!backup.file_path) throw new Error(`Backup ${backupId} has no file_path`);

  const validation = await validateBackupIntegrity(backupId);
  if (!validation.valid) throw new Error(`Backup ${backupId} integrity check failed: ${validation.reason}`);

  if (dryRun) {
    return { dryRun: true, backupId, filePath: backup.file_path, validation };
  }

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl) throw new Error('DATABASE_URL not set — cannot restore');

  logger.warn(`[RestoreWizard] starting database restore from ${backup.file_path}`);

  await execFileAsync('psql', [dbUrl, '--file', backup.file_path]).catch(err => {
    throw new Error(`psql restore failed: ${err.message}`);
  });

  logger.info(`[RestoreWizard] database restore complete from backup ${backupId}`);
  return { success: true, backupId, restoredAt: new Date().toISOString() };
}

/**
 * Replay workflow checkpoints from a backup.
 */
export async function restoreWorkflowCheckpoints(backupId, { dryRun = true } = {}) {
  const backup = await getBackup(backupId);
  if (!backup || backup.backup_type !== 'workflow') throw new Error('Invalid workflow backup');

  const raw    = await readFile(backup.file_path, 'utf8');
  const data   = JSON.parse(raw);
  const checkpoints = data.checkpoints ?? [];

  if (dryRun) {
    return { dryRun: true, checkpointCount: checkpoints.length, backupId };
  }

  let restored = 0;
  for (const cp of checkpoints) {
    await query(
      `INSERT INTO workflow_executions (id, workspace_id, workflow_id, status, started_at, params, metadata)
       VALUES ($1,$2,$3,'PAUSED',$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [cp.id, cp.workspace_id, cp.workflow_id, cp.started_at,
       JSON.stringify(cp.params ?? {}), JSON.stringify({ ...cp.metadata, restoredFrom: backupId })]
    ).catch(() => null);
    restored++;
  }

  return { success: true, restored, backupId };
}

/**
 * Restore knowledge graph nodes and edges from a KG backup.
 */
export async function restoreKnowledgeGraph(backupId, { dryRun = true } = {}) {
  const backup = await getBackup(backupId);
  if (!backup) throw new Error(`Backup ${backupId} not found`);

  const raw  = await readFile(backup.file_path, 'utf8');
  const data = JSON.parse(raw);

  if (dryRun) {
    return { dryRun: true, nodeCount: data.nodeCount, edgeCount: data.edgeCount, backupId };
  }

  let restoredNodes = 0;
  let restoredEdges = 0;

  for (const node of (data.nodes ?? [])) {
    await query(
      `INSERT INTO graph_nodes (id, workspace_id, node_type, label)
       VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [node.id, node.workspace_id, node.node_type, node.label]
    ).catch(() => null);
    restoredNodes++;
  }

  for (const edge of (data.edges ?? [])) {
    await query(
      `INSERT INTO graph_edges (id, workspace_id, edge_type, source_id, target_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [edge.id, edge.workspace_id, edge.edge_type, edge.source_id, edge.target_id]
    ).catch(() => null);
    restoredEdges++;
  }

  return { success: true, restoredNodes, restoredEdges, backupId };
}

/**
 * Point-in-time recovery validation — find the best backup before a given timestamp.
 */
export async function findBackupForPointInTime(targetTime, backupType = 'full') {
  const { rows } = await query(
    `SELECT * FROM backup_records
     WHERE status = 'COMPLETED'
       AND backup_type = $1
       AND started_at <= $2
     ORDER BY started_at DESC LIMIT 1`,
    [backupType, new Date(targetTime).toISOString()]
  );
  return rows[0] ?? null;
}

/**
 * Validate backup integrity by checking file existence and checksum.
 */
export async function validateBackupIntegrity(backupId) {
  const backup = await getBackup(backupId);
  if (!backup) return { valid: false, reason: 'backup record not found' };
  if (!backup.file_path) return { valid: false, reason: 'no file_path recorded' };

  try {
    const buf      = await readFile(backup.file_path);
    if (backup.checksum) {
      const { createHash } = await import('crypto');
      const actual = createHash('sha256').update(buf).digest('hex');
      if (actual !== backup.checksum) {
        return { valid: false, reason: `checksum mismatch: expected ${backup.checksum}, got ${actual}` };
      }
    }
    return { valid: true, backupId, filePath: backup.file_path, fileSize: buf.length };
  } catch (err) {
    return { valid: false, reason: `file read error: ${err.message}` };
  }
}

/**
 * Recovery validation — verify system is operational after restore.
 */
export async function validateRecovery() {
  const checks = [];

  // DB connectivity
  const dbOk = await query('SELECT COUNT(*) FROM pg_tables WHERE schemaname = $1', ['public'])
    .then(r => Number(r.rows[0]?.count ?? 0) > 0)
    .catch(() => false);
  checks.push({ name: 'database', passed: dbOk });

  // Workflow table
  const wfOk = await query('SELECT COUNT(*) FROM workflow_executions LIMIT 1')
    .then(() => true).catch(() => false);
  checks.push({ name: 'workflow_table', passed: wfOk });

  // Graph table
  const kgOk = await query('SELECT COUNT(*) FROM graph_nodes LIMIT 1')
    .then(() => true).catch(() => false);
  checks.push({ name: 'knowledge_graph', passed: kgOk });

  const allPassed = checks.every(c => c.passed);
  return { valid: allPassed, checks, validatedAt: new Date().toISOString() };
}
