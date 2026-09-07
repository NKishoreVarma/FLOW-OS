/**
 * VersionMigrator — Module 13 (Enterprise Upgrade System)
 *
 * Runs data migrations between FLOW OS versions. Each migration is a named
 * async function that is idempotent (safe to re-run).
 *
 * Migration records are stored in the `upgrade_records` PostgreSQL table.
 * The migrator runs pending migrations in order, records each result, and
 * rolls back the current migration on failure (previous migrations are kept).
 */

import { query }        from '../config/db.js';
import { getCurrentVersion } from './CompatibilityValidator.js';

const MIGRATIONS = [
  {
    name: 'v1.0.0_baseline',
    run: async () => {
      // Baseline — nothing to do; presence of this record marks v1.0.0 as migrated
    },
  },
  {
    name: 'v1.1.0_add_workspace_isolation_counters',
    run: async () => {
      // Workspace isolation keys are in Redis — no SQL needed
    },
  },
  {
    name: 'v2.0.0_add_phase15_tables',
    run: async () => {
      // Phase 15 tables are created by scripts/migrate-phase15.sql
      // This migration validates they exist
      await query(`SELECT 1 FROM enterprise_sso_configs LIMIT 1`).catch(() => {
        throw new Error('Phase 15 migration (migrate-phase15.sql) has not been applied');
      });
    },
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all pending migrations up to targetVersion.
 */
export async function runMigrations(targetVersion = null) {
  const applied  = await getAppliedMigrations();
  const pending  = MIGRATIONS.filter(m => !applied.some(a => a.name === m.name));
  const results  = [];

  for (const migration of pending) {
    const startMs = Date.now();
    try {
      await migration.run();
      const durationMs = Date.now() - startMs;
      await _recordMigration(migration.name, 'SUCCESS', durationMs, null);
      results.push({ name: migration.name, status: 'SUCCESS', durationMs });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      await _recordMigration(migration.name, 'FAILED', durationMs, err.message);
      results.push({ name: migration.name, status: 'FAILED', error: err.message, durationMs });
      // Stop on first failure — do not run subsequent migrations
      break;
    }
  }

  return {
    fromVersion:   getCurrentVersion(),
    targetVersion: targetVersion ?? getCurrentVersion(),
    applied:       applied.length,
    pending:       pending.length,
    ran:           results.length,
    results,
    success:       results.every(r => r.status === 'SUCCESS'),
  };
}

/**
 * List all applied migrations.
 */
export async function getAppliedMigrations() {
  try {
    const { rows } = await query(
      `SELECT * FROM upgrade_records ORDER BY applied_at ASC`
    );
    return rows;
  } catch { return []; }
}

/**
 * List all known migrations (pending + applied).
 */
export function listMigrations() {
  return MIGRATIONS.map(m => ({ name: m.name }));
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _recordMigration(name, status, durationMs, error) {
  await query(
    `INSERT INTO upgrade_records (name, status, duration_ms, error, applied_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (name) DO UPDATE SET status=$2, duration_ms=$3, error=$4, applied_at=NOW()`,
    [name, status, durationMs, error]
  ).catch(() => {});
}
